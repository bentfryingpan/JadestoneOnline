<script>
    import { page }  from '$app/state';
    import { goto }  from '$app/navigation';

    let { user = null } = $props();

    const links = [
        { href: '/leaderboards', label: 'Leaderboards' },
    ];

    const active = $derived(page.url.pathname);

    // ── Search state ───────────────────────────────────────────────────────────
    let searchOpen  = $state(false);
    let searchVal   = $state('');
    let suggestions = $state([]);
    let loading     = $state(false);
    let selIdx      = $state(-1);
    let inputEl     = $state(null);
    let debounce    = null;

    function openSearch() {
        searchOpen = true;
        // focus next tick
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
        // Delay so mousedown on a result fires first
        setTimeout(() => {
            if (!searchVal) searchOpen = false;
            suggestions = [];
        }, 180);
    }
</script>

<nav class="sticky top-0 z-50 flex items-center gap-4 px-6 h-14
            bg-[#09090f]/95 backdrop-blur border-b border-white/[0.06]">

    <!-- Brand -->
    <a href="/" class="flex items-center gap-2 shrink-0 mr-2">
        <span class="text-emerald-400 text-lg font-bold tracking-tight">◆ Jadestone</span>
    </a>

    <!-- Nav links -->
    <div class="flex items-center gap-1">
        {#each links as link}
            <a href={link.href}
               class="px-3 py-1.5 rounded text-sm font-medium transition-colors
                      {active.startsWith(link.href)
                          ? 'text-white bg-white/10'
                          : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'}">
                {link.label}
            </a>
        {/each}
    </div>

    <!-- Spacer -->
    <div class="flex-1"></div>

    <!-- Search -->
    {#if searchOpen}
        <div class="relative">
            <div class="flex items-center gap-2 bg-white/[0.06] border border-white/10
                        rounded-lg px-3 py-1.5 focus-within:border-emerald-500/50 transition-colors w-56">
                <svg class="w-3.5 h-3.5 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    class="flex-1 bg-transparent text-sm text-white placeholder-slate-500 outline-none min-w-0"
                />
                {#if loading}
                    <div class="w-3 h-3 border border-slate-500 border-t-emerald-400 rounded-full animate-spin shrink-0"></div>
                {/if}
            </div>

            <!-- Dropdown -->
            {#if suggestions.length}
                <div class="absolute top-full right-0 mt-1.5 w-72 z-50
                            bg-[#0d0f1a] border border-white/[0.08] rounded-xl
                            shadow-2xl overflow-hidden">
                    {#each suggestions as s, i}
                        <button
                            onmousedown={() => navigate(s)}
                            class="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors
                                   {i === selIdx ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}
                                   {i > 0 ? 'border-t border-white/[0.04]' : ''}">
                            {#if s.iconPath}
                                <img src="https://www.bungie.net{s.iconPath}" alt=""
                                     class="w-8 h-8 rounded shrink-0 object-cover" />
                            {:else}
                                <div class="w-8 h-8 rounded bg-white/10 shrink-0"></div>
                            {/if}
                            <span class="text-sm text-white">
                                {s.name}<span class="text-slate-500">#{s.code}</span>
                            </span>
                            <svg class="w-3.5 h-3.5 text-slate-600 ml-auto shrink-0" fill="none"
                                 stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                      d="M9 5l7 7-7 7"/>
                            </svg>
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
    {:else}
        <button onclick={openSearch}
                class="text-slate-400 hover:text-white transition-colors p-2 rounded hover:bg-white/[0.06]"
                title="Search player">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
            </svg>
        </button>
    {/if}

    <!-- Auth -->
    <div class="flex items-center gap-3 shrink-0">
        {#if user}
            <span class="text-slate-300 text-sm hidden sm:block">{user.displayName}</span>
            <a href="/auth/logout"
               class="text-slate-500 hover:text-slate-300 text-sm transition-colors">
                Sign out
            </a>
        {:else}
            <a href="/auth/login?returnTo={encodeURIComponent(active)}"
               class="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold
                      px-3 py-1.5 rounded transition-colors">
                Sign in
            </a>
        {/if}
    </div>
</nav>
