<script>
    import { goto } from '$app/navigation';

    let { data } = $props();
    let name = $state('');
    let error = $state(null);

    async function search() {
        if (!name.includes('#')) {
            error = 'Please enter your full Bungie name e.g. bent#9599';
            return;
        }
        const [playerName, code] = name.split('#');
        goto(`/profile/${encodeURIComponent(playerName)}/${code}`);
    }

    function handleKeydown(e) {
        if (e.key === 'Enter') search();
    }
</script>

<main class="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-8">
    <div class="absolute top-4 right-4">
        {#if data.user}
            <div class="flex items-center gap-3">
                <span class="text-gray-300 text-sm">{data.user.displayName}</span>
                <a href="/auth/logout" class="text-gray-400 hover:text-white text-sm">Sign out</a>
            </div>
        {:else}
            <a href="/auth/login" class="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded font-semibold text-sm">
                Sign in with Bungie
            </a>
        {/if}
    </div>

    <h1 class="text-4xl font-bold mb-2">Jadestone</h1>
    <p class="text-gray-400 mb-8">Gambit Stats & Leaderboards</p>

    <div class="flex gap-2 mb-4">
        <input
            bind:value={name}
            onkeydown={handleKeydown}
            placeholder="Bungie name e.g. bent#9599"
            class="bg-gray-800 border border-gray-600 rounded px-4 py-2 w-72"
        />
        <button
            onclick={search}
            class="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded font-semibold"
        >
            Search
        </button>
    </div>

    {#if error}
        <p class="text-red-400 text-sm">{error}</p>
    {/if}
</main>