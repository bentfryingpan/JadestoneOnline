<script>
    import { untrack } from 'svelte';
    import { fly }     from 'svelte/transition';
    import SubclassScreen from '$lib/SubclassScreen.svelte';
    import CharacterScreen from '$lib/CharacterScreen.svelte';

    let { data } = $props();

    // ── Lookups ────────────────────────────────────────────────────────────────
    const classNames = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' };
    const raceNames  = { 0: 'Human', 1: 'Awoken', 2: 'Exo' };

    // ── State ──────────────────────────────────────────────────────────────────
    let tab          = $state('overview');
    let activeChar   = $state(untrack(() => data.characterIds[0] ?? null));
    let seasonFilter = $state('all');
    let claiming     = $state(false);
    let claimed      = $state(false);
    $effect(() => { claimed = data.isClaimed; });

    // Mouse parallax
    let mouseX = $state(0);
    let mouseY = $state(0);
    function onHeroMouseMove(e) {
        mouseX = (e.clientX / window.innerWidth  - 0.5) * 20;
        mouseY = (e.clientY / window.innerHeight - 0.5) * 20;
    }
    function onHeroMouseLeave() { mouseX = 0; mouseY = 0; }

    // ── Lazy loadout ───────────────────────────────────────────────────────────
    let loadout        = $state(null);
    let loadoutLoading = $state(false);
    let loadoutCharId  = $state(null);

    async function fetchLoadout() {
        if (loadoutLoading || loadoutCharId === activeChar) return;
        loadoutLoading = true;
        try {
            const res = await fetch(
                `/api/loadout?membershipType=${data.membershipType}&membershipId=${data.membershipId}&charId=${activeChar}`
            );
            loadout       = await res.json();
            loadoutCharId = activeChar;
        } catch (e) { console.error('Loadout fetch failed', e); }
        finally { loadoutLoading = false; }
    }

    // ── Seasonal stats (server-streamed) ──────────────────────────────────────
    let seasonal        = $state(null);
    let seasonalLoading = $state(true);

    $effect(() => {
        const s = data.seasonal;
        if (s == null) { seasonalLoading = false; return; }
        if (typeof s.then === 'function') {
            seasonalLoading = true;
            s.then(result => { seasonal = result; seasonalLoading = false; })
             .catch(()     => {                   seasonalLoading = false; });
        } else {
            seasonal        = s;
            seasonalLoading = false;
        }
    });

    // ── Match history ──────────────────────────────────────────────────────────
    const HISTORY_COUNT_OPTIONS = [100, 250, 500, 1000, 2500, 5000, 10000];
    let historyCount   = $state(100);
    let history        = $state(null);
    let historyLoading = $state(false);
    let historyFor     = $state(0);

    async function fetchHistory() {
        if (historyLoading) return;
        if (history && historyFor === historyCount) return;
        historyLoading = true;
        const count = historyCount;
        try {
            const charIds = data.characterIds.join(',');
            const res = await fetch(
                `/api/history?membershipType=${data.membershipType}&membershipId=${data.membershipId}&charIds=${charIds}&count=${count}`
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            history    = await res.json();
            historyFor = count;
        } catch (e) { console.error('History fetch failed', e); }
        finally { historyLoading = false; }
    }

    // ── Lazy career analytics ──────────────────────────────────────────────────
    let career        = $state(null);
    let careerLoading = $state(false);
    let careerError   = $state(null);

    async function fetchCareer() {
        if (careerLoading || career) return;
        careerLoading = true;
        careerError   = null;
        try {
            const charIds = data.characterIds.join(',');
            const res = await fetch(
                `/api/career?membershipType=${data.membershipType}&membershipId=${data.membershipId}&charIds=${charIds}&count=250`
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            career = await res.json();
        } catch (e) {
            console.error('Career fetch failed', e);
            careerError = 'Could not load career analytics. Please try again.';
        }
        finally { careerLoading = false; }
    }

    // ── Favorites ──────────────────────────────────────────────────────────────
    let favorites    = $state(new Set());
    let favsLoaded   = $state(false);

    async function loadFavorites() {
        if (favsLoaded) return;
        try {
            const res = await fetch(`/api/favorites?membershipId=${data.membershipId}`);
            const d   = await res.json();
            favorites  = new Set(d.favorites ?? []);
            favsLoaded = true;
        } catch { /* no-op */ }
    }

    async function toggleFavorite(instanceId) {
        if (!instanceId) return;
        const wasFav = favorites.has(instanceId);
        // Optimistic update
        const next = new Set(favorites);
        if (wasFav) next.delete(instanceId); else next.add(instanceId);
        favorites = next;
        try {
            await fetch('/api/favorites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ membershipId: data.membershipId, pgcrId: instanceId }),
            });
        } catch {
            // Revert on error
            const reverted = new Set(favorites);
            if (wasFav) reverted.add(instanceId); else reverted.delete(instanceId);
            favorites = reverted;
        }
    }

    // ── Stack filter ───────────────────────────────────────────────────────────
    let stackFilter = $state(0); // 0=All, 1-4=fireteam size, 'favs'=favorites

    const filteredMatches = $derived((() => {
        if (!history?.matches) return [];
        let ms = history.matches.filter(m => !m.dnf);
        if (stackFilter === 'favs') return ms.filter(m => favorites.has(m.instanceId));
        if (stackFilter > 0) return ms.filter(m => (m.fireteam_size ?? 1) === stackFilter);
        return ms;
    })());

    // ── Win/loss streak ────────────────────────────────────────────────────────
    const streak = $derived((() => {
        const ms = history?.matches?.filter(m => m.win || m.loss) ?? [];
        if (!ms.length) return null;
        const first = ms[0].win ? 'win' : 'loss';
        let count = 0;
        for (const m of ms) {
            if ((first === 'win' && m.win) || (first === 'loss' && m.loss)) count++;
            else break;
        }
        return { type: first, count };
    })());

    // ── Session summary (last 10 completed matches) ────────────────────────────
    const sessionSummary = $derived((() => {
        const ms = history?.matches?.filter(m => m.win || m.loss).slice(0, 10) ?? [];
        if (!ms.length) return null;
        const wins     = ms.filter(m => m.win).length;
        const avgEgo   = ms.reduce((s, m) => s + (m.ego?.finalScore ?? 0), 0) / ms.length;
        const totMotes = ms.reduce((s, m) => s + (m.motesDeposited ?? 0), 0);
        const wipes    = ms.filter(m => m.loss).length;
        const carries  = ms.filter(m => m.is_hard_carry).length;
        return { games: ms.length, wins, avgEgo: +avgEgo.toFixed(1), totMotes, wipes, carries };
    })());

    // ── PGCR enrichment ────────────────────────────────────────────────────────
    let enriching      = $state(false);
    let enrichProgress = $state({ stored: 0, total: 0 });

    async function triggerEnrichment() {
        if (enriching || !history?.matches) return;
        const unenriched = history.matches
            .filter(m => m.instanceId && m.fireteam_size == null)
            .map(m => m.instanceId)
            .slice(0, 200);
        if (!unenriched.length) return;

        enriching = true;
        enrichProgress = { stored: 0, total: unenriched.length };

        for (let i = 0; i < unenriched.length; i += 20) {
            const batch = unenriched.slice(i, i + 20);
            try {
                const res = await fetch('/api/pgcr-enrich', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        membershipId: data.membershipId,
                        membershipType: data.membershipType,
                        bungieDisplayName: data.player.bungieGlobalDisplayName,
                        bungieDisplayCode: data.player.bungieGlobalDisplayNameCode,
                        instanceIds: batch,
                    }),
                });
                const r = await res.json();
                enrichProgress = { stored: enrichProgress.stored + (r.stored ?? 0), total: unenriched.length };
            } catch { /* continue */ }
        }

        enriching = false;
        // Refresh history to pick up enriched data
        historyFor = 0;
        fetchHistory();
    }

    // ── CSV export ─────────────────────────────────────────────────────────────
    function downloadCsv() {
        const charIds = data.characterIds.join(',');
        const url = `/api/export?membershipId=${data.membershipId}&membershipType=${data.membershipType}&charIds=${charIds}&count=${historyCount}`;
        window.open(url, '_blank');
    }

    $effect(() => {
        if ((tab === 'loadout' || tab === 'subclass') && activeChar && activeChar !== loadoutCharId) {
            fetchLoadout();
        }
    });
    $effect(() => {
        if (tab === 'matches') {
            const _c = historyCount; // track count changes
            fetchHistory();
            loadFavorites();
        }
    });
    $effect(() => {
        if (tab === 'matches' && history && !enriching) {
            triggerEnrichment();
        }
    });
    $effect(() => {
        if ((tab === 'overview' || tab === 'weaponry' || tab === 'maps' || tab === 'synergy' || tab === 'trophies') && !career && !careerLoading) {
            fetchCareer();
        }
    });

    // ── Derived: character + loadout ───────────────────────────────────────────
    const char = $derived(data.characters[activeChar] ?? {});
    const eq   = $derived(loadout?.equipment ?? {});

    // Gambit rank
    const rankTiers = ['Guardian','Brave','Heroic','Fabled','Mythic','Legend'];
    const gambitRank = $derived((() => {
        const lvl = data.gambitProgression?.level ?? 0;
        if (lvl < 4)  return rankTiers[0];
        if (lvl < 8)  return rankTiers[1];
        if (lvl < 13) return rankTiers[2];
        if (lvl < 18) return rankTiers[3];
        if (lvl < 24) return rankTiers[4];
        return rankTiers[5];
    })());
    const gambitPct = $derived((() => {
        const prog = data.gambitProgression?.progressToNextLevel ?? 0;
        const next = data.gambitProgression?.nextLevelAt ?? 1;
        return Math.round((prog / next) * 100);
    })());

    // ── Lifetime stats ─────────────────────────────────────────────────────────
    const ls = $derived(data.lifetimeStats ?? {});
    function sv(key)  { return ls[key]?.basic?.value        ?? 0; }
    function sdv(key) { return ls[key]?.basic?.displayValue ?? '—'; }

    function hasKey(key) {
        if (displaySeason !== null) return true;
        if (seasonalTotal !== null) return true;
        return ls[key]?.basic?.value != null;
    }

    const ltEntered      = $derived(sv('activitiesEntered'));
    const ltWon          = $derived(sv('activitiesWon'));
    const ltKills        = $derived(sv('kills'));
    const ltDeaths       = $derived(sv('deaths'));
    const ltAssists      = $derived(sv('assists'));
    const ltInvasions    = $derived(sv('invasions'));
    const ltInvKills     = $derived(sv('invasionKills'));
    const ltInvDef       = $derived(sv('invasionsDefeated'));
    const ltMotes        = $derived(sv('motesBanked') || sv('motesDeposited'));
    const ltMotesLost    = $derived(sv('motesLost'));
    const ltMotesDenied  = $derived(sv('motesDenied'));
    const ltMotesPickedUp = $derived(sv('motesPickedUp'));
    const ltPrimevalDmg  = $derived(sv('primevalDamage'));
    const ltSuperKills   = $derived(sv('superKills'));

    const seasonalTotal = $derived(
        seasonal?.seasons?.length
            ? seasonal.seasons.reduce((acc, s) => {
                acc.activitiesEntered += s.activitiesEntered ?? 0;
                acc.wins              += s.wins              ?? 0;
                acc.kills             += s.kills             ?? 0;
                acc.deaths            += s.deaths            ?? 0;
                acc.assists           += s.assists           ?? 0;
                acc.invasions         += s.invasions         ?? 0;
                acc.invasionKills     += s.invasionKills     ?? 0;
                acc.invasionsDefeated += s.invasionsDefeated ?? 0;
                acc.motesDeposited    += s.motesDeposited    ?? 0;
                acc.motesLost         += s.motesLost         ?? 0;
                acc.motesDenied       += s.motesDenied       ?? 0;
                acc.motesPickedUp     += s.motesPickedUp     ?? 0;
                acc.primevalDamage    += s.primevalDamage    ?? 0;
                acc.durationSeconds   += s.durationSeconds   ?? 0;
                return acc;
            }, {
                activitiesEntered: 0, wins: 0, kills: 0, deaths: 0, assists: 0,
                invasions: 0, invasionKills: 0, invasionsDefeated: 0,
                motesDeposited: 0, motesLost: 0, motesDenied: 0, motesPickedUp: 0,
                primevalDamage: 0, durationSeconds: 0,
            })
            : null
    );

    // EGO career rating — aggregate estimate from lifetime stats.
    // This uses a per-match average approach: compute a typical-match EGO from
    // career averages, then multiply by matches played. Capped for display.
    const egoRating = $derived((() => {
        const entered = Math.max(1, seasonalTotal?.activitiesEntered ?? ltEntered);
        const kills   = (seasonalTotal?.kills   ?? ltKills)   / entered;
        const inv     = (seasonalTotal?.invasionKills ?? ltInvKills)  / entered;
        const denied  = (seasonalTotal?.motesDenied ?? ltMotesDenied) / entered;
        const motes   = (seasonalTotal?.motesDeposited ?? ltMotes)    / entered;
        const deaths  = (seasonalTotal?.deaths  ?? ltDeaths)  / entered;
        const assists = (data.lifetimeStats?.assists?.basic?.value ?? 0) / entered;
        const primeval = (seasonalTotal?.primevalDamage ?? ltPrimevalDmg) / entered;
        const mobK    = Math.max(0, kills - inv);
        // Rough carry bonus: carries inflate average match score slightly
        // Use the career totals approach: wins * 15 for profile-level rank
        const wins  = seasonalTotal?.wins ?? ltWon;
        // Career score = wins×15 + career avg EGO approx
        return Math.min(999999, Math.floor(wins * 15 + kills * 0.3 + inv * 5 + motes * 0.1 + denied * 2));
    })());

    const displaySeason = $derived(
        seasonFilter === 'all' || !seasonal
            ? null
            : (seasonal.seasons ?? []).find(s => s.season === seasonFilter) ?? null
    );

    const allTimeBase = $derived(seasonalTotal ?? {
        activitiesEntered: ltEntered, wins: ltWon, kills: ltKills, deaths: ltDeaths,
        assists: ltAssists, invasions: ltInvasions, invasionKills: ltInvKills,
        invasionsDefeated: ltInvDef, motesDeposited: ltMotes, motesLost: ltMotesLost,
        motesDenied: ltMotesDenied, motesPickedUp: ltMotesPickedUp,
        primevalDamage: ltPrimevalDmg, durationSeconds: 0,
    });

    const dEntered      = $derived(displaySeason ? displaySeason.activitiesEntered : allTimeBase.activitiesEntered);
    const dWon          = $derived(displaySeason ? displaySeason.wins              : allTimeBase.wins);
    const dKills        = $derived(displaySeason ? displaySeason.kills             : (seasonalTotal?.kills ?? ltKills));
    const dDeaths       = $derived(displaySeason ? displaySeason.deaths            : (seasonalTotal?.deaths ?? ltDeaths));
    const dInvasions    = $derived(displaySeason ? displaySeason.invasions         : allTimeBase.invasions);
    const dInvKills     = $derived(displaySeason ? displaySeason.invasionKills     : allTimeBase.invasionKills);
    const dInvDef       = $derived(displaySeason ? (displaySeason.invasionsDefeated ?? 0) : allTimeBase.invasionsDefeated);
    const dMotes        = $derived(displaySeason ? displaySeason.motesDeposited    : allTimeBase.motesDeposited);
    const dMotesLost    = $derived(displaySeason ? displaySeason.motesLost         : allTimeBase.motesLost);
    const dMotesDenied  = $derived(displaySeason ? (displaySeason.motesDenied ?? 0) : allTimeBase.motesDenied);
    const dMotesPickedUp = $derived(displaySeason ? (displaySeason.motesPickedUp ?? 0) : allTimeBase.motesPickedUp);
    const dPrimevalDmg  = $derived(displaySeason ? (displaySeason.primevalDamage ?? 0) : allTimeBase.primevalDamage);
    const dDuration     = $derived(displaySeason ? (displaySeason.durationSeconds ?? 0) : allTimeBase.durationSeconds);

    const dWinRate  = $derived(dEntered > 0 ? (dWon   / dEntered) * 100 : null);
    const dKD       = $derived(dDeaths  > 0 ? dKills  / dDeaths         : dKills > 0 ? dKills : null);
    const dAvgMotes = $derived(dEntered > 0 ? dMotes  / dEntered        : 0);
    const dAvgInv   = $derived(dEntered > 0 ? dInvasions / dEntered     : 0);

    const SEASON_NAMES = {
        19: '19: SERAPH', 20: '20: DEFIANCE', 21: '21: DEEP',
        22: '22: WITCH',  23: '23: WISH',      24: 'EP: ECHOES',
        25: 'EP: REVENANT', 26: 'EP: HERESY',  27: 'EDGE OF FATE',
    };

    // ── Rank badges ────────────────────────────────────────────────────────────
    function winRateRank(wr) {
        if (wr == null) return null;
        if (wr >= 70)   return { label: 'Top 1%',  color: 'text-amber-400'   };
        if (wr >= 60)   return { label: 'Top 5%',  color: 'text-emerald-400' };
        if (wr >= 52)   return { label: 'Top 15%', color: 'text-emerald-400' };
        return null;
    }
    function kdRank(kd) {
        if (kd == null) return null;
        if (kd >= 2.5)  return { label: 'Top 1%',  color: 'text-amber-400'   };
        if (kd >= 1.5)  return { label: 'Top 5%',  color: 'text-emerald-400' };
        if (kd >= 1.0)  return { label: 'Top 25%', color: 'text-zinc-400'    };
        return null;
    }
    function motesRank(avg) {
        if (avg >= 40)  return { label: 'Top 1%',  color: 'text-emerald-400' };
        if (avg >= 25)  return { label: 'Top 10%', color: 'text-emerald-400' };
        if (avg >= 15)  return { label: 'Top 25%', color: 'text-zinc-400'    };
        return null;
    }
    function invRank(avg) {
        if (avg >= 2.0) return { label: 'Top 1%',  color: 'text-violet-400'  };
        if (avg >= 1.0) return { label: 'Top 10%', color: 'text-emerald-400' };
        return null;
    }
    function kdTier(kd) {
        if (kd == null) return { label: 'UNRANKED', color: 'text-zinc-600'   };
        if (kd >= 2.5)  return { label: 'MYTHIC',   color: 'text-amber-400'  };
        if (kd >= 1.5)  return { label: 'ELITE',    color: 'text-emerald-400'};
        if (kd >= 1.0)  return { label: 'VETERAN',  color: 'text-zinc-300'   };
        return                  { label: 'STANDARD', color: 'text-zinc-500'   };
    }
    function winTier(wr) {
        if (wr == null) return { label: 'UNRANKED',  color: 'text-zinc-600'   };
        if (wr >= 65)   return { label: 'DOMINANT',  color: 'text-amber-400'  };
        if (wr >= 55)   return { label: 'STRONG',    color: 'text-emerald-400'};
        if (wr >= 45)   return { label: 'BALANCED',  color: 'text-zinc-300'   };
        return                  { label: 'GRINDING',  color: 'text-zinc-500'   };
    }
    function invTier(avg) {
        if (avg >= 2)   return { label: 'INVADER',   color: 'text-violet-400' };
        if (avg >= 1)   return { label: 'ACTIVE',    color: 'text-emerald-400'};
        if (avg >= 0.5) return { label: 'PASSIVE',   color: 'text-zinc-300'   };
        return                  { label: 'SPECTATOR', color: 'text-zinc-500'   };
    }
    function egoColor(score) {
        if (score == null) return 'text-zinc-600';
        if (score >= 80)   return 'text-amber-400';
        if (score >= 60)   return 'text-emerald-400';
        if (score >= 40)   return 'text-zinc-300';
        return 'text-red-400';
    }

    // ── Match result helper ────────────────────────────────────────────────────
    function matchResult(match) {
        const completed = match?.values?.completed?.basic?.value ?? 0;
        if (!completed) return 'dnf';
        const standing = match?.values?.standing?.basic?.value ?? 1;
        return standing === 0 ? 'win' : 'loss';
    }

    // ── Helpers ────────────────────────────────────────────────────────────────
    function fmt(n) {
        const num = Number(n);
        return Number.isFinite(num) ? num.toLocaleString() : '—';
    }
    function fmtF(n, d = 2) {
        const num = Number(n);
        return Number.isFinite(num) ? num.toFixed(d) : '—';
    }
    function timeAgo(iso) {
        const diff = Date.now() - new Date(iso).getTime();
        const m    = Math.floor(diff / 60000);
        if (m < 60) return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h ago`;
        return `${Math.floor(h / 24)}d ago`;
    }
    function fmtDate(iso) {
        return new Date(iso).toLocaleString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: 'numeric', minute: '2-digit',
        });
    }
    function fmtDuration(secs) {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    async function claimProfile() {
        claiming = true;
        const res = await fetch('/api/claim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                membershipId:   data.player.membershipId,
                membershipType: data.player.membershipType,
                bungieName:     data.player.bungieGlobalDisplayName,
                bungieCode:     data.player.bungieGlobalDisplayNameCode,
            })
        });
        if ((await res.json()).success) claimed = true;
        claiming = false;
    }

    // ── Tab definitions ────────────────────────────────────────────────────────
    const TABS = [
        { id: 'overview', label: 'Overview'  },
        { id: 'matches',  label: 'Matches'   },
        { id: 'weaponry', label: 'Weaponry'  },
        { id: 'synergy',  label: 'Synergy'   },
        { id: 'maps',     label: 'Maps'      },
        { id: 'trophies', label: 'Trophies'  },
        { id: 'pursuits', label: 'Pursuits'  },
        { id: 'loadout',  label: 'Loadout'   },
        { id: 'subclass', label: 'Subclass'  },
    ];

    // ── Medal display names ────────────────────────────────────────────────────
    const MEDAL_LABELS = {
        notOnMyWatch:        'Not On My Watch',
        armyOfOne:           'Army of One',
        locksmith:           'Locksmith',
        blockbuster:         'Blockbuster',
        rapidPayback:        'Rapid Payback',
        massacre:            'Massacre',
        motesHaveBeen:       'Motes Have Been…',
        halfBanked:          'Half Banked',
        firstToBlock:        'First to Block',
        payback:             'Payback',
        overkillmonger:      'Overkillmonger',
        killmonger:          'Killmonger',
        thrillmonger:        'Thrillmonger',
        fastFill:            'Fast Fill',
        killAfterInvasion:   'Kill After Invasion',
        bigGameHunter:       'Big Game Hunter',
        lastGuardianStanding:'Last Guardian Standing',
        noEscape:            'No Escape',
    };

    // ── Playstyle colors ───────────────────────────────────────────────────────
    const PLAYSTYLE_COLORS = {
        Reaper:    { bar: 'bg-red-500',    text: 'text-red-400'    },
        Collector: { bar: 'bg-amber-500',  text: 'text-amber-400'  },
        Invader:   { bar: 'bg-purple-500', text: 'text-purple-400' },
        Sentry:    { bar: 'bg-blue-500',   text: 'text-blue-400'   },
    };

    const monogram = $derived(
        (data.player.bungieGlobalDisplayName ?? 'GD').slice(0, 2).toUpperCase()
    );

    const ACHIEVEMENT_BADGES = [
        { id: 'elite_invader',   icon: '⚡', label: 'Elite Invader',   desc: 'Coming soon.', tier: 'amber'   },
        { id: 'mote_hoarder',    icon: '◈',  label: 'Mote Hoarder',    desc: 'Coming soon.', tier: 'emerald' },
        { id: 'ghost_protocol',  icon: '◉',  label: 'Ghost Protocol',  desc: 'Coming soon.', tier: 'violet'  },
        { id: 'primeval_slayer', icon: '⬡',  label: 'Primeval Slayer', desc: 'Coming soon.', tier: 'emerald' },
        { id: 'veteran',         icon: '◆',  label: 'Veteran Guardian',desc: 'Coming soon.', tier: 'zinc'    },
        { id: 'unknown_1',       icon: '?',  label: '???',             desc: 'Not yet discovered.', tier: 'locked' },
    ];
    const tierStyle = {
        amber:   { border:'border-amber-500/50',   glow:'group-hover:shadow-[0_0_16px_rgba(245,158,11,0.4)]',   text:'text-amber-400',   hoverBorder:'group-hover:border-amber-500/80'   },
        emerald: { border:'border-emerald-500/50', glow:'group-hover:shadow-[0_0_16px_rgba(16,185,129,0.4)]',   text:'text-emerald-400', hoverBorder:'group-hover:border-emerald-500/80' },
        violet:  { border:'border-violet-500/50',  glow:'group-hover:shadow-[0_0_16px_rgba(139,92,246,0.4)]',   text:'text-violet-400',  hoverBorder:'group-hover:border-violet-500/80'  },
        zinc:    { border:'border-zinc-600',        glow:'group-hover:shadow-[0_0_12px_rgba(161,161,170,0.2)]',  text:'text-zinc-400',    hoverBorder:'group-hover:border-zinc-400'       },
        locked:  { border:'border-zinc-800',        glow:'',                                                      text:'text-zinc-700',    hoverBorder:'group-hover:border-zinc-700'       },
    };

    // ── playerData — Gemini UI data object ────────────────────────────────────
    const playerData = $derived({
        identity: {
            name:      data.player.bungieGlobalDisplayName,
            code:      data.player.bungieGlobalDisplayNameCode,
            clan:      data.clan?.name ?? null,
            rating:    career?.avgScore ?? null,
            level:     data.gambitProgression?.level ?? 0,
            rank:      gambitRank,
            rankValue: gambitPct,
        },
        overview: {
            winRatio:  dWinRate,
            wins:      dWon,
            kd:        dKD,
            kills:     dKills,
            motesAvg:  dAvgMotes,
            objectives: { deposited: dMotes, lost: dMotesLost, denied: dMotesDenied },
            invasion:   { guardians: dInvKills, invasions: dInvasions, shutDown: dInvDef },
        },
        loadout: {
            stats: {
                Mobility:   char?.stats?.[2996146975] ?? 0,
                Resilience: char?.stats?.[3927053327] ?? 0,
                Recovery:   char?.stats?.[1943323491] ?? 0,
                Discipline: char?.stats?.[1735777505] ?? 0,
                Intellect:  char?.stats?.[144602215]  ?? 0,
                Strength:   char?.stats?.[4244567218] ?? 0,
            },
            bonuses: { Mobility: 0, Resilience: 0, Recovery: 0, Discipline: 0, Intellect: 0, Strength: 0 },
            weapons: [
                { slot: 'KINETIC', name: eq.kinetic?.name  ?? '—', quality: eq.kinetic?.tierTypeName  ?? '', icon: eq.kinetic?.icon  ?? null },
                { slot: 'ENERGY',  name: eq.energy?.name   ?? '—', quality: eq.energy?.tierTypeName   ?? '', icon: eq.energy?.icon   ?? null },
                { slot: 'POWER',   name: eq.power?.name    ?? '—', quality: eq.power?.tierTypeName    ?? '', icon: eq.power?.icon    ?? null },
            ],
            armor: [
                { slot: 'HELMET', name: eq.helmet?.name     ?? '—', quality: eq.helmet?.tierTypeName     ?? '', icon: eq.helmet?.icon     ?? null },
                { slot: 'ARMS',   name: eq.gauntlets?.name  ?? '—', quality: eq.gauntlets?.tierTypeName  ?? '', icon: eq.gauntlets?.icon  ?? null },
                { slot: 'CHEST',  name: eq.chest?.name      ?? '—', quality: eq.chest?.tierTypeName      ?? '', icon: eq.chest?.icon      ?? null },
                { slot: 'LEGS',   name: eq.legs?.name       ?? '—', quality: eq.legs?.tierTypeName       ?? '', icon: eq.legs?.icon       ?? null },
            ],
        },
    });
</script>

<!-- ── Full-height layout ──────────────────────────────────────────────────── -->
<div class="flex">

<!-- ── Left sidebar ────────────────────────────────────────────────────────── -->
<aside class="w-16 sticky top-0 h-screen border-r border-white/[0.07] bg-black/40 backdrop-blur-md flex flex-col items-center py-4 shrink-0 z-40 gap-1">
    <!-- J Diamond logo -->
    <a href="/" style="position:relative;width:2.25rem;height:2.25rem;margin-bottom:1rem;flex-shrink:0;display:block;">
        <div style="position:absolute;inset:0;transform:rotate(45deg);border:1px solid rgba(61,174,119,0.50);background:rgba(61,174,119,0.07);box-shadow:0 0 10px rgba(61,174,119,0.20);"></div>
        <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--font-family-display);font-size:0.78rem;font-weight:900;color:var(--gambit-green);user-select:none;">J</span>
    </a>
    <!-- Tab icon buttons -->
    {#each [
        { id:'overview',  label:'Overview',
          path:'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
        { id:'matches',   label:'Matches',
          path:'M4 6h16M4 10h16M4 14h10' },
        { id:'weaponry',  label:'Weaponry',
          path:'M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z' },
        { id:'synergy',   label:'Synergy',
          path:'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
        { id:'maps',      label:'Maps',
          path:'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7' },
        { id:'trophies',  label:'Trophies',
          path:'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z' },
        { id:'pursuits',  label:'Pursuits',
          path:'M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9' },
        { id:'loadout',   label:'Loadout',
          path:'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
        { id:'subclass',  label:'Subclass',
          path:'M13 10V3L4 14h7v7l9-11h-7z' },
    ] as t}
        <button onclick={() => tab = t.id} title={t.label}
            class="relative w-11 h-11 flex items-center justify-center rounded transition-all duration-150 group/sb
                   {tab === t.id ? 'bg-emerald-500/10 text-emerald-400' : 'text-zinc-600 hover:text-zinc-300 hover:bg-white/5'}">
            {#if tab === t.id}
                <span class="absolute left-0 top-2 bottom-2 w-0.5 bg-emerald-500 rounded-r shadow-[0_0_6px_rgba(61,174,119,0.8)]"></span>
            {/if}
            <svg class="w-4.5 h-4.5" style="width:1.1rem;height:1.1rem;" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d={t.path}/>
            </svg>
            <!-- Tooltip -->
            <span class="absolute left-full ml-2 px-2 py-1 bg-zinc-900 border border-zinc-700 text-[10px] font-semibold text-zinc-200 whitespace-nowrap
                         opacity-0 group-hover/sb:opacity-100 pointer-events-none transition-opacity duration-100 z-50"
                  style="font-family:var(--font-family-display);letter-spacing:0.1em;text-transform:uppercase;">
                {t.label}
            </span>
        </button>
    {/each}

    <!-- Spacer + claim button at bottom -->
    <div class="mt-auto flex flex-col items-center gap-2">
        {#if !claimed}
            <button onclick={claimProfile} title="Claim profile"
                class="w-8 h-8 flex items-center justify-center text-zinc-700 hover:text-emerald-400 transition-colors"
                disabled={claiming}>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                </svg>
            </button>
        {:else}
            <div class="w-2 h-2 rounded-full bg-emerald-500/60" title="Profile claimed"></div>
        {/if}
    </div>
</aside><!-- end left sidebar -->

<!-- ── Main content panel ────────────────────────────────────────────────────── -->
<div class="flex-1 min-w-0 flex flex-col overflow-y-auto">

    <!-- ── Hero header ──────────────────────────────────────────────────────── -->
    <header style="position:relative;overflow:hidden;padding:1.5rem;">

        <!-- Primary stat cards — Basalt & Silver style -->
        <div class="flex gap-3 mb-4 [&>*]:flex-1">
            {#if hasKey('activitiesEntered') || dEntered > 0}
            <div class="relative bg-zinc-950 border border-zinc-800 p-4 overflow-hidden hover:border-zinc-700 transition-colors group">
                <span class="absolute top-0 left-0 w-3 h-3 border-t border-l border-emerald-500/30 pointer-events-none"></span>
                <span class="absolute top-0 right-0 w-3 h-3 border-t border-r border-emerald-500/30 pointer-events-none"></span>
                <div class="flex items-start justify-between mb-3">
                    <span class="text-[10px] font-semibold text-zinc-500 tracking-widest uppercase" style="font-family:var(--font-family-display);">Win Rate</span>
                    {#if winRateRank(dWinRate)}
                        <span class="text-[9px] font-bold {winRateRank(dWinRate).color} border border-current/30 px-1.5 py-0.5">{winRateRank(dWinRate).label}</span>
                    {/if}
                </div>
                <div class="text-4xl font-sans font-light tracking-tighter {winTier(dWinRate).color} leading-none mb-1">
                    {dWinRate != null ? fmtF(dWinRate, 1) + '%' : '—'}
                </div>
                <div class="text-[10px] text-zinc-600 mt-2">{fmt(dWon)} W · {fmt(dEntered - dWon)} L · {fmt(dEntered)} total</div>
                <div class="text-[9px] font-semibold {winTier(dWinRate).color} mt-1 tracking-widest" style="font-family:var(--font-family-display);">{winTier(dWinRate).label}</div>
            </div>
            {/if}

            {#if hasKey('kills') || dKills > 0 || dDeaths > 0}
            <div class="relative bg-zinc-950 border border-zinc-800 p-4 overflow-hidden hover:border-zinc-700 transition-colors group">
                <span class="absolute top-0 left-0 w-3 h-3 border-t border-l border-emerald-500/30 pointer-events-none"></span>
                <span class="absolute top-0 right-0 w-3 h-3 border-t border-r border-emerald-500/30 pointer-events-none"></span>
                <div class="flex items-start justify-between mb-3">
                    <span class="text-[10px] font-semibold text-zinc-500 tracking-widest uppercase" style="font-family:var(--font-family-display);">K / D / A</span>
                    {#if kdRank(dKD)}
                        <span class="text-[9px] font-bold {kdRank(dKD).color} border border-current/30 px-1.5 py-0.5">{kdRank(dKD).label}</span>
                    {/if}
                </div>
                <div class="text-4xl font-sans font-light tracking-tighter {kdTier(dKD).color} leading-none mb-1">
                    {dKD != null ? fmtF(dKD) : '—'}
                </div>
                <div class="text-[10px] text-zinc-600 mt-2">{fmt(dKills)} K · {fmt(dDeaths)} D</div>
                <div class="text-[9px] font-semibold {kdTier(dKD).color} mt-1 tracking-widest" style="font-family:var(--font-family-display);">{kdTier(dKD).label}</div>
            </div>
            {/if}

            {#if hasKey('motesBanked') || dMotes > 0}
            <div class="relative bg-zinc-950 border border-zinc-800 p-4 overflow-hidden hover:border-zinc-700 transition-colors group">
                <span class="absolute top-0 left-0 w-3 h-3 border-t border-l border-emerald-500/30 pointer-events-none"></span>
                <span class="absolute top-0 right-0 w-3 h-3 border-t border-r border-emerald-500/30 pointer-events-none"></span>
                <div class="flex items-start justify-between mb-3">
                    <span class="text-[10px] font-semibold text-zinc-500 tracking-widest uppercase" style="font-family:var(--font-family-display);">Avg Motes</span>
                    {#if motesRank(dAvgMotes)}
                        <span class="text-[9px] font-bold {motesRank(dAvgMotes).color} border border-current/30 px-1.5 py-0.5">{motesRank(dAvgMotes).label}</span>
                    {/if}
                </div>
                <div class="text-4xl font-sans font-light tracking-tighter text-zinc-200 leading-none mb-1">
                    {fmtF(dAvgMotes, 1)}
                </div>
                <div class="text-[10px] text-zinc-600 mt-2">{fmt(dMotes)} total · {fmt(dMotesLost)} lost</div>
                <div class="text-[10px] text-zinc-600 mt-0.5">Denied: {fmt(dMotesDenied)}</div>
            </div>
            {/if}

            {#if hasKey('invasions') || dInvasions > 0}
            <div class="relative bg-zinc-950 border border-zinc-800 p-4 overflow-hidden hover:border-zinc-700 transition-colors group">
                <span class="absolute top-0 left-0 w-3 h-3 border-t border-l border-amber-500/20 pointer-events-none"></span>
                <span class="absolute top-0 right-0 w-3 h-3 border-t border-r border-amber-500/20 pointer-events-none"></span>
                <div class="flex items-start justify-between mb-3">
                    <span class="text-[10px] font-semibold text-zinc-500 tracking-widest uppercase" style="font-family:var(--font-family-display);">Avg Invasions</span>
                    {#if invRank(dAvgInv)}
                        <span class="text-[9px] font-bold {invRank(dAvgInv).color} border border-current/30 px-1.5 py-0.5">{invRank(dAvgInv).label}</span>
                    {/if}
                </div>
                <div class="text-4xl font-sans font-light tracking-tighter {invTier(dAvgInv).color} leading-none mb-1">
                    {fmtF(dAvgInv, 2)}
                </div>
                <div class="text-[10px] text-zinc-600 mt-2">{fmt(dInvKills)} kills · {fmt(dInvDef)} shut down</div>
                <div class="text-[9px] font-semibold {invTier(dAvgInv).color} mt-1 tracking-widest" style="font-family:var(--font-family-display);">{invTier(dAvgInv).label}</div>
            </div>
            {/if}
        </div>

        <!-- Detail cards row -->
        <div class="flex gap-4 mb-4 [&>*]:flex-1">
            <!-- Motes card -->
            {#if hasKey('motesBanked') || dMotes > 0}
            <div class="bg-zinc-900/40 border border-zinc-800/60 p-4">
                <div class="text-[10px] font-semibold text-zinc-500 tracking-widest uppercase mb-3">Mote Economy</div>
                {#if hasKey('motesBanked') || dMotes > 0}
                    <div class="flex items-center justify-between py-1.5 border-b border-zinc-800/40">
                        <span class="text-xs text-zinc-500">Deposited</span>
                        <span class="text-sm font-mono font-bold text-zinc-200">{fmt(dMotes)}</span>
                    </div>
                {/if}
                {#if hasKey('motesLost') || dMotesLost > 0}
                    <div class="flex items-center justify-between py-1.5 border-b border-zinc-800/40">
                        <span class="text-xs text-zinc-500">Lost</span>
                        <span class="text-sm font-mono font-bold text-red-400">{fmt(dMotesLost)}</span>
                    </div>
                {/if}
                {#if hasKey('motesDenied') || dMotesDenied > 0}
                    <div class="flex items-center justify-between py-1.5 border-b border-zinc-800/40">
                        <span class="text-xs text-zinc-500">Denied</span>
                        <span class="text-sm font-mono font-bold text-violet-400">{fmt(dMotesDenied)}</span>
                    </div>
                {/if}
                {#if dMotesPickedUp > 0 && dMotes > 0}
                    <div class="flex items-center justify-between py-1.5">
                        <span class="text-xs text-zinc-500">Efficiency</span>
                        <span class="text-sm font-mono font-bold text-emerald-400">
                            {fmtF((dMotes / Math.max(dMotesPickedUp, dMotes)) * 100, 1)}%
                        </span>
                    </div>
                {/if}
            </div>
            {/if}

            <!-- Invasion card -->
            {#if hasKey('invasionKills') || dInvKills > 0 || dInvasions > 0}
            <div class="bg-zinc-900/40 border border-zinc-800/60 p-4">
                <div class="text-[10px] font-semibold text-zinc-500 tracking-widest uppercase mb-3">Invasion</div>
                {#if hasKey('invasions') || dInvasions > 0}
                    <div class="flex items-center justify-between py-1.5 border-b border-zinc-800/40">
                        <span class="text-xs text-zinc-500">Invasions</span>
                        <span class="text-sm font-mono font-bold text-zinc-200">{fmt(dInvasions)}</span>
                    </div>
                {/if}
                {#if hasKey('invasionKills') || dInvKills > 0}
                    <div class="flex items-center justify-between py-1.5 border-b border-zinc-800/40">
                        <span class="text-xs text-zinc-500">Guardians Killed</span>
                        <span class="text-sm font-mono font-bold text-red-400">{fmt(dInvKills)}</span>
                    </div>
                {/if}
                {#if hasKey('invasionsDefeated') || dInvDef > 0}
                    <div class="flex items-center justify-between py-1.5">
                        <span class="text-xs text-zinc-500">Shut Down</span>
                        <span class="text-sm font-mono font-bold text-emerald-400">{fmt(dInvDef)}</span>
                    </div>
                {/if}
            </div>
            {/if}

            <!-- Extended stats card -->
            {#if dPrimevalDmg > 0 || dDuration > 0}
            <div class="bg-zinc-900/40 border border-zinc-800/60 p-4">
                <div class="text-[10px] font-semibold text-zinc-500 tracking-widest uppercase mb-3">Extended</div>
                {#if dPrimevalDmg > 0}
                    <div class="flex items-center justify-between py-1.5 border-b border-zinc-800/40">
                        <span class="text-xs text-zinc-500">Primeval Damage</span>
                        <span class="text-sm font-mono font-bold text-amber-400">{fmt(Math.round(dPrimevalDmg))}</span>
                    </div>
                {/if}
                {#if dDuration > 0}
                    <div class="flex items-center justify-between py-1.5 border-b border-zinc-800/40">
                        <span class="text-xs text-zinc-500">Time Played</span>
                        <span class="text-sm font-mono font-bold text-zinc-200">
                            {Math.floor(dDuration / 3600)}h {Math.floor((dDuration % 3600) / 60)}m
                        </span>
                    </div>
                {/if}
                {#if dEntered > 0 && dMotes > 0}
                    <div class="flex items-center justify-between py-1.5">
                        <span class="text-xs text-zinc-500">Avg Duration</span>
                        <span class="text-sm font-mono font-bold text-zinc-300">
                            {dDuration > 0 ? Math.round(dDuration / dEntered / 60) + 'm' : '—'}
                        </span>
                    </div>
                {/if}
            </div>
            {/if}
        </div>

    <!-- ══════════════════════════════════ MAIN CONTENT ══ -->
    <!-- Note: seasonal breakdown table is rendered inside the overview tab panel below -->

    {#if tab === 'matches'}<!-- Match history controls — only when on matches tab -->
        <!-- Top controls row -->
        <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
            <!-- Count selector -->
            <div class="flex items-center gap-3">
                <span class="text-xs text-zinc-500">Show last</span>
                <select bind:value={historyCount}
                    class="bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 px-3 py-1.5 focus:outline-none focus:border-emerald-500/50 cursor-pointer">
                    {#each HISTORY_COUNT_OPTIONS as opt}
                        <option value={opt}>{opt.toLocaleString()} matches</option>
                    {/each}
                </select>
                {#if historyCount >= 1000}
                    <span class="text-[10px] text-amber-500/70 italic">May take 30–60 s</span>
                {/if}
            </div>
            <!-- Right controls -->
            <div class="flex items-center gap-2">
                {#if history}
                    <span class="text-[10px] text-zinc-600">{history.fetched?.toLocaleString() ?? 0} loaded</span>
                {/if}
                {#if enriching}
                    <span class="text-[10px] text-violet-400 animate-pulse">enriching {enrichProgress.stored}/{enrichProgress.total}…</span>
                {/if}
                <button onclick={downloadCsv}
                    class="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold text-zinc-400 border border-zinc-700 hover:border-emerald-600 hover:text-emerald-400 transition-colors">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                    CSV
                </button>
            </div>
        </div>

        <!-- Stack size filter + streak -->
        <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-1">
                <span class="text-[10px] text-zinc-600 mr-1">Stack:</span>
                {#each [{v:0,l:'Any'},{v:1,l:'Solo'},{v:2,l:'Duo'},{v:3,l:'Trio'},{v:4,l:'Full'}] as sf}
                    <button onclick={() => stackFilter = sf.v}
                        class="px-2 py-0.5 text-[10px] font-semibold border transition-colors
                               {stackFilter === sf.v
                                   ? 'bg-emerald-500/10 border-emerald-600 text-emerald-400'
                                   : 'border-zinc-800 text-zinc-600 hover:border-zinc-600 hover:text-zinc-400'}">
                        {sf.l}
                    </button>
                {/each}
                <button onclick={() => stackFilter = 'favs'}
                    class="px-2 py-0.5 text-[10px] font-semibold border transition-colors
                           {stackFilter === 'favs'
                               ? 'bg-amber-500/10 border-amber-600 text-amber-400'
                               : 'border-zinc-800 text-zinc-600 hover:border-zinc-600 hover:text-zinc-400'}">
                    ★ Favs
                </button>
            </div>
            <!-- Streak badge -->
            {#if streak && streak.count >= 2}
                <div class="flex items-center gap-1.5 px-2.5 py-1 border
                            {streak.type === 'win' ? 'border-emerald-600/50 bg-emerald-900/20' : 'border-red-800/50 bg-red-900/20'}">
                    <span class="text-[10px] font-bold {streak.type === 'win' ? 'text-emerald-400' : 'text-red-400'}">
                        {streak.count} {streak.type.toUpperCase()} STREAK
                    </span>
                </div>
            {/if}
        </div>

        <!-- Session summary strip -->
        {#if sessionSummary}
            <div class="flex items-center gap-4 px-3 py-2 bg-zinc-900/40 border border-zinc-800/60 mb-3 text-[10px]">
                <span class="text-zinc-500 font-semibold uppercase tracking-widest">Last {sessionSummary.games}</span>
                <span class="text-zinc-300">{sessionSummary.wins}W–{sessionSummary.games - sessionSummary.wins}L</span>
                <span class="text-zinc-500">·</span>
                <span class="text-zinc-400">Avg EGO <span class="font-mono font-bold {egoColor(sessionSummary.avgEgo)}">{sessionSummary.avgEgo}</span></span>
                <span class="text-zinc-500">·</span>
                <span class="text-zinc-400">Motes <span class="font-mono text-amber-400">{sessionSummary.totMotes.toLocaleString()}</span></span>
                {#if sessionSummary.carries > 0}
                    <span class="text-zinc-500">·</span>
                    <span class="text-emerald-400 font-semibold">{sessionSummary.carries} carry</span>
                {/if}
            </div>
        {/if}

        <!-- Loading skeleton / empty state — matches tab only -->
        {#if historyLoading}
            <div class="space-y-1">
                {#each Array(12) as _}
                    <div class="h-9 bg-zinc-900/50 border border-zinc-800/30 animate-pulse"></div>
                {/each}
            </div>
        {:else if !filteredMatches.length}
            <div class="text-sm text-zinc-600 text-center py-8">
                {stackFilter === 'favs' ? 'No favorited matches yet.' : 'No Gambit matches found.'}
            </div>
        {/if}
    {/if}<!-- end matches tab controls -->

    <!-- ── Identity block — always visible ─────────────────────────────────── -->
    <div class="flex-1 min-w-0 mb-1">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:0.5rem;">
            <div style="height:1px;width:32px;background:linear-gradient(to right,transparent,var(--gambit-green));opacity:0.7;"></div>
            <span style="font-family:var(--font-family-display);font-size:0.60rem;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:var(--gambit-green);">Guardian Profile</span>
        </div>
        <h1 style="font-family:var(--font-family-display);font-size:clamp(2rem,6vw,3.5rem);font-weight:800;letter-spacing:0.04em;text-transform:uppercase;color:var(--d2-text-primary);line-height:0.95;margin:0 0 0.5rem;text-shadow:0 2px 10px rgba(0,0,0,0.5);" class="anim-in truncate">
            {data.player.bungieGlobalDisplayName}<span style="font-family:var(--font-family-mono);font-size:0.45em;font-weight:400;color:rgba(255,255,255,0.28);margin-left:0.25rem;">#{String(data.player.bungieGlobalDisplayNameCode).padStart(4,'0')}</span>
        </h1>
        <!-- Clan + bestAlly -->
        <div class="flex items-center gap-3 mb-2">
            {#if data.clan}
                <a href="/clan/{data.clan.groupId}"
                   class="text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors">
                    [{data.clan.name}]
                </a>
                {#if career?.bestAlly}
                    <div class="text-[10px] text-zinc-500">
                        Best ally: {career.bestAlly.name} · {career.bestAlly.as_ally} games · {career.bestAlly.winRate}% WR
                    </div>
                {/if}
            {/if}
        </div>
        {#if career?.nemesis}
            <div class="bg-red-900/10 border border-red-800/40 px-3 py-2 inline-flex items-center gap-3">
                <span class="text-[9px] font-semibold text-red-600 tracking-widest uppercase">Nemesis</span>
                <a href="/profile/{career.nemesis.name.replace('#','/')}"
                   class="text-sm font-semibold text-red-300 hover:text-red-200 transition-colors truncate">
                    {career.nemesis.name}
                </a>
                <span class="text-[10px] text-zinc-500">{career.nemesis.as_enemy} matches · {career.nemesis.winRate}% WR vs you</span>
            </div>
        {/if}
    </div>

            <!-- ── Class compare ─────────────────────────────────────────────── -->
            {#if career?.classStats?.some(c => c.games > 0)}
                <div class="mb-6">
                    <div class="text-[10px] font-semibold text-zinc-500 tracking-widest uppercase mb-2">Class Performance</div>
                    <div class="flex gap-3">
                        {#each career.classStats.filter(c => c.games > 0) as cls}
                            <div class="flex-1 bg-zinc-900/40 border border-zinc-800/60 p-3 text-center">
                                <img src="/icons/classes/{cls.className.toLowerCase()}.png" alt={cls.className}
                                     class="w-8 h-8 object-contain mx-auto mb-1 opacity-70"
                                     onerror={(e) => { e.currentTarget.style.display = 'none'; }} />
                                <div class="text-[10px] text-zinc-500 mb-1">{cls.className}</div>
                                <div class="text-2xl font-mono font-light text-zinc-200">{cls.games}</div>
                                <div class="text-[10px] text-zinc-600">games</div>
                                <div class="text-xs font-semibold {cls.winRate >= 55 ? 'text-emerald-400' : cls.winRate >= 45 ? 'text-zinc-300' : 'text-red-400'} mt-1">
                                    {cls.winRate}% WR
                                </div>
                                <div class="text-[10px] {egoColor(cls.avgScore)} mt-0.5">
                                    {cls.avgScore} avg EGO
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>

                <!-- Rating section -->
                <div class="group/ego shrink-0 text-right mb-1 cursor-default select-none">
                    <span style="font-family:var(--font-family-display);font-size:0.60rem;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:rgba(255,255,255,0.28);display:block;margin-bottom:0.35rem;">EGO Rating</span>
                    <span style="font-family:var(--font-family-display);font-size:3rem;font-weight:800;letter-spacing:-0.01em;color:var(--d2-text-primary);line-height:1;display:block;transition:filter 0.3s;"
                          class="group-hover/ego:drop-shadow-[0_0_16px_rgba(255,255,255,0.2)]">
                        {egoRating.toLocaleString()}
                    </span>
                    <div style="height:2px;width:80px;background:linear-gradient(to left,transparent,var(--gambit-green));margin:0.5rem 0 0.35rem auto;"></div>
                    <span style="font-family:var(--font-family-display);font-size:0.72rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--gambit-green);display:block;margin-bottom:0.35rem;">
                        {gambitRank}
                    </span>
                    <div style="width:6rem;height:2px;background:rgba(255,255,255,0.08);margin-left:auto;">
                        <div style="height:100%;background:var(--gambit-green);opacity:0.7;transition:width 0.5s;width:{gambitPct}%;"></div>
                    </div>
                    <span style="font-family:var(--font-family-display);font-size:0.58rem;font-weight:500;letter-spacing:0.08em;color:rgba(255,255,255,0.22);display:block;margin-top:3px;">{gambitPct}% to next tier</span>
                    <!-- Formula tooltip -->
                    <div class="absolute top-1/2 -translate-y-1/2 right-full mr-4 z-30
                                opacity-0 group-hover/ego:opacity-100
                                translate-x-2 group-hover/ego:translate-x-0
                                transition-all duration-200 pointer-events-none whitespace-nowrap">
                        <div class="bg-black/80 backdrop-blur-sm border border-zinc-700 px-4 py-3 text-left shadow-[0_0_20px_rgba(0,0,0,0.7)]">
                            <span class="text-xs font-medium text-zinc-500 block mb-2">EGO Formula</span>
                            {#each [
                                { label: 'Wins × 15',      value: fmt(ltWon * 15)              },
                                { label: 'Kills × 0.3',    value: fmt(Math.floor(ltKills*0.3)) },
                                { label: 'Inv. Kills × 5', value: fmt(ltInvKills * 5)          },
                                { label: 'Motes × 0.1',    value: fmt(Math.floor(ltMotes*0.1)) },
                            ] as row}
                                <div class="flex items-center justify-between gap-6 mb-1">
                                    <span class="text-[8px] font-sans text-zinc-600">{row.label}</span>
                                    <span class="text-[8px] font-mono text-zinc-300">{row.value}</span>
                                </div>
                            {/each}
                            <div class="h-px bg-zinc-800 my-2"></div>
                            <div class="flex items-center justify-between gap-6">
                                <span class="text-[8px] font-mono uppercase text-zinc-500">Total</span>
                                <span class="text-[10px] font-mono font-bold text-emerald-400">{egoRating.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                </div>
        {/if}<!-- end career classStats block -->

        <!-- Bottom accent line -->
        <div style="position:absolute;bottom:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--gambit-green),rgba(61,174,119,0.3) 30%,transparent 60%);opacity:0.5;z-index:20;"></div>
    </header>

        <!-- ── Tab nav strip ────────────────────────────────────────────────── -->
        <div style="height:48px;background:rgba(6,8,10,0.85);backdrop-filter:blur(16px);border-bottom:1px solid rgba(255,255,255,0.07);display:flex;align-items:stretch;flex-shrink:0;position:sticky;top:0;z-index:30;">
            {#each TABS as t}
                <button onclick={() => tab = t.id}
                    style="
                        font-family:var(--font-family-display);font-size:0.68rem;font-weight:{tab===t.id?'700':'600'};
                        letter-spacing:0.12em;text-transform:uppercase;
                        padding:0 1.25rem;position:relative;flex-shrink:0;white-space:nowrap;border:none;
                        background:{tab===t.id?'rgba(255,255,255,0.04)':'transparent'};
                        color:{tab===t.id?'var(--d2-text-primary)':'var(--d2-text-muted)'};
                        cursor:pointer;transition:color 0.15s,background 0.15s;
                        border-right:1px solid rgba(255,255,255,0.05);
                    "
                    onmouseenter={e=>{if(tab!==t.id){e.currentTarget.style.color='var(--d2-text-secondary)';e.currentTarget.style.background='rgba(255,255,255,0.02)';}}}
                    onmouseleave={e=>{if(tab!==t.id){e.currentTarget.style.color='var(--d2-text-muted)';e.currentTarget.style.background='transparent';}}}>
                    {t.label}
                    {#if tab === t.id}
                        <span style="position:absolute;bottom:0;left:0;right:0;height:2px;background:var(--gambit-green);box-shadow:0 0 12px rgba(61,174,119,0.8);pointer-events:none;"></span>
                    {/if}
                </button>
            {/each}
        </div>

        <!-- ── Tab content ───────────────────────────────────────────────────── -->
        <main>

        {#key tab}
        <div in:fly={{ y: 16, duration: 320, opacity: 0 }}>

            <!-- ── Gemini "Basalt & Silver" snippets ──────────────────────────── -->

            {#snippet ghostLabel(text)}
                <span style="font-family:var(--font-family-display);font-size:0.58rem;font-weight:700;letter-spacing:0.20em;text-transform:uppercase;color:rgba(255,255,255,0.22);">{text}</span>
            {/snippet}

            {#snippet engravedHeader(title, sub)}
                <div class="flex items-center gap-3 mb-4">
                    <div class="h-px flex-1 bg-gradient-to-r from-transparent to-zinc-800/80"></div>
                    <span style="font-family:var(--font-family-display);font-size:0.60rem;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.30);" class="shrink-0">{title}</span>
                    {#if sub}<span class="text-[9px] text-zinc-700 shrink-0">{sub}</span>{/if}
                    <div class="h-px flex-1 bg-gradient-to-l from-transparent to-zinc-800/80"></div>
                </div>
            {/snippet}

            <!-- stoneCard: pass a snippet as `inner` param -->
            {#snippet stoneCard(inner)}
                <div class="relative bg-zinc-950 border border-zinc-800/80 overflow-hidden group/sc
                            hover:border-zinc-700/80 transition-colors duration-200">
                    <span class="absolute top-0 left-0 w-3 h-3 border-t border-l border-emerald-500/25 pointer-events-none"></span>
                    <span class="absolute top-0 right-0 w-3 h-3 border-t border-r border-emerald-500/25 pointer-events-none"></span>
                    <span class="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-zinc-700/30 pointer-events-none"></span>
                    <span class="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-zinc-700/30 pointer-events-none"></span>
                    {@render inner()}
                </div>
            {/snippet}

            {#snippet largeMetricCompact(value, label, rankBadge)}
                <div class="p-4 relative overflow-hidden">
                    {@render ghostLabel(label)}
                    <div class="mt-1.5 flex items-baseline justify-between gap-2">
                        <span style="font-family:var(--font-family-display);font-size:1.9rem;font-weight:800;line-height:1;color:var(--d2-text-primary);">{value}</span>
                        {#if rankBadge}
                            <span class="text-[9px] font-bold {rankBadge.color} border border-current/30 px-1.5 py-0.5 shrink-0"
                                  style="font-family:var(--font-family-display);letter-spacing:0.1em;">{rankBadge.label}</span>
                        {/if}
                    </div>
                </div>
            {/snippet}

            {#snippet detailStatCompact(label, value, colorClass)}
                <div class="flex items-center justify-between gap-2 py-1.5 border-b border-zinc-800/40 last:border-0">
                    <span class="text-xs font-medium text-zinc-500 shrink-0">{label}</span>
                    <span class="text-sm font-mono font-bold {colorClass ?? 'text-zinc-200'}">{value}</span>
                </div>
            {/snippet}

            {#snippet rankMedallion(rankName, pct)}
                <div class="flex flex-col items-center gap-1 px-3 py-2">
                    <span style="font-family:var(--font-family-display);font-size:0.68rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--gambit-green);">{rankName}</span>
                    <div class="w-16 h-1 bg-zinc-800 overflow-hidden">
                        <div class="h-full bg-emerald-500/70 transition-all duration-500" style="width:{pct}%"></div>
                    </div>
                    <span class="text-[9px] text-zinc-600">{pct}% to next</span>
                </div>
            {/snippet}

            {#snippet jadestoneSlot(item)}
                <div class="flex items-center gap-3 px-3 py-2.5 border-b border-zinc-800/40 last:border-0 group/slot hover:bg-white/[0.02] transition-colors">
                    {#if item.icon}
                        <img src={item.icon} alt="" class="w-9 h-9 object-cover shrink-0 border border-zinc-700/50" />
                    {:else}
                        <div class="w-9 h-9 bg-zinc-900 border border-zinc-800 shrink-0 flex items-center justify-center">
                            <div class="w-3 h-3 border border-zinc-700 rotate-45"></div>
                        </div>
                    {/if}
                    <div class="flex-1 min-w-0">
                        <span class="text-sm font-medium text-zinc-300 truncate block group-hover/slot:text-white transition-colors">{item.name}</span>
                        <span class="text-[9px] tracking-wider uppercase {item.quality === 'Exotic' ? 'text-yellow-500' : item.quality === 'Legendary' ? 'text-violet-400' : 'text-zinc-600'}">{item.slot}</span>
                    </div>
                    <span class="text-[9px] shrink-0 {item.quality === 'Exotic' ? 'text-yellow-500' : item.quality === 'Legendary' ? 'text-violet-400/60' : 'text-zinc-700'}">{item.quality}</span>
                </div>
            {/snippet}

            {#snippet fateStatRow(statName, base, bonus)}
                <div class="flex items-center gap-3 py-1.5">
                    <span class="text-xs text-zinc-500 w-24 shrink-0">{statName}</span>
                    <div class="flex-1 h-1 bg-zinc-900 overflow-hidden">
                        <div class="h-full bg-emerald-600/60 transition-all duration-500" style="width:{Math.min(base, 100)}%"></div>
                    </div>
                    <span class="text-sm font-mono text-zinc-300 w-8 text-right shrink-0">{base}</span>
                    {#if bonus > 0}
                        <span class="text-[10px] font-mono text-emerald-400 shrink-0">+{bonus}</span>
                    {:else}
                        <span class="text-[10px] text-zinc-700 shrink-0 w-6"></span>
                    {/if}
                </div>
            {/snippet}

            {#snippet medalBadge(medalKey, count)}
                {@const localPng = `/icons/medals/${medalKey.replace(/([A-Z])/g, c => c.toLowerCase())}.png`}
                <div class="relative bg-zinc-950 border border-zinc-800 p-3 flex flex-col items-center gap-2
                            hover:border-zinc-600 transition-colors group/medal"
                     title="{MEDAL_LABELS[medalKey] ?? medalKey} × {count}">
                    <span class="absolute top-0 left-0 w-2 h-2 border-t border-l border-amber-500/20 pointer-events-none"></span>
                    <span class="absolute top-0 right-0 w-2 h-2 border-t border-r border-amber-500/20 pointer-events-none"></span>
                    <div class="w-12 h-12 flex items-center justify-center relative">
                        <img src={localPng} alt={MEDAL_LABELS[medalKey] ?? medalKey}
                             class="w-10 h-10 object-contain group-hover/medal:scale-110 transition-transform"
                             onerror={(e) => { e.currentTarget.style.display='none'; const fb=e.currentTarget.nextElementSibling; if(fb) fb.style.display='flex'; }} />
                        <div class="w-10 h-10 bg-zinc-800 border border-zinc-700 rotate-45 items-center justify-center hidden">
                            <span class="text-[8px] text-zinc-500 -rotate-45">M</span>
                        </div>
                    </div>
                    <span class="text-xl font-mono font-bold text-zinc-100">{count.toLocaleString()}</span>
                    <span class="text-[9px] text-zinc-600 text-center leading-tight line-clamp-2">{MEDAL_LABELS[medalKey] ?? medalKey}</span>
                </div>
            {/snippet}

            <!-- ── DetailRow snippet (label | value | rank badge) ───────────── -->
            {#snippet DetailRow(label, value, rank)}
                <div class="flex items-center justify-between gap-2 py-1.5 border-b border-zinc-800/40 last:border-0">
                    <span class="text-xs font-medium text-zinc-500 shrink-0">{label}</span>
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="text-sm font-mono font-bold leading-none
                                     {rank ? rank.color : 'text-zinc-200'}">{value}</span>
                        {#if rank}
                            <span class="text-[10px] font-semibold shrink-0
                                         {rank.color} border border-current/30 px-1.5 py-px rounded">{rank.label}</span>
                        {/if}
                    </div>
                </div>
            {/snippet}

            <!-- ══ OVERVIEW ═════════════════════════════════════════════════════ -->
            {#if tab === 'overview'}
                {#if !data.lifetimeStats}
                    <div class="flex items-center justify-center h-full">
                        <p class="text-sm font-medium text-zinc-500">
                            No Gambit stats found for this Guardian.
                        </p>
                    </div>
                {:else}
                    <div class="p-6 space-y-5">

                        <!-- Notice when stats come from recent matches only -->
                        {#if data.statsSource === 'recent'}
                            <div class="flex items-center gap-2 mb-4 px-3 py-2 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                                <svg class="w-3.5 h-3.5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                                </svg>
                                <span class="text-sm text-amber-500/80 font-light">
                                    Lifetime API unavailable — showing last {data.recentMatches.length} matches only. Full history loads from seasonal data below.
                                </span>
                            </div>
                        {/if}

                        <!-- ── SEASONAL HISTORY header + scrollable season pills ── -->
                        <div class="relative border-b border-zinc-800/50 pb-3 anim-in">
                            <div class="flex items-center gap-2 mb-3">
                                <span class="text-xs font-medium text-zinc-500">Seasonal History</span>
                                {#if seasonalLoading}
                                    <div class="w-3 h-3 border border-zinc-700 border-t-emerald-400 animate-spin"></div>
                                {/if}
                                {#if seasonal?.totalActivities}
                                    <span class="text-xs text-zinc-600 font-light ml-1">· {seasonal.totalActivities.toLocaleString()} matches indexed</span>
                                {/if}
                            </div>
                            <!-- Mouse-wheel-scrollable season tabs -->
                            <div class="flex overflow-x-auto gap-1 no-scrollbar scroll-smooth cursor-grab active:cursor-grabbing"
                                 onwheel={(e) => { e.currentTarget.scrollLeft += e.deltaY; e.preventDefault(); }}>
                                <button onclick={() => seasonFilter = 'all'}
                                        class="flex-shrink-0 px-4 py-1.5 text-xs font-medium
                                               transition-all border rounded relative overflow-hidden
                                               {seasonFilter === 'all'
                                                   ? 'text-emerald-400 bg-emerald-500/5 border-emerald-500/40'
                                                   : 'text-zinc-500 border-zinc-800/50 hover:text-zinc-300 hover:border-zinc-700'}">
                                    All-Time
                                    {#if seasonFilter === 'all'}
                                        <div class="absolute bottom-0 left-0 w-full h-[2px] bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)]"></div>
                                    {/if}
                                </button>
                                {#if seasonal?.seasons?.length}
                                    {#each [...seasonal.seasons].sort((a,b) => b.seasonNumber - a.seasonNumber) as s}
                                        {@const sLabel = SEASON_NAMES[s.seasonNumber] ?? `S${s.seasonNumber}`}
                                        <button onclick={() => seasonFilter = s.season}
                                                class="flex-shrink-0 px-4 py-1.5 text-xs font-medium
                                                       transition-all border rounded relative overflow-hidden
                                                       {seasonFilter === s.season
                                                           ? 'text-emerald-400 bg-emerald-500/5 border-emerald-500/40'
                                                           : 'text-zinc-500 border-zinc-800/50 hover:text-zinc-300 hover:border-zinc-700'}">
                                            {sLabel}
                                            {#if seasonFilter === s.season}
                                                <div class="absolute bottom-0 left-0 w-full h-[2px] bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)]"></div>
                                            {/if}
                                        </button>
                                    {/each}
                                {/if}
                            </div>
                        </div>

                        <!-- ── 4 primary metric cards ───────────────────────── -->
                        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.75rem;">

                            <!-- Win Ratio -->
                            <div style="position:relative;background:rgba(8,8,8,0.98);border:1px solid rgba(255,255,255,0.08);border-top:2px solid rgba(61,174,119,0.35);padding:1rem;overflow:hidden;clip-path:polygon(8px 0%,100% 0%,100% 100%,0% 100%,0% 8px);transition:border-color 0.15s;" class="anim-in"
                                 onmouseenter={e=>e.currentTarget.style.borderColor='rgba(61,174,119,0.40)'}
                                 onmouseleave={e=>e.currentTarget.style.borderColor='rgba(255,255,255,0.08)'}>
                                <span style="font-family:var(--font-family-display);font-size:0.60rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.30);display:block;margin-bottom:0.5rem;">Win Ratio</span>
                                <div style="display:flex;align-items:baseline;justify-content:space-between;gap:0.25rem;">
                                    <span style="font-family:var(--font-family-display);font-size:1.75rem;font-weight:800;line-height:1;color:var(--d2-text-primary);">
                                        {dWinRate != null ? fmtF(dWinRate, 1) + '%' : '—'}
                                    </span>
                                    <span style="font-family:var(--font-family-display);font-size:0.65rem;color:rgba(255,255,255,0.28);text-align:right;flex-shrink:0;line-height:1.4;">{fmt(dWon)}<br/>wins</span>
                                </div>
                            </div>

                            <!-- K/D/A -->
                            <div style="position:relative;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-top:2px solid rgba(61,174,119,0.25);padding:1rem;overflow:hidden;clip-path:polygon(8px 0%,100% 0%,100% 100%,0% 100%,0% 8px);transition:border-color 0.15s;" class="anim-in anim-in-d1"
                                 onmouseenter={e=>e.currentTarget.style.borderColor='rgba(61,174,119,0.35)'}
                                 onmouseleave={e=>e.currentTarget.style.borderColor='rgba(255,255,255,0.08)'}>
                                <span style="font-family:var(--font-family-display);font-size:0.60rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.30);display:block;margin-bottom:0.5rem;">K/D Ratio</span>
                                <div style="display:flex;align-items:baseline;justify-content:space-between;gap:0.25rem;">
                                    <span style="font-family:var(--font-family-display);font-size:1.75rem;font-weight:800;line-height:1;color:var(--d2-text-primary);">
                                        {dKD != null ? fmtF(dKD, 2) : '—'}
                                    </span>
                                    <span style="font-family:var(--font-family-display);font-size:0.65rem;color:rgba(255,255,255,0.28);text-align:right;flex-shrink:0;line-height:1.4;">{fmt(dKills)}<br/>kills</span>
                                </div>
                            </div>

                            <!-- Motes Avg -->
                            <div style="position:relative;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-top:2px solid rgba(61,174,119,0.25);padding:1rem;overflow:hidden;clip-path:polygon(8px 0%,100% 0%,100% 100%,0% 100%,0% 8px);transition:border-color 0.15s;" class="anim-in anim-in-d2"
                                 onmouseenter={e=>e.currentTarget.style.borderColor='rgba(61,174,119,0.35)'}
                                 onmouseleave={e=>e.currentTarget.style.borderColor='rgba(255,255,255,0.08)'}>
                                <span style="font-family:var(--font-family-display);font-size:0.60rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.30);display:block;margin-bottom:0.5rem;">Motes / Match</span>
                                <div style="display:flex;align-items:baseline;justify-content:space-between;gap:0.25rem;">
                                    <span style="font-family:var(--font-family-display);font-size:1.75rem;font-weight:800;line-height:1;color:{motesRank(dAvgMotes)?'var(--gambit-green)':'var(--d2-text-primary)'};">
                                        {dEntered > 0 ? fmtF(dAvgMotes, 1) : '—'}
                                    </span>
                                    {#if motesRank(dAvgMotes)}
                                        <span style="font-family:var(--font-family-display);font-size:0.62rem;font-weight:700;color:var(--gambit-green);border:1px solid rgba(61,174,119,0.35);padding:1px 5px;">{motesRank(dAvgMotes).label}</span>
                                    {:else}
                                        <span style="font-family:var(--font-family-display);font-size:0.65rem;color:rgba(255,255,255,0.28);text-align:right;flex-shrink:0;line-height:1.4;">{fmt(dMotes)}<br/>total</span>
                                    {/if}
                                </div>
                            </div>

                            <!-- Avg Invasions -->
                            <div style="position:relative;background:rgba(206,174,51,0.02);border:1px solid rgba(255,255,255,0.08);border-top:2px solid rgba(206,174,51,0.30);padding:1rem;overflow:hidden;clip-path:polygon(8px 0%,100% 0%,100% 100%,0% 100%,0% 8px);transition:border-color 0.15s;" class="anim-in anim-in-d3"
                                 onmouseenter={e=>e.currentTarget.style.borderColor='rgba(206,174,51,0.30)'}
                                 onmouseleave={e=>e.currentTarget.style.borderColor='rgba(255,255,255,0.08)'}>
                                <span style="font-family:var(--font-family-display);font-size:0.60rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.30);display:block;margin-bottom:0.5rem;">Invasions / Match</span>
                                <div style="display:flex;align-items:center;gap:0.5rem;">
                                    <span style="font-family:var(--font-family-display);font-size:1.75rem;font-weight:800;line-height:1;color:var(--rarity-exotic);">
                                        {dEntered > 0 ? fmtF(dAvgInv, 2) : '—'}
                                    </span>
                                    <div style="flex:1;height:2px;background:rgba(255,255,255,0.06);overflow:hidden;margin-top:4px;">
                                        <div style="height:100%;background:rgba(206,174,51,0.70);transition:width 0.6s;width:{Math.min((dAvgInv / 3) * 100, 100)}%;"></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- ── 3+1 detail cards: Combat / Objectives / Invasion / Extended ── -->
                        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;">

                            <!-- COMBAT -->
                            <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-left:2px solid rgba(61,174,119,0.30);overflow:hidden;" class="anim-in anim-in-d1">
                                <div style="padding:0.625rem 1rem;border-bottom:1px solid rgba(255,255,255,0.07);">
                                    <span style="font-family:var(--font-family-display);font-size:0.62rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--gambit-green);">Combat</span>
                                </div>
                                <div style="padding:0.5rem 1rem;">
                                    {@render DetailRow('Total Kills', fmt(dKills),   kdRank(dKD))}
                                    {@render DetailRow('Precision',
                                        dKills + dDeaths > 0
                                            ? fmtF((dKills / (dKills + dDeaths)) * 100, 1) + '%'
                                            : '—',
                                        null)}
                                    {@render DetailRow('Deaths',  fmt(dDeaths),  null)}
                                    {@render DetailRow('Assists', seasonFilter === 'all' ? fmt(ltAssists) : '—', null)}
                                </div>
                            </div>

                            <!-- OBJECTIVES -->
                            <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-left:2px solid rgba(61,174,119,0.30);overflow:hidden;" class="anim-in anim-in-d2">
                                <div style="padding:0.625rem 1rem;border-bottom:1px solid rgba(255,255,255,0.07);">
                                    <span style="font-family:var(--font-family-display);font-size:0.62rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--gambit-green);">Objectives</span>
                                </div>
                                <div style="padding:0.5rem 1rem;">
                                    {@render DetailRow('Deposited',   fmt(dMotes),         winRateRank(dWinRate))}
                                    {@render DetailRow('Denied',      fmt(dMotesDenied),   null)}
                                    {@render DetailRow('Picked Up',   fmt(dMotesPickedUp), null)}
                                    {@render DetailRow('Lost',        fmt(dMotesLost),     null)}
                                    {@render DetailRow('Matches',     fmt(dEntered),       null)}
                                    {@render DetailRow('Wins',        fmt(dWon),           null)}
                                </div>
                            </div>

                            <!-- INVASION -->
                            <div style="background:rgba(206,174,51,0.02);border:1px solid rgba(255,255,255,0.08);border-left:2px solid rgba(206,174,51,0.30);overflow:hidden;" class="anim-in anim-in-d3">
                                <div style="padding:0.625rem 1rem;border-bottom:1px solid rgba(255,255,255,0.07);">
                                    <span style="font-family:var(--font-family-display);font-size:0.62rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--rarity-exotic);">Invasion</span>
                                </div>
                                <div style="padding:0.5rem 1rem;">
                                    {@render DetailRow('Guardians Killed', fmt(dInvKills),  invRank(dAvgInv))}
                                    {@render DetailRow('Invasions',        fmt(dInvasions), null)}
                                    {@render DetailRow('Stopped',         fmt(dInvDef),    null)}
                                    {@render DetailRow('Per Game',        dEntered > 0 ? fmtF(dAvgInv, 2) : '—', null)}
                                    {@render DetailRow('Efficiency',      dInvasions > 0 ? fmtF(dInvKills / dInvasions, 2) : '—', null)}
                                </div>
                            </div>
                        </div>

                        <!-- ── Extended stats row ──────────────────────────────── -->
                        {#if dPrimevalDmg > 0 || dDuration > 0}
                        <div class="grid grid-cols-3 gap-4">
                            <!-- PRIMEVAL -->
                            <div class="bg-white/[0.02] border border-zinc-800/60 overflow-hidden anim-in transition-all hover:border-zinc-700 rounded-lg">
                                <div class="px-4 py-3 border-b border-zinc-800/40">
                                    <span class="text-xs font-medium text-zinc-500">Primeval</span>
                                </div>
                                <div class="px-4 py-3">
                                    {@render DetailRow('Total Damage', dPrimevalDmg > 0 ? fmt(Math.round(dPrimevalDmg)) : '—', null)}
                                    {@render DetailRow('Per Match', dEntered > 0 && dPrimevalDmg > 0 ? fmt(Math.round(dPrimevalDmg / dEntered)) : '—', null)}
                                </div>
                            </div>
                            <!-- TIME -->
                            <div class="bg-white/[0.02] border border-zinc-800/60 overflow-hidden anim-in anim-in-d1 transition-all hover:border-zinc-700 rounded-lg">
                                <div class="px-4 py-3 border-b border-zinc-800/40">
                                    <span class="text-xs font-medium text-zinc-500">Time Played</span>
                                </div>
                                <div class="px-4 py-3">
                                    {@render DetailRow('Total Hours', dDuration > 0 ? fmtF(dDuration / 3600, 1) + 'h' : '—', null)}
                                    {@render DetailRow('Avg Match', dEntered > 0 && dDuration > 0 ? Math.round(dDuration / dEntered / 60) + 'm' : '—', null)}
                                </div>
                            </div>
                            <!-- EFFICIENCY -->
                            <div class="bg-white/[0.02] border border-zinc-800/60 overflow-hidden anim-in anim-in-d2 transition-all hover:border-zinc-700 rounded-lg">
                                <div class="px-4 py-3 border-b border-zinc-800/40">
                                    <span class="text-xs font-medium text-zinc-500">Efficiency</span>
                                </div>
                                <div class="px-4 py-3">
                                    {@render DetailRow('Net Motes', dMotes > 0 ? fmt(dMotes - dMotesLost) : '—', null)}
                                    {@render DetailRow('Mote Eff.', (dMotes + dMotesLost) > 0 ? fmtF((dMotes / (dMotes + dMotesLost)) * 100, 1) + '%' : '—', null)}
                                    {@render DetailRow('Inv. Eff.', dInvasions > 0 ? fmtF((dInvKills / dInvasions), 2) + ' k/inv' : '—', null)}
                                </div>
                            </div>
                        </div>
                        {/if}

                        <!-- ── Guardian build snapshot ──────────────────────────── -->
                        {#if loadout && (playerData.loadout.weapons[0].name !== '—' || playerData.loadout.stats.Mobility > 0)}
                            <div class="grid grid-cols-2 gap-4">
                                <!-- Armor stats -->
                                {#if playerData.loadout.stats.Mobility > 0}
                                <div class="relative bg-zinc-950 border border-zinc-800 overflow-hidden hover:border-zinc-700 transition-colors">
                                    <span class="absolute top-0 left-0 w-3 h-3 border-t border-l border-emerald-500/25 pointer-events-none"></span>
                                    <span class="absolute top-0 right-0 w-3 h-3 border-t border-r border-emerald-500/25 pointer-events-none"></span>
                                    <div class="px-4 py-2.5 border-b border-zinc-800/60">
                                        <span style="font-family:var(--font-family-display);font-size:0.60rem;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:rgba(255,255,255,0.30);">Character Stats</span>
                                    </div>
                                    <div class="px-4 py-3">
                                        {#each Object.entries(playerData.loadout.stats) as [stat, base]}
                                            {@render fateStatRow(stat, base, playerData.loadout.bonuses[stat] ?? 0)}
                                        {/each}
                                    </div>
                                </div>
                                {/if}
                                <!-- Current weapons -->
                                {#if playerData.loadout.weapons[0].name !== '—'}
                                <div class="relative bg-zinc-950 border border-zinc-800 overflow-hidden hover:border-zinc-700 transition-colors">
                                    <span class="absolute top-0 left-0 w-3 h-3 border-t border-l border-emerald-500/25 pointer-events-none"></span>
                                    <span class="absolute top-0 right-0 w-3 h-3 border-t border-r border-emerald-500/25 pointer-events-none"></span>
                                    <div class="px-4 py-2.5 border-b border-zinc-800/60">
                                        <span style="font-family:var(--font-family-display);font-size:0.60rem;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:rgba(255,255,255,0.30);">Active Weapons</span>
                                    </div>
                                    {#each playerData.loadout.weapons as w}
                                        {@render jadestoneSlot(w)}
                                    {/each}
                                    <div class="px-4 py-2.5 border-t border-zinc-800/60 mt-px">
                                        <span style="font-family:var(--font-family-display);font-size:0.60rem;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:rgba(255,255,255,0.18);">Armor</span>
                                    </div>
                                    {#each playerData.loadout.armor as a}
                                        {@render jadestoneSlot(a)}
                                    {/each}
                                </div>
                                {/if}
                            </div>
                        {/if}

                        <!-- Recent matches preview -->
                        {#if data.recentMatches.length}
                            <div>
                                <div class="flex items-center gap-3 mb-3">
                                    <div class="h-px flex-1 bg-gradient-to-r from-transparent to-zinc-800/80"></div>
                                    <span style="font-family:var(--font-family-display);font-size:0.60rem;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.30);">Recent Matches</span>
                                    <div class="h-px flex-1 bg-gradient-to-l from-transparent to-zinc-800/80"></div>
                                    <button onclick={() => tab = 'matches'}
                                        class="text-[10px] font-semibold text-emerald-500 hover:text-emerald-400 transition-colors ml-1"
                                        style="font-family:var(--font-family-display);letter-spacing:0.08em;">
                                        ALL →
                                    </button>
                                </div>
                                <div class="border border-zinc-800 bg-white/[0.02] divide-y divide-zinc-800/50 rounded-lg overflow-hidden">
                                    {#each data.recentMatches.slice(0, 5) as match}
                                        {@const result     = matchResult(match)}
                                        {@const instanceId = match.activityDetails?.instanceId}
                                        {@const mb         = match.extended?.values?.motesDeposited?.basic?.value ?? null}
                                        {@const inv        = match.extended?.values?.invasions?.basic?.value      ?? null}
                                        <a href={instanceId ? `/match/${instanceId}` : undefined}
                                           class="flex items-center gap-4 px-4 py-3 hover:bg-zinc-900/40 transition-colors group">
                                            <span class="text-xs font-bold w-8 text-center py-1 border shrink-0
                                                         {result === 'win'  ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/5' :
                                                          result === 'loss' ? 'border-red-500/40 text-red-400 bg-red-500/5'            :
                                                                              'border-zinc-700 text-zinc-500'}">
                                                {result === 'win' ? 'W' : result === 'loss' ? 'L' : 'DNF'}
                                            </span>
                                            <span class="text-xs text-zinc-500 w-14 shrink-0">{timeAgo(match.period)}</span>
                                            <span class="text-sm text-zinc-300 flex-1">
                                                {match.values?.kills?.basic?.value ?? 0}K ·
                                                {match.values?.deaths?.basic?.value ?? 0}D ·
                                                {match.values?.assists?.basic?.value ?? 0}A
                                            </span>
                                            {#if mb !== null}
                                                <span class="text-[10px] font-sans shrink-0 {mb >= 15 ? 'text-emerald-400' : 'text-zinc-600'}">{mb} MB</span>
                                            {/if}
                                            {#if inv !== null && inv > 0}
                                                <span class="text-[10px] font-sans text-violet-400 shrink-0 hidden sm:block">{inv} INV</span>
                                            {/if}
                                            <svg class="w-3 h-3 text-zinc-700 group-hover:text-emerald-500 transition-colors shrink-0"
                                                 fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                                            </svg>
                                        </a>
                                    {/each}
                                </div>
                            </div>
                        {/if}

                    </div>
                {/if}

            <!-- ══ MATCHES ══════════════════════════════════════════════════════ -->
            {:else if tab === 'matches'}
                <div class="p-6">
                    <div class="flex items-center gap-3 mb-4">
                        <div class="h-px flex-1 bg-gradient-to-r from-transparent to-zinc-800/80"></div>
                        <span style="font-family:var(--font-family-display);font-size:0.60rem;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.30);">Match History</span>
                        <div class="h-px flex-1 bg-gradient-to-l from-transparent to-zinc-800/80"></div>
                        {#if history}
                            <span class="text-[9px] text-zinc-600 font-light ml-1">
                                {filteredMatches.length.toLocaleString()} matches{#if stackFilter !== 0 && stackFilter !== 'favs'} (filtered){/if}
                            </span>
                        {:else}
                            <span class="text-[9px] text-zinc-600 font-light ml-1">{data.recentMatches.length} recent</span>
                        {/if}
                    </div>

                    <!-- Loading skeleton -->
                    {#if historyLoading}
                        <div class="space-y-1">
                            {#each Array(15) as _}
                                <div class="h-11 bg-zinc-900/50 border border-zinc-800/30 animate-pulse"></div>
                            {/each}
                        </div>

                    <!-- Full history (from /api/history) -->
                    {:else if filteredMatches.length > 0}
                        <div class="border border-zinc-800 bg-white/[0.02] divide-y divide-zinc-800/50 overflow-hidden">
                            {#each filteredMatches as m}
                                {@const result = m.win ? 'win' : m.loss ? 'loss' : 'dnf'}
                                {@const ego    = m.ego?.finalScore}
                                <a href={m.instanceId ? `/match/${m.instanceId}` : undefined}
                                   class="flex items-center gap-3 px-4 py-3 hover:bg-zinc-900/40 transition-colors group border-l-2
                                          {result === 'win' ? 'border-l-emerald-500' : result === 'loss' ? 'border-l-red-500' : 'border-l-zinc-800'}">
                                    <!-- Result badge -->
                                    <span class="text-xs font-bold w-8 text-center py-1 border shrink-0
                                                 {result === 'win'  ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/5' :
                                                  result === 'loss' ? 'border-red-500/40     text-red-400     bg-red-500/5'    :
                                                                      'border-zinc-700        text-zinc-500'}">
                                        {result === 'win' ? 'W' : result === 'loss' ? 'L' : 'DNF'}
                                    </span>
                                    <!-- Date -->
                                    <span class="text-xs text-zinc-500 w-14 shrink-0">{m.period ? timeAgo(m.period) : '—'}</span>
                                    <!-- Map name -->
                                    <span class="text-[10px] text-zinc-600 w-24 shrink-0 truncate hidden md:block">{m.mapName ?? ''}</span>
                                    <!-- K/D/A -->
                                    <div class="flex items-center gap-1 text-[11px] font-mono flex-1">
                                        <span class="text-zinc-200">{m.k}</span>
                                        <span class="text-zinc-700">/</span>
                                        <span class="text-zinc-400">{m.d}</span>
                                        <span class="text-zinc-700">/</span>
                                        <span class="text-zinc-500">{m.a}</span>
                                        <span class="text-[7px] font-sans text-zinc-700 ml-1">K/D/A</span>
                                    </div>
                                    <!-- Motes deposited -->
                                    {#if m.motesDeposited > 0}
                                        <span class="text-[10px] font-sans shrink-0 hidden sm:block
                                                     {m.motesDeposited >= 15 ? 'text-emerald-400' : 'text-zinc-600'}">
                                            {m.motesDeposited} MB
                                        </span>
                                    {/if}
                                    <!-- Invasions -->
                                    {#if m.invasions > 0}
                                        <span class="text-[10px] font-sans text-violet-400 shrink-0 hidden sm:block">{m.invasions} INV</span>
                                    {/if}
                                    <!-- EGO score -->
                                    {#if ego != null}
                                        <span class="text-[10px] font-mono shrink-0 hidden lg:block {egoColor(ego)}">{ego}</span>
                                    {/if}
                                    <!-- Carry / Carried badge -->
                                    {#if m.is_hard_carry}
                                        <span class="text-[8px] font-bold text-amber-400 border border-amber-500/30 px-1 shrink-0 hidden xl:block">CARRY</span>
                                    {:else if m.is_carried}
                                        <span class="text-[8px] font-bold text-zinc-600 border border-zinc-800 px-1 shrink-0 hidden xl:block">carried</span>
                                    {/if}
                                    <!-- Stack size -->
                                    {#if (m.fireteam_size ?? 1) > 1}
                                        <span class="text-[8px] text-zinc-700 shrink-0 hidden xl:block">ft{m.fireteam_size}</span>
                                    {/if}
                                    <!-- Duration -->
                                    {#if m.duration}
                                        <span class="text-[10px] font-sans text-zinc-700 hidden lg:block shrink-0">
                                            {fmtDuration(m.duration)}
                                        </span>
                                    {/if}
                                    <!-- Arrow -->
                                    <svg class="w-3 h-3 text-zinc-700 group-hover:text-emerald-500 transition-colors shrink-0"
                                         fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                                    </svg>
                                </a>
                            {/each}
                        </div>

                    <!-- Fallback: recent matches from server (before history loads) -->
                    {:else if data.recentMatches.length > 0}
                        <div class="border border-zinc-800 bg-white/[0.02] divide-y divide-zinc-800/50 overflow-hidden">
                            {#each data.recentMatches as match}
                                {@const result     = matchResult(match)}
                                {@const k          = match.values?.kills?.basic?.value                    ?? 0}
                                {@const d          = match.values?.deaths?.basic?.value                   ?? 0}
                                {@const a          = match.values?.assists?.basic?.value                  ?? 0}
                                {@const dur        = match.values?.activityDurationSeconds?.basic?.value  ?? 0}
                                {@const mb         = match.extended?.values?.motesDeposited?.basic?.value ?? null}
                                {@const inv        = match.extended?.values?.invasions?.basic?.value      ?? null}
                                {@const instanceId = match.activityDetails?.instanceId}
                                <a href={instanceId ? `/match/${instanceId}` : undefined}
                                   class="flex items-center gap-3 px-4 py-3 hover:bg-zinc-900/40 transition-colors group border-l-2
                                          {result === 'win'  ? 'border-l-emerald-500' :
                                           result === 'loss' ? 'border-l-red-500'     : 'border-l-zinc-800'}">
                                    <span class="text-xs font-bold w-8 text-center py-1 border shrink-0
                                                 {result === 'win'  ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/5' :
                                                  result === 'loss' ? 'border-red-500/40     text-red-400     bg-red-500/5'    :
                                                                      'border-zinc-700        text-zinc-500'}">
                                        {result === 'win' ? 'W' : result === 'loss' ? 'L' : 'DNF'}
                                    </span>
                                    <span class="text-xs text-zinc-500 w-14 shrink-0">{timeAgo(match.period)}</span>
                                    <div class="flex items-center gap-1 text-[11px] font-mono flex-1">
                                        <span class="text-zinc-200">{k}</span>
                                        <span class="text-zinc-700">/</span>
                                        <span class="text-zinc-400">{d}</span>
                                        <span class="text-zinc-700">/</span>
                                        <span class="text-zinc-500">{a}</span>
                                        <span class="text-[7px] font-sans text-zinc-700 ml-1">K/D/A</span>
                                    </div>
                                    {#if mb !== null}
                                        <span class="text-[10px] font-sans shrink-0 hidden sm:block
                                                     {mb >= 15 ? 'text-emerald-400' : 'text-zinc-600'}">{mb} MB</span>
                                    {/if}
                                    {#if inv !== null && inv > 0}
                                        <span class="text-[10px] font-sans text-violet-400 shrink-0 hidden sm:block">{inv} INV</span>
                                    {/if}
                                    {#if dur}
                                        <span class="text-[10px] font-sans text-zinc-700 hidden lg:block shrink-0">
                                            {Math.floor(dur/60)}m {dur%60}s
                                        </span>
                                    {/if}
                                    <svg class="w-3 h-3 text-zinc-700 group-hover:text-emerald-500 transition-colors shrink-0"
                                         fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                                    </svg>
                                </a>
                            {/each}
                        </div>

                    {:else}
                        <div class="flex flex-col items-center justify-center h-40 gap-3">
                            <div class="w-6 h-6 border border-zinc-700 rotate-45"></div>
                            <span class="text-xs font-medium text-zinc-600">No Gambit matches found.</span>
                        </div>
                    {/if}
                </div>

            <!-- ══ WEAPONRY ═════════════════════════════════════════════════════ -->
            {:else if tab === 'weaponry'}
                {#if careerLoading}
                    <div class="flex flex-col items-center justify-center h-64 gap-3">
                        <div class="w-5 h-5 border border-zinc-700 border-t-emerald-400 animate-spin"></div>
                        <span class="text-xs font-medium text-zinc-600">Analyzing {50} recent matches…</span>
                    </div>
                {:else if careerError}
                    <div class="flex items-center justify-center h-64">
                        <span class="text-sm text-red-400">{careerError}</span>
                    </div>
                {:else if !career?.weapons?.length}
                    <div class="flex flex-col items-center justify-center h-64 gap-3">
                        <div class="w-6 h-6 border border-zinc-700 rotate-45"></div>
                        <span class="text-xs font-medium text-zinc-600">No weapon data found in recent matches.</span>
                    </div>
                {:else}
                    <div class="p-6 space-y-5">
                        <!-- Summary strip -->
                        <div class="grid grid-cols-4 gap-3">
                            {#each [
                                { label: 'Matches Analyzed', value: fmt(career.matchesAnalyzed) },
                                { label: 'Win Rate',         value: career.winRate != null ? fmtF(career.winRate, 1) + '%' : '—' },
                                { label: 'Hard Carries',     value: fmt(career.carries) },
                                { label: 'Carried',          value: fmt(career.carried) },
                            ] as card}
                                <div class="bg-white/[0.03] border border-zinc-800 p-4 relative overflow-hidden">
                                    <span class="absolute top-0 left-0 w-2 h-2 border-t border-l border-emerald-500/20"></span>
                                    <span class="text-xs font-medium text-zinc-500 block mb-2">{card.label}</span>
                                    <span class="text-2xl font-mono font-bold text-zinc-100">{card.value}</span>
                                </div>
                            {/each}
                        </div>

                        <!-- Weapon table -->
                        <div>
                            {@render engravedHeader('Top Weapons', `· Last ${career.matchesAnalyzed} Matches`)}
                            <div class="border border-zinc-800 overflow-hidden">
                                <!-- Header -->
                                <div class="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-0 bg-zinc-900/60 px-4 py-2 border-b border-zinc-800">
                                    {#each ['Weapon', 'Kills', 'Precision %', 'Matches', 'Win Rate'] as col}
                                        <span class="text-[9px] font-medium text-zinc-600 uppercase tracking-wider {col === 'Weapon' ? '' : 'text-center'}">{col}</span>
                                    {/each}
                                </div>
                                <!-- Rows -->
                                {#each career.weapons as w, i}
                                    {@const maxKills = career.weapons[0]?.kills ?? 1}
                                    <div class="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-0 px-4 py-3
                                                border-b border-zinc-800/40 last:border-0
                                                hover:bg-zinc-900/30 transition-colors relative group">
                                        <!-- Kill bar -->
                                        <div class="absolute left-0 bottom-0 h-[2px] bg-emerald-500/20 transition-all"
                                             style="width:{(w.kills/maxKills)*100}%"></div>
                                        <!-- Rank + icon + name -->
                                        <div class="flex items-center gap-3 min-w-0">
                                            <span class="text-[10px] font-mono text-zinc-700 w-4 shrink-0">{i + 1}</span>
                                            {#if w.icon}
                                                <img src={w.icon} alt="" class="w-8 h-8 shrink-0 object-cover" />
                                            {:else}
                                                <div class="w-8 h-8 bg-zinc-800 shrink-0 flex items-center justify-center">
                                                    <div class="w-3 h-3 border border-zinc-600 rotate-45"></div>
                                                </div>
                                            {/if}
                                            <span class="text-sm font-medium text-zinc-200 truncate">{w.name}</span>
                                        </div>
                                        <!-- Kills -->
                                        <div class="flex items-center justify-center">
                                            <span class="text-sm font-mono font-bold {i === 0 ? 'text-emerald-400' : 'text-zinc-200'}">{fmt(w.kills)}</span>
                                        </div>
                                        <!-- Precision % -->
                                        <div class="flex items-center justify-center">
                                            <span class="text-sm font-mono {w.precRate >= 50 ? 'text-amber-400' : 'text-zinc-400'}">{fmtF(w.precRate, 1)}%</span>
                                        </div>
                                        <!-- Matches -->
                                        <div class="flex items-center justify-center">
                                            <span class="text-xs font-mono text-zinc-500">{w.games}</span>
                                        </div>
                                        <!-- Win rate -->
                                        <div class="flex items-center justify-center">
                                            <span class="text-sm font-mono {w.winRate >= 60 ? 'text-emerald-400' : w.winRate >= 50 ? 'text-zinc-300' : 'text-red-400'}">{fmtF(w.winRate, 1)}%</span>
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        </div>
                    </div>
                {/if}

            <!-- ══ MAPS ══════════════════════════════════════════════════════════ -->
            {:else if tab === 'maps'}
                {#if careerLoading}
                    <div class="flex flex-col items-center justify-center h-64 gap-3">
                        <div class="w-5 h-5 border border-zinc-700 border-t-emerald-400 animate-spin"></div>
                        <span class="text-xs font-medium text-zinc-600">Loading map stats…</span>
                    </div>
                {:else if careerError}
                    <div class="flex items-center justify-center h-64">
                        <span class="text-sm text-red-400">{careerError}</span>
                    </div>
                {:else if !career?.maps?.length}
                    <div class="flex flex-col items-center justify-center h-64 gap-3">
                        <div class="w-6 h-6 border border-zinc-700 rotate-45"></div>
                        <span class="text-xs font-medium text-zinc-600">No map data found.</span>
                    </div>
                {:else}
                    <div class="p-6 space-y-5">
                        {@render engravedHeader('Map Performance', `· Last ${career.matchesAnalyzed} Matches`)}

                        <!-- Win rate bar chart -->
                        <div class="space-y-2">
                            {#each career.maps as m}
                                {@const wr = m.winRate}
                                <div class="border border-zinc-800 relative overflow-hidden hover:border-zinc-700 transition-colors group">
                                    <!-- Map background image -->
                                    {#if m.map_image}
                                        <div class="absolute inset-0 bg-cover bg-center opacity-15 group-hover:opacity-25 transition-opacity"
                                             style="background-image:url('{m.map_image}')"></div>
                                    {/if}
                                    <!-- Background win-rate bar -->
                                    <div class="absolute inset-y-0 left-0 transition-all duration-500"
                                         style="width:{wr}%; background: {wr >= 60 ? 'rgba(16,185,129,0.06)' : wr >= 45 ? 'rgba(255,255,255,0.02)' : 'rgba(239,68,68,0.04)'}"></div>
                                    <div class="relative flex items-center gap-6 px-4 py-3">
                                        <!-- Map name -->
                                        <span class="text-sm font-medium text-zinc-200 w-48 shrink-0 truncate">{m.name}</span>
                                        <!-- Win rate bar -->
                                        <div class="flex-1 h-1.5 bg-zinc-800 relative overflow-hidden">
                                            <div class="h-full transition-all duration-500
                                                         {wr >= 60 ? 'bg-emerald-500' : wr >= 45 ? 'bg-zinc-500' : 'bg-red-500'}"
                                                 style="width:{wr}%"></div>
                                        </div>
                                        <!-- Stats -->
                                        <div class="flex items-center gap-6 shrink-0">
                                            <div class="text-right">
                                                <span class="text-lg font-mono font-bold {wr >= 60 ? 'text-emerald-400' : wr >= 45 ? 'text-zinc-200' : 'text-red-400'}">
                                                    {fmtF(wr, 1)}%
                                                </span>
                                                <span class="text-[9px] text-zinc-600 block">win rate</span>
                                            </div>
                                            <div class="text-right w-16">
                                                <span class="text-sm font-mono text-zinc-300">{m.games}</span>
                                                <span class="text-[9px] text-zinc-600 block">matches</span>
                                            </div>
                                            <div class="text-right w-12">
                                                <span class="text-xs font-mono text-emerald-400">{m.wins}W</span>
                                                <span class="text-xs font-mono text-zinc-600"> / </span>
                                                <span class="text-xs font-mono text-red-400">{m.losses}L</span>
                                            </div>
                                            <div class="text-right w-16">
                                                <span class="text-sm font-mono {m.kd >= 1.5 ? 'text-emerald-400' : m.kd >= 1.0 ? 'text-zinc-300' : 'text-zinc-500'}">{fmtF(m.kd, 2)}</span>
                                                <span class="text-[9px] text-zinc-600 block">K/D</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            {/each}
                        </div>

                        <!-- Best/worst map callout -->
                        {#if career.maps.length >= 2}
                            {@const sorted = [...career.maps].filter(m => m.games >= 3).sort((a,b) => b.winRate - a.winRate)}
                            {#if sorted.length >= 2}
                                <div class="grid grid-cols-2 gap-4">
                                    <div class="bg-emerald-500/5 border border-emerald-500/20 p-4">
                                        <span class="text-[9px] font-medium text-emerald-500 uppercase tracking-wider block mb-1">Best Map</span>
                                        <span class="text-base font-semibold text-zinc-200">{sorted[0].name}</span>
                                        <span class="text-2xl font-mono font-bold text-emerald-400 block">{fmtF(sorted[0].winRate, 1)}%</span>
                                        <span class="text-xs text-zinc-600">{sorted[0].games} matches played</span>
                                    </div>
                                    <div class="bg-red-500/5 border border-red-500/20 p-4">
                                        <span class="text-[9px] font-medium text-red-500 uppercase tracking-wider block mb-1">Worst Map</span>
                                        <span class="text-base font-semibold text-zinc-200">{sorted[sorted.length-1].name}</span>
                                        <span class="text-2xl font-mono font-bold text-red-400 block">{fmtF(sorted[sorted.length-1].winRate, 1)}%</span>
                                        <span class="text-xs text-zinc-600">{sorted[sorted.length-1].games} matches played</span>
                                    </div>
                                </div>
                            {/if}
                        {/if}
                    </div>
                {/if}

            <!-- ══ SYNERGY ════════════════════════════════════════════════════════ -->
            {:else if tab === 'synergy'}
                {#if careerLoading}
                    <div class="flex flex-col items-center justify-center h-64 gap-3">
                        <div class="w-5 h-5 border border-zinc-700 border-t-emerald-400 animate-spin"></div>
                        <span class="text-xs font-medium text-zinc-600">Scanning rosters…</span>
                    </div>
                {:else if careerError}
                    <div class="flex items-center justify-center h-64">
                        <span class="text-sm text-red-400">{careerError}</span>
                    </div>
                {:else if !career}
                    <div class="flex flex-col items-center justify-center h-64 gap-3">
                        <div class="w-6 h-6 border border-zinc-700 rotate-45"></div>
                        <span class="text-xs font-medium text-zinc-600">No synergy data available.</span>
                    </div>
                {:else}
                    <div class="p-6 space-y-6">
                        <div class="grid grid-cols-2 gap-6">

                            <!-- Best Allies -->
                            <div>
                                {@render engravedHeader('Best Allies', '· seen as teammate')}
                                {#if !career.allies?.length}
                                    <p class="text-xs text-zinc-600 italic">Not enough repeated teammate encounters yet.</p>
                                {:else}
                                    <div class="space-y-2">
                                        {#each career.allies as p, i}
                                            <a href="/profile/{p.name.split('#')[0]}/{p.name.split('#')[1] ?? '0'}"
                                               class="flex items-center gap-3 px-3 py-2.5 bg-white/[0.02] border border-zinc-800
                                                      hover:border-emerald-500/30 hover:bg-emerald-500/3 transition-colors group">
                                                <!-- Rank -->
                                                <span class="text-[10px] font-mono text-zinc-700 w-4 shrink-0">{i + 1}</span>
                                                <!-- Avatar placeholder -->
                                                <div class="w-7 h-7 bg-zinc-900 border border-zinc-700 flex items-center justify-center shrink-0 text-[9px] font-bold text-zinc-500 group-hover:border-emerald-500/40 transition-colors">
                                                    {(p.name ?? '??').slice(0, 2).toUpperCase()}
                                                </div>
                                                <!-- Name -->
                                                <div class="flex-1 min-w-0">
                                                    <span class="text-sm font-medium text-zinc-300 group-hover:text-white truncate block transition-colors">{p.name}</span>
                                                    <span class="text-[9px] text-zinc-600">{p.as_ally} matches together · {fmtF(p.winRate, 0)}% WR</span>
                                                </div>
                                                <!-- Win rate badge -->
                                                <span class="text-xs font-mono shrink-0
                                                             {p.winRate >= 60 ? 'text-emerald-400' : p.winRate >= 50 ? 'text-zinc-300' : 'text-zinc-500'}">
                                                    {fmtF(p.winRate, 1)}%
                                                </span>
                                            </a>
                                        {/each}
                                    </div>
                                {/if}
                            </div>

                            <!-- Rivals -->
                            <div>
                                {@render engravedHeader('Frequent Rivals', '· seen as enemy')}
                                {#if !career.rivals?.length}
                                    <p class="text-xs text-zinc-600 italic">Not enough repeated enemy encounters yet.</p>
                                {:else}
                                    <div class="space-y-2">
                                        {#each career.rivals as p, i}
                                            <a href="/profile/{p.name.split('#')[0]}/{p.name.split('#')[1] ?? '0'}"
                                               class="flex items-center gap-3 px-3 py-2.5 bg-white/[0.02] border border-zinc-800
                                                      hover:border-red-500/20 hover:bg-red-500/3 transition-colors group">
                                                <!-- Rank -->
                                                <span class="text-[10px] font-mono text-zinc-700 w-4 shrink-0">{i + 1}</span>
                                                <!-- Avatar placeholder -->
                                                <div class="w-7 h-7 bg-zinc-900 border border-zinc-700 flex items-center justify-center shrink-0 text-[9px] font-bold text-zinc-500 group-hover:border-red-500/30 transition-colors">
                                                    {(p.name ?? '??').slice(0, 2).toUpperCase()}
                                                </div>
                                                <!-- Name -->
                                                <div class="flex-1 min-w-0">
                                                    <span class="text-sm font-medium text-zinc-300 group-hover:text-white truncate block transition-colors">{p.name}</span>
                                                    <span class="text-[9px] text-zinc-600">{p.as_enemy} enemy encounters · {fmtF(p.winRate, 0)}% WR when meeting</span>
                                                </div>
                                                <!-- WR with this rival -->
                                                <span class="text-xs font-mono shrink-0
                                                             {p.winRate >= 60 ? 'text-emerald-400' : p.winRate >= 50 ? 'text-zinc-300' : 'text-red-400'}">
                                                    {fmtF(p.winRate, 1)}%
                                                </span>
                                            </a>
                                        {/each}
                                    </div>
                                {/if}
                            </div>

                        </div>

                        <!-- Note about data freshness -->
                        <p class="text-[9px] text-zinc-700 text-center">
                            Based on last {career.matchesAnalyzed} analyzed matches. Players listed twice or more.
                        </p>
                    </div>
                {/if}

            <!-- ══ TROPHIES ═══════════════════════════════════════════════════ -->
            {:else if tab === 'trophies'}
                {#if careerLoading}
                    <div class="flex flex-col items-center justify-center h-64 gap-3">
                        <div class="w-5 h-5 border border-zinc-700 border-t-emerald-400 animate-spin"></div>
                        <span class="text-xs font-medium text-zinc-600">Loading medal data…</span>
                    </div>
                {:else if careerError}
                    <div class="flex items-center justify-center h-64">
                        <span class="text-sm text-red-400">{careerError}</span>
                    </div>
                {:else if !career}
                    <div class="flex flex-col items-center justify-center h-64 gap-3">
                        <div class="w-6 h-6 border border-zinc-700 rotate-45"></div>
                        <span class="text-xs font-medium text-zinc-600">No trophy data yet — play more Gambit.</span>
                    </div>
                {:else}
                    <div class="p-6 space-y-6">
                        <!-- Playstyle card -->
                        {#if career.playstyle}
                            {@const ps = career.playstyle}
                            {@const pc = PLAYSTYLE_COLORS[ps.dominant] ?? { bar: 'bg-emerald-500', text: 'text-emerald-400' }}
                            <div class="border border-zinc-800 bg-white/[0.02] p-5">
                                <div class="flex items-center gap-4 mb-4">
                                    <div class="w-1 h-4 {pc.bar}"></div>
                                    <span class="text-xs font-medium text-zinc-500">Playstyle Analysis</span>
                                    <span class="ml-auto text-xs font-bold {pc.text} tracking-widest uppercase">{ps.dominant}</span>
                                </div>
                                <div class="space-y-2">
                                    {#each (ps.breakdown ?? []) as s}
                                        {@const roleColor = PLAYSTYLE_COLORS[s.label] ?? { bar: 'bg-zinc-600', text: 'text-zinc-400' }}
                                        <div class="flex items-center gap-3">
                                            <span class="text-[10px] text-zinc-500 w-20 shrink-0 uppercase tracking-wider">{s.label}</span>
                                            <div class="flex-1 h-1.5 bg-zinc-900 overflow-hidden">
                                                <div class="h-full {roleColor.bar} transition-all duration-700" style="width:{s.pct}%"></div>
                                            </div>
                                            <span class="text-[10px] font-mono {roleColor.text} w-10 text-right shrink-0">{s.pct}%</span>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/if}

                        <!-- Peak hours -->
                        {#if career.hourlyStats?.length}
                            <div class="border border-zinc-800 bg-white/[0.02] p-5">
                                {@render engravedHeader('Performance by Hour (UTC)', '')}
                                <!-- Bar chart of avg EGO by hour -->
                                <div class="flex items-end gap-0.5 h-16">
                                    {#each career.hourlyStats as h}
                                        {@const maxScore = Math.max(...career.hourlyStats.map(x => x.avgScore ?? 0))}
                                        {@const pct = maxScore > 0 ? ((h.avgScore ?? 0) / maxScore) * 100 : 0}
                                        <div class="flex-1 flex flex-col items-center gap-0.5" title="{h.hour}:00 UTC — {h.games}g · {h.avgScore} avg EGO · {h.winRate}% WR">
                                            <div class="w-full {pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-emerald-700' : 'bg-zinc-700'} transition-all"
                                                 style="height:{Math.max(pct, 4)}%"></div>
                                        </div>
                                    {/each}
                                </div>
                                <!-- Hour labels (every 6 h) -->
                                <div class="flex mt-1">
                                    {#each career.hourlyStats as h}
                                        <div class="flex-1 text-center text-[8px] text-zinc-700">
                                            {h.hour % 6 === 0 ? h.hour : ''}
                                        </div>
                                    {/each}
                                </div>
                            </div>
                            <!-- Peak/valley callout — outside the div so @const is valid -->
                            {#each [career.hourlyStats.filter(h => h.games >= 3)] as qualified}
                                {@const peakHour   = [...qualified].sort((a,b) => (b.avgScore??0) - (a.avgScore??0))[0]}
                                {@const valleyHour = [...qualified].sort((a,b) => (a.avgScore??0) - (b.avgScore??0))[0]}
                                {#if peakHour}
                                    <div class="flex gap-4 mt-3">
                                        <div class="flex-1 bg-emerald-500/5 border border-emerald-500/20 px-3 py-2">
                                            <span class="text-[9px] text-emerald-500 uppercase tracking-wider block">Peak Hour</span>
                                            <span class="text-sm font-mono font-bold text-emerald-400">{peakHour.hour}:00 UTC</span>
                                            <span class="text-[9px] text-zinc-600 block">{peakHour.games}g · {peakHour.avgScore} avg EGO · {peakHour.winRate}% WR</span>
                                        </div>
                                        {#if valleyHour && valleyHour.hour !== peakHour.hour}
                                            <div class="flex-1 bg-red-500/5 border border-red-500/20 px-3 py-2">
                                                <span class="text-[9px] text-red-500 uppercase tracking-wider block">Worst Hour</span>
                                                <span class="text-sm font-mono font-bold text-red-400">{valleyHour.hour}:00 UTC</span>
                                                <span class="text-[9px] text-zinc-600 block">{valleyHour.games}g · {valleyHour.avgScore} avg EGO · {valleyHour.winRate}% WR</span>
                                            </div>
                                        {/if}
                                    </div>
                                {/if}
                            {/each}
                        {/if}

                        <!-- Medal Wall -->
                        <div>
                            {@render engravedHeader('Medal Wall', `· Last ${career.matchesAnalyzed} Matches`)}
                            {#if !career.medals?.length}
                                <div class="text-xs text-zinc-600 italic text-center py-8">
                                    No medal data found. Load more match history to populate.
                                </div>
                            {:else}
                                <div class="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                                    {#each career.medals as { key: medal, count }}
                                        {@render medalBadge(medal, count)}
                                    {/each}
                                </div>
                            {/if}
                        </div>

                        <!-- Carry stats -->
                        <div>
                            {@render engravedHeader('Performance Summary', '')}
                            <div class="grid grid-cols-3 gap-4">
                                <div class="relative bg-zinc-950 border border-amber-500/25 p-4 text-center overflow-hidden">
                                    <span class="absolute top-0 left-0 w-3 h-3 border-t border-l border-amber-500/40 pointer-events-none"></span>
                                    <span class="absolute top-0 right-0 w-3 h-3 border-t border-r border-amber-500/40 pointer-events-none"></span>
                                    <span class="text-[9px] font-semibold text-amber-500 uppercase tracking-wider block mb-2" style="font-family:var(--font-family-display);">Hard Carries</span>
                                    <span class="text-3xl font-mono font-bold text-amber-400">{career.carries ?? 0}</span>
                                    <span class="text-[9px] text-zinc-600 block mt-1">
                                        {career.matchesAnalyzed > 0 ? fmtF((career.carries / career.matchesAnalyzed) * 100, 1) : '0.0'}% of matches
                                    </span>
                                </div>
                                <div class="relative bg-zinc-950 border border-red-500/25 p-4 text-center overflow-hidden">
                                    <span class="absolute top-0 left-0 w-3 h-3 border-t border-l border-red-500/40 pointer-events-none"></span>
                                    <span class="absolute top-0 right-0 w-3 h-3 border-t border-r border-red-500/40 pointer-events-none"></span>
                                    <span class="text-[9px] font-semibold text-red-500 uppercase tracking-wider block mb-2" style="font-family:var(--font-family-display);">Carried</span>
                                    <span class="text-3xl font-mono font-bold text-red-400">{career.carried ?? 0}</span>
                                    <span class="text-[9px] text-zinc-600 block mt-1">
                                        {career.matchesAnalyzed > 0 ? fmtF((career.carried / career.matchesAnalyzed) * 100, 1) : '0.0'}% of matches
                                    </span>
                                </div>
                                <div class="relative bg-zinc-950 border border-zinc-800 p-4 text-center overflow-hidden">
                                    <span class="absolute top-0 left-0 w-3 h-3 border-t border-l border-emerald-500/25 pointer-events-none"></span>
                                    <span class="absolute top-0 right-0 w-3 h-3 border-t border-r border-emerald-500/25 pointer-events-none"></span>
                                    <span class="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider block mb-2" style="font-family:var(--font-family-display);">Avg EGO</span>
                                    <span class="text-3xl font-mono font-bold {egoColor(career.avgScore)}">{career.avgScore ?? '—'}</span>
                                    <span class="text-[9px] text-zinc-600 block mt-1">per match</span>
                                </div>
                            </div>
                        </div>
                    </div>
                {/if}

            <!-- ══ PURSUITS ════════════════════════════════════════════════════ -->
            {:else if tab === 'pursuits'}
                <div class="flex flex-col items-center justify-center h-full gap-4 py-24">
                    <div class="w-8 h-8 border border-zinc-700 rotate-45 mb-2"></div>
                    <span class="text-sm font-medium text-zinc-500">Pursuits — Coming Soon</span>
                    <p class="text-[9px] font-sans text-zinc-700 max-w-xs text-center leading-relaxed">
                        Achievement tracking coming in a future update.
                    </p>
                </div>

            <!-- ══ LOADOUT ═══════════════════════════════════════════════════════ -->
            {:else if tab === 'loadout'}
                {#if loadoutLoading}
                    <div class="flex flex-col items-center justify-center h-64 gap-3">
                        <div class="w-5 h-5 border border-zinc-700 border-t-emerald-400 animate-spin"></div>
                        <span class="text-xs font-medium text-zinc-600">Loading loadout…</span>
                    </div>
                {:else if !loadout}
                    <div class="flex items-center justify-center h-64">
                        <span class="text-sm font-medium text-zinc-500">
                            Loadout data unavailable.
                        </span>
                    </div>
                {:else}
                    <div class="p-6 space-y-5">
                        <!-- Gemini stat bar + weapon slots -->
                        {#if playerData.loadout.stats.Mobility > 0 || playerData.loadout.weapons[0].name !== '—'}
                            <div class="grid grid-cols-2 gap-4">
                                {#if playerData.loadout.stats.Mobility > 0}
                                <div class="relative bg-zinc-950 border border-zinc-800 overflow-hidden">
                                    <span class="absolute top-0 left-0 w-3 h-3 border-t border-l border-emerald-500/25 pointer-events-none"></span>
                                    <span class="absolute top-0 right-0 w-3 h-3 border-t border-r border-emerald-500/25 pointer-events-none"></span>
                                    <div class="px-4 py-2.5 border-b border-zinc-800/60">
                                        <span style="font-family:var(--font-family-display);font-size:0.60rem;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:rgba(255,255,255,0.30);">Character Stats</span>
                                    </div>
                                    <div class="px-4 py-3">
                                        {#each Object.entries(playerData.loadout.stats) as [stat, base]}
                                            {@render fateStatRow(stat, base, 0)}
                                        {/each}
                                    </div>
                                </div>
                                {/if}
                                {#if playerData.loadout.weapons[0].name !== '—'}
                                <div class="relative bg-zinc-950 border border-zinc-800 overflow-hidden">
                                    <span class="absolute top-0 left-0 w-3 h-3 border-t border-l border-emerald-500/25 pointer-events-none"></span>
                                    <span class="absolute top-0 right-0 w-3 h-3 border-t border-r border-emerald-500/25 pointer-events-none"></span>
                                    <div class="px-4 py-2.5 border-b border-zinc-800/60">
                                        <span style="font-family:var(--font-family-display);font-size:0.60rem;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:rgba(255,255,255,0.30);">Weapons</span>
                                    </div>
                                    {#each playerData.loadout.weapons as w}
                                        {@render jadestoneSlot(w)}
                                    {/each}
                                </div>
                                {/if}
                            </div>
                        {/if}
                        <!-- Full character screen -->
                        <CharacterScreen
                            char={char}
                            eq={eq}
                            armorStatMeta={loadout?.armorStatMeta ?? []}
                            artifact={loadout?.artifact}
                        />
                    </div>
                {/if}

            <!-- ══ SUBCLASS ══════════════════════════════════════════════════════ -->
            {:else if tab === 'subclass'}
                {#if loadoutLoading}
                    <div class="flex flex-col items-center justify-center h-64 gap-3">
                        <div class="w-5 h-5 border border-zinc-700 border-t-emerald-400 animate-spin"></div>
                        <span class="text-xs font-medium text-zinc-600">Loading subclass…</span>
                    </div>
                {:else if !loadout}
                    <div class="flex items-center justify-center h-64">
                        <span class="text-sm font-medium text-zinc-500">
                            Subclass data unavailable.
                        </span>
                    </div>
                {:else}
                    <div class="p-6">
                        <SubclassScreen
                            char={char}
                            eq={eq}
                            sockets={eq.subclassSockets ?? {}}
                        />
                    </div>
                {/if}
            {/if}

    </div>
    {/key}
    </main>

</div><!-- end main content panel -->
</div><!-- end flex layout -->
