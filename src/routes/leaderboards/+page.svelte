<script>
	import { onDestroy } from 'svelte';
	import { supabase } from '$lib/supabase.js';

	let { data } = $props();

	const SEGMENTS = {
		solo:    { label: 'Solo Queue',  desc: 'Fireteam of 1' },
		duo:     { label: 'Duo Stack',   desc: 'Fireteam of 2' },
		trio:    { label: 'Trio Stack',  desc: 'Fireteam of 3' },
		stack:   { label: 'Full Stack',  desc: 'Fireteam of 4' },
		overall: { label: 'Overall',     desc: 'Best segment JPR' },
	};

	// ── State ────────────────────────────────────────────────────────────────────
	let segments  = $state({ ...data.segments });
	let segment   = $state(data.initialSegment ?? 'solo');
	let platform  = $state(data.initialPlatform ?? 'pc');
	let deltas    = $state({});
	let flashIds  = $state(new Set());
	let liveCount = $state(0);
	let isLive    = $state(false);

	// Sync if server data ever refreshes
	$effect(() => {
		segments = { ...data.segments };
		segment  = data.initialSegment ?? 'solo';
		platform = data.initialPlatform ?? 'pc';
	});

	// ── Current rows — instant, no network ──────────────────────────────────────
	let rows   = $derived(segments[segment] ?? []);
	let sorted = $derived([...rows].sort((a, b) => (b.jpr ?? 0) - (a.jpr ?? 0)));

	// ── Tab/platform switch — navigates to server for platform (different data set) ──
	function go(seg) {
		segment = seg;
		deltas  = {};
		history.replaceState({}, '', `/leaderboards?seg=${seg}&platform=${platform}`);
	}

	function switchPlatform(p) {
		platform = p;
		deltas   = {};
		// Platform switch requires a server round-trip since data is filtered there
		window.location.href = `/leaderboards?seg=${segment}&platform=${p}`;
	}

	// ── Single realtime subscription for all segments ────────────────────────────
	const channel = supabase
		.channel('leaderboard-all')
		.on('postgres_changes', {
			event:  '*',
			schema: 'public',
			table:  'player_jpr',
		}, (payload) => {
			const updated = payload.new;
			if (!updated?.player_id || !updated?.segment) return;
			if ((updated.games_played ?? 0) < 20) return;

			const seg = updated.segment;
			liveCount++;

			const existing = segments[seg]?.find(r => r.player_id === updated.player_id);
			const oldJpr   = existing?.jpr ?? null;
			const newJpr   = updated.jpr;

			// Delta + flash only for the tab currently on screen
			if (seg === segment) {
				if (oldJpr !== null && newJpr !== null) {
					const delta = Math.round((newJpr - oldJpr) * 10) / 10;
					if (Math.abs(delta) >= 0.1) {
						deltas[updated.player_id] = {
							delta,
							dir: delta > 0 ? 'up' : 'down',
							ts:  Date.now(),
						};
						setTimeout(() => {
							deltas = { ...deltas };
							delete deltas[updated.player_id];
						}, 8000);
					}
				}
				flashIds = new Set([...flashIds, updated.player_id]);
				setTimeout(() => {
					flashIds = new Set([...flashIds].filter(id => id !== updated.player_id));
				}, 1200);
			}

			// Update the segment data silently regardless of active tab
			if (existing) {
				segments[seg] = segments[seg].map(r =>
					r.player_id === updated.player_id ? { ...r, ...updated } : r
				);
			} else if (newJpr != null) {
				segments[seg] = [...(segments[seg] ?? []), updated];
			}
		})
		.subscribe(status => { isLive = status === 'SUBSCRIBED'; });

	onDestroy(() => supabase.removeChannel(channel));

	// ── Helpers ──────────────────────────────────────────────────────────────────
	function playerUrl(row) {
		const name = row.players?.bungie_name ?? row.bungie_name ?? '';
		const code = row.players?.bungie_code ?? row.bungie_code ?? '0000';
		return `/profile/${encodeURIComponent(name)}/${code}`;
	}

	function displayName(row) {
		const name = row.players?.bungie_name ?? row.bungie_name ?? 'Unknown';
		const code = row.players?.bungie_code ?? row.bungie_code ?? '0000';
		return `${name}#${code}`;
	}

	const PLATFORM_LABELS = {
		1: { label: 'Xbox',        icon: 'X' },
		2: { label: 'PlayStation', icon: 'P' },
		3: { label: 'Steam',       icon: 'S' },
		4: { label: 'PC (Legacy)', icon: 'L' },
		5: { label: 'Stadia',      icon: 'G' },
		6: { label: 'Epic',        icon: 'E' },
	};

	function platformChip(row) {
		const mt = row.players?.membership_type;
		return mt != null ? (PLATFORM_LABELS[mt] ?? null) : null;
	}

	function winRate(row) {
		if (segment === 'overall') return null;
		const expectedWR = { solo: 0.50, duo: 0.55, trio: 0.62, stack: 0.66 }[segment] ?? 0.50;
		const wr = (row.impact ?? 1) * expectedWR * 100;
		return Math.min(100, Math.max(0, wr)).toFixed(1);
	}

	function formLabel(form) {
		if (!form) return { label: '—', color: 'text-zinc-500' };
		if (form >= 1.06) return { label: '▲ Hot',    color: 'text-emerald-400' };
		if (form >= 1.02) return { label: '↑ Rising', color: 'text-emerald-500/70' };
		if (form <= 0.94) return { label: '▼ Cold',   color: 'text-red-400' };
		if (form <= 0.98) return { label: '↓ Fading', color: 'text-red-500/70' };
		return { label: '→ Steady', color: 'text-zinc-400' };
	}

	function jprColor(jpr) {
		if (!jpr) return 'text-zinc-500';
		if (jpr >= 120) return 'text-yellow-300';
		if (jpr >= 100) return 'text-emerald-400';
		if (jpr >= 80)  return 'text-sky-400';
		if (jpr >= 60)  return 'text-zinc-300';
		return 'text-zinc-500';
	}

	function rankStyle(i) {
		if (i === 0) return 'text-yellow-400 font-bold';
		if (i === 1) return 'text-zinc-300 font-bold';
		if (i === 2) return 'text-orange-400 font-bold';
		return 'text-zinc-600';
	}
</script>

<div class="mx-auto max-w-6xl px-4 py-8">

	<!-- ── Header ──────────────────────────────────────────────────────────────── -->
	<div class="mb-6 flex items-end justify-between">
		<div>
			<span class="mb-1 block text-xs font-semibold tracking-widest text-emerald-500/70 uppercase">
				Global Rankings
			</span>
			<h1 class="font-display text-4xl font-light italic text-white leading-none">
				Leaderboards
			</h1>
			<div class="mt-3 h-px w-16 bg-gradient-to-r from-emerald-500/40 to-transparent"></div>
		</div>

		<!-- Live indicator -->
		<div class="flex items-center gap-2 text-xs">
			<span class="relative flex h-2 w-2">
				{#if isLive}
					<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
					<span class="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
				{:else}
					<span class="relative inline-flex h-2 w-2 rounded-full bg-zinc-600"></span>
				{/if}
			</span>
			<span class="text-zinc-500">
				{#if isLive}
					Live · {liveCount} update{liveCount !== 1 ? 's' : ''} this session
				{:else}
					Connecting…
				{/if}
			</span>
		</div>
	</div>

	<!-- ── Platform toggle ───────────────────────────────────────────────────────── -->
	<div class="mb-6 flex items-center gap-1">
		<span class="mr-2 text-[10px] font-semibold tracking-widest text-zinc-600 uppercase">Pool</span>
		{#each [{ id: 'pc', label: 'PC', sub: 'Steam · Epic' }, { id: 'console', label: 'Console', sub: 'PlayStation · Xbox' }] as p}
			<button
				onclick={() => switchPlatform(p.id)}
				class="flex flex-col items-center px-5 py-2 text-xs font-semibold tracking-wide transition-colors border
					{platform === p.id
						? 'border-emerald-500/40 bg-emerald-950/20 text-emerald-400'
						: 'border-white/5 text-zinc-500 hover:text-zinc-300 hover:border-white/10'}"
			>
				{p.label}
				<span class="text-[9px] font-normal tracking-normal {platform === p.id ? 'text-zinc-400' : 'text-zinc-600'}">{p.sub}</span>
			</button>
		{/each}
	</div>

	<!-- ── Segment tabs ──────────────────────────────────────────────────────────── -->
	<div class="mb-6 flex gap-1 border-b border-white/5 pb-0">
		{#each Object.entries(SEGMENTS) as [seg, cfg]}
			<button
				onclick={() => go(seg)}
				class="relative px-5 py-3 text-sm font-semibold tracking-wide transition-colors
					{segment === seg
						? 'text-white'
						: 'text-zinc-500 hover:text-zinc-300'}"
			>
				{cfg.label}
				<span class="block text-[10px] font-normal tracking-normal
					{segment === seg ? 'text-zinc-400' : 'text-zinc-600'}">
					{cfg.desc}
				</span>
				{#if segment === seg}
					<span class="absolute bottom-0 left-0 h-0.5 w-full rounded-full bg-emerald-400"></span>
				{/if}
			</button>
		{/each}
	</div>

	<!-- ── Table ────────────────────────────────────────────────────────────────── -->
	{#if !sorted.length}
		<div class="py-24 text-center text-zinc-600">
			<p class="text-lg">No data yet for this segment.</p>
			<p class="mt-1 text-sm">The scanner is populating matches — check back soon.</p>
		</div>
	{:else}
		<div class="overflow-hidden rounded-lg border border-white/5">
			{#if segment === 'overall'}
				<!-- Overall headers -->
				<div class="grid grid-cols-[3rem_1fr_7rem_6rem_5rem_5rem_5rem_5rem] border-b border-white/5 bg-white/[0.02] px-4 py-2.5 text-[11px] font-semibold tracking-widest text-zinc-500 uppercase">
					<span>#</span>
					<span>Guardian</span>
					<span class="text-right">Best JPR</span>
					<span class="text-right">Games</span>
					<span class="text-right">Solo</span>
					<span class="text-right">Duo</span>
					<span class="text-right">Trio</span>
					<span class="text-right">Stack</span>
				</div>
				{#each sorted as row, i (row.player_id)}
					{@const flash = flashIds.has(row.player_id)}
					<a
						href={playerUrl(row)}
						class="grid grid-cols-[3rem_1fr_7rem_6rem_5rem_5rem_5rem_5rem] items-center px-4 py-3
							border-b border-white/[0.04] last:border-0 transition-colors duration-200
							hover:bg-white/[0.04] {flash ? 'bg-emerald-500/5' : 'bg-transparent'}"
					>
						<span class="text-sm tabular-nums {rankStyle(i)}">{String(i + 1).padStart(2, '0')}</span>
						<span class="flex items-center gap-2 min-w-0">
							{#if i < 3}
								<span class="text-base leading-none">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
							{/if}
							<span class="min-w-0">
								<span class="flex items-center gap-1.5">
									<span class="truncate text-sm text-zinc-200 font-medium">{displayName(row)}</span>
									{@const chip = platformChip(row)}
									{#if chip}
										<span class="shrink-0 rounded-sm border border-zinc-700/60 bg-zinc-800/60 px-1 py-px text-[8px] font-bold tracking-wider text-zinc-500 uppercase">{chip.label}</span>
									{/if}
								</span>
								<span class="text-[10px] text-zinc-600">
									{row.segments_qualified ?? 0} segment{(row.segments_qualified ?? 0) !== 1 ? 's' : ''}
								</span>
							</span>
						</span>
						<span class="text-right text-sm font-bold tabular-nums {jprColor(row.jpr)}">
							{row.jpr?.toFixed(1) ?? '—'}
						</span>
						<span class="text-right text-sm tabular-nums text-zinc-400">
							{(row.games_played ?? 0).toLocaleString()}
						</span>
						{#each ['solo', 'duo', 'trio', 'stack'] as s}
							<span class="text-right text-xs tabular-nums {row.segment_scores?.[s] != null ? jprColor(row.segment_scores[s]) : 'text-zinc-700'}">
								{row.segment_scores?.[s]?.toFixed(1) ?? '—'}
							</span>
						{/each}
					</a>
				{/each}
			{:else}
				<!-- Segment headers -->
				<div class="grid grid-cols-[3rem_1fr_7rem_6rem_6rem_6rem_7rem] border-b border-white/5 bg-white/[0.02] px-4 py-2.5 text-[11px] font-semibold tracking-widest text-zinc-500 uppercase">
					<span>#</span>
					<span>Guardian</span>
					<span class="text-right">JPR</span>
					<span class="text-right">Games</span>
					<span class="text-right">Win %</span>
					<span class="text-right">Form</span>
					<span class="text-right">Δ Rating</span>
				</div>
				{#each sorted as row, i (row.player_id)}
					{@const delta = deltas[row.player_id]}
					{@const flash = flashIds.has(row.player_id)}
					{@const form  = formLabel(row.form)}
					<a
						href={playerUrl(row)}
						class="grid grid-cols-[3rem_1fr_7rem_6rem_6rem_6rem_7rem] items-center px-4 py-3
							border-b border-white/[0.04] last:border-0 transition-colors duration-200
							hover:bg-white/[0.04] {flash ? 'bg-emerald-500/5' : 'bg-transparent'}"
					>
						<span class="text-sm tabular-nums {rankStyle(i)}">{String(i + 1).padStart(2, '0')}</span>
						<span class="flex items-center gap-2 min-w-0">
							{#if i < 3}
								<span class="text-base leading-none">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
							{/if}
							<span class="flex items-center gap-1.5 min-w-0">
								<span class="truncate text-sm text-zinc-200 font-medium">{displayName(row)}</span>
								{@const chip = platformChip(row)}
								{#if chip}
									<span class="shrink-0 rounded-sm border border-zinc-700/60 bg-zinc-800/60 px-1 py-px text-[8px] font-bold tracking-wider text-zinc-500 uppercase">{chip.label}</span>
								{/if}
							</span>
						</span>
						<span class="text-right text-sm font-bold tabular-nums {jprColor(row.jpr)}">
							{row.jpr?.toFixed(1) ?? '—'}
						</span>
						<span class="text-right text-sm tabular-nums text-zinc-400">
							{(row.games_played ?? 0).toLocaleString()}
						</span>
						<span class="text-right text-sm tabular-nums text-zinc-400">
							{winRate(row)}%
						</span>
						<span class="text-right text-xs font-medium {form.color}">
							{form.label}
						</span>
						<span class="text-right text-xs font-bold tabular-nums
							{delta ? (delta.dir === 'up' ? 'text-emerald-400' : 'text-red-400') : 'text-zinc-700'}">
							{#if delta}
								{delta.dir === 'up' ? '+' : ''}{delta.delta.toFixed(1)}
							{:else}
								—
							{/if}
						</span>
					</a>
				{/each}
			{/if}
		</div>

		<p class="mt-3 text-center text-xs text-zinc-700">
			Top 100 · Minimum 20 matches per segment · Updates live as matches complete
			{#if segment === 'overall'} · Ranked by best single-segment JPR{/if}
		</p>
	{/if}
</div>
