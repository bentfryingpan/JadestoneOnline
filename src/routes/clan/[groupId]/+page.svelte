<script>
    let { data } = $props();

    const platformIcons = { 1: 'Xbox', 2: 'PSN', 3: 'Steam', 6: 'Epic' };

    function timeAgo(iso) {
        if (!iso) return 'Never';
        const diff = Date.now() - new Date(iso).getTime();
        const m = Math.floor(diff / 60000);
        if (m < 2)    return 'Just now';
        if (m < 60)   return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24)   return `${h}h ago`;
        const d = Math.floor(h / 24);
        if (d < 30)   return `${d}d ago`;
        const mo = Math.floor(d / 30);
        return `${mo}mo ago`;
    }

    // Sort state
    let sortKey = $state('memberType');
    let sortDir = $state(-1); // -1 = desc

    const sortedMembers = $derived((() => {
        return [...data.members].sort((a, b) => {
            let av, bv;
            if (sortKey === 'memberType') {
                av = a.memberType;
                bv = b.memberType;
            } else if (sortKey === 'winRate') {
                av = a.gambit?.winRate ?? -1;
                bv = b.gambit?.winRate ?? -1;
            } else if (sortKey === 'kd') {
                av = a.gambit?.kd ?? -1;
                bv = b.gambit?.kd ?? -1;
            } else if (sortKey === 'matches') {
                av = a.gambit?.activitiesEntered ?? -1;
                bv = b.gambit?.activitiesEntered ?? -1;
            } else if (sortKey === 'invasions') {
                av = a.gambit?.invasions ?? -1;
                bv = b.gambit?.invasions ?? -1;
            } else if (sortKey === 'lastOnline') {
                av = new Date(a.lastOnline ?? 0).getTime();
                bv = new Date(b.lastOnline ?? 0).getTime();
            } else {
                av = a.name.toLowerCase();
                bv = b.name.toLowerCase();
                return av < bv ? sortDir : av > bv ? -sortDir : 0;
            }
            return (bv - av) * sortDir;
        });
    })());

    function setSort(key) {
        if (sortKey === key) sortDir = -sortDir;
        else { sortKey = key; sortDir = -1; }
    }

    function sortArrow(key) {
        if (sortKey !== key) return '';
        return sortDir === -1 ? ' ↓' : ' ↑';
    }

    const memberTypeColors = {
        5: 'text-yellow-400',
        4: 'text-orange-400',
        3: 'text-blue-400',
        2: 'text-slate-400',
        1: 'text-slate-600',
    };
</script>

<svelte:head>
    <title>{data.name} · Jadestone</title>
</svelte:head>

<div class="min-h-screen bg-[#090b14] text-white">

    <!-- ── Clan hero ──────────────────────────────────────────────────────── -->
    <div class="border-b border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent">
        <div class="max-w-6xl mx-auto px-6 py-10">
            <a href="/" class="text-xs text-slate-500 hover:text-slate-400 transition-colors mb-6 inline-block">
                ← Back to search
            </a>

            <div class="flex items-start gap-6">
                <!-- Callsign badge -->
                <div class="shrink-0 w-20 h-20 rounded-2xl bg-emerald-950/40 border border-emerald-500/20
                            flex items-center justify-center text-2xl font-black text-emerald-400 tracking-widest">
                    [{data.callsign || '??'}]
                </div>

                <div class="flex-1 min-w-0">
                    <h1 class="text-3xl font-bold tracking-tight">{data.name}</h1>
                    {#if data.motto}
                        <p class="text-slate-400 text-sm mt-1 italic">"{data.motto}"</p>
                    {/if}
                    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-slate-500">
                        <span>{data.memberCount} members</span>
                        {#if data.founder.name !== 'Unknown'}
                            <span>Founded by {data.founder.name}</span>
                        {/if}
                    </div>
                </div>

                <!-- Clan aggregate stats -->
                {#if data.clanStats}
                    <div class="shrink-0 grid grid-cols-2 gap-px bg-white/[0.05] rounded-xl overflow-hidden border border-white/[0.06]">
                        {#each [
                            { label: 'Avg Win Rate', val: data.clanStats.avgWinRate + '%', hi: data.clanStats.avgWinRate >= 50 },
                            { label: 'Avg K/D',      val: data.clanStats.avgKD,           hi: data.clanStats.avgKD >= 1     },
                            { label: 'Tracked',      val: data.clanStats.totalPlayers,     hi: false                        },
                            { label: 'Total Matches', val: data.clanStats.totalMatches.toLocaleString(), hi: false          },
                        ] as s}
                            <div class="px-4 py-3 bg-[#0c0e1a] text-center">
                                <p class="text-base font-black {s.hi ? 'text-emerald-400' : 'text-white'}">{s.val}</p>
                                <p class="text-[9px] text-slate-600 uppercase tracking-wider mt-0.5">{s.label}</p>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>

            {#if data.about}
                <p class="mt-5 text-sm text-slate-400 max-w-2xl leading-relaxed">{data.about}</p>
            {/if}
        </div>
    </div>

    <!-- ── Member roster ──────────────────────────────────────────────────── -->
    <div class="max-w-6xl mx-auto px-6 py-8">
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-sm font-semibold text-slate-400 uppercase tracking-wider">Members</h2>
            <span class="text-xs text-slate-600">
                {data.members.filter(m => m.gambit).length} / {data.members.length} have Gambit data
            </span>
        </div>

        <!-- ── Table ──────────────────────────────────────────────────────── -->
        <div class="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden">

            <!-- Column headers -->
            <div class="grid gap-2 px-4 py-3 bg-white/[0.02] border-b border-white/[0.05]
                        text-[10px] text-slate-600 uppercase tracking-wider font-semibold
                        grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr]">
                <button class="text-left hover:text-slate-400 transition-colors" onclick={() => setSort('name')}>
                    Player{sortArrow('name')}
                </button>
                <button class="text-center hover:text-slate-400 transition-colors" onclick={() => setSort('memberType')}>
                    Role{sortArrow('memberType')}
                </button>
                <button class="text-center hover:text-slate-400 transition-colors" onclick={() => setSort('winRate')}>
                    W%{sortArrow('winRate')}
                </button>
                <button class="text-center hover:text-slate-400 transition-colors" onclick={() => setSort('kd')}>
                    K/D{sortArrow('kd')}
                </button>
                <button class="text-center hover:text-slate-400 transition-colors" onclick={() => setSort('matches')}>
                    Games{sortArrow('matches')}
                </button>
                <button class="text-center hover:text-slate-400 transition-colors" onclick={() => setSort('invasions')}>
                    Invasions{sortArrow('invasions')}
                </button>
                <button class="text-center hover:text-slate-400 transition-colors" onclick={() => setSort('lastOnline')}>
                    Last Online{sortArrow('lastOnline')}
                </button>
            </div>

            <!-- Rows -->
            <div class="divide-y divide-white/[0.04]">
                {#each sortedMembers as member}
                    <div class="grid gap-2 px-4 py-3 items-center hover:bg-white/[0.02] transition-colors
                                grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr]">

                        <!-- Player name + icon -->
                        <a href="/profile/{member.name}/{member.code}"
                           class="flex items-center gap-3 min-w-0 group">
                            {#if member.icon}
                                <img src={member.icon} alt={member.name}
                                     class="w-8 h-8 rounded-lg border border-white/10 object-cover shrink-0
                                            group-hover:border-emerald-500/40 transition-colors" />
                            {:else}
                                <div class="w-8 h-8 rounded-lg bg-white/5 border border-white/10 shrink-0"></div>
                            {/if}
                            <div class="min-w-0">
                                <p class="text-sm font-medium text-white group-hover:text-emerald-400 transition-colors truncate">
                                    {member.name}
                                </p>
                                <p class="text-[9px] text-slate-600">#{member.code}</p>
                            </div>
                        </a>

                        <!-- Role -->
                        <p class="text-[10px] font-semibold text-center uppercase tracking-wider {memberTypeColors[member.memberType] ?? 'text-slate-500'}">
                            {member.memberTypeLabel}
                        </p>

                        <!-- Win rate -->
                        <p class="text-sm font-bold text-center {member.gambit ? (member.gambit.winRate >= 50 ? 'text-emerald-400' : 'text-red-400') : 'text-slate-700'}">
                            {member.gambit ? member.gambit.winRate + '%' : '—'}
                        </p>

                        <!-- K/D -->
                        <p class="text-sm font-mono text-center {member.gambit ? (member.gambit.kd >= 1.5 ? 'text-emerald-400' : member.gambit.kd >= 1 ? 'text-white' : 'text-slate-400') : 'text-slate-700'}">
                            {member.gambit ? member.gambit.kd : '—'}
                        </p>

                        <!-- Games -->
                        <p class="text-sm text-center text-slate-300">
                            {member.gambit ? member.gambit.activitiesEntered.toLocaleString() : '—'}
                        </p>

                        <!-- Invasions -->
                        <p class="text-sm text-center {member.gambit?.invasions > 0 ? 'text-violet-400' : 'text-slate-700'}">
                            {member.gambit ? member.gambit.invasions.toLocaleString() : '—'}
                        </p>

                        <!-- Last online -->
                        <p class="text-xs text-center text-slate-500">
                            {timeAgo(member.lastOnline)}
                        </p>
                    </div>
                {/each}

                {#if !data.members.length}
                    <p class="text-slate-500 text-center py-16">No members found.</p>
                {/if}
            </div>
        </div>

        <!-- Note about Gambit data source -->
        <p class="text-xs text-slate-700 text-center mt-4">
            Gambit stats shown from Jadestone leaderboard data. Visit a player's profile to populate their stats.
        </p>
    </div>
</div>
