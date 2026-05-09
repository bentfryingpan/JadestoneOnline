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
    const ROLE_STYLE = {
        5: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
        4: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
        3: 'text-blue-400  bg-blue-400/10  border-blue-400/20',
        2: 'text-slate-400 bg-white/5       border-white/10',
        1: 'text-slate-600 bg-white/[0.02]  border-white/[0.06]',
    };

    // Sort / filter state
    let sortKey = $state('role');
    let sortDir = $state(1); // 1 = asc for role order, -1 = desc for numbers
    let filter  = $state('all'); // 'all' | 'tracked'

    const filteredMembers = $derived(
        filter === 'tracked'
            ? data.members.filter(m => m.gambit)
            : data.members
    );

    const sortedMembers = $derived((() => {
        return [...filteredMembers].sort((a, b) => {
            if (sortKey === 'role') {
                const diff = (ROLE_ORDER[a.memberType] ?? 9) - (ROLE_ORDER[b.memberType] ?? 9);
                if (diff !== 0) return diff * sortDir;
                // secondary: win rate desc
                return ((b.gambit?.winRate ?? -1) - (a.gambit?.winRate ?? -1));
            }
            if (sortKey === 'winRate')    return ((b.gambit?.winRate    ?? -1) - (a.gambit?.winRate    ?? -1)) * sortDir;
            if (sortKey === 'kd')         return ((b.gambit?.kd         ?? -1) - (a.gambit?.kd         ?? -1)) * sortDir;
            if (sortKey === 'matches')    return ((b.gambit?.activitiesEntered ?? -1) - (a.gambit?.activitiesEntered ?? -1)) * sortDir;
            if (sortKey === 'invasions')  return ((b.gambit?.invasions  ?? -1) - (a.gambit?.invasions  ?? -1)) * sortDir;
            if (sortKey === 'lastOnline') return (new Date(b.lastOnline ?? 0) - new Date(a.lastOnline ?? 0)) * sortDir;
            // name
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

<div class="min-h-screen bg-[#090b14] text-white">

    <!-- ── Clan hero ─────────────────────────────────────────────────────────── -->
    <div class="border-b border-white/[0.06]">
        <div class="max-w-5xl mx-auto px-6 py-8">
            <a href="/" class="text-xs text-slate-600 hover:text-slate-400 transition-colors mb-5 inline-flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5">
                    <path fill-rule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clip-rule="evenodd"/>
                </svg>
                Back to search
            </a>

            <div class="flex flex-col sm:flex-row items-start gap-5">
                <!-- Callsign -->
                <div class="shrink-0 w-20 h-20 rounded-2xl border border-emerald-500/20 bg-emerald-950/30
                            flex flex-col items-center justify-center gap-0.5">
                    <span class="text-[10px] text-emerald-600 uppercase tracking-widest font-bold">Clan</span>
                    <span class="text-lg font-black text-emerald-400 leading-none">[{data.callsign || '—'}]</span>
                </div>

                <div class="flex-1 min-w-0">
                    <h1 class="text-2xl sm:text-3xl font-bold">{data.name}</h1>
                    {#if data.motto}
                        <p class="text-slate-500 text-sm mt-1 italic">"{data.motto}"</p>
                    {/if}
                    <div class="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
                        <span>{data.memberCount} members</span>
                        {#if data.founder.name !== 'Unknown'}
                            <span>·</span>
                            <span>Founded by <span class="text-slate-400">{data.founder.name}</span></span>
                        {/if}
                    </div>
                    {#if data.about}
                        <p class="text-sm text-slate-400 mt-3 leading-relaxed max-w-xl">{data.about}</p>
                    {/if}
                </div>

                <!-- Aggregate stats (only shown when enough data exists) -->
                {#if data.clanStats && trackedCount >= 3}
                    <div class="shrink-0 grid grid-cols-2 gap-px rounded-xl overflow-hidden border border-white/[0.06] bg-white/[0.03]">
                        {#each [
                            { label: 'Avg Win Rate', val: data.clanStats.avgWinRate + '%', hi: data.clanStats.avgWinRate >= 50 },
                            { label: 'Avg K/D',      val: data.clanStats.avgKD,            hi: data.clanStats.avgKD >= 1 },
                            { label: 'Tracked',      val: `${trackedCount}/${data.memberCount}`, hi: false },
                            { label: 'Total Matches', val: data.clanStats.totalMatches >= 1000
                                                          ? (data.clanStats.totalMatches / 1000).toFixed(1) + 'k'
                                                          : data.clanStats.totalMatches, hi: false },
                        ] as s}
                            <div class="px-5 py-3 bg-[#0c0e1a] text-center">
                                <p class="text-lg font-black {s.hi ? 'text-emerald-400' : 'text-white'}">{s.val}</p>
                                <p class="text-[9px] text-slate-600 uppercase tracking-wider mt-0.5">{s.label}</p>
                            </div>
                        {/each}
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
                <h2 class="text-sm font-semibold text-slate-400 uppercase tracking-wider">Members</h2>
                <span class="text-[10px] text-slate-600 bg-white/[0.04] border border-white/[0.06] rounded-full px-2 py-0.5">
                    {filteredMembers.length}
                </span>
            </div>

            <div class="flex items-center gap-2">
                <!-- Filter toggle -->
                <div class="flex rounded-lg border border-white/[0.08] overflow-hidden text-xs">
                    {#each [['all','All'], ['tracked','Gambit data']] as [val, label]}
                        <button
                            class="px-3 py-1.5 transition-colors {filter === val
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'text-slate-500 hover:text-slate-400 hover:bg-white/[0.04]'}"
                            onclick={() => filter = val}
                        >{label}</button>
                    {/each}
                </div>
            </div>
        </div>

        <!-- Gambit data notice if sparse -->
        {#if trackedCount === 0}
            <div class="mb-5 flex items-start gap-3 bg-amber-950/20 border border-amber-500/20 rounded-xl px-4 py-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                     class="w-4 h-4 text-amber-400 shrink-0 mt-0.5">
                    <path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/>
                </svg>
                <p class="text-xs text-amber-300/80 leading-relaxed">
                    No Gambit stats are tracked for this clan yet. Stats populate when a clan member's profile is viewed on Jadestone.
                    The leaderboard crawler (coming soon) will backfill all members automatically.
                </p>
            </div>
        {:else if trackedCount < data.memberCount}
            <p class="text-xs text-slate-600 mb-4">
                {trackedCount} of {data.memberCount} members have Gambit data — stats populate when a player's profile is viewed.
            </p>
        {/if}

        <!-- Member cards -->
        <div class="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden">

            <!-- Header row (sticky-ish) -->
            <div class="grid px-4 py-2.5 border-b border-white/[0.05] bg-[#0c0e1a]
                        text-[10px] text-slate-600 uppercase tracking-wider font-semibold select-none
                        grid-cols-[2.5rem_1fr_4.5rem_4rem_4rem_4rem_5rem_5rem]">
                <span></span>
                <button class="text-left hover:text-slate-400 transition-colors" onclick={() => toggleSort('name')}>
                    Player{arrow('name')}
                </button>
                <button class="text-center hover:text-slate-400 transition-colors" onclick={() => toggleSort('role')}>
                    Role{arrow('role')}
                </button>
                <button class="text-center hover:text-slate-400 transition-colors" onclick={() => toggleSort('winRate')}>
                    W%{arrow('winRate')}
                </button>
                <button class="text-center hover:text-slate-400 transition-colors" onclick={() => toggleSort('kd')}>
                    K/D{arrow('kd')}
                </button>
                <button class="text-center hover:text-slate-400 transition-colors" onclick={() => toggleSort('matches')}>
                    Games{arrow('matches')}
                </button>
                <button class="text-center hover:text-slate-400 transition-colors" onclick={() => toggleSort('invasions')}>
                    Invasions{arrow('invasions')}
                </button>
                <button class="text-center hover:text-slate-400 transition-colors" onclick={() => toggleSort('lastOnline')}>
                    Last On{arrow('lastOnline')}
                </button>
            </div>

            <!-- Rows -->
            <div class="divide-y divide-white/[0.04]">
                {#each sortedMembers as member, i}
                    <a href="/profile/{encodeURIComponent(member.name)}/{member.code}"
                       class="grid px-4 py-3 items-center gap-2 hover:bg-white/[0.03] transition-colors group
                              grid-cols-[2.5rem_1fr_4.5rem_4rem_4rem_4rem_5rem_5rem]">

                        <!-- Rank number -->
                        <span class="text-[10px] text-slate-700 text-center font-mono">
                            {i + 1}
                        </span>

                        <!-- Player -->
                        <div class="flex items-center gap-3 min-w-0">
                            {#if member.icon}
                                <img src={member.icon} alt=""
                                     class="w-8 h-8 rounded-lg border border-white/[0.08] object-cover shrink-0
                                            group-hover:border-emerald-500/30 transition-colors" />
                            {:else}
                                <div class="w-8 h-8 rounded-lg bg-white/5 border border-white/[0.08] shrink-0"></div>
                            {/if}
                            <div class="min-w-0">
                                <p class="text-sm font-medium text-white group-hover:text-emerald-400 transition-colors truncate leading-tight">
                                    {member.name}
                                </p>
                                <p class="text-[9px] text-slate-700">
                                    #{member.code} · {platformNames[member.membershipType] ?? ''}
                                </p>
                            </div>
                        </div>

                        <!-- Role badge -->
                        <div class="flex justify-center">
                            <span class="text-[9px] font-bold uppercase tracking-wider border rounded px-1.5 py-0.5
                                         {ROLE_STYLE[member.memberType] ?? 'text-slate-600 border-white/10'}">
                                {member.memberTypeLabel}
                            </span>
                        </div>

                        <!-- Win rate -->
                        <p class="text-sm font-bold text-center tabular-nums
                                  {member.gambit
                                    ? (member.gambit.winRate >= 55 ? 'text-emerald-400'
                                    : member.gambit.winRate >= 45 ? 'text-white'
                                    : 'text-red-400')
                                    : 'text-slate-700'}">
                            {member.gambit ? member.gambit.winRate + '%' : '—'}
                        </p>

                        <!-- K/D -->
                        <p class="text-sm font-mono text-center tabular-nums
                                  {member.gambit
                                    ? (member.gambit.kd >= 1.5 ? 'text-emerald-400'
                                    : member.gambit.kd >= 1   ? 'text-slate-300'
                                    : 'text-slate-500')
                                    : 'text-slate-700'}">
                            {member.gambit ? member.gambit.kd : '—'}
                        </p>

                        <!-- Games -->
                        <p class="text-sm text-center tabular-nums text-slate-300">
                            {member.gambit ? member.gambit.activitiesEntered.toLocaleString() : '—'}
                        </p>

                        <!-- Invasions -->
                        <p class="text-sm text-center tabular-nums
                                  {member.gambit?.invasions > 0 ? 'text-violet-400' : 'text-slate-700'}">
                            {member.gambit ? member.gambit.invasions.toLocaleString() : '—'}
                        </p>

                        <!-- Last online -->
                        <p class="text-[11px] text-center text-slate-600">
                            {timeAgo(member.lastOnline)}
                        </p>
                    </a>
                {/each}

                {#if !sortedMembers.length}
                    <div class="text-center py-16 text-slate-600 text-sm">No members match this filter.</div>
                {/if}
            </div>
        </div>

        <!-- Crawler note -->
        <p class="text-[10px] text-slate-700 text-center mt-4 leading-relaxed">
            Gambit stats shown from Jadestone data. Stats populate on profile visit.
            Full clan backfill will be available once the leaderboard crawler launches.
        </p>
    </div>
</div>
