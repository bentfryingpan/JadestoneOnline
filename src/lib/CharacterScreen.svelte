<script>
    // Slot positions measured from the in-game character screen reference screenshot.
    // All values are percentages of the full native image width/height.
    // left/top = CENTER of the icon slot.
    // Icon size is roughly 6.9% of image width (same for weapons and armor).
    // Ghost/vehicle/ship icons are slightly smaller (~5.5%).

    let { char, eq, light } = $props();

    const classMap   = { 0: 'titan', 1: 'hunter', 2: 'warlock' };
    const lightTypes = new Set([2, 3, 4]); // arc, solar, void
    const darkTypes  = new Set([6, 7]);    // stasis, strand

    const isPrismatic = $derived((eq.subclass?.name ?? '').toLowerCase().includes('prismatic'));
    const classKey    = $derived(classMap[char?.classType] ?? null);
    const mood        = $derived((() => {
        if (isPrismatic) return 'prismatic';
        if (darkTypes.has(eq.subclass?.damageType)) return 'dark';
        return 'light';
    })());

    const bgImage = $derived(classKey ? `/charscreen/${classKey}/${mood}/bg.png` : null);
    const hasBg   = $derived(bgImage !== null);

    // ── Measured slot positions (% of full native image) ──────────────────
    // Reference image: Hunter character screen, approximately 1308×982

    const ICON  = 6.9;   // weapon / armor icon size (% of width, square)
    const SMALL = 5.5;   // ghost / vehicle / ship

    const SLOTS = {
        // Weapons – left column
        kinetic:  { l:  8.4, t: 25.0 },
        energy:   { l:  8.4, t: 38.0 },
        power:    { l:  8.4, t: 52.0 },
        ghost:    { l:  8.4, t: 66.0, small: true },
        vehicle:  { l:  8.4, t: 80.0, small: true },

        // Armor – right column
        helmet:   { l: 91.5, t: 14.0 },
        gauntlets:{ l: 91.5, t: 27.5 },
        chest:    { l: 91.5, t: 41.0 },
        legs:     { l: 91.5, t: 53.5 },
        classItem:{ l: 91.5, t: 66.0 },
        ship:     { l: 91.5, t: 79.0, small: true },
    };

    // Power level display position (where the number appears in the screenshot)
    const POWER_POS = { l: 73.5, t: 18.0 };

    // Helper: inline style to centre an icon at (l%, t%)
    function iconStyle(l, t, size) {
        return `position:absolute; left:${l}%; top:${t}%; width:${size}%; aspect-ratio:1/1; transform:translate(-50%,-50%);`;
    }

    // Tier border colours
    const tierBorder = {
        6: 'outline outline-2 outline-yellow-400',
        5: 'outline outline-2 outline-purple-500',
        4: 'outline outline-2 outline-blue-400',
        3: 'outline outline-2 outline-green-600',
    };
</script>

{#if hasBg}
<!-- Full native image — no fixed aspect-ratio so nothing is cropped -->
<div class="relative w-full rounded-lg overflow-hidden select-none">

    <img src={bgImage} alt="" class="block w-full h-auto" draggable="false" />

    <!-- Overlay canvas -->
    <div class="absolute inset-0">

        <!-- ── Stats mask: covers the stat numbers in the centre-right area ── -->
        <div class="absolute pointer-events-none"
             style="left:54%; top:26%; width:26%; height:44%;
                    background: radial-gradient(ellipse at 50% 50%,
                        rgba(0,0,0,0.88) 0%,
                        rgba(0,0,0,0.70) 42%,
                        transparent 72%);"></div>

        <!-- ── Power level overlay (replaces the screenshot number) ── -->
        {#if light !== undefined}
        <div class="absolute pointer-events-none"
             style="left:{POWER_POS.l}%; top:{POWER_POS.t}%; transform:translate(-50%,-50%);">
            <p class="text-yellow-400 font-black leading-none drop-shadow-lg"
               style="font-size:clamp(16px, 3.2vw, 44px);">{light}</p>
        </div>
        {/if}

        <!-- ── Weapon slots ── -->
        {#each ['kinetic','energy','power'] as slot}
            {@const item = eq[slot]}
            {@const sp = SLOTS[slot]}
            {#if item?.icon}
            <div class="group cursor-default pointer-events-auto" style={iconStyle(sp.l, sp.t, ICON)}>
                <!-- frosted backdrop -->
                <div class="absolute inset-0 rounded-sm bg-black/50 backdrop-blur-[2px]"></div>
                <img src={item.icon} alt={item.name}
                     class="relative w-full h-full object-cover rounded-sm {tierBorder[item.tierType] ?? ''}" />
                <!-- tooltip -->
                <div class="absolute bottom-[110%] left-1/2 -translate-x-1/2 hidden group-hover:block z-40 pointer-events-none w-52">
                    <div class="bg-[#12141f]/95 border border-white/20 text-white px-3 py-2 rounded shadow-xl text-xs">
                        <p class="font-bold">{item.name}</p>
                        <p class="text-gray-400 mt-0.5">{item.itemTypeDisplayName}</p>
                    </div>
                </div>
            </div>
            {/if}
        {/each}

        <!-- ── Ghost / Vehicle / Ship ── -->
        {#each ['ghost','vehicle','ship'] as slot}
            {@const item = eq[slot]}
            {@const sp = SLOTS[slot]}
            {#if item?.icon && sp}
            <div class="group cursor-default pointer-events-auto" style={iconStyle(sp.l, sp.t, SMALL)}>
                <div class="absolute inset-0 rounded-sm bg-black/50 backdrop-blur-[2px]"></div>
                <img src={item.icon} alt={item.name}
                     class="relative w-full h-full object-cover rounded-sm" />
                <div class="absolute bottom-[110%] left-1/2 -translate-x-1/2 hidden group-hover:block z-40 pointer-events-none w-44">
                    <div class="bg-[#12141f]/95 border border-white/20 text-white px-3 py-2 rounded shadow-xl text-xs">
                        <p class="font-bold">{item.name}</p>
                        <p class="text-gray-400 capitalize">{slot}</p>
                    </div>
                </div>
            </div>
            {/if}
        {/each}

        <!-- ── Armor slots ── -->
        {#each ['helmet','gauntlets','chest','legs','classItem'] as slot}
            {@const item = eq[slot]}
            {@const sp = SLOTS[slot]}
            {#if item?.icon}
            <div class="group cursor-default pointer-events-auto" style={iconStyle(sp.l, sp.t, ICON)}>
                <div class="absolute inset-0 rounded-sm bg-black/50 backdrop-blur-[2px]"></div>
                <img src={item.icon} alt={item.name}
                     class="relative w-full h-full object-cover rounded-sm {tierBorder[item.tierType] ?? ''}" />
                <div class="absolute bottom-[110%] right-0 hidden group-hover:block z-40 pointer-events-none w-52">
                    <div class="bg-[#12141f]/95 border border-white/20 text-white px-3 py-2 rounded shadow-xl text-xs">
                        <p class="font-bold">{item.name}</p>
                        <p class="text-gray-400 mt-0.5">{item.itemTypeDisplayName}</p>
                        {#if item.armorStats}
                        <div class="mt-2 space-y-1">
                            {#each item.armorStats as s}
                            <div class="flex items-center gap-1.5">
                                <span class="text-[9px] font-bold w-6 {s.text}">{s.short}</span>
                                <div class="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                                    <div class="h-full {s.color} rounded-full" style="width:{Math.min(100,(s.value/42)*100).toFixed(0)}%"></div>
                                </div>
                                <span class="text-[9px] text-gray-300 w-4 text-right">{s.value}</span>
                            </div>
                            {/each}
                        </div>
                        {/if}
                    </div>
                </div>
            </div>
            {/if}
        {/each}

    </div>
</div>

{:else}
<!-- ── Placeholder until screenshots are provided ── -->
<div class="w-full rounded-lg bg-[#13161e] border border-white/8 overflow-hidden">
    <div class="aspect-[4/3] flex flex-col items-center justify-center gap-4 text-center px-8">
        <p class="text-gray-400 font-semibold text-sm">Character screen coming soon</p>
        <p class="text-gray-600 text-xs leading-relaxed">
            Drop a screenshot of the character screen for {char?.classType === 0 ? 'Titan' : char?.classType === 1 ? 'Hunter' : 'Warlock'}
            into <code class="text-gray-500">static/charscreen/{classKey}/{mood}/bg.png</code>
        </p>
        <!-- Fallback: render icons in card form so nothing is hidden -->
        <div class="grid grid-cols-3 gap-2 mt-2 w-full max-w-xs">
            {#each ['kinetic','energy','power','helmet','gauntlets','chest','legs','classItem','ghost'] as slot}
                {@const item = eq[slot]}
                {#if item?.icon}
                <div class="group relative flex flex-col items-center gap-1 bg-white/5 border border-white/8 rounded p-1.5">
                    <img src={item.icon} alt={item.name} class="w-10 h-10 object-cover rounded" />
                    <p class="text-[8px] text-gray-500 truncate w-full text-center">{item.name}</p>
                </div>
                {/if}
            {/each}
        </div>
    </div>
</div>
{/if}
