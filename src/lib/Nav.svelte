<script>
    import { page } from '$app/state';
    let { user = null } = $props();

    const links = [
        { href: '/leaderboards', label: 'Leaderboards' },
    ];

    const active = $derived(page.url.pathname);

    let searchOpen = $state(false);
    let searchVal  = $state('');

    function go(e) {
        if (e.key === 'Enter' && searchVal.includes('#')) {
            const [n, c] = searchVal.split('#');
            window.location.href = `/profile/${encodeURIComponent(n.trim())}/${c.trim()}`;
        }
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

    <!-- Inline search -->
    {#if searchOpen}
        <input
            autofocus
            bind:value={searchVal}
            onkeydown={go}
            onblur={() => { if (!searchVal) searchOpen = false; }}
            placeholder="bent#9599"
            class="w-48 bg-white/[0.06] border border-white/10 rounded px-3 py-1.5
                   text-sm text-white placeholder-slate-500 outline-none
                   focus:border-emerald-500/50 focus:bg-white/[0.08] transition-all"
        />
    {:else}
        <button onclick={() => searchOpen = true}
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
