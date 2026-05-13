<script>
	import { goto } from '$app/navigation';
	let { data } = $props();

	const catLabels = {
		wins: 'Total Wins',
		winrate: 'Win Rate',
		kd: 'K/D Ratio',
		invasions: 'Invasions',
		motes: 'Motes Banked',
		matches: 'Total Matches'
	};

	function statValue(row, cat) {
		switch (cat) {
			case 'winrate':
				return row.win_rate != null ? row.win_rate.toFixed(1) + '%' : '—';
			case 'kd':
				return row.kd_ratio != null ? row.kd_ratio.toFixed(2) : '—';
			case 'invasions':
				return (row.invasions ?? 0).toLocaleString();
			case 'motes':
				return (row.motes_deposited ?? 0).toLocaleString();
			case 'wins':
				return (row.activities_won ?? 0).toLocaleString();
			case 'matches':
				return (row.activities_entered ?? 0).toLocaleString();
			default:
				return '—';
		}
	}

	function fmt(n) {
		return n != null ? Number(n).toLocaleString() : '—';
	}

	function go(cat) {
		goto(`/leaderboards?cat=${cat}`, { replaceState: true });
	}

	const rankColor = (i) =>
		i === 0
			? 'text-yellow-400'
			: i === 1
				? 'text-zinc-300'
				: i === 2
					? 'text-orange-400'
					: 'text-zinc-600';
</script>

<div class="mx-auto max-w-6xl px-6 py-8">
	<!-- ── Page header ──────────────────────────────────────────────────────── -->
	<div class="mb-6">
		<span class="mb-1 block text-xs font-medium tracking-wide text-emerald-500/70">
			Global Rankings
		</span>
		<h1 class="font-serif text-4xl leading-none font-light text-white italic">Leaderboards</h1>
		<div class="mt-3 h-px w-16 bg-gradient-to-r from-emerald-500/40 to-transparent"></div>
	</div>

	<!-- ── Category selector ────────────────────────────────────────────────── -->
	<div class="mb-6 flex flex-wrap gap-1.5 border-b border-zinc-800 pb-4">
		{#each Object.entries(catLabels) as [key, label]}
			<button
				onclick={() => go(key)}
				class="relative rounded px-4 py-2 text-sm font-medium transition-colors
                           {data.cat === key
					? 'border border-zinc-700 bg-zinc-800 text-white'
					: 'border border-transparent text-zinc-500 hover:border-zinc-800 hover:text-zinc-300'}"
			>
				{label}
				{#if data.cat === key}
					<span class="absolute bottom-0 left-0 h-px w-full rounded-full bg-emerald-400"></span>
				{/if}
			</button>
		{/each}
	</div>

	{#if !data.rows.length}
		<!-- Empty state -->
		<div class="flex flex-col items-center justify-center gap-4 py-28 text-center">
			<div class="mb-2 h-8 w-8 rotate-45 border border-zinc-700"></div>
			<span class="text-base font-medium text-zinc-500">No data yet</span>
			<p class="max-w-xs text-sm leading-relaxed font-light text-zinc-600">
				The leaderboard populates automatically as players are tracked. Search for a Guardian to get
				started.
			</p>
			<a
				href="/"
				class="mt-2 rounded border
                      border-emerald-500/30 px-5 py-2 text-sm font-medium
                      text-emerald-400 transition-colors hover:border-emerald-500/60 hover:bg-emerald-500/5"
			>
				Search a player
			</a>
		</div>
	{:else}
		<!-- ── Leaderboard table ─────────────────────────────────────────────── -->
		<div
			class="relative overflow-hidden rounded-lg border border-zinc-800 bg-white/[0.02] backdrop-blur-sm"
		>
			<!-- Corner accents -->
			<span
				class="pointer-events-none absolute top-0 left-0 z-10 h-2 w-2 border-t border-l border-emerald-500/30"
			></span>
			<span
				class="pointer-events-none absolute right-0 bottom-0 z-10 h-2 w-2 border-r border-b border-emerald-500/30"
			></span>

			<!-- Column header -->
			<div
				class="grid grid-cols-[3rem_1fr_6rem_5rem_5rem_5rem_6rem] gap-4 border-b border-zinc-800
                        bg-black/20 px-4 py-3"
			>
				<span class="text-xs font-medium text-zinc-500">#</span>
				<span class="text-xs font-medium text-zinc-500">Guardian</span>
				<span class="text-right text-xs font-medium text-zinc-500">Matches</span>
				<span class="text-right text-xs font-medium text-zinc-500">Win %</span>
				<span class="text-right text-xs font-medium text-zinc-500">K/D</span>
				<span class="text-right text-xs font-medium text-zinc-500">Invasions</span>
				<span class="text-right text-xs font-medium text-emerald-500">
					{catLabels[data.cat]}
				</span>
			</div>

			<div class="divide-y divide-zinc-800/50">
				{#each data.rows as row, i}
					<a
						href="/profile/{encodeURIComponent(row.bungie_name)}/{row.bungie_code}"
						class="group grid grid-cols-[3rem_1fr_6rem_5rem_5rem_5rem_6rem] items-center gap-4
                              px-4 py-3.5 transition-colors hover:bg-white/[0.04]
                              {i < 3 ? 'border-l-2' : ''}
                              {i === 0
							? 'border-l-yellow-400'
							: i === 1
								? 'border-l-zinc-400'
								: i === 2
									? 'border-l-orange-400'
									: ''}"
					>
						<!-- Rank -->
						<span class="font-mono text-sm font-bold {rankColor(i)}">
							{String(i + 1).padStart(2, '0')}
						</span>

						<!-- Player -->
						<div>
							<p class="text-sm text-zinc-200 transition-colors group-hover:text-white">
								{row.bungie_name}<span class="text-zinc-500">#{row.bungie_code}</span>
							</p>
						</div>

						<!-- Matches -->
						<span class="text-right font-mono text-sm text-zinc-500 tabular-nums">
							{fmt(row.activities_entered)}
						</span>

						<!-- Win % -->
						<span
							class="text-right font-mono text-sm tabular-nums
                                     {(row.win_rate ?? 0) >= 55
								? 'text-emerald-400'
								: (row.win_rate ?? 0) >= 45
									? 'text-zinc-300'
									: 'text-red-400'}"
						>
							{row.win_rate != null ? row.win_rate.toFixed(1) + '%' : '—'}
						</span>

						<!-- K/D -->
						<span class="text-right font-mono text-sm text-zinc-400 tabular-nums">
							{row.kd_ratio != null ? row.kd_ratio.toFixed(2) : '—'}
						</span>

						<!-- Invasions -->
						<span class="text-right font-mono text-sm text-zinc-500 tabular-nums">
							{fmt(row.invasions)}
						</span>

						<!-- Primary stat -->
						<span class="text-right font-mono text-sm font-bold text-emerald-400 tabular-nums">
							{statValue(row, data.cat)}
						</span>
					</a>
				{/each}
			</div>
		</div>

		<p class="mt-3 text-center text-xs font-light text-zinc-600">
			Top {data.rows.length} guardians · Min {data.categories[data.cat].min} matches required
		</p>
	{/if}
</div>
