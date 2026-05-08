<script>
    let { data } = $props();

    const classNames = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' };
    const raceNames  = { 0: 'Human', 1: 'Awoken', 2: 'Exo' };
    const tierBorder = {
        6: 'border-yellow-400',
        5: 'border-purple-500',
        4: 'border-blue-400',
        3: 'border-green-600',
        2: 'border-gray-500'
    };

    let activeTab  = $state('overview');
    let activeChar = $state(data.characterIds[0] ?? null);
    let claiming   = $state(false);
    let claimed    = $state(false);
    let tooltip    = $state(null); // { name, icon, desc, x, y }

    $effect(() => { claimed = data.isClaimed; });

    const char    = $derived(data.characters[activeChar] ?? {});
    const eq      = $derived(data.characterEquipment[activeChar] ?? {});
    const sockets = $derived(eq.subclassSockets ?? {});

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

    const subclassColors = $derived((() => {
        const name = eq.subclass?.name?.toLowerCase() ?? '';
        if (name.includes('void'))   return { border: 'border-violet-500', glow: 'shadow-violet-700/50', bg: 'bg-violet-950/30', text: 'text-violet-400' };
        if (name.includes('solar'))  return { border: 'border-orange-500', glow: 'shadow-orange-700/50', bg: 'bg-orange-950/30', text: 'text-orange-400' };
        if (name.includes('arc'))    return { border: 'border-cyan-400',   glow: 'shadow-cyan-700/50',   bg: 'bg-cyan-950/30',   text: 'text-cyan-400'   };
        if (name.includes('stasis')) return { border: 'border-blue-400',   glow: 'shadow-blue-700/50',   bg: 'bg-blue-950/30',   text: 'text-blue-400'   };
        if (name.includes('strand')) return { border: 'border-emerald-400',glow: 'shadow-emerald-700/50',bg: 'bg-emerald-950/30',text: 'text-emerald-400' };
        if (name.includes('prism'))  return { border: 'border-pink-400',   glow: 'shadow-pink-700/50',   bg: 'bg-pink-950/30',   text: 'text-pink-400'   };
        return { border: 'border-white/30', glow: '', bg: 'bg-white/5', text: 'text-gray-300' };
    })());

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

    function showTooltip(e, item) {
        tooltip = { name: item.name, icon: item.icon, desc: item.flavorText ?? item.itemTypeDisplayName ?? '' };
    }
    function hideTooltip() { tooltip = null; }
</script>

<div class="min-h-screen bg-[#0c0e13] text-white font-sans">

    <!-- Hero Banner -->
    <div class="relative h-56 overflow-hidden">
        {#if data.emblemBackground}
            <img src={data.emblemBackground} alt="" class="absolute inset-0 w-full h-full object-cover object-center opacity-40" />
        {/if}
        <div class="absolute inset-0 bg-gradient-to-t from-[#0c0e13] via-[#0c0e13]/50 to-transparent"></div>
        <div class="absolute inset-0 bg-gradient-to-r from-[#0c0e13]/90 via-transparent to-[#0c0e13]/40"></div>

        <div class="absolute bottom-0 left-0 right-0 px-8 pb-5 flex items-end justify-between">
            <div class="flex items-end gap-5">
                <!-- Avatar -->
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

    <!-- Tab Bar -->
    <div class="border-b border-white/10 bg-[#10121a] px-8">
        <nav class="flex gap-1">
            {#each [['overview','Overview'],['matches','Matches'],['stats','Stats']] as [id, label]}
                <button onclick={() => activeTab = id}
                    class="px-5 py-3 text-sm font-semibold transition-colors border-b-2 {activeTab === id ? 'border-emerald-400 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}">
                    {label}
                </button>
            {/each}
        </nav>
    </div>

    <!-- Character Selector -->
    <div class="bg-[#10121a] border-b border-white/10 px-8 py-2.5 flex items-center gap-2">
        {#each data.characterIds as charId}
            {@const c = data.characters[charId]}
            <button onclick={() => activeChar = charId}
                class="flex items-center gap-2 px-4 py-2 rounded transition-all text-sm {activeChar === charId
                    ? 'bg-white/10 border border-white/25 text-white'
                    : 'border border-transparent text-gray-500 hover:text-gray-300 hover:border-white/10'}">
                <span class="font-bold">{classNames[c?.classType] ?? '?'}</span>
                <span class="text-gray-400 text-xs">{raceNames[c?.raceType] ?? ''}</span>
                <span class="text-yellow-400 font-bold text-xs ml-1">⬥{c?.light}</span>
            </button>
        {/each}
    </div>

    <!-- Main Content -->
    <div class="px-6 py-5 max-w-7xl mx-auto">

        {#if activeTab === 'overview'}

        <!-- ===== CHARACTER SCREEN ===== -->
        <div class="grid grid-cols-[220px_1fr_220px] gap-4 mb-6">

            <!-- LEFT: Weapons + Ghost/Vehicle/Ship -->
            <div class="flex flex-col gap-2">
                <p class="text-[10px] text-gray-500 uppercase tracking-[0.15em] font-bold mb-1">Weapons</p>

                {#each ['kinetic','energy','power'] as slot}
                    {@const item = eq[slot]}
                    <div class="flex items-center gap-2.5 bg-[#13161e] border border-white/8 rounded p-2.5 hover:border-white/15 transition-colors min-h-[68px]">
                        {#if item}
                            <img src={item.icon} alt={item.name}
                                class="w-14 h-14 rounded border-2 shrink-0 {tierBorder[item.tierType] ?? 'border-gray-600'}"
                                onmouseenter={(e) => showTooltip(e, item)}
                                onmouseleave={hideTooltip} />
                            <div class="min-w-0">
                                <p class="text-sm font-semibold leading-tight truncate">{item.name}</p>
                                <p class="text-[10px] text-gray-500 capitalize mt-0.5">{slot === 'kinetic' ? 'Kinetic' : slot === 'energy' ? 'Energy' : 'Power'}</p>
                            </div>
                        {:else}
                            <div class="w-14 h-14 rounded border-2 border-dashed border-white/10 shrink-0"></div>
                            <p class="text-xs text-gray-600 capitalize">{slot}</p>
                        {/if}
                    </div>
                {/each}

                <!-- Divider -->
                <div class="border-t border-white/8 my-1"></div>
                <p class="text-[10px] text-gray-500 uppercase tracking-[0.15em] font-bold mb-1">Utility</p>

                {#each ['ghost','vehicle','ship'] as slot}
                    {@const item = eq[slot]}
                    <div class="flex items-center gap-2.5 bg-[#13161e] border border-white/8 rounded p-2 hover:border-white/15 transition-colors min-h-[54px]">
                        {#if item}
                            <img src={item.icon} alt={item.name} class="w-10 h-10 rounded border border-white/20 shrink-0" />
                            <p class="text-xs font-medium truncate">{item.name}</p>
                        {:else}
                            <div class="w-10 h-10 rounded border border-dashed border-white/10 shrink-0"></div>
                        {/if}
                    </div>
                {/each}
            </div>

            <!-- CENTER: Subclass -->
            <div class="flex flex-col gap-3 {subclassColors.bg} border {subclassColors.border} rounded-lg p-4">

                <!-- Subclass Header -->
                {#if eq.subclass}
                <div class="flex items-center gap-3 pb-3 border-b border-white/10">
                    <img src={eq.subclass.icon} alt={eq.subclass.name} class="w-12 h-12 rounded border-2 {subclassColors.border} shadow-lg {subclassColors.glow}" />
                    <div>
                        <p class="font-bold text-base">{eq.subclass.name}</p>
                        <p class="text-xs {subclassColors.text}">{classNames[char.classType]} · Subclass</p>
                    </div>
                </div>
                {/if}

                <!-- Super -->
                {#if sockets.super}
                <div>
                    <p class="text-[10px] text-gray-500 uppercase tracking-[0.15em] font-bold mb-2">Super</p>
                    <div class="flex items-center gap-3 bg-black/20 border border-white/8 rounded p-2.5">
                        <img src={sockets.super.icon} alt={sockets.super.name} class="w-11 h-11 rounded border {subclassColors.border}" />
                        <p class="text-sm font-semibold">{sockets.super.name}</p>
                    </div>
                </div>
                {/if}

                <!-- Abilities: Jump + Grenade + Melee + Class -->
                {#if sockets.abilities?.length}
                <div>
                    <p class="text-[10px] text-gray-500 uppercase tracking-[0.15em] font-bold mb-2">Abilities</p>
                    <div class="grid grid-cols-4 gap-2">
                        {#each sockets.abilities as ability}
                        <div class="group relative flex flex-col items-center gap-1.5 bg-black/20 border border-white/8 rounded p-2 hover:border-white/20 transition-colors cursor-default">
                            <img src={ability.icon} alt={ability.name} class="w-11 h-11 rounded" />
                            <p class="text-[9px] text-gray-400 text-center leading-tight">{ability.itemTypeDisplayName}</p>
                            <!-- Tooltip -->
                            <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20 pointer-events-none">
                                <div class="bg-[#1a1d27] border border-white/20 text-xs text-white px-3 py-2 rounded shadow-xl w-40">
                                    <p class="font-semibold mb-0.5">{ability.name}</p>
                                    <p class="text-gray-400">{ability.itemTypeDisplayName}</p>
                                </div>
                            </div>
                        </div>
                        {/each}
                    </div>
                </div>
                {/if}

                <!-- Aspects -->
                {#if sockets.aspects?.length}
                <div>
                    <p class="text-[10px] text-gray-500 uppercase tracking-[0.15em] font-bold mb-2">Aspects</p>
                    <div class="flex flex-col gap-2">
                        {#each sockets.aspects as aspect}
                        <div class="group relative flex items-center gap-3 bg-black/20 border border-white/8 rounded p-2.5 hover:border-white/20 transition-colors cursor-default">
                            <img src={aspect.icon} alt={aspect.name} class="w-10 h-10 rounded border border-white/15 shrink-0" />
                            <div class="min-w-0">
                                <p class="text-sm font-semibold truncate">{aspect.name}</p>
                                <p class="text-[10px] text-gray-500">Aspect</p>
                            </div>
                        </div>
                        {/each}
                    </div>
                </div>
                {/if}

                <!-- Fragments -->
                {#if sockets.fragments?.length}
                <div>
                    <p class="text-[10px] text-gray-500 uppercase tracking-[0.15em] font-bold mb-2">Fragments</p>
                    <div class="grid grid-cols-5 gap-1.5">
                        {#each sockets.fragments as fragment}
                        <div class="group relative flex flex-col items-center bg-black/20 border border-white/8 rounded p-1.5 hover:border-white/20 transition-colors cursor-default">
                            <img src={fragment.icon} alt={fragment.name} class="w-10 h-10 rounded" />
                            <!-- Tooltip -->
                            <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20 pointer-events-none">
                                <div class="bg-[#1a1d27] border border-white/20 text-xs text-white px-3 py-2 rounded shadow-xl w-40 text-center">
                                    <p class="font-semibold">{fragment.name}</p>
                                </div>
                            </div>
                        </div>
                        {/each}
                    </div>
                </div>
                {/if}

                <!-- Emblem -->
                {#if eq.emblem}
                <div class="mt-auto pt-3 border-t border-white/8">
                    <p class="text-[10px] text-gray-500 uppercase tracking-[0.15em] font-bold mb-2">Emblem</p>
                    <div class="flex items-center gap-2.5 bg-black/20 border border-white/8 rounded p-2">
                        <img src={eq.emblem.icon} alt={eq.emblem.name} class="w-10 h-10 rounded shrink-0" />
                        <p class="text-xs font-medium truncate">{eq.emblem.name}</p>
                    </div>
                </div>
                {/if}
            </div>

            <!-- RIGHT: Armor -->
            <div class="flex flex-col gap-2">
                <p class="text-[10px] text-gray-500 uppercase tracking-[0.15em] font-bold mb-1">Armor</p>

                {#each ['helmet','gauntlets','chest','legs','classItem'] as slot}
                    {@const item = eq[slot]}
                    <div class="flex items-center gap-2.5 bg-[#13161e] border border-white/8 rounded p-2.5 hover:border-white/15 transition-colors min-h-[68px]">
                        {#if item}
                            <img src={item.icon} alt={item.name}
                                class="w-14 h-14 rounded border-2 shrink-0 {tierBorder[item.tierType] ?? 'border-gray-600'}"
                                onmouseenter={(e) => showTooltip(e, item)}
                                onmouseleave={hideTooltip} />
                            <div class="min-w-0">
                                <p class="text-sm font-semibold leading-tight truncate">{item.name}</p>
                                <p class="text-[10px] text-gray-500 capitalize mt-0.5">{slot === 'classItem' ? 'Class Item' : slot}</p>
                            </div>
                        {:else}
                            <div class="w-14 h-14 rounded border-2 border-dashed border-white/10 shrink-0"></div>
                            <p class="text-xs text-gray-600 capitalize">{slot}</p>
                        {/if}
                    </div>
                {/each}
            </div>
        </div>

        <!-- Recent Gambit Matches (overview preview) -->
        <div class="bg-[#13161e] border border-white/8 rounded-lg p-4">
            <h2 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Recent Gambit</h2>
            {#if data.recentMatches.length === 0}
                <p class="text-gray-600 text-sm">No recent Gambit matches found.</p>
            {:else}
                <div class="space-y-1.5">
                    {#each data.recentMatches.slice(0, 5) as match}
                    {@const win = match.values?.standing?.basic?.value === 0}
                    <div class="flex items-center gap-4 py-2 px-3 rounded {win ? 'bg-emerald-950/40 border border-emerald-900/50' : 'bg-red-950/40 border border-red-900/50'}">
                        <span class="text-[10px] font-black w-9 text-center py-0.5 rounded {win ? 'bg-emerald-700 text-emerald-100' : 'bg-red-800 text-red-100'}">{win ? 'WIN' : 'LOSS'}</span>
                        <p class="text-xs text-gray-400 w-24 shrink-0">{new Date(match.period).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</p>
                        <div class="flex gap-6 text-xs ml-auto">
                            <span><span class="font-bold">{match.values?.kills?.basic?.value ?? 0}</span> <span class="text-gray-500">K</span></span>
                            <span><span class="font-bold">{match.values?.deaths?.basic?.value ?? 0}</span> <span class="text-gray-500">D</span></span>
                            <span><span class="font-bold">{match.values?.killsDeathsRatio?.basic?.displayValue ?? '-'}</span> <span class="text-gray-500">KD</span></span>
                        </div>
                    </div>
                    {/each}
                </div>
                {#if data.recentMatches.length > 5}
                <button onclick={() => activeTab = 'matches'} class="mt-3 text-xs text-gray-500 hover:text-gray-300 transition-colors">View all matches →</button>
                {/if}
            {/if}
        </div>

        {:else if activeTab === 'matches'}

        <div class="bg-[#13161e] border border-white/8 rounded-lg p-5">
            <h2 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Match History</h2>
            <div class="space-y-2">
                {#each data.recentMatches as match}
                {@const win = match.values?.standing?.basic?.value === 0}
                <div class="flex items-center gap-4 py-3 px-4 rounded-lg {win ? 'bg-emerald-950/40 border border-emerald-900/50' : 'bg-red-950/40 border border-red-900/50'}">
                    <span class="text-[10px] font-black w-10 text-center py-1 rounded {win ? 'bg-emerald-700 text-emerald-100' : 'bg-red-800 text-red-100'}">{win ? 'WIN' : 'LOSS'}</span>
                    <div class="w-40 shrink-0">
                        <p class="text-sm font-semibold">Gambit</p>
                        <p class="text-[10px] text-gray-500">{new Date(match.period).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})}</p>
                    </div>
                    <div class="flex gap-8 text-sm ml-auto">
                        <div class="text-center min-w-[40px]">
                            <p class="font-bold">{match.values?.kills?.basic?.value ?? 0}</p>
                            <p class="text-[10px] text-gray-500">Kills</p>
                        </div>
                        <div class="text-center min-w-[40px]">
                            <p class="font-bold">{match.values?.deaths?.basic?.value ?? 0}</p>
                            <p class="text-[10px] text-gray-500">Deaths</p>
                        </div>
                        <div class="text-center min-w-[40px]">
                            <p class="font-bold">{match.values?.killsDeathsRatio?.basic?.displayValue ?? '-'}</p>
                            <p class="text-[10px] text-gray-500">K/D</p>
                        </div>
                        <div class="text-center min-w-[40px]">
                            <p class="font-bold">{match.values?.efficiency?.basic?.displayValue ?? '-'}</p>
                            <p class="text-[10px] text-gray-500">Eff</p>
                        </div>
                        <div class="text-center min-w-[48px]">
                            <p class="font-bold">{match.values?.activityDurationSeconds?.basic?.displayValue ?? '-'}</p>
                            <p class="text-[10px] text-gray-500">Time</p>
                        </div>
                    </div>
                </div>
                {/each}
            </div>
        </div>

        {:else if activeTab === 'stats'}

        <div class="bg-[#13161e] border border-white/8 rounded-lg p-5">
            <h2 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Stats</h2>
            <p class="text-gray-600 text-sm">EGO Score and full career stats coming soon.</p>
        </div>

        {/if}

    </div>
</div>
