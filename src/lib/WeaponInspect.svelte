<script>
	import { fly, fade } from 'svelte/transition';
	const BUNGIE_ROOT = 'https://www.bungie.net';

	let { weapon, onClose } = $props();
	let loading = $state(true);
	let details = $state(null);

	// Tooltip tracking
	let hoveredPerk = $state(null);
	let tooltipPos = $state({ x: 0, y: 0 });

	async function fetchDetails() {
		try {
			const mid = weapon.membershipId
				? `?mid=${weapon.membershipId}&mt=${weapon.membershipType}`
				: '';
			const res = await fetch(`/api/weapon/${weapon.hash}${mid}`);
			details = await res.json();
		} catch (e) {
			console.error('Failed to fetch weapon details', e);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (weapon?.hash) fetchDetails();
	});

	function getStatColor() {
		return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]';
	}

	function onPerkEnter(e, perk) {
		const rect = e.currentTarget.getBoundingClientRect();
		hoveredPerk = perk;
		tooltipPos = {
			x: rect.left + rect.width / 2,
			y: rect.top - 20
		};
	}
</script>

{#snippet perkIcon({ perk, large = false })}
	<div
		class="group/perk relative {large
			? 'h-14 w-14'
			: 'h-12 w-12'} flex cursor-help items-center justify-center"
		onmouseenter={(e) => onPerkEnter(e, perk)}
		onmouseleave={() => (hoveredPerk = null)}
	>
		<!-- Circular Border (Glows Sky Blue) -->
		<div
			class="absolute inset-0 border bg-zinc-950 {perk.isEnhanced
				? 'border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
				: 'border-zinc-800'} rounded-full
                    transition-all duration-300 group-hover/perk:border-sky-400
                    group-hover/perk:bg-sky-500/25 group-hover/perk:shadow-[0_0_35px_rgba(56,189,248,0.7)]"
		></div>

		<!-- The Icon -->
		<img
			src={perk.icon}
			alt={perk.name}
			class="{large
				? 'h-11 w-11'
				: 'h-9 w-9'} relative z-10 opacity-85 transition-opacity group-hover/perk:opacity-100"
		/>

		{#if perk.isEnhanced}
			<div
				class="absolute -top-1 -right-1 z-20 flex h-4 w-4 items-center justify-center rounded-full border border-black/20 bg-amber-500 shadow-lg"
			>
				<span class="text-[8px] font-black text-black">E</span>
			</div>
		{/if}
	</div>
{/snippet}

<div
	class="fixed inset-0 z-[1000] flex items-center justify-center p-4 font-sans sm:p-6"
	transition:fade={{ duration: 200 }}
>
	<button
		class="absolute inset-0 cursor-default border-none bg-black/95 backdrop-blur-xl"
		onclick={onClose}
	></button>

	{#if loading}
		<div class="relative z-10 flex flex-col items-center gap-4">
			<div
				class="h-12 w-12 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"
			></div>
			<p class="text-center text-[10px] font-black tracking-[0.4em] text-emerald-500 uppercase">
				SYNCHRONIZING_ARSENAL_DATA
			</p>
		</div>
	{:else if details}
		<div
			class="relative z-10 flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden border border-zinc-800 bg-[#0a0a0a] shadow-2xl"
			in:fly={{ y: 20, duration: 400 }}
		>
			<!-- Banner / Screenshot -->
			<div class="relative z-50 h-64 shrink-0 border-b border-zinc-800 bg-zinc-950">
				{#if details.screenshot}
					<img
						src={details.screenshot}
						alt={details.name}
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

				<div class="absolute bottom-0 left-0 flex w-full items-end justify-between p-6">
					<div class="flex items-center gap-6">
						<!-- Squared Icon Container -->
						<div
							class="relative h-20 w-20 shrink-0 overflow-hidden border border-zinc-700 bg-zinc-900 shadow-2xl"
						>
							<img src={details.icon} alt={details.name} class="h-full w-full object-cover p-1" />
							<div
								class="absolute top-0 left-0 h-[2px] w-full {details.isExotic
									? 'bg-amber-500'
									: 'bg-zinc-500'}"
							></div>
						</div>
						<div>
							<div class="flex items-center gap-2.5">
								{#if details.damageType?.icon}
									<img
										src={details.damageType.icon}
										alt="Damage"
										class="h-5 w-5 opacity-90 shadow-[0_0_10px_rgba(255,255,255,0.2)]"
									/>
								{/if}
								<span
									class="text-[10px] font-black tracking-[0.4em] {details.isExotic
										? 'text-amber-500'
										: 'text-emerald-500'} uppercase"
								>
									{details.tier}
									{details.type}
								</span>
							</div>
							<h2
								class="mt-1 text-5xl font-light tracking-tighter text-white uppercase italic drop-shadow-2xl"
							>
								{details.name}
							</h2>
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
				<!-- Col 1: Stats (Col 3) -->
				<div class="col-span-12 space-y-6 border-r border-zinc-800/30 pr-6 lg:col-span-3">
					<div>
						<span
							class="mb-6 block font-sans text-[9px] font-bold tracking-[0.3em] text-zinc-500 uppercase"
							>BALLISTIC_DATA_MATRIX</span
						>
						<div class="space-y-4">
							{#each details.stats as stat}
								<div class="group/stat">
									<div class="mb-1.5 flex items-end justify-between">
										<span class="text-[9px] font-bold tracking-[0.2em] text-zinc-400 uppercase"
											>{stat.name}</span
										>
										<span class="font-mono text-xs font-black text-white">{stat.value}</span>
									</div>
									{#if stat.isBar}
										<div
											class="relative h-1 overflow-hidden rounded-full border border-white/5 bg-zinc-950"
										>
											<div
												class="absolute inset-y-0 left-0 {getStatColor()} transition-all duration-1000 ease-out"
												style="width: {Math.min(stat.value, 100)}%"
											></div>
										</div>
									{:else}
										<div class="mt-0.5 h-[1px] w-full bg-zinc-800/50"></div>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				</div>

				<!-- Col 2: Main Perks (Col 6) -->
				<div class="col-span-12 space-y-12 pr-6 lg:col-span-6">
					{#if details.livePerks?.length > 0}
						<div>
							<span
								class="mb-6 block font-sans text-[9px] font-black tracking-[0.4em] text-emerald-500 uppercase"
								>ACTIVE_COMBAT_LOADOUT</span
							>
							<div class="flex flex-wrap gap-3">
								{#each details.livePerks as perk}
									{@render perkIcon({ perk, large: true })}
								{/each}
							</div>
						</div>
					{/if}

					<div>
						<span
							class="mb-6 block font-sans text-[9px] font-bold tracking-[0.4em] text-zinc-500 uppercase"
							>MANIFEST_POOL_ANALYSIS</span
						>
						<div class="flex flex-wrap gap-x-6 gap-y-6">
							{#each details.perkPools || [] as pool}
								<div class="flex flex-col gap-3">
									{#each pool.perks as perk}
										{@render perkIcon({ perk })}
									{/each}
								</div>
							{/each}
						</div>
					</div>

					<div class="border-t border-zinc-800/50 pt-8">
						<span
							class="mb-4 block font-sans text-[9px] font-black tracking-[0.4em] text-zinc-600 uppercase"
							>TACTICAL_ARCHIVE_DATA</span
						>
						<p class="indent-6 font-serif text-xs leading-relaxed text-zinc-400 italic">
							{details.description || 'No classification data found in tactical archives.'}
						</p>
					</div>
				</div>

				<!-- Col 3: Origin Traits (Col 3) -->
				<div class="col-span-12 space-y-10 border-l border-zinc-800/30 pl-8 lg:col-span-3">
					{#if details.originTraits?.length > 0}
						<div>
							<span
								class="mb-6 block font-sans text-[9px] font-black tracking-[0.4em] text-emerald-500 uppercase"
								>ORIGIN_ARCHIVE</span
							>
							<div class="flex flex-col gap-6">
								{#each details.originTraits as perk}
									<div class="group/ot flex items-center gap-4">
										{@render perkIcon({ perk, large: true })}
										<div class="min-w-0">
											<p class="truncate text-[10px] font-black text-zinc-200 uppercase italic">
												{perk.name}
											</p>
											<p class="text-[7px] font-bold tracking-widest text-zinc-600 uppercase">
												TACTICAL_ORIGIN
											</p>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<div class="border border-zinc-800/50 bg-zinc-900/20 p-4">
						<span class="mb-2 block text-[7px] font-black tracking-[0.3em] text-zinc-700 uppercase"
							>SYSTEM_INTEGRITY</span
						>
						<div class="flex items-center gap-2">
							<div class="h-1 w-1 animate-ping rounded-full bg-emerald-500"></div>
							<span class="text-[8px] font-bold tracking-widest text-emerald-900 uppercase"
								>LINK_STABLE</span
							>
						</div>
					</div>
				</div>
			</div>

			<div
				class="z-[60] flex h-10 shrink-0 items-center justify-between border-t border-zinc-800 bg-zinc-950 px-8"
			>
				<div class="flex items-center gap-8">
					<span class="text-[9px] font-black tracking-[0.5em] text-zinc-700 uppercase"
						>JADESTONE_INTEL_SYSTEM_V{details.hash.substring(0, 4)}</span
					>
					<span class="font-mono text-[9px] tracking-widest text-zinc-800 uppercase opacity-50"
						>UID_{details.hash}</span
					>
				</div>
				<div class="flex items-center gap-3">
					<div
						class="h-2 w-2 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
					></div>
					<span class="text-[9px] font-bold tracking-[0.3em] text-emerald-900 uppercase"
						>ENCRYPTED_SIGNAL_STABLE</span
					>
				</div>
			</div>
		</div>

		<!-- Global Smart Tooltip -->
		{#if hoveredPerk}
			<div
				class="pointer-events-none fixed z-[2000] mb-6 -translate-x-1/2 -translate-y-full"
				style="left: {tooltipPos.x}px; top: {tooltipPos.y}px;"
				transition:fade={{ duration: 100 }}
			>
				<div
					class="animate-in fade-in zoom-in-95 w-72 border border-zinc-800 bg-[#0a0a0a] p-4 shadow-[0_0_40px_rgba(0,0,0,0.9)] duration-200"
				>
					<p
						class="text-[11px] font-black uppercase italic {hoveredPerk.isEnhanced
							? 'text-amber-500'
							: 'text-sky-400'} mb-1.5 tracking-wider"
					>
						{hoveredPerk.name}
					</p>
					<p class="font-serif text-[10px] leading-relaxed text-zinc-300 italic opacity-95">
						{hoveredPerk.description || 'Active Tactical Component.'}
					</p>
					<div
						class="absolute top-full left-1/2 h-5 w-[1px] -translate-x-1/2 {hoveredPerk.isEnhanced
							? 'bg-amber-500/50'
							: 'bg-sky-400/50'}"
					></div>
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
