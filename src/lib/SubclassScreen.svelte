<script>
    let { char, eq, sockets } = $props();

    const classNames = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' };
    const elementMap  = { 2: 'arc', 3: 'solar', 4: 'void', 6: 'stasis', 7: 'strand' };

    const isPrismatic = $derived((eq.subclass?.name ?? '').toLowerCase().includes('prismatic'));
    const element     = $derived(isPrismatic ? 'prismatic' : (elementMap[eq.subclass?.damageType] ?? null));
    const classKey    = $derived({ 0: 'titan', 1: 'hunter', 2: 'warlock' }[char?.classType] ?? null);

    const bgImage = $derived(classKey && element ? `/subclass/${classKey}/${element}/bg.png` : null);

    // Dark corner color used by the gradient to erase the stat numbers
    const maskColors = {
        strand:    '#010d04',
        stasis:    '#03080f',
        void:      '#06021a',
        solar:     '#130400',
        arc:       '#020810',
        prismatic: '#0f0618'
    };
    const maskColor = $derived(maskColors[element] ?? '#080808');

    // ── Slot positions as % of image (left = x-center, top = y-center) ──
    // Measured from in-game screenshots at 1920×1080.
    // All non-prismatic subclasses share identical slot positions per class.
    // Prismatic has a TRANSCENDENCE bar above ABILITIES, shifting them down ~7%.

    const ICON_PCT  = 5.0;   // icon width as % of container
    const FRAG_PCT  = 4.4;   // fragments are slightly smaller

    const STD = {
        subclass:    { l: 17.1, t: 42.5 },
        abilities: [
            { l: 32.8, t: 36.5 },
            { l: 38.5, t: 36.5 },
            { l: 44.1, t: 36.5 },
            { l: 49.7, t: 36.5 }
        ],
        aspects: [
            { l: 60.5, t: 36.5 },
            { l: 66.2, t: 36.5 }
        ],
        fragStart: 31.0,
        fragY:     69.5,
        fragStep:   6.0
    };

    const PRI = {
        subclass:    { l: 17.1, t: 42.5 },
        transcendence: [
            { l: 37.8, t: 23.0 },
            { l: 43.4, t: 23.0 }
        ],
        abilities: [
            { l: 32.8, t: 43.5 },
            { l: 38.5, t: 43.5 },
            { l: 44.1, t: 43.5 },
            { l: 49.7, t: 43.5 }
        ],
        aspects: [
            { l: 60.5, t: 43.5 },
            { l: 66.2, t: 43.5 }
        ],
        fragStart: 31.0,
        fragY:     69.5,
        fragStep:   6.0
    };

    const layout = $derived(isPrismatic ? PRI : STD);

    const fragPositions = $derived(
        (sockets.fragments ?? []).map((_, i) => ({
            l: layout.fragStart + i * layout.fragStep,
            t: layout.fragY
        }))
    );
</script>

{#if bgImage}
<!-- ── Subclass screen overlay ── -->
<div class="relative w-full overflow-hidden rounded-lg select-none" style="aspect-ratio:1920/788">

    <!-- Background screenshot -->
    <img src={bgImage} alt="" class="absolute inset-0 w-full h-full object-cover object-center" draggable="false" />

    <!-- Stat mask: radial gradient erases the bottom-left armor stats -->
    <div class="absolute inset-0 pointer-events-none"
         style="background: radial-gradient(ellipse 22% 30% at 0% 102%, {maskColor} 0%, {maskColor} 38%, transparent 68%);"></div>

    <!-- Right-edge darkening so the character art blends gracefully -->
    <div class="absolute inset-0 pointer-events-none"
         style="background: linear-gradient(to right, transparent 65%, rgba(0,0,0,0.25) 100%);"></div>

    <!-- ── Ability icons ── -->
    {#each sockets.abilities ?? [] as ability, i}
        {@const pos = layout.abilities[i]}
        {#if pos && ability.icon}
        <div class="absolute -translate-x-1/2 -translate-y-1/2 group z-10 cursor-default"
             style="left:{pos.l}%; top:{pos.t}%; width:{ICON_PCT}%; aspect-ratio:1/1;">
            <img src={ability.icon} alt={ability.name} class="w-full h-full object-cover rounded drop-shadow-lg" />
            <!-- Tooltip -->
            <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-40 pointer-events-none">
                <div class="bg-[#12141f]/95 border border-white/20 text-white px-3 py-2 rounded shadow-xl w-48 text-xs">
                    <p class="font-bold">{ability.name}</p>
                    <p class="text-gray-400 mt-0.5">{ability.itemTypeDisplayName}</p>
                    {#if ability.description}<p class="text-gray-500 mt-1 leading-snug">{ability.description}</p>{/if}
                </div>
            </div>
        </div>
        {/if}
    {/each}

    <!-- ── Aspect icons ── -->
    {#each sockets.aspects ?? [] as aspect, i}
        {@const pos = layout.aspects[i]}
        {#if pos && aspect.icon}
        <div class="absolute -translate-x-1/2 -translate-y-1/2 group z-10 cursor-default"
             style="left:{pos.l}%; top:{pos.t}%; width:{ICON_PCT}%; aspect-ratio:1/1;">
            <img src={aspect.icon} alt={aspect.name} class="w-full h-full object-cover rounded drop-shadow-lg" />
            <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-40 pointer-events-none">
                <div class="bg-[#12141f]/95 border border-white/20 text-white px-3 py-2 rounded shadow-xl w-48 text-xs">
                    <p class="font-bold">{aspect.name}</p>
                    <p class="text-gray-400 mt-0.5">Aspect</p>
                    {#if aspect.description}<p class="text-gray-500 mt-1 leading-snug">{aspect.description}</p>{/if}
                </div>
            </div>
        </div>
        {/if}
    {/each}

    <!-- ── Fragment icons ── -->
    {#each sockets.fragments ?? [] as fragment, i}
        {@const pos = fragPositions[i]}
        {#if pos && fragment.icon}
        <div class="absolute -translate-x-1/2 -translate-y-1/2 group z-10 cursor-default"
             style="left:{pos.l}%; top:{pos.t}%; width:{FRAG_PCT}%; aspect-ratio:1/1;">
            <img src={fragment.icon} alt={fragment.name} class="w-full h-full object-cover rounded drop-shadow-lg" />
            <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-40 pointer-events-none">
                <div class="bg-[#12141f]/95 border border-white/20 text-white px-3 py-2 rounded shadow-xl w-44 text-xs text-center">
                    <p class="font-bold">{fragment.name}</p>
                    {#if fragment.description}<p class="text-gray-500 mt-1 leading-snug">{fragment.description}</p>{/if}
                </div>
            </div>
        </div>
        {/if}
    {/each}

    <!-- ── Super label (bottom-right overlay) ── -->
    {#if sockets.super}
    <div class="absolute bottom-3 right-3 z-10 group cursor-default flex items-center gap-2
                bg-black/50 border border-white/10 rounded px-2.5 py-1.5 backdrop-blur-sm">
        <img src={sockets.super.icon} alt={sockets.super.name} class="w-6 h-6 rounded" />
        <span class="text-xs font-semibold text-white">{sockets.super.name}</span>
        <!-- Tooltip -->
        <div class="absolute bottom-full right-0 mb-2 hidden group-hover:block z-40 pointer-events-none">
            <div class="bg-[#12141f]/95 border border-white/20 text-white px-3 py-2 rounded shadow-xl w-48 text-xs">
                <p class="font-bold">{sockets.super.name}</p>
                <p class="text-gray-400 mt-0.5">Super Ability</p>
                {#if sockets.super.description}<p class="text-gray-500 mt-1 leading-snug">{sockets.super.description}</p>{/if}
            </div>
        </div>
    </div>
    {/if}

</div>

{:else}
<!-- ── Fallback: no background image (unknown subclass) ── -->
<div class="w-full rounded-lg bg-[#13161e] border border-white/8 p-4 flex flex-col gap-3"
     style="aspect-ratio:1920/788; justify-content:center;">
    <p class="text-xs text-gray-500 text-center">Subclass screen not available</p>
</div>
{/if}
