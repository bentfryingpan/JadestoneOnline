<script>
    let { char, eq, sockets } = $props();

    const elementMap  = { 2: 'arc', 3: 'solar', 4: 'void', 6: 'stasis', 7: 'strand' };

    const isPrismatic = $derived((eq.subclass?.name ?? '').toLowerCase().includes('prismatic'));
    const element     = $derived(isPrismatic ? 'prismatic' : (elementMap[eq.subclass?.damageType] ?? null));
    const classKey    = $derived({ 0: 'titan', 1: 'hunter', 2: 'warlock' }[char?.classType] ?? null);

    const bgImage = $derived(classKey && element ? `/subclass/${classKey}/${element}/bg.png` : null);

    // ── Slot positions: left% and top% are the CENTRE of each icon slot,
    //    measured as a percentage of the FULL native image dimensions.
    //    All non-prismatic elements share the same positions (only bg changes).
    //    Prismatic shifts abilities/aspects down because of the Transcendence bar.

    const ICON  = 5.2;   // ability / aspect icon width  (% of image width)
    const FRAG  = 4.6;   // fragment icon width
    const TRANS = 5.8;   // transcendence icon width

    const STD = {
        abilities: [
            { l: 32.8, t: 37.5 },
            { l: 38.5, t: 37.5 },
            { l: 44.2, t: 37.5 },
            { l: 49.8, t: 37.5 }
        ],
        aspects: [
            { l: 60.6, t: 37.5 },
            { l: 66.3, t: 37.5 }
        ],
        fragStart: { l: 31.0, t: 71.5 },
        fragStep:  5.5
    };

    const PRI = {
        transcendence: [
            { l: 37.8, t: 23.5 },
            { l: 43.4, t: 23.5 }
        ],
        abilities: [
            { l: 32.8, t: 44.5 },
            { l: 38.5, t: 44.5 },
            { l: 44.2, t: 44.5 },
            { l: 49.8, t: 44.5 }
        ],
        aspects: [
            { l: 60.6, t: 44.5 },
            { l: 66.3, t: 44.5 }
        ],
        fragStart: { l: 31.0, t: 71.5 },
        fragStep:  5.5
    };

    const layout = $derived(isPrismatic ? PRI : STD);

    const fragPositions = $derived(
        (sockets.fragments ?? []).map((_, i) => ({
            l: layout.fragStart.l + i * layout.fragStep,
            t: layout.fragStart.t
        }))
    );

    // Helper: inline style string for an icon centred on (l%, t%)
    function pos(l, t, size) {
        return `position:absolute; left:${l}%; top:${t}%; width:${size}%; aspect-ratio:1/1; transform:translate(-50%,-50%);`;
    }
</script>

{#if bgImage}
<!-- Container grows to match native image height — no cropping -->
<div class="relative w-full rounded-lg overflow-hidden select-none">

    <!-- Full native-size background image -->
    <img src={bgImage} alt="" class="block w-full h-auto" draggable="false" />

    <!-- Overlay canvas (covers image exactly) -->
    <div class="absolute inset-0 pointer-events-none">

        <!-- Stat mask: covers the bottom-left armor-stat numbers -->
        <div class="absolute inset-0"
             style="background: radial-gradient(ellipse 32% 52% at -2% 108%, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.92) 30%, rgba(0,0,0,0.60) 58%, transparent 76%);"></div>

        <!-- Subtle right-edge fade -->
        <div class="absolute inset-0"
             style="background: linear-gradient(to right, transparent 68%, rgba(0,0,0,0.2) 100%);"></div>
    </div>

    <!-- ── Transcendence (Prismatic only) ── -->
    {#if isPrismatic && layout.transcendence}
        {#each layout.transcendence as tpos, i}
        <!-- slot placeholder — Bungie doesn't expose transcendence meter icons via API,
             so we leave the screenshot icons visible and don't overlay here -->
        {/each}
    {/if}

    <!-- ── Abilities ── -->
    {#each sockets.abilities ?? [] as ability, i}
        {@const p = layout.abilities[i]}
        {#if p && ability?.icon}
        <div class="group z-10 cursor-default pointer-events-auto" style={pos(p.l, p.t, ICON)}>
            <!-- frosted glass backdrop -->
            <div class="absolute inset-0 rounded bg-black/55 backdrop-blur-[2px] border border-white/10"></div>
            <img src={ability.icon} alt={ability.name}
                 class="relative w-full h-full object-cover rounded" />
            <!-- tooltip -->
            <div class="absolute bottom-[110%] left-1/2 -translate-x-1/2 hidden group-hover:block z-40 pointer-events-none w-48">
                <div class="bg-[#12141f]/95 border border-white/20 text-white px-3 py-2 rounded shadow-xl text-xs">
                    <p class="font-bold">{ability.name}</p>
                    <p class="text-gray-400 mt-0.5">{ability.itemTypeDisplayName}</p>
                    {#if ability.description}<p class="text-gray-500 mt-1 leading-snug">{ability.description}</p>{/if}
                </div>
            </div>
        </div>
        {/if}
    {/each}

    <!-- ── Aspects ── -->
    {#each sockets.aspects ?? [] as aspect, i}
        {@const p = layout.aspects[i]}
        {#if p && aspect?.icon}
        <div class="group z-10 cursor-default pointer-events-auto" style={pos(p.l, p.t, ICON)}>
            <div class="absolute inset-0 rounded bg-black/55 backdrop-blur-[2px] border border-white/10"></div>
            <img src={aspect.icon} alt={aspect.name}
                 class="relative w-full h-full object-cover rounded" />
            <div class="absolute bottom-[110%] left-1/2 -translate-x-1/2 hidden group-hover:block z-40 pointer-events-none w-48">
                <div class="bg-[#12141f]/95 border border-white/20 text-white px-3 py-2 rounded shadow-xl text-xs">
                    <p class="font-bold">{aspect.name}</p>
                    <p class="text-gray-400 mt-0.5">Aspect</p>
                    {#if aspect.description}<p class="text-gray-500 mt-1 leading-snug">{aspect.description}</p>{/if}
                </div>
            </div>
        </div>
        {/if}
    {/each}

    <!-- ── Fragments ── -->
    {#each sockets.fragments ?? [] as fragment, i}
        {@const p = fragPositions[i]}
        {#if p && fragment?.icon}
        <div class="group z-10 cursor-default pointer-events-auto" style={pos(p.l, p.t, FRAG)}>
            <div class="absolute inset-0 rounded bg-black/55 backdrop-blur-[2px] border border-white/10"></div>
            <img src={fragment.icon} alt={fragment.name}
                 class="relative w-full h-full object-cover rounded" />
            <div class="absolute bottom-[110%] left-1/2 -translate-x-1/2 hidden group-hover:block z-40 pointer-events-none w-44">
                <div class="bg-[#12141f]/95 border border-white/20 text-white px-3 py-2 rounded shadow-xl text-xs text-center">
                    <p class="font-bold">{fragment.name}</p>
                    {#if fragment.description}<p class="text-gray-500 mt-1 leading-snug">{fragment.description}</p>{/if}
                </div>
            </div>
        </div>
        {/if}
    {/each}

    <!-- ── Super chip (bottom-right) ── -->
    {#if sockets.super}
    <div class="absolute bottom-3 right-3 z-20 group cursor-default pointer-events-auto
                flex items-center gap-2 bg-black/60 border border-white/15
                rounded px-2.5 py-1.5 backdrop-blur-sm">
        <div class="relative w-6 h-6 shrink-0">
            <div class="absolute inset-0 rounded bg-black/40"></div>
            <img src={sockets.super.icon} alt={sockets.super.name} class="relative w-full h-full object-cover rounded" />
        </div>
        <span class="text-xs font-semibold text-white">{sockets.super.name}</span>
        <div class="absolute bottom-full right-0 mb-2 hidden group-hover:block z-40 pointer-events-none w-48">
            <div class="bg-[#12141f]/95 border border-white/20 text-white px-3 py-2 rounded shadow-xl text-xs">
                <p class="font-bold">{sockets.super.name}</p>
                <p class="text-gray-400 mt-0.5">Super Ability</p>
                {#if sockets.super.description}<p class="text-gray-500 mt-1 leading-snug">{sockets.super.description}</p>{/if}
            </div>
        </div>
    </div>
    {/if}

</div>

{:else}
<div class="w-full rounded-lg bg-[#13161e] border border-white/8 flex items-center justify-center py-16">
    <p class="text-xs text-gray-600">No subclass background available</p>
</div>
{/if}
