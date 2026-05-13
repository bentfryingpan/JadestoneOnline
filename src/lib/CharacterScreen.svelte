<script>
	let { char, eq, armorStatMeta = [], artifact = null } = $props();

	const TIER_LABEL = { 6: 'Exotic', 5: 'Legendary', 4: 'Rare', 3: 'Uncommon', 2: 'Common' };
	const classNames = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' };
	const damageLabel = { 1: 'Kinetic', 2: 'Arc', 3: 'Solar', 4: 'Void', 6: 'Stasis', 7: 'Strand' };
	const damageColor = {
		1: 'text-zinc-400',
		2: 'text-cyan-400',
		3: 'text-orange-400',
		4: 'text-violet-400',
		6: 'text-blue-400',
		7: 'text-emerald-400'
	};

	// ── Inspection state ───────────────────────────────────────────────────────
	let selectedSlot = $state(null);

	const selectedItem = $derived(selectedSlot ? (eq[selectedSlot] ?? null) : null);
	const selectedType = $derived(
		(() => {
			if (!selectedSlot) return null;
			if (selectedSlot === 'subclass') return 'subclass';
			if (['kinetic', 'energy', 'power'].includes(selectedSlot)) return 'weapon';
			return 'armor';
		})()
	);

	function selectSlot(key) {
		selectedSlot = selectedSlot === key ? null : key;
	}

	// ── Armor stat totals ──────────────────────────────────────────────────────
	const totalStats = $derived(
		(() => {
			if (!armorStatMeta.length) return {};
			const slots = ['helmet', 'gauntlets', 'chest', 'legs', 'classItem'];
			const totals = {};
			for (const m of armorStatMeta) totals[m.name] = 0;
			for (const slot of slots) {
				const item = eq[slot];
				if (item?.armorStats) for (const s of item.armorStats) totals[s.name] += s.value;
			}
			return totals;
		})()
	);

	const grandTotal = $derived(Object.values(totalStats).reduce((a, b) => a + b, 0));
	const buildTier = $derived((grandTotal / 10).toFixed(1));

	// ── Stat name → hash lookup (for mod stat bonus labels) ───────────────────
	const statHashToName = $derived(
		Object.fromEntries((armorStatMeta ?? []).map((s) => [s.hash, s.name]))
	);

	// ── FATE zone: primary-zone caps + computed secondary-zone bonuses ───────────
	// All secondary benefits scale linearly 101→200 (bonus = stat − 100, max 100).
	const FATE_PRIMARY = {
		Weapons: 'T10 (100): Max weapon handling · fastest ready/stow · optimal stability',
		Health: 'T10 (100): 40% damage reduction in PvE · fastest shield regen',
		Class: 'T10 (100): Fastest class ability cooldown',
		Grenade: 'T10 (100): ~32 s grenade cooldown',
		Super: 'T10 (100): Fastest passive Super regen',
		Melee: 'T10 (100): ~32 s melee ability cooldown',
		// Legacy names (Edge of Fate renames these stats)
		Mobility: 'T10 (100): Max weapon handling · fastest ready/stow · optimal stability',
		Resilience: 'T10 (100): 40% damage reduction in PvE',
		Recovery: 'T10 (100): Fastest class ability cooldown',
		Discipline: 'T10 (100): ~32 s grenade cooldown',
		Intellect: 'T10 (100): Fastest passive Super regen',
		Strength: 'T10 (100): ~32 s melee cooldown'
	};

	// Returns an array of { label, value } lines computed from points-above-100.
	// Scaling sourced from Edge of Fate datamining; linear between 101–200.
	function calcFateBonuses(statName, bonus) {
		const b = Math.min(Math.max(bonus, 0), 100); // clamp 0–100
		const pct = (max, dp = 1) => ((b / 100) * max).toFixed(dp) + '%';
		const hp = (max) => ((b / 100) * max).toFixed(1) + ' HP';
		switch (statName) {
			// Weapons / Mobility
			case 'Weapons':
			case 'Mobility':
				return [
					{ label: 'Primary/Special vs bosses (PvE)', value: '+' + pct(15, 1) },
					{ label: 'Heavy vs bosses (PvE)', value: '+' + pct(10, 1) },
					{ label: 'Guardian damage (PvP)', value: '+' + pct(6, 1) },
					{ label: 'Double ammo pickup (at 200)', value: pct(100, 0) }
				];
			// Health / Resilience
			case 'Health':
			case 'Resilience':
				return [
					{ label: 'Extra shield HP (PvE)', value: hp(20) },
					{ label: 'Shield recharge speed', value: '+' + pct(50, 0) }
				];
			// Class / Recovery
			case 'Class':
			case 'Recovery':
				return [{ label: 'Overshield on class ability', value: hp(40) }];
			// Grenade / Discipline
			case 'Grenade':
			case 'Discipline':
				return [
					{ label: 'Grenade damage (PvE)', value: '+' + pct(65, 1) },
					{ label: 'Grenade damage (PvP)', value: '+' + pct(20, 1) }
				];
			// Super / Intellect
			case 'Super':
			case 'Intellect':
				return [
					{ label: 'Super damage (PvE)', value: '+' + pct(45, 1) },
					{ label: 'Super damage (PvP)', value: '+' + pct(15, 1) }
				];
			// Melee / Strength
			case 'Melee':
			case 'Strength':
				return [
					{ label: 'Melee damage (PvE)', value: '+' + pct(30, 1) },
					{ label: 'Melee damage (PvP)', value: '+' + pct(20, 1) }
				];
			default:
				return [];
		}
	}

	// ── Subclass theming ───────────────────────────────────────────────────────
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
					glow: 'shadow-[0_0_20px_rgba(139,92,246,0.3)]',
					text: 'text-violet-400'
				};
			if (n.includes('solar'))
				return {
					border: 'border-orange-500/50',
					glow: 'shadow-[0_0_20px_rgba(249,115,22,0.3)]',
					text: 'text-orange-400'
				};
			if (n.includes('arc'))
				return {
					border: 'border-cyan-400/50',
					glow: 'shadow-[0_0_20px_rgba(34,211,238,0.3)]',
					text: 'text-cyan-400'
				};
			if (n.includes('stasis'))
				return {
					border: 'border-blue-500/50',
					glow: 'shadow-[0_0_20px_rgba(59,130,246,0.3)]',
					text: 'text-blue-400'
				};
			if (n.includes('strand'))
				return {
					border: 'border-emerald-500/50',
					glow: 'shadow-[0_0_20px_rgba(16,185,129,0.3)]',
					text: 'text-emerald-400'
				};
			return { border: 'border-zinc-600/50', glow: '', text: 'text-zinc-400' };
		})()
	);
</script>

<!-- ── Gear Item Slot ─────────────────────────────────────────────────────────
     Snippet used for weapons and armor.
     key: slot key in eq, label: display label, item: eq[key]
────────────────────────────────────────────────────────────────────────────── -->
<!-- Tier diamond colors: exotic=amber, legendary=violet, rare=blue, uncommon=green -->
{#snippet TierDiamond(tierType)}
	{@const c =
		tierType === 6
			? 'border-amber-400  bg-amber-400/20  shadow-[0_0_6px_rgba(251,191,36,0.5)]'
			: tierType === 5
				? 'border-violet-400 bg-violet-400/20 shadow-[0_0_6px_rgba(167,139,250,0.4)]'
				: tierType === 4
					? 'border-blue-400   bg-blue-400/20'
					: tierType === 3
						? 'border-green-400  bg-green-400/20'
						: 'border-zinc-600   bg-zinc-800'}
	<div class="h-3 w-3 rotate-45 border {c} transition-all duration-300"></div>
{/snippet}

{#snippet GearSlot(key, label)}
	{@const item = eq[key]}
	{@const exotic = item?.tierType === 6}
	{@const mw = item?.masterwork ?? false}
	{@const isActive = selectedSlot === key}
	{@const tierCount = item?.tierType ?? 0}
	{@const tierColor =
		item?.tierType === 6
			? 'bg-amber-400'
			: item?.tierType === 5
				? 'bg-violet-400'
				: item?.tierType === 4
					? 'bg-blue-400'
					: item?.tierType === 3
						? 'bg-green-400'
						: 'bg-zinc-400'}
	<button
		onclick={() => selectSlot(key)}
		class="group flex w-full flex-col items-center gap-1 text-left transition-all"
	>
		<div
			class="relative mx-auto h-14 w-14 overflow-hidden border
                    bg-[#0c0c0c] shadow-[inset_0_0_15px_rgba(0,0,0,0.5)] transition-all
                    duration-300
                    {isActive
				? 'border-emerald-500/70 shadow-[0_0_14px_rgba(52,211,153,0.2)]'
				: mw && !exotic
					? 'border-yellow-400/60 shadow-[0_0_12px_rgba(234,179,8,0.22)] group-hover:border-yellow-300'
					: exotic
						? 'border-amber-500/40 group-hover:border-amber-500/70'
						: 'border-zinc-800 group-hover:border-zinc-600'}"
		>
			<!-- Top rarity bar -->
			<div
				class="absolute top-0 left-0 z-10 h-[2px] w-full
                        {mw && !exotic
					? 'bg-gradient-to-r from-yellow-600 via-yellow-200 to-yellow-600'
					: exotic
						? 'bg-amber-400'
						: 'bg-zinc-100 opacity-20'}"
			></div>
			<!-- Item icon -->
			{#if item?.icon}
				<img src={item.icon} alt="" class="h-full w-full object-cover" />
				<!-- Seasonal / DLC watermark overlay (same size as icon) -->
				{#if item?.iconWatermark}
					<img
						src={item.iconWatermark}
						alt=""
						class="pointer-events-none absolute inset-0 z-10 h-full w-full object-cover"
					/>
				{/if}
			{:else}
				<div class="flex h-full w-full items-center justify-center opacity-10">
					<div class="h-6 w-6 rotate-45 border border-zinc-500"></div>
				</div>
			{/if}
			<!-- Tier diamonds — vertical strip overlaid on right edge -->
			{#if item && tierCount > 0}
				<div
					class="absolute top-0 right-0 bottom-0 z-10 flex flex-col items-center justify-center gap-[3px] bg-gradient-to-l
                            from-black/70 to-transparent px-[3px]"
				>
					{#if item.tierType === 6}
						<!-- Exotic: single large glowing amber diamond -->
						<div
							class="h-[7px] w-[7px] shrink-0 rotate-45 bg-amber-400
                                    shadow-[0_0_6px_rgba(251,191,36,0.9)]"
						></div>
					{:else}
						{#each { length: Math.min(tierCount, 5) } as _}
							<div class="h-[5px] w-[5px] shrink-0 rotate-45 {tierColor}"></div>
						{/each}
					{/if}
				</div>
			{/if}
			<!-- Selected outline -->
			{#if isActive}
				<div class="pointer-events-none absolute inset-0 border border-emerald-500/30"></div>
			{/if}
		</div>
		<div class="mt-1 w-full text-center">
			<p class="text-[9px] leading-none font-medium tracking-wider text-zinc-600 uppercase">
				{label}
			</p>
			<p
				class="mt-0.5 truncate px-1 text-[10px] font-semibold transition-colors
                      {isActive ? 'text-emerald-400' : 'text-zinc-200 group-hover:text-white'}"
			>
				{item?.name ?? '—'}
			</p>
		</div>
	</button>
{/snippet}

<!-- ── Perk snippets ─────────────────────────────────────────────────────────── -->
{#snippet PerkRow(perk)}
	<div class="group/perk flex items-start gap-2.5 border-b border-zinc-800/40 py-2 last:border-0">
		<div
			class="relative h-8 w-8 shrink-0 overflow-hidden border
                    {perk.isIntrinsic
				? 'border-amber-500/40 bg-amber-500/5'
				: perk.isMasterwork
					? 'border-yellow-400/30 bg-yellow-500/5'
					: 'border-zinc-800 group-hover/perk:border-zinc-600'}"
		>
			{#if perk.icon}<img src={perk.icon} alt="" class="h-full w-full object-cover" />
			{:else}<div class="flex h-full w-full items-center justify-center opacity-20">
					<div class="h-3 w-3 rotate-45 border border-zinc-500"></div>
				</div>{/if}
			{#if !perk.isEnabled}<div class="absolute inset-0 bg-black/60"></div>{/if}
		</div>
		<div class="min-w-0 flex-1">
			<div class="mb-0.5 flex items-center gap-1.5">
				<span
					class="font-mono text-[9px] font-bold tracking-wide uppercase
                             {perk.isIntrinsic
						? 'text-amber-400'
						: perk.isMasterwork
							? 'text-yellow-400'
							: 'text-zinc-200'}"
				>
					{perk.name}
				</span>
			</div>
			{#if perk.description}
				<p class="line-clamp-2 font-sans text-[8px] leading-relaxed text-zinc-500">
					{perk.description}
				</p>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet PerkIcon(perk)}
	<div
		class="group/perk relative flex cursor-default items-center gap-2 border
                border-zinc-800/60 p-1.5 transition-colors hover:border-zinc-700"
	>
		<div class="relative h-7 w-7 shrink-0 overflow-hidden border border-zinc-800">
			{#if perk.icon}<img src={perk.icon} alt="" class="h-full w-full object-cover" />
			{:else}<div class="flex h-full w-full items-center justify-center opacity-10">
					<div class="h-3 w-3 rotate-45 border border-zinc-600"></div>
				</div>{/if}
			{#if !perk.isEnabled}<div class="absolute inset-0 bg-black/50"></div>{/if}
		</div>
		<span class="flex-1 truncate font-mono text-[8px] leading-tight text-zinc-400">{perk.name}</span
		>
		<!-- Mini tooltip -->
		{#if perk.description}
			<div
				class="pointer-events-none absolute bottom-full left-0 z-50 mb-1 w-48
                        translate-y-1 opacity-0 transition-all duration-150
                        group-hover/perk:translate-y-0 group-hover/perk:opacity-100"
			>
				<div class="border border-zinc-700 bg-[#141414] p-2 shadow-[0_0_16px_rgba(0,0,0,0.8)]">
					<p class="mb-1 font-mono text-[8px] font-bold text-zinc-200">{perk.name}</p>
					<p class="font-sans text-[7px] leading-relaxed text-zinc-500">{perk.description}</p>
				</div>
			</div>
		{/if}
	</div>
{/snippet}

{#snippet TraitCard(perk)}
	<div
		class="group/trait relative cursor-default border transition-all duration-200
                {perk.isEnhanced
			? 'border-yellow-500/40 bg-yellow-500/5 hover:border-yellow-400/70 hover:shadow-[0_0_12px_rgba(234,179,8,0.2)]'
			: 'border-zinc-800 hover:border-zinc-600'}
                {!perk.isEnabled ? 'opacity-50' : ''}"
	>
		<!-- Enhanced indicator bar -->
		{#if perk.isEnhanced}
			<div
				class="absolute top-0 left-0 h-px w-full bg-gradient-to-r from-yellow-500/60 via-yellow-300/40 to-transparent"
			></div>
		{/if}
		<div class="flex items-start gap-2 p-2">
			<div class="relative h-8 w-8 shrink-0 overflow-hidden">
				{#if perk.icon}
					<img src={perk.icon} alt="" class="h-full w-full object-cover" />
					{#if perk.isEnhanced}
						<!-- Gold overlay shimmer for enhanced -->
						<div
							class="pointer-events-none absolute inset-0"
							style="background:radial-gradient(ellipse at top left,rgba(234,179,8,0.25) 0%,transparent 70%)"
						></div>
					{/if}
				{/if}
				{#if !perk.isEnabled}<div class="absolute inset-0 bg-black/60"></div>{/if}
			</div>
			<div class="min-w-0 flex-1">
				<div class="mb-0.5 flex items-center gap-1">
					<span
						class="font-mono text-[9px] leading-tight font-bold tracking-wide uppercase
                                 {perk.isEnhanced ? 'text-yellow-300' : 'text-zinc-200'}"
					>
						{perk.name}
					</span>
					{#if perk.isEnhanced}
						<span
							class="shrink-0 border border-yellow-500/30 px-1 py-px font-mono text-[6px] leading-none font-bold text-yellow-500"
							>ENH</span
						>
					{/if}
				</div>
				<p class="line-clamp-3 font-sans text-[7px] leading-relaxed text-zinc-600">
					{perk.description ?? ''}
				</p>
			</div>
		</div>
		<!-- Stat bonus chips -->
		{#if perk.statBonuses?.length}
			<div class="flex flex-wrap gap-1 px-2 pb-1.5">
				{#each perk.statBonuses as sb}
					<span
						class="border border-emerald-500/20 px-1 py-px font-mono text-[6px] text-emerald-500"
					>
						+{sb.value}
						{statHashToName[sb.statHash] ?? ''}
					</span>
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

<!-- ── Main Layout ─────────────────────────────────────────────────────────── -->
<div class="mx-auto max-w-6xl px-4 py-10">
	<div class="grid grid-cols-12 items-start gap-6">
		<!-- ── COL 1: SUBCLASS + WEAPONS ──────────────────────────────────── -->
		<div class="col-span-2 flex flex-col items-center space-y-8">
			<!-- Subclass slot -->
			<button
				onclick={() => selectSlot('subclass')}
				class="group flex w-full cursor-pointer flex-col items-center text-left"
			>
				<div class="relative mx-auto flex h-16 w-16 items-center justify-center">
					<!-- Ambient glow -->
					<div
						class="absolute inset-0 animate-pulse rounded-full blur-3xl"
						style="background:{subclassColor}"
					></div>
					<!-- Diamond frame -->
					{#if eq.subclass?.icon}
						<div
							class="flex h-14 w-14 rotate-45 items-center justify-center overflow-hidden
                                    border-2 bg-[#0a0a0a] shadow-2xl transition-all duration-500
                                    {selectedSlot === 'subclass'
								? 'rotate-90 border-emerald-500/80 shadow-[0_0_20px_rgba(52,211,153,0.25)]'
								: subclassEl.border + ' ' + subclassEl.glow + ' group-hover:rotate-90'}"
						>
							<img
								src={eq.subclass.icon}
								alt=""
								class="h-10 w-10 scale-110 object-cover transition-all duration-500
                                        {selectedSlot === 'subclass'
									? '-rotate-90'
									: '-rotate-45 group-hover:-rotate-90'}"
							/>
						</div>
					{:else}
						<div
							class="flex h-14 w-14 rotate-45 items-center justify-center border-2
                                    border-zinc-800 bg-[#0a0a0a] shadow-2xl transition-all duration-700 group-hover:rotate-90
                                    {selectedSlot === 'subclass' ? 'border-emerald-500/60' : ''}"
						>
							<div class="flex h-7 w-7 items-center justify-center border border-emerald-400/60">
								<div class="h-1.5 w-1.5 bg-emerald-500"></div>
							</div>
						</div>
					{/if}
				</div>
				<div class="mt-4 w-full text-center">
					<span class="mb-0.5 block text-[9px] font-medium text-zinc-600">Subclass</span>
					<p
						class="truncate text-[10px] font-semibold transition-colors
                              {selectedSlot === 'subclass' ? 'text-emerald-400' : subclassEl.text}"
					>
						{eq.subclass?.name ?? '—'}
					</p>
				</div>
			</button>

			<!-- Weapons -->
			<div class="flex w-full flex-col items-center space-y-6 border-t border-zinc-800/40 pt-6">
				{@render GearSlot('kinetic', 'KINETIC')}
				{@render GearSlot('energy', 'ENERGY')}
				{@render GearSlot('power', 'POWER')}
			</div>
		</div>

		<!-- ── COL 2: CENTER — DECORATIVE / INSPECTION ────────────────────── -->
		<div class="relative col-span-8 flex min-h-[520px] items-center justify-center">
			{#if selectedSlot && selectedItem}
				{@const hdrTierCount =
					selectedItem.tierType === 6 ? 1 : Math.max(0, (selectedItem.tierType ?? 1) - 1)}
				{@const hdrTierColor =
					selectedItem.tierType === 6
						? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]'
						: selectedItem.tierType === 5
							? 'bg-violet-500'
							: selectedItem.tierType === 4
								? 'bg-blue-400'
								: selectedItem.tierType === 3
									? 'bg-green-400'
									: 'bg-zinc-400'}
				<!-- ── INSPECTION PANEL ──────────────────────────────────── -->
				<div
					class="relative flex h-[580px] w-full flex-col overflow-hidden border border-zinc-800 bg-[#0a0a0a]"
				>
					<!-- Corner accents -->
					<span
						class="pointer-events-none absolute top-0 left-0 z-10 h-3 w-3 border-t border-l border-emerald-500/40"
					></span>
					<span
						class="pointer-events-none absolute right-0 bottom-0 z-10 h-3 w-3 border-r border-b border-emerald-500/40"
					></span>

					<!-- Close button -->
					<button
						onclick={() => (selectedSlot = null)}
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

					<!-- ── Item header: full-width screenshot banner ── -->
					<div class="relative h-36 shrink-0 overflow-hidden">
						<!-- Screenshot background -->
						{#if selectedItem.screenshot}
							<img
								src={selectedItem.screenshot}
								alt=""
								class="absolute inset-0 h-full w-full object-cover object-center"
								style="filter:brightness(0.55) saturate(0.85)"
							/>
						{:else if selectedItem.masterwork && selectedType === 'weapon'}
							<div
								class="absolute inset-0"
								style="background:linear-gradient(135deg,rgb(81,48,101),rgb(50,28,65))"
							></div>
						{:else}
							<div class="absolute inset-0 bg-zinc-950"></div>
						{/if}
						<!-- Left-side gradient so text stays readable -->
						<div
							class="absolute inset-0 bg-gradient-to-r from-black/95 via-black/60 to-transparent"
						></div>
						<!-- Bottom tier-colored rule -->
						<div
							class="absolute bottom-0 left-0 h-[2px] w-full
                                    {selectedItem.tierType === 6
								? 'bg-amber-400/70'
								: selectedItem.masterwork && selectedType === 'weapon'
									? 'bg-yellow-400/60'
									: selectedItem.tierType === 5
										? 'bg-violet-500/50'
										: selectedItem.tierType === 4
											? 'bg-blue-400/40'
											: 'bg-zinc-700/60'}"
						></div>

						<!-- Content -->
						<div class="relative flex h-full items-center gap-4 px-5">
							<!-- Icon + watermark + tier diamonds -->
							<div class="flex shrink-0 items-center gap-3">
								<div
									class="relative h-[72px] w-[72px] border shadow-lg
                                            {selectedItem.tierType === 6
										? 'border-amber-500/70'
										: selectedItem.masterwork && selectedType === 'weapon'
											? 'border-yellow-400/60'
											: selectedItem.tierType === 5
												? 'border-violet-500/50'
												: 'border-zinc-600/80'}"
								>
									{#if selectedItem.icon}
										<img src={selectedItem.icon} alt="" class="h-full w-full object-cover" />
										<!-- DLC / seasonal watermark overlaid on icon -->
										{#if selectedItem.iconWatermark}
											<img
												src={selectedItem.iconWatermark}
												alt=""
												class="pointer-events-none absolute inset-0 h-full w-full object-cover"
											/>
										{/if}
									{/if}
								</div>
								<!-- Vertical tier diamonds — in-game style -->
								{#if hdrTierCount > 0}
									<div class="flex flex-col items-center gap-[4px]">
										{#if selectedItem.tierType === 6}
											<!-- Exotic: single prominent diamond -->
											<div class="h-3.5 w-3.5 shrink-0 rotate-45 {hdrTierColor}"></div>
										{:else}
											{#each { length: hdrTierCount } as _}
												<div class="h-2.5 w-2.5 shrink-0 rotate-45 {hdrTierColor}"></div>
											{/each}
										{/if}
									</div>
								{/if}
							</div>

							<!-- Text -->
							<div class="min-w-0 flex-1">
								<span
									class="text-xs font-medium
                                             {selectedItem.tierType === 6
										? 'text-amber-400'
										: selectedItem.masterwork && selectedType === 'weapon'
											? 'text-yellow-300'
											: selectedItem.tierType === 5
												? 'text-violet-400'
												: 'text-zinc-400'}"
								>
									{selectedItem.tierTypeName ?? TIER_LABEL[selectedItem.tierType] ?? '—'}
									{#if selectedItem.itemTypeDisplayName}
										<span class="text-zinc-500"> · {selectedItem.itemTypeDisplayName}</span>
									{/if}
								</span>
								<p
									class="mt-0.5 truncate font-serif text-xl leading-tight font-light text-white italic drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]"
								>
									{selectedItem.name}
								</p>
								{#if selectedType === 'weapon'}
									<div class="mt-1.5 flex items-center gap-3">
										{#if selectedItem.damageType}
											<div class="flex items-center gap-1.5">
												{#if selectedItem.damageTypeIcon}
													<img
														src={selectedItem.damageTypeIcon}
														alt=""
														class="h-4 w-4 object-contain drop-shadow"
													/>
												{/if}
												<span
													class="text-sm font-semibold
                                                             {damageColor[
														selectedItem.damageType
													] ?? 'text-zinc-300'}"
												>
													{selectedItem.damageTypeName ??
														damageLabel[selectedItem.damageType] ??
														''}
												</span>
											</div>
										{/if}
										{#if selectedItem.power}
											<span class="text-sm font-semibold text-zinc-200">
												{selectedItem.power}
												<span class="font-normal text-zinc-500"> PL</span>
											</span>
										{/if}
									</div>
								{/if}
								{#if selectedType === 'armor' && selectedItem.flavorText}
									<p class="mt-1 line-clamp-1 text-xs text-zinc-400 italic drop-shadow">
										{selectedItem.flavorText}
									</p>
								{/if}
								{#if selectedType === 'subclass'}
									<span class="text-sm font-semibold {subclassEl.text}">
										{classNames[char?.classType] ?? 'Guardian'} · Subclass
									</span>
								{/if}
							</div>
						</div>
					</div>

					<!-- Scrollable content -->
					<div class="scrollbar-hide flex-1 space-y-1 overflow-y-auto p-5">
						<!-- ── WEAPON INSPECT (DIM-style layout) ─────────── -->
						{#if selectedType === 'weapon'}
							{@const perks = selectedItem.perks ?? []}
							{@const intrinsic = perks.find((p) => p.isIntrinsic)}
							{@const traits = perks.filter(
								(p) =>
									!p.isIntrinsic &&
									!p.isMasterwork &&
									p.itemTypeDisplayName?.toLowerCase().includes('trait')
							)}
							{@const other = perks.filter(
								(p) =>
									!p.isIntrinsic &&
									!p.isMasterwork &&
									!p.itemTypeDisplayName?.toLowerCase().includes('trait')
							)}
							{@const mwPerk = perks.find((p) => p.isMasterwork)}

							<!-- Aggregate enabled perk stat bonuses per hash -->
							{@const perkBonus = (() => {
								const m = {};
								for (const p of perks) {
									if (!p.isEnabled) continue;
									for (const sb of p.statBonuses ?? []) {
										m[sb.statHash] = (m[sb.statHash] ?? 0) + sb.value;
									}
								}
								return m;
							})()}

							<!-- ① STATS — DIM grid: label · number · bar -->
							{#if selectedItem.weaponStats?.length}
								<div class="mb-4 border-b border-zinc-800/60 pb-4">
									{#each selectedItem.weaponStats as s}
										{@const bonus = perkBonus[s.hash] ?? 0}
										{@const baseVal = Math.max(0, s.value - bonus)}
										{@const maxVal = s.maximum || 100}
										{@const basePct = Math.min((baseVal / maxVal) * 100, 100)}
										{@const bonusPct = Math.min(Math.max((bonus / maxVal) * 100, 0), 100 - basePct)}
										<div
											class="mb-2 grid items-center"
											style="grid-template-columns:130px 40px 1fr"
										>
											<span
												class="text-xs leading-none font-medium
                                                         {bonus > 0
													? 'text-amber-400'
													: 'text-zinc-400'}"
											>
												{s.name}
											</span>
											<span
												class="pr-2 text-right text-xs leading-none font-bold
                                                         {bonus > 0
													? 'text-amber-400'
													: 'text-zinc-200'}"
											>
												{s.value}
											</span>
											<div class="flex h-2.5 overflow-hidden rounded-sm bg-zinc-800">
												<div
													class="h-full shrink-0 rounded-sm bg-zinc-300 transition-all duration-500"
													style="width:{basePct}%"
												></div>
												{#if bonusPct > 0}
													<div
														class="h-full shrink-0 bg-amber-400 transition-all duration-500"
														style="width:{bonusPct}%"
													></div>
												{/if}
											</div>
										</div>
									{/each}
								</div>
							{/if}

							{#if !perks.length}
								<p class="py-6 text-center text-sm text-zinc-600">No perk data available.</p>
							{/if}

							<!-- ② FRAME / INTRINSIC row -->
							{#if intrinsic}
								<div class="mb-3 flex items-center gap-3 border-b border-zinc-800/50 py-2.5">
									{#if intrinsic.icon}
										<div
											class="h-10 w-10 shrink-0 overflow-hidden rounded-sm border border-amber-500/30 bg-amber-500/5"
										>
											<img src={intrinsic.icon} alt="" class="h-full w-full object-cover" />
										</div>
									{/if}
									<div class="min-w-0 flex-1">
										<span class="block truncate text-sm leading-tight font-semibold text-amber-400">
											{intrinsic.name}
										</span>
										{#if intrinsic.description}
											<p class="mt-0.5 line-clamp-1 text-xs leading-relaxed text-zinc-500">
												{intrinsic.description}
											</p>
										{/if}
									</div>
									<span
										class="shrink-0 text-[10px] font-medium tracking-wide text-amber-700/70 uppercase"
										>Frame</span
									>
								</div>
							{/if}

							<!-- ③ SOCKETS — clean row of square icons (barrels, mag, grip, origin, MW) -->
							{#if other.length || mwPerk}
								{@const allSockets = [...other, ...(mwPerk ? [mwPerk] : [])]}
								<div class="mb-3 flex flex-wrap gap-2 border-b border-zinc-800/50 py-3">
									{#each allSockets as p}
										<div class="group/pi relative flex flex-col items-center gap-1">
											<div
												class="relative h-10 w-10 cursor-default overflow-hidden border transition-colors
                                                        {p.isMasterwork
													? 'border-yellow-500/50 bg-yellow-500/5 hover:border-yellow-400'
													: p.isEnabled
														? 'border-zinc-700 bg-zinc-900/40 hover:border-zinc-500'
														: 'border-zinc-800/40 opacity-40'}"
											>
												<div
													class="absolute top-0 left-0 h-[2px] w-full
                                                            {p.isMasterwork
														? 'bg-yellow-400/70'
														: 'bg-zinc-600/30'}"
												></div>
												{#if p.icon}
													<img src={p.icon} alt="" class="h-full w-full object-cover" />
												{/if}
												{#if !p.isEnabled}
													<div class="absolute inset-0 bg-black/50"></div>
												{/if}
											</div>
											<span
												class="w-10 truncate text-center text-[9px] leading-tight font-medium text-zinc-600"
												>{p.name}</span
											>
											<!-- Tooltip -->
											<div
												class="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5
                                                        w-52 -translate-x-1/2 translate-y-1 opacity-0
                                                        transition-all duration-150 group-hover/pi:translate-y-0 group-hover/pi:opacity-100"
											>
												<div
													class="border border-zinc-700 bg-[#141414] px-3 py-2.5 shadow-[0_0_24px_rgba(0,0,0,0.95)]"
												>
													<p
														class="mb-0.5 text-sm font-semibold {p.isMasterwork
															? 'text-yellow-400'
															: 'text-zinc-100'}"
													>
														{p.name}
													</p>
													{#if p.itemTypeDisplayName}
														<p class="mb-1 text-[10px] font-medium text-zinc-500">
															{p.itemTypeDisplayName}
														</p>
													{/if}
													{#if p.description}
														<p class="text-xs leading-relaxed text-zinc-400">{p.description}</p>
													{/if}
													{#if p.statBonuses?.length}
														<div class="mt-2 flex flex-wrap gap-1">
															{#each p.statBonuses as sb}
																<span
																	class="border border-emerald-500/20 px-1.5 py-0.5 text-xs font-medium text-emerald-400"
																>
																	+{sb.value}
																	{statHashToName[sb.statHash] ?? ''}
																</span>
															{/each}
														</div>
													{/if}
												</div>
											</div>
										</div>
									{/each}
								</div>
							{/if}

							<!-- ④ TRAITS — square icons with name + description -->
							{#if traits.length}
								<div>
									<span class="mb-2 block text-xs font-medium text-zinc-500">Traits</span>
									<div class="grid grid-cols-2 gap-x-4 gap-y-3">
										{#each traits as p}
											<div class="flex items-start gap-3 {!p.isEnabled ? 'opacity-50' : ''}">
												<!-- Square icon -->
												<div
													class="relative h-11 w-11 shrink-0 overflow-hidden border
                                                            {p.isEnhanced
														? 'border-yellow-500/60 bg-yellow-500/5'
														: 'border-zinc-700 bg-zinc-900/40'}"
												>
													{#if p.isEnhanced}
														<div
															class="absolute top-0 left-0 h-[2px] w-full bg-yellow-400/70"
														></div>
													{/if}
													{#if p.icon}
														<img src={p.icon} alt="" class="h-full w-full object-cover" />
													{/if}
												</div>
												<!-- Name + description -->
												<div class="min-w-0 flex-1 pt-0.5">
													<div class="mb-0.5 flex items-center gap-1.5">
														<span
															class="truncate text-sm leading-tight font-semibold
                                                                     {p.isEnhanced
																? 'text-yellow-300'
																: 'text-zinc-100'}"
														>
															{p.name}
														</span>
														{#if p.isEnhanced}
															<span
																class="shrink-0 border border-yellow-500/30 px-1 py-px text-[9px] leading-none font-bold text-yellow-500"
																>ENH</span
															>
														{/if}
													</div>
													<p class="line-clamp-3 text-xs leading-relaxed text-zinc-500">
														{p.description ?? ''}
													</p>
												</div>
											</div>
										{/each}
									</div>
								</div>
							{/if}

							<!-- ── ARMOR STATS + MODS ──────────────────────────── -->
						{:else if selectedType === 'armor'}
							<!-- Per-piece stat bars -->
							{#if selectedItem.armorStats?.length}
								<div class="mb-4">
									<span class="mb-3 block text-xs font-medium text-zinc-500"> Piece Stats </span>
									{#each selectedItem.armorStats as s}
										<div class="flex items-center gap-3 py-1.5">
											<span class="w-20 shrink-0 text-xs font-medium text-zinc-400"
												>{s.short ?? s.name}</span
											>
											<div class="relative h-2 flex-1 overflow-hidden rounded-sm bg-zinc-800">
												<div
													class="h-full {s.color ??
														'bg-zinc-400'} rounded-sm transition-all duration-700"
													style="width:{Math.min((s.value / (s.maximum || 30)) * 100, 100)}%"
												></div>
											</div>
											<span class="w-6 shrink-0 text-right text-xs font-bold text-zinc-200">
												{s.value}
											</span>
										</div>
									{/each}
								</div>
							{/if}

							<!-- ── IN-GAME-STYLE MOD SLOTS ──────────────────── -->
							{#if true}
								{@const capacity = selectedItem.energyCapacity ?? 10}
								{@const used = selectedItem.energyUsed ?? 0}
								{@const mods = selectedItem.mods ?? []}
								{@const slots = selectedItem.modSlotCount ?? 4}
								{@const empty = Math.max(0, slots - mods.length)}
								<div class="border-t border-zinc-800/60 pt-4">
									<!-- Header: label + energy bar -->
									<div class="mb-3 flex items-center justify-between">
										<div class="flex items-center gap-2">
											<span class="text-xs font-medium text-zinc-400">Mods</span>
											{#if selectedItem.masterwork}
												<span
													class="rounded-sm border border-yellow-400/30 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-400"
												>
													Masterworked
												</span>
											{/if}
										</div>
										<!-- Energy pips -->
										<div class="flex items-center gap-1">
											<span class="mr-1 text-xs font-medium text-zinc-500">{used}/{capacity}</span>
											<div class="flex gap-px">
												{#each { length: capacity } as _, i}
													<div
														class="h-1.5 w-2.5 rounded-sm transition-colors
                                                                {i < used
															? selectedItem.masterwork
																? 'bg-yellow-400/70'
																: 'bg-emerald-500/70'
															: 'bg-zinc-800'}"
													></div>
												{/each}
											</div>
										</div>
									</div>

									<!-- Mod slot row (D2-style: square icons in a row) -->
									<div class="flex flex-wrap gap-2">
										<!-- Filled mod slots -->
										{#each mods as mod}
											<div class="group/mod relative shrink-0 cursor-default">
												<!-- Slot square -->
												<div
													class="relative h-[52px] w-[52px] overflow-hidden
                                                            border transition-all duration-200
                                                            {mod.statBonuses?.length
														? 'border-emerald-500/40 bg-emerald-500/5 group-hover/mod:border-emerald-400/70'
														: 'border-zinc-700 bg-[#0c0c0c] group-hover/mod:border-zinc-500'}"
												>
													{#if mod.icon}
														<img src={mod.icon} alt="" class="h-full w-full object-cover" />
													{:else}
														<div class="flex h-full w-full items-center justify-center opacity-20">
															<div class="h-5 w-5 rotate-45 border border-zinc-600"></div>
														</div>
													{/if}
													<!-- Energy cost — bottom-right overlay (matches D2 UI) -->
													{#if mod.energyCost > 0}
														<div
															class="absolute right-0 bottom-0 flex h-5
                                                                    w-5 items-center justify-center border-t
                                                                    border-l border-zinc-700/60 bg-black/80"
														>
															<span
																class="font-mono text-[9px] leading-none font-bold text-emerald-400"
															>
																{mod.energyCost}
															</span>
														</div>
													{/if}
													<!-- Stat bonus — top-left tag -->
													{#if mod.statBonuses?.length}
														<div
															class="absolute top-0 left-0 border-r border-b
                                                                    border-emerald-500/30 bg-emerald-500/20 px-1 py-px"
														>
															<span
																class="font-mono text-[7px] leading-none font-bold text-emerald-300"
															>
																+{mod.statBonuses[0].value}
															</span>
														</div>
													{/if}
												</div>
												<!-- Hover tooltip -->
												<div
													class="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2
                                                            min-w-[180px] -translate-x-1/2
                                                            translate-y-1 opacity-0
                                                            transition-all duration-200 group-hover/mod:translate-y-0 group-hover/mod:opacity-100"
												>
													<div
														class="rounded-sm border border-zinc-700
                                                                bg-[#141414] px-3 py-2.5 shadow-[0_0_20px_rgba(0,0,0,0.9)]"
													>
														<span class="mb-1 block text-sm font-semibold text-zinc-100"
															>{mod.name}</span
														>
														{#if mod.description}
															<p class="mb-1.5 max-w-[200px] text-xs leading-relaxed text-zinc-400">
																{mod.description}
															</p>
														{/if}
														<div class="flex flex-wrap items-center gap-3">
															{#if mod.energyCost > 0}
																<span class="text-xs text-zinc-500">
																	Cost: <span class="font-semibold text-emerald-400"
																		>{mod.energyCost}</span
																	>
																</span>
															{/if}
															{#each mod.statBonuses ?? [] as sb}
																<span
																	class="rounded-sm border border-emerald-500/30 px-1.5 py-0.5 text-xs font-medium text-emerald-400"
																>
																	+{sb.value}
																	{statHashToName[sb.statHash] ?? ''}
																</span>
															{/each}
														</div>
														{#each mod.conditionalBonuses ?? [] as sb}
															<span
																class="mt-1 inline-block rounded-sm border border-zinc-800 px-1.5 py-0.5 text-xs text-zinc-500"
															>
																+{sb.value}
																{statHashToName[sb.statHash] ?? ''} (conditional)
															</span>
														{/each}
													</div>
												</div>
											</div>
										{/each}

										<!-- Empty mod slots -->
										{#each { length: empty } as _}
											<div
												class="flex h-[52px] w-[52px] shrink-0 items-center
                                                        justify-center border border-zinc-800/60 bg-[#090909]"
											>
												<!-- D2-style empty slot indicator: two crossing lines -->
												<div class="relative h-5 w-5 opacity-20">
													<div class="absolute inset-0 flex items-center justify-center">
														<div class="h-px w-full bg-zinc-500"></div>
													</div>
													<div class="absolute inset-0 flex items-center justify-center">
														<div class="h-full w-px bg-zinc-500"></div>
													</div>
												</div>
											</div>
										{/each}
									</div>

									<!-- Remaining energy display -->
									{#if capacity - used > 0}
										<p class="mt-2 text-xs font-medium text-zinc-600">
											{capacity - used} energy remaining
										</p>
									{:else}
										<p class="mt-2 text-xs font-medium text-emerald-600">Full capacity</p>
									{/if}
								</div>
							{/if}

							<!-- ── SUBCLASS SOCKETS ────────────────────────────── -->
						{:else if selectedType === 'subclass'}
							{@const sc = eq.subclassSockets}
							<!-- Super -->
							{#if sc?.super}
								<div class="mb-4 flex items-start gap-4 border-b border-zinc-800/60 pb-4">
									{#if sc.super.icon}
										<div
											class="h-12 w-12 shrink-0 overflow-hidden rounded-sm border border-zinc-700"
										>
											<img src={sc.super.icon} alt="" class="h-full w-full object-cover" />
										</div>
									{/if}
									<div>
										<span class="block text-xs font-medium text-zinc-500">Super</span>
										<span class="block text-base font-semibold text-zinc-100">{sc.super.name}</span>
										{#if sc.super.description}
											<p class="mt-1 line-clamp-4 text-xs leading-relaxed text-zinc-500">
												{sc.super.description}
											</p>
										{/if}
									</div>
								</div>
							{/if}
							<!-- Abilities -->
							{#if sc?.abilities?.length}
								<span class="mb-2 block text-xs font-medium text-zinc-500">Abilities</span>
								{#each sc.abilities as ab}
									<div
										class="flex items-start gap-3 border-b border-zinc-800/40 py-2 last:border-0"
									>
										{#if ab.icon}
											<div
												class="h-9 w-9 shrink-0 overflow-hidden rounded-sm border border-zinc-700"
											>
												<img src={ab.icon} alt="" class="h-full w-full object-cover" />
											</div>
										{/if}
										<div class="min-w-0 flex-1">
											<span class="block text-sm leading-tight font-medium text-zinc-200"
												>{ab.name}</span
											>
											<span class="text-xs text-zinc-500">{ab.itemTypeDisplayName}</span>
										</div>
									</div>
								{/each}
							{/if}
							<!-- Aspects -->
							{#if sc?.aspects?.length}
								<div class="mt-3 border-t border-zinc-800/60 pt-3">
									<span class="mb-2 block text-xs font-medium text-zinc-500">Aspects</span>
									{#each sc.aspects as asp}
										<div
											class="flex items-start gap-3 border-b border-zinc-800/40 py-2 last:border-0"
										>
											{#if asp.icon}
												<div
													class="h-9 w-9 shrink-0 overflow-hidden rounded-sm border border-zinc-700"
												>
													<img src={asp.icon} alt="" class="h-full w-full object-cover" />
												</div>
											{/if}
											<div class="min-w-0 flex-1">
												<span class="block text-sm leading-tight font-medium text-zinc-200"
													>{asp.name}</span
												>
												{#if asp.description}
													<p class="mt-0.5 line-clamp-2 text-xs leading-relaxed text-zinc-500">
														{asp.description}
													</p>
												{/if}
											</div>
										</div>
									{/each}
								</div>
							{/if}
							<!-- Fragments -->
							{#if sc?.fragments?.length}
								<div class="mt-3 border-t border-zinc-800/60 pt-3">
									<span class="mb-2 block text-xs font-medium text-zinc-500">
										Fragments ({sc.fragments.length})
									</span>
									<div class="grid grid-cols-2 gap-2">
										{#each sc.fragments as frag}
											<div
												class="group/frag flex items-center gap-2.5 rounded-sm border border-zinc-800/60 p-2 transition-colors hover:border-zinc-700"
											>
												{#if frag.icon}
													<div class="h-7 w-7 shrink-0 overflow-hidden">
														<img src={frag.icon} alt="" class="h-full w-full object-cover" />
													</div>
												{/if}
												<span class="truncate text-xs leading-tight font-medium text-zinc-400">
													{frag.name}
												</span>
											</div>
										{/each}
									</div>
								</div>
							{/if}
						{/if}
					</div>
				</div>
			{:else}
				<!-- ── DECORATIVE IDLE VIEW ───────────────────────────────── -->
				<div
					class="pointer-events-none absolute inset-0 flex items-center justify-center opacity-5"
				>
					<div
						class="h-[400px] w-[400px] animate-pulse rounded-full border border-emerald-500"
					></div>
					<div class="absolute h-[500px] w-[500px] rounded-full border border-zinc-800"></div>
				</div>

				<div class="relative z-10 flex h-[480px] w-80 flex-col items-center justify-center gap-8">
					<div
						class="pointer-events-none absolute inset-0 opacity-40 blur-3xl"
						style="background:linear-gradient(to top,{subclassColor},transparent)"
					></div>

					<div
						class="absolute rotate-90 text-center text-[10px] font-bold
                                tracking-[1em] whitespace-nowrap text-zinc-800 uppercase opacity-40 select-none"
					>
						CHARACTER_ENTITY
					</div>

					<div class="relative z-10 flex flex-col items-center gap-5">
						{#if eq.subclass?.icon}
							<img src={eq.subclass.icon} alt="" class="h-16 w-16 object-cover opacity-15" />
						{/if}
						<div class="text-center">
							<p class="mb-1 text-[9px] font-bold tracking-[0.4em] text-zinc-700 uppercase">
								Guardian Class
							</p>
							<p class="font-serif text-3xl leading-none font-light text-white/80 italic">
								{classNames[char?.classType] ?? '—'}
							</p>
						</div>
						{#if char?.light}
							<div class="border border-zinc-800 bg-[#0a0a0a] px-6 py-2 text-center">
								<p class="mb-1 font-mono text-[8px] tracking-[0.3em] text-zinc-600 uppercase">
									Power Level
								</p>
								<p class="font-mono text-[22px] font-bold text-zinc-100">{char.light}</p>
							</div>
						{/if}
						{#if artifact?.powerBonus}
							<p class="font-mono text-[8px] tracking-[0.25em] text-zinc-700 uppercase">
								+{artifact.powerBonus} Artifact
							</p>
						{/if}
						<!-- Click hint -->
						<p class="mt-4 text-xs font-medium text-zinc-700">Select a slot to inspect</p>
					</div>

					<div class="absolute top-0 left-0 h-8 w-8 border-t-2 border-l-2 border-zinc-800"></div>
					<div
						class="absolute right-0 bottom-0 h-8 w-8 border-r-2 border-b-2 border-zinc-800"
					></div>
				</div>
			{/if}
		</div>

		<!-- ── COL 3: STATS (left) + ARMOR (right) ──────────────────────────── -->
		<div class="col-span-2 flex items-start gap-3">
			<!-- ── Vertical stats column ──────────────────────────────────── -->
			<div class="flex shrink-0 flex-col gap-0 pt-1">
				<!-- STATS label -->
				<div class="mb-3 flex items-center gap-1.5">
					<span class="text-[10px] font-semibold text-emerald-500">Stats</span>
					<div class="h-1 w-1 animate-pulse rounded-full bg-emerald-500"></div>
				</div>

				{#each armorStatMeta as stat}
					{@const total = totalStats[stat.name] ?? 0}
					{@const bonus = Math.max(0, total - 100)}
					{@const primary = FATE_PRIMARY[stat.name]}
					{@const fateBonuses = calcFateBonuses(stat.name, bonus)}
					<!-- Each stat: number above, short name below -->
					<div
						class="group/stat relative flex cursor-default flex-col items-center border-b
                                border-zinc-800/40 px-1 py-2.5 last:border-0"
					>
						<!-- Number -->
						<span
							class="font-mono text-[15px] leading-none font-bold transition-colors
                                     {bonus > 0
								? 'text-emerald-400'
								: total >= 80
									? 'text-zinc-200'
									: 'text-zinc-500'}"
						>
							{total}
						</span>
						<!-- Thin bar below number -->
						<div class="relative mt-1 mb-1 h-px w-8 overflow-hidden bg-zinc-900">
							<div
								class="absolute top-0 left-0 h-full bg-zinc-600 transition-all duration-700"
								style="width:{Math.min((Math.min(total, 100) / 200) * 100, 50)}%"
							></div>
							{#if bonus > 0}
								<div
									class="absolute top-0 h-full bg-emerald-500 transition-all duration-700"
									style="left:50%;width:{Math.min((bonus / 100) * 50, 50)}%"
								></div>
							{/if}
						</div>
						<!-- Short name -->
						<span
							class="font-mono text-[7px] tracking-[0.1em] uppercase
                                     {bonus > 0
								? 'text-emerald-600'
								: 'text-zinc-700'} leading-none"
						>
							{stat.short ?? stat.name.slice(0, 3)}
						</span>

						<!-- Hover tooltip (anchored right of the stats column) -->
						{#if primary}
							<div
								class="pointer-events-none absolute top-1/2 left-full z-50 ml-2
                                        w-[220px] -translate-x-1
                                        -translate-y-1/2 opacity-0
                                        transition-all duration-200 group-hover/stat:translate-x-0 group-hover/stat:opacity-100"
							>
								<div
									class="rounded-sm border border-zinc-700 bg-[#111] p-3 shadow-[0_0_24px_rgba(0,0,0,0.9)]"
								>
									<div class="mb-1.5 flex items-center justify-between">
										<span class="text-xs font-semibold text-zinc-200">{stat.name}</span>
										<span
											class="text-xs font-bold {bonus > 0 ? 'text-emerald-400' : 'text-zinc-300'}"
											>{total}</span
										>
									</div>
									<p class="text-xs leading-relaxed text-zinc-500">{primary}</p>
									{#if bonus > 0 && fateBonuses.length}
										<div class="mt-2 border-t border-emerald-500/20 pt-2">
											<span class="mb-1.5 block text-[10px] font-semibold text-emerald-500"
												>+{bonus} above cap</span
											>
											{#each fateBonuses as fb}
												<div class="mb-1 flex items-center justify-between gap-3 last:mb-0">
													<span class="text-xs text-zinc-500">{fb.label}</span>
													<span class="shrink-0 text-xs font-bold text-emerald-400">{fb.value}</span
													>
												</div>
											{/each}
										</div>
									{/if}
								</div>
							</div>
						{/if}
					</div>
				{/each}

				<!-- Total + tier -->
				<div class="mt-1 border-t border-zinc-800 pt-3 text-center">
					<span class="block text-xs leading-none font-bold text-zinc-200">{grandTotal}</span>
					<span class="mt-0.5 block text-[9px] font-medium text-emerald-500">T{buildTier}</span>
				</div>
			</div>

			<!-- ── Armor slots ──────────────────────────────────────────────── -->
			<div class="flex flex-1 flex-col items-center gap-4">
				{@render GearSlot('helmet', 'Helmet')}
				{@render GearSlot('gauntlets', 'Arms')}
				{@render GearSlot('chest', 'Chest')}
				{@render GearSlot('legs', 'Legs')}
				{@render GearSlot('classItem', 'Class')}
			</div>
		</div>
	</div>
</div>
