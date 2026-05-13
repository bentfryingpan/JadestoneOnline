<script>
	import { fly, fade } from 'svelte/transition';
	import { goto } from '$app/navigation';

	let { data } = $props();

	// ── State ──────────────────────────────────────────────────────────────────
	let deepScanning = $state(false);
	let deepScanStatus = $state('');
	let deepScanProgress = $state({ current: 0, total: 0 });

	async function triggerDeepScan() {
		if (deepScanning || !data.user) return;
		deepScanning = true;

		try {
			deepScanStatus = 'syncing';
			await fetch('/api/admin/sync-manifest?mode=medals', { method: 'POST' });
			await fetch('/api/admin/sync-manifest?mode=small', { method: 'POST' });

			deepScanStatus = 'discovering';
			const discRes = await fetch('/api/sync/discovery', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					membershipId: data.user.membershipId,
					membershipType: data.user.membershipType,
					characterIds: data.user.characterIds
				})
			});
			const { missing } = await discRes.json();

			if (!missing || missing.length === 0) {
				deepScanning = false;
				alert('Career intelligence is already up to date.');
				return;
			}

			deepScanStatus = 'enriching';
			deepScanProgress = { current: 0, total: missing.length };

			const CHUNK_SIZE = 40;
			const CONCURRENCY = 5;
			const chunks = [];
			for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
				chunks.push(missing.slice(i, i + CHUNK_SIZE));
			}

			let chunkIdx = 0;
			const workers = Array(CONCURRENCY)
				.fill(null)
				.map(async () => {
					while (chunkIdx < chunks.length) {
						const idx = chunkIdx++;
						const chunk = chunks[idx];
						try {
							const res = await fetch('/api/pgcr-enrich', {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({
									membershipId: data.user.membershipId,
									membershipType: data.user.membershipType,
									bungieDisplayName: data.user.bungieGlobalDisplayName,
									bungieDisplayCode: data.user.bungieGlobalDisplayNameCode,
									instanceIds: chunk
								})
							});
							const r = await res.json();
							deepScanProgress.current += r.stored ?? chunk.length;
						} catch {
							deepScanProgress.current += chunk.length;
						}
					}
				});

			await Promise.all(workers);
			alert('Deep Career Scan complete.');
		} catch (e) {
			console.error('Deep scan failed', e);
		} finally {
			deepScanning = false;
		}
	}

	async function repairData() {
		if (
			!confirm('This will wipe your local intelligence cache and restart the Deep Scan. Proceed?')
		)
			return;
		if (!data.user) return;

		deepScanning = true;
		deepScanStatus = 'repairing';
		try {
			await fetch('/api/sync/wipe', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ membershipId: data.user.membershipId })
			});
			triggerDeepScan();
		} catch {
			deepScanning = false;
		}
	}
</script>

<div class="flex h-screen overflow-hidden bg-[#080808] font-sans text-slate-200">
	<!-- Sidebar -->
	<nav
		class="z-50 flex w-16 shrink-0 flex-col items-center border-r border-zinc-800 bg-[#0a0a0a] py-8"
	>
		<div
			class="mb-12 flex h-9 w-9 rotate-45 cursor-pointer items-center justify-center bg-zinc-100 font-black text-black shadow-2xl transition-colors duration-500 hover:bg-emerald-500"
			onclick={() => goto('/')}
		>
			<span class="-rotate-45 text-lg">J</span>
		</div>
		<div class="flex flex-col items-center space-y-8">
			<button
				onclick={() => goto('/')}
				class="group relative flex flex-col items-center gap-1 transition-all duration-300"
			>
				<div
					class="flex h-10 w-10 rotate-45 items-center justify-center border border-zinc-800 text-zinc-600 transition-all group-hover:rotate-90 hover:border-zinc-500 hover:text-zinc-300"
				>
					<span class="-rotate-45 text-xs font-bold transition-all group-hover:-rotate-90">H</span>
				</div>
				<span class="mt-3 text-[7px] font-bold tracking-[0.2em] text-zinc-700">HOME</span>
			</button>

			{#if data.user}
				<button
					onclick={() =>
						goto(
							`/profile/${data.user.bungieGlobalDisplayName}/${data.user.bungieGlobalDisplayNameCode}`
						)}
					class="group relative flex flex-col items-center gap-1 transition-all duration-300"
				>
					<div
						class="flex h-10 w-10 rotate-45 items-center justify-center border border-zinc-800 text-zinc-600 transition-all group-hover:rotate-90 hover:border-zinc-500 hover:text-zinc-300"
					>
						<span class="-rotate-45 text-xs font-bold transition-all group-hover:-rotate-90">P</span
						>
					</div>
					<span class="mt-3 text-[7px] font-bold tracking-[0.2em] text-zinc-700">PROFILE</span>
				</button>
			{/if}

			<button class="group relative flex flex-col items-center gap-1 transition-all duration-300">
				<div
					class="flex h-10 w-10 rotate-45 items-center justify-center border border-emerald-500/50 bg-emerald-500/10 text-emerald-400 transition-all group-hover:rotate-90"
				>
					<span class="-rotate-45 text-xs font-bold transition-all group-hover:-rotate-90">S</span>
				</div>
				<span class="mt-3 text-[7px] font-bold tracking-[0.2em] text-emerald-500">SETTINGS</span>
				<div
					class="absolute top-1/2 -left-8 h-8 w-1 -translate-y-1/2 bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.8)]"
				></div>
			</button>
		</div>
	</nav>

	<main class="scrollbar-hide flex-1 overflow-y-auto bg-[#080808] p-10">
		<div class="mx-auto max-w-4xl">
			<header class="mb-12">
				<div class="mb-4 flex items-center gap-2">
					<div class="h-[1px] w-8 bg-gradient-to-r from-transparent to-emerald-500/50"></div>
					<span
						class="font-display text-[10px] font-bold tracking-[0.2em] text-emerald-500 uppercase"
						>System Control</span
					>
					<div
						class="h-[1px] flex-1 bg-gradient-to-r from-emerald-500/50 to-transparent opacity-30"
					></div>
				</div>
				<h1
					class="font-display text-4xl leading-none font-black tracking-tighter text-white uppercase italic"
				>
					Intelligence Settings
				</h1>
			</header>

			{#if !data.user}
				<div
					class="border border-zinc-800 bg-[#0c0c0c] p-10 text-center shadow-[inset_0_0_40px_rgba(0,0,0,0.5)]"
				>
					<p class="mb-6 font-sans text-sm tracking-widest text-zinc-500 uppercase">
						Authentication required to access system maintenance tools
					</p>
					<a
						href="/auth/login"
						class="inline-block border border-emerald-500/40 px-8 py-3 font-sans text-[10px] font-bold tracking-[0.3em] text-emerald-500 uppercase transition-all hover:bg-emerald-500/10"
					>
						Authorize via Bungie.net
					</a>
				</div>
			{:else}
				<div class="space-y-10">
					<!-- Profile Info -->
					<section
						class="border border-zinc-800 bg-[#0c0c0c] p-8 shadow-[inset_0_0_30px_rgba(0,0,0,0.5)]"
					>
						<span
							class="mb-4 block font-sans text-[8px] font-bold tracking-[0.2em] text-zinc-600 uppercase"
							>Authorized Profile</span
						>
						<div class="flex items-center gap-6">
							<div
								class="flex h-16 w-16 items-center justify-center border border-zinc-700 bg-[#111111] p-1 shadow-2xl"
							>
								<div class="flex h-full w-full items-center justify-center bg-[#0a0a0a]">
									<span class="text-2xl font-black text-zinc-800 italic"
										>{data.user.displayName.substring(0, 2).toUpperCase()}</span
									>
								</div>
							</div>
							<div>
								<h2 class="font-display text-2xl font-bold tracking-tight text-white uppercase">
									{data.user.bungieGlobalDisplayName}<span class="text-zinc-600"
										>#{data.user.bungieGlobalDisplayNameCode}</span
									>
								</h2>
								<p
									class="mt-1 font-sans text-[10px] font-bold tracking-widest text-emerald-500/70 uppercase"
								>
									System Link Active
								</p>
							</div>
						</div>
					</section>

					<!-- Maintenance Tools -->
					<section class="space-y-6">
						<div class="flex items-center gap-2">
							<span
								class="font-display text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase"
								>Maintenance Tools</span
							>
							<div class="h-[1px] flex-1 bg-zinc-800/50"></div>
						</div>

						<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
							<!-- Deep Scan -->
							<div
								class="group relative overflow-hidden border border-zinc-800 bg-[#0c0c0c] p-6 transition-all hover:border-emerald-500/30"
							>
								<div class="relative z-10">
									<h3
										class="mb-2 font-display text-sm font-black tracking-widest text-zinc-100 uppercase italic"
									>
										Deep Career Scan
									</h3>
									<p class="mb-6 font-sans text-[10px] leading-relaxed text-zinc-500 uppercase">
										Performs an exhaustive crawl of your entire Destiny 2 history to index
										historical matches not found in recent lists.
									</p>
									<button
										onclick={triggerDeepScan}
										disabled={deepScanning}
										class="flex w-full items-center justify-center gap-3 border {deepScanning
											? 'border-zinc-800 text-zinc-600'
											: 'border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10'} py-3 transition-all"
									>
										<span class="font-sans text-[10px] font-bold tracking-[0.2em] uppercase"
											>{deepScanning ? 'Processing...' : 'Initiate Full Scan'}</span
										>
										<div
											class="flex h-4 w-4 rotate-45 items-center justify-center border border-current {deepScanning
												? 'animate-spin'
												: 'transition-transform duration-500 group-hover:rotate-90'}"
										>
											<div class="h-1.5 w-1.5 bg-current"></div>
										</div>
									</button>
								</div>
							</div>

							<!-- Repair Data -->
							<div
								class="group relative overflow-hidden border border-zinc-800 bg-[#0c0c0c] p-6 transition-all hover:border-rose-500/30"
							>
								<div class="relative z-10">
									<h3
										class="mb-2 font-display text-sm font-black tracking-widest text-rose-500 uppercase italic"
									>
										Repair Intelligence
									</h3>
									<p class="mb-6 font-sans text-[10px] leading-relaxed text-zinc-500 uppercase">
										Wipes your local intelligence cache and re-indexes all data. Use this if your
										stats appear corrupted or incorrect.
									</p>
									<button
										onclick={repairData}
										disabled={deepScanning}
										class="flex w-full items-center justify-center gap-3 border {deepScanning
											? 'border-zinc-800 text-zinc-600'
											: 'border-rose-900/30 text-rose-800 hover:border-rose-500 hover:bg-rose-500/10'} py-3 transition-all"
									>
										<span class="font-sans text-[10px] font-bold tracking-[0.2em] uppercase"
											>Repair Data</span
										>
										<div
											class="flex h-4 w-4 rotate-45 items-center justify-center border border-current"
										>
											<span class="-rotate-45 text-[10px] font-black">!</span>
										</div>
									</button>
								</div>
							</div>
						</div>
					</section>

					<!-- Scan Status -->
					{#if deepScanning}
						<div
							class="border border-emerald-500/20 bg-emerald-950/10 p-6 shadow-2xl"
							in:fly={{ y: 20, duration: 500 }}
						>
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-6">
									<div
										class="flex h-10 w-10 rotate-45 animate-[spin_4s_linear_infinite] items-center justify-center border border-emerald-500"
									>
										<div class="h-5 w-5 rotate-45 border border-emerald-400"></div>
									</div>
									<div>
										<p
											class="font-display text-[12px] font-black tracking-[0.3em] text-emerald-500 uppercase"
										>
											{#if deepScanStatus === 'syncing'}
												Mirroring Manifest...
											{:else if deepScanStatus === 'discovering'}
												Discovering History...
											{:else if deepScanStatus === 'enriching'}
												Enriching Career Intelligence...
											{:else}
												System Maintenance...
											{/if}
										</p>
										<p
											class="mt-1 font-sans text-[10px] font-bold tracking-[0.2em] text-emerald-600/80 uppercase"
										>
											{deepScanProgress.current} / {deepScanProgress.total} segments processed
										</p>
									</div>
								</div>
								<div class="text-right">
									<span
										class="font-display text-3xl font-light tracking-tighter text-emerald-400 italic"
									>
										{deepScanProgress.total > 0
											? Math.round((deepScanProgress.current / deepScanProgress.total) * 100)
											: 0}%
									</span>
								</div>
							</div>
							<div class="mt-6 h-[1px] w-full bg-zinc-800">
								<div
									class="h-full bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,1)] transition-all duration-700 ease-out"
									style="width: {deepScanProgress.total > 0
										? (deepScanProgress.current / deepScanProgress.total) * 100
										: 0}%"
								></div>
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</main>
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
