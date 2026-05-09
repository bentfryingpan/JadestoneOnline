<script>
    import { goto } from '$app/navigation';

    let name        = $state('');
    let error       = $state('');
    let suggestions = $state([]);
    let loading     = $state(false);
    let selIdx      = $state(-1);
    let debounce    = null;

    function onInput() {
        error  = '';
        selIdx = -1;
        clearTimeout(debounce);
        const q = name.trim();
        if (q.length < 2) { suggestions = []; loading = false; return; }
        loading = true;
        debounce = setTimeout(async () => {
            try {
                const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
                suggestions = await res.json();
            } catch { suggestions = []; }
            loading = false;
        }, 220);
    }

    function navigate(s) {
        suggestions = [];
        goto(`/profile/${encodeURIComponent(s.name)}/${s.code}`);
    }

    function search() {
        const trimmed = name.trim();
        if (trimmed.includes('#')) {
            const [n, code] = trimmed.split('#');
            navigate({ name: n.trim(), code: code.trim() });
        } else if (suggestions.length) {
            navigate(suggestions[0]);
        } else {
            error = 'Enter your full Bungie name — e.g. bent#9599';
        }
    }

    function onKeydown(e) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selIdx = Math.min(selIdx + 1, suggestions.length - 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selIdx = Math.max(selIdx - 1, -1);
        } else if (e.key === 'Enter') {
            if (selIdx >= 0 && suggestions[selIdx]) navigate(suggestions[selIdx]);
            else search();
        } else if (e.key === 'Escape') {
            suggestions = [];
        }
    }

    function onBlur() {
        setTimeout(() => { suggestions = []; }, 180);
    }
</script>

<main class="flex flex-col items-center justify-center px-6 pt-28 pb-20">

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

    <!-- Search box -->
    <div class="w-full max-w-md relative">
        <div class="flex gap-2">
            <div class="relative flex-1">
                <input
                    bind:value={name}
                    oninput={onInput}
                    onkeydown={onKeydown}
                    onblur={onBlur}
                    placeholder="Search a Guardian — e.g. bent#9599"
                    class="w-full bg-white/[0.05] border border-white/10 rounded-lg px-4 py-3
                           text-white placeholder-slate-500 focus:outline-none
                           focus:border-emerald-500/60 focus:bg-white/[0.07] transition-all text-sm"
                />
                {#if loading}
                    <div class="absolute right-3 top-1/2 -translate-y-1/2
                                w-4 h-4 border-2 border-slate-600 border-t-emerald-400
                                rounded-full animate-spin"></div>
                {/if}
            </div>
            <button onclick={search}
                    class="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold
                           px-5 py-3 rounded-lg transition-colors text-sm shrink-0">
                Search
            </button>
        </div>

        {#if error}
            <p class="text-red-400 text-xs mt-2 ml-1">{error}</p>
        {/if}

        <!-- Suggestions dropdown -->
        {#if suggestions.length}
            <div class="absolute top-full left-0 right-0 mt-1.5 z-50
                        bg-[#0d0f1a] border border-white/[0.08] rounded-xl
                        shadow-2xl overflow-hidden">
                {#each suggestions as s, i}
                    <button
                        onmousedown={() => navigate(s)}
                        class="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors
                               {i === selIdx ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}
                               {i > 0 ? 'border-t border-white/[0.04]' : ''}">
                        {#if s.iconPath}
                            <img src="https://www.bungie.net{s.iconPath}" alt=""
                                 class="w-9 h-9 rounded shrink-0 object-cover ring-1 ring-white/10" />
                        {:else}
                            <div class="w-9 h-9 rounded bg-white/10 shrink-0"></div>
                        {/if}
                        <div class="flex-1 min-w-0">
                            <p class="text-sm text-white">
                                {s.name}<span class="text-slate-500">#{s.code}</span>
                            </p>
                        </div>
                        <svg class="w-4 h-4 text-slate-600 shrink-0" fill="none"
                             stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M9 5l7 7-7 7"/>
                        </svg>
                    </button>
                {/each}
            </div>
        {/if}
    </div>

    <p class="text-slate-600 text-xs mt-6">Type a name to see live suggestions</p>
</main>
