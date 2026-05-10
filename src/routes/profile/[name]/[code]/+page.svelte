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

    // ── Lazy seasonal ──────────────────────────────────────────────────────────
    let seasonal        = $state(null);
    let seasonalLoading = $state(false);

    async function fetchSeasonal() {
        if (seasonalLoading || seasonal) return;
        seasonalLoading = true;
        try {
            const charIds = data.characterIds.join(',');
            const res = await fetch(
                `/api/seasonal?membershipType=${data.membershipType}&membershipId=${data.membershipId}&charIds=${charIds}&maxPages=10`
            );
            seasonal = await res.json();
        } catch (e) { console.error('Seasonal fetch failed', e); }
        finally { seasonalLoading = false; }
    }

    $effect(() => {
        if ((tab === 'loadout' || tab === 'subclass') && activeChar && activeChar !== loadoutCharId) {
            fetchLoadout();
        }
    });
    $effect(() => {
        if (tab === 'overview' && !seasonal && !seasonalLoading) fetchSeasonal();
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

    const ltEntered    = $derived(sv('activitiesEntered'));
    const ltWon        = $derived(sv('activitiesWon'));
    const ltKills      = $derived(sv('kills'));
    const ltDeaths     = $derived(sv('deaths'));
    const ltAssists    = $derived(sv('assists'));
    const ltInvasions  = $derived(sv('invasions'));
    const ltInvKills   = $derived(sv('invasionKills'));
    const ltInvDef     = $derived(sv('invasionsDefeated'));
    const ltMotes      = $derived(sv('motesBanked'));
    const ltMotesLost  = $derived(sv('motesLost'));

    // EGO rating formula
    const egoRating = $derived(
        Math.floor(ltWon * 15 + ltKills * 0.3 + ltInvKills * 5 + ltMotes * 0.1)
    );

    // ── Filtered display stats (season or lifetime) ────────────────────────────
    const displaySeason = $derived(
        seasonFilter === 'all' || !seasonal
            ? null
            : (seasonal.seasons ?? []).find(s => s.season === seasonFilter) ?? null
    );

    const dEntered    = $derived(displaySeason ? displaySeason.activitiesEntered : ltEntered);
    const dWon        = $derived(displaySeason ? displaySeason.wins              : ltWon);
    const dKills      = $derived(displaySeason ? displaySeason.kills             : ltKills);
    const dDeaths     = $derived(displaySeason ? displaySeason.deaths            : ltDeaths);
    const dInvasions  = $derived(displaySeason ? displaySeason.invasions         : ltInvasions);
    const dInvKills   = $derived(displaySeason ? displaySeason.invasionKills     : ltInvKills);
    const dInvDef     = $derived(displaySeason ? (displaySeason.invasionsDefeated ?? 0) : ltInvDef);
    const dMotes      = $derived(displaySeason ? displaySeason.motesDeposited    : ltMotes);
    const dMotesLost  = $derived(displaySeason ? displaySeason.motesLost         : ltMotesLost);

    const dWinRate  = $derived(dEntered > 0 ? (dWon   / dEntered) * 100 : null);
    const dKD       = $derived(dDeaths  > 0 ? dKills  / dDeaths         : dKills > 0 ? dKills : null);
    const dAvgMotes = $derived(dEntered > 0 ? dMotes  / dEntered        : 0);
    const dAvgInv   = $derived(dEntered > 0 ? dInvasions / dEntered     : 0);

    // ── Season name map (Destiny 2 season numbers → display labels) ──────────
    const SEASON_NAMES = {
        19: '19: SERAPH',
        20: '20: DEFIANCE',
        21: '21: DEEP',
        22: '22: WITCH',
        23: '23: WISH',
        24: 'EP: ECHOES',
        25: 'EP: REVENANT',
        26: 'EP: HERESY',
        27: 'EDGE OF FATE',
    };

    // ── Percentile rank badges ──────────────────────────────────────────────
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

    // ── Tier labels ────────────────────────────────────────────────────────────
    function kdTier(kd) {
        if (kd == null)  return { label: 'UNRANKED',  color: 'text-zinc-600' };
        if (kd >= 2.5)   return { label: 'MYTHIC',    color: 'text-amber-400' };
        if (kd >= 1.5)   return { label: 'ELITE',     color: 'text-emerald-400' };
        if (kd >= 1.0)   return { label: 'VETERAN',   color: 'text-zinc-300' };
        return                   { label: 'STANDARD',  color: 'text-zinc-500' };
    }
    function winTier(wr) {
        if (wr == null) return { label: 'UNRANKED',   color: 'text-zinc-600' };
        if (wr >= 65)   return { label: 'DOMINANT',   color: 'text-amber-400' };
        if (wr >= 55)   return { label: 'STRONG',     color: 'text-emerald-400' };
        if (wr >= 45)   return { label: 'BALANCED',   color: 'text-zinc-300' };
        return                  { label: 'GRINDING',   color: 'text-zinc-500' };
    }
    function invTier(avg) {
        if (avg >= 2)   return { label: 'INVADER',    color: 'text-violet-400' };
        if (avg >= 1)   return { label: 'ACTIVE',     color: 'text-emerald-400' };
        if (avg >= 0.5) return { label: 'PASSIVE',    color: 'text-zinc-300' };
        return                  { label: 'SPECTATOR',  color: 'text-zinc-500' };
    }

    // ── Helpers ────────────────────────────────────────────────────────────────
    function matchResult(m) {
        const standing  = m.values?.standing?.basic?.value;
        const completed = m.values?.completed?.basic?.value;
        if (!completed) return 'dnf';
        return standing === 0 ? 'win' : 'loss';
    }
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

    async function claimProfile() {
        claiming = true;
        const res = await fetch('/api/claim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                membershipId:   data.player.membershipId,
                membershipType: data.player.membershipType,
                bungieName:     data.player.bungieGlobalDisplayName,
                bungieCode:     data.player.bungieGlobalDisplayNameCode
            })
        });
        if ((await res.json()).success) claimed = true;
        claiming = false;
    }

    // ── Tab definitions ────────────────────────────────────────────────────────
    const TABS = [
        { id: 'overview',  label: 'Overview'  },
        { id: 'matches',   label: 'Matches'   },
        { id: 'weaponry',  label: 'Weaponry'  },
        { id: 'synergy',   label: 'Synergy'   },
        { id: 'maps',      label: 'Maps'      },
        { id: 'pursuits',  label: 'Pursuits'  },
        { id: 'loadout',   label: 'Loadout'   },
        { id: 'subclass',  label: 'Subclass'  },
    ];

    const monogram = $derived(
        (data.player.bungieGlobalDisplayName ?? 'GD').slice(0, 2).toUpperCase()
    );

    // ── Achievement badges ─────────────────────────────────────────────────────
    // TODO: replace with real earned-achievement data from the API.
    // Each badge: { id, icon, label, desc, tier: 'common'|'rare'|'legendary'|'exotic'|'locked' }
    const ACHIEVEMENT_BADGES = [
        { id: 'elite_invader',   icon: '⚡', label: 'Elite Invader',    desc: 'Achievement criteria coming soon.',  tier: 'amber'   },
        { id: 'mote_hoarder',    icon: '◈',  label: 'Mote Hoarder',     desc: 'Achievement criteria coming soon.',  tier: 'emerald' },
        { id: 'ghost_protocol',  icon: '◉',  label: 'Ghost Protocol',   desc: 'Achievement criteria coming soon.',  tier: 'violet'  },
        { id: 'primeval_slayer', icon: '⬡',  label: 'Primeval Slayer',  desc: 'Achievement criteria coming soon.',  tier: 'emerald' },
        { id: 'veteran',         icon: '◆',  label: 'Veteran Guardian', desc: 'Achievement criteria coming soon.',  tier: 'zinc'    },
        { id: 'unknown_1',       icon: '?',  label: '???',              desc: 'This achievement has not been discovered yet.', tier: 'locked' },
    ];

    const tierStyle = {
        amber:   { border: 'border-amber-500/50',   glow: 'group-hover:shadow-[0_0_16px_rgba(245,158,11,0.4)]',   text: 'text-amber-400',   bg: 'group-hover:bg-amber-500/5',   hoverBorder: 'group-hover:border-amber-500/80'   },
        emerald: { border: 'border-emerald-500/50', glow: 'group-hover:shadow-[0_0_16px_rgba(16,185,129,0.4)]',   text: 'text-emerald-400', bg: 'group-hover:bg-emerald-500/5', hoverBorder: 'group-hover:border-emerald-500/80' },
        violet:  { border: 'border-violet-500/50',  glow: 'group-hover:shadow-[0_0_16px_rgba(139,92,246,0.4)]',   text: 'text-violet-400',  bg: 'group-hover:bg-violet-500/5',  hoverBorder: 'group-hover:border-violet-500/80'  },
        zinc:    { border: 'border-zinc-600',        glow: 'group-hover:shadow-[0_0_12px_rgba(161,161,170,0.2)]',  text: 'text-zinc-400',    bg: 'group-hover:bg-zinc-800/60',   hoverBorder: 'group-hover:border-zinc-400'       },
        locked:  { border: 'border-zinc-800',        glow: '',                                                       text: 'text-zinc-700',    bg: '',                             hoverBorder: 'group-hover:border-zinc-700'       },
    };
</script>

<!-- ── Full-height layout ──────────────────────────────────────────────────── -->
<div class="flex bg-[#080808]">

    <!-- ── Left sidebar ────────────────────────────────────────────────────── -->
    <aside class="w-16 sticky top-0 h-screen border-r border-zinc-800 bg-[#0a0a0a] flex flex-col items-center py-4 shrink-0 z-40">

        <!-- J Diamond logo -->
        <div class="relative w-9 h-9 mb-5 shrink-0">
            <div class="absolute inset-0 rotate-45 border border-emerald-500/50 bg-emerald-500/5"></div>
            <span class="absolute inset-0 flex items-center justify-center text-[11px] font-mono font-black text-emerald-400 select-none">J</span>
        </div>

        <!-- Nav icon buttons -->
        {#each [
            { id: 'overview', title: 'Overview',
              path: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
            { id: 'matches',  title: 'Matches',
              path: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
            { id: 'loadout',  title: 'Loadout',
              path: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
            { id: 'subclass', title: 'Subclass',
              path: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z' },
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
                {:else}
                    <span class="absolute inset-0 opacity-0 group-hover:opacity-100 bg-emerald-500/3 transition-opacity duration-200"></span>
                {/if}
                <!-- Slide-in tooltip -->
                <span class="absolute left-full ml-3 px-2 py-1 bg-[#111] border border-zinc-700
                             text-[8px] font-mono uppercase tracking-[0.2em] text-zinc-300
                             opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0
                             transition-all duration-200 pointer-events-none whitespace-nowrap z-50
                             shadow-[0_0_12px_rgba(0,0,0,0.5)]">
                    {nav.title}
                </span>
            </button>
        {/each}

        <div class="flex-1"></div>

        <!-- Character selector at bottom -->
        {#each data.characterIds as charId}
            {@const c   = data.characters[charId]}
            {@const cls = classNames[c?.classType] ?? '?'}
            <button onclick={() => { activeChar = charId; }}
                class="group relative w-10 h-10 flex items-center justify-center mb-1 transition-colors">
                <div class="w-7 h-7 rotate-45 border transition-all duration-300
                            {activeChar === charId
                                ? 'border-emerald-400 bg-emerald-500/10 shadow-[0_0_10px_rgba(52,211,153,0.25)]'
                                : 'border-zinc-700 bg-zinc-900 group-hover:border-zinc-400 group-hover:shadow-[0_0_8px_rgba(255,255,255,0.05)]'}">
                </div>
                <span class="absolute text-[8px] font-mono font-black leading-none transition-colors duration-200
                             {activeChar === charId ? 'text-emerald-400' : 'text-zinc-500 group-hover:text-zinc-200'}">
                    {cls[0]}
                </span>
                {#if activeChar === charId}
                    <span class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"></span>
                {/if}
                <!-- Tooltip -->
                <span class="absolute left-full ml-3 px-2 py-1.5 bg-[#111] border border-zinc-700
                             text-[8px] font-mono text-zinc-300 leading-relaxed
                             opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0
                             transition-all duration-200 pointer-events-none whitespace-nowrap z-50
                             shadow-[0_0_12px_rgba(0,0,0,0.5)]">
                    <span class="uppercase tracking-[0.2em] text-zinc-400 block">{cls}</span>
                    {#if c?.light}<span class="text-emerald-400">{c.light} PL</span>{/if}
                </span>
            </button>
        {/each}

        <!-- Claim button -->
        {#if data.canClaim && !claimed}
            <button onclick={claimProfile} disabled={claiming} title="Claim profile"
                class="w-10 h-10 flex items-center justify-center text-zinc-600 hover:text-emerald-400
                       transition-colors disabled:opacity-40 mt-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round"
                          d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/>
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

    <!-- ── Right panel ─────────────────────────────────────────────────────── -->
    <div class="flex-1 flex flex-col min-w-0">

        <!-- ── Hero header ──────────────────────────────────────────────────── -->
        <header onmousemove={onHeroMouseMove} onmouseleave={onHeroMouseLeave}
                class="relative h-64 shrink-0 overflow-hidden border-b border-zinc-800">

            <!-- Parallax background -->
            <div class="absolute inset-[-40px] z-0 transition-transform duration-100 ease-out"
                 style="transform:translate({mouseX}px,{mouseY}px)">
                {#if data.emblemBg}
                    <img src={data.emblemBg} alt=""
                         class="w-full h-full object-cover grayscale-[0.3] opacity-30 contrast-125 scale-110" />
                {:else}
                    <div class="w-full h-full bg-gradient-to-br from-zinc-900 to-[#080808]"></div>
                {/if}
                <div class="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/80 to-transparent z-10"></div>
            </div>
            <!-- Scanlines -->
            <div class="absolute inset-0 opacity-[0.02] pointer-events-none z-10"
                 style="background-image:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,255,255,0.5) 2px,rgba(255,255,255,0.5) 3px)"></div>

            <!-- ── Main content row ──────────────────────────────────────── -->
            <div class="relative z-20 flex items-end gap-10 h-full px-8 pb-8 max-w-7xl">

                <!-- Avatar box + rank medallion -->
                <div class="group/avatar relative shrink-0 cursor-default">
                    <div class="w-32 h-32 bg-[#0c0c0c] border border-zinc-700 p-1.5 relative shadow-2xl overflow-hidden
                                transition-all duration-300
                                group-hover/avatar:border-zinc-500
                                group-hover/avatar:shadow-[0_0_24px_rgba(255,255,255,0.06)]">
                        <!-- Grid texture -->
                        <div class="absolute inset-0 opacity-[0.06]"
                             style="background-image:linear-gradient(rgba(255,255,255,0.15) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.15) 1px,transparent 1px);background-size:16px 16px"></div>
                        <!-- Corner accents -->
                        <div class="absolute top-0 left-0 w-3 h-3 border-t border-l border-zinc-400/60 z-10"></div>
                        <div class="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-zinc-400/60 z-10"></div>
                        <!-- Monogram -->
                        <div class="w-full h-full flex items-center justify-center relative z-0">
                            <span class="font-serif text-5xl font-black italic text-zinc-700 select-none
                                         transition-colors duration-300 group-hover/avatar:text-zinc-500">
                                {monogram}
                            </span>
                        </div>
                    </div>

                    <!-- Rank icon placeholder — bottom-right (will hold tier icon for top 100/50/10/3/2/1) -->
                    <div class="group/rank absolute -bottom-4 -right-4 z-20 cursor-default">
                        <div class="w-12 h-12 relative transition-all duration-500
                                    group-hover/rank:scale-110 group-hover/rank:rotate-[135deg]">
                            <!-- Diamond shell -->
                            <div class="absolute inset-0 rotate-45 border-2 bg-[#070707]
                                        transition-all duration-500
                                        {gambitRank === 'Legend'  ? 'border-amber-400  shadow-[0_0_14px_rgba(251,191,36,0.6)]'  :
                                         gambitRank === 'Mythic'  ? 'border-violet-400 shadow-[0_0_14px_rgba(167,139,250,0.5)]' :
                                         gambitRank === 'Fabled'  ? 'border-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.5)]' :
                                         gambitRank === 'Heroic'  ? 'border-blue-400   shadow-[0_0_10px_rgba(96,165,250,0.4)]'  :
                                                                    'border-zinc-600'}
                                        group-hover/rank:shadow-[0_0_24px_rgba(16,185,129,0.7)]
                                        group-hover/rank:border-emerald-300"></div>
                            <!-- Rank initial (counter-rotates to stay upright) -->
                            <div class="absolute inset-0 flex items-center justify-center
                                        transition-all duration-500 group-hover/rank:-rotate-[135deg]">
                                <span class="text-[11px] font-mono font-black leading-none
                                             {gambitRank === 'Legend' ? 'text-amber-400' :
                                              gambitRank === 'Mythic' ? 'text-violet-400' :
                                              gambitRank === 'Fabled' ? 'text-emerald-400' :
                                              gambitRank === 'Heroic' ? 'text-blue-400' : 'text-zinc-500'}">
                                    {gambitRank[0]}
                                </span>
                            </div>
                        </div>
                        <!-- Rank tooltip -->
                        <div class="absolute bottom-full right-0 mb-2 z-30
                                    opacity-0 group-hover/rank:opacity-100
                                    translate-y-1 group-hover/rank:translate-y-0
                                    transition-all duration-200 pointer-events-none whitespace-nowrap">
                            <div class="bg-[#111] border border-zinc-700 px-3 py-2 shadow-[0_0_16px_rgba(0,0,0,0.8)] text-right">
                                <span class="text-[8px] font-mono font-bold text-emerald-400 block">{gambitRank}</span>
                                <div class="w-16 h-px bg-zinc-800 mt-1.5 ml-auto">
                                    <div class="h-full bg-emerald-400/70" style="width:{gambitPct}%"></div>
                                </div>
                                <span class="text-[7px] font-mono text-zinc-600 mt-0.5 block">{gambitPct}% to next tier</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Identity block -->
                <div class="flex-1 min-w-0 mb-1">
                    <span class="text-[9px] font-mono uppercase tracking-[0.3em] text-emerald-500/60 block mb-1">Guardian Profile</span>
                    <h1 class="font-serif text-6xl font-light italic tracking-tighter uppercase leading-none text-white
                               drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)] mb-2 anim-in truncate">
                        {data.player.bungieGlobalDisplayName}<span class="font-mono text-xl text-zinc-600 not-italic tracking-normal ml-1">#{String(data.player.bungieGlobalDisplayNameCode).padStart(4,'0')}</span>
                    </h1>
                    <!-- Clan + class -->
                    <div class="flex items-center gap-3 mb-6">
                        {#if data.clan}
                            <a href="/clan/{data.clan.groupId}"
                               class="text-[11px] font-sans text-zinc-400 uppercase tracking-[0.2em] font-medium
                                      hover:text-zinc-200 transition-colors">
                                [{data.clan.name}]
                            </a>
                        {/if}
                        {#if classNames[char.classType]}
                            <span class="text-[11px] font-sans uppercase tracking-[0.15em] text-zinc-600">
                                {classNames[char.classType]}{raceNames[char.raceType] ? ' · ' + raceNames[char.raceType] : ''}
                            </span>
                        {/if}
                    </div>
                    <!-- Medal badges row -->
                    <div class="flex items-center gap-5">
                        {#each ACHIEVEMENT_BADGES as badge}
                            {@const ts = tierStyle[badge.tier]}
                            <div class="group relative cursor-default select-none">
                                <div class="w-8 h-8 relative transition-all duration-300 ease-out
                                            group-hover:scale-125">
                                    <div class="absolute inset-0 rotate-45 border {ts.border} bg-[#0c0c0c]
                                                transition-all duration-300
                                                {badge.tier !== 'locked' ? ts.glow : ''}
                                                group-hover:{ts.hoverBorder}
                                                group-hover:rotate-[90deg]"></div>
                                    <div class="absolute inset-0 flex items-center justify-center
                                                transition-all duration-300">
                                        <span class="text-[11px] leading-none {ts.text}
                                                     {badge.tier === 'locked' ? 'opacity-20' : 'opacity-80 group-hover:opacity-100'}">
                                            {badge.icon}
                                        </span>
                                    </div>
                                </div>
                                <!-- Tooltip -->
                                <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-40
                                            opacity-0 group-hover:opacity-100
                                            translate-y-1 group-hover:translate-y-0
                                            transition-all duration-200 pointer-events-none whitespace-nowrap">
                                    <div class="bg-[#111] border border-zinc-700/80 px-3 py-2 shadow-[0_0_16px_rgba(0,0,0,0.8)] text-center">
                                        <div class="w-full h-px mb-1.5
                                            {badge.tier==='amber' ? 'bg-amber-500/50' : badge.tier==='emerald' ? 'bg-emerald-500/50' :
                                             badge.tier==='violet' ? 'bg-violet-500/50' : badge.tier==='zinc' ? 'bg-zinc-600/50' : 'bg-zinc-800'}"></div>
                                        <span class="text-[9px] font-mono font-bold {ts.text} block">{badge.label}</span>
                                        <span class="text-[7px] font-sans text-zinc-600 block mt-0.5 max-w-[140px] whitespace-normal leading-relaxed">{badge.desc}</span>
                                    </div>
                                    <div class="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px] border-l-transparent border-r-transparent border-t-zinc-700/80 mx-auto"></div>
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>

                <!-- Rating section -->
                <div class="group/ego shrink-0 text-right mb-1 cursor-default select-none">
                    <span class="text-[8px] font-sans uppercase tracking-[0.35em] text-zinc-500 block mb-1">Rating</span>
                    <span class="text-5xl font-sans font-light tracking-tighter text-white leading-none block
                                 transition-all duration-300 group-hover/ego:drop-shadow-[0_0_16px_rgba(255,255,255,0.2)]">
                        {egoRating.toLocaleString()}
                    </span>
                    <span class="text-[10px] font-sans italic tracking-[0.3em] text-emerald-500 font-bold
                                 uppercase block mt-2 drop-shadow-md">
                        #{gambitRank.toUpperCase()}
                    </span>
                    <div class="w-24 h-px bg-zinc-800 mt-3 ml-auto">
                        <div class="h-full bg-emerald-400/70 transition-all" style="width:{gambitPct}%"></div>
                    </div>
                    <span class="text-[7px] font-mono text-zinc-700 mt-1 block">{gambitPct}% TO NEXT TIER</span>
                    <!-- Formula tooltip -->
                    <div class="absolute top-1/2 -translate-y-1/2 right-full mr-4 z-30
                                opacity-0 group-hover/ego:opacity-100
                                translate-x-2 group-hover/ego:translate-x-0
                                transition-all duration-200 pointer-events-none whitespace-nowrap">
                        <div class="bg-[#111] border border-zinc-700 px-4 py-3 text-left shadow-[0_0_20px_rgba(0,0,0,0.7)]">
                            <span class="text-[8px] font-mono uppercase tracking-[0.25em] text-zinc-500 block mb-2">EGO Formula</span>
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
            </div>

            <!-- Bottom accent line -->
            <div class="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-emerald-500/30 via-transparent to-transparent z-20"></div>
        </header>

        <!-- ── Tab nav strip ────────────────────────────────────────────────── -->
        <div class="h-14 bg-[#0d0d0d] border-b border-zinc-800 flex items-end shrink-0 sticky top-0 z-30">
            {#each TABS as t}
                <button onclick={() => tab = t.id}
                    class="text-[10px] font-sans uppercase tracking-[0.3em] h-10 px-6 relative
                           transition-all duration-300 font-bold border-t border-x border-transparent
                           flex-shrink-0 whitespace-nowrap
                           {tab === t.id
                               ? 'text-white bg-[#151515] border-zinc-700/50 shadow-[inset_0_2px_5px_rgba(255,255,255,0.05)]'
                               : 'text-zinc-600 hover:text-zinc-300'}">
                    {t.label}
                    {#if tab === t.id}
                        <!-- Emerald bottom line with glow -->
                        <span class="absolute bottom-0 left-0 w-full h-px bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.9)] z-20 pointer-events-none"></span>
                        <!-- Spread glow below tab -->
                        <span class="absolute top-full left-1/2 -translate-x-1/2 w-[180%] h-10 bg-emerald-500/10 blur-2xl pointer-events-none opacity-80 z-10"></span>
                    {/if}
                </button>
            {/each}
        </div>

        <!-- ── Tab content ───────────────────────────────────────────────────── -->
        <main class="bg-[#080808]">

        {#key tab}
        <div in:fly={{ y: 16, duration: 320, opacity: 0 }}>

            <!-- ── DetailRow snippet (label | value | rank badge) ───────────── -->
            {#snippet DetailRow(label, value, rank)}
                <div class="flex items-center justify-between gap-2 py-1.5 border-b border-zinc-800/40 last:border-0">
                    <span class="text-[8px] font-mono uppercase tracking-[0.15em] text-zinc-600 shrink-0">{label}</span>
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="text-[13px] font-mono font-bold leading-none
                                     {rank ? rank.color : 'text-zinc-200'}">{value}</span>
                        {#if rank}
                            <span class="text-[7px] font-mono font-bold uppercase tracking-wide shrink-0
                                         {rank.color} border border-current/30 px-1.5 py-px">{rank.label}</span>
                        {/if}
                    </div>
                </div>
            {/snippet}

            <!-- ══ OVERVIEW ═════════════════════════════════════════════════════ -->
            {#if tab === 'overview'}
                {#if !data.lifetimeStats}
                    <div class="flex items-center justify-center h-full">
                        <p class="text-[11px] font-mono uppercase tracking-[0.2em] text-zinc-600">
                            No Gambit stats found for this Guardian.
                        </p>
                    </div>
                {:else}
                    <div class="p-6 space-y-5">

                        <!-- ── SEASONAL HISTORY header + scrollable season pills ── -->
                        <div class="relative border-b border-zinc-800/50 pb-3 anim-in">
                            <div class="flex items-center gap-2 mb-3">
                                <span class="text-[8px] font-mono uppercase tracking-[0.35em] text-zinc-600">Seasonal History</span>
                                {#if seasonalLoading}
                                    <div class="w-3 h-3 border border-zinc-700 border-t-emerald-400 animate-spin"></div>
                                {/if}
                            </div>
                            <!-- Mouse-wheel-scrollable season tabs -->
                            <div class="flex overflow-x-auto gap-1 no-scrollbar scroll-smooth cursor-grab active:cursor-grabbing"
                                 onwheel={(e) => { e.currentTarget.scrollLeft += e.deltaY; e.preventDefault(); }}>
                                <button onclick={() => seasonFilter = 'all'}
                                        class="flex-shrink-0 px-4 py-1.5 text-[9px] font-mono uppercase tracking-[0.2em]
                                               transition-all border relative overflow-hidden
                                               {seasonFilter === 'all'
                                                   ? 'text-emerald-400 bg-zinc-900/60 border-zinc-700 font-bold'
                                                   : 'text-zinc-600 border-zinc-800/50 hover:text-zinc-400 hover:border-zinc-700'}">
                                    All-Time
                                    {#if seasonFilter === 'all'}
                                        <div class="absolute bottom-0 left-0 w-full h-[2px] bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)]"></div>
                                    {/if}
                                </button>
                                {#if seasonal?.seasons?.length}
                                    {#each [...seasonal.seasons].sort((a,b) => b.seasonNumber - a.seasonNumber) as s}
                                        {@const sLabel = SEASON_NAMES[s.seasonNumber] ?? `S${s.seasonNumber}`}
                                        <button onclick={() => seasonFilter = s.season}
                                                class="flex-shrink-0 px-4 py-1.5 text-[9px] font-mono uppercase tracking-[0.2em]
                                                       transition-all border relative overflow-hidden
                                                       {seasonFilter === s.season
                                                           ? 'text-emerald-400 bg-zinc-900/60 border-zinc-700 font-bold'
                                                           : 'text-zinc-600 border-zinc-800/50 hover:text-zinc-400 hover:border-zinc-700'}">
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
                        {@const motR = motesRank(dAvgMotes)}
                        <div class="grid grid-cols-4 gap-3">

                            <!-- Win Ratio -->
                            <div class="relative bg-[#111111] border border-zinc-800 p-4 overflow-hidden stone-sheen anim-in transition-all hover:border-zinc-600">
                                <span class="absolute top-0 left-0 w-2 h-2 border-t border-l border-emerald-500/20"></span>
                                <span class="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-emerald-500/20"></span>
                                <span class="text-[8px] font-mono uppercase tracking-[0.25em] text-zinc-600 block mb-2">Win Ratio</span>
                                <div class="flex items-baseline justify-between gap-1">
                                    <span class="text-[28px] font-mono font-bold leading-none text-zinc-100">
                                        {dWinRate != null ? fmtF(dWinRate, 1) + '%' : '—'}
                                    </span>
                                    <span class="text-[9px] font-mono text-zinc-600 text-right shrink-0 leading-tight">
                                        {fmt(dWon)}<br/>wins
                                    </span>
                                </div>
                            </div>

                            <!-- K/D/A -->
                            <div class="relative bg-[#111111] border border-zinc-800 p-4 overflow-hidden stone-sheen anim-in anim-in-d1 transition-all hover:border-zinc-600">
                                <span class="absolute top-0 left-0 w-2 h-2 border-t border-l border-emerald-500/20"></span>
                                <span class="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-emerald-500/20"></span>
                                <span class="text-[8px] font-mono uppercase tracking-[0.25em] text-zinc-600 block mb-2">K/D/A</span>
                                <div class="flex items-baseline justify-between gap-1">
                                    <span class="text-[28px] font-mono font-bold leading-none text-zinc-100">
                                        {dKD != null ? fmtF(dKD, 2) : '—'}
                                    </span>
                                    <span class="text-[9px] font-mono text-zinc-600 text-right shrink-0 leading-tight">
                                        {fmt(dKills)}<br/>kills
                                    </span>
                                </div>
                            </div>

                            <!-- Motes Avg -->
                            <div class="relative bg-[#111111] border border-zinc-800 p-4 overflow-hidden stone-sheen anim-in anim-in-d2 transition-all hover:border-zinc-600">
                                <span class="absolute top-0 left-0 w-2 h-2 border-t border-l border-emerald-500/20"></span>
                                <span class="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-emerald-500/20"></span>
                                <span class="text-[8px] font-mono uppercase tracking-[0.25em] text-zinc-600 block mb-2">Motes Avg</span>
                                <div class="flex items-baseline justify-between gap-1">
                                    <span class="text-[28px] font-mono font-bold leading-none
                                                 {motR ? 'text-emerald-400' : 'text-zinc-100'}">
                                        {dEntered > 0 ? fmtF(dAvgMotes, 1) : '—'}
                                    </span>
                                    {#if motR}
                                        <span class="text-[9px] font-mono font-bold {motR.color} text-right shrink-0">{motR.label}</span>
                                    {:else}
                                        <span class="text-[9px] font-mono text-zinc-600 text-right shrink-0 leading-tight">
                                            {fmt(dMotes)}<br/>total
                                        </span>
                                    {/if}
                                </div>
                            </div>

                            <!-- Avg Invasions — amber italic + bar (like Primeval DPS) -->
                            <div class="relative bg-gradient-to-br from-[#111111] to-[#0a0a0a] border border-zinc-800 p-4 overflow-hidden anim-in anim-in-d3 transition-all hover:border-zinc-700">
                                <span class="absolute top-0 left-0 w-2 h-2 border-t border-l border-amber-500/20"></span>
                                <span class="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-amber-500/20"></span>
                                <span class="text-[8px] font-mono uppercase tracking-[0.25em] text-zinc-600 block mb-2">Avg Invasions</span>
                                <div class="flex items-center gap-2">
                                    <span class="text-[28px] font-mono font-bold leading-none text-amber-500 italic">
                                        {dEntered > 0 ? fmtF(dAvgInv, 2) : '—'}
                                    </span>
                                    <div class="flex-1 h-px bg-zinc-800 relative top-1 overflow-hidden">
                                        <div class="h-full bg-amber-600/80 transition-all duration-700"
                                             style="width:{Math.min((dAvgInv / 3) * 100, 100)}%"></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- ── 3 detail cards: Combat / Objectives / Invasion ── -->
                        <div class="grid grid-cols-3 gap-4">

                            <!-- COMBAT -->
                            <div class="bg-[#111111] border border-zinc-800 overflow-hidden stone-sheen anim-in anim-in-d1 transition-all duration-300 hover:border-zinc-700">
                                <div class="px-4 py-3 border-b border-zinc-800/60">
                                    <span class="text-[9px] font-mono uppercase tracking-[0.3em] text-zinc-500">Combat</span>
                                </div>
                                <div class="px-4 py-3">
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
                            <div class="bg-[#111111] border border-zinc-800 overflow-hidden stone-sheen anim-in anim-in-d2 transition-all duration-300 hover:border-zinc-700">
                                <div class="px-4 py-3 border-b border-zinc-800/60">
                                    <span class="text-[9px] font-mono uppercase tracking-[0.3em] text-zinc-500">Objectives</span>
                                </div>
                                <div class="px-4 py-3">
                                    {@render DetailRow('Deposited', fmt(dMotes),     winRateRank(dWinRate))}
                                    {@render DetailRow('Lost',      fmt(dMotesLost), null)}
                                    {@render DetailRow('Matches',   fmt(dEntered),   null)}
                                    {@render DetailRow('Wins',      fmt(dWon),       null)}
                                </div>
                            </div>

                            <!-- INVASION -->
                            <div class="bg-[#111111] border border-zinc-800/80 overflow-hidden stone-sheen anim-in anim-in-d3 transition-all duration-300 hover:border-zinc-700">
                                <div class="px-4 py-3 border-b border-zinc-800/60">
                                    <span class="text-[9px] font-mono uppercase tracking-[0.3em] text-zinc-500">Invasion</span>
                                </div>
                                <div class="px-4 py-3">
                                    {@render DetailRow('Guardians',  fmt(dInvKills),  invRank(dAvgInv))}
                                    {@render DetailRow('Army of One', fmt(dInvasions), null)}
                                    {@render DetailRow('Stopped',    fmt(dInvDef),    null)}
                                    {@render DetailRow('Per Game',   dEntered > 0 ? fmtF(dAvgInv, 2) : '—', null)}
                                </div>
                            </div>
                        </div>

                        <!-- Recent matches preview -->
                        {#if data.recentMatches.length}
                            <div>
                                <div class="flex items-center gap-4 mb-3">
                                    <div class="w-1 h-4 bg-emerald-500/50"></div>
                                    <span class="text-[9px] font-mono uppercase tracking-[0.35em] text-zinc-500">Recent Matches</span>
                                    <button onclick={() => tab = 'matches'}
                                        class="ml-auto text-[8px] font-mono uppercase tracking-[0.2em] text-emerald-500 hover:text-emerald-400 transition-colors">
                                        View all →
                                    </button>
                                </div>
                                <div class="border border-zinc-800 bg-[#0a0a0a] divide-y divide-zinc-800/50">
                                    {#each data.recentMatches.slice(0, 5) as match}
                                        {@const result     = matchResult(match)}
                                        {@const instanceId = match.activityDetails?.instanceId}
                                        {@const mb         = match.extended?.values?.motesDeposited?.basic?.value ?? null}
                                        {@const inv        = match.extended?.values?.invasions?.basic?.value      ?? null}
                                        <a href={instanceId ? `/match/${instanceId}` : undefined}
                                           class="flex items-center gap-4 px-4 py-3 hover:bg-zinc-900/40 transition-colors group">
                                            <span class="text-[9px] font-mono font-bold w-8 text-center py-1 border shrink-0
                                                         {result === 'win'  ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/5' :
                                                          result === 'loss' ? 'border-red-500/40 text-red-400 bg-red-500/5'            :
                                                                              'border-zinc-700 text-zinc-500'}">
                                                {result === 'win' ? 'W' : result === 'loss' ? 'L' : 'DNF'}
                                            </span>
                                            <span class="text-[9px] font-mono text-zinc-600 w-14 shrink-0">{timeAgo(match.period)}</span>
                                            <span class="text-[11px] font-mono text-zinc-300 flex-1">
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
                    <div class="flex items-center gap-4 mb-4">
                        <div class="w-1 h-4 bg-emerald-500/50"></div>
                        <span class="text-[9px] font-mono uppercase tracking-[0.35em] text-zinc-500">Match History</span>
                        <span class="ml-auto text-[9px] font-sans text-zinc-600">{data.recentMatches.length} recent matches</span>
                    </div>

                    {#if !data.recentMatches.length}
                        <div class="flex flex-col items-center justify-center h-40 gap-3">
                            <div class="w-6 h-6 border border-zinc-700 rotate-45"></div>
                            <span class="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-600">
                                No recent Gambit matches found
                            </span>
                        </div>
                    {:else}
                        <div class="border border-zinc-800 bg-[#0a0a0a] divide-y divide-zinc-800/50">
                            {#each data.recentMatches as match}
                                {@const result     = matchResult(match)}
                                {@const k          = match.values?.kills?.basic?.value                   ?? 0}
                                {@const d          = match.values?.deaths?.basic?.value                  ?? 0}
                                {@const a          = match.values?.assists?.basic?.value                 ?? 0}
                                {@const dur        = match.values?.activityDurationSeconds?.basic?.value ?? 0}
                                {@const mb         = match.extended?.values?.motesDeposited?.basic?.value ?? null}
                                {@const inv        = match.extended?.values?.invasions?.basic?.value      ?? null}
                                {@const instanceId = match.activityDetails?.instanceId}
                                <a href={instanceId ? `/match/${instanceId}` : undefined}
                                   class="flex items-center gap-3 px-4 py-3 hover:bg-zinc-900/40 transition-colors group
                                          border-l-2
                                          {result === 'win'  ? 'border-l-emerald-500' :
                                           result === 'loss' ? 'border-l-red-500'     : 'border-l-zinc-800'}">
                                    <!-- Result badge -->
                                    <span class="text-[9px] font-mono font-bold w-8 text-center py-1 border shrink-0
                                                 {result === 'win'  ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/5' :
                                                  result === 'loss' ? 'border-red-500/40 text-red-400 bg-red-500/5'            :
                                                                      'border-zinc-700 text-zinc-500'}">
                                        {result === 'win' ? 'W' : result === 'loss' ? 'L' : 'DNF'}
                                    </span>
                                    <!-- Date -->
                                    <span class="text-[9px] font-mono text-zinc-600 w-14 shrink-0">{timeAgo(match.period)}</span>
                                    <!-- K/D/A -->
                                    <div class="flex items-center gap-1 text-[11px] font-mono flex-1">
                                        <span class="text-zinc-200">{k}</span>
                                        <span class="text-zinc-700">/</span>
                                        <span class="text-zinc-400">{d}</span>
                                        <span class="text-zinc-700">/</span>
                                        <span class="text-zinc-500">{a}</span>
                                        <span class="text-[7px] font-sans text-zinc-700 ml-1">K/D/A</span>
                                    </div>
                                    <!-- Motes -->
                                    {#if mb !== null}
                                        <span class="text-[10px] font-sans shrink-0 hidden sm:block
                                                     {mb >= 15 ? 'text-emerald-400' : 'text-zinc-600'}">
                                            {mb} MB
                                        </span>
                                    {/if}
                                    <!-- Invasions -->
                                    {#if inv !== null && inv > 0}
                                        <span class="text-[10px] font-sans text-violet-400 shrink-0 hidden sm:block">{inv} INV</span>
                                    {/if}
                                    <!-- Duration -->
                                    {#if dur}
                                        <span class="text-[10px] font-sans text-zinc-700 hidden lg:block shrink-0">
                                            {Math.floor(dur/60)}m {dur%60}s
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
                    {/if}
                </div>

            <!-- ══ COMING SOON TABS ══════════════════════════════════════════════ -->
            {:else if tab === 'weaponry' || tab === 'synergy' || tab === 'maps' || tab === 'pursuits'}
                <div class="flex flex-col items-center justify-center h-full gap-4 py-24">
                    <div class="w-8 h-8 border border-zinc-700 rotate-45 mb-2"></div>
                    <span class="text-[11px] font-mono uppercase tracking-[0.25em] text-zinc-500">
                        {TABS.find(t => t.id === tab)?.label} — Coming Soon
                    </span>
                    <p class="text-[9px] font-sans text-zinc-700 max-w-xs text-center leading-relaxed">
                        This section is under construction. Check back in a future update.
                    </p>
                </div>

            <!-- ══ LOADOUT ═══════════════════════════════════════════════════════ -->
            {:else if tab === 'loadout'}
                {#if loadoutLoading}
                    <div class="flex flex-col items-center justify-center h-64 gap-3">
                        <div class="w-5 h-5 border border-zinc-700 border-t-emerald-400 animate-spin"></div>
                        <span class="text-[9px] font-mono uppercase tracking-[0.2em] text-zinc-600">Loading loadout…</span>
                    </div>
                {:else if !loadout}
                    <div class="flex items-center justify-center h-64">
                        <span class="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-700">
                            Loadout data unavailable.
                        </span>
                    </div>
                {:else}
                    <div class="p-6">
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
                        <span class="text-[9px] font-mono uppercase tracking-[0.2em] text-zinc-600">Loading subclass…</span>
                    </div>
                {:else if !loadout}
                    <div class="flex items-center justify-center h-64">
                        <span class="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-700">
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
    </div>
</div>
