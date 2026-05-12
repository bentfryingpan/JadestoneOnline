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
    let profileTab   = $state('overview');
    function setTab(t) { profileTab = t; tab = t; }

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
    const mousePos = $derived({ x: mouseX, y: mouseY });

    // UI helpers
    let activeWeaponSlot = $state('kinetic');
    let scrollRef        = $state(null);
    function handleWheel(e) { if (scrollRef) scrollRef.scrollLeft += e.deltaY; }

    const tabsList = ['Overview', 'Matches', 'Weaponry', 'Synergy', 'Maps', 'Pursuits', 'Loadout'];

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
    const HISTORY_COUNT_OPTIONS = [100, 250, 500, 1000];
    let historyCount   = $state(100);
    let history        = $state(null);
    let historyLoading = $state(false);
    let historyFor     = $state(0);

    async function fetchHistory() {
        if (historyLoading) return;
        if (history && historyFor === historyCount) return;
        historyLoading = true;
        try {
            const charIds = data.characterIds.join(',');
            const res = await fetch(
                `/api/history?membershipType=${data.membershipType}&membershipId=${data.membershipId}&charIds=${charIds}&count=${historyCount}`
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            history    = await res.json();
            historyFor = historyCount;
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
            const res = await fetch(
                `/api/career?membershipId=${data.membershipId}&count=250`
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            career = await res.json();
        } catch (e) {
            console.error('Career fetch failed', e);
            careerError = 'Could not load career analytics.';
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
        } catch { }
    }

    // ── PGCR enrichment ────────────────────────────────────────────────────────
    let enriching      = $state(false);
    let enrichProgress = $state({ stored: 0, total: 0 });

    async function triggerEnrichment() {
        if (enriching || !history?.matches) return;
        const unenriched = history.matches
            .filter(m => m.instanceId && m.fireteam_size == null)
            .map(m => m.instanceId)
            .slice(0, 40);
        if (!unenriched.length) return;

        enriching = true;
        enrichProgress = { stored: 0, total: unenriched.length };

        try {
            const res = await fetch('/api/pgcr-enrich', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    membershipId: data.membershipId,
                    membershipType: data.membershipType,
                    bungieDisplayName: data.player.bungieGlobalDisplayName,
                    bungieDisplayCode: data.player.bungieGlobalDisplayNameCode,
                    instanceIds: unenriched,
                }),
            });
            const r = await res.json();
            if (r.stored) {
                historyFor = 0;
                fetchHistory();
                fetchCareer();
            }
        } catch { }
        finally { enriching = false; }
    }

    $effect(() => {
        if ((tab === 'loadout' || tab === 'subclass') && activeChar && activeChar !== loadoutCharId) {
            fetchLoadout();
        }
    });
    $effect(() => {
        if (tab === 'matches' || (career && career.needsEnrichment)) {
            fetchHistory();
            loadFavorites();
        }
    });
    $effect(() => {
        if (history && !enriching && (tab === 'matches' || (career && career.needsEnrichment))) {
            triggerEnrichment();
        }
    });
    $effect(() => {
        if ((tab === 'overview' || tab === 'weaponry' || tab === 'maps' || tab === 'synergy' || tab === 'trophies') && !career && !careerLoading) {
            fetchCareer();
        }
    });

    // ── Derived ────────────────────────────────────────────────────────────────
    const char = $derived(data.characters[activeChar] ?? {});
    const eq   = $derived(loadout?.equipment ?? {});

    const gambitRank = $derived((() => {
        const lvl = data.gambitProgression?.level ?? 0;
        if (lvl < 4) return 'Guardian'; if (lvl < 8) return 'Brave';
        if (lvl < 13) return 'Heroic'; if (lvl < 18) return 'Fabled';
        if (lvl < 24) return 'Mythic'; return 'Legend';
    })());
    const gambitPct = $derived((() => {
        const prog = data.gambitProgression?.progressToNextLevel ?? 0;
        const next = data.gambitProgression?.nextLevelAt ?? 1;
        return Math.round((prog / next) * 100);
    })());

    const ls = $derived(data.lifetimeStats ?? {});
    function sv(key) { return ls[key]?.basic?.value ?? 0; }

    const ltWon          = $derived(sv('activitiesWon'));
    const ltKills        = $derived(sv('kills'));
    const ltDeaths       = $derived(sv('deaths'));
    const ltInvasions    = $derived(sv('invasions'));
    const ltInvKills     = $derived(sv('invasionKills'));
    const ltMotes        = $derived(sv('motesBanked') || sv('motesDeposited'));
    const ltMotesLost    = $derived(sv('motesLost'));
    const ltMotesDenied  = $derived(sv('motesDenied'));
    const ltPrimevalDmg  = $derived(sv('primevalDamage'));
    const ltSuperKills   = $derived(sv('superKills'));

    const seasonalTotal = $derived(
        seasonal?.seasons?.reduce((acc, s) => {
            acc.activitiesEntered += s.activitiesEntered ?? 0;
            acc.wins += s.wins ?? 0;
            acc.kills += s.kills ?? 0;
            acc.deaths += s.deaths ?? 0;
            acc.motesDeposited += s.motesDeposited ?? 0;
            acc.motesLost += s.motesLost ?? 0;
            acc.motesDenied += s.motesDenied ?? 0;
            acc.invasionKills += s.invasionKills ?? 0;
            acc.primevalDamage += s.primevalDamage ?? 0;
            return acc;
        }, { activitiesEntered: 0, wins: 0, kills: 0, deaths: 0, motesDeposited: 0, motesLost: 0, motesDenied: 0, invasionKills: 0, primevalDamage: 0 })
        ?? null
    );

    const egoRating = $derived((() => {
        const wins    = seasonalTotal?.wins ?? ltWon;
        const kills   = seasonalTotal?.kills ?? ltKills;
        const inv     = seasonalTotal?.invasionKills ?? ltInvKills;
        const motes   = seasonalTotal?.motesDeposited ?? ltMotes;
        const denied  = seasonalTotal?.motesDenied ?? ltMotesDenied;
        return Math.floor(wins * 15 + kills * 0.3 + inv * 5 + motes * 0.1 + denied * 2);
    })());

    const dEntered      = $derived(seasonFilter === 'all' ? (seasonalTotal?.activitiesEntered ?? sv('activitiesEntered')) : (seasonal?.seasons?.find(s => s.season === seasonFilter)?.activitiesEntered ?? 0));
    const dWon          = $derived(seasonFilter === 'all' ? (seasonalTotal?.wins ?? ltWon) : (seasonal?.seasons?.find(s => s.season === seasonFilter)?.wins ?? 0));
    const dKills        = $derived(seasonFilter === 'all' ? (seasonalTotal?.kills ?? ltKills) : (seasonal?.seasons?.find(s => s.season === seasonFilter)?.kills ?? 0));
    const dDeaths       = $derived(seasonFilter === 'all' ? (seasonalTotal?.deaths ?? ltDeaths) : (seasonal?.seasons?.find(s => s.season === seasonFilter)?.deaths ?? 0));
    const dMotes        = $derived(seasonFilter === 'all' ? (seasonalTotal?.motesDeposited ?? ltMotes) : (seasonal?.seasons?.find(s => s.season === seasonFilter)?.motesDeposited ?? 0));
    const dMotesLost    = $derived(seasonFilter === 'all' ? (seasonalTotal?.motesLost ?? ltMotesLost) : (seasonal?.seasons?.find(s => s.season === seasonFilter)?.motesLost ?? 0));
    const dMotesDenied  = $derived(seasonFilter === 'all' ? (seasonalTotal?.motesDenied ?? ltMotesDenied) : (seasonal?.seasons?.find(s => s.season === seasonFilter)?.motesDenied ?? 0));
    const dInvKills     = $derived(seasonFilter === 'all' ? (seasonalTotal?.invasionKills ?? ltInvKills) : (seasonal?.seasons?.find(s => s.season === seasonFilter)?.invasionKills ?? 0));
    const dPrimevalDmg  = $derived(seasonFilter === 'all' ? (seasonalTotal?.primevalDamage ?? ltPrimevalDmg) : (seasonal?.seasons?.find(s => s.season === seasonFilter)?.primevalDamage ?? 0));

    const dWinRate  = $derived(dEntered > 0 ? (dWon / dEntered) * 100 : null);
    const dKD       = $derived(dDeaths > 0 ? dKills / dDeaths : null);
    const dAvgMotes = $derived(dEntered > 0 ? dMotes / dEntered : 0);

    const SEASON_NAMES = {
        19: '19: SERAPH', 20: '20: DEFIANCE', 21: '21: DEEP',
        22: '22: WITCH',  23: '23: WISH',      24: 'EP: ECHOES',
        25: 'EP: REVENANT', 26: 'EP: HERESY',  27: 'EDGE OF FATE',
    };

    function fmt(n) { const num = Number(n); return Number.isFinite(num) ? num.toLocaleString() : '—'; }
    function fmtF(n, d = 2) { const num = Number(n); return Number.isFinite(num) ? num.toFixed(d) : '—'; }
    function timeAgo(iso) {
        if (!iso) return '—';
        const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
        if (m < 60) return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h ago`;
        return `${Math.floor(h / 24)}d ago`;
    }

    const grandTotal = $derived(
        (char?.stats?.[2996146975] ?? 0) + (char?.stats?.[3927053327] ?? 0) +
        (char?.stats?.[1943323491] ?? 0) + (char?.stats?.[1735777505] ?? 0) +
        (char?.stats?.[144602215]  ?? 0) + (char?.stats?.[4244567218] ?? 0)
    );
    const buildTier = $derived(grandTotal >= 500 ? 'S' : grandTotal >= 400 ? 'A' : grandTotal >= 300 ? 'B' : 'C');

    const seasons = $derived(seasonal?.seasons?.map(s => ({
        id: s.season, label: SEASON_NAMES[s.seasonNumber] ?? `Season ${s.seasonNumber}`
    })) ?? []);

    const matchesList = $derived((history?.matches ?? []).map(m => ({
        result: m.win ? 'WIN' : 'LOSS',
        mode: 'Gambit',
        map: m.mapName,
        kd: m.kd,
        motes: m.motesDeposited,
        damage: fmt(m.primevalDamage),
        date: m.period ? timeAgo(m.period) : ''
    })));

    const weaponData = $derived((() => {
        const grouped = { kinetic: [], energy: [], power: [] };
        if (career?.weapons) {
            career.weapons.forEach((w) => {
                const item = {
                    name: w.name, type: 'Combat Weapon', kills: w.kills, precision: fmtF(w.precRate, 1) + '%',
                    color: (w.winRate ?? 0) >= 60 ? 'text-emerald-400' : 'text-zinc-200'
                };
                const slot = (w.slot ?? '').toLowerCase();
                if (slot === 'kinetic') grouped.kinetic.push(item);
                else if (slot === 'energy') grouped.energy.push(item);
                else if (slot === 'power') grouped.power.push(item);
                else grouped.kinetic.push(item);
            });
        }
        return grouped;
    })());

    const playerData = $derived({
        identity: {
            name: data.player.bungieGlobalDisplayName,
            code: data.player.bungieGlobalDisplayNameCode,
            clan: data.clan?.name ?? null,
            rating: career?.avgScore ?? egoRating,
            level: data.gambitProgression?.level ?? 0,
            rank: gambitRank, rankValue: gambitPct,
        },
        overview: {
            winRatio: dWinRate != null ? fmtF(dWinRate, 1) + '%' : '—',
            wins: dWon, kd: dKD != null ? fmtF(dKD, 2) : '—', kills: dKills,
            motesAvg: dEntered > 0 ? fmtF(dAvgMotes, 1) : '—',
            dps: dEntered > 0 && dPrimevalDmg > 0 ? fmt(Math.round(dPrimevalDmg / dEntered)) : '—',
            combat: { total: fmt(dKills), precision: dKills + dDeaths > 0 ? fmtF((dKills / (dKills + dDeaths)) * 100, 1) + '%' : '—', ability: '—', super: fmt(seasonalTotal?.superKills ?? ltSuperKills) },
            objectives: { deposited: fmt(dMotes), lost: fmt(dMotesLost), denied: fmt(dMotesDenied), blockers: '—', healed: '—' },
            invasion: { guardians: fmt(dInvKills), armyOfOne: career?.medals?.find(m => m.key === 'armyOfOne')?.count ?? '0', efficiency: '—', winPct: '—', invasions: '—', shutDown: '—' },
        },
        loadout: {
            subclass: classNames[char?.classType] ?? 'Guardian',
            stats: { Mobility: char?.stats?.[2996146975] ?? 0, Resilience: char?.stats?.[3927053327] ?? 0, Recovery: char?.stats?.[1943323491] ?? 0, Discipline: char?.stats?.[1735777505] ?? 0, Intellect: char?.stats?.[144602215] ?? 0, Strength: char?.stats?.[4244567218] ?? 0 },
            bonuses: { Mobility: 0, Resilience: 0, Recovery: 0, Discipline: 0, Intellect: 0, Strength: 0 },
            weapons: [
                { slot: 'KINETIC', name: eq.kinetic?.name ?? '—', quality: eq.kinetic?.tierTypeName ?? '', icon: eq.kinetic?.icon ?? null },
                { slot: 'ENERGY', name: eq.energy?.name ?? '—', quality: eq.energy?.tierTypeName ?? '', icon: eq.energy?.icon ?? null },
                { slot: 'POWER', name: eq.power?.name ?? '—', quality: eq.power?.tierTypeName ?? '', icon: eq.power?.icon ?? null },
            ],
            armor: [
                { slot: 'HELMET', name: eq.helmet?.name ?? '—', quality: eq.helmet?.tierTypeName ?? '', icon: eq.helmet?.icon ?? null },
                { slot: 'ARMS', name: eq.gauntlets?.name ?? '—', quality: eq.gauntlets?.tierTypeName ?? '', icon: eq.gauntlets?.icon ?? null },
                { slot: 'CHEST', name: eq.chest?.name ?? '—', quality: eq.chest?.tierTypeName ?? '', icon: eq.chest?.icon ?? null },
                { slot: 'LEGS', name: eq.legs?.name ?? '—', quality: eq.legs?.tierTypeName ?? '', icon: eq.legs?.icon ?? null },
            ],
        },
    });
</script>

<!-- ── Gemini snippets ────────────────────────────────────────────────────── -->
{#snippet ghostLabel({ text, className = "" })}
    <span class="text-[8px] font-sans text-zinc-500 uppercase tracking-[0.2em] font-bold block mb-1 {className}">{text}</span>
{/snippet}

{#snippet engravedHeader({ text, className = "" })}
    <div class="flex items-center gap-2 mb-4 {className}">
        <div class="h-[1px] w-8 bg-gradient-to-r from-transparent to-emerald-500/50"></div>
        <span class="text-[10px] font-display font-bold text-emerald-500 uppercase tracking-[0.2em]">{text}</span>
        <div class="h-[1px] flex-1 bg-gradient-to-r from-emerald-500/50 to-transparent opacity-30"></div>
    </div>
{/snippet}

{#snippet stoneCard({ title = null, compact = false, className = "" }, contentSnippet)}
    <div class="bg-[#111111] border border-zinc-800 p-5 relative shadow-[inset_0_0_30px_rgba(0,0,0,0.5)] group overflow-hidden transition-all duration-500 hover:border-zinc-700 {className} stone-card">
        <div class="sheen-overlay"></div>
        {#if title} {@render ghostLabel({ text: title })} {/if}
        <div class="relative z-10"> {@render contentSnippet()} </div>
    </div>
{/snippet}

{#snippet detailStatCompact({ label, value, rank = null, awakened = false })}
    <div class="flex items-center justify-between py-2 border-b border-zinc-800/40 relative group/stat">
        {#if awakened} <div class="absolute -left-2 w-0.5 h-4 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"></div> {/if}
        <span class="text-[10px] font-sans text-zinc-500 uppercase tracking-widest">{label}</span>
        <div class="flex items-baseline gap-2">
            <span class="text-sm font-bold text-zinc-200">{value}</span>
            {#if rank} <span class="text-[8px] font-black italic {rank.includes('%') ? 'text-emerald-500' : 'text-amber-500'}">{rank}</span> {/if}
        </div>
    </div>
{/snippet}

{#snippet sidebarIcon({ label, active, icon, action })}
    <button onclick={action} class="group relative flex flex-col items-center gap-1 transition-all duration-300">
        <div class="w-10 h-10 flex items-center justify-center border {active ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400' : 'border-zinc-800 text-zinc-600 hover:border-zinc-500 hover:text-zinc-300'} rotate-45 transition-all group-hover:rotate-90">
            <span class="-rotate-45 group-hover:-rotate-90 transition-all font-bold text-xs">{icon}</span>
        </div>
        <span class="text-[7px] font-bold tracking-[0.2em] mt-3 {active ? 'text-emerald-500' : 'text-zinc-700'}">{label}</span>
        {#if active} <div class="absolute -left-8 top-1/2 -translate-y-1/2 w-1 h-8 bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.8)]"></div> {/if}
    </button>
{/snippet}

{#snippet medalBadge({ label, color, icon })}
    {@const colorClasses = color === 'emerald' ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]' :
        color === 'amber' ? 'border-amber-600/30 bg-amber-950/20 text-amber-500' :
        color === 'rose' ? 'border-rose-600/30 bg-rose-950/20 text-rose-500' :
        'border-zinc-500/40 bg-zinc-900/50 text-zinc-200 shadow-[0_0_15px_rgba(255,255,255,0.02)]'}
    <div class="group relative flex items-center justify-center w-8 h-8 border rotate-45 transition-all hover:scale-110 hover:rotate-90 cursor-help {colorClasses}">
        <span class="text-[10px] font-bold -rotate-45 group-hover:-rotate-90 transition-all">{icon}</span>
        <div class="absolute bottom-full mb-4 px-3 py-1.5 bg-[#0a0a0a] border border-zinc-800 text-[9px] uppercase tracking-[0.2em] text-zinc-100 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-[100] shadow-2xl rotate-[-45deg] group-hover:rotate-[-90deg] font-sans">{label}</div>
    </div>
{/snippet}

{#snippet rankMedallion({ tier, value })}
    <div class="absolute -top-4 -right-4 w-12 h-12 flex items-center justify-center z-30">
        <div class="absolute inset-0 border-2 border-emerald-500/20 rotate-45 animate-[spin_10s_linear_infinite]"></div>
        <div class="absolute inset-1 border border-emerald-500/40 -rotate-45 animate-[spin_15s_linear_infinite]"></div>
        <div class="w-8 h-8 bg-emerald-500 flex flex-col items-center justify-center rotate-45 shadow-[0_0_20px_rgba(16,185,129,0.6)]">
            <span class="text-[8px] font-black text-black -rotate-45 leading-none">RANK</span>
            <span class="text-[14px] font-black text-black -rotate-45 leading-none mt-0.5">{tier.substring(0,1)}</span>
        </div>
    </div>
{/snippet}

{#snippet jadestoneSlot({ slot, name, quality })}
    {@const rarityColor = quality === 'Exotic' ? 'bg-amber-500' : 'bg-zinc-100'}
    {@const borderColor = quality === 'Exotic' ? 'border-amber-500/20' : 'border-zinc-800'}
    <div class="group flex flex-col items-center gap-2 cursor-pointer w-full font-sans">
        <div class="w-16 h-16 bg-[#0c0c0c] border {borderColor} relative group-hover:border-zinc-400 transition-all duration-300 mx-auto overflow-hidden shadow-[inset_0_0_15px_rgba(0,0,0,0.5)]">
            <div class="absolute top-0 left-0 w-full h-[1px] opacity-70 {rarityColor}"></div>
            <div class="w-full h-full flex items-center justify-center opacity-10 group-hover:opacity-30 transition-opacity">
                <div class="w-8 h-8 border border-zinc-500 rotate-45"></div>
            </div>
            <div class="absolute bottom-0 right-0 px-1.5 bg-black/60 text-[8px] font-sans text-zinc-500 uppercase font-bold tracking-tighter">MAX</div>
        </div>
        <div class="text-center w-full">
            <p class="text-[8px] font-sans text-zinc-600 uppercase tracking-widest font-bold">{slot}</p>
            <p class="text-[10px] font-bold uppercase tracking-tight text-zinc-200 group-hover:text-white truncate w-24 mx-auto">{name}</p>
        </div>
    </div>
{/snippet}

{#snippet fateStatRow({ label, value, bonus = 0 })}
    {@const totalValue = value + bonus}
    {@const percentage = Math.min((totalValue / 200) * 100, 100)}
    <div class="flex items-center gap-3 w-full group py-1.5 font-sans">
        <div class="w-3 h-3 bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
            <div class="w-1.5 h-1.5 {bonus > 0 ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 'bg-zinc-700'} transition-colors duration-300"></div>
        </div>
        <div class="flex-1">
            <div class="flex justify-between text-[8px] font-sans uppercase tracking-[0.15em] text-zinc-500 mb-1">
                <span class="font-bold">{label}</span>
                <div class="flex items-center gap-1.5"> <span class="text-zinc-200 font-black">{totalValue}</span> </div>
            </div>
            <div class="h-[1px] bg-zinc-900 w-full relative">
                <div class="h-full {bonus > 0 ? 'bg-emerald-500' : 'bg-zinc-500'} transition-all duration-1000 ease-out" style="width: {percentage}%"></div>
            </div>
        </div>
    </div>
{/snippet}

{#snippet combatContent()}
    {@render detailStatCompact({ label: "Total Kills", value: playerData.overview.combat?.total ?? playerData.overview.kills, rank: "Top 1%", awakened: true })}
    {@render detailStatCompact({ label: "Precision", value: playerData.overview.combat?.precision ?? '—', rank: "DIAMOND", awakened: true })}
    {@render detailStatCompact({ label: "Ability", value: playerData.overview.combat?.ability ?? '—' })}
    {@render detailStatCompact({ label: "Super", value: playerData.overview.combat?.super ?? '—' })}
{/snippet}

{#snippet objectivesContent()}
    {@render detailStatCompact({ label: "Deposited", value: playerData.overview.objectives.deposited, rank: "Top 2%", awakened: true })}
    {@render detailStatCompact({ label: "Lost", value: playerData.overview.objectives.lost, rank: "LOW" })}
    {@render detailStatCompact({ label: "Blockers", value: playerData.overview.objectives.blockers ?? '—' })}
    {@render detailStatCompact({ label: "Healed", value: playerData.overview.objectives.healed ?? '—' })}
{/snippet}

{#snippet invasionContent()}
    {@render detailStatCompact({ label: "Guardians", value: playerData.overview.invasion.guardians, rank: "Top 0.5%", awakened: true })}
    {@render detailStatCompact({ label: "Army of One", value: playerData.overview.invasion.armyOfOne ?? '—', rank: "GOLD" })}
    {@render detailStatCompact({ label: "Efficiency", value: playerData.overview.invasion.efficiency ?? '—' })}
    {@render detailStatCompact({ label: "Win %", value: playerData.overview.invasion.winPct ?? '—' })}
{/snippet}

<div class="flex h-screen bg-[#080808] text-slate-200 font-sans overflow-hidden">
    <nav class="w-16 border-r border-zinc-800 bg-[#0a0a0a] flex flex-col items-center py-8 shrink-0 z-50">
        <div class="w-9 h-9 bg-zinc-100 mb-12 flex items-center justify-center font-black text-black rotate-45 shadow-2xl hover:bg-emerald-500 transition-colors duration-500 cursor-pointer">
            <span class="-rotate-45 text-lg">J</span>
        </div>
        <div class="space-y-8 flex flex-col items-center">
             {@render sidebarIcon({ label: "HOME", active: false, icon: "H", action: () => window.location.href = '/' })}
             {@render sidebarIcon({ label: "PROFILE", active: profileTab === 'overview', icon: "P", action: () => setTab('overview') })}
             {@render sidebarIcon({ label: "DATABASE", active: false, icon: "D", action: () => {} })}
             {@render sidebarIcon({ label: "SETTINGS", active: false, icon: "S", action: () => {} })}
        </div>
    </nav>

    <div class="flex-1 flex flex-col min-w-0 overflow-hidden relative" onmousemove={onHeroMouseMove} onmouseleave={onHeroMouseLeave}>
        <div class="absolute inset-0 pointer-events-none z-[60] opacity-[0.02] mix-blend-screen" style="background-image: url('https://www.transparenttextures.com/patterns/stardust.png')"></div>
        <header class="h-64 border-b border-zinc-800 relative overflow-hidden shrink-0">
             <div class="absolute inset-[-40px] z-0 transition-transform duration-100 ease-out" style="transform: translate({mousePos.x}px, {mousePos.y}px)">
                    <img src="https://images.unsplash.com/photo-1614850523296-d8c1af93d400?auto=format&fit=crop&q=80&w=2000" alt="Background" class="w-full h-full object-cover grayscale-[0.4] opacity-30 contrast-150" />
                    <div class="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/80 to-transparent z-10"></div>
             </div>
             <div class="flex items-end gap-24 relative z-30 w-full max-w-7xl mx-auto h-full p-10 font-sans">
                    <div class="relative group shrink-0">
                        <div class="w-32 h-32 bg-[#0c0c0c] border border-zinc-700 p-1.5 relative shadow-2xl overflow-hidden">
                            <div class="w-full h-full bg-[#111111] flex items-center justify-center text-5xl font-black italic text-zinc-800 select-none font-serif"> {playerData.identity.name.substring(0,3).toUpperCase()} </div>
                            <div class="absolute top-0 left-0 w-3 h-3 border-t border-l border-zinc-400"></div>
                            <div class="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-zinc-400"></div>
                        </div>
                        {@render rankMedallion({ tier: playerData.identity.rank, value: playerData.identity.rankValue })}
                        <div class="absolute -bottom-3 -left-3 bg-[#0a0a0a] border border-zinc-700 text-zinc-300 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest shadow-2xl z-20">LVL {playerData.identity.level}</div>
                    </div>
                    <div class="mb-2 flex-1 font-sans">
                        <div class="flex flex-col gap-1">
                                <h1 class="text-6xl font-light italic tracking-tighter uppercase leading-none text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]"> {playerData.identity.name} </h1>
                                <div class="flex items-center gap-2 mt-2"> <span class="text-[12px] font-sans text-zinc-500 uppercase tracking-[0.2em] font-medium">{playerData.identity.clan ?? 'No Clan'}</span> </div>
                         </div>
                         <div class="flex items-center gap-6 mt-10">
                            {@render medalBadge({ icon: "✓", color: "silver", label: "Verified Identity" })}
                            {@render medalBadge({ icon: "◈", color: "amber", label: "Diamond ELO" })}
                            {@render medalBadge({ icon: "⚔", color: "silver", label: "Army of One" })}
                            {@render medalBadge({ icon: "Ω", color: "emerald", label: "Awakened Jadestone" })}
                            {@render medalBadge({ icon: "M", color: "silver", label: "Mote Collector" })}
                        </div>
                    </div>
                    <div class="flex gap-14 mb-2 relative z-10 text-right font-sans shrink-0">
                         <div>
                                {@render ghostLabel({ text: "RATING" })}
                                <div class="flex flex-col items-end">
                                     <span class="text-5xl font-light tracking-tighter text-white leading-none font-sans">{playerData.identity.rating?.toLocaleString() ?? '—'}</span>
                                     <span class="text-[10px] font-sans text-emerald-500 italic tracking-[0.3em] mt-3 uppercase font-bold drop-shadow-md">#WORLDWIDE</span>
                                </div>
                         </div>
                    </div>
             </div>
        </header>

        <nav class="h-14 bg-[#0a0a0a] border-b border-zinc-800 flex items-center justify-center gap-4 shrink-0 relative z-50 font-sans">
            {#each tabsList as tabLabel}
                {@const tabId = tabLabel.toLowerCase()}
                <button onclick={() => setTab(tabId)} class="text-[10px] font-sans uppercase tracking-[0.3em] h-10 px-8 relative transition-all duration-500 font-bold border-t border-x border-transparent {profileTab === tabId ? 'text-white bg-[#151515] border-zinc-700/50 shadow-[inset_0_2px_5px_rgba(255,255,255,0.05)]' : 'text-zinc-600 hover:text-zinc-300'}">
                    <div class="relative z-10">{tabLabel}</div>
                    {#if profileTab === tabId}
                        <div class="absolute bottom-0 left-0 w-full h-[1px] bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.9)] z-20"></div>
                        <div class="absolute top-full left-1/2 -translate-x-1/2 w-[180%] h-[40px] bg-emerald-500/10 blur-2xl pointer-events-none opacity-80"></div>
                    {/if}
                </button>
            {/each}
        </nav>

        <main class="flex-1 overflow-y-auto p-10 scrollbar-hide bg-[#080808]">
             <div class="max-w-6xl mx-auto">
                {#key profileTab}
                <div in:fly={{ y: 10, duration: 400 }}>
                    {#if profileTab === 'overview'}
                        <div class="space-y-4 animate-in fade-in duration-700">
                            <div class="relative border-b border-zinc-800/50 pb-2">
                                {@render ghostLabel({ text: "SEASONAL HISTORY" })}
                                <div bind:this={scrollRef} onwheel={handleWheel} class="flex overflow-x-auto gap-1 py-1 no-scrollbar scroll-smooth cursor-grab active:cursor-grabbing">
                                    {#each seasons as s}
                                        <button onclick={() => seasonFilter = s.id} class="flex-shrink-0 px-5 py-2 text-[9px] font-sans uppercase tracking-[0.2em] transition-all border border-zinc-800/50 relative overflow-hidden {seasonFilter === s.id ? 'text-emerald-400 bg-zinc-900 border-zinc-700 font-bold' : 'text-zinc-600 hover:text-zinc-400 hover:border-zinc-700'}">
                                            {s.label}
                                            {#if seasonFilter === s.id} <div class="absolute bottom-0 left-0 w-full h-[2px] bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.8)]"></div> {/if}
                                        </button>
                                    {/each}
                                </div>
                            </div>
                            <div class="grid grid-cols-4 gap-4">
                                <div class="bg-[#111111] border border-zinc-800 p-3 relative shadow-[inset_0_0_30px_rgba(0,0,0,0.5)]">
                                    <div class="flex items-center justify-between gap-4">
                                        <div class="flex flex-col"> <span class="text-[8px] font-sans text-zinc-500 uppercase tracking-[0.2em] font-bold">Win Ratio</span>
                                             <div class="flex items-baseline gap-1.5"> <span class="text-2xl font-light tracking-tighter italic font-sans text-white">{playerData.overview.winRatio}</span> </div>
                                        </div>
                                        <div class="text-right"><p class="text-[8px] font-sans text-zinc-700 uppercase font-bold tracking-widest">{playerData.overview.wins} Wins</p></div>
                                    </div>
                                </div>
                                <div class="bg-[#111111] border border-zinc-800 p-3 relative shadow-[inset_0_0_30px_rgba(0,0,0,0.5)]">
                                    <div class="flex items-center justify-between gap-4">
                                        <div class="flex flex-col"> <span class="text-[8px] font-sans text-zinc-500 uppercase tracking-[0.2em] font-bold">K/D/A</span>
                                             <div class="flex items-baseline gap-1.5"> <span class="text-2xl font-light tracking-tighter italic font-sans text-white">{playerData.overview.kd}</span> </div>
                                        </div>
                                        <div class="text-right"><p class="text-[8px] font-sans text-zinc-700 uppercase font-bold tracking-widest">{playerData.overview.kills} Kills</p></div>
                                    </div>
                                </div>
                                <div class="bg-[#111111] border border-zinc-800 p-3 relative shadow-[inset_0_0_30px_rgba(0,0,0,0.5)]">
                                    <div class="flex items-center justify-between gap-4">
                                        <div class="flex flex-col"> <span class="text-[8px] font-sans text-zinc-500 uppercase tracking-[0.2em] font-bold">Motes Avg</span>
                                             <div class="flex items-baseline gap-1.5"> <span class="text-2xl font-light tracking-tighter italic font-sans text-emerald-400">{playerData.overview.motesAvg}</span> </div>
                                        </div>
                                        <div class="text-right"><p class="text-[8px] font-sans text-zinc-700 uppercase font-bold tracking-widest">Top 1%</p></div>
                                    </div>
                                </div>
                                <div class="bg-gradient-to-br from-[#111111] to-[#0a0a0a] border border-zinc-800 p-3 relative shadow-[inset_0_0_30px_rgba(0,0,0,0.5)] stone-card group">
                                     <div class="sheen-overlay"></div>
                                     {@render ghostLabel({ text: "Primeval DPS", className: "text-[8px]" })}
                                     <div class="relative z-10 flex items-baseline gap-2 mt-1 font-sans w-full">
                                            <span class="text-2xl font-light text-amber-500 tracking-tighter italic">{playerData.overview.dps}</span>
                                            <div class="flex-1 h-[1px] bg-zinc-800 relative bottom-1"><div class="h-full bg-amber-600 w-[75%] shadow-[0_0_8px_rgba(217,119,6,0.3)]"></div></div>
                                     </div>
                                </div>
                            </div>
                            <div class="grid grid-cols-3 gap-6">
                                {@render stoneCard({ title: "Combat", compact: true }, combatContent)}
                                {@render stoneCard({ title: "Objectives", compact: true }, objectivesContent)}
                                {@render stoneCard({ title: "Invasion", compact: true, className: "border-rose-900/10" }, invasionContent)}
                            </div>
                        </div>

                    {:else if profileTab === 'matches'}
                        <div class="space-y-3 animate-in slide-in-from-bottom-2 duration-500 max-w-5xl mx-auto">
                            <div class="flex items-center justify-between">
                                {@render ghostLabel({ text: "RECENT MATCH HISTORY" })}
                                <button onclick={() => { historyFor = 0; fetchHistory(); }} class="text-[9px] font-sans text-emerald-500 border border-emerald-500/30 px-3 py-1 hover:bg-emerald-500/10 transition-colors uppercase tracking-widest font-bold">Refresh Scanner</button>
                            </div>
                            {#each matchesList as m, i}
                                <div class="bg-[#0c0c0c] border border-zinc-800 p-3 group relative hover:border-zinc-600 transition-all flex items-center gap-6 font-sans">
                                    <div class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-10 {m.result === 'WIN' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]'}"></div>
                                    <div class="w-12 text-center"><p class="text-xs font-black italic {m.result === 'WIN' ? 'text-emerald-500' : 'text-rose-500'}">{m.result}</p></div>
                                    <div class="flex-1"><p class="text-[10px] font-sans text-zinc-300 uppercase tracking-widest">{m.mode}</p><p class="text-sm font-bold text-zinc-100 uppercase">{m.map}</p></div>
                                    <div class="grid grid-cols-3 gap-8 px-6 border-x border-zinc-800/50">
                                         <div><p class="text-[8px] font-sans text-zinc-600 uppercase tracking-widest">Efficiency</p><p class="text-xs font-bold text-emerald-400">{m.kd} KD</p></div>
                                         <div><p class="text-[8px] font-sans text-zinc-600 uppercase tracking-widest">Motes</p><p class="text-xs font-bold text-zinc-100">{m.motes}</p></div>
                                         <div><p class="text-[8px] font-sans text-zinc-600 uppercase tracking-widest">Damage</p><p class="text-xs font-bold text-amber-500">{m.damage}</p></div>
                                    </div>
                                    <div class="w-20 text-right"><p class="text-[9px] font-sans text-zinc-700 uppercase">{m.date}</p></div>
                                </div>
                            {/each}
                            {#if enriching} <div class="text-center py-4 text-[10px] text-emerald-500 animate-pulse uppercase tracking-widest">Enriching Match Data... {enrichProgress.stored}/{enrichProgress.total}</div> {/if}
                        </div>

                    {:else if profileTab === 'weaponry'}
                        <div class="space-y-6 animate-in fade-in duration-700 max-w-6xl mx-auto">
                            <div class="flex items-center justify-between border-b border-zinc-800 pb-4">
                                 {@render ghostLabel({ text: "WEAPON STATISTICS" })}
                                 <div class="flex bg-zinc-950 border border-zinc-800 p-0.5 rounded-sm overflow-hidden">
                                        {#each ['kinetic', 'energy', 'power'] as slot}
                                            <button onclick={() => activeWeaponSlot = slot} class="px-4 py-1.5 text-[8px] font-sans uppercase tracking-widest transition-all relative {activeWeaponSlot === slot ? 'text-emerald-400 font-bold' : 'text-zinc-700 hover:text-zinc-500'}">
                                                {slot}
                                                {#if activeWeaponSlot === slot} <div class="absolute bottom-0 left-0 w-full h-[1px] bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div> {/if}
                                            </button>
                                        {/each}
                                 </div>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {#each (weaponData[activeWeaponSlot] || []) as w}
                                    <div class="bg-[#111111] border border-zinc-800 p-5 relative shadow-[inset_0_0_30px_rgba(0,0,0,0.5)] group overflow-hidden transition-all duration-500 hover:border-zinc-600 font-sans stone-card">
                                         <div class="sheen-overlay"></div>
                                         <div class="flex justify-between items-start mb-6">
                                                <div><h3 class="text-sm font-black italic uppercase {w.color}">{w.name}</h3><p class="text-[8px] text-zinc-600 uppercase tracking-widest font-sans">{w.type}</p></div>
                                                <div class="w-10 h-10 bg-zinc-900 border border-zinc-800 flex items-center justify-center rotate-45 group-hover:rotate-90 transition-transform duration-700"></div>
                                         </div>
                                         <div class="grid grid-cols-2 gap-4 relative z-10">
                                                <div><p class="text-[7px] text-zinc-700 uppercase font-bold tracking-widest font-sans">Hostiles Slain</p><p class="text-sm font-bold text-zinc-200">{w.kills}</p></div>
                                                <div><p class="text-[7px] text-zinc-700 uppercase font-bold tracking-widest font-sans">Precision Resonance</p><p class="text-sm font-bold text-emerald-500">{w.precision}</p></div>
                                         </div>
                                    </div>
                                {/each}
                            </div>
                        </div>

                    {:else if profileTab === 'synergy'}
                        <div class="space-y-8 animate-in slide-in-from-bottom-2 duration-500 max-w-6xl mx-auto">
                            <div>
                                {@render engravedHeader({ text: "BATTLE BROTHERS (ALLIES)" })}
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {#each (career?.allies ?? []) as teammate}
                                        <div class="bg-[#111111] border border-zinc-800 p-5 relative shadow-[inset_0_0_30px_rgba(0,0,0,0.5)] group hover:border-emerald-700/50 transition-all duration-500 stone-card">
                                            <div class="sheen-overlay"></div>
                                            <div class="flex items-center relative z-10">
                                                <div class="w-12 h-12 bg-zinc-900 border border-zinc-800 flex items-center justify-center rotate-45 shrink-0 ml-2">
                                                    <span class="text-[10px] font-black italic text-emerald-500 -rotate-45">{teammate.winRate}%</span>
                                                </div>
                                                <div class="ml-12 flex-1 font-sans">
                                                     <a href="/profile/{teammate.name}/{teammate.code}" class="text-sm font-bold text-zinc-100 tracking-wide uppercase hover:text-emerald-400 transition-colors">{teammate.name}</a>
                                                     <div class="flex items-center gap-4 mt-1">
                                                            <span class="text-[9px] font-sans text-emerald-600 uppercase font-bold tracking-widest">{teammate.games} GAMES TOGETHER</span>
                                                            <div class="w-1 h-1 bg-zinc-800 rotate-45"></div>
                                                            <span class="text-[9px] font-sans text-zinc-500 uppercase">{teammate.winRate}% TEAM WIN RATE</span>
                                                     </div>
                                                </div>
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                            <div>
                                {@render engravedHeader({ text: "NEMESIS TRACKER (RIVALS)", className: "text-rose-500" })}
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {#each (career?.rivals ?? []) as rival}
                                        <div class="bg-[#111111] border border-zinc-800 p-5 relative shadow-[inset_0_0_30px_rgba(0,0,0,0.5)] group hover:border-rose-900/50 transition-all duration-500 stone-card">
                                            <div class="sheen-overlay"></div>
                                            <div class="flex items-center relative z-10">
                                                <div class="w-12 h-12 bg-zinc-900 border border-zinc-800 flex items-center justify-center rotate-45 shrink-0 ml-2">
                                                    <span class="text-[10px] font-black italic text-rose-500 -rotate-45">{rival.winRate}%</span>
                                                </div>
                                                <div class="ml-12 flex-1 font-sans">
                                                     <a href="/profile/{rival.name}/{rival.code}" class="text-sm font-bold text-zinc-100 tracking-wide uppercase hover:text-rose-400 transition-colors">{rival.name}</a>
                                                     <div class="flex items-center gap-4 mt-1">
                                                            <span class="text-[9px] font-sans text-rose-600 uppercase font-bold tracking-widest">{rival.games} ENCOUNTERS</span>
                                                            <div class="w-1 h-1 bg-zinc-800 rotate-45"></div>
                                                            <span class="text-[9px] font-sans text-zinc-500 uppercase">{rival.winRate}% YOUR WIN RATE</span>
                                                     </div>
                                                </div>
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        </div>

                    {:else if profileTab === 'maps'}
                        <div class="space-y-6 animate-in fade-in duration-500 max-w-6xl mx-auto">
                            {@render engravedHeader({ text: "MAP EFFICIENCY" })}
                            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 font-sans">
                                {#each (career?.maps ?? []) as map}
                                    <div class="bg-[#111111] border border-zinc-800 p-5 relative shadow-[inset_0_0_30px_rgba(0,0,0,0.5)] group hover:border-emerald-500/50 transition-all duration-500 text-center stone-card overflow-hidden">
                                         <div class="sheen-overlay"></div>
                                         {#if map.map_image} <div class="absolute inset-0 bg-cover bg-center opacity-10 group-hover:opacity-25 transition-opacity" style="background-image:url('{map.map_image}')"></div> {/if}
                                         <div class="relative z-10">
                                             <div class="w-full h-16 bg-zinc-950/50 mb-3 flex items-center justify-center overflow-hidden border border-zinc-800 relative"><div class="w-8 h-8 border border-zinc-800 rotate-45 group-hover:border-emerald-500/30 transition-colors"></div></div>
                                             <p class="text-xs font-black italic text-zinc-300 uppercase tracking-tighter">{map.name}</p>
                                             <p class="text-sm font-bold text-emerald-500 mt-2">{map.winRate}% WIN RATE</p>
                                             <p class="text-[8px] text-zinc-600 uppercase tracking-widest mt-1">{map.games} matches</p>
                                         </div>
                                    </div>
                                {/each}
                            </div>
                        </div>

                    {:else if profileTab === 'pursuits'}
                        <div class="space-y-6 animate-in slide-in-from-bottom-2 duration-700 max-w-6xl mx-auto">
                            {@render engravedHeader({ text: "CAREER ACHIEVEMENTS" })}
                            <div class="grid gap-3">
                                {#each (career?.medals?.slice(0, 10) ?? []) as m}
                                    <div class="bg-[#111111] border border-zinc-800 p-5 relative group hover:border-zinc-600 transition-all font-sans stone-card">
                                         <div class="sheen-overlay"></div>
                                         <div class="flex justify-between items-start mb-2 relative z-10">
                                                <div><h3 class="text-sm font-black italic text-zinc-100 uppercase">{m.key}</h3><p class="text-[10px] text-zinc-500 italic mt-1 font-serif">"Mastery of {m.key} mechanics."</p></div>
                                                <p class="text-[9px] font-bold text-emerald-500 font-sans uppercase">{m.count} EARNED</p>
                                         </div>
                                         <div class="flex items-center gap-4 mt-4 font-sans relative z-10"><div class="flex-1 h-[2px] bg-zinc-900 overflow-hidden"><div class="h-full bg-emerald-500 transition-all duration-1000" style="width: {Math.min(100, m.count * 5)}%;"></div></div></div>
                                    </div>
                                {/each}
                                {#if !career?.medals?.length}
                                    <div class="text-center py-20 text-zinc-700 uppercase tracking-widest text-[10px]">No major achievements recorded yet.</div>
                                {/if}
                            </div>
                        </div>

                    {:else if profileTab === 'loadout'}
                        <div class="animate-in fade-in zoom-in-95 duration-700 max-w-6xl mx-auto py-10 px-4">
                            <div class="grid grid-cols-12 gap-12 items-start font-sans">
                                <div class="col-span-3 space-y-12 flex flex-col items-center">
                                     <div class="flex flex-col items-center group cursor-pointer w-full">
                                            <div class="w-24 h-24 flex items-center justify-center mx-auto relative">
                                                <div class="absolute inset-0 bg-emerald-500/5 rounded-full blur-3xl animate-pulse"></div>
                                                <div class="w-20 h-20 bg-[#0a0a0a] border-2 border-zinc-800 flex items-center justify-center rotate-45 group-hover:border-emerald-500/50 group-hover:rotate-90 transition-all duration-700 shadow-2xl">
                                                     <div class="w-10 h-10 border border-emerald-400 rotate-45 -rotate-45 flex items-center justify-center"> <div class="w-2 h-2 bg-emerald-500"></div> </div>
                                                </div>
                                            </div>
                                            <div class="mt-6 text-center w-full">
                                                 <span class="text-[9px] font-sans text-zinc-600 uppercase tracking-[0.2em] font-bold block mb-1">SUBCLASS</span>
                                                 <p class="text-[11px] font-bold text-zinc-100 uppercase tracking-widest">{playerData.loadout.subclass}</p>
                                            </div>
                                     </div>
                                     <div class="space-y-10 w-full flex flex-col items-center pt-8 border-t border-zinc-800/40">
                                            {#each playerData.loadout.weapons as w} {@render jadestoneSlot({ slot: w.slot, name: w.name, quality: w.quality })} {/each}
                                     </div>
                                </div>
                                <div class="col-span-6 relative flex items-center justify-center min-h-[500px]">
                                     <div class="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none">
                                            <div class="w-[400px] h-[400px] border border-emerald-500 rounded-full animate-pulse"></div>
                                            <div class="absolute w-[500px] h-[500px] border border-zinc-800 rounded-full"></div>
                                     </div>
                                     <div class="w-80 h-[480px] relative z-10 flex flex-col items-center justify-center">
                                            <div class="absolute inset-0 bg-gradient-to-t from-emerald-500/10 via-transparent to-transparent opacity-40 blur-3xl"></div>
                                            <div class="text-[10px] font-sans text-zinc-800 uppercase tracking-[1em] text-center rotate-90 whitespace-nowrap font-bold select-none opacity-40">CHARACTER_ENTITY</div>
                                            <div class="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-zinc-800"></div>
                                            <div class="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-zinc-800"></div>
                                     </div>
                                </div>
                                <div class="col-span-3 flex flex-col space-y-8 items-center h-full">
                                     <div class="flex flex-col items-center gap-6 w-full">
                                            {#each playerData.loadout.armor as a} {@render jadestoneSlot({ slot: a.slot, name: a.name, quality: a.quality })} {/each}
                                     </div>
                                     <div class="w-full mt-auto bg-[#0a0a0a] border border-zinc-800 p-5 shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] font-sans">
                                            <div class="flex justify-between items-center border-b border-zinc-800 pb-3 mb-3">
                                                 <span class="text-[10px] text-emerald-500 uppercase tracking-widest font-bold">STATS</span>
                                                 <div class="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                                            </div>
                                            {#each Object.entries(playerData.loadout.stats) as [statName, statValue]}
                                                {@render fateStatRow({ label: statName, value: statValue, bonus: playerData.loadout.bonuses[statName] })}
                                            {/each}
                                            <div class="mt-6 pt-3 border-t border-zinc-800 flex items-center justify-between">
                                                 <span class="text-[8px] text-zinc-600 uppercase tracking-widest font-bold">TOTAL RATING: {grandTotal}</span>
                                                 <span class="text-[10px] text-emerald-400 font-bold uppercase italic tracking-tighter">BUILD TIER {buildTier}</span>
                                            </div>
                                     </div>
                                </div>
                            </div>
                        </div>
                    {/if}
                </div>
                {/key}
             </div>
        </main>
    </div>
</div>
