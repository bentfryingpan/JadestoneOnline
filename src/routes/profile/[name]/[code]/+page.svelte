<script>
    let { data } = $props();

    const classNames = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' };
    const raceNames = { 0: 'Human', 1: 'Awoken', 2: 'Exo' };

    const characters = $derived(Object.values(data.profile?.characters?.data ?? {}).sort((a, b) => new Date(b.dateLastPlayed) - new Date(a.dateLastPlayed)));

    let claiming = $state(false);
    let claimed = $state(false);
    $effect(() => { claimed = data.isClaimed; });

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

<div class="min-h-screen bg-gray-900 text-white">
    <div class="h-48 bg-gradient-to-r from-gray-800 to-gray-900 relative">
        <div class="absolute bottom-0 left-0 p-6 flex items-end gap-4">
            <div class="w-20 h-20 rounded-full bg-gray-700 border-2 border-green-400 overflow-hidden">
                {#if data.profile?.profile?.data?.userInfo?.iconPath}
                <img
                    src="https://www.bungie.net{data.profile.profile.data.userInfo.iconPath}"
                    alt="avatar"
                    class="w-full h-full object-cover"
                />
                {:else}
                <div class="w-full h-full bg-gray-600"></div>
                {/if}
            </div>
            <div class="flex-1">
                <h1 class="text-3xl font-bold">{data.player.bungieGlobalDisplayName}</h1>
                <p class="text-gray-400">#{data.player.bungieGlobalDisplayNameCode}</p>
            </div>
            <div class="pb-1">
                {#if claimed}
                    <span class="bg-green-800 text-green-300 px-3 py-1 rounded text-sm font-semibold">✓ Claimed</span>
                {:else if data.canClaim}
                    <button
                        onclick={claimProfile}
                        disabled={claiming}
                        class="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 rounded font-semibold text-sm"
                    >
                        {claiming ? 'Claiming...' : 'Claim this profile'}
                    </button>
                {/if}
            </div>
        </div>
    </div>

    <div class="border-b border-gray-700 px-6">
        <nav class="flex gap-6">
            <button class="py-3 border-b-2 border-green-400 text-green-400 font-semibold">Overview</button>
            <button class="py-3 text-gray-400 hover:text-white">Matches</button>
            <button class="py-3 text-gray-400 hover:text-white">Stats</button>
            <button class="py-3 text-gray-400 hover:text-white">Leaderboard</button>
        </nav>
    </div>

    <div class="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="bg-gray-800 rounded-lg p-4">
            <h2 class="text-lg font-semibold mb-4">Characters</h2>
            {#each characters as char}
            <div class="flex justify-between items-center py-2 border-b border-gray-700">
                <div>
                    <p class="font-semibold">{classNames[char.classType]}</p>
                    <p class="text-gray-400 text-sm">{raceNames[char.raceType]}</p>
                </div>
                <p class="text-green-400 font-bold text-lg">+{char.light}</p>
            </div>
            {/each}
        </div>

        <div class="md:col-span-2 bg-gray-800 rounded-lg p-4">
            <h2 class="text-lg font-semibold mb-4">Recent Gambit Matches</h2>
            {#if data.recentMatches.length === 0}
                <p class="text-gray-400">No recent Gambit matches found.</p>
            {:else}
                {#each data.recentMatches as match}
                <div class="flex justify-between items-center py-2 border-b border-gray-700">
                    <div>
                        <p class="font-semibold">Gambit</p>
                        <p class="text-gray-400 text-sm">{new Date(match.period).toLocaleDateString()}</p>
                    </div>
                    <div class="text-right">
                        <p class="font-bold {match.values?.standing?.basic?.value === 0 ? 'text-green-400' : 'text-red-400'}">
                            {match.values?.standing?.basic?.value === 0 ? 'Win' : 'Loss'}
                        </p>
                        <p class="text-gray-400 text-sm">K/D: {match.values?.killsDeathsRatio?.basic?.displayValue ?? '-'}</p>
                    </div>
                </div>
                {/each}
            {/if}
        </div>
    </div>
</div>
