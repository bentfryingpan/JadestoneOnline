<script>
	const { data } = $props();

	const profileUrl = data.primaryName && data.primaryCode
		? `/profile/${encodeURIComponent(data.primaryName)}/${String(data.primaryCode).padStart(4,'0')}`
		: data.primaryId
			? `/profile/Guardian/0000?mid=${data.primaryId}&mt=${data.primaryMt ?? 3}`
			: '/';
</script>

<div class="flex min-h-screen flex-col items-center justify-center bg-[#080808] px-4 font-sans">
	<div class="w-full max-w-md border border-zinc-800 bg-[#0a0a0a] p-8">
		{#if data.success}
			<div class="flex flex-col items-center gap-4 text-center">
				<div class="flex h-12 w-12 rotate-45 items-center justify-center bg-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.4)]">
					<span class="-rotate-45 text-xl font-black text-black">✓</span>
				</div>
				<h1 class="text-lg font-black tracking-[0.2em] text-white uppercase">Alt Account Linked</h1>
				<p class="text-sm text-zinc-400">
					The account has been verified and linked. Ratings will sync shortly.
				</p>
				<a
					href={profileUrl}
					class="mt-2 border border-emerald-500/40 px-6 py-2 text-[10px] font-bold tracking-[0.3em] text-emerald-400 uppercase hover:bg-emerald-500/10 transition-colors"
				>
					Back to Profile
				</a>
			</div>
		{:else}
			<div class="flex flex-col items-center gap-4 text-center">
				<div class="flex h-12 w-12 rotate-45 items-center justify-center bg-red-500/20 border border-red-500/40">
					<span class="-rotate-45 text-xl font-black text-red-400">✕</span>
				</div>
				<h1 class="text-lg font-black tracking-[0.2em] text-white uppercase">Link Failed</h1>
				<p class="text-sm text-zinc-400">{data.message}</p>
				<a
					href="/"
					class="mt-2 border border-zinc-700 px-6 py-2 text-[10px] font-bold tracking-[0.3em] text-zinc-400 uppercase hover:bg-zinc-800 transition-colors"
				>
					Go Home
				</a>
			</div>
		{/if}
	</div>
</div>
