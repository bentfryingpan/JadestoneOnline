<script>
    let { data } = $props();

    const classNames = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' };
    const raceNames = { 0: 'Human', 1: 'Awoken', 2: 'Exo' };
    const tierColors = { 6: 'border-yellow-400', 5: 'border-purple-500', 4: 'border-blue-400', 3: 'border-green-500' };

    let activeTab = $state('overview');
    let activeChar = $state(data.characterIds[0] ?? null);
    let claiming = $state(false);
    let claimed = $state(false);
    $effect(() => { claimed = data.isClaimed; });

    const characters = $derived(data.characters);
    const mainChar = $derived(characters[activeChar] ?? {});

    const gambitRanks = ['Guardian', 'Brave', 'Heroic', 'Fabled', 'Mythic', 'Legend'];
    const gambitRankName = $derived(() => {
        const step = data.gambitProgression?.level ?? 0;
        if (step < 4) return gambitRanks[0];
        if (step < 8) return gambitRanks[1];
        if (step < 13) return gambitRanks[2];
        if (step < 18) return gambitRanks[3];
        if (step < 24) return gambitRanks[4];
        return gambitRanks[5];
    });

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

<div class="min-h-screen bg-[#0e1015] text-white">

    <!-- Hero Banner -->
    <div class="relative h-52 overflow-hidden">
        {#if data.emblemBackground}
            <img src={data.emblemBackground} alt="emblem" class="absolute inset-0 w-full h-full object-cover object-center opacity-60" />
        {:else}
            <div class="absolute inset-0 bg-gradient-to-r from-gray-900 to-gray-800"></div>
        {/if}
        <div class="absolute inset-0 bg-gradient-to-t from-[#0e1015] via-transparent to-transparent"></div>

        <!-- Profile Info -->
        <div class="absolute bottom-0 left-0 right-0 px-6 pb-4 flex items-end justify-between">
            <div class="flex items-end gap-4">
                <!-- Avatar -->
                <div class="w-20 h-20 rounded-full border-2 border-white/20 overflow-hidden bg-gray-800 shrink-0">
                    {#if data.profile?.profile?.data?.userInfo?.iconPath}
                        <img src="https://www.bungie.net{data.profile.profile.data.userInfo.iconPath}" alt="avatar" class="w-full h-full object-cover" />
                    {/if}
                </div>

                <!-- Name + Clan -->
                <div>
                    <div class="flex items-center gap-2">
                        <h1 class="text-2xl font-bold">{data.player.bungieGlobalDisplayName}</h1>
                        <span class="text-gray-400 text-lg">#{data.player.bungieGlobalDisplayNameCode}</span>
                        {#if data.clan}
                            <span class="text-xs bg-white/10 border border-white/20 px-2 py-0.5 rounded text-gray-300">[{data.clan.clanInfo?.clanCallsign ?? data.clan.name}]</span>
                        {/if}
                    </div>
                    {#if data.gambitProgression}
                        <p class="text-sm text-emerald-400 mt-0.5">Infamy Rank · {gambitRankName()}</p>
                    {/if}
                </div>
            </div>

            <!-- Claim button -->
            <div class="pb-1">
                {#if claimed}
                    <span class="bg-emerald-900/50 text-emerald-300 border border-emerald-700 px-3 py-1 rounded text-sm font-semibold">✓ Claimed</span>
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
    <div class="border-b border-white/10 px-6 bg-[#13161c]">
        <nav class="flex gap-1">
            {#each [['overview','Overview'],['matches','Matches'],['stats','Stats']] as [id, label]}
                <button
                    onclick={() => activeTab = id}
                    class="px-4 py-3 text-sm font-semibold transition-colors border-b-2 {activeTab === id ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-gray-400 hover:text-white'}"
                >
                    {label}
                </button>
            {/each}
        </nav>
    </div>

    <!-- Character Selector -->
    <div class="bg-[#13161c] border-b border-white/10 px-6 py-3 flex gap-3">
        {#each data.characterIds as charId}
            {@const char = characters[charId]}
            <button
                onclick={() => activeChar = charId}
                class="flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors {activeChar === charId ? 'bg-emerald-900/40 border border-emerald-700 text-emerald-300' : 'bg-white/5 border border-white/10 text-gray-400 hover:text-white'}"
            >
                <span class="font-semibold">{classNames[char?.classType]}</span>
                <span class="text-xs opacity-70">{raceNames[char?.raceType]}</span>
                <span class="text-emerald-400 font-bold">+{char?.light}</span>
            </button>
        {/each}
    </div>

    <!-- Content -->
    <div class="px-6 py-6 max-w-7xl mx-auto">

        {#if activeTab === 'overview'}
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

            <!-- Equipped Items -->
            <div class="bg-[#13161c] border border-white/10 rounded-lg p-5">
                <h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Equipped</h2>
                <div class="grid grid-cols-4 gap-2">
                    {#each (data.characterEquipment[activeChar] ?? []) as item}
                        {#if item.icon}
                        <div class="relative group">
                            <img
                                src={item.icon}
                                alt={item.name}
                                class="w-full aspect-square rounded border {tierColors[item.tierType] ?? 'border-gray-600'} object-cover"
                            />
                            <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-black/90 text-xs text-white px-2 py-1 rounded whitespace-nowrap z-10">
                                {item.name}
                            </div>
                        </div>
                        {/if}
                    {/each}
                </div>
            </div>

            <!-- Recent Matches -->
            <div class="lg:col-span-2 bg-[#13161c] border border-white/10 rounded-lg p-5">
                <h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Recent Gambit Matches</h2>
                <div class="space-y-2">
                    {#if data.recentMatches.length === 0}
                        <p class="text-gray-500 text-sm">No recent Gambit matches found.</p>
                    {:else}
                        {#each data.recentMatches as match}
                        {@const win = match.values?.standing?.basic?.value === 0}
                        <div class="flex items-center justify-between py-2 px-3 rounded {win ? 'bg-emerald-900/20 border border-emerald-900/50' : 'bg-red-900/20 border border-red-900/50'}">
                            <div class="flex items-center gap-3">
                                <span class="text-xs font-bold px-2 py-0.5 rounded {win ? 'bg-emerald-700 text-emerald-100' : 'bg-red-700 text-red-100'}">{win ? 'WIN' : 'LOSS'}</span>
                                <div>
                                    <p class="text-sm font-semibold">Gambit</p>
                                    <p class="text-xs text-gray-400">{new Date(match.period).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                                </div>
                            </div>
                            <div class="text-right">
                                <p class="text-sm font-semibold">K/D: {match.values?.killsDeathsRatio?.basic?.displayValue ?? '-'}</p>
                                <p class="text-xs text-gray-400">{match.values?.kills?.basic?.value ?? 0}K / {match.values?.deaths?.basic?.value ?? 0}D</p>
                            </div>
                        </div>
                        {/each}
                    {/if}
                </div>
            </div>
        </div>

        {:else if activeTab === 'matches'}
        <div class="bg-[#13161c] border border-white/10 rounded-lg p-5">
            <h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Full Match History</h2>
            <div class="space-y-2">
                {#each data.recentMatches as match}
                {@const win = match.values?.standing?.basic?.value === 0}
                <div class="flex items-center justify-between py-3 px-4 rounded {win ? 'bg-emerald-900/20 border border-emerald-900/50' : 'bg-red-900/20 border border-red-900/50'}">
                    <div class="flex items-center gap-4">
                        <span class="text-xs font-bold w-10 text-center px-2 py-0.5 rounded {win ? 'bg-emerald-700 text-emerald-100' : 'bg-red-700 text-red-100'}">{win ? 'WIN' : 'LOSS'}</span>
                        <div>
                            <p class="font-semibold">Gambit</p>
                            <p class="text-xs text-gray-400">{new Date(match.period).toLocaleString()}</p>
                        </div>
                    </div>
                    <div class="flex gap-8 text-sm">
                        <div class="text-center">
                            <p class="font-semibold">{match.values?.kills?.basic?.value ?? 0}</p>
                            <p class="text-xs text-gray-400">Kills</p>
                        </div>
                        <div class="text-center">
                            <p class="font-semibold">{match.values?.deaths?.basic?.value ?? 0}</p>
                            <p class="text-xs text-gray-400">Deaths</p>
                        </div>
                        <div class="text-center">
                            <p class="font-semibold">{match.values?.killsDeathsRatio?.basic?.displayValue ?? '-'}</p>
                            <p class="text-xs text-gray-400">K/D</p>
                        </div>
                        <div class="text-center">
                            <p class="font-semibold">{match.values?.efficiency?.basic?.displayValue ?? '-'}</p>
                            <p class="text-xs text-gray-400">Efficiency</p>
                        </div>
                    </div>
                </div>
                {/each}
            </div>
        </div>

        {:else if activeTab === 'stats'}
        <div class="bg-[#13161c] border border-white/10 rounded-lg p-5">
            <h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Stats</h2>
            <p class="text-gray-500 text-sm">EGO Score and full career stats coming soon.</p>
        </div>
        {/if}

    </div>
</div>
