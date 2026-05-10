<script>
    let { data } = $props();

    const platformNames = { 1: 'Xbox', 2: 'PSN', 3: 'Steam', 6: 'Epic' };

    function timeAgo(iso) {
        if (!iso) return 'Never';
        const diff = Date.now() - new Date(iso).getTime();
        const m = Math.floor(diff / 60000);
        if (m < 2)   return 'Just now';
        if (m < 60)  return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24)  return `${h}h ago`;
        const d = Math.floor(h / 24);
        if (d < 30)  return `${d}d ago`;
        const mo = Math.floor(d / 30);
        if (mo < 12) return `${mo}mo ago`;
        return `${Math.floor(mo / 12)}y ago`;
    }

    const ROLE_ORDER = { 5: 0, 4: 1, 3: 2, 2: 3, 1: 4 };
    const ROLE_LABEL_COLOR = {
        5: 'border-yellow-500/40 text-yellow-400',
        4: 'border-orange-500/40 text-orange-400',
        3: 'border-blue-500/40  text-blue-400',
        2: 'border-zinc-600     text-zinc-400',
        1: 'border-zinc-800     text-zinc-600',
    };

    let sortKey = $state('role');
    let sortDir = $state(1);
    let filter  = $state('all');

    const filteredMembers = $derived(
        filter === 'tracked' ? data.members.filter(m => m.gambit) : data.members
    );

    const sortedMembers = $derived((() => {
        return [...filteredMembers].sort((a, b) => {
            if (sortKey === 'role') {
                const diff = (ROLE_ORDER[a.memberType] ?? 9) - (ROLE_ORDER[b.memberType] ?? 9);
                if (diff !== 0) return diff * sortDir;
                return ((b.gambit?.winRate ?? -1) - (a.gambit?.winRate ?? -1));
            }
            if (sortKey === 'winRate')    return ((b.gambit?.winRate            ?? -1) - (a.gambit?.winRate            ?? -1)) * sortDir;
            if (sortKey === 'kd')         return ((b.gambit?.kd                 ?? -1) - (a.gambit?.kd                 ?? -1)) * sortDir;
            if (sortKey === 'matches')    return ((b.gambit?.activitiesEntered  ?? -1) - (a.gambit?.activitiesEntered  ?? -1)) * sortDir;
            if (sortKey === 'invasions')  return ((b.gambit?.invasions          ?? -1) - (a.gambit?.invasions          ?? -1)) * sortDir;
            if (sortKey === 'lastOnline') return (new Date(b.lastOnline ?? 0) - new Date(a.lastOnline ?? 0)) * sortDir;
            return a.name.toLowerCase() < b.name.toLowerCase() ? -sortDir : sortDir;
        });
    })());

    function toggleSort(key) {
        if (sortKey === key) sortDir = -sortDir;
        else { sortKey = key; sortDir = key === 'role' ? 1 : -1; }
    }

    function arrow(key) {
        if (sortKey !== key) return '';
        return sortDir === -1 ? ' ↓' : ' ↑';
    }

    const trackedCount = $derived(data.members.filter(m => m.gambit).length);
</script>

<svelte:head>
    <title>[{data.callsign}] {data.name} · Jadestone</title>
</svelte:head>

<div class="min-h-screen text-zinc-200">

    <!-- ── Clan hero ─────────────────────────────────────────────────────────── -->
    <div class="border-b border-white/[0.07] bg-black/20 backdrop-blur-sm">
        <div class="max-w-5xl mx-auto px-6 py-8">

            <!-- Back link -->
            <a href="/" class="inline-flex items-center gap-2 mb-6
                               text-sm text-zinc-500 hover:text-zinc-300 transition-colors group">
                <svg class="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform"
                     fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                </svg>
                Back to search
            </a>

            <div class="flex flex-col sm:flex-row items-start gap-6">

                <!-- Callsign diamond badge -->
                <div class="shrink-0 relative w-20 h-20 flex items-center justify-center">
                    <div class="w-16 h-16 border border-emerald-500/40 bg-emerald-500/5 rotate-45
                                shadow-[0_0_20px_rgba(16,185,129,0.1)]"></div>
                    <div class="absolute inset-0 flex flex-col items-center justify-center">
                        <span class="text-xs font-medium text-emerald-600 block">Clan</span>
                        <span class="text-sm font-bold text-emerald-400 leading-tight">[{data.callsign || '—'}]</span>
                    </div>
                    <span class="absolute top-0 left-0 w-2 h-2 border-t border-l border-emerald-500/30 pointer-events-none"></span>
                    <span class="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-emerald-500/30 pointer-events-none"></span>
                </div>

                <!-- Clan info -->
                <div class="flex-1 min-w-0">
                    <span class="text-xs font-medium text-emerald-500/60 block mb-1 tracking-wide">
                        Clan Roster
                    </span>
                    <h1 class="font-serif text-4xl font-light italic text-white leading-none mb-2">
                        {data.name}
                    </h1>
                    {#if data.motto}
                        <p class="text-sm text-zinc-500 italic mb-2">"{data.motto}"</p>
                    {/if}
                    <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-500">
                        <span>{data.memberCount} members</span>
                        {#if data.founder.name !== 'Unknown'}
                            <span>·</span>
                            <span>Founded by <span class="text-zinc-400">{data.founder.name}</span></span>
                        {/if}
                    </div>
                    {#if data.about}
                        <p class="text-sm text-zinc-400 mt-3 leading-relaxed max-w-xl font-light">{data.about}</p>
                    {/if}
                </div>

                <!-- Aggregate clan stats -->
                {#if data.clanStats && trackedCount >= 3}
                    <div class="shrink-0 border border-zinc-800 bg-white/[0.03] backdrop-blur-sm relative overflow-hidden rounded-lg">
                        <span class="absolute top-0 left-0 w-2 h-2 border-t border-l border-emerald-500/30 pointer-events-none z-10"></span>
                        <span class="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-emerald-500/30 pointer-events-none z-10"></span>
                        <div class="grid grid-cols-2 divide-x divide-y divide-zinc-800">
                            {#each [
                                { label: 'Avg Win Rate', val: data.clanStats.avgWinRate + '%', hi: data.clanStats.avgWinRate >= 50 },
                                { label: 'Avg K/D',      val: data.clanStats.avgKD,            hi: data.clanStats.avgKD >= 1 },
                                { label: 'Tracked',      val: `${trackedCount}/${data.memberCount}`, hi: false },
                                { label: 'Total Matches', val: data.clanStats.totalMatches >= 1000
                                                              ? (data.clanStats.totalMatches / 1000).toFixed(1) + 'k'
                                                              : data.clanStats.totalMatches, hi: false },
                            ] as s}
                                <div class="px-5 py-3 text-center">
                                    <span class="text-xl font-mono font-bold block {s.hi ? 'text-emerald-400' : 'text-white'}">
                                        {s.val}
                                    </span>
                                    <span class="text-xs font-medium text-zinc-500 mt-0.5 block">
                                        {s.label}
                                    </span>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    </div>

    <!-- ── Roster ─────────────────────────────────────────────────────────────── -->
    <div class="max-w-5xl mx-auto px-6 py-7">

        <!-- Controls row -->
        <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div class="flex items-center gap-3">
                <span class="text-sm font-medium text-zinc-400">Members</span>
                <span class="text-sm text-zinc-600 border border-zinc-800 px-2 py-0.5 rounded">
                    {filteredMembers.length}
                </span>
            </div>

            <!-- Filter toggle -->
            <div class="flex border border-zinc-800 overflow-hidden rounded">
                {#each [['all','All'], ['tracked','Gambit data']] as [val, label]}
                    <button
                        onclick={() => filter = val}
                        class="px-3 py-1.5 text-sm font-medium transition-colors
                               {filter === val
                                   ? 'bg-zinc-800 text-zinc-200'
                                   : 'text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.03]'}
                               {val === 'tracked' ? '' : 'border-r border-zinc-800'}">
                        {label}
                    </button>
                {/each}
            </div>
        </div>

        <!-- No gambit data notice -->
        {#if trackedCount === 0}
            <div class="mb-5 flex items-start gap-3 border border-amber-500/20 bg-amber-950/10 px-4 py-3 rounded-lg">
                <svg class="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5"
                     fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
                <p class="text-sm text-amber-300/70 leading-relaxed font-light">
                    No Gambit stats tracked for this clan yet. Stats populate when a member's profile is viewed on Jadestone.
                </p>
            </div>
        {:else if trackedCount < data.memberCount}
            <p class="text-sm text-zinc-600 mb-4 font-light">
                {trackedCount} of {data.memberCount} members have Gambit data — stats populate on profile visit.
            </p>
        {/if}

        <!-- ── Member table ──────────────────────────────────────────────────── -->
        <div class="border border-zinc-800 bg-white/[0.02] backdrop-blur-sm relative overflow-hidden rounded-lg">

            <!-- Corner accents -->
            <span class="absolute top-0 left-0 w-2 h-2 border-t border-l border-emerald-500/30 pointer-events-none z-10"></span>
            <span class="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-emerald-500/30 pointer-events-none z-10"></span>

            <!-- Header row -->
            <div class="grid px-4 py-2.5 border-b border-zinc-800 bg-black/20 select-none
                        grid-cols-[2.5rem_1fr_4.5rem_4rem_4rem_4rem_5rem_5rem]">
                <span></span>
                {#each [
                    { key: 'name',       label: 'Player',    align: 'text-left'   },
                    { key: 'role',       label: 'Role',      align: 'text-center' },
                    { key: 'winRate',    label: 'W%',        align: 'text-center' },
                    { key: 'kd',         label: 'K/D',       align: 'text-center' },
                    { key: 'matches',    label: 'Games',     align: 'text-center' },
                    { key: 'invasions',  label: 'Invasions', align: 'text-center' },
                    { key: 'lastOnline', label: 'Last On',   align: 'text-center' },
                ] as col}
                    <button
                        onclick={() => toggleSort(col.key)}
                        class="text-xs font-medium transition-colors {col.align}
                               {sortKey === col.key ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}">
                        {col.label}{arrow(col.key)}
                    </button>
                {/each}
            </div>

            <!-- Member rows -->
            <div class="divide-y divide-zinc-800/50">
                {#each sortedMembers as member, i}
                    <a href="/profile/{encodeURIComponent(member.name)}/{member.code}"
                       class="grid px-4 py-3 items-center gap-2 hover:bg-white/[0.03] transition-colors group
                              grid-cols-[2.5rem_1fr_4.5rem_4rem_4rem_4rem_5rem_5rem]">

                        <!-- Rank -->
                        <span class="text-xs font-mono text-zinc-600 text-center">
                            {String(i + 1).padStart(2, '0')}
                        </span>

                        <!-- Player name + platform -->
                        <div class="flex items-center gap-3 min-w-0">
                            {#if member.icon}
                                <img src={member.icon} alt=""
                                     class="w-7 h-7 border border-zinc-800 object-cover shrink-0 rounded
                                            group-hover:border-emerald-500/30 transition-colors" />
                            {:else}
                                <div class="w-7 h-7 bg-zinc-900 border border-zinc-800 shrink-0 rounded
                                            flex items-center justify-center">
                                    <span class="text-xs font-sans text-zinc-600">?</span>
                                </div>
                            {/if}
                            <div class="min-w-0">
                                <p class="text-sm text-zinc-200 group-hover:text-emerald-400
                                          transition-colors truncate leading-tight">
                                    {member.name}
                                </p>
                                <p class="text-xs text-zinc-600 leading-tight font-light">
                                    #{member.code} · {platformNames[member.membershipType] ?? ''}
                                </p>
                            </div>
                        </div>

                        <!-- Role badge -->
                        <div class="flex justify-center">
                            <span class="text-xs font-medium border px-1.5 py-0.5 rounded
                                         {ROLE_LABEL_COLOR[member.memberType] ?? 'border-zinc-800 text-zinc-600'}">
                                {member.memberTypeLabel}
                            </span>
                        </div>

                        <!-- Win rate -->
                        <p class="text-sm font-mono text-center tabular-nums
                                  {member.gambit
                                    ? (member.gambit.winRate >= 55 ? 'text-emerald-400'
                                    : member.gambit.winRate >= 45 ? 'text-zinc-200'
                                    : 'text-red-400')
                                    : 'text-zinc-700'}">
                            {member.gambit ? member.gambit.winRate + '%' : '—'}
                        </p>

                        <!-- K/D -->
                        <p class="text-sm font-mono text-center tabular-nums
                                  {member.gambit
                                    ? (member.gambit.kd >= 1.5 ? 'text-emerald-400'
                                    : member.gambit.kd >= 1   ? 'text-zinc-300'
                                    : 'text-zinc-500')
                                    : 'text-zinc-700'}">
                            {member.gambit ? member.gambit.kd : '—'}
                        </p>

                        <!-- Games -->
                        <p class="text-sm font-mono text-center tabular-nums text-zinc-400">
                            {member.gambit ? member.gambit.activitiesEntered.toLocaleString() : '—'}
                        </p>

                        <!-- Invasions -->
                        <p class="text-sm font-mono text-center tabular-nums
                                  {member.gambit?.invasions > 0 ? 'text-violet-400' : 'text-zinc-700'}">
                            {member.gambit ? member.gambit.invasions.toLocaleString() : '—'}
                        </p>

                        <!-- Last online -->
                        <p class="text-xs text-center text-zinc-600 font-light">
                            {timeAgo(member.lastOnline)}
                        </p>
                    </a>
                {/each}

                {#if !sortedMembers.length}
                    <div class="text-center py-16">
                        <span class="text-sm font-medium text-zinc-600">
                            No members match this filter.
                        </span>
                    </div>
                {/if}
            </div>
        </div>

        <!-- Footer note -->
        <p class="text-xs text-zinc-600 text-center mt-4 leading-relaxed font-light">
            Gambit stats populate on profile visit · Full clan backfill coming soon
        </p>
    </div>
</div>
