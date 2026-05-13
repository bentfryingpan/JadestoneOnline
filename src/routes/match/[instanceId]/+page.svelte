<script>
	import { egoColor } from '$lib/ego.js';
	import { fly, fade } from 'svelte/transition';
	import WeaponInspect from '$lib/WeaponInspect.svelte';

	let { data } = $props();

	function timeAgo(iso) {
		if (!iso) return '';
		const diff = Date.now() - new Date(iso).getTime();
		const m = Math.floor(diff / 60000);
		if (m < 60) return `${m}m ago`;
		const h = Math.floor(m / 60);
		if (h < 24) return `${h}h ago`;
		return `${Math.floor(h / 24)}d ago`;
	}
	function fmtDuration(s) {
		if (!s) return '—';
		return `${Math.floor(s / 60)}m ${s % 60}s`;
	}
	function fmtNum(n) {
		if (n === null || n === undefined) return '—';
		if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
		if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
		return String(Math.round(n));
	}
	function teamAvgEgo(players) {
		const done = players.filter((p) => p.score > 0);
		if (!done.length) return 0;
		return done.reduce((s, p) => s + p.score, 0) / done.length;
	}

	let expandedPlayer = $state(null);
	function togglePlayer(id) {
		expandedPlayer = expandedPlayer === id ? null : id;
	}

	// Weapon Inspect State
	let selectedWeapon = $state(null);
	let inspectorMid = $state(null);
	let inspectorMt = $state(null);

	const PRIMARY_STATS = [
		{ key: 'kills', label: 'HOSTILES', color: 'text-zinc-100' },
		{ key: 'motesDeposited', label: 'BANKED', color: 'text-emerald-400' },
		{ key: 'invasionKills', label: 'INVASION', color: 'text-violet-400' },
		{ key: 'primevalDamage', label: 'DPS', color: 'text-amber-400' }
	];

	const ABILITY_STATS = [
		{ key: 'precisionKills', label: 'Precision', color: 'text-emerald-500' },
		{ key: 'weaponKillsGrenade', label: 'Grenade', color: 'text-sky-400' },
		{ key: 'weaponKillsMelee', label: 'Melee', color: 'text-orange-400' },
		{ key: 'weaponKillsSuper', label: 'Super', color: 'text-amber-300' }
	];

	const LOSS_STATS = [
		{ key: 'deaths', label: 'Deaths', color: 'text-rose-500' },
		{ key: 'motesLost', label: 'Motes Lost', color: 'text-rose-400' },
		{ key: 'motesDenied', label: 'Denied', color: 'text-violet-500' }
	];
</script>

{#snippet ghostLabel({ text, className = '' })}
	<span
		class="mb-1 block font-sans text-[8px] font-bold tracking-[0.2em] text-zinc-500 uppercase {className}"
		>{text}</span
	>
{/snippet}

{#snippet medalIcon({ medal })}
	<div class="group relative flex h-12 w-12 items-center justify-center">
		<div
			class="absolute inset-0 rotate-45 cursor-help overflow-hidden border border-amber-500/20 bg-amber-950/10 transition-all duration-500 group-hover:scale-110 group-hover:rotate-90"
		>
			{#if medal.icon}
				<img
					src={medal.icon}
					alt={medal.label}
					class="h-full w-full -rotate-45 object-contain p-1 transition-transform duration-500 group-hover:-rotate-90"
				/>
			{:else}
				<div
					class="flex h-full w-full -rotate-45 items-center justify-center transition-all duration-500 group-hover:-rotate-90"
				>
					<span class="text-[10px] font-bold text-amber-500">★</span>
				</div>
			{/if}
			{#if medal.count > 1}
				<div
					class="absolute right-1 bottom-1 -rotate-45 border border-amber-500/40 bg-black/80 px-1 py-0.5 transition-all group-hover:-rotate-90"
				>
					<span class="text-[8px] leading-none font-black text-amber-400">x{medal.count}</span>
				</div>
			{/if}
		</div>
		<div
			class="pointer-events-none absolute bottom-full left-1/2 z-[300] mb-6 -translate-x-1/2 scale-95 border border-zinc-800 bg-[#0a0a0a] px-3 py-2 font-sans text-[10px] tracking-[0.2em] whitespace-nowrap text-zinc-100 uppercase opacity-0 shadow-2xl transition-all duration-300 group-hover:scale-100 group-hover:opacity-100"
		>
			<div class="relative z-10">{medal.label}</div>
			<div class="absolute top-full left-1/2 h-4 w-[1px] -translate-x-1/2 bg-amber-500/40"></div>
			<div class="absolute inset-0 -z-10 bg-amber-500/5 blur-sm"></div>
		</div>
	</div>
{/snippet}

<div class="min-h-screen overflow-x-hidden bg-[#080808] font-sans text-slate-200">
	<header class="relative h-64 shrink-0 overflow-hidden border-b border-zinc-800">
		{#if data.pgcrImage}
			<div class="absolute inset-0 z-0">
				<img
					src={data.pgcrImage}
					alt={data.mapName}
					class="h-full w-full object-cover opacity-40 contrast-125 grayscale-[0.3]"
				/>
				<div
					class="absolute inset-0 z-10 bg-gradient-to-t from-[#080808] via-[#080808]/60 to-transparent"
				></div>
			</div>
		{/if}
		<div class="relative z-30 mx-auto flex h-full max-w-7xl flex-col justify-end p-10 font-sans">
			<div class="flex items-end justify-between">
				<div>
					<span
						class="mb-2 block font-sans text-[10px] font-black tracking-[0.4em] text-emerald-500 uppercase"
						>INTELLIGENCE_PGCR</span
					>
					<h1
						class="text-5xl leading-none font-light tracking-tighter text-white uppercase italic drop-shadow-2xl"
					>
						{data.mapName}
					</h1>
				</div>
				<div
					class="mb-2 flex gap-8 text-right font-sans text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase"
				>
					<div><span class="mb-1 block text-zinc-700">DATED</span>{timeAgo(data.period)}</div>
					<div>
						<span class="mb-1 block text-zinc-700">LENGTH</span>{fmtDuration(data.duration)}
					</div>
				</div>
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-7xl space-y-8 p-10">
		<div class="grid grid-cols-2 gap-8">
			{#each [{ players: data.teamA, won: data.teamAWon, label: 'ALPHA' }, { players: data.teamB, won: data.teamBWon, label: 'BRAVO' }] as team}
				<div class="space-y-4">
					<div class="flex items-center justify-between border-b border-zinc-800 pb-3">
						<div class="flex items-center gap-3">
							<div
								class="h-2.5 w-2.5 rotate-45 {team.won
									? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]'
									: 'bg-rose-500'}"
							></div>
							<h2 class="text-xs font-black tracking-[0.3em] text-zinc-100">{team.label}_OPS</h2>
						</div>
						<span
							class="text-sm font-light text-white italic"
							style="color: {egoColor(teamAvgEgo(team.players))}"
							>{teamAvgEgo(team.players).toFixed(1)}
							<span class="ml-1 text-[8px] font-bold text-zinc-700 uppercase not-italic"
								>TEAM_EGO</span
							></span
						>
					</div>

					{#each team.players as p}
						{@const uid = `${p.membershipId}-${p.name}`}
						{@const isExp = expandedPlayer === uid}
						<div
							class="border border-zinc-800 bg-[#0c0c0c] transition-all duration-300 hover:border-zinc-700"
						>
							<button onclick={() => togglePlayer(uid)} class="flex w-full items-center gap-6 p-4">
								<div
									class="relative h-10 w-10 shrink-0 rotate-45 overflow-hidden border border-zinc-800 bg-zinc-900"
								>
									{#if p.icon}
										<img
											src={p.icon}
											alt={p.name}
											class="h-full w-full -rotate-45 object-cover opacity-80"
										/>
									{/if}
								</div>
								<div class="min-w-0 flex-1 text-left">
									<span
										class="truncate text-base font-black tracking-wider text-zinc-100 uppercase italic"
										>{p.name}</span
									>
									<div class="mt-1 flex gap-4">
										{#each PRIMARY_STATS as { key, label, color }}
											<div class="flex items-baseline gap-1.5">
												<span class="text-[7px] font-bold text-zinc-600 uppercase">{label}</span>
												<span class="text-[10px] font-black {color}">{fmtNum(p.stats[key])}</span>
											</div>
										{/each}
									</div>
								</div>
								<div class="border-l border-zinc-800/50 px-4 text-right">
									<span class="text-xl font-light italic" style="color: {egoColor(p.score)}"
										>{p.score}</span
									>
									<p class="text-[7px] font-bold tracking-widest text-zinc-700 uppercase">
										EGO_RATING
									</p>
								</div>
							</button>

							{#if isExp}
								<div
									in:fly={{ y: -5, duration: 300 }}
									class="space-y-8 border-t border-zinc-800/50 bg-[#080808]/80 p-6"
								>
									<div class="grid grid-cols-2 gap-8">
										<div>
											{@render ghostLabel({ text: 'ABILITY_PRECISION' })}
											<div class="mt-3 grid grid-cols-2 gap-3">
												{#each ABILITY_STATS as { key, label, color }}
													<div class="border border-zinc-900 bg-zinc-950/50 p-3">
														<p class="text-[7px] font-bold tracking-widest text-zinc-700 uppercase">
															{label}
														</p>
														<p class="text-base font-light italic {color}">{p.stats[key] ?? 0}</p>
													</div>
												{/each}
												{#each LOSS_STATS as { key, label, color }}
													<div class="border border-zinc-900 bg-zinc-950/50 p-3">
														<p class="text-[7px] font-bold tracking-widest text-zinc-700 uppercase">
															{label}
														</p>
														<p class="text-base font-light italic {color}">{p.stats[key] ?? 0}</p>
													</div>
												{/each}
											</div>
										</div>

										<div>
											{@render ghostLabel({ text: 'ACHIEVED_RECORDS' })}
											<div class="mt-3 flex flex-wrap gap-3">
												{#each p.medalList ?? [] as medal}
													{@render medalIcon({ medal })}
												{/each}
											</div>
											<div class="mt-8">
												{@render ghostLabel({ text: 'WEAPONS' })}
												<div class="mt-3 space-y-1.5">
													{#each p.weapons ?? [] as w}
														<div
															class="group/weapon flex items-center justify-between border border-zinc-900 bg-zinc-950/50 p-2"
														>
															<div class="flex items-center gap-3">
																<img
																	src={w.icon}
																	alt={w.name}
																	class="h-7 w-7 opacity-60 transition-opacity group-hover/weapon:opacity-100"
																/>
																<div>
																	<p class="text-[9px] font-black text-zinc-200 uppercase italic">
																		{w.name}
																	</p>
																	<p class="text-[7px] font-bold text-zinc-600 uppercase">
																		{w.kills} KILLS
																	</p>
																</div>
															</div>
															<button
																class="border border-emerald-500/10 px-2 py-0.5 text-[7px] font-black text-emerald-900 transition-all hover:border-emerald-500/40 hover:text-emerald-500"
																onclick={() => {
																	selectedWeapon = w;
																	inspectorMid = p.membershipId;
																	inspectorMt = data.membershipType;
																}}
															>
																INSPECT
															</button>
														</div>
													{/each}
												</div>
											</div>
										</div>
									</div>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/each}
		</div>
	</main>

	{#if selectedWeapon}
		<WeaponInspect
			weapon={{ ...selectedWeapon, membershipId: inspectorMid, membershipType: inspectorMt }}
			onClose={() => (selectedWeapon = null)}
		/>
	{/if}
</div>
