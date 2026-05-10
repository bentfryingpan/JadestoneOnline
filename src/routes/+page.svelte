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

    function onBlur() { setTimeout(() => { suggestions = []; }, 180); }
</script>

<!-- ── Hero ────────────────────────────────────────────────────────────────── -->
<main class="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] px-6 py-20 relative overflow-hidden">

    <!-- Background grid pattern -->
    <div class="absolute inset-0 opacity-[0.025]"
         style="background-image: linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px),
                                  linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px);
                background-size: 64px 64px;">
    </div>

    <!-- Corner diamond accents -->
    <div class="absolute top-12 left-12 w-4 h-4 border border-emerald-500/20 rotate-45"></div>
    <div class="absolute top-12 right-12 w-4 h-4 border border-emerald-500/20 rotate-45"></div>
    <div class="absolute bottom-12 left-12 w-2 h-2 border border-zinc-700 rotate-45"></div>
    <div class="absolute bottom-12 right-12 w-2 h-2 border border-zinc-700 rotate-45"></div>

    <!-- Hero content -->
    <div class="relative text-center mb-12">
        <!-- Eyebrow label -->
        <div class="flex items-center justify-center gap-3 mb-5">
            <div class="h-px w-12 bg-gradient-to-r from-transparent to-emerald-500/40"></div>
            <span class="text-xs font-medium text-emerald-500/80 tracking-wide">
                Gambit Analytics
            </span>
            <div class="h-px w-12 bg-gradient-to-l from-transparent to-emerald-500/40"></div>
        </div>

        <!-- Main headline -->
        <h1 class="font-serif text-6xl sm:text-7xl font-light italic tracking-tight text-white leading-none mb-4">
            Jadestone
        </h1>
        <div class="h-px w-24 bg-gradient-to-r from-transparent via-emerald-500/60 to-transparent mx-auto mb-6"></div>
        <p class="text-base text-zinc-400 max-w-sm mx-auto leading-relaxed font-light">
            Career statistics, match history &amp; performance data for Destiny 2 Gambit
        </p>
    </div>

    <!-- Search block -->
    <div class="relative w-full max-w-md">

        <!-- Search container -->
        <div class="relative border border-zinc-700/60 bg-white/[0.04] backdrop-blur-md
                    shadow-[0_0_40px_rgba(0,0,0,0.6)]">

            <!-- Corner accents -->
            <span class="absolute top-0 left-0 w-2 h-2 border-t border-l border-emerald-500/40 pointer-events-none z-10"></span>
            <span class="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-emerald-500/40 pointer-events-none z-10"></span>

            <div class="flex items-center">
                <!-- Search icon -->
                <div class="pl-4 pr-2 text-zinc-600 shrink-0">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
                    </svg>
                </div>

                <!-- Input -->
                <input
                    bind:value={name}
                    oninput={onInput}
                    onkeydown={onKeydown}
                    onblur={onBlur}
                    placeholder="Search Guardian — name#0000"
                    class="flex-1 bg-transparent px-2 py-4 text-sm font-sans
                           text-zinc-200 placeholder-zinc-600 outline-none min-w-0"
                />

                <!-- Spinner -->
                {#if loading}
                    <div class="mr-3 w-3.5 h-3.5 border border-zinc-700 border-t-emerald-400 animate-spin shrink-0"></div>
                {/if}

                <!-- Search button -->
                <button onclick={search}
                        class="h-full px-5 py-4 bg-emerald-500/10 border-l border-zinc-700/60
                               text-sm font-medium text-emerald-400
                               hover:bg-emerald-500/20 hover:text-emerald-300 transition-colors shrink-0">
                    Search
                </button>
            </div>
        </div>

        <!-- Error -->
        {#if error}
            <p class="text-xs text-red-400 mt-2 ml-1">{error}</p>
        {/if}

        <!-- Suggestions dropdown -->
        {#if suggestions.length}
            <div class="absolute top-full left-0 right-0 mt-0 z-50
                        bg-[#060e0b]/90 backdrop-blur-md border border-t-0 border-zinc-700/60
                        shadow-[0_8px_40px_rgba(0,0,0,0.7)] overflow-hidden">
                {#each suggestions as s, i}
                    <button
                        onmousedown={() => navigate(s)}
                        class="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors
                               {i === selIdx ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}
                               {i > 0 ? 'border-t border-zinc-800/60' : ''}">
                        {#if s.iconPath}
                            <img src="https://www.bungie.net{s.iconPath}" alt=""
                                 class="w-8 h-8 shrink-0 object-cover rounded" />
                        {:else}
                            <div class="w-8 h-8 bg-zinc-800 border border-zinc-700 shrink-0
                                        flex items-center justify-center rotate-45">
                                <span class="-rotate-45 text-xs font-sans text-zinc-500">?</span>
                            </div>
                        {/if}
                        <span class="text-sm font-sans text-zinc-200 flex-1 text-left">
                            {s.name}<span class="text-zinc-500">#{s.code}</span>
                        </span>
                        <svg class="w-3 h-3 text-zinc-700 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                        </svg>
                    </button>
                {/each}
            </div>
        {/if}
    </div>

    <!-- Hint -->
    <p class="relative text-xs text-zinc-600 mt-4 font-light">
        Type to search · Enter full name#code to navigate directly
    </p>

    <!-- Feature pills -->
    <div class="relative flex items-center gap-3 mt-16 flex-wrap justify-center">
        {#each ['Match History', 'Season Breakdown', 'Loadout Analysis', 'K/D Tracking', 'Invasion Stats'] as feat}
            <span class="text-xs text-zinc-500 font-medium
                         border border-zinc-800 px-4 py-1.5 rounded-full
                         bg-white/[0.02]">
                {feat}
            </span>
        {/each}
    </div>
</main>
