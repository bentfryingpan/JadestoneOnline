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
            case 'winrate':   return row.win_rate != null    ? row.win_rate.toFixed(1) + '%'    : '—';
            case 'kd':        return row.kd_ratio != null    ? row.kd_ratio.toFixed(2)           : '—';
            case 'invasions': return (row.invasions ?? 0).toLocaleString();
            case 'motes':     return (row.motes_deposited ?? 0).toLocaleString();
            case 'wins':      return (row.activities_won ?? 0).toLocaleString();
            case 'matches':   return (row.activities_entered ?? 0).toLocaleString();
            default:          return '—';
        }
    }

    function fmt(n) { return n != null ? Number(n).toLocaleString() : '—'; }

    function go(cat) {
        goto(`/leaderboards?cat=${cat}`, { replaceState: true });
    }

    const rankColor = (i) => i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-orange-400' : 'text-slate-500';
</script>

<div class="max-w-6xl mx-auto px-6 py-8">

    <!-- Header -->
    <div class="mb-6">
        <h1 class="text-2xl font-bold text-white mb-1">Leaderboards</h1>
        <p class="text-slate-500 text-sm">Global Gambit rankings across all tracked Guardians.</p>
    </div>

    <!-- Category tabs -->
    <div class="flex flex-wrap gap-1.5 mb-6">
        {#each Object.entries(catLabels) as [key, label]}
            <button onclick={() => go(key)}
                    class="px-4 py-2 rounded-lg text-sm font-medium transition-colors
                           {data.cat === key
                               ? 'bg-emerald-600 text-white'
                               : 'bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/[0.07] border border-white/[0.06]'}">
                {label}
            </button>
        {/each}
    </div>

    {#if !data.rows.length}
        <!-- Empty state -->
        <div class="flex flex-col items-center justify-center py-28 text-center">
            <div class="text-5xl mb-4">📊</div>
            <h2 class="text-lg font-semibold text-white mb-2">No data yet</h2>
            <p class="text-slate-500 text-sm max-w-sm">
                The leaderboard fills automatically as players are tracked.
                Search for a Guardian to get started.
            </p>
            <a href="/" class="mt-5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm
                               font-semibold px-4 py-2 rounded-lg transition-colors">
                Search a player
            </a>
        </div>
    {:else}
        <!-- Table -->
        <div class="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden">

            <!-- Column header -->
            <div class="grid grid-cols-[3rem_1fr_6rem_5rem_5rem_5rem_6rem] gap-4
                        px-4 py-3 border-b border-white/[0.06]
                        text-xs text-slate-500 uppercase tracking-wider">
                <span>#</span>
                <span>Guardian</span>
                <span class="text-right">Matches</span>
                <span class="text-right">Win %</span>
                <span class="text-right">K/D</span>
                <span class="text-right">Invasions</span>
                <span class="text-right text-emerald-400">{catLabels[data.cat]}</span>
            </div>

            {#each data.rows as row, i}
                <a href="/profile/{encodeURIComponent(row.bungie_name)}/{row.bungie_code}"
                   class="grid grid-cols-[3rem_1fr_6rem_5rem_5rem_5rem_6rem] gap-4
                          px-4 py-3.5 items-center hover:bg-white/[0.03] transition-colors
                          border-b border-white/[0.03] last:border-0">

                    <!-- Rank -->
                    <span class="text-sm font-bold {rankColor(i)}">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </span>

                    <!-- Player -->
                    <div>
                        <p class="text-sm font-medium text-white">
                            {row.bungie_name}<span class="text-slate-500">#{row.bungie_code}</span>
                        </p>
                        <!-- EGO rating placeholder -->
                        <p class="text-xs text-slate-600 mt-0.5">EGO —</p>
                    </div>

                    <!-- Matches -->
                    <span class="text-sm text-slate-400 text-right">{fmt(row.activities_entered)}</span>

                    <!-- Win % -->
                    <span class="text-sm text-right
                                 {(row.win_rate ?? 0) >= 55 ? 'text-emerald-400' :
                                  (row.win_rate ?? 0) >= 45 ? 'text-slate-300'  : 'text-red-400'}">
                        {row.win_rate != null ? row.win_rate.toFixed(1) + '%' : '—'}
                    </span>

                    <!-- K/D -->
                    <span class="text-sm text-slate-300 text-right font-mono">
                        {row.kd_ratio != null ? row.kd_ratio.toFixed(2) : '—'}
                    </span>

                    <!-- Invasions -->
                    <span class="text-sm text-slate-400 text-right">{fmt(row.invasions)}</span>

                    <!-- Primary stat (highlighted) -->
                    <span class="text-sm font-bold text-emerald-400 text-right">
                        {statValue(row, data.cat)}
                    </span>
                </a>
            {/each}
        </div>

        <p class="text-xs text-slate-600 mt-3 text-center">
            Showing top {data.rows.length} players · Minimum {data.categories[data.cat].min} matches required
        </p>
    {/if}
</div>
