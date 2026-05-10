<script>
    let { char, eq, armorStatMeta = [], artifact = null } = $props();

    const TIER_LABEL = { 6: 'Exotic', 5: 'Legendary', 4: 'Rare', 3: 'Uncommon', 2: 'Common' };
    const classNames = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' };

    // ── Armor stat totals ──────────────────────────────────────────────────────
    const totalStats = $derived((() => {
        if (!armorStatMeta.length) return {};
        const slots  = ['helmet','gauntlets','chest','legs','classItem'];
        const totals = {};
        for (const m of armorStatMeta) totals[m.name] = 0;
        for (const slot of slots) {
            const item = eq[slot];
            if (item?.armorStats) for (const s of item.armorStats) totals[s.name] += s.value;
        }
        return totals;
    })());

    const grandTotal = $derived(Object.values(totalStats).reduce((a, b) => a + b, 0));
    const buildTier  = $derived((grandTotal / 10).toFixed(1));

    // Subclass element color for the center glow
    const subclassColor = $derived((() => {
        const n = (eq.subclass?.name ?? '').toLowerCase();
        if (n.includes('void'))   return 'rgba(109,40,217,0.15)';
        if (n.includes('solar'))  return 'rgba(234,88,12,0.15)';
        if (n.includes('arc'))    return 'rgba(8,145,178,0.15)';
        if (n.includes('stasis')) return 'rgba(29,78,216,0.15)';
        if (n.includes('strand')) return 'rgba(5,150,105,0.15)';
        if (n.includes('prismatic')) return 'rgba(219,39,119,0.15)';
        return 'rgba(16,185,129,0.07)';
    })());

    const subclassElement = $derived((() => {
        const n = (eq.subclass?.name ?? '').toLowerCase();
        if (n.includes('void'))    return { border: 'border-violet-500/50', glow: 'shadow-[0_0_20px_rgba(139,92,246,0.3)]', text: 'text-violet-400' };
        if (n.includes('solar'))   return { border: 'border-orange-500/50', glow: 'shadow-[0_0_20px_rgba(249,115,22,0.3)]', text: 'text-orange-400' };
        if (n.includes('arc'))     return { border: 'border-cyan-400/50',   glow: 'shadow-[0_0_20px_rgba(34,211,238,0.3)]', text: 'text-cyan-400'   };
        if (n.includes('stasis'))  return { border: 'border-blue-500/50',   glow: 'shadow-[0_0_20px_rgba(59,130,246,0.3)]', text: 'text-blue-400'   };
        if (n.includes('strand'))  return { border: 'border-emerald-500/50',glow: 'shadow-[0_0_20px_rgba(16,185,129,0.3)]', text: 'text-emerald-400'};
        return { border: 'border-zinc-600/50', glow: '', text: 'text-zinc-400' };
    })());
</script>

<!-- ── Loadout Layout ──────────────────────────────────────────────────────── -->
<div class="max-w-6xl mx-auto py-10 px-4">
    <div class="grid grid-cols-12 gap-12 items-start">

        <!-- ── COLUMN 1: SUBCLASS & WEAPONS (3/12) ────────────────────────── -->
        <div class="col-span-3 space-y-12 flex flex-col items-center">

            <!-- Subclass -->
            <div class="flex flex-col items-center group cursor-pointer w-full">
                <div class="w-24 h-24 flex items-center justify-center mx-auto relative">
                    <!-- Ambient glow -->
                    <div class="absolute inset-0 rounded-full blur-3xl animate-pulse"
                         style="background: {subclassColor}"></div>

                    {#if eq.subclass?.iconPath}
                        <!-- Real subclass icon inside rotated diamond frame -->
                        <div class="w-20 h-20 bg-[#0a0a0a] border-2 {subclassElement.border}
                                    flex items-center justify-center rotate-45
                                    group-hover:rotate-90 transition-all duration-700 shadow-2xl
                                    {subclassElement.glow} overflow-hidden">
                            <img src="https://www.bungie.net{eq.subclass.iconPath}" alt=""
                                 class="w-16 h-16 object-cover -rotate-45 group-hover:-rotate-90
                                        transition-all duration-700 scale-110" />
                        </div>
                    {:else}
                        <!-- Decorative diamond placeholder -->
                        <div class="w-20 h-20 bg-[#0a0a0a] border-2 border-zinc-800
                                    flex items-center justify-center rotate-45
                                    group-hover:border-emerald-500/50 group-hover:rotate-90
                                    transition-all duration-700 shadow-2xl">
                            <div class="w-10 h-10 border border-emerald-400/60 rotate-0
                                        flex items-center justify-center">
                                <div class="w-2 h-2 bg-emerald-500"></div>
                            </div>
                        </div>
                    {/if}
                </div>

                <div class="mt-6 text-center w-full">
                    <span class="text-[9px] text-zinc-600 uppercase tracking-[0.2em] font-bold block mb-1">
                        SUBCLASS
                    </span>
                    <p class="text-[11px] font-bold text-zinc-100 uppercase tracking-widest {subclassElement.text}">
                        {eq.subclass?.name ?? '—'}
                    </p>
                </div>
            </div>

            <!-- Weapons -->
            <div class="space-y-10 w-full flex flex-col items-center pt-8 border-t border-zinc-800/40">
                {#each [
                    { key: 'kinetic', label: 'KINETIC' },
                    { key: 'energy',  label: 'ENERGY'  },
                    { key: 'power',   label: 'POWER'   },
                ] as w}
                    {@const item   = eq[w.key]}
                    {@const exotic = item?.tierType === 6}
                    <div class="group flex flex-col items-center gap-2 cursor-pointer w-full">
                        <div class="w-20 h-20 bg-[#0c0c0c]
                                    border {exotic ? 'border-amber-500/20' : 'border-zinc-800'}
                                    relative group-hover:border-zinc-500 transition-all duration-300
                                    mx-auto overflow-hidden shadow-[inset_0_0_15px_rgba(0,0,0,0.5)]">
                            <!-- Rarity bar -->
                            <div class="absolute top-0 left-0 w-full h-px opacity-70
                                        {exotic ? 'bg-amber-500' : 'bg-zinc-100'}"></div>

                            {#if item?.iconPath}
                                <img src="https://www.bungie.net{item.iconPath}" alt=""
                                     class="w-full h-full object-cover" />
                            {:else}
                                <!-- Diamond placeholder -->
                                <div class="w-full h-full flex items-center justify-center
                                            opacity-10 group-hover:opacity-30 transition-opacity">
                                    <div class="w-10 h-10 border border-zinc-500 rotate-45"></div>
                                </div>
                            {/if}

                            <!-- Tier label -->
                            <div class="absolute bottom-0 right-0 px-1.5 bg-black/60
                                        text-[8px] text-zinc-500 uppercase font-bold tracking-tighter">
                                {TIER_LABEL[item?.tierType] ?? 'UNKNOWN'}
                            </div>
                        </div>

                        <div class="text-center w-full">
                            <p class="text-[8px] text-zinc-600 uppercase tracking-widest font-bold">{w.label}</p>
                            <p class="text-[10px] font-bold uppercase tracking-tight
                                      text-zinc-200 group-hover:text-white truncate w-28 mx-auto">
                                {item?.name ?? '—'}
                            </p>
                        </div>
                    </div>
                {/each}
            </div>
        </div>

        <!-- ── COLUMN 2: CHARACTER CORE (6/12) ────────────────────────────── -->
        <div class="col-span-6 relative flex items-center justify-center min-h-[500px]">

            <!-- Background decorative rings -->
            <div class="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none">
                <div class="w-[400px] h-[400px] border border-emerald-500 rounded-full animate-pulse"></div>
                <div class="absolute w-[500px] h-[500px] border border-zinc-800 rounded-full"></div>
            </div>

            <!-- Center content area -->
            <div class="w-80 h-[480px] relative z-10 flex flex-col items-center justify-center gap-8">

                <!-- Ambient gradient -->
                <div class="absolute inset-0 opacity-40 blur-3xl pointer-events-none"
                     style="background: linear-gradient(to top, {subclassColor}, transparent)">
                </div>

                <!-- Rotated label -->
                <div class="text-[10px] text-zinc-800 uppercase tracking-[1em] text-center
                            rotate-90 whitespace-nowrap font-bold select-none opacity-40 absolute">
                    CHARACTER_ENTITY
                </div>

                <!-- Real character data — centered -->
                <div class="relative flex flex-col items-center gap-4 z-10">
                    <!-- Class icon / emblem if available -->
                    {#if eq.subclass?.iconPath}
                        <div class="w-16 h-16 relative">
                            <div class="absolute inset-0 rounded-full blur-xl opacity-30"
                                 style="background: {subclassColor}"></div>
                            <img src="https://www.bungie.net{eq.subclass.iconPath}" alt=""
                                 class="w-16 h-16 object-cover opacity-20" />
                        </div>
                    {/if}

                    <!-- Class name -->
                    <div class="text-center">
                        <p class="text-[9px] text-zinc-700 uppercase tracking-[0.4em] font-bold mb-1">
                            Guardian Class
                        </p>
                        <p class="font-serif text-3xl font-light italic text-white/80 leading-none">
                            {classNames[char?.classType] ?? '—'}
                        </p>
                    </div>

                    <!-- Power level -->
                    {#if char?.light}
                        <div class="text-center border border-zinc-800 px-6 py-2 bg-[#0a0a0a]">
                            <p class="text-[8px] text-zinc-600 uppercase tracking-[0.3em] font-bold mb-1">
                                Power Level
                            </p>
                            <p class="text-2xl font-mono font-bold text-yellow-500/80">{char.light}</p>
                        </div>
                    {/if}

                    <!-- Artifact bonus -->
                    {#if artifact?.powerBonusProgression?.level}
                        <div class="text-center">
                            <p class="text-[8px] text-zinc-700 uppercase tracking-[0.3em] font-bold">
                                +{artifact.powerBonusProgression.level} Artifact Bonus
                            </p>
                        </div>
                    {/if}
                </div>

                <!-- Corner brackets -->
                <div class="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-zinc-800"></div>
                <div class="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-zinc-800"></div>
            </div>
        </div>

        <!-- ── COLUMN 3: ARMOR & STATS (3/12) ─────────────────────────────── -->
        <div class="col-span-3 flex flex-col space-y-8 items-center h-full">

            <!-- Armor slots -->
            <div class="flex flex-col items-center gap-6 w-full">
                {#each [
                    { key: 'helmet',    label: 'HELMET' },
                    { key: 'gauntlets', label: 'ARMS'   },
                    { key: 'chest',     label: 'CHEST'  },
                    { key: 'legs',      label: 'LEGS'   },
                ] as a}
                    {@const item   = eq[a.key]}
                    {@const exotic = item?.tierType === 6}
                    <div class="group flex flex-col items-center gap-2 cursor-pointer w-full">
                        <div class="w-20 h-20 bg-[#0c0c0c]
                                    border {exotic ? 'border-amber-500/20' : 'border-zinc-800'}
                                    relative group-hover:border-zinc-500 transition-all duration-300
                                    mx-auto overflow-hidden shadow-[inset_0_0_15px_rgba(0,0,0,0.5)]">
                            <!-- Rarity bar -->
                            <div class="absolute top-0 left-0 w-full h-px opacity-70
                                        {exotic ? 'bg-amber-500' : 'bg-zinc-100'}"></div>

                            {#if item?.iconPath}
                                <img src="https://www.bungie.net{item.iconPath}" alt=""
                                     class="w-full h-full object-cover" />
                            {:else}
                                <div class="w-full h-full flex items-center justify-center
                                            opacity-10 group-hover:opacity-30 transition-opacity">
                                    <div class="w-10 h-10 border border-zinc-500 rotate-45"></div>
                                </div>
                            {/if}

                            <div class="absolute bottom-0 right-0 px-1.5 bg-black/60
                                        text-[8px] text-zinc-500 uppercase font-bold tracking-tighter">
                                {TIER_LABEL[item?.tierType] ?? 'UNKNOWN'}
                            </div>
                        </div>

                        <div class="text-center w-full">
                            <p class="text-[8px] text-zinc-600 uppercase tracking-widest font-bold">{a.label}</p>
                            <p class="text-[10px] font-bold uppercase tracking-tight
                                      text-zinc-200 group-hover:text-white truncate w-28 mx-auto">
                                {item?.name ?? '—'}
                            </p>
                        </div>
                    </div>
                {/each}
            </div>

            <!-- Stats Summary Panel -->
            <div class="w-full mt-auto bg-[#0a0a0a] border border-zinc-800 p-5
                        shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]">

                <!-- Header -->
                <div class="flex justify-between items-center border-b border-zinc-800 pb-3 mb-3">
                    <span class="text-[10px] text-emerald-500 uppercase tracking-widest font-bold">STATS</span>
                    <div class="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                </div>

                <!-- Stat rows -->
                {#each armorStatMeta as stat}
                    {@const total      = totalStats[stat.name] ?? 0}
                    {@const bonus      = Math.max(0, total - 100)}
                    {@const percentage = Math.min((total / 200) * 100, 100)}
                    <div class="flex items-center gap-3 w-full group py-1.5">
                        <!-- Indicator dot -->
                        <div class="w-3 h-3 bg-zinc-900 border border-zinc-800
                                    flex items-center justify-center shrink-0">
                            <div class="w-1.5 h-1.5 transition-colors duration-300
                                        {bonus > 0
                                            ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]'
                                            : 'bg-zinc-700'}">
                            </div>
                        </div>

                        <div class="flex-1">
                            <!-- Label + value row -->
                            <div class="flex justify-between text-[8px] uppercase tracking-[0.15em]
                                        text-zinc-500 mb-1">
                                <span class="font-bold">{stat.name}</span>
                                <div class="flex items-center gap-1.5">
                                    <span class="text-zinc-200 font-black">{total}</span>
                                    {#if bonus > 0}
                                        <span class="text-emerald-500 font-bold text-[7px]">+{bonus} FATE</span>
                                    {/if}
                                </div>
                            </div>

                            <!-- Progress bar -->
                            <div class="h-px bg-zinc-900 w-full relative">
                                <div class="h-full transition-all duration-1000 ease-out
                                            {bonus > 0 ? 'bg-emerald-500' : 'bg-zinc-500'}"
                                     style="width:{percentage}%">
                                </div>
                            </div>
                        </div>
                    </div>
                {/each}

                <!-- Totals footer -->
                <div class="mt-6 pt-3 border-t border-zinc-800 flex items-center justify-between">
                    <span class="text-[8px] text-zinc-600 uppercase tracking-widest font-bold">
                        TOTAL: {grandTotal}
                    </span>
                    <span class="text-[10px] text-emerald-400 font-bold uppercase italic tracking-tighter">
                        BUILD TIER {buildTier}
                    </span>
                </div>
            </div>

        </div>
    </div>
</div>
