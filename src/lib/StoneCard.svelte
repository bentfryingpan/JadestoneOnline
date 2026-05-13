<script>
	/** Basalt & Silver stone card — reusable container with optional sheen, corner accents, and GhostLabel */
	let {
		title = '', // GhostLabel header text
		accent = false, // emerald left-border accent stripe
		sheen = true, // hover sheen animation
		class: cls = '', // extra classes on the root
		children
	} = $props();
</script>

<div
	class="relative border border-zinc-800 bg-[#111111]
            shadow-[inset_0_0_30px_rgba(0,0,0,0.5)]
            {accent ? 'border-l-2 border-l-emerald-500' : ''}
            {sheen ? 'stone-sheen' : ''}
            {cls}"
>
	<!-- Corner accents — top-left & bottom-right -->
	<span
		class="pointer-events-none absolute top-0 left-0 h-2 w-2 border-t border-l border-emerald-500/40"
	></span>
	<span
		class="pointer-events-none absolute right-0 bottom-0 h-2 w-2 border-r border-b border-emerald-500/40"
	></span>

	{#if title}
		<div class="border-b border-zinc-800/80 px-4 pt-3 pb-2">
			<span class="font-mono text-[9px] tracking-[0.25em] text-zinc-500 uppercase">{title}</span>
		</div>
	{/if}

	{@render children()}
</div>
