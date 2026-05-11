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
        if ((tab === 'weaponry' || tab === 'maps' || tab === 'synergy' || tab === 'trophies') && !career && !careerLoading) {
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

    const egoRating = $derived((() => {
        const wins  = seasonalTotal?.wins             ?? ltWon;
        const kills = seasonalTotal?.kills            ?? ltKills;
        const inv   = seasonalTotal?.invasionKills    ?? ltInvKills;
        const motes = seasonalTotal?.motesDeposited   ?? ltMotes;
        return Math.floor(wins * 15 + kills * 0.3 + inv * 5 + motes * 0.1);
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
</script>

<!-- ── Full-height layout ──────────────────────────────────────────────────── -->
<div class="flex">

<!-- ── Left sidebar ────────────────────────────────────────────────────────── -->
<aside class="w-16 sticky top-0 h-screen border-r border-white/[0.07] bg-black/30 backdrop-blur-md flex flex-col items-center py-4 shrink-0 z-40">
    <div class="relative w-9 h-9 mb-5 shrink-0">
        <div class="absolute inset-0 rotate-45 border border-emerald-500/50 bg-emerald-500/5"></div>
        <span class="absolute inset-0 flex items-center justify-center text-[11px] font-mono font-black text-emerald-400 select-none">J</span>
    </div>

    {#each [
        { id:'overview', title:'Overview',  path:'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
        { id:'matches',  title:'Matches',   path:'M4 6h16M4 10h16M4 14h16M4 18h16' },
        { id:'loadout',  title:'Loadout',   path:'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
        { id:'subclass', title:'Subclass',  path:'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z' },
    ] as nav}
        <button onclick={() => tab = nav.id}
            class="group relative w-10 h-10 flex items-center justify-center transition-all duration-200 mb-0.5
                   {tab === nav.id ? 'text-emerald-400' : 'text-zinc-600 hover:text-zinc-300'}">
            <svg class="w-4 h-4 transition-transform duration-200 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d={nav.path}/>
            </svg>
            {#if tab === nav.id}
                <span class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"></span>
                <span class="absolute inset-0 bg-emerald-500/5"></span>
            {/if}
            <span class="absolute left-full ml-3 px-2 py-1 bg-black/80 backdrop-blur-sm border border-zinc-700
                         text-xs font-sans text-zinc-300 opacity-0 group-hover:opacity-100
                         -translate-x-1 group-hover:translate-x-0 transition-all duration-200
                         pointer-events-none whitespace-nowrap z-50 shadow-[0_0_12px_rgba(0,0,0,0.5)]">
                {nav.title}
            </span>
        </button>
    {/each}

    <div class="flex-1"></div>

    {#each data.characterIds as charId}
        {@const c   = data.characters[charId]}
        {@const cls = classNames[c?.classType] ?? '?'}
        <button onclick={() => { activeChar = charId; }}
            class="group relative w-10 h-10 flex items-center justify-center mb-1 transition-colors">
            <div class="w-7 h-7 rotate-45 border transition-all duration-300
                        {activeChar === charId
                            ? 'border-emerald-400 bg-emerald-500/10 shadow-[0_0_10px_rgba(52,211,153,0.25)]'
                            : 'border-zinc-700 bg-zinc-900 group-hover:border-zinc-400'}">
            </div>
            <span class="absolute text-[8px] font-mono font-black leading-none
                         {activeChar === charId ? 'text-emerald-400' : 'text-zinc-500 group-hover:text-zinc-200'}">
                {cls[0]}
            </span>
            {#if activeChar === charId}
                <span class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"></span>
            {/if}
            <span class="absolute left-full ml-3 px-2 py-1.5 bg-black/80 backdrop-blur-sm border border-zinc-700
                         text-xs font-sans text-zinc-300 leading-relaxed opacity-0 group-hover:opacity-100
                         -translate-x-1 group-hover:translate-x-0 transition-all duration-200
                         pointer-events-none whitespace-nowrap z-50">
                <span class="text-zinc-400 block font-medium">{cls}</span>
                {#if c?.light}<span class="text-emerald-400">{c.light} PL</span>{/if}
            </span>
        </button>
    {/each}

    {#if data.canClaim && !claimed}
        <button onclick={claimProfile} disabled={claiming} title="Claim profile"
            class="w-10 h-10 flex items-center justify-center text-zinc-600 hover:text-emerald-400 transition-colors disabled:opacity-40 mt-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/>
            </svg>
        </button>
    {:else if claimed}
        <div class="w-10 h-10 flex items-center justify-center text-emerald-400 mt-1" title="Claimed">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
            </svg>
        </div>
    {/if}
</aside>

<!-- ── Right panel ──────────────────────────────────────────────────────────── -->
<div class="flex-1 flex flex-col min-w-0">

    <!-- ── Hero header ──────────────────────────────────────────────────────── -->
    <header onmousemove={onHeroMouseMove} onmouseleave={onHeroMouseLeave}
            class="relative h-56 shrink-0 overflow-hidden border-b border-zinc-800">
        <div class="absolute inset-[-40px] z-0 transition-transform duration-100 ease-out"
             style="transform:translate({mouseX}px,{mouseY}px)">
            {#if data.emblemBg}
                <img src={data.emblemBg} alt="" class="w-full h-full object-cover grayscale-[0.3] opacity-30 contrast-125 scale-110"/>
            {:else}
                <div class="w-full h-full bg-gradient-to-br from-zinc-900 to-[#080808]"></div>
            {/if}
            <div class="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/80 to-transparent z-10"></div>
        </div>
        <div class="absolute inset-0 opacity-[0.02] pointer-events-none z-10"
             style="background-image:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,255,255,0.5) 2px,rgba(255,255,255,0.5) 3px)"></div>

        <div class="relative z-20 flex items-end gap-8 h-full px-8 pb-6">
            <!-- Avatar -->
            <div class="group/avatar relative shrink-0">
                <div class="w-28 h-28 bg-[#0c0c0c] border border-zinc-700 p-1.5 relative shadow-2xl overflow-hidden
                            transition-all duration-300 group-hover/avatar:border-zinc-500">
                    <div class="absolute inset-0 opacity-[0.06]"
                         style="background-image:linear-gradient(rgba(255,255,255,0.15) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.15) 1px,transparent 1px);background-size:16px 16px"></div>
                    <div class="absolute top-0 left-0 w-3 h-3 border-t border-l border-zinc-400/60 z-10"></div>
                    <div class="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-zinc-400/60 z-10"></div>
                    <div class="w-full h-full flex items-center justify-center">
                        <span class="font-serif text-4xl font-black italic text-zinc-700 select-none
                                     transition-colors duration-300 group-hover/avatar:text-zinc-500">
                            {monogram}
                        </span>
                    </div>
                </div>
                <!-- Rank diamond -->
                <div class="group/rank absolute -bottom-3 -right-3 z-20">
                    <div class="w-10 h-10 relative transition-all duration-500 group-hover/rank:scale-110 group-hover/rank:rotate-[135deg]">
                        <div class="absolute inset-0 rotate-45 border-2 bg-[#070707] transition-all duration-500
                                    {gambitRank==='Legend'  ? 'border-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.6)]'  :
                                     gambitRank==='Mythic'  ? 'border-violet-400 shadow-[0_0_14px_rgba(167,139,250,0.5)]':
                                     gambitRank==='Fabled'  ? 'border-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.5)]':
                                     gambitRank==='Heroic'  ? 'border-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.4)]'   :
                                                              'border-zinc-600'}"></div>
                        <div class="absolute inset-0 flex items-center justify-center transition-all duration-500 group-hover/rank:-rotate-[135deg]">
                            <span class="text-[11px] font-bold {gambitRank==='Legend'?'text-amber-400':gambitRank==='Mythic'?'text-violet-400':gambitRank==='Fabled'?'text-emerald-400':gambitRank==='Heroic'?'text-blue-400':'text-zinc-500'}">{gambitRank[0]}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Identity -->
            <div class="flex-1 min-w-0 mb-1">
                <span class="text-xs font-medium text-emerald-500/70 tracking-wide block mb-1">Guardian Profile</span>
                <h1 class="font-serif text-5xl font-light italic tracking-tighter uppercase leading-none text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)] mb-2 truncate">
                    {data.player.bungieGlobalDisplayName}<span class="font-mono text-lg text-zinc-600 not-italic tracking-normal ml-1">#{String(data.player.bungieGlobalDisplayNameCode).padStart(4,'0')}</span>
                </h1>
                <div class="flex items-center gap-3 mb-5">
                    {#if data.clan}
                        <a href="/clan/{data.clan.groupId}" class="text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors">[{data.clan.name}]</a>
                    {/if}
                    {#if classNames[char.classType]}
                        <span class="text-sm text-zinc-500 font-light">{classNames[char.classType]}{raceNames[char.raceType] ? ' · ' + raceNames[char.raceType] : ''}</span>
                    {/if}
                </div>
                <!-- Achievement badges -->
                <div class="flex items-center gap-4">
                    {#each ACHIEVEMENT_BADGES as badge}
                        {@const ts = tierStyle[badge.tier]}
                        <div class="group relative cursor-default select-none">
                            <div class="w-7 h-7 relative transition-all duration-300 group-hover:scale-125">
                                <div class="absolute inset-0 rotate-45 border {ts.border} bg-[#0c0c0c] transition-all duration-300 {badge.tier!=='locked'?ts.glow:''} group-hover:rotate-[90deg]"></div>
                                <div class="absolute inset-0 flex items-center justify-center">
                                    <span class="text-[10px] leading-none {ts.text} {badge.tier==='locked'?'opacity-20':'opacity-80 group-hover:opacity-100'}">{badge.icon}</span>
                                </div>
                            </div>
                            <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-40 opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-200 pointer-events-none whitespace-nowrap">
                                <div class="bg-[#111] border border-zinc-700/80 px-2 py-1.5 text-center shadow-[0_0_16px_rgba(0,0,0,0.8)]">
                                    <span class="text-[10px] font-bold {ts.text} block">{badge.label}</span>
                                    <span class="text-[7px] font-sans text-zinc-600 block mt-0.5">{badge.desc}</span>
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>

            <!-- Rating block -->
            <div class="group/ego shrink-0 text-right mb-1 cursor-default select-none">
                <span class="text-xs font-medium text-zinc-500 block mb-1">EGO Rating</span>
                <span class="text-5xl font-sans font-light tracking-tighter text-white leading-none block transition-all duration-300 group-hover/ego:drop-shadow-[0_0_16px_rgba(255,255,255,0.2)]">
                    {egoRating.toLocaleString()}
                </span>
                <span class="text-sm font-semibold italic text-emerald-500 block mt-1">#{gambitRank}</span>
                <div class="w-20 h-px bg-zinc-800 mt-2 ml-auto">
                    <div class="h-full bg-emerald-400/70 transition-all" style="width:{gambitPct}%"></div>
                </div>
                <span class="text-[10px] text-zinc-600 mt-0.5 block">{gambitPct}% to next tier</span>
            </div>
        </div>
        <div class="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-emerald-500/30 via-transparent to-transparent z-20"></div>
    </header>

    <!-- ── Tab nav ───────────────────────────────────────────────────────────── -->
    <div class="h-12 bg-black/30 backdrop-blur-md border-b border-white/[0.07] flex items-end shrink-0 sticky top-0 z-30 overflow-x-auto">
        {#each TABS as t}
            <button onclick={() => tab = t.id}
                class="text-xs font-semibold h-9 px-5 relative transition-all duration-300 flex-shrink-0
                       {tab === t.id
                           ? 'text-white bg-white/[0.05] border-t border-x border-white/[0.08]'
                           : 'text-zinc-500 hover:text-zinc-300'}">
                {t.label}
                {#if tab === t.id}
                    <span class="absolute bottom-0 left-0 w-full h-px bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.9)] z-20 pointer-events-none"></span>
                {/if}
            </button>
        {/each}
    </div>

    <!-- ── Tab content ───────────────────────────────────────────────────────── -->
    <main class="flex-1 overflow-y-auto">
    {#key tab}
    <div class="p-6" in:fly={{ y: 12, duration: 280, opacity: 0 }}>

    <!-- ══════════════════════════════════ OVERVIEW ══ -->
    {#if tab === 'overview'}

        <!-- Season filter + source notice -->
        <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-2">
                <span class="text-xs text-zinc-500 font-medium">Season:</span>
                <select bind:value={seasonFilter}
                    class="bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 px-2 py-1 focus:outline-none focus:border-emerald-500/50">
                    <option value="all">All Time</option>
                    {#if seasonal?.seasons}
                        {#each [...seasonal.seasons].sort((a,b)=>b.seasonNumber-a.seasonNumber) as s}
                            <option value={s.season}>{SEASON_NAMES[s.seasonNumber] ?? s.season}</option>
                        {/each}
                    {/if}
                </select>
                {#if seasonalLoading}
                    <span class="text-[10px] text-zinc-600 animate-pulse">loading history…</span>
                {:else if seasonal?.totalActivities}
                    <span class="text-[10px] text-zinc-600">{seasonal.totalActivities.toLocaleString()} matches indexed</span>
                {/if}
            </div>
            {#if data.statsSource === 'recent'}
                <span class="text-[10px] text-zinc-600 italic">Bungie lifetime API unavailable — showing last {data.recentMatches.length} matches</span>
            {/if}
        </div>

        <!-- Primary stat cards -->
        <div class="flex gap-3 mb-4 [&>*]:flex-1">
            {#if hasKey('activitiesEntered') || dEntered > 0}
            <div class="bg-zinc-900/60 border border-zinc-800 p-4">
                <div class="flex items-start justify-between mb-3">
                    <span class="text-[10px] font-semibold text-zinc-500 tracking-widest uppercase">Win Rate</span>
                    {#if winRateRank(dWinRate)}
                        <span class="text-[9px] font-bold {winRateRank(dWinRate).color} border border-current/30 px-1.5 py-0.5">{winRateRank(dWinRate).label}</span>
                    {/if}
                </div>
                <div class="text-4xl font-sans font-light tracking-tighter {winTier(dWinRate).color} leading-none mb-1">
                    {dWinRate != null ? fmtF(dWinRate, 1) + '%' : '—'}
                </div>
                <div class="text-[10px] text-zinc-600 mt-2">{fmt(dWon)} W · {fmt(dEntered - dWon)} L · {fmt(dEntered)} total</div>
                <div class="text-[9px] font-semibold {winTier(dWinRate).color} mt-1 tracking-widest">{winTier(dWinRate).label}</div>
            </div>
            {/if}

            {#if hasKey('kills') || dKills > 0 || dDeaths > 0}
            <div class="bg-zinc-900/60 border border-zinc-800 p-4">
                <div class="flex items-start justify-between mb-3">
                    <span class="text-[10px] font-semibold text-zinc-500 tracking-widest uppercase">K / D / A</span>
                    {#if kdRank(dKD)}
                        <span class="text-[9px] font-bold {kdRank(dKD).color} border border-current/30 px-1.5 py-0.5">{kdRank(dKD).label}</span>
                    {/if}
                </div>
                <div class="text-4xl font-sans font-light tracking-tighter {kdTier(dKD).color} leading-none mb-1">
                    {dKD != null ? fmtF(dKD) : '—'}
                </div>
                <div class="text-[10px] text-zinc-600 mt-2">{fmt(dKills)} K · {fmt(dDeaths)} D · {fmt(dDeaths > 0 ? dKills+Math.round(dDeaths*.5) : 0)} A</div>
                <div class="text-[9px] font-semibold {kdTier(dKD).color} mt-1 tracking-widest">{kdTier(dKD).label}</div>
            </div>
            {/if}

            {#if hasKey('motesBanked') || dMotes > 0}
            <div class="bg-zinc-900/60 border border-zinc-800 p-4">
                <div class="flex items-start justify-between mb-3">
                    <span class="text-[10px] font-semibold text-zinc-500 tracking-widest uppercase">Avg Motes</span>
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
            <div class="bg-zinc-900/60 border border-zinc-800 p-4">
                <div class="flex items-start justify-between mb-3">
                    <span class="text-[10px] font-semibold text-zinc-500 tracking-widest uppercase">Avg Invasions</span>
                    {#if invRank(dAvgInv)}
                        <span class="text-[9px] font-bold {invRank(dAvgInv).color} border border-current/30 px-1.5 py-0.5">{invRank(dAvgInv).label}</span>
                    {/if}
                </div>
                <div class="text-4xl font-sans font-light tracking-tighter {invTier(dAvgInv).color} leading-none mb-1">
                    {fmtF(dAvgInv, 2)}
                </div>
                <div class="text-[10px] text-zinc-600 mt-2">{fmt(dInvKills)} kills · {fmt(dInvDef)} shut down</div>
                <div class="text-[9px] font-semibold {invTier(dAvgInv).color} mt-1 tracking-widest">{invTier(dAvgInv).label}</div>
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

        <!-- Season breakdown -->
        {#if seasonal?.seasons?.length}
        <div class="border border-zinc-800/60 bg-zinc-900/20">
            <div class="flex items-center justify-between px-4 py-2 border-b border-zinc-800/40">
                <span class="text-[10px] font-semibold text-zinc-500 tracking-widest uppercase">Season Breakdown</span>
                <span class="text-[10px] text-zinc-700">{seasonal.seasons.length} seasons</span>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-xs">
                    <thead>
                        <tr class="border-b border-zinc-800/40">
                            <th class="text-left px-4 py-2 text-[10px] text-zinc-600 font-semibold tracking-widest uppercase">Season</th>
                            <th class="text-right px-3 py-2 text-[10px] text-zinc-600 font-semibold tracking-widest uppercase">Games</th>
                            <th class="text-right px-3 py-2 text-[10px] text-zinc-600 font-semibold tracking-widest uppercase">Win%</th>
                            <th class="text-right px-3 py-2 text-[10px] text-zinc-600 font-semibold tracking-widest uppercase">K/D</th>
                            <th class="text-right px-3 py-2 text-[10px] text-zinc-600 font-semibold tracking-widest uppercase">Motes</th>
                            <th class="text-right px-3 py-2 text-[10px] text-zinc-600 font-semibold tracking-widest uppercase">Invasions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each [...seasonal.seasons].sort((a,b)=>b.seasonNumber-a.seasonNumber) as s}
                        <tr class="border-b border-zinc-800/20 hover:bg-zinc-800/20 transition-colors">
                            <td class="px-4 py-2 text-zinc-300 font-medium">{SEASON_NAMES[s.seasonNumber] ?? s.season}</td>
                            <td class="px-3 py-2 text-right font-mono text-zinc-400">{s.activitiesEntered}</td>
                            <td class="px-3 py-2 text-right font-mono {s.winRate >= 55 ? 'text-emerald-400' : s.winRate >= 45 ? 'text-zinc-300' : 'text-red-400'}">{s.winRate}%</td>
                            <td class="px-3 py-2 text-right font-mono text-zinc-300">{s.kd}</td>
                            <td class="px-3 py-2 text-right font-mono text-zinc-400">{s.avgMotes}</td>
                            <td class="px-3 py-2 text-right font-mono text-zinc-400">{s.avgInvasions}</td>
                        </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
        {/if}

    <!-- ══════════════════════════════════ MATCHES ══ -->
    {:else if tab === 'matches'}

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

        <!-- Loading skeleton -->
        {#if historyLoading}
            <div class="space-y-1">
                {#each Array(12) as _}
                    <div class="h-9 bg-zinc-900/50 border border-zinc-800/30 animate-pulse"></div>
                {/each}
            </div>

        {:else if !filteredMatches.length}
            <div class="text-sm text-zinc-600 text-center py-16">
                {stackFilter === 'favs' ? 'No favorited matches yet.' : 'No Gambit matches found.'}
            </div>

        {:else}
            <!-- Match table -->
            <div class="border border-zinc-800/60 overflow-hidden">
                <table class="w-full text-xs">
                    <thead class="border-b border-zinc-800">
                        <tr>
                            <th class="text-left px-1 py-2 w-6"></th>
                            <th class="text-left px-3 py-2 text-[10px] text-zinc-600 font-semibold tracking-widest uppercase w-32">Date</th>
                            <th class="text-left px-3 py-2 text-[10px] text-zinc-600 font-semibold tracking-widest uppercase">Map</th>
                            <th class="text-center px-2 py-2 text-[10px] text-zinc-600 font-semibold tracking-widest uppercase w-12">Result</th>
                            <th class="text-right px-3 py-2 text-[10px] text-zinc-600 font-semibold tracking-widest uppercase w-16">EGO</th>
                            <th class="text-right px-2 py-2 text-[10px] text-zinc-600 font-semibold tracking-widest uppercase w-16">K/D/A</th>
                            <th class="text-right px-2 py-2 text-[10px] text-zinc-600 font-semibold tracking-widest uppercase w-14">Motes</th>
                            <th class="text-right px-2 py-2 text-[10px] text-zinc-600 font-semibold tracking-widest uppercase w-14">Inv.</th>
                            <th class="text-center px-2 py-2 text-[10px] text-zinc-600 font-semibold tracking-widest uppercase w-10">Sz</th>
                            <th class="text-right px-3 py-2 text-[10px] text-zinc-600 font-semibold tracking-widest uppercase w-14">Dur.</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each filteredMatches as m}
                            {@const ego = m.ego?.finalScore ?? null}
                            {@const isFav = favorites.has(m.instanceId)}
                            <tr class="border-b border-zinc-800/30 transition-colors group
                                       {m.win  ? 'hover:bg-emerald-900/10' : 'hover:bg-red-900/10'}">
                                <!-- Favorite star -->
                                <td class="px-1 py-2 text-center" onclick={(e) => { e.stopPropagation(); toggleFavorite(m.instanceId); }}>
                                    <button class="text-[11px] transition-colors {isFav ? 'text-amber-400' : 'text-zinc-800 hover:text-zinc-600'}">★</button>
                                </td>
                                <td onclick={() => m.instanceId && (window.location.href = `/match/${m.instanceId}`)}
                                    class="px-3 py-2 text-zinc-600 whitespace-nowrap cursor-pointer">
                                    {m.period ? new Date(m.period).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '—'}
                                    <span class="text-zinc-700 ml-1">{m.period ? new Date(m.period).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : ''}</span>
                                </td>
                                <td onclick={() => m.instanceId && (window.location.href = `/match/${m.instanceId}`)}
                                    class="px-3 py-2 cursor-pointer">
                                    <div class="flex items-center gap-2">
                                        <span class="text-zinc-300 font-medium">{m.mapName}</span>
                                        {#if m.is_hard_carry}
                                            <span class="text-[9px] font-bold text-amber-400 border border-amber-500/40 px-1 py-0.5 leading-none">CARRY</span>
                                        {:else if m.is_carried}
                                            <span class="text-[9px] font-bold text-zinc-600 border border-zinc-700 px-1 py-0.5 leading-none">CARRIED</span>
                                        {/if}
                                    </div>
                                </td>
                                <td onclick={() => m.instanceId && (window.location.href = `/match/${m.instanceId}`)}
                                    class="px-2 py-2 text-center cursor-pointer">
                                    {#if m.win}
                                        <span class="text-emerald-400 font-bold text-[11px]">WIN</span>
                                    {:else}
                                        <span class="text-red-400 font-semibold text-[11px]">LOSS</span>
                                    {/if}
                                </td>
                                <td onclick={() => m.instanceId && (window.location.href = `/match/${m.instanceId}`)}
                                    class="px-3 py-2 text-right font-mono font-bold {egoColor(ego)} cursor-pointer">
                                    {ego != null ? ego : '—'}
                                </td>
                                <td onclick={() => m.instanceId && (window.location.href = `/match/${m.instanceId}`)}
                                    class="px-2 py-2 text-right font-mono text-zinc-400 cursor-pointer">
                                    {m.k}/{m.d}/{m.a}
                                </td>
                                <td onclick={() => m.instanceId && (window.location.href = `/match/${m.instanceId}`)}
                                    class="px-2 py-2 text-right font-mono text-zinc-400 cursor-pointer">{m.motesDeposited}</td>
                                <td onclick={() => m.instanceId && (window.location.href = `/match/${m.instanceId}`)}
                                    class="px-2 py-2 text-right font-mono text-zinc-400 cursor-pointer">{m.invasionKills}</td>
                                <td class="px-2 py-2 text-center font-mono text-zinc-600">
                                    {#if m.fireteam_size && m.fireteam_size > 1}
                                        <span class="text-violet-400">{m.fireteam_size}</span>
                                    {:else}
                                        {m.fireteam_size ?? '—'}
                                    {/if}
                                </td>
                                <td onclick={() => m.instanceId && (window.location.href = `/match/${m.instanceId}`)}
                                    class="px-3 py-2 text-right font-mono text-zinc-600 cursor-pointer">{m.duration > 0 ? fmtDuration(m.duration) : '—'}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {/if}

    <!-- ══════════════════════════════════ WEAPONRY ══ -->
    {:else if tab === 'weaponry'}
        {#if careerLoading}
            <div class="space-y-1">{#each Array(10) as _}<div class="h-10 bg-zinc-900/50 border border-zinc-800/30 animate-pulse"></div>{/each}</div>
        {:else if careerError}
            <p class="text-sm text-red-400 text-center py-16">{careerError}</p>
        {:else if !career?.weapons?.length}
            <div class="text-center py-16">
                <p class="text-sm text-zinc-600 mb-2">No weapon data yet.</p>
                <p class="text-[10px] text-zinc-700">Switch to Matches tab to trigger PGCR enrichment.</p>
            </div>
        {:else}
            <div class="border border-zinc-800/60 overflow-hidden">
                <table class="w-full text-xs">
                    <thead class="border-b border-zinc-800">
                        <tr>
                            <th class="text-left px-4 py-2 text-[10px] text-zinc-600 font-semibold tracking-widest uppercase">Weapon</th>
                            <th class="text-right px-3 py-2 text-[10px] text-zinc-600 font-semibold tracking-widest uppercase">Games</th>
                            <th class="text-right px-3 py-2 text-[10px] text-zinc-600 font-semibold tracking-widest uppercase">Win%</th>
                            <th class="text-right px-3 py-2 text-[10px] text-zinc-600 font-semibold tracking-widest uppercase">Avg EGO</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each career.weapons as w}
                        <tr class="border-b border-zinc-800/30 hover:bg-zinc-800/20 transition-colors">
                            <td class="px-4 py-2.5 flex items-center gap-2">
                                {#if w.icon}<img src={w.icon} alt="" class="w-7 h-7 object-cover opacity-80"/>{/if}
                                <span class="text-zinc-200 font-medium">{w.name}</span>
                            </td>
                            <td class="px-3 py-2 text-right font-mono text-zinc-500">{w.games}</td>
                            <td class="px-3 py-2 text-right font-mono {w.winRate >= 55 ? 'text-emerald-400' : w.winRate >= 45 ? 'text-zinc-300' : 'text-red-400'}">{w.winRate}%</td>
                            <td class="px-3 py-2 text-right font-mono {egoColor(w.avgScore)}">{w.avgScore}</td>
                        </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {/if}

    <!-- ══════════════════════════════════ SYNERGY ══ -->
    {:else if tab === 'synergy'}
        {#if careerLoading}
            <div class="space-y-1">{#each Array(8) as _}<div class="h-10 bg-zinc-900/50 border border-zinc-800/30 animate-pulse"></div>{/each}</div>
        {:else if careerError}
            <p class="text-sm text-red-400 text-center py-16">{careerError}</p>
        {:else}

            <!-- ── Playstyle alignment ─────────────────────────────────────────── -->
            {#if career?.playstyle}
                {@const ps = career.playstyle}
                <div class="mb-6 bg-zinc-900/40 border border-zinc-800/60 p-4">
                    <div class="flex items-center justify-between mb-3">
                        <span class="text-[10px] font-semibold text-zinc-500 tracking-widest uppercase">Playstyle Alignment</span>
                        <span class="text-sm font-bold {PLAYSTYLE_COLORS[ps.dominant]?.text ?? 'text-zinc-300'}">
                            {ps.dominant}
                        </span>
                    </div>
                    <div class="space-y-2">
                        {#each ps.breakdown as role}
                            {@const colors = PLAYSTYLE_COLORS[role.label] ?? { bar:'bg-zinc-600', text:'text-zinc-400' }}
                            <div class="flex items-center gap-3">
                                <span class="w-16 text-[10px] font-semibold {colors.text}">{role.label}</span>
                                <div class="flex-1 h-1.5 bg-zinc-800">
                                    <div class="h-full {colors.bar} transition-all duration-500"
                                         style="width:{role.pct}%"></div>
                                </div>
                                <span class="w-8 text-right text-[10px] font-mono {colors.text}">{role.pct}%</span>
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}

            <!-- ── Best ally / Nemesis highlights ─────────────────────────────── -->
            {#if career?.bestAlly || career?.nemesis}
                <div class="grid grid-cols-2 gap-3 mb-6">
                    {#if career.bestAlly}
                        <div class="bg-emerald-900/10 border border-emerald-800/40 p-3">
                            <div class="text-[9px] font-semibold text-emerald-600 tracking-widest uppercase mb-1">Best Ally</div>
                            <a href="/profile/{career.bestAlly.name.replace('#','/')}"
                               class="text-sm font-semibold text-emerald-300 hover:text-emerald-200 transition-colors truncate block">
                                {career.bestAlly.name}
                            </a>
                            <div class="text-[10px] text-zinc-500 mt-0.5">
                                {career.bestAlly.as_ally} matches · {career.bestAlly.winRate}% WR together
                            </div>
                        </div>
                    {/if}
                    {#if career.nemesis}
                        <div class="bg-red-900/10 border border-red-800/40 p-3">
                            <div class="text-[9px] font-semibold text-red-600 tracking-widest uppercase mb-1">Nemesis</div>
                            <a href="/profile/{career.nemesis.name.replace('#','/')}"
                               class="text-sm font-semibold text-red-300 hover:text-red-200 transition-colors truncate block">
                                {career.nemesis.name}
                            </a>
                            <div class="text-[10px] text-zinc-500 mt-0.5">
                                {career.nemesis.as_enemy} matches · {career.nemesis.winRate}% WR vs you
                            </div>
                        </div>
                    {/if}
                </div>
            {/if}

            <!-- ── Class compare ─────────────────────────────────────────────── -->
            {#if career?.classStats?.some(c => c.games > 0)}
                <div class="mb-6">
                    <div class="text-[10px] font-semibold text-zinc-500 tracking-widest uppercase mb-2">Class Performance</div>
                    <div class="flex gap-3">
                        {#each career.classStats.filter(c => c.games > 0) as cls}
                            <div class="flex-1 bg-zinc-900/40 border border-zinc-800/60 p-3 text-center">
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
            {/if}

            <!-- ── Allies + Rivals tables ──────────────────────────────────────── -->
            <div class="grid grid-cols-2 gap-6">
                <!-- Allies -->
                <div>
                    <div class="text-[10px] font-semibold text-zinc-500 tracking-widest uppercase mb-2">Frequent Allies</div>
                    {#if !career?.allies?.length}
                        <p class="text-xs text-zinc-600 py-8 text-center">Not enough data yet.</p>
                    {:else}
                        <div class="border border-zinc-800/60 overflow-hidden">
                            {#each career.allies as p}
                            <a href="/profile/{p.name.replace('#','/')}"
                               class="flex items-center justify-between px-3 py-2 border-b border-zinc-800/30 hover:bg-zinc-800/20 transition-colors">
                                <div class="min-w-0">
                                    <span class="text-zinc-300 text-xs font-medium truncate block">{p.name}</span>
                                    <span class="text-[9px] text-zinc-600">{p.className}</span>
                                </div>
                                <div class="flex items-center gap-3 shrink-0 ml-2">
                                    <span class="text-[10px] text-zinc-600">{p.as_ally} together</span>
                                    <span class="text-[10px] font-mono {p.winRate >= 55 ? 'text-emerald-400' : 'text-zinc-400'}">{p.winRate}% WR</span>
                                </div>
                            </a>
                            {/each}
                        </div>
                    {/if}
                </div>

                <!-- Rivals -->
                <div>
                    <div class="text-[10px] font-semibold text-zinc-500 tracking-widest uppercase mb-2">Frequent Rivals</div>
                    {#if !career?.rivals?.length}
                        <p class="text-xs text-zinc-600 py-8 text-center">Not enough data yet.</p>
                    {:else}
                        <div class="border border-zinc-800/60 overflow-hidden">
                            {#each career.rivals as p}
                            <a href="/profile/{p.name.replace('#','/')}"
                               class="flex items-center justify-between px-3 py-2 border-b border-zinc-800/30 hover:bg-zinc-800/20 transition-colors">
                                <div class="min-w-0">
                                    <span class="text-zinc-300 text-xs font-medium truncate block">{p.name}</span>
                                    <span class="text-[9px] text-zinc-600">{p.className}</span>
                                </div>
                                <div class="flex items-center gap-3 shrink-0 ml-2">
                                    <span class="text-[10px] text-zinc-600">{p.as_enemy} vs</span>
                                    <span class="text-[10px] font-mono {p.winRate >= 55 ? 'text-emerald-400' : p.winRate >= 45 ? 'text-zinc-400' : 'text-red-400'}">{p.winRate}% WR</span>
                                </div>
                            </a>
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>
        {/if}

    <!-- ══════════════════════════════════ MAPS ══ -->
    {:else if tab === 'maps'}
        {#if careerLoading}
            <div class="space-y-1">{#each Array(6) as _}<div class="h-10 bg-zinc-900/50 border border-zinc-800/30 animate-pulse"></div>{/each}</div>
        {:else if careerError}
            <p class="text-sm text-red-400 text-center py-16">{careerError}</p>
        {:else if !career?.maps?.length}
            <div class="text-center py-16">
                <p class="text-sm text-zinc-600 mb-2">No map data available yet.</p>
                <p class="text-[10px] text-zinc-700">Switch to Matches tab to trigger PGCR enrichment.</p>
            </div>
        {:else}
            <div class="border border-zinc-800/60 overflow-hidden mb-6">
                <table class="w-full text-xs">
                    <thead class="border-b border-zinc-800">
                        <tr>
                            <th class="text-left px-4 py-2 text-[10px] text-zinc-600 font-semibold tracking-widest uppercase">Map</th>
                            <th class="text-right px-3 py-2 text-[10px] text-zinc-600 font-semibold tracking-widest uppercase">Games</th>
                            <th class="text-right px-3 py-2 text-[10px] text-zinc-600 font-semibold tracking-widest uppercase">Wins</th>
                            <th class="text-right px-3 py-2 text-[10px] text-zinc-600 font-semibold tracking-widest uppercase">Win%</th>
                            <th class="text-right px-3 py-2 text-[10px] text-zinc-600 font-semibold tracking-widest uppercase">Avg EGO</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each career.maps as m}
                        <tr class="border-b border-zinc-800/30 hover:bg-zinc-800/20 transition-colors">
                            <td class="px-4 py-2.5 text-zinc-200 font-medium">{m.name}</td>
                            <td class="px-3 py-2 text-right font-mono text-zinc-400">{m.games}</td>
                            <td class="px-3 py-2 text-right font-mono text-zinc-400">{m.wins}</td>
                            <td class="px-3 py-2 text-right font-mono {m.winRate >= 55 ? 'text-emerald-400' : m.winRate >= 45 ? 'text-zinc-300' : 'text-red-400'}">{m.winRate}%</td>
                            <td class="px-3 py-2 text-right font-mono {egoColor(m.avgScore)}">{m.avgScore > 0 ? m.avgScore : '—'}</td>
                        </tr>
                        {/each}
                    </tbody>
                </table>
            </div>

            <!-- ── Hourly performance chart ──────────────────────────────────── -->
            {#if career?.hourlyStats?.some(h => h.games > 0)}
                <div class="bg-zinc-900/40 border border-zinc-800/60 p-4">
                    <div class="text-[10px] font-semibold text-zinc-500 tracking-widest uppercase mb-3">Best Time to Play (UTC)</div>
                    <div class="flex items-end gap-px h-16">
                        {#each career.hourlyStats as h}
                            {@const maxGames = Math.max(...career.hourlyStats.map(x => x.games))}
                            {@const heightPct = maxGames > 0 ? (h.games / maxGames) * 100 : 0}
                            <div class="flex-1 flex flex-col items-center justify-end gap-0.5 group relative cursor-default"
                                 title="{h.hour}:00 — {h.games} games, {h.winRate}% WR">
                                <div class="w-full transition-all duration-300 {h.winRate >= 55 ? 'bg-emerald-600/70 group-hover:bg-emerald-500' : h.winRate >= 45 ? 'bg-zinc-600/70 group-hover:bg-zinc-500' : 'bg-red-900/60 group-hover:bg-red-800'}"
                                     style="height:{Math.max(heightPct, h.games > 0 ? 5 : 0)}%"></div>
                                <!-- tooltip -->
                                {#if h.games > 0}
                                    <div class="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-black/90 border border-zinc-700 px-2 py-1 text-[9px] text-zinc-200 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10 transition-opacity">
                                        {h.hour}:00 · {h.games}g · {h.winRate}% WR
                                    </div>
                                {/if}
                            </div>
                        {/each}
                    </div>
                    <div class="flex justify-between text-[8px] text-zinc-700 mt-1">
                        <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span>
                    </div>
                </div>
            {/if}
        {/if}

    <!-- ══════════════════════════════════ TROPHIES ══ -->
    {:else if tab === 'trophies'}
        {#if careerLoading}
            <div class="space-y-1">{#each Array(8) as _}<div class="h-10 bg-zinc-900/50 border border-zinc-800/30 animate-pulse"></div>{/each}</div>
        {:else if careerError}
            <p class="text-sm text-red-400 text-center py-16">{careerError}</p>
        {:else if !career?.medals?.length}
            <div class="text-center py-16">
                <div class="text-zinc-700 text-4xl mb-3">◈</div>
                <p class="text-zinc-600 text-sm mb-2">No medals collected yet.</p>
                <p class="text-[10px] text-zinc-700">Switch to Matches tab to trigger PGCR enrichment.</p>
            </div>
        {:else}
            <!-- Carry summary -->
            {#if career.carryPct > 0 || career.carriedPct > 0}
                <div class="flex gap-3 mb-6">
                    <div class="flex-1 bg-amber-900/10 border border-amber-800/30 p-3 text-center">
                        <div class="text-[10px] text-amber-600/80 uppercase tracking-widest mb-1">Hard Carry</div>
                        <div class="text-3xl font-mono font-light text-amber-400">{career.carryPct}%</div>
                        <div class="text-[10px] text-zinc-600 mt-0.5">{career.carries} of {career.matchesAnalyzed} matches</div>
                    </div>
                    <div class="flex-1 bg-zinc-900/40 border border-zinc-800/60 p-3 text-center">
                        <div class="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Carried</div>
                        <div class="text-3xl font-mono font-light text-zinc-400">{career.carriedPct}%</div>
                        <div class="text-[10px] text-zinc-600 mt-0.5">{career.carried} of {career.matchesAnalyzed} matches</div>
                    </div>
                    <div class="flex-1 bg-zinc-900/40 border border-zinc-800/60 p-3 text-center">
                        <div class="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Avg EGO</div>
                        <div class="text-3xl font-mono font-light {egoColor(career.avgScore)}">{career.avgScore}</div>
                        <div class="text-[10px] text-zinc-600 mt-0.5">{career.matchesAnalyzed} matches analyzed</div>
                    </div>
                </div>
            {/if}

            <!-- Medal wall -->
            <div class="text-[10px] font-semibold text-zinc-500 tracking-widest uppercase mb-3">Medal Wall</div>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {#each career.medals as medal}
                    {@const label = MEDAL_LABELS[medal.key] ?? medal.key}
                    <div class="bg-zinc-900/40 border border-zinc-800/60 px-3 py-2.5 flex items-center justify-between gap-2 hover:border-zinc-700 transition-colors">
                        <span class="text-xs text-zinc-300 truncate">{label}</span>
                        <span class="text-sm font-mono font-bold text-amber-400 shrink-0">{medal.count.toLocaleString()}</span>
                    </div>
                {/each}
            </div>
        {/if}

    <!-- ══════════════════════════════════ PURSUITS ══ -->
    {:else if tab === 'pursuits'}
        <div class="flex items-center justify-center h-64">
            <div class="text-center">
                <div class="text-zinc-700 text-4xl mb-3">◆</div>
                <p class="text-zinc-500 text-sm">Pursuits & triumphs coming soon.</p>
            </div>
        </div>

    <!-- ══════════════════════════════════ LOADOUT ══ -->
    {:else if tab === 'loadout'}
        {#if loadoutLoading}
            <div class="space-y-1">{#each Array(8) as _}<div class="h-12 bg-zinc-900/50 border border-zinc-800/30 animate-pulse"></div>{/each}</div>
        {:else if !loadout}
            <p class="text-sm text-zinc-600 text-center py-16">Loading loadout…</p>
        {:else}
            <CharacterScreen
                equipment={loadout.equipment}
                artifact={loadout.artifact}
                armorStatMeta={loadout.armorStatMeta}
            />
        {/if}

    <!-- ══════════════════════════════════ SUBCLASS ══ -->
    {:else if tab === 'subclass'}
        {#if loadoutLoading}
            <div class="space-y-1">{#each Array(6) as _}<div class="h-12 bg-zinc-900/50 border border-zinc-800/30 animate-pulse"></div>{/each}</div>
        {:else if !loadout}
            <p class="text-sm text-zinc-600 text-center py-16">Loading subclass…</p>
        {:else}
            <SubclassScreen
                subclassSockets={loadout.equipment?.subclassSockets}
            />
        {/if}

    {/if}
    </div>
    {/key}
    </main>

</div><!-- end right panel -->
</div><!-- end flex layout -->
