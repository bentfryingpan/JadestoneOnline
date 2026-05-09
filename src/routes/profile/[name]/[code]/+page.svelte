<script>
    import { untrack } from 'svelte';
    import SubclassScreen from '$lib/SubclassScreen.svelte';
    import CharacterScreen from '$lib/CharacterScreen.svelte';

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

    // ── Derived ────────────────────────────────────────────────────────────────
    const char    = $derived(data.characters[activeChar] ?? {});
    const eq      = $derived(data.characterEquipment[activeChar] ?? {});
    const sockets = $derived(eq.subclassSockets ?? {});

    // Gambit rank from progression
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

    // Subclass theme
    const subclassTheme = $derived((() => {
        const n = eq.subclass?.name?.toLowerCase() ?? '';
        if (n.includes('void'))   return { border:'border-violet-500', bg:'bg-violet-950/20', text:'text-violet-400', bar:'bg-violet-500' };
        if (n.includes('solar'))  return { border:'border-orange-500', bg:'bg-orange-950/20', text:'text-orange-400', bar:'bg-orange-500' };
        if (n.includes('arc'))    return { border:'border-cyan-400',   bg:'bg-cyan-950/20',   text:'text-cyan-400',   bar:'bg-cyan-400'   };
        if (n.includes('stasis')) return { border:'border-blue-400',   bg:'bg-blue-950/20',   text:'text-blue-400',   bar:'bg-blue-400'   };
        if (n.includes('strand')) return { border:'border-emerald-400',bg:'bg-emerald-950/20',text:'text-emerald-400',bar:'bg-emerald-400' };
        if (n.includes('prism'))  return { border:'border-pink-400',   bg:'bg-pink-950/20',   text:'text-pink-400',   bar:'bg-pink-400'   };
        return { border:'border-white/20', bg:'bg-white/5', text:'text-slate-300', bar:'bg-white' };
    })());

    // Lifetime stat helpers
    const ls = $derived(data.lifetimeStats ?? {});
    function sv(key)  { return ls[key]?.basic?.value          ?? 0; }
    function sdv(key) { return ls[key]?.basic?.displayValue   ?? '—'; }

    const entered  = $derived(sv('activitiesEntered'));
    const won      = $derived(sv('activitiesWon'));
    const kills    = $derived(sv('kills'));
    const deaths   = $derived(sv('deaths'));
    const winRate  = $derived(entered > 0 ? ((won / entered) * 100).toFixed(1) : '—');
    const kd       = $derived(deaths  > 0 ? (kills / deaths).toFixed(2)        : kills);

    // Armor totals
    const totalStats = $derived((() => {
        const slots = ['helmet','gauntlets','chest','legs','classItem'];
        const totals = {};
        for (const m of data.armorStatMeta) totals[m.name] = 0;
        for (const slot of slots) {
            const item = eq[slot];
            if (item?.armorStats) for (const s of item.armorStats) totals[s.name] += s.value;
        }
        return totals;
    })());

    // Weapon perk helpers
    const tierBorder = { 6:'border-yellow-400', 5:'border-purple-500', 4:'border-blue-400', 3:'border-green-600', 2:'border-gray-700' };
    const tierLabel  = { 6:'Exotic', 5:'Legendary', 4:'Rare', 3:'Uncommon', 2:'Common' };
    const tierBadge  = { 6:'bg-yellow-900/50 text-yellow-300 border-yellow-700', 5:'bg-purple-900/50 text-purple-300 border-purple-700', 4:'bg-blue-900/50 text-blue-300 border-blue-700' };
    const damageLabel = { 1:'Kinetic', 2:'Arc', 3:'Solar', 4:'Void', 6:'Stasis', 7:'Strand' };
    const damageColor = { 1:'text-slate-300', 2:'text-cyan-400', 3:'text-orange-400', 4:'text-violet-400', 6:'text-blue-300', 7:'text-emerald-400' };

    function weaponPerks(item) {
        if (!item?.perks) return { intrinsic:null, main:[], mod:null, mw:null };
        return {
            intrinsic: item.perks.find(p => p.isIntrinsic)   ?? null,
            mw:        item.perks.find(p => p.isMasterwork)  ?? null,
            mod:       item.perks.find(p => p.isMod)         ?? null,
            main:      item.perks.filter(p => !p.isIntrinsic && !p.isMasterwork && !p.isMod)
        };
    }

    // Match helpers
    function matchResult(m) {
        const standing  = m.values?.standing?.basic?.value;
        const completed = m.values?.completed?.basic?.value;
        if (!completed) return 'dnf';
        return standing === 0 ? 'win' : 'loss';
    }
    function fmt(n) { return Number.isFinite(n) ? n.toLocaleString() : '—'; }
    function timeAgo(iso) {
        const diff = Date.now() - new Date(iso).getTime();
        const m = Math.floor(diff / 60000);
        if (m < 60)   return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24)   return `${h}h ago`;
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

    const TABS = ['overview','seasons','matches','loadout','subclass'];
</script>

<!-- ── Hero Banner ─────────────────────────────────────────────────────────── -->
<div class="relative h-52 overflow-hidden">
    {#if data.emblemBg}
        <img src={data.emblemBg} alt=""
             class="absolute inset-0 w-full h-full object-cover object-center opacity-35" />
    {/if}
    <div class="absolute inset-0 bg-gradient-to-t from-[#09090f] via-[#09090f]/60 to-transparent"></div>
    <div class="absolute inset-0 bg-gradient-to-r from-[#09090f]/80 via-transparent to-transparent"></div>

    <div class="absolute bottom-0 left-0 right-0 px-6 pb-5 flex items-end justify-between">
        <!-- Player info -->
        <div class="flex items-end gap-4">
            <!-- Avatar -->
            <div class="w-16 h-16 rounded border border-white/10 overflow-hidden bg-white/5 shrink-0">
                {#if data.profile?.profile?.data?.userInfo?.iconPath}
                    <img src="https://www.bungie.net{data.profile.profile.data.userInfo.iconPath}"
                         alt="avatar" class="w-full h-full object-cover" />
                {/if}
            </div>
            <div>
                <div class="flex items-center gap-2 mb-0.5">
                    <h1 class="text-2xl font-bold text-white leading-none">
                        {data.player.bungieGlobalDisplayName}<span class="text-slate-400 font-normal">#{String(data.player.bungieGlobalDisplayNameCode).padStart(4,'0')}</span>
                    </h1>
                    <!-- EGO badge placeholder -->
                    <span class="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 tracking-wide">
                        EGO —
                    </span>
                </div>
                <div class="flex items-center gap-3 text-sm text-slate-400">
                    {#if data.clan}
                        <span class="text-slate-300">[{data.clan.name}]</span>
                        <span class="text-slate-600">·</span>
                    {/if}
                    <span>{classNames[char.classType] ?? ''} · {raceNames[char.raceType] ?? ''}</span>
                    {#if char.light}
                        <span class="text-slate-600">·</span>
                        <span class="text-yellow-400 font-semibold">⚡ {char.light}</span>
                    {/if}
                </div>
            </div>
        </div>

        <!-- Gambit rank -->
        <div class="text-right hidden sm:block">
            <p class="text-xs text-slate-500 uppercase tracking-wider mb-1">Gambit Rank</p>
            <p class="text-lg font-bold text-emerald-400">{gambitRank}</p>
            <div class="w-28 h-1 bg-white/10 rounded-full mt-1.5">
                <div class="h-full bg-emerald-500 rounded-full transition-all" style="width:{gambitPct}%"></div>
            </div>
        </div>
    </div>
</div>

<!-- ── Character selector ─────────────────────────────────────────────────── -->
<div class="border-b border-white/[0.06] bg-[#09090f]">
    <div class="max-w-6xl mx-auto px-6 flex items-center gap-1 pt-1">
        {#each data.characterIds as charId}
            {@const c = data.characters[charId]}
            <button onclick={() => activeChar = charId}
                    class="flex items-center gap-2 px-3 py-2.5 text-sm transition-colors rounded-t
                           {activeChar === charId
                               ? 'text-white border-b-2 border-emerald-400'
                               : 'text-slate-500 hover:text-slate-300'}">
                <span class="font-medium">{classNames[c?.classType] ?? 'Unknown'}</span>
                {#if c?.light}<span class="text-xs text-yellow-500">⚡{c.light}</span>{/if}
            </button>
        {/each}

        <!-- Claim button -->
        {#if data.canClaim && !claimed}
            <button onclick={claimProfile} disabled={claiming}
                    class="ml-auto mb-1 text-xs px-3 py-1.5 rounded border border-emerald-500/40
                           text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-50">
                {claiming ? 'Claiming…' : 'Claim profile'}
            </button>
        {:else if claimed}
            <span class="ml-auto mb-1 text-xs text-emerald-500">✓ Claimed</span>
        {/if}
    </div>
</div>

<!-- ── Page tabs ──────────────────────────────────────────────────────────── -->
<div class="border-b border-white/[0.06] bg-[#09090f]/80 sticky top-14 z-40 backdrop-blur">
    <div class="max-w-6xl mx-auto px-6 flex gap-1">
        {#each TABS as t}
            <button onclick={() => tab = t}
                    class="px-4 py-3 text-sm font-medium capitalize transition-colors
                           {tab === t
                               ? 'text-white border-b-2 border-emerald-400'
                               : 'text-slate-500 hover:text-slate-300'}">
                {t}
            </button>
        {/each}
    </div>
</div>

<!-- ── Tab content ────────────────────────────────────────────────────────── -->
<div class="max-w-6xl mx-auto px-6 py-8">

    <!-- ══ OVERVIEW ══════════════════════════════════════════════════════════ -->
    {#if tab === 'overview'}

        {#if !data.lifetimeStats}
            <p class="text-slate-500 text-center py-20">No Gambit stats found for this player.</p>
        {:else}

            <!-- Primary stat cards -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                {#each [
                    { label:'Win Rate',    value: winRate === '—' ? '—' : winRate + '%',   sub: `${fmt(won)} W / ${fmt(entered - won)} L` },
                    { label:'K/D Ratio',   value: kd,                                       sub: `${fmt(kills)} kills · ${fmt(deaths)} deaths` },
                    { label:'Matches',     value: fmt(entered),                             sub: `${fmt(won)} wins total` },
                    { label:'Gambit Rank', value: gambitRank,                               sub: `${gambitPct}% to next` },
                ] as card}
                    <div class="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                        <p class="text-xs text-slate-500 uppercase tracking-wider mb-2">{card.label}</p>
                        <p class="text-3xl font-bold text-white mb-1">{card.value}</p>
                        <p class="text-xs text-slate-500">{card.sub}</p>
                    </div>
                {/each}
            </div>

            <!-- Gambit-specific stat cards -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                {#each [
                    { label:'Invasions',        value: fmt(sv('invasions')),          sub: `${fmt(sv('invasionKills'))} invasion kills` },
                    { label:'Defeated Invaders',value: fmt(sv('invasionsDefeated')),  sub: 'times you stopped an invasion' },
                    { label:'Motes Deposited',  value: fmt(sv('motesBanked')),        sub: `${fmt(sv('motesLost'))} motes lost` },
                    { label:'Assists',          value: fmt(sv('assists')),            sub: sdv('kills') + ' kills' },
                ] as card}
                    <div class="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                        <p class="text-xs text-slate-500 uppercase tracking-wider mb-2">{card.label}</p>
                        <p class="text-3xl font-bold text-emerald-400 mb-1">{card.value}</p>
                        <p class="text-xs text-slate-500">{card.sub}</p>
                    </div>
                {/each}
            </div>

            <!-- Recent matches preview (last 5) -->
            <div class="mb-2 flex items-center justify-between">
                <h2 class="text-sm font-semibold text-slate-400 uppercase tracking-wider">Recent Matches</h2>
                <button onclick={() => tab = 'matches'} class="text-xs text-emerald-400 hover:text-emerald-300">
                    View all →
                </button>
            </div>
            <div class="space-y-1.5">
                {#each data.recentMatches.slice(0, 5) as match}
                    {@const result = matchResult(match)}
                    <div class="flex items-center gap-4 bg-white/[0.02] border border-white/[0.05]
                                rounded-lg px-4 py-3 hover:bg-white/[0.04] transition-colors">
                        <!-- Result pill -->
                        <span class="text-xs font-bold w-8 text-center py-0.5 rounded
                                     {result === 'win'  ? 'bg-emerald-500/20 text-emerald-400' :
                                      result === 'loss' ? 'bg-red-500/20    text-red-400'     :
                                                          'bg-slate-500/20  text-slate-400'}">
                            {result === 'win' ? 'W' : result === 'loss' ? 'L' : 'DNF'}
                        </span>
                        <!-- Date -->
                        <span class="text-xs text-slate-500 w-16">{timeAgo(match.period)}</span>
                        <!-- K/D/A -->
                        <span class="text-sm text-slate-300 flex-1">
                            {match.values?.kills?.basic?.value ?? 0}K /
                            {match.values?.deaths?.basic?.value ?? 0}D /
                            {match.values?.assists?.basic?.value ?? 0}A
                        </span>
                        <!-- EGO placeholder -->
                        <span class="text-xs text-slate-600 font-mono">EGO —</span>
                    </div>
                {/each}
            </div>
        {/if}

    <!-- ══ SEASONS ════════════════════════════════════════════════════════════ -->
    {:else if tab === 'seasons'}
        <div class="flex flex-col items-center justify-center py-24 text-center">
            <div class="text-4xl mb-4">📅</div>
            <h2 class="text-lg font-semibold text-white mb-2">Seasonal Breakdowns</h2>
            <p class="text-slate-500 text-sm max-w-sm">
                Per-season Gambit stats are coming soon. This will show your performance
                and EGO rating broken down by each Destiny 2 season.
            </p>
        </div>

    <!-- ══ MATCHES ════════════════════════════════════════════════════════════ -->
    {:else if tab === 'matches'}
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-sm font-semibold text-slate-400 uppercase tracking-wider">Match History</h2>
            <span class="text-xs text-slate-600">{data.recentMatches.length} recent matches</span>
        </div>

        {#if !data.recentMatches.length}
            <p class="text-slate-500 text-center py-20">No recent Gambit matches found.</p>
        {:else}
            <div class="space-y-1.5">
                {#each data.recentMatches as match}
                    {@const result = matchResult(match)}
                    {@const k  = match.values?.kills?.basic?.value    ?? 0}
                    {@const d  = match.values?.deaths?.basic?.value   ?? 0}
                    {@const a  = match.values?.assists?.basic?.value  ?? 0}
                    {@const dur = match.values?.activityDurationSeconds?.basic?.value ?? 0}
                    <div class="flex items-center gap-4 bg-white/[0.02] border
                                {result === 'win'  ? 'border-l-2 border-l-emerald-500 border-white/[0.04]' :
                                 result === 'loss' ? 'border-l-2 border-l-red-500    border-white/[0.04]' :
                                                     'border-white/[0.04]'}
                                rounded-lg px-4 py-3 hover:bg-white/[0.04] transition-colors">
                        <!-- Result -->
                        <span class="text-xs font-bold w-8 text-center py-0.5 rounded shrink-0
                                     {result === 'win'  ? 'bg-emerald-500/20 text-emerald-400' :
                                      result === 'loss' ? 'bg-red-500/20    text-red-400'     :
                                                          'bg-slate-500/20  text-slate-400'}">
                            {result === 'win' ? 'W' : result === 'loss' ? 'L' : 'DNF'}
                        </span>
                        <!-- Date -->
                        <span class="text-xs text-slate-500 w-16 shrink-0">{timeAgo(match.period)}</span>
                        <!-- K/D/A -->
                        <div class="flex items-center gap-1 text-sm flex-1">
                            <span class="text-white font-medium">{k}</span><span class="text-slate-600">/</span>
                            <span class="text-slate-300">{d}</span><span class="text-slate-600">/</span>
                            <span class="text-slate-400">{a}</span>
                            <span class="text-xs text-slate-600 ml-1">K/D/A</span>
                        </div>
                        <!-- Duration -->
                        {#if dur}
                            <span class="text-xs text-slate-600 hidden sm:block">
                                {Math.floor(dur/60)}m {dur%60}s
                            </span>
                        {/if}
                        <!-- EGO placeholder -->
                        <span class="text-xs text-slate-600 font-mono shrink-0">EGO —</span>
                    </div>
                {/each}
            </div>
        {/if}

    <!-- ══ LOADOUT ════════════════════════════════════════════════════════════ -->
    {:else if tab === 'loadout'}
        <CharacterScreen
            character={char}
            equipment={eq}
            {subclassTheme}
            {totalStats}
            {tierBorder} {tierLabel} {tierBadge}
            {damageLabel} {damageColor}
            {weaponPerks}
            artifact={data.artifact}
            armorStatMeta={data.armorStatMeta}
        />

    <!-- ══ SUBCLASS ═══════════════════════════════════════════════════════════ -->
    {:else if tab === 'subclass'}
        <SubclassScreen
            equipment={eq}
            {sockets}
            {subclassTheme}
        />
    {/if}

</div>
