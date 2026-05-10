<script>
    import { untrack } from 'svelte';
    import SubclassScreen from '$lib/SubclassScreen.svelte';
    import CharacterScreen from '$lib/CharacterScreen.svelte';
    import StoneCard from '$lib/StoneCard.svelte';

    let { data } = $props();

    // ── Lookups ────────────────────────────────────────────────────────────────
    const classNames = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' };
    const raceNames  = { 0: 'Human', 1: 'Awoken', 2: 'Exo' };

    // ── State ──────────────────────────────────────────────────────────────────
    let tab        = $state('overview');
    let activeChar = $state(untrack(() => data.characterIds[0] ?? null));
    let claiming   = $state(false);
    let claimed    = $state(false);
    $effect(() => { claimed = data.isClaimed; });

    // Parallax effect for hero header
    let heroEl   = $state(null);
    let mouseX   = $state(50);
    let mouseY   = $state(50);

    function onHeroMouseMove(e) {
        if (!heroEl) return;
        const r = heroEl.getBoundingClientRect();
        mouseX = ((e.clientX - r.left) / r.width)  * 100;
        mouseY = ((e.clientY - r.top)  / r.height) * 100;
    }
    function onHeroMouseLeave() { mouseX = 50; mouseY = 50; }

    // ── Lazy loadout state ─────────────────────────────────────────────────────
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
        } catch (e) {
            console.error('Loadout fetch failed', e);
        } finally {
            loadoutLoading = false;
        }
    }

    // ── Lazy seasonal stats state ──────────────────────────────────────────────
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
        } catch (e) {
            console.error('Seasonal fetch failed', e);
        } finally {
            seasonalLoading = false;
        }
    }

    $effect(() => {
        if ((tab === 'loadout' || tab === 'subclass') && activeChar && activeChar !== loadoutCharId) {
            fetchLoadout();
        }
    });
    $effect(() => {
        if (tab === 'seasons' && !seasonal && !seasonalLoading) fetchSeasonal();
    });

    // ── Derived ────────────────────────────────────────────────────────────────
    const char    = $derived(data.characters[activeChar] ?? {});
    const eq      = $derived(loadout?.equipment ?? {});
    const sockets = $derived(eq.subclassSockets ?? {});

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

    // Lifetime stat helpers
    const ls = $derived(data.lifetimeStats ?? {});
    function sv(key)  { return ls[key]?.basic?.value        ?? 0; }
    function sdv(key) { return ls[key]?.basic?.displayValue ?? '—'; }

    const entered = $derived(sv('activitiesEntered'));
    const won     = $derived(sv('activitiesWon'));
    const kills   = $derived(sv('kills'));
    const deaths  = $derived(sv('deaths'));
    const winRate = $derived(entered > 0 ? ((won / entered) * 100).toFixed(1) : '—');
    const kd      = $derived(deaths  > 0 ? (kills / deaths).toFixed(2)        : kills);

    const armorStatMeta = $derived(loadout?.armorStatMeta ?? []);
    const totalStats    = $derived((() => {
        if (!armorStatMeta.length) return {};
        const slots  = ['helmet','gauntlets','chest','legs','classItem'];
        const totals = {};
        for (const m of armorStatMeta) totals[m.name] = 0;
        for (const slot of slots) {
            const item = eq[slot];
            if (item?.armorStats) for (const s of item.armorStats) totals[s.name] += s.value;
        }
        return totals;
    })());

    // Helpers
    function matchResult(m) {
        const standing  = m.values?.standing?.basic?.value;
        const completed = m.values?.completed?.basic?.value;
        if (!completed) return 'dnf';
        return standing === 0 ? 'win' : 'loss';
    }
    function fmt(n) { return Number.isFinite(n) ? n.toLocaleString() : '—'; }
    function timeAgo(iso) {
        const diff = Date.now() - new Date(iso).getTime();
        const m    = Math.floor(diff / 60000);
        if (m < 60) return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h ago`;
        return `${Math.floor(h / 24)}d ago`;
    }

    // Claim
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

    // Tab definitions
    const TABS = [
        { id: 'overview', label: 'Overview',  icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
        { id: 'seasons',  label: 'Seasons',   icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
        { id: 'matches',  label: 'Matches',   icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
        { id: 'loadout',  label: 'Loadout',   icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
        { id: 'subclass', label: 'Subclass',  icon: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z' },
    ];
</script>

<!-- ── Full-height layout ──────────────────────────────────────────────────── -->
<div class="flex h-[calc(100vh-56px)] bg-[#080808] overflow-hidden">

    <!-- ── Left sidebar — icon nav ──────────────────────────────────────────── -->
    <aside class="w-14 border-r border-zinc-800 bg-[#0a0a0a] flex flex-col items-center py-4 gap-1 shrink-0 overflow-y-auto scrollbar-hide">

        <!-- Character selector -->
        {#each data.characterIds as charId, ci}
            {@const c   = data.characters[charId]}
            {@const cls = classNames[c?.classType] ?? '?'}
            <button
                onclick={() => { activeChar = charId; }}
                title="{cls} · {c?.light ?? ''}"
                class="relative w-9 h-9 flex items-center justify-center mb-1
                       transition-colors group
                       {activeChar === charId
                           ? 'text-emerald-400'
                           : 'text-zinc-600 hover:text-zinc-300'}">
                <!-- Diamond -->
                <div class="w-7 h-7 rotate-45 border transition-colors
                            {activeChar === charId
                                ? 'border-emerald-400 bg-emerald-500/10'
                                : 'border-zinc-700 bg-zinc-900 group-hover:border-zinc-500'}">
                </div>
                <span class="absolute text-[8px] font-mono font-black -rotate-0 leading-none
                             {activeChar === charId ? 'text-emerald-400' : 'text-zinc-500 group-hover:text-zinc-300'}">
                    {cls[0]}
                </span>
                <!-- Active indicator -->
                {#if activeChar === charId}
                    <span class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-emerald-400
                                 shadow-[0_0_6px_rgba(52,211,153,0.8)]"></span>
                {/if}
            </button>
        {/each}

        <!-- Divider -->
        <div class="w-6 border-t border-zinc-800 my-2"></div>

        <!-- Tab icon buttons -->
        {#each TABS as t}
            <button
                onclick={() => tab = t.id}
                title={t.label}
                class="relative w-9 h-9 flex items-center justify-center transition-colors group
                       {tab === t.id
                           ? 'text-emerald-400'
                           : 'text-zinc-600 hover:text-zinc-400'}">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d={t.icon} />
                </svg>
                <!-- Active indicator -->
                {#if tab === t.id}
                    <span class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-emerald-400
                                 shadow-[0_0_6px_rgba(52,211,153,0.8)]"></span>
                    <span class="absolute inset-0 bg-emerald-500/5"></span>
                {/if}
            </button>
        {/each}

        <div class="flex-1"></div>

        <!-- Claim -->
        {#if data.canClaim && !claimed}
            <button
                onclick={claimProfile}
                disabled={claiming}
                title="Claim profile"
                class="w-9 h-9 flex items-center justify-center text-zinc-600 hover:text-emerald-400
                       transition-colors disabled:opacity-40">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round"
                          d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/>
                </svg>
            </button>
        {:else if claimed}
            <div class="w-9 h-9 flex items-center justify-center text-emerald-400" title="Profile claimed">
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                </svg>
            </div>
        {/if}
    </aside>

    <!-- ── Right panel ───────────────────────────────────────────────────────── -->
    <div class="flex-1 flex flex-col overflow-hidden">

        <!-- ── Hero header ────────────────────────────────────────────────────── -->
        <header
            bind:this={heroEl}
            onmousemove={onHeroMouseMove}
            onmouseleave={onHeroMouseLeave}
            class="relative h-52 shrink-0 overflow-hidden border-b border-zinc-800">

            <!-- Emblem parallax background -->
            {#if data.emblemBg}
                <img src={data.emblemBg} alt=""
                     class="absolute inset-0 w-full h-full object-cover object-center opacity-30
                            transition-transform duration-75 ease-out scale-110"
                     style="transform: translate({(mouseX - 50) * -0.06}%, {(mouseY - 50) * -0.06}%) scale(1.1)" />
            {/if}

            <!-- Dark gradient overlays -->
            <div class="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/50 to-transparent"></div>
            <div class="absolute inset-0 bg-gradient-to-r from-[#080808]/90 via-transparent to-transparent"></div>

            <!-- Scanline texture -->
            <div class="absolute inset-0 opacity-[0.03]"
                 style="background-image: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 3px)">
            </div>

            <!-- Content -->
            <div class="absolute inset-0 flex flex-col justify-end px-8 pb-6">
                <!-- Micro label -->
                <span class="text-[9px] font-mono uppercase tracking-[0.3em] text-emerald-500/70 mb-1">
                    Guardian Profile
                </span>

                <!-- Player name — hero typography -->
                <div class="flex items-baseline gap-3 mb-2">
                    <h1 class="font-serif text-5xl font-light italic tracking-tight text-white leading-none">
                        {data.player.bungieGlobalDisplayName}
                    </h1>
                    <span class="font-mono text-lg text-zinc-600 font-normal">
                        #{String(data.player.bungieGlobalDisplayNameCode).padStart(4,'0')}
                    </span>
                </div>

                <!-- Sub-info row -->
                <div class="flex items-center gap-4">
                    <!-- Clan -->
                    {#if data.clan}
                        <a href="/clan/{data.clan.groupId}"
                           class="text-[10px] font-mono uppercase tracking-[0.2em] text-emerald-400
                                  hover:text-emerald-300 transition-colors border border-emerald-500/30
                                  px-2 py-0.5 hover:border-emerald-500/60">
                            [{data.clan.name}]
                        </a>
                    {/if}
                    <!-- Class / Race -->
                    <span class="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
                        {classNames[char.classType] ?? ''} · {raceNames[char.raceType] ?? ''}
                    </span>
                    <!-- Power -->
                    {#if char.light}
                        <span class="text-[10px] font-mono uppercase tracking-[0.2em] text-yellow-500/80">
                            {char.light} PL
                        </span>
                    {/if}
                </div>
            </div>

            <!-- Gambit rank — top-right -->
            <div class="absolute top-5 right-8 text-right">
                <span class="text-[9px] font-mono uppercase tracking-[0.25em] text-zinc-600 block mb-1">
                    Gambit Rank
                </span>
                <span class="text-2xl font-mono font-bold text-emerald-400 block">{gambitRank}</span>
                <!-- Rank progress bar -->
                <div class="w-24 h-px bg-zinc-800 mt-2 ml-auto">
                    <div class="h-full bg-emerald-400 transition-all
                                shadow-[0_0_6px_rgba(52,211,153,0.6)]"
                         style="width:{gambitPct}%"></div>
                </div>
                <span class="text-[8px] font-mono text-zinc-700 mt-0.5 block">{gambitPct}% TO NEXT</span>
            </div>

            <!-- Corner decoration — top-left diamond -->
            <div class="absolute top-4 left-4 w-3 h-3 border border-emerald-500/30 rotate-45"></div>
            <div class="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-emerald-500/30 via-transparent to-transparent"></div>
        </header>

        <!-- ── Tab label strip ─────────────────────────────────────────────── -->
        <div class="h-8 bg-[#0a0a0a] border-b border-zinc-800 flex items-center px-6 gap-6 shrink-0">
            {#each TABS as t}
                <button
                    onclick={() => tab = t.id}
                    class="text-[9px] font-mono uppercase tracking-[0.25em] transition-colors relative pb-px
                           {tab === t.id ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'}">
                    {t.label}
                    {#if tab === t.id}
                        <span class="absolute bottom-0 left-0 w-full h-px bg-emerald-400
                                     shadow-[0_0_4px_rgba(52,211,153,0.8)]"></span>
                    {/if}
                </button>
            {/each}
        </div>

        <!-- ── Scrollable content ──────────────────────────────────────────── -->
        <main class="flex-1 overflow-y-auto scrollbar-hide bg-[#080808]">

            <!-- ══ OVERVIEW ════════════════════════════════════════════════════ -->
            {#if tab === 'overview'}
                {#if !data.lifetimeStats}
                    <div class="flex items-center justify-center h-full">
                        <p class="text-[11px] font-mono uppercase tracking-[0.2em] text-zinc-600">
                            No Gambit stats found for this Guardian.
                        </p>
                    </div>
                {:else}
                    <div class="p-6 space-y-4">

                        <!-- Primary stat row -->
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {#each [
                                { label: 'Win Rate',    value: winRate === '—' ? '—' : winRate + '%',         sub: `${fmt(won)}W · ${fmt(entered - won)}L`,    accent: true  },
                                { label: 'K/D Ratio',  value: kd,                                             sub: `${fmt(kills)} kills · ${fmt(deaths)} deaths`, accent: false },
                                { label: 'Matches',    value: fmt(entered),                                   sub: `${fmt(won)} wins total`,                   accent: false },
                                { label: 'Gambit Rank',value: gambitRank,                                     sub: `${gambitPct}% to next tier`,              accent: false },
                            ] as card}
                                <StoneCard cls="p-4" accent={card.accent}>
                                    <span class="text-[9px] font-mono uppercase tracking-[0.25em] text-zinc-600 block mb-2">
                                        {card.label}
                                    </span>
                                    <span class="text-3xl font-mono font-bold text-white block mb-1
                                                 {card.accent ? 'text-emerald-400' : ''}">
                                        {card.value}
                                    </span>
                                    <span class="text-xs font-sans text-zinc-500">{card.sub}</span>
                                </StoneCard>
                            {/each}
                        </div>

                        <!-- Gambit-specific stat row -->
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {#each [
                                { label: 'Invasions',         value: fmt(sv('invasions')),         sub: `${fmt(sv('invasionKills'))} invasion kills`   },
                                { label: 'Invaders Stopped',  value: fmt(sv('invasionsDefeated')), sub: 'times you stopped an invasion'                },
                                { label: 'Motes Deposited',   value: fmt(sv('motesBanked')),       sub: `${fmt(sv('motesLost'))} motes lost`           },
                                { label: 'Assists',           value: fmt(sv('assists')),           sub: sdv('kills') + ' kills'                        },
                            ] as card}
                                <StoneCard cls="p-4">
                                    <span class="text-[9px] font-mono uppercase tracking-[0.25em] text-zinc-600 block mb-2">
                                        {card.label}
                                    </span>
                                    <span class="text-3xl font-mono font-bold text-emerald-400 block mb-1">
                                        {card.value}
                                    </span>
                                    <span class="text-xs font-sans text-zinc-500">{card.sub}</span>
                                </StoneCard>
                            {/each}
                        </div>

                        <!-- Recent matches preview -->
                        <StoneCard title="Recent Matches">
                            <div class="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60">
                                <span class="text-xs font-sans text-zinc-500">Last {Math.min(5, data.recentMatches.length)} matches</span>
                                <button
                                    onclick={() => tab = 'matches'}
                                    class="text-[9px] font-mono uppercase tracking-[0.2em] text-emerald-500 hover:text-emerald-400 transition-colors">
                                    View all →
                                </button>
                            </div>

                            <div class="divide-y divide-zinc-800/60">
                                {#each data.recentMatches.slice(0, 5) as match}
                                    {@const result     = matchResult(match)}
                                    {@const instanceId = match.activityDetails?.instanceId}
                                    {@const mb         = match.extended?.values?.motesDeposited?.basic?.value ?? null}
                                    {@const inv        = match.extended?.values?.invasions?.basic?.value      ?? null}
                                    <a href={instanceId ? `/match/${instanceId}` : null}
                                       class="flex items-center gap-4 px-4 py-3 hover:bg-zinc-900/40 transition-colors group">
                                        <!-- Result badge -->
                                        <span class="text-[9px] font-mono font-bold w-8 text-center py-1 shrink-0
                                                     border
                                                     {result === 'win'  ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/5' :
                                                      result === 'loss' ? 'border-red-500/40    text-red-400    bg-red-500/5'     :
                                                                          'border-zinc-700       text-zinc-500   bg-zinc-900'}">
                                            {result === 'win' ? 'W' : result === 'loss' ? 'L' : 'DNF'}
                                        </span>
                                        <!-- Date -->
                                        <span class="text-[9px] font-mono text-zinc-600 w-14 shrink-0">{timeAgo(match.period)}</span>
                                        <!-- K/D/A -->
                                        <span class="text-[11px] font-mono text-zinc-300 flex-1">
                                            {match.values?.kills?.basic?.value ?? 0}K ·
                                            {match.values?.deaths?.basic?.value ?? 0}D ·
                                            {match.values?.assists?.basic?.value ?? 0}A
                                        </span>
                                        <!-- Motes -->
                                        {#if mb !== null}
                                            <span class="text-xs font-sans shrink-0
                                                         {mb >= 15 ? 'text-emerald-400' : 'text-zinc-600'}">
                                                {mb} MB
                                            </span>
                                        {/if}
                                        <!-- Invasions -->
                                        {#if inv !== null && inv > 0}
                                            <span class="text-xs font-sans text-violet-400 shrink-0 hidden sm:block">{inv} INV</span>
                                        {/if}
                                        <!-- Arrow -->
                                        <svg class="w-3 h-3 text-zinc-700 group-hover:text-emerald-500 transition-colors shrink-0 ml-1"
                                             fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                                        </svg>
                                    </a>
                                {/each}
                            </div>
                        </StoneCard>

                    </div>
                {/if}

            <!-- ══ SEASONS ══════════════════════════════════════════════════════ -->
            {:else if tab === 'seasons'}
                {#if seasonalLoading}
                    <div class="flex flex-col items-center justify-center h-64 gap-3">
                        <div class="w-5 h-5 border border-zinc-700 border-t-emerald-400 animate-spin"></div>
                        <span class="text-[9px] font-mono uppercase tracking-[0.2em] text-zinc-600">
                            Scanning match history…
                        </span>
                    </div>
                {:else if !seasonal?.seasons?.length}
                    <div class="flex flex-col items-center justify-center h-64 gap-2">
                        <div class="w-6 h-6 border border-zinc-700 rotate-45 mb-2"></div>
                        <span class="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">No seasonal data</span>
                        {#if seasonal}
                            <span class="text-xs font-sans text-zinc-600">No Gambit matches found in recent history.</span>
                        {:else}
                            <span class="text-xs font-sans text-zinc-600">Select the Seasons tab to load per-season stats.</span>
                        {/if}
                    </div>
                {:else}
                    <div class="p-6 space-y-3">
                        <div class="flex items-center justify-between mb-1">
                            <span class="text-[9px] font-mono uppercase tracking-[0.25em] text-zinc-500">Season Breakdown</span>
                            <span class="text-xs font-sans text-zinc-600">
                                {seasonal.totalActivities?.toLocaleString()} matches · {seasonal.charsScanned} character{seasonal.charsScanned !== 1 ? 's' : ''}
                            </span>
                        </div>

                        {#each seasonal.seasons as s}
                            <StoneCard>
                                <!-- Season header -->
                                <div class="flex items-center justify-between px-5 py-4 border-b border-zinc-800/60">
                                    <div>
                                        <span class="text-[11px] font-mono font-bold text-white block">{s.season}</span>
                                        <span class="text-[9px] font-mono uppercase tracking-[0.2em] text-zinc-600">
                                            Season {s.seasonNumber} · {s.activitiesEntered} matches
                                        </span>
                                    </div>
                                    <div class="text-right">
                                        <span class="text-2xl font-mono font-bold block
                                                     {s.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}">
                                            {s.winRate}%
                                        </span>
                                        <span class="text-[9px] font-mono uppercase tracking-[0.2em] text-zinc-600">Win Rate</span>
                                    </div>
                                </div>

                                <!-- Stats grid -->
                                <div class="grid grid-cols-3 sm:grid-cols-6 divide-x divide-zinc-800/60">
                                    {#each [
                                        { label: 'K/D',       val: s.kd,            hi: s.kd >= 1.5           },
                                        { label: 'Wins',      val: s.wins,          hi: false                  },
                                        { label: 'Motes/G',   val: s.avgMotes,      hi: s.avgMotes >= 15       },
                                        { label: 'Inv/G',     val: s.avgInvasions,  hi: s.avgInvasions >= 1    },
                                        { label: 'Tot. Inv',  val: s.invasions,     hi: false                  },
                                        { label: 'Inv Kills', val: s.invasionKills, hi: false                  },
                                    ] as stat}
                                        <div class="px-3 py-3 text-center">
                                            <span class="text-sm font-mono font-bold block
                                                         {stat.hi ? 'text-emerald-400' : 'text-white'}">
                                                {stat.val}
                                            </span>
                                            <span class="text-[8px] font-mono uppercase tracking-[0.15em] text-zinc-700 mt-0.5 block">
                                                {stat.label}
                                            </span>
                                        </div>
                                    {/each}
                                </div>

                                <!-- Mote efficiency bar -->
                                {#if s.motesPickedUp > 0}
                                    {@const bankedPct = Math.round((s.motesDeposited / s.motesPickedUp) * 100)}
                                    {@const lostPct   = Math.round((s.motesLost      / s.motesPickedUp) * 100)}
                                    <div class="px-5 py-3 border-t border-zinc-800/60">
                                        <div class="flex items-center gap-2 mb-1.5">
                                            <span class="text-[9px] font-mono uppercase tracking-[0.15em] text-zinc-600">
                                                Mote efficiency
                                            </span>
                                            <span class="text-xs font-sans font-semibold text-emerald-400">{bankedPct}% banked</span>
                                            <span class="text-xs font-sans text-red-400 ml-auto">{lostPct}% lost</span>
                                        </div>
                                        <div class="h-px flex gap-px bg-zinc-900">
                                            <div class="h-full bg-emerald-500 shadow-[0_0_4px_rgba(52,211,153,0.4)]"
                                                 style="width:{bankedPct}%"></div>
                                            <div class="h-full bg-red-500/50" style="width:{lostPct}%"></div>
                                        </div>
                                    </div>
                                {/if}
                            </StoneCard>
                        {/each}
                    </div>
                {/if}

            <!-- ══ MATCHES ══════════════════════════════════════════════════════ -->
            {:else if tab === 'matches'}
                <div class="p-6">
                    <div class="flex items-center justify-between mb-4">
                        <span class="text-[9px] font-mono uppercase tracking-[0.25em] text-zinc-500">Match History</span>
                        <span class="text-xs font-sans text-zinc-600">{data.recentMatches.length} recent matches</span>
                    </div>

                    {#if !data.recentMatches.length}
                        <div class="flex items-center justify-center h-40">
                            <span class="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-700">
                                No recent Gambit matches found.
                            </span>
                        </div>
                    {:else}
                        <StoneCard>
                            <div class="divide-y divide-zinc-800/50">
                                {#each data.recentMatches as match}
                                    {@const result     = matchResult(match)}
                                    {@const k          = match.values?.kills?.basic?.value                   ?? 0}
                                    {@const d          = match.values?.deaths?.basic?.value                  ?? 0}
                                    {@const a          = match.values?.assists?.basic?.value                 ?? 0}
                                    {@const dur        = match.values?.activityDurationSeconds?.basic?.value ?? 0}
                                    {@const mb         = match.extended?.values?.motesDeposited?.basic?.value ?? null}
                                    {@const inv        = match.extended?.values?.invasions?.basic?.value      ?? null}
                                    {@const instanceId = match.activityDetails?.instanceId}
                                    <a href={instanceId ? `/match/${instanceId}` : null}
                                       class="flex items-center gap-3 px-4 py-3 hover:bg-zinc-900/40 transition-colors group
                                              {result === 'win'  ? 'border-l-2 border-l-emerald-500' :
                                               result === 'loss' ? 'border-l-2 border-l-red-500'    :
                                                                   'border-l-2 border-l-zinc-800'}">
                                        <!-- Result badge -->
                                        <span class="text-[9px] font-mono font-bold w-8 text-center py-1 border shrink-0
                                                     {result === 'win'  ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/5' :
                                                      result === 'loss' ? 'border-red-500/40    text-red-400    bg-red-500/5'     :
                                                                          'border-zinc-700       text-zinc-500'}">
                                            {result === 'win' ? 'W' : result === 'loss' ? 'L' : 'DNF'}
                                        </span>
                                        <!-- Date -->
                                        <span class="text-[9px] font-mono text-zinc-600 w-14 shrink-0">{timeAgo(match.period)}</span>
                                        <!-- K/D/A -->
                                        <div class="flex items-center gap-1 text-[11px] font-mono flex-1">
                                            <span class="text-white">{k}</span>
                                            <span class="text-zinc-700">/</span>
                                            <span class="text-zinc-400">{d}</span>
                                            <span class="text-zinc-700">/</span>
                                            <span class="text-zinc-500">{a}</span>
                                            <span class="text-[8px] font-sans text-zinc-600 ml-1">K/D/A</span>
                                        </div>
                                        <!-- Motes -->
                                        {#if mb !== null}
                                            <span class="text-xs font-sans shrink-0 hidden sm:block
                                                         {mb >= 15 ? 'text-emerald-400' : 'text-zinc-600'}">
                                                {mb} MB
                                            </span>
                                        {/if}
                                        <!-- Invasions -->
                                        {#if inv !== null && inv > 0}
                                            <span class="text-xs font-sans text-violet-400 shrink-0 hidden sm:block">
                                                {inv} INV
                                            </span>
                                        {/if}
                                        <!-- Duration -->
                                        {#if dur}
                                            <span class="text-xs font-sans text-zinc-600 hidden lg:block shrink-0">
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
                        </StoneCard>
                    {/if}
                </div>

            <!-- ══ LOADOUT ══════════════════════════════════════════════════════ -->
            {:else if tab === 'loadout'}
                {#if loadoutLoading}
                    <div class="flex flex-col items-center justify-center h-64 gap-3">
                        <div class="w-5 h-5 border border-zinc-700 border-t-emerald-400 animate-spin"></div>
                        <span class="text-[9px] font-mono uppercase tracking-[0.2em] text-zinc-600">
                            Loading loadout…
                        </span>
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

            <!-- ══ SUBCLASS ═════════════════════════════════════════════════════ -->
            {:else if tab === 'subclass'}
                {#if loadoutLoading}
                    <div class="flex flex-col items-center justify-center h-64 gap-3">
                        <div class="w-5 h-5 border border-zinc-700 border-t-emerald-400 animate-spin"></div>
                        <span class="text-[9px] font-mono uppercase tracking-[0.2em] text-zinc-600">
                            Loading subclass…
                        </span>
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
                            sockets={sockets}
                        />
                    </div>
                {/if}
            {/if}

        </main>
    </div>
</div>
