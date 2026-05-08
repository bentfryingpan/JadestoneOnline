<script>
    import { untrack } from 'svelte';
    import SubclassScreen from '$lib/SubclassScreen.svelte';

    let { data } = $props();

    const classNames = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' };
    const raceNames  = { 0: 'Human', 1: 'Awoken', 2: 'Exo' };

    const tierBorder = {
        6: 'border-yellow-400',
        5: 'border-purple-500',
        4: 'border-blue-400',
        3: 'border-green-600',
        2: 'border-gray-600'
    };
    const tierLabel = { 6: 'Exotic', 5: 'Legendary', 4: 'Rare', 3: 'Uncommon', 2: 'Common' };
    const tierBadge = {
        6: 'bg-yellow-900/60 text-yellow-300 border-yellow-700',
        5: 'bg-purple-900/60 text-purple-300 border-purple-700',
        4: 'bg-blue-900/60 text-blue-300 border-blue-700'
    };

    const damageLabel = { 1: 'Kinetic', 2: 'Arc', 3: 'Solar', 4: 'Void', 6: 'Stasis', 7: 'Strand' };
    const damageColor = {
        1: 'text-gray-300',
        2: 'text-cyan-400',
        3: 'text-orange-400',
        4: 'text-violet-400',
        6: 'text-blue-300',
        7: 'text-emerald-400'
    };

    let activeTab  = $state('overview');
    let activeChar = $state(untrack(() => data.characterIds[0] ?? null));
    let claiming   = $state(false);
    let claimed    = $state(false);

    $effect(() => { claimed = data.isClaimed; });

    const char    = $derived(data.characters[activeChar] ?? {});
    const eq      = $derived(data.characterEquipment[activeChar] ?? {});
    const sockets = $derived(eq.subclassSockets ?? {});

    // Gambit rank
    const gambitRankNames = ['Guardian','Brave','Heroic','Fabled','Mythic','Legend'];
    const gambitRank = $derived((() => {
        const lvl = data.gambitProgression?.level ?? 0;
        if (lvl < 4)  return gambitRankNames[0];
        if (lvl < 8)  return gambitRankNames[1];
        if (lvl < 13) return gambitRankNames[2];
        if (lvl < 18) return gambitRankNames[3];
        if (lvl < 24) return gambitRankNames[4];
        return gambitRankNames[5];
    })());
    const gambitProgress = $derived(data.gambitProgression?.progressToNextLevel ?? 0);
    const gambitNextAt   = $derived(data.gambitProgression?.nextLevelAt ?? 1);

    // Subclass color theme
    const subclassTheme = $derived((() => {
        const n = eq.subclass?.name?.toLowerCase() ?? '';
        if (n.includes('void'))   return { border: 'border-violet-500', bg: 'bg-violet-950/25', text: 'text-violet-400', bar: 'bg-violet-500' };
        if (n.includes('solar'))  return { border: 'border-orange-500', bg: 'bg-orange-950/25', text: 'text-orange-400', bar: 'bg-orange-500' };
        if (n.includes('arc'))    return { border: 'border-cyan-400',   bg: 'bg-cyan-950/25',   text: 'text-cyan-400',   bar: 'bg-cyan-400'   };
        if (n.includes('stasis')) return { border: 'border-blue-400',   bg: 'bg-blue-950/25',   text: 'text-blue-400',   bar: 'bg-blue-400'   };
        if (n.includes('strand')) return { border: 'border-emerald-400',bg: 'bg-emerald-950/25',text: 'text-emerald-400',bar: 'bg-emerald-400' };
        if (n.includes('prism'))  return { border: 'border-pink-400',   bg: 'bg-pink-950/25',   text: 'text-pink-400',   bar: 'bg-pink-400'   };
        return { border: 'border-white/20', bg: 'bg-white/5', text: 'text-gray-300', bar: 'bg-white' };
    })());

    // Total armor stats for selected character
    const totalStats = $derived((() => {
        const slots = ['helmet','gauntlets','chest','legs','classItem'];
        const totals = {};
        for (const meta of data.armorStatMeta) totals[meta.name] = 0;
        for (const slot of slots) {
            const item = eq[slot];
            if (item?.armorStats) {
                for (const s of item.armorStats) totals[s.name] += s.value;
            }
        }
        return totals;
    })());

    // Lifetime stats helpers
    const ls = $derived(data.lifetimeStats ?? {});
    const winRate = $derived((() => {
        const w = ls.activitiesWon?.basic?.value ?? 0;
        const p = ls.activitiesEntered?.basic?.value ?? 0;
        return p ? ((w / p) * 100).toFixed(1) : null;
    })());

    function stat(key) { return ls[key]?.basic?.displayValue ?? ls[key]?.basic?.value ?? '—'; }
    function statNum(key) { return ls[key]?.basic?.value ?? 0; }

    function statTier(total) { return Math.min(10, Math.floor(total / 10)); }
    function tierColor(t) {
        if (t >= 9) return 'text-cyan-300';
        if (t >= 7) return 'text-green-400';
        if (t >= 5) return 'text-yellow-400';
        if (t >= 3) return 'text-orange-400';
        return 'text-red-400';
    }

    // Weapon perk helpers
    function weaponPerks(item) {
        if (!item?.perks) return { intrinsic: null, main: [], mod: null, mw: null };
        const intrinsic = item.perks.find(p => p.isIntrinsic) ?? null;
        const mw = item.perks.find(p => p.isMasterwork) ?? null;
        const mod = item.perks.find(p => p.isMod) ?? null;
        const main = item.perks.filter(p => !p.isIntrinsic && !p.isMasterwork && !p.isMod);
        return { intrinsic, main, mod, mw };
    }

    async function claimProfile() {
        claiming = true;
        const res = await fetch('/api/claim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                membershipId: data.player.membershipId,
                membershipType: data.player.membershipType,
                bungieName: data.player.bungieGlobalDisplayName,
                bungieCode: data.player.bungieGlobalDisplayNameCode
            })
        });
        const result = await res.json();
        if (result.success) claimed = true;
        claiming = false;
    }
</script>

<div class="min-h-screen bg-[#0c0e13] text-white font-sans">

    <!-- ── Hero Banner ── -->
    <div class="relative h-56 overflow-hidden">
        {#if data.emblemBackground}
            <img src={data.emblemBackground} alt="" class="absolute inset-0 w-full h-full object-cover object-center opacity-40" />
        {/if}
        <div class="absolute inset-0 bg-gradient-to-t from-[#0c0e13] via-[#0c0e13]/50 to-transparent"></div>
        <div class="absolute inset-0 bg-gradient-to-r from-[#0c0e13]/90 via-transparent to-[#0c0e13]/50"></div>

        <div class="absolute bottom-0 left-0 right-0 px-8 pb-5 flex items-end justify-between">
            <div class="flex items-end gap-5">
                <div class="w-20 h-20 rounded-sm border border-white/20 overflow-hidden bg-gray-800 shrink-0 shadow-xl">
                    {#if data.profile?.profile?.data?.userInfo?.iconPath}
                        <img src="https://www.bungie.net{data.profile.profile.data.userInfo.iconPath}" alt="avatar" class="w-full h-full object-cover" />
                    {/if}
                </div>
                <div class="mb-1">
                    <div class="flex items-baseline gap-2 flex-wrap">
                        <h1 class="text-3xl font-bold tracking-tight">{data.player.bungieGlobalDisplayName}</h1>
                        <span class="text-gray-400 text-xl">#{data.player.bungieGlobalDisplayNameCode}</span>
                        {#if data.clan}
                            <span class="text-xs bg-white/10 border border-white/20 px-2 py-0.5 rounded text-gray-300 font-mono tracking-wider">[{data.clan.clanInfo?.clanCallsign ?? data.clan.name}]</span>
                        {/if}
                    </div>
                    {#if data.gambitProgression}
                        <p class="text-sm text-emerald-400 mt-1 font-semibold tracking-wide">Infamy · {gambitRank}</p>
                    {/if}
                </div>
            </div>
            <div class="pb-1 flex items-center gap-3">
                {#if claimed}
                    <span class="bg-emerald-900/50 text-emerald-300 border border-emerald-700 px-3 py-1.5 rounded text-sm font-semibold">✓ Claimed</span>
                {:else if data.canClaim}
                    <button onclick={claimProfile} disabled={claiming}
                        class="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 rounded font-semibold text-sm transition-colors">
                        {claiming ? 'Claiming...' : 'Claim this profile'}
                    </button>
                {/if}
            </div>
        </div>
    </div>

    <!-- ── Tabs ── -->
    <div class="border-b border-white/10 bg-[#10121a] px-8">
        <nav class="flex gap-1">
            {#each [['overview','Overview'],['character','Character'],['matches','Matches'],['stats','Stats']] as [id, label]}
                <button onclick={() => activeTab = id}
                    class="px-5 py-3 text-sm font-semibold transition-colors border-b-2 {activeTab === id
                        ? 'border-emerald-400 text-white'
                        : 'border-transparent text-gray-500 hover:text-gray-300'}">
                    {label}
                </button>
            {/each}
        </nav>
    </div>

    <!-- ── Character Selector ── -->
    <div class="bg-[#10121a] border-b border-white/10 px-8 py-2.5 flex items-center gap-2">
        {#each data.characterIds as charId}
            {@const c = data.characters[charId]}
            <button onclick={() => activeChar = charId}
                class="flex items-center gap-2 px-4 py-2 rounded text-sm transition-all {activeChar === charId
                    ? 'bg-white/10 border border-white/25 text-white'
                    : 'border border-transparent text-gray-500 hover:text-gray-300 hover:border-white/10'}">
                <span class="font-bold">{classNames[c?.classType] ?? '?'}</span>
                <span class="text-gray-500 text-xs">{raceNames[c?.raceType] ?? ''}</span>
                <span class="text-yellow-400 font-bold text-xs ml-1">⬥{c?.light}</span>
            </button>
        {/each}
    </div>

    <!-- ── Content ── -->
    <div class="px-6 py-5 max-w-7xl mx-auto">

        <!-- ════════════════════════════════════════════════ OVERVIEW ════ -->
        {#if activeTab === 'overview'}

        <!-- Infamy bar -->
        {#if data.gambitProgression}
        <div class="bg-[#13161e] border border-white/8 rounded-lg p-4 mb-4">
            <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-bold text-gray-400 uppercase tracking-widest">Infamy Rank</span>
                <span class="text-sm font-bold text-emerald-400">{gambitRank}</span>
            </div>
            <div class="h-2 bg-white/10 rounded-full overflow-hidden">
                <div class="h-full bg-emerald-500 rounded-full transition-all" style="width:{Math.min(100,(gambitProgress/gambitNextAt)*100).toFixed(1)}%"></div>
            </div>
            <div class="flex justify-between mt-1 text-[10px] text-gray-600">
                <span>{gambitProgress.toLocaleString()}</span>
                <span>{gambitNextAt.toLocaleString()}</span>
            </div>
        </div>
        {/if}

        <!-- Key stat cards -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {#each [
                { label: 'K/D Ratio',    value: stat('killsDeathsRatio'),     sub: 'lifetime' },
                { label: 'Win Rate',     value: winRate ? winRate + '%' : '—', sub: `${statNum('activitiesWon').toLocaleString()} wins` },
                { label: 'Games Played', value: statNum('activitiesEntered').toLocaleString(), sub: 'gambit' },
                { label: 'Efficiency',   value: stat('efficiency'),            sub: 'kda ratio' }
            ] as card}
            <div class="bg-[#13161e] border border-white/8 rounded-lg p-4 text-center">
                <p class="text-2xl font-black text-white">{card.value}</p>
                <p class="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">{card.label}</p>
                <p class="text-[10px] text-gray-600 mt-0.5">{card.sub}</p>
            </div>
            {/each}
        </div>

        <!-- Extended stats grid -->
        {#if data.lifetimeStats}
        <div class="bg-[#13161e] border border-white/8 rounded-lg p-5 mb-4">
            <h2 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Lifetime Gambit Stats</h2>
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {#each [
                    { label: 'Total Kills',          key: 'kills' },
                    { label: 'Total Deaths',         key: 'deaths' },
                    { label: 'Assists',              key: 'assists' },
                    { label: 'Kills / Deaths / Assists', key: 'killsDeathsAssists' },
                    { label: 'Best K/D',             key: 'bestSingleGameKills' },
                    { label: 'Avg Score / Game',     key: 'averageScorePerGame' },
                    { label: 'Longest Kill Spree',   key: 'longestKillSpree' },
                    { label: 'Most Precision Kills', key: 'mostPrecisionKills' },
                    { label: 'Objectives Completed', key: 'objectivesCompleted' },
                    { label: 'Avg Lifespan',         key: 'averageLifespan' },
                    { label: 'Combat Rating',        key: 'combatRating' },
                    { label: 'Resurrections Given',  key: 'resurrectionsPerformed' }
                ] as s}
                {#if ls[s.key]}
                <div class="flex flex-col">
                    <span class="text-base font-bold">{stat(s.key)}</span>
                    <span class="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">{s.label}</span>
                </div>
                {/if}
                {/each}
            </div>
        </div>
        {/if}

        <!-- Clan info -->
        {#if data.clan}
        <div class="bg-[#13161e] border border-white/8 rounded-lg p-4">
            <div class="flex items-center gap-3">
                {#if data.clan.clanInfo?.d2ClanProgressions}
                    <div class="w-10 h-10 rounded bg-white/10 border border-white/15 flex items-center justify-center text-lg font-black text-white">
                        [{data.clan.clanInfo?.clanCallsign ?? '?'}]
                    </div>
                {/if}
                <div>
                    <p class="font-bold">{data.clan.name}</p>
                    <p class="text-xs text-gray-500">{data.clan.about ?? ''}</p>
                </div>
            </div>
        </div>
        {/if}


        <!-- ════════════════════════════════════════════════ CHARACTER ════ -->
        {:else if activeTab === 'character'}

        <div class="grid grid-cols-[220px_1fr_220px] gap-4">

            <!-- LEFT: Weapons -->
            <div class="flex flex-col gap-3">
                <p class="text-[10px] text-gray-500 uppercase tracking-[0.15em] font-bold">Weapons</p>

                {#each ['kinetic','energy','power'] as slot}
                    {@const item = eq[slot]}
                    {@const { intrinsic, main, mw } = weaponPerks(item)}
                    <div class="bg-[#13161e] border border-white/8 rounded-lg overflow-hidden hover:border-white/15 transition-colors">
                        {#if item}
                        <!-- Weapon header -->
                        <div class="flex items-center gap-3 p-3 border-b border-white/8">
                            <div class="relative shrink-0">
                                <img src={item.icon} alt={item.name} class="w-14 h-14 rounded border-2 {tierBorder[item.tierType] ?? 'border-gray-600'}" />
                                {#if item.tierType === 6}
                                <div class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-yellow-400 border border-black"></div>
                                {/if}
                            </div>
                            <div class="min-w-0 flex-1">
                                <p class="text-sm font-bold truncate">{item.name}</p>
                                <div class="flex items-center gap-1.5 flex-wrap mt-0.5">
                                    {#if tierLabel[item.tierType]}
                                    <span class="text-[9px] font-bold px-1.5 py-px rounded border {tierBadge[item.tierType] ?? 'bg-gray-900 text-gray-400 border-gray-700'}">{tierLabel[item.tierType]}</span>
                                    {/if}
                                    {#if item.damageType && item.damageType !== 1}
                                    <span class="text-[10px] font-semibold {damageColor[item.damageType] ?? ''}">{damageLabel[item.damageType] ?? ''}</span>
                                    {:else}
                                    <span class="text-[10px] text-gray-500">{slot === 'kinetic' ? 'Kinetic' : slot === 'energy' ? 'Energy' : 'Power'}</span>
                                    {/if}
                                    {#if item.itemTypeDisplayName}
                                    <span class="text-[10px] text-gray-500">· {item.itemTypeDisplayName}</span>
                                    {/if}
                                </div>
                            </div>
                        </div>

                        <!-- Intrinsic perk -->
                        {#if intrinsic}
                        <div class="flex items-center gap-2.5 px-3 py-2 bg-black/20 border-b border-white/5">
                            <img src={intrinsic.icon} alt={intrinsic.name} class="w-7 h-7 rounded shrink-0 opacity-90" />
                            <div class="min-w-0">
                                <p class="text-xs font-semibold text-yellow-200/80 truncate">{intrinsic.name}</p>
                                <p class="text-[9px] text-gray-500">Intrinsic</p>
                            </div>
                        </div>
                        {/if}

                        <!-- Perk grid -->
                        {#if main.length}
                        <div class="p-2.5">
                            <div class="grid grid-cols-4 gap-1.5">
                                {#each main.slice(0, 8) as perk}
                                <div class="group relative flex flex-col items-center gap-1 p-1.5 rounded bg-white/4 hover:bg-white/8 transition-colors cursor-default">
                                    <img src={perk.icon} alt={perk.name} class="w-9 h-9 rounded {perk.isEnabled ? '' : 'opacity-30 grayscale'}" />
                                    <!-- Tooltip -->
                                    <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-30 pointer-events-none">
                                        <div class="bg-[#1c1f2e] border border-white/20 text-xs text-white px-3 py-2 rounded shadow-xl w-48">
                                            <p class="font-bold mb-1">{perk.name}</p>
                                            {#if perk.description}
                                            <p class="text-gray-400 leading-snug">{perk.description}</p>
                                            {/if}
                                            <p class="text-gray-600 text-[9px] mt-1">{perk.itemTypeDisplayName}</p>
                                        </div>
                                    </div>
                                </div>
                                {/each}
                            </div>
                            <!-- Masterwork indicator -->
                            {#if mw}
                            <div class="flex items-center gap-1.5 mt-2 px-1">
                                <img src={mw.icon} alt={mw.name} class="w-4 h-4 rounded opacity-70" />
                                <span class="text-[9px] text-yellow-600/70 font-semibold">{mw.name}</span>
                            </div>
                            {/if}
                        </div>
                        {:else}
                        <div class="px-3 py-4 text-[10px] text-gray-600">No perk data</div>
                        {/if}

                        {:else}
                        <div class="flex items-center gap-3 p-3 text-gray-700">
                            <div class="w-14 h-14 rounded border-2 border-dashed border-white/10 shrink-0"></div>
                            <p class="text-xs capitalize">{slot} · empty</p>
                        </div>
                        {/if}
                    </div>
                {/each}

                <!-- Artifact -->
                {#if data.artifact}
                <div class="mt-1">
                    <p class="text-[10px] text-gray-500 uppercase tracking-[0.15em] font-bold mb-2">Seasonal Artifact</p>
                    <div class="bg-[#13161e] border border-white/8 rounded-lg p-3 flex items-center gap-3 hover:border-white/15 transition-colors">
                        {#if data.artifact.icon}
                        <img src={data.artifact.icon} alt={data.artifact.name} class="w-12 h-12 rounded border border-white/20 shrink-0" />
                        {/if}
                        <div class="min-w-0 flex-1">
                            <p class="text-sm font-bold truncate">{data.artifact.name}</p>
                            <p class="text-[10px] text-gray-500 mt-0.5">{data.artifact.pointsAcquired.toLocaleString()} points</p>
                        </div>
                        <div class="shrink-0 text-right">
                            <p class="text-xl font-black text-yellow-400">+{data.artifact.powerBonus}</p>
                            <p class="text-[9px] text-gray-500 uppercase tracking-wider">Power</p>
                        </div>
                    </div>
                </div>
                {/if}
            </div>

            <!-- CENTER: Subclass screen overlay -->
            <div class="flex flex-col gap-2">
                <SubclassScreen {char} {eq} {sockets} />
            </div>

            <!-- RIGHT: Armor + Stats -->
            <div class="flex flex-col gap-3">
                <p class="text-[10px] text-gray-500 uppercase tracking-[0.15em] font-bold">Armor</p>

                {#each ['helmet','gauntlets','chest','legs','classItem'] as slot}
                    {@const item = eq[slot]}
                    <div class="bg-[#13161e] border border-white/8 rounded-lg overflow-hidden hover:border-white/15 transition-colors">
                        {#if item}
                        <!-- Armor header -->
                        <div class="flex items-center gap-2.5 p-3 border-b border-white/6">
                            <img src={item.icon} alt={item.name} class="w-12 h-12 rounded border-2 shrink-0 {tierBorder[item.tierType] ?? 'border-gray-600'}" />
                            <div class="min-w-0">
                                <p class="text-xs font-bold truncate">{item.name}</p>
                                <div class="flex items-center gap-1.5 mt-0.5">
                                    {#if tierLabel[item.tierType]}
                                    <span class="text-[9px] font-bold px-1 py-px rounded border {tierBadge[item.tierType] ?? 'bg-gray-900 text-gray-400 border-gray-700'}">{tierLabel[item.tierType]}</span>
                                    {/if}
                                    <span class="text-[9px] text-gray-500 capitalize">{slot === 'classItem' ? 'Class Item' : slot}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Stat bars -->
                        {#if item.armorStats}
                        <div class="px-3 py-2 space-y-1.5">
                            {#each item.armorStats as s}
                            <div class="flex items-center gap-2">
                                <span class="text-[9px] font-bold w-7 shrink-0 {s.text}">{s.short}</span>
                                <div class="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                    <div class="h-full {s.color} rounded-full transition-all" style="width:{Math.min(100,(s.value/42)*100).toFixed(1)}%"></div>
                                </div>
                                <span class="text-[10px] font-bold w-5 text-right text-gray-300">{s.value}</span>
                            </div>
                            {/each}
                            <!-- Piece total -->
                            <div class="pt-1 border-t border-white/6 flex justify-between items-center">
                                <span class="text-[9px] text-gray-600 uppercase tracking-wider">Total</span>
                                <span class="text-[10px] font-bold text-gray-300">{item.armorStats.reduce((a,s) => a+s.value, 0)}</span>
                            </div>
                        </div>
                        {:else}
                        <div class="px-3 py-2 text-[10px] text-gray-600">No stat data</div>
                        {/if}

                        {:else}
                        <div class="flex items-center gap-2.5 p-3 text-gray-700">
                            <div class="w-12 h-12 rounded border-2 border-dashed border-white/10 shrink-0"></div>
                            <p class="text-xs capitalize">{slot} · empty</p>
                        </div>
                        {/if}
                    </div>
                {/each}

                <!-- Total armor stats summary -->
                <div class="bg-[#13161e] border border-white/8 rounded-lg p-3 mt-1">
                    <p class="text-[9px] text-gray-500 uppercase tracking-[0.15em] font-bold mb-3">Total Armor Stats</p>
                    <div class="space-y-2">
                        {#each data.armorStatMeta as s}
                        {@const total = totalStats[s.name] ?? 0}
                        {@const tier = statTier(total)}
                        <div class="flex items-center gap-2">
                            <span class="text-[9px] font-bold w-7 shrink-0 {s.text}">{s.short}</span>
                            <div class="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                                <div class="h-full {s.color} rounded-full opacity-80 transition-all" style="width:{Math.min(100,(total/100)*100).toFixed(1)}%"></div>
                            </div>
                            <span class="text-xs font-bold w-7 text-right {tierColor(tier)}">{total}</span>
                            <span class="text-[9px] font-bold w-5 {tierColor(tier)} opacity-70">T{tier}</span>
                        </div>
                        {/each}
                    </div>
                </div>
            </div>
        </div>


        <!-- ════════════════════════════════════════════════ MATCHES ════ -->
        {:else if activeTab === 'matches'}

        <div class="bg-[#13161e] border border-white/8 rounded-lg p-5">
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-xs font-bold text-gray-400 uppercase tracking-widest">Gambit Match History</h2>
                <span class="text-xs text-gray-600">{data.recentMatches.length} matches</span>
            </div>

            {#if data.recentMatches.length === 0}
                <p class="text-gray-600 text-sm">No recent Gambit matches found.</p>
            {:else}
            <!-- Header row -->
            <div class="grid grid-cols-[80px_1fr_60px_60px_70px_70px_80px] gap-2 px-3 mb-2 text-[9px] text-gray-600 uppercase tracking-widest font-bold">
                <span></span>
                <span>Date</span>
                <span class="text-center">K</span>
                <span class="text-center">D</span>
                <span class="text-center">K/D</span>
                <span class="text-center">Eff</span>
                <span class="text-center">Time</span>
            </div>
            <div class="space-y-1.5">
                {#each data.recentMatches as match}
                {@const win = match.values?.standing?.basic?.value === 0}
                <div class="grid grid-cols-[80px_1fr_60px_60px_70px_70px_80px] gap-2 items-center py-2.5 px-3 rounded-lg {win ? 'bg-emerald-950/35 border border-emerald-900/40' : 'bg-red-950/35 border border-red-900/40'}">
                    <span class="text-[10px] font-black text-center py-1 rounded {win ? 'bg-emerald-700 text-emerald-100' : 'bg-red-800 text-red-100'}">{win ? 'WIN' : 'LOSS'}</span>
                    <div>
                        <p class="text-xs font-semibold">Gambit</p>
                        <p class="text-[10px] text-gray-500">{new Date(match.period).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})}</p>
                    </div>
                    <p class="text-sm font-bold text-center">{match.values?.kills?.basic?.value ?? 0}</p>
                    <p class="text-sm font-bold text-center">{match.values?.deaths?.basic?.value ?? 0}</p>
                    <p class="text-sm font-bold text-center">{match.values?.killsDeathsRatio?.basic?.displayValue ?? '—'}</p>
                    <p class="text-sm font-bold text-center">{match.values?.efficiency?.basic?.displayValue ?? '—'}</p>
                    <p class="text-sm font-bold text-center">{match.values?.activityDurationSeconds?.basic?.displayValue ?? '—'}</p>
                </div>
                {/each}
            </div>
            {/if}
        </div>


        <!-- ════════════════════════════════════════════════ STATS ════ -->
        {:else if activeTab === 'stats'}

        <div class="bg-[#13161e] border border-white/8 rounded-lg p-5 text-center py-16">
            <p class="text-gray-500 text-sm font-semibold">EGO Score &amp; Advanced Stats</p>
            <p class="text-gray-700 text-xs mt-1">Coming soon — will include Gambit EGO rating, NGR, seasonal breakdowns, and head-to-head comparisons.</p>
        </div>

        {/if}

    </div>
</div>
