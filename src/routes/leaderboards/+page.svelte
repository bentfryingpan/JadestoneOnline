<script>
    import { goto } from '$app/navigation';
    let { data } = $props();

    const catLabels = {
        wins:      'Total Wins',
        winrate:   'Win Rate',
        kd:        'K/D Ratio',
        invasions: 'Invasions',
        motes:     'Motes Banked',
        matches:   'Total Matches',
    };

    function statValue(row, cat) {
        switch (cat) {
            case 'winrate':   return row.win_rate != null    ? row.win_rate.toFixed(1) + '%' : '—';
            case 'kd':        return row.kd_ratio != null    ? row.kd_ratio.toFixed(2)        : '—';
            case 'invasions': return (row.invasions           ?? 0).toLocaleString();
            case 'motes':     return (row.motes_deposited     ?? 0).toLocaleString();
            case 'wins':      return (row.activities_won      ?? 0).toLocaleString();
            case 'matches':   return (row.activities_entered  ?? 0).toLocaleString();
            default:          return '—';
        }
    }

    function fmt(n) { return n != null ? Number(n).toLocaleString() : '—'; }

    function go(cat) { goto(`/leaderboards?cat=${cat}`, { replaceState: true }); }

    const rankColor = (i) =>
        i === 0 ? 'text-yellow-400' :
        i === 1 ? 'text-zinc-300'   :
        i === 2 ? 'text-orange-400' : 'text-zinc-600';
</script>

<div class="max-w-6xl mx-auto px-6 py-8">

    <!-- ── Page header ──────────────────────────────────────────────────────── -->
    <div class="mb-6">
        <span class="text-[9px] font-mono uppercase tracking-[0.3em] text-emerald-500/70 block mb-1">
            Global Rankings
        </span>
        <h1 class="font-serif text-4xl font-light italic text-white leading-none">Leaderboards</h1>
        <div class="h-px w-16 bg-gradient-to-r from-emerald-500/40 to-transparent mt-3"></div>
    </div>

    <!-- ── Category selector ────────────────────────────────────────────────── -->
    <div class="flex flex-wrap gap-1 mb-6 border-b border-zinc-800 pb-4">
        {#each Object.entries(catLabels) as [key, label]}
            <button onclick={() => go(key)}
                    class="px-4 py-2 text-[9px] font-mono uppercase tracking-[0.2em] transition-colors relative
                           {data.cat === key
                               ? 'text-white bg-zinc-900 border border-zinc-700'
                               : 'text-zinc-600 hover:text-zinc-300 border border-transparent hover:border-zinc-800'}">
                {label}
                {#if data.cat === key}
                    <span class="absolute bottom-0 left-0 w-full h-px bg-emerald-400"></span>
                {/if}
            </button>
        {/each}
    </div>

    {#if !data.rows.length}
        <!-- Empty state -->
        <div class="flex flex-col items-center justify-center py-28 text-center gap-4">
            <!-- Diamond -->
            <div class="w-8 h-8 border border-zinc-700 rotate-45 mb-2"></div>
            <span class="text-[11px] font-mono uppercase tracking-[0.25em] text-zinc-500">No data yet</span>
            <p class="text-[9px] font-mono text-zinc-700 max-w-xs leading-relaxed">
                The leaderboard populates automatically as players are tracked.
                Search for a Guardian to get started.
            </p>
            <a href="/"
               class="text-[9px] font-mono uppercase tracking-[0.2em] text-emerald-400
                      border border-emerald-500/30 px-4 py-2 hover:bg-emerald-500/5
                      hover:border-emerald-500/60 transition-colors mt-2">
                Search a player
            </a>
        </div>
    {:else}
        <!-- ── Leaderboard table ─────────────────────────────────────────────── -->
        <div class="border border-zinc-800 bg-[#0a0a0a] relative overflow-hidden">

            <!-- Corner accents -->
            <span class="absolute top-0 left-0 w-2 h-2 border-t border-l border-emerald-500/30 pointer-events-none z-10"></span>
            <span class="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-emerald-500/30 pointer-events-none z-10"></span>

            <!-- Column header -->
            <div class="grid grid-cols-[3rem_1fr_6rem_5rem_5rem_5rem_6rem] gap-4 px-4 py-3
                        border-b border-zinc-800 bg-[#111111]">
                <span class="text-[8px] font-mono uppercase tracking-[0.2em] text-zinc-600">#</span>
                <span class="text-[8px] font-mono uppercase tracking-[0.2em] text-zinc-600">Guardian</span>
                <span class="text-[8px] font-mono uppercase tracking-[0.2em] text-zinc-600 text-right">Matches</span>
                <span class="text-[8px] font-mono uppercase tracking-[0.2em] text-zinc-600 text-right">Win %</span>
                <span class="text-[8px] font-mono uppercase tracking-[0.2em] text-zinc-600 text-right">K/D</span>
                <span class="text-[8px] font-mono uppercase tracking-[0.2em] text-zinc-600 text-right">Invasions</span>
                <span class="text-[8px] font-mono uppercase tracking-[0.2em] text-emerald-500 text-right">
                    {catLabels[data.cat]}
                </span>
            </div>

            <div class="divide-y divide-zinc-800/50">
                {#each data.rows as row, i}
                    <a href="/profile/{encodeURIComponent(row.bungie_name)}/{row.bungie_code}"
                       class="grid grid-cols-[3rem_1fr_6rem_5rem_5rem_5rem_6rem] gap-4 px-4 py-3.5
                              items-center hover:bg-zinc-900/40 transition-colors group
                              {i < 3 ? 'border-l-2' : ''}
                              {i === 0 ? 'border-l-yellow-400' : i === 1 ? 'border-l-zinc-400' : i === 2 ? 'border-l-orange-400' : ''}">

                        <!-- Rank -->
                        <span class="text-[11px] font-mono font-bold {rankColor(i)}">
                            {i === 0 ? '01' : i === 1 ? '02' : i === 2 ? '03' : `${String(i + 1).padStart(2, '0')}`}
                        </span>

                        <!-- Player -->
                        <div>
                            <p class="text-[11px] font-mono text-zinc-200 group-hover:text-white transition-colors">
                                {row.bungie_name}<span class="text-zinc-600">#{row.bungie_code}</span>
                            </p>
                        </div>

                        <!-- Matches -->
                        <span class="text-[10px] font-mono text-zinc-500 text-right">
                            {fmt(row.activities_entered)}
                        </span>

                        <!-- Win % -->
                        <span class="text-[10px] font-mono text-right
                                     {(row.win_rate ?? 0) >= 55 ? 'text-emerald-400' :
                                      (row.win_rate ?? 0) >= 45 ? 'text-zinc-300'   : 'text-red-400'}">
                            {row.win_rate != null ? row.win_rate.toFixed(1) + '%' : '—'}
                        </span>

                        <!-- K/D -->
                        <span class="text-[10px] font-mono text-zinc-400 text-right">
                            {row.kd_ratio != null ? row.kd_ratio.toFixed(2) : '—'}
                        </span>

                        <!-- Invasions -->
                        <span class="text-[10px] font-mono text-zinc-500 text-right">
                            {fmt(row.invasions)}
                        </span>

                        <!-- Primary stat -->
                        <span class="text-[11px] font-mono font-bold text-emerald-400 text-right">
                            {statValue(row, data.cat)}
                        </span>
                    </a>
                {/each}
            </div>
        </div>

        <p class="text-[8px] font-mono uppercase tracking-[0.2em] text-zinc-700 mt-3 text-center">
            Top {data.rows.length} guardians · Min {data.categories[data.cat].min} matches required
        </p>
    {/if}
</div>
