<script>
	import { fly, fade } from 'svelte/transition';
	import ClarityTooltip from './ClarityTooltip.svelte';

	let { subclass, sockets, statMeta, onClose } = $props();

	const ELEMENT = {
		2: {
			name: 'Arc',
			accent: 'text-cyan-400',
			border: 'border-cyan-500/30',
			bg: 'bg-cyan-500/10',
			glow: 'shadow-[0_0_30px_rgba(34,211,238,0.15)]',
			iconBorder: 'border-cyan-500/50',
			iconGlow: 'group-hover/slot:border-cyan-400 group-hover/slot:shadow-[0_0_20px_rgba(34,211,238,0.5)]',
			accentLine: 'bg-cyan-500',
			fragPos: 'text-cyan-400',
			fragNeg: 'text-red-400'
		},
		3: {
			name: 'Solar',
			accent: 'text-orange-400',
			border: 'border-orange-500/30',
			bg: 'bg-orange-500/10',
			glow: 'shadow-[0_0_30px_rgba(249,115,22,0.15)]',
			iconBorder: 'border-orange-500/50',
			iconGlow: 'group-hover/slot:border-orange-400 group-hover/slot:shadow-[0_0_20px_rgba(249,115,22,0.5)]',
			accentLine: 'bg-orange-500',
			fragPos: 'text-emerald-400',
			fragNeg: 'text-red-400'
		},
		4: {
			name: 'Void',
			accent: 'text-violet-400',
			border: 'border-violet-500/30',
			bg: 'bg-violet-500/10',
			glow: 'shadow-[0_0_30px_rgba(139,92,246,0.15)]',
			iconBorder: 'border-violet-500/50',
			iconGlow: 'group-hover/slot:border-violet-400 group-hover/slot:shadow-[0_0_20px_rgba(139,92,246,0.5)]',
			accentLine: 'bg-violet-500',
			fragPos: 'text-emerald-400',
			fragNeg: 'text-red-400'
		},
		6: {
			name: 'Stasis',
			accent: 'text-blue-300',
			border: 'border-blue-400/30',
			bg: 'bg-blue-500/10',
			glow: 'shadow-[0_0_30px_rgba(147,197,253,0.15)]',
			iconBorder: 'border-blue-400/50',
			iconGlow: 'group-hover/slot:border-blue-300 group-hover/slot:shadow-[0_0_20px_rgba(147,197,253,0.5)]',
			accentLine: 'bg-blue-400',
			fragPos: 'text-emerald-400',
			fragNeg: 'text-red-400'
		},
		7: {
			name: 'Strand',
			accent: 'text-emerald-400',
			border: 'border-emerald-500/30',
			bg: 'bg-emerald-500/10',
			glow: 'shadow-[0_0_30px_rgba(16,185,129,0.15)]',
			iconBorder: 'border-emerald-500/50',
			iconGlow: 'group-hover/slot:border-emerald-400 group-hover/slot:shadow-[0_0_20px_rgba(16,185,129,0.5)]',
			accentLine: 'bg-emerald-500',
			fragPos: 'text-emerald-400',
			fragNeg: 'text-red-400'
		}
	};

	const el = $derived(ELEMENT[subclass?.damageType] ?? ELEMENT[7]);


	function resolveStatBonuses(bonuses) {
		if (!bonuses?.length) return [];
		return bonuses
			.map((b) => {
				const meta = statMeta?.find((m) => m.hash === b.statHash);
				if (!meta) return null; // skip unknown stats (e.g. fragment slot count)
				return {
					short: meta.short,
					name: meta.name,
					value: b.value,
					text: meta.text
				};
			})
			.filter((b) => b !== null && b.value !== 0);
	}

	const ABILITY_ORDER = ['Movement Ability', 'Class Ability', 'Melee', 'Grenade'];

	const sortedAbilities = $derived(() => {
		const abilities = sockets?.abilities ?? [];
		return [...abilities].sort((a, b) => {
			const ai = ABILITY_ORDER.findIndex((t) =>
				(a.itemTypeDisplayName ?? '').toLowerCase().includes(t.toLowerCase())
			);
			const bi = ABILITY_ORDER.findIndex((t) =>
				(b.itemTypeDisplayName ?? '').toLowerCase().includes(t.toLowerCase())
			);
			return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
		});
	});

	function abilityTypeLabel(type) {
		const map = {
			'Movement Ability': 'JUMP',
			'Class Ability': 'CLASS',
			'Melee': 'MELEE',
			'Grenade': 'GRENADE',
			'Super Ability': 'SUPER'
		};
		return map[type] ?? (type?.toUpperCase() ?? '');
	}

	// Tooltip
	let hoveredItem = $state(null);
	let tooltipPos = $state({ x: 0, y: 0 });

	function onItemEnter(e, item) {
		const rect = e.currentTarget.getBoundingClientRect();
		hoveredItem = item;
		tooltipPos = { x: rect.left + rect.width / 2, y: rect.top - 12 };
	}
	function onItemLeave() {
		hoveredItem = null;
	}
</script>

<div
	class="fixed inset-0 z-[1000] flex items-center justify-center p-4 font-sans sm:p-6"
	transition:fade={{ duration: 200 }}
>
	<button
		class="absolute inset-0 cursor-default border-none bg-black/95 backdrop-blur-xl"
		onclick={onClose}
	></button>

	{#if subclass}
		<div
			class="relative z-10 flex max-h-[95vh] w-full max-w-7xl flex-col overflow-hidden border {el.border} bg-[#0a0a0a] {el.glow} shadow-2xl"
			in:fly={{ y: 20, duration: 400 }}
		>
			<!-- Header bar -->
			<div
				class="relative flex shrink-0 items-center gap-4 border-b border-zinc-800 bg-zinc-950 px-6 py-4"
			>
				<!-- Left accent line -->
				<div class="absolute left-0 top-0 h-full w-[3px] {el.accentLine}"></div>

				<div class="ml-2 flex items-center gap-3">
					{#if subclass.icon}
						<img
							src={subclass.icon}
							alt={subclass.name}
							class="h-8 w-8 object-contain opacity-90"
						/>
					{/if}
					<div>
						<h2
							class="text-xl font-black tracking-[0.12em] text-white uppercase italic leading-none"
						>
							{subclass.name ?? 'Unknown Subclass'}
						</h2>
						<span class="text-[9px] font-bold tracking-[0.35em] {el.accent} uppercase">
							{el.name} Subclass
						</span>
					</div>
				</div>

				<div class="ml-auto">
					<button
						class="border border-white/10 bg-white/5 px-5 py-2 text-[10px] font-black tracking-[0.2em] uppercase shadow-xl transition-all hover:bg-white/10"
						onclick={onClose}>CLOSE_ARCHIVE</button
					>
				</div>
			</div>

			<!-- Content -->
			<div
				class="scrollbar-hide grid flex-1 grid-cols-12 gap-8 overflow-y-auto bg-[#0a0a0a] p-8"
			>
				<!-- Left column: Super (col-span-3) -->
				<div class="col-span-12 lg:col-span-3">
					<span
						class="mb-4 block font-sans text-[9px] font-bold tracking-[0.35em] text-zinc-500 uppercase"
						>SUPER</span
					>

					{#if sockets?.super}
						{@const superAbility = sockets.super}
						{@const superDesc = superAbility.clarityDescription || superAbility.description || superAbility.perkDescription || superAbility.flavorText || ''}
						<div
							class="group/slot flex cursor-help flex-col items-center gap-4 border {el.border} {el.bg} p-6 text-center transition-all duration-300"
							onmouseenter={(e) => onItemEnter(e, { name: superAbility.name, typeLabel: 'SUPER ABILITY', sections: superAbility.claritySections ?? null, description: superDesc, bonuses: [] })}
							onmouseleave={onItemLeave}
						>
							<div
								class="relative h-20 w-20 overflow-hidden border-2 {el.iconBorder} bg-zinc-950 transition-all duration-300 {el.iconGlow}"
							>
								{#if superAbility.icon}
									<img
										src={superAbility.icon}
										alt={superAbility.name}
										class="h-full w-full object-cover"
									/>
								{:else}
									<div class="flex h-full w-full items-center justify-center opacity-20">
										<div class="h-8 w-8 rounded-full border border-zinc-500"></div>
									</div>
								{/if}
							</div>
							<div>
								<p
									class="text-[11px] font-black uppercase italic tracking-wider {el.accent} leading-tight"
								>
									{superAbility.name ?? 'Unknown'}
								</p>
								<p
									class="mt-0.5 text-[9px] font-bold tracking-widest text-zinc-500 uppercase"
								>
									SUPER ABILITY
								</p>
							</div>
						</div>
					{:else}
						<div
							class="flex h-48 items-center justify-center border {el.border} opacity-40"
						>
							<p class="text-[9px] font-bold tracking-[0.3em] text-zinc-700 uppercase">
								No super equipped
							</p>
						</div>
					{/if}
				</div>

				<!-- Middle column: Abilities (col-span-5) -->
				<div class="col-span-12 lg:col-span-5">
					<span
						class="mb-4 block font-sans text-[9px] font-bold tracking-[0.35em] text-zinc-500 uppercase"
						>ABILITIES</span
					>

					{#if sortedAbilities().length}
						<div class="grid grid-cols-2 gap-4">
							{#each sortedAbilities() as ability}
								{@const abilityDesc = ability.clarityDescription || ability.description || ability.perkDescription || ability.flavorText || ''}
								<div
									class="group/slot flex cursor-help flex-col items-center gap-3 border {el.border} bg-zinc-900/20 p-4 text-center transition-all duration-300 hover:{el.bg}"
									onmouseenter={(e) => onItemEnter(e, { name: ability.name, typeLabel: abilityTypeLabel(ability.itemTypeDisplayName), sections: ability.claritySections ?? null, description: abilityDesc, bonuses: [] })}
									onmouseleave={onItemLeave}
								>
									<div
										class="relative h-[60px] w-[60px] overflow-hidden rounded-full border {el.iconBorder} bg-zinc-950 transition-all duration-300 {el.iconGlow}"
									>
										{#if ability.icon}
											<img
												src={ability.icon}
												alt={ability.name}
												class="h-full w-full object-cover"
											/>
										{:else}
											<div
												class="flex h-full w-full items-center justify-center opacity-20"
											>
												<div class="h-6 w-6 rounded-full border border-zinc-500"></div>
											</div>
										{/if}
									</div>
									<div>
										<p
											class="text-[9px] font-bold tracking-[0.25em] text-zinc-500 uppercase"
										>
											{abilityTypeLabel(ability.itemTypeDisplayName)}
										</p>
										<p class="mt-0.5 text-xs font-black text-white uppercase italic leading-tight">
											{ability.name ?? 'Unknown'}
										</p>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<div
							class="flex h-32 items-center justify-center border {el.border} opacity-40"
						>
							<p class="text-[9px] font-bold tracking-[0.3em] text-zinc-700 uppercase">
								No abilities equipped
							</p>
						</div>
					{/if}
				</div>

				<!-- Right column: Aspects + Fragments (col-span-4) -->
				<div class="col-span-12 space-y-6 lg:col-span-4">
					<!-- Aspects -->
					<div>
						<span
							class="mb-4 block font-sans text-[9px] font-bold tracking-[0.35em] text-zinc-500 uppercase"
							>ASPECTS</span
						>
						<div class="grid grid-cols-2 gap-3">
							{#each (sockets?.aspects ?? []).slice(0, 2) as aspect}
								{@const aspectBonuses = resolveStatBonuses([...(aspect.statBonuses ?? []), ...(aspect.conditionalBonuses ?? [])])}
								{@const aspectDesc = aspect.clarityDescription || aspect.description || aspect.perkDescription || aspect.flavorText || ''}
								<div
									class="group/slot flex cursor-help flex-col gap-3 border {el.border} {el.bg} p-3 transition-all duration-300"
									onmouseenter={(e) => onItemEnter(e, { name: aspect.name, typeLabel: 'ASPECT', sections: aspect.claritySections ?? null, description: aspectDesc, bonuses: aspectBonuses })}
									onmouseleave={onItemLeave}
								>
									<!-- Icon + name row -->
									<div class="flex items-center gap-3">
										<div
											class="relative h-12 w-12 shrink-0 overflow-hidden border {el.iconBorder} bg-zinc-950 transition-all duration-300 {el.iconGlow}"
										>
											{#if aspect.icon}
												<img src={aspect.icon} alt={aspect.name} class="h-full w-full object-cover" />
											{:else}
												<div class="flex h-full w-full items-center justify-center opacity-20">
													<div class="h-5 w-5 border border-zinc-500"></div>
												</div>
											{/if}
										</div>
										<p class="text-[10px] font-black text-zinc-100 uppercase italic leading-tight">
											{aspect.name ?? 'Empty Slot'}
										</p>
									</div>
									<!-- Stat bonuses (always visible) -->
									{#if aspectBonuses.length}
										<div class="flex flex-wrap gap-1">
											{#each aspectBonuses as bonus}
												<span
													class="rounded-sm {bonus.value > 0
														? 'bg-emerald-500/15 text-emerald-400'
														: 'bg-red-500/15 text-red-400'} px-1.5 py-0.5 text-[8px] font-black"
												>
													{bonus.value > 0 ? '+' : ''}{bonus.value} {bonus.short}
												</span>
											{/each}
										</div>
									{/if}
								</div>
							{/each}

							{#if (sockets?.aspects ?? []).length === 0}
								{#each [0, 1] as _}
									<div
										class="flex h-24 items-center justify-center border {el.border} opacity-30"
									>
										<p class="text-[8px] font-bold tracking-[0.2em] text-zinc-700 uppercase">
											Empty
										</p>
									</div>
								{/each}
							{/if}
						</div>
					</div>

					<!-- Fragments -->
					<div>
						<span
							class="mb-4 block font-sans text-[9px] font-bold tracking-[0.35em] text-zinc-500 uppercase"
							>FRAGMENTS</span
						>

						{#if sockets?.fragments?.length}
							<div class="grid grid-cols-2 gap-2">
								{#each sockets.fragments as frag}
									{@const allBonuses = resolveStatBonuses([
										...(frag.statBonuses ?? []),
										...(frag.conditionalBonuses ?? [])
									])}
									{@const fragDesc = frag.clarityDescription || frag.description || frag.perkDescription || frag.flavorText || ''}
									<div
										class="group/frag flex cursor-help flex-col gap-2 border {el.border} bg-zinc-900/20 p-2.5 transition-all duration-300 hover:{el.bg}"
										onmouseenter={(e) => onItemEnter(e, { name: frag.name, typeLabel: 'FRAGMENT', sections: frag.claritySections ?? null, description: fragDesc, bonuses: allBonuses })}
										onmouseleave={onItemLeave}
									>
										<!-- Icon + name row -->
										<div class="flex items-center gap-2">
											<div
												class="relative h-8 w-8 shrink-0 overflow-hidden border {el.iconBorder} bg-zinc-950 transition-all duration-300 {el.iconGlow}"
											>
												{#if frag.icon}
													<img src={frag.icon} alt={frag.name} class="h-full w-full object-cover" />
												{:else}
													<div class="flex h-full w-full items-center justify-center opacity-20">
														<div class="h-3 w-3 rounded-full border border-zinc-500"></div>
													</div>
												{/if}
											</div>
											<p class="text-[9px] font-black text-zinc-200 uppercase italic leading-tight">
												{frag.name ?? 'Fragment'}
											</p>
										</div>
										<!-- Stat bonuses (always visible) -->
										{#if allBonuses.length}
											<div class="flex flex-wrap gap-0.5">
												{#each allBonuses as bonus}
													<span
														class="rounded-sm px-1 py-0.5 text-[7px] font-black {bonus.value > 0
															? 'text-emerald-400'
															: 'text-red-400'}"
													>
														{bonus.value > 0 ? '+' : ''}{bonus.value} {bonus.short}
													</span>
												{/each}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{:else}
							<div
								class="flex h-24 items-center justify-center border {el.border} opacity-30"
							>
								<p class="text-[9px] font-bold tracking-[0.3em] text-zinc-700 uppercase">
									No fragments equipped
								</p>
							</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- Footer bar -->
			<div
				class="z-[60] flex h-10 shrink-0 items-center justify-between border-t border-zinc-800 bg-zinc-950 px-8"
			>
				<div class="flex items-center gap-8">
					<span class="text-[9px] font-black tracking-[0.5em] text-zinc-700 uppercase"
						>JADESTONE_SUBCLASS_ARCHIVE</span
					>
				</div>
				<div class="flex items-center gap-3">
					<div
						class="h-2 w-2 animate-pulse rounded-full {el.accentLine} shadow-[0_0_10px_rgba(16,185,129,0.5)]"
					></div>
					<span class="text-[9px] font-bold tracking-[0.3em] {el.accent} opacity-50 uppercase"
						>ENCRYPTED_SIGNAL_STABLE</span
					>
				</div>
			</div>
		</div>

		<!-- Global Smart Tooltip -->
		{#if hoveredItem}
			<ClarityTooltip
				item={hoveredItem}
				pos={tooltipPos}
				accentClass={el.accent}
				accentLineClass={el.accentLine}
			/>
		{/if}
	{/if}
</div>

<style>
	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}
	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
</style>
