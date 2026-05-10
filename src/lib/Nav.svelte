<script>
    import { page }  from '$app/state';
    import { goto }  from '$app/navigation';

    let { user = null } = $props();

    const links = [
        { href: '/leaderboards', label: 'Leaderboards' },
    ];

    const active = $derived(page.url.pathname);

    let searchOpen  = $state(false);
    let searchVal   = $state('');
    let suggestions = $state([]);
    let loading     = $state(false);
    let selIdx      = $state(-1);
    let inputEl     = $state(null);
    let debounce    = null;

    function openSearch() {
        searchOpen = true;
        setTimeout(() => inputEl?.focus(), 10);
    }

    function onInput() {
        selIdx = -1;
        clearTimeout(debounce);
        const q = searchVal.trim();
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
        searchVal   = '';
        searchOpen  = false;
        goto(`/profile/${encodeURIComponent(s.name)}/${s.code}`);
    }

    function onKeydown(e) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selIdx = Math.min(selIdx + 1, suggestions.length - 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selIdx = Math.max(selIdx - 1, -1);
        } else if (e.key === 'Enter') {
            if (selIdx >= 0 && suggestions[selIdx]) {
                navigate(suggestions[selIdx]);
            } else if (searchVal.includes('#')) {
                const [n, c] = searchVal.split('#');
                navigate({ name: n.trim(), code: c.trim() });
            }
        } else if (e.key === 'Escape') {
            suggestions = [];
            if (!searchVal) searchOpen = false;
        }
    }

    function onBlur() {
        setTimeout(() => {
            if (!searchVal) searchOpen = false;
            suggestions = [];
        }, 180);
    }
</script>

<!-- ── Basalt & Silver navigation bar ────────────────────────────────────────── -->
<nav class="sticky top-0 z-50 h-14 flex items-center gap-0
            bg-[#0a0a0a] border-b border-zinc-800">

    <!-- Brand diamond + wordmark -->
    <a href="/" class="flex items-center gap-3 px-5 h-full border-r border-zinc-800
                       hover:bg-zinc-900/50 transition-colors shrink-0 group">
        <div class="w-6 h-6 bg-emerald-500 flex items-center justify-center rotate-45
                    group-hover:bg-emerald-400 transition-colors shadow-[0_0_12px_rgba(16,185,129,0.4)]">
            <span class="text-black font-black text-[10px] -rotate-45">J</span>
        </div>
        <span class="text-[11px] font-mono text-zinc-400 uppercase tracking-[0.25em] font-bold
                     group-hover:text-zinc-200 transition-colors hidden sm:block">
            Jadestone
        </span>
    </a>

    <!-- Nav links -->
    {#each links as link}
        <a href={link.href}
           class="h-full px-6 flex items-center text-[10px] font-mono uppercase tracking-[0.2em]
                  font-bold transition-colors border-r border-zinc-800 relative
                  {active.startsWith(link.href)
                      ? 'text-white bg-zinc-900/60'
                      : 'text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900/30'}">
            {link.label}
            {#if active.startsWith(link.href)}
                <div class="absolute bottom-0 left-0 w-full h-[1px] bg-emerald-500
                            shadow-[0_0_12px_rgba(16,185,129,0.8)]"></div>
            {/if}
        </a>
    {/each}

    <div class="flex-1"></div>

    <!-- Search -->
    {#if searchOpen}
        <div class="relative border-l border-zinc-800 h-full">
            <div class="flex items-center gap-2 h-full px-4 w-64
                        focus-within:bg-zinc-900/40 transition-colors">
                <svg class="w-3 h-3 text-zinc-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
                </svg>
                <input
                    bind:this={inputEl}
                    bind:value={searchVal}
                    oninput={onInput}
                    onkeydown={onKeydown}
                    onblur={onBlur}
                    placeholder="Search Guardian…"
                    class="flex-1 bg-transparent text-[11px] font-mono text-zinc-200
                           placeholder-zinc-700 outline-none min-w-0 uppercase tracking-widest"
                />
                {#if loading}
                    <div class="w-3 h-3 border border-zinc-700 border-t-emerald-400 animate-spin shrink-0"></div>
                {/if}
            </div>

            {#if suggestions.length}
                <div class="absolute top-full right-0 mt-0 w-80 z-50
                            bg-[#0a0a0a] border border-zinc-800
                            shadow-[0_8px_40px_rgba(0,0,0,0.8)] overflow-hidden">
                    {#each suggestions as s, i}
                        <button
                            onmousedown={() => navigate(s)}
                            class="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors
                                   {i === selIdx ? 'bg-zinc-800/60' : 'hover:bg-zinc-900/60'}
                                   {i > 0 ? 'border-t border-zinc-800/60' : ''}">
                            {#if s.iconPath}
                                <img src="https://www.bungie.net{s.iconPath}" alt=""
                                     class="w-8 h-8 shrink-0 object-cover" />
                            {:else}
                                <div class="w-8 h-8 bg-zinc-800 border border-zinc-700 shrink-0
                                            flex items-center justify-center rotate-45">
                                    <span class="-rotate-45 text-[8px] font-mono text-zinc-500">?</span>
                                </div>
                            {/if}
                            <span class="text-[11px] font-mono text-zinc-200 uppercase tracking-widest">
                                {s.name}<span class="text-zinc-600">#{s.code}</span>
                            </span>
                            <svg class="w-3 h-3 text-zinc-700 ml-auto shrink-0" fill="none"
                                 stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                            </svg>
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
    {:else}
        <button onclick={openSearch}
                class="h-full px-4 border-l border-zinc-800 text-zinc-600
                       hover:text-zinc-300 hover:bg-zinc-900/30 transition-colors"
                title="Search Guardian (type name#code)">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
            </svg>
        </button>
    {/if}

    <!-- Auth -->
    <div class="flex items-center h-full border-l border-zinc-800 shrink-0">
        {#if user}
            <span class="text-[9px] font-mono text-zinc-600 uppercase tracking-widest px-4 hidden sm:block">
                {user.displayName}
            </span>
            <a href="/auth/logout"
               class="h-full px-4 flex items-center text-[9px] font-mono text-zinc-700
                      uppercase tracking-widest hover:text-zinc-300 hover:bg-zinc-900/30 transition-colors">
                Exit
            </a>
        {:else}
            <a href="/auth/login?returnTo={encodeURIComponent(active)}"
               class="h-full px-5 flex items-center text-[10px] font-mono font-bold uppercase
                      tracking-[0.2em] text-emerald-400 hover:text-emerald-300
                      hover:bg-emerald-500/5 transition-colors border-l border-zinc-800">
                Sign In
            </a>
        {/if}
    </div>
</nav>
