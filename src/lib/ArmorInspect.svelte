<script>
	import { fly, fade } from 'svelte/transition';

	let { armor, onClose } = $props();

	// Tooltip tracking for mods
	let hoveredMod = $state(null);
	let tooltipPos = $state({ x: 0, y: 0 });

	const isExotic = armor?.tierType === 6;

	const masterworkGlow = isExotic
		? 'shadow-[0_0_40px_rgba(245,158,11,0.35)] border-amber-500/60'
		: 'shadow-[0_0_40px_rgba(234,179,8,0.25)] border-yellow-500/50';

	const tierAccent = isExotic ? 'text-amber-500' : 'text-emerald-500';
	const tierBar = isExotic ? 'bg-amber-500' : 'bg-zinc-500';

	const totalStats = $derived(
		armor?.armorStats?.reduce((sum, s) => sum + (s.value ?? 0), 0) ?? 0
	);

	function onModEnter(e, mod) {
		const rect = e.currentTarget.getBoundingClientRect();
		hoveredMod = mod;
		tooltipPos = {
			x: rect.left + rect.width / 2,
			y: rect.top - 20
		};
	}

	function energySegments(used, capacity) {
		const cap = capacity ?? 10;
		const segments = [];
		for (let i = 0; i < cap; i++) {
			segments.push(i < used);
		}
		return segments;
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

	{#if armor}
		<div
			class="relative z-10 flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden border border-zinc-800 bg-[#0a0a0a] shadow-2xl"
			in:fly={{ y: 20, duration: 400 }}
		>
			<!-- Banner / Screenshot -->
			<div
				class="relative z-50 h-64 shrink-0 border-b border-zinc-800 bg-zinc-950 {armor.masterwork
					? masterworkGlow
					: ''}"
			>
				{#if armor.screenshot}
					<img
						src={armor.screenshot}
						alt={armor.name}
						class="h-full w-full object-cover opacity-60 contrast-125 grayscale-[0.1]"
					/>
					<div
						class="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent"
					></div>
				{:else}
					<div class="flex h-full w-full items-center justify-center opacity-10">
						<div class="h-32 w-32 border border-zinc-500"></div>
					</div>
				{/if}

				<!-- Masterwork shimmer overlay -->
				{#if armor.masterwork}
					<div
						class="pointer-events-none absolute inset-0 {isExotic
							? 'bg-gradient-to-br from-amber-500/5 via-transparent to-amber-500/5'
							: 'bg-gradient-to-br from-yellow-500/5 via-transparent to-yellow-500/5'}"
					></div>
				{/if}

				<div class="absolute bottom-0 left-0 flex w-full items-end justify-between p-6">
					<div class="flex items-center gap-6">
						<!-- Icon Container -->
						<div
							class="relative h-20 w-20 shrink-0 overflow-hidden border {armor.masterwork
								? (isExotic ? 'border-amber-500/70' : 'border-yellow-500/60')
								: 'border-zinc-700'} bg-zinc-900 shadow-2xl"
						>
							<img src={armor.icon} alt={armor.name} class="h-full w-full object-cover p-1" />
							{#if armor.iconWatermark}
								<img
									src={armor.iconWatermark}
									alt=""
									class="pointer-events-none absolute inset-0 h-full w-full object-cover"
								/>
							{/if}
							<div class="absolute top-0 left-0 h-[2px] w-full {tierBar}"></div>
						</div>

						<div>
							<span class="text-[10px] font-black tracking-[0.4em] {tierAccent} uppercase">
								{armor.tierTypeName ?? ''} &nbsp;&bull;&nbsp; {armor.itemTypeDisplayName ?? ''}
							</span>
							{#if armor.masterwork}
								<span
									class="ml-3 text-[9px] font-black tracking-[0.3em] {isExotic
										? 'text-amber-400'
										: 'text-yellow-400'} uppercase"
									>MASTERWORK</span
								>
							{/if}
							<h2
								class="mt-1 text-5xl font-light tracking-tighter text-white uppercase italic drop-shadow-2xl"
							>
								{armor.name}
							</h2>

							<!-- Energy bar -->
							{#if armor.energyCapacity}
								<div class="mt-3 flex items-center gap-2">
									<span class="text-[8px] font-bold tracking-[0.25em] text-zinc-500 uppercase"
										>ENERGY</span
									>
									<div class="flex gap-[3px]">
										{#each energySegments(armor.energyUsed ?? 0, armor.energyCapacity) as filled}
											<div
												class="h-2 w-3 border {filled
													? (isExotic
														? 'border-amber-500/80 bg-amber-500 shadow-[0_0_4px_rgba(245,158,11,0.5)]'
														: 'border-emerald-500/80 bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.4)]')
													: 'border-zinc-700 bg-zinc-900'}"
											></div>
										{/each}
									</div>
									<span class="font-mono text-[9px] text-zinc-500"
										>{armor.energyUsed ?? 0}/{armor.energyCapacity}</span
									>
								</div>
							{/if}
						</div>
					</div>

					<button
						class="border border-white/10 bg-white/5 px-5 py-2 text-[10px] font-black tracking-[0.2em] uppercase shadow-xl transition-all hover:bg-white/10"
						onclick={onClose}>CLOSE_ARCHIVE</button
					>
				</div>
			</div>

			<!-- Content Area -->
			<div
				class="scrollbar-hide z-10 grid flex-1 grid-cols-12 gap-8 overflow-y-auto bg-[#0a0a0a] p-8"
			>
				<!-- Left: Armor Stats (col-span-4) -->
				<div class="col-span-12 space-y-4 border-r border-zinc-800/30 pr-6 lg:col-span-4">
					<span
						class="mb-4 block font-sans text-[9px] font-bold tracking-[0.3em] text-zinc-500 uppercase"
						>ARMOR_STAT_MATRIX</span
					>
					<div class="space-y-3">
						{#each armor.armorStats ?? [] as stat}
							<div class="group/stat">
								<div class="mb-1.5 flex items-end justify-between">
									<span class="text-[9px] font-bold tracking-[0.2em] text-zinc-400 uppercase"
										>{stat.name}</span
									>
									<span class="font-mono text-xs font-black {stat.text ?? 'text-white'}"
										>{stat.value ?? 0}</span
									>
								</div>
								<div
									class="relative h-1.5 overflow-hidden rounded-full border border-white/5 bg-zinc-950"
								>
									<div
										class="absolute inset-y-0 left-0 {stat.color ??
											'bg-emerald-500'} transition-all duration-1000 ease-out"
										style="width: {Math.min(
											(((stat.value ?? 0) / (stat.maximum ?? 30)) * 100),
											100
										)}%"
									></div>
								</div>
							</div>
						{/each}
					</div>

					<!-- Total -->
					<div class="mt-4 border-t border-zinc-800/60 pt-4">
						<div class="flex items-center justify-between">
							<span class="text-[9px] font-black tracking-[0.3em] {tierAccent} uppercase"
								>TOTAL</span
							>
							<span class="font-mono text-lg font-black text-white">{totalStats}</span>
						</div>
					</div>
				</div>

				<!-- Right: Mods + Flavor Text (col-span-8) -->
				<div class="col-span-12 space-y-6 lg:col-span-8">
					<span
						class="block font-sans text-[9px] font-black tracking-[0.4em] {tierAccent} uppercase"
						>INSTALLED_MODIFICATIONS</span
					>

					{#if armor.mods?.length}
						<div class="grid grid-cols-2 gap-4 xl:grid-cols-3">
							{#each armor.mods as mod}
								<div
									class="group/mod relative flex items-start gap-3 border border-zinc-800/60 bg-zinc-900/30 p-3 transition-all duration-200 hover:border-sky-500/30 hover:bg-sky-500/5"
									onmouseenter={(e) => onModEnter(e, mod)}
									onmouseleave={() => (hoveredMod = null)}
								>
									<!-- Mod Icon -->
									<div
										class="relative h-10 w-10 shrink-0 cursor-help overflow-hidden rounded-full border border-zinc-700 bg-zinc-950 transition-all duration-300 group-hover/mod:border-sky-400 group-hover/mod:shadow-[0_0_20px_rgba(56,189,248,0.5)]"
									>
										{#if mod.icon}
											<img src={mod.icon} alt={mod.name} class="h-full w-full object-cover" />
										{:else}
											<div class="flex h-full w-full items-center justify-center opacity-20">
												<div class="h-4 w-4 border border-zinc-500"></div>
											</div>
										{/if}
									</div>

									<div class="min-w-0 flex-1">
										<p
											class="truncate text-[10px] font-black text-zinc-200 uppercase italic leading-tight"
										>
											{mod.name ?? 'Unknown Mod'}
										</p>
										{#if mod.energyCost != null}
											<p class="mt-0.5 text-[8px] font-bold tracking-wider text-zinc-600 uppercase">
												COST: {mod.energyCost}
											</p>
										{/if}
										<!-- Stat bonuses -->
										{#if mod.statBonuses?.length}
											<div class="mt-1.5 flex flex-wrap gap-1">
												{#each mod.statBonuses as bonus}
													{#if bonus.value}
														<span
															class="rounded-sm bg-emerald-500/15 px-1.5 py-0.5 text-[8px] font-black text-emerald-400"
															>+{bonus.value}</span
														>
													{/if}
												{/each}
											</div>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<div class="flex h-24 items-center justify-center border border-zinc-800/40 bg-zinc-900/10">
							<p class="text-[10px] font-bold tracking-[0.3em] text-zinc-700 uppercase">
								No mods equipped
							</p>
						</div>
					{/if}

					<!-- Flavor Text -->
					{#if armor.flavorText}
						<div class="border-t border-zinc-800/50 pt-6">
							<span
								class="mb-3 block font-sans text-[9px] font-black tracking-[0.4em] text-zinc-600 uppercase"
								>CLASSIFICATION_DATA</span
							>
							<p class="indent-6 font-sans font-normal text-xs leading-relaxed text-zinc-300">
								{armor.flavorText}
							</p>
						</div>
					{/if}
				</div>
			</div>

			<!-- Footer bar -->
			<div
				class="z-[60] flex h-10 shrink-0 items-center justify-between border-t border-zinc-800 bg-zinc-950 px-8"
			>
				<div class="flex items-center gap-8">
					<span class="text-[9px] font-black tracking-[0.5em] text-zinc-700 uppercase"
						>JADESTONE_ARMOR_ARCHIVE</span
					>
				</div>
				<div class="flex items-center gap-3">
					<div
						class="h-2 w-2 animate-pulse rounded-full {isExotic
							? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]'
							: 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]'}"
					></div>
					<span class="text-[9px] font-bold tracking-[0.3em] {isExotic ? 'text-amber-900' : 'text-emerald-900'} uppercase"
						>ENCRYPTED_SIGNAL_STABLE</span
					>
				</div>
			</div>
		</div>

		<!-- Mod Tooltip -->
		{#if hoveredMod}
			<div
				class="pointer-events-none fixed z-[2000] mb-6 -translate-x-1/2 -translate-y-full"
				style="left: {tooltipPos.x}px; top: {tooltipPos.y}px;"
				transition:fade={{ duration: 100 }}
			>
				<div
					class="w-72 border border-zinc-800 bg-[#0a0a0a] p-4 shadow-[0_0_40px_rgba(0,0,0,0.9)]"
				>
					<p class="mb-1.5 text-[11px] font-black uppercase italic tracking-wider text-sky-400">
						{hoveredMod.name ?? 'Unknown Mod'}
					</p>
					<p class="font-sans font-normal text-xs leading-relaxed text-zinc-200">
						{hoveredMod.clarityDescription || hoveredMod.description || 'No modification data available.'}
					</p>
					{#if hoveredMod.statBonuses?.length}
						<div class="mt-2 flex flex-wrap gap-1">
							{#each hoveredMod.statBonuses as bonus}
								{#if bonus.value}
									<span class="rounded-sm bg-emerald-500/20 px-1.5 py-0.5 text-[8px] font-black text-emerald-400"
										>+{bonus.value}</span
									>
								{/if}
							{/each}
						</div>
					{/if}
					<div class="absolute top-full left-1/2 h-5 w-[1px] -translate-x-1/2 bg-sky-400/50"></div>
				</div>
			</div>
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
