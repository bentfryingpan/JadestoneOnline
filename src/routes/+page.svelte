<script>
    import { goto } from '$app/navigation';

    let name  = $state('');
    let error = $state('');

    function search() {
        const trimmed = name.trim();
        if (!trimmed.includes('#')) {
            error = 'Enter your full Bungie name — e.g. bent#9599';
            return;
        }
        error = '';
        const [n, code] = trimmed.split('#');
        goto(`/profile/${encodeURIComponent(n.trim())}/${code.trim()}`);
    }
</script>

<main class="flex flex-col items-center justify-center px-6 pt-32 pb-20">

    <div class="mb-10 text-center">
        <p class="text-emerald-400 text-sm font-semibold tracking-widest uppercase mb-3">◆ Jadestone</p>
        <h1 class="text-4xl sm:text-5xl font-bold text-white tracking-tight mb-3">
            Gambit Stats & Performance
        </h1>
        <p class="text-slate-400 text-base max-w-md mx-auto">
            Career statistics, match history, and performance ratings
            for every Guardian who's stepped into the Drifter's game.
        </p>
    </div>

    <div class="w-full max-w-md">
        <div class="flex gap-2">
            <input
                bind:value={name}
                onkeydown={e => e.key === 'Enter' && search()}
                placeholder="Bungie name — e.g. bent#9599"
                class="flex-1 bg-white/[0.05] border border-white/10 rounded-lg px-4 py-3
                       text-white placeholder-slate-500 focus:outline-none
                       focus:border-emerald-500/60 focus:bg-white/[0.07] transition-all text-sm"
            />
            <button onclick={search}
                    class="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold
                           px-5 py-3 rounded-lg transition-colors text-sm shrink-0">
                Search
            </button>
        </div>
        {#if error}
            <p class="text-red-400 text-xs mt-2 ml-1">{error}</p>
        {/if}
    </div>

    <p class="text-slate-600 text-xs mt-6">Search any player's Bungie name to view their Gambit profile</p>
</main>