<script>
	let { char, eq, sockets } = $props();

	const classNames = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' };

	// Destiny 2 stat hash → display name (standard + Edge of Fate names)
	const STAT_NAMES = {
		2996146975: 'Mobility',
		392767087: 'Resilience',
		1943323491: 'Recovery',
		1735777505: 'Discipline',
		144602215: 'Intellect',
		4244567218: 'Strength',
		// Edge of Fate renames
		3897515592: 'Weapons',
		2223994109: 'Health',
		3596744046: 'Class',
		3022375125: 'Grenade',
		2285636663: 'Super',
		2961038739: 'Melee'
	};

	// Selected ability/aspect/fragment for center inspection
	let selectedAbility = $state(null);

	function selectAbility(item) {
		selectedAbility = selectedAbility?.name === item?.name ? null : item;
	}

	// Subclass theming
	const subclassColor = $derived(
		(() => {
			const n = (eq.subclass?.name ?? '').toLowerCase();
			if (n.includes('void')) return 'rgba(109,40,217,0.15)';
			if (n.includes('solar')) return 'rgba(234,88,12,0.15)';
			if (n.includes('arc')) return 'rgba(8,145,178,0.15)';
			if (n.includes('stasis')) return 'rgba(29,78,216,0.15)';
			if (n.includes('strand')) return 'rgba(5,150,105,0.15)';
			if (n.includes('prismatic')) return 'rgba(219,39,119,0.15)';
			return 'rgba(16,185,129,0.07)';
		})()
	);

	const subclassEl = $derived(
		(() => {
			const n = (eq.subclass?.name ?? '').toLowerCase();
			if (n.includes('void'))
				return {
					border: 'border-violet-500/50',
					glow: 'shadow-[0_0_20px_rgba(139,92,246,0.25)]',
					text: 'text-violet-400',
					bar: 'bg-violet-500'
				};
			if (n.includes('solar'))
				return {
					border: 'border-orange-500/50',
					glow: 'shadow-[0_0_20px_rgba(249,115,22,0.25)]',
					text: 'text-orange-400',
					bar: 'bg-orange-500'
				};
			if (n.includes('arc'))
				return {
					border: 'border-cyan-400/50',
					glow: 'shadow-[0_0_20px_rgba(34,211,238,0.25)]',
					text: 'text-cyan-400',
					bar: 'bg-cyan-400'
				};
			if (n.includes('stasis'))
				return {
					border: 'border-blue-500/50',
					glow: 'shadow-[0_0_20px_rgba(59,130,246,0.25)]',
					text: 'text-blue-400',
					bar: 'bg-blue-500'
				};
			if (n.includes('strand'))
				return {
					border: 'border-emerald-500/50',
					glow: 'shadow-[0_0_20px_rgba(16,185,129,0.25)]',
					text: 'text-emerald-400',
					bar: 'bg-emerald-500'
				};
			return { border: 'border-zinc-600/50', glow: '', text: 'text-zinc-400', bar: 'bg-zinc-500' };
		})()
	);

	function abilityTypeLabel(t) {
		const n = (t ?? '').toLowerCase();
		if (n.includes('movement') || n.includes('jump')) return 'Jump';
		if (n.includes('melee')) return 'Melee';
		if (n.includes('grenade')) return 'Grenade';
		if (n.includes('class')) return 'Class';
		return t ?? '';
	}
</script>

<!-- ── Subclass Layout ────────────────────────────────────────────────────── -->
<div class="mx-auto max-w-6xl px-4 py-10">
	<div class="grid grid-cols-12 items-start gap-8">
		<!-- ── COL 1: SUPER + SUBCLASS ICON ─────────────────────────────── -->
		<div class="col-span-3 flex flex-col items-center space-y-8">
			<!-- Subclass diamond -->
			<div class="flex w-full flex-col items-center">
				<div class="relative mx-auto flex h-24 w-24 items-center justify-center">
					<div
						class="absolute inset-0 animate-pulse rounded-full blur-3xl"
						style="background:{subclassColor}"
					></div>
					{#if eq.subclass?.icon}
						<div
							class="h-20 w-20 border-2 bg-[#0a0a0a] {subclassEl.border} {subclassEl.glow}
                                    flex rotate-45 items-center justify-center overflow-hidden shadow-2xl"
						>
							<img
								src={eq.subclass.icon}
								alt=""
								class="h-16 w-16 scale-110 -rotate-45 object-cover"
							/>
						</div>
					{:else}
						<div
							class="flex h-20 w-20 rotate-45 items-center justify-center border-2
                                    border-zinc-800 bg-[#0a0a0a] shadow-2xl"
						>
							<div class="flex h-10 w-10 items-center justify-center border border-emerald-400/60">
								<div class="h-2 w-2 bg-emerald-500"></div>
							</div>
						</div>
					{/if}
				</div>
				<div class="mt-5 w-full text-center">
					<span class="mb-1 block text-[10px] font-medium tracking-wider text-zinc-600 uppercase"
						>Subclass</span
					>
					<p class="text-sm font-semibold {subclassEl.text}">
						{eq.subclass?.name ?? '—'}
					</p>
					<p class="mt-0.5 text-xs text-zinc-600">
						{classNames[char?.classType] ?? 'Guardian'}
					</p>
				</div>
			</div>

			<!-- Super ability slot -->
			<div class="w-full border-t border-zinc-800/40 pt-6">
				<span class="mb-4 block text-[10px] font-medium tracking-wider text-zinc-500 uppercase"
					>Super</span
				>
				{#if sockets?.super}
					<button
						onclick={() => selectAbility(sockets.super)}
						class="group flex w-full flex-col items-center gap-3 text-left
                                   transition-all duration-200"
					>
						<div
							class="relative mx-auto h-20 w-20 overflow-hidden border bg-[#0c0c0c]
                                    shadow-[inset_0_0_15px_rgba(0,0,0,0.5)] transition-all duration-300
                                    {selectedAbility?.name === sockets.super.name
								? 'border-emerald-500/70 shadow-[0_0_14px_rgba(52,211,153,0.2)]'
								: subclassEl.border.replace('/50', '/30') + ' group-hover:' + subclassEl.border}"
						>
							<div
								class="absolute top-0 left-0 h-px w-full {subclassEl.bar} pointer-events-none opacity-70"
							></div>
							{#if sockets.super.icon}
								<img src={sockets.super.icon} alt="" class="h-full w-full object-cover" />
							{:else}
								<div class="flex h-full w-full items-center justify-center opacity-10">
									<div class="h-10 w-10 rotate-45 border border-zinc-500"></div>
								</div>
							{/if}
						</div>
						<div class="w-full text-center">
							<p class="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">Super</p>
							<p
								class="mt-0.5 text-sm leading-tight font-semibold transition-colors
                                      {selectedAbility?.name === sockets.super.name
									? 'text-emerald-400'
									: 'text-zinc-200 group-hover:text-white'}"
							>
								{sockets.super.name}
							</p>
						</div>
					</button>
				{:else}
					<div
						class="mx-auto flex h-20 w-20 items-center justify-center border border-zinc-800 bg-[#0c0c0c] opacity-20"
					>
						<div class="h-10 w-10 rotate-45 border border-zinc-500"></div>
					</div>
				{/if}
			</div>
		</div>

		<!-- ── COL 2: CENTER — ABILITIES + INSPECTION ─────────────────────── -->
		<div class="relative col-span-6 flex min-h-[500px] flex-col items-center gap-8">
			<!-- Abilities row -->
			<div class="w-full">
				<span class="mb-4 block text-[10px] font-medium tracking-wider text-zinc-500 uppercase"
					>Abilities</span
				>
				<div class="grid grid-cols-4 gap-4">
					{#each sockets?.abilities ?? [] as ability}
						{@const isActive = selectedAbility?.name === ability.name}
						<button
							onclick={() => selectAbility(ability)}
							class="group flex w-full flex-col items-center gap-2 text-left transition-all"
						>
							<div
								class="relative mx-auto h-16 w-16 overflow-hidden border bg-[#0c0c0c]
                                        shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] transition-all duration-300
                                        {isActive
									? 'border-emerald-500/70 shadow-[0_0_10px_rgba(52,211,153,0.15)]'
									: subclassEl.border.replace('/50', '/20') + ' group-hover:' + subclassEl.border}"
							>
								<div class="absolute top-0 left-0 h-px w-full {subclassEl.bar} opacity-50"></div>
								{#if ability.icon}
									<img src={ability.icon} alt="" class="h-full w-full object-cover" />
								{:else}
									<div class="flex h-full w-full items-center justify-center opacity-10">
										<div class="h-8 w-8 rotate-45 border border-zinc-500"></div>
									</div>
								{/if}
								{#if !ability.isEnabled}
									<div class="absolute inset-0 bg-black/60"></div>
								{/if}
							</div>
							<div class="text-center">
								<p
									class="text-[10px] font-medium tracking-wider uppercase
                                          {isActive ? 'text-emerald-400' : subclassEl.text}"
								>
									{abilityTypeLabel(ability.itemTypeDisplayName)}
								</p>
								<p
									class="mt-0.5 text-xs leading-tight font-semibold transition-colors
                                          {isActive
										? 'text-emerald-300'
										: 'text-zinc-300 group-hover:text-white'}"
								>
									{ability.name}
								</p>
							</div>
						</button>
					{/each}
					<!-- Empty ability slots -->
					{#each Array(Math.max(0, 4 - (sockets?.abilities?.length ?? 0))) as _}
						<div class="flex flex-col items-center gap-2">
							<div
								class="flex h-16 w-16 items-center justify-center border border-dashed border-zinc-800 opacity-20"
							>
								<div class="h-8 w-8 rotate-45 border border-zinc-700 opacity-50"></div>
							</div>
							<p class="text-xs text-zinc-800">Empty</p>
						</div>
					{/each}
				</div>
			</div>

			<!-- Inspection panel / Decorative center -->
			<div class="relative w-full flex-1">
				{#if selectedAbility}
					<!-- Ability / Fragment / Aspect inspection -->
					<div class="relative w-full overflow-hidden border border-zinc-800 bg-[#0a0a0a]">
						<span
							class="pointer-events-none absolute top-0 left-0 z-10 h-3 w-3 border-t border-l border-emerald-500/40"
						></span>
						<span
							class="pointer-events-none absolute right-0 bottom-0 z-10 h-3 w-3 border-r border-b border-emerald-500/40"
						></span>

						<!-- Close -->
						<button
							onclick={() => (selectedAbility = null)}
							class="absolute top-3 right-3 z-20 flex h-6
                                       w-6 items-center justify-center border border-zinc-800 text-zinc-600 transition-colors hover:border-zinc-600 hover:text-zinc-300"
						>
							<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M6 18L18 6M6 6l12 12"
								/>
							</svg>
						</button>

						<!-- Header -->
						<div class="flex items-center gap-4 border-b border-zinc-800 p-5">
							{#if selectedAbility.icon}
								<div class="h-16 w-16 shrink-0 border {subclassEl.border} relative overflow-hidden">
									<div class="absolute top-0 left-0 h-px w-full {subclassEl.bar} opacity-60"></div>
									<img src={selectedAbility.icon} alt="" class="h-full w-full object-cover" />
								</div>
							{/if}
							<div class="min-w-0 flex-1">
								<span
									class="text-[10px] font-medium tracking-wider uppercase {subclassEl.text} mb-1 block"
								>
									{selectedAbility.itemTypeDisplayName ?? 'Ability'}
								</span>
								<p class="font-serif text-xl leading-tight font-light text-white italic">
									{selectedAbility.name}
								</p>
							</div>
						</div>

						<!-- Description + stat bonuses -->
						<div class="space-y-4 p-5">
							{#if selectedAbility.description || selectedAbility.perkDescription || selectedAbility.flavorText}
								<p class="text-sm leading-relaxed text-zinc-400">
									{selectedAbility.description ||
										selectedAbility.perkDescription ||
										selectedAbility.flavorText}
								</p>
							{:else}
								<p class="text-sm text-zinc-600 italic">No description available.</p>
							{/if}

							<!-- Stat bonuses — show name + value -->
							{#if selectedAbility.statBonuses?.length}
								<div class="border-t border-zinc-800/60 pt-4">
									<span
										class="mb-3 block text-[10px] font-medium tracking-wider text-zinc-500 uppercase"
									>
										Stat Changes
									</span>
									<div class="flex flex-wrap gap-2">
										{#each selectedAbility.statBonuses as sb}
											{@const statName = STAT_NAMES[sb.statHash] ?? 'Stat ' + sb.statHash}
											<div
												class="flex items-center gap-1.5 border px-2.5 py-1.5
                                                         {sb.value > 0
													? 'border-emerald-500/30 bg-emerald-500/5'
													: 'border-red-500/30 bg-red-500/5'}"
											>
												<span
													class="text-sm font-bold
                                                             {sb.value > 0
														? 'text-emerald-400'
														: 'text-red-400'}"
												>
													{sb.value > 0 ? '+' : ''}{sb.value}
												</span>
												<span class="text-xs font-medium text-zinc-400">{statName}</span>
											</div>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					</div>
				{:else}
					<!-- Decorative idle -->
					<div
						class="relative flex h-48 w-full items-center justify-center border border-zinc-800/40"
					>
						<div
							class="pointer-events-none absolute inset-0 opacity-30 blur-3xl"
							style="background:linear-gradient(to top,{subclassColor},transparent)"
						></div>
						<p class="relative text-xs font-medium tracking-widest text-zinc-700 uppercase">
							Select a slot to inspect
						</p>
						<div class="absolute top-0 left-0 h-6 w-6 border-t border-l border-zinc-800"></div>
						<div class="absolute right-0 bottom-0 h-6 w-6 border-r border-b border-zinc-800"></div>
					</div>
				{/if}
			</div>
		</div>

		<!-- ── COL 3: ASPECTS + FRAGMENTS ─────────────────────────────────── -->
		<div class="col-span-3 flex flex-col items-center space-y-8">
			<!-- Aspects -->
			<div class="w-full">
				<span class="mb-4 block text-[10px] font-medium tracking-wider text-zinc-500 uppercase"
					>Aspects</span
				>
				<div class="flex flex-col items-center gap-5">
					{#each sockets?.aspects ?? [] as aspect}
						{@const isActive = selectedAbility?.name === aspect.name}
						<button
							onclick={() => selectAbility(aspect)}
							class="group flex w-full flex-col items-center gap-2 text-left transition-all"
						>
							<div
								class="relative mx-auto h-20 w-20 overflow-hidden border bg-[#0c0c0c]
                                        shadow-[inset_0_0_15px_rgba(0,0,0,0.5)] transition-all duration-300
                                        {isActive
									? 'border-emerald-500/70 shadow-[0_0_14px_rgba(52,211,153,0.2)]'
									: subclassEl.border.replace('/50', '/20') + ' group-hover:' + subclassEl.border}"
							>
								<div
									class="absolute top-0 left-0 h-px w-full {subclassEl.bar} pointer-events-none opacity-60"
								></div>
								{#if aspect.icon}
									<img src={aspect.icon} alt="" class="h-full w-full object-cover" />
								{:else}
									<div class="flex h-full w-full items-center justify-center opacity-10">
										<div class="h-10 w-10 rotate-45 border border-zinc-500"></div>
									</div>
								{/if}
							</div>
							<div class="w-full text-center">
								<p class="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">Aspect</p>
								<p
									class="mt-0.5 text-xs leading-tight font-semibold transition-colors
                                          {isActive
										? 'text-emerald-400'
										: 'text-zinc-200 group-hover:text-white'}"
								>
									{aspect.name}
								</p>
							</div>
						</button>
					{/each}
					<!-- Empty aspect slots -->
					{#each Array(Math.max(0, 2 - (sockets?.aspects?.length ?? 0))) as _}
						<div class="flex flex-col items-center gap-2 opacity-20">
							<div
								class="flex h-20 w-20 items-center justify-center border border-dashed border-zinc-700"
							>
								<div class="h-8 w-8 rotate-45 border border-zinc-600"></div>
							</div>
							<p class="text-xs text-zinc-700">Empty</p>
						</div>
					{/each}
				</div>
			</div>

			<!-- Fragments -->
			<div class="w-full border-t border-zinc-800/40 pt-6">
				<div class="mb-4 flex items-center justify-between">
					<span class="text-[10px] font-medium tracking-wider text-zinc-500 uppercase"
						>Fragments</span
					>
					<span class="text-[10px] text-zinc-600">
						{sockets?.fragments?.length ?? 0} equipped
					</span>
				</div>
				<!-- 2-column grid so full names can display without truncation -->
				<div class="grid grid-cols-2 gap-2">
					{#each sockets?.fragments ?? [] as frag}
						{@const isActive = selectedAbility?.name === frag.name}
						<button
							onclick={() => selectAbility(frag)}
							class="group flex flex-col items-center gap-1.5 transition-all"
						>
							<div
								class="relative h-14 w-14 overflow-hidden border bg-[#0c0c0c]
                                        shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] transition-all duration-200
                                        {isActive
									? 'border-emerald-500/60'
									: subclassEl.border.replace('/50', '/15') +
										' group-hover:' +
										subclassEl.border.replace('/50', '/40')}"
							>
								<div class="absolute top-0 left-0 h-px w-full {subclassEl.bar} opacity-40"></div>
								{#if frag.icon}
									<img src={frag.icon} alt="" class="h-full w-full object-cover" />
								{:else}
									<div class="flex h-full w-full items-center justify-center opacity-10">
										<div class="h-6 w-6 rotate-45 border border-zinc-500"></div>
									</div>
								{/if}
							</div>
							<!-- Full name — wraps to 2 lines, no truncation -->
							<p
								class="line-clamp-2 w-full px-0.5 text-center text-[9px] leading-tight font-medium
                                      transition-colors
                                      {isActive
									? 'text-emerald-400'
									: 'text-zinc-500 group-hover:text-zinc-300'}"
							>
								{frag.name}
							</p>
						</button>
					{/each}
					<!-- Empty fragment slots -->
					{#each Array(Math.max(0, 5 - (sockets?.fragments?.length ?? 0))) as _}
						<div class="flex flex-col items-center gap-1.5 opacity-15">
							<div
								class="flex h-14 w-14 items-center justify-center border border-dashed border-zinc-700"
							>
								<div class="h-5 w-5 rotate-45 border border-zinc-600"></div>
							</div>
							<p class="text-[9px] text-zinc-800">—</p>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>
</div>
