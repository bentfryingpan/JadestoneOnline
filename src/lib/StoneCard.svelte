<script>
    /** Basalt & Silver stone card — reusable container with optional sheen, corner accents, and GhostLabel */
    let {
        title      = '',          // GhostLabel header text
        accent     = false,       // emerald left-border accent stripe
        sheen      = true,        // hover sheen animation
        class: cls = '',          // extra classes on the root
        children,
    } = $props();
</script>

<div class="relative bg-[#111111] border border-zinc-800
            shadow-[inset_0_0_30px_rgba(0,0,0,0.5)]
            {accent ? 'border-l-2 border-l-emerald-500' : ''}
            {sheen  ? 'stone-sheen' : ''}
            {cls}">

    <!-- Corner accents — top-left & bottom-right -->
    <span class="absolute top-0 left-0 w-2 h-2 border-t border-l border-emerald-500/40 pointer-events-none"></span>
    <span class="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-emerald-500/40 pointer-events-none"></span>

    {#if title}
        <div class="px-4 pt-3 pb-2 border-b border-zinc-800/80">
            <span class="text-[9px] font-mono uppercase tracking-[0.25em] text-zinc-500">{title}</span>
        </div>
    {/if}

    {@render children()}
</div>
