<script>
    let name = $state('');
    let player = $state(null);
    let loading = $state(false);
    let error = $state(null);

    async function search() {
        loading = true;
        error = null;
        player = null;

        const res = await fetch(`/api/player?name=${encodeURIComponent(name)}`);
        const data = await res.json();

        if (data.ErrorCode !== 1) {
            error = 'Player not found.';
        } else {
            player = data.Response.find(p => p.membershipType === 3) ?? data.Response[0];
        }

        loading = false;
    }
</script>

<main class="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-8">
    <h1 class="text-4xl font-bold mb-8">Jadestone</h1>

    <div class="flex gap-2 mb-8">
        <input
            bind:value={name}
            placeholder="Bungie name e.g. bent#9599"
            class="bg-gray-800 border border-gray-600 rounded px-4 py-2 w-72"
        />
        <button
            on:click={search}
            class="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded font-semibold"
        >
            Search
        </button>
    </div>

    {#if loading}
        <p>Loading...</p>
    {:else if error}
        <p class="text-red-400">{error}</p>
    {:else if player}
        <div class="bg-gray-800 rounded p-6 w-full max-w-md">
            <p class="text-xl font-bold">{player.bungieGlobalDisplayName}#{player.bungieGlobalDisplayNameCode}</p>
            <p class="text-gray-400 text-sm mt-1">Membership ID: {player.membershipId}</p>
        </div>
    {/if}
</main>