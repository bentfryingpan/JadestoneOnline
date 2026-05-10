<script>
    let { char, eq, armorStatMeta = [], artifact = null } = $props();

    const TIER_LABEL  = { 6: 'Exotic', 5: 'Legendary', 4: 'Rare', 3: 'Uncommon', 2: 'Common' };
    const classNames  = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' };
    const damageLabel = { 1: 'Kinetic', 2: 'Arc', 3: 'Solar', 4: 'Void', 6: 'Stasis', 7: 'Strand' };
    const damageColor = {
        1: 'text-zinc-400', 2: 'text-cyan-400',   3: 'text-orange-400',
        4: 'text-violet-400', 6: 'text-blue-400', 7: 'text-emerald-400'
    };

    // ── Inspection state ───────────────────────────────────────────────────────
    let selectedSlot = $state(null);

    const selectedItem = $derived(selectedSlot ? (eq[selectedSlot] ?? null) : null);
    const selectedType = $derived((() => {
        if (!selectedSlot) return null;
        if (selectedSlot === 'subclass') return 'subclass';
        if (['kinetic','energy','power'].includes(selectedSlot)) return 'weapon';
        return 'armor';
    })());

    function selectSlot(key) { selectedSlot = selectedSlot === key ? null : key; }

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

    // ── Subclass theming ───────────────────────────────────────────────────────
    const subclassColor = $derived((() => {
        const n = (eq.subclass?.name ?? '').toLowerCase();
        if (n.includes('void'))      return 'rgba(109,40,217,0.15)';
        if (n.includes('solar'))     return 'rgba(234,88,12,0.15)';
        if (n.includes('arc'))       return 'rgba(8,145,178,0.15)';
        if (n.includes('stasis'))    return 'rgba(29,78,216,0.15)';
        if (n.includes('strand'))    return 'rgba(5,150,105,0.15)';
        if (n.includes('prismatic')) return 'rgba(219,39,119,0.15)';
        return 'rgba(16,185,129,0.07)';
    })());

    const subclassEl = $derived((() => {
        const n = (eq.subclass?.name ?? '').toLowerCase();
        if (n.includes('void'))      return { border: 'border-violet-500/50', glow: 'shadow-[0_0_20px_rgba(139,92,246,0.3)]', text: 'text-violet-400'  };
        if (n.includes('solar'))     return { border: 'border-orange-500/50', glow: 'shadow-[0_0_20px_rgba(249,115,22,0.3)]',  text: 'text-orange-400' };
        if (n.includes('arc'))       return { border: 'border-cyan-400/50',   glow: 'shadow-[0_0_20px_rgba(34,211,238,0.3)]',  text: 'text-cyan-400'   };
        if (n.includes('stasis'))    return { border: 'border-blue-500/50',   glow: 'shadow-[0_0_20px_rgba(59,130,246,0.3)]',  text: 'text-blue-400'   };
        if (n.includes('strand'))    return { border: 'border-emerald-500/50',glow: 'shadow-[0_0_20px_rgba(16,185,129,0.3)]',  text: 'text-emerald-400'};
        return { border: 'border-zinc-600/50', glow: '', text: 'text-zinc-400' };
    })());
</script>

<!-- ── Gear Item Slot ─────────────────────────────────────────────────────────
     Snippet used for weapons and armor.
     key: slot key in eq, label: display label, item: eq[key]
────────────────────────────────────────────────────────────────────────────── -->
{#snippet GearSlot(key, label)}
    {@const item      = eq[key]}
    {@const exotic    = item?.tierType === 6}
    {@const isActive  = selectedSlot === key}
    <button onclick={() => selectSlot(key)}
            class="group flex flex-col items-center gap-2 w-full text-left transition-all">
        <div class="w-20 h-20 bg-[#0c0c0c] relative mx-auto overflow-hidden
                    shadow-[inset_0_0_15px_rgba(0,0,0,0.5)] transition-all duration-300
                    border
                    {isActive
                        ? 'border-emerald-500/70 shadow-[0_0_14px_rgba(52,211,153,0.2)]'
                        : exotic
                            ? 'border-amber-500/20 group-hover:border-amber-500/50'
                            : 'border-zinc-800 group-hover:border-zinc-500'}">
            <!-- Rarity bar -->
            <div class="absolute top-0 left-0 w-full h-px opacity-70
                        {exotic ? 'bg-amber-500' : 'bg-zinc-100'}"></div>
            <!-- Icon -->
            {#if item?.icon}
                <img src={item.icon} alt="" class="w-full h-full object-cover" />
            {:else}
                <div class="w-full h-full flex items-center justify-center
                            opacity-10 group-hover:opacity-25 transition-opacity">
                    <div class="w-10 h-10 border border-zinc-500 rotate-45"></div>
                </div>
            {/if}
            <!-- Tier badge -->
            <div class="absolute bottom-0 right-0 px-1.5 bg-black/70
                        text-[7px] text-zinc-500 uppercase font-bold tracking-tight">
                {TIER_LABEL[item?.tierType] ?? '—'}
            </div>
            <!-- Selected pulse -->
            {#if isActive}
                <div class="absolute inset-0 border border-emerald-500/30 pointer-events-none"></div>
            {/if}
        </div>
        <div class="text-center w-full">
            <p class="text-[8px] text-zinc-600 uppercase tracking-widest font-bold">{label}</p>
            <p class="text-[10px] font-bold uppercase tracking-tight truncate w-28 mx-auto transition-colors
                      {isActive ? 'text-emerald-400' : 'text-zinc-200 group-hover:text-white'}">
                {item?.name ?? '—'}
            </p>
        </div>
    </button>
{/snippet}

<!-- ── Main Layout ─────────────────────────────────────────────────────────── -->
<div class="max-w-6xl mx-auto py-10 px-4">
    <div class="grid grid-cols-12 gap-12 items-start">

        <!-- ── COL 1: SUBCLASS + WEAPONS ──────────────────────────────────── -->
        <div class="col-span-3 space-y-12 flex flex-col items-center">

            <!-- Subclass slot -->
            <button onclick={() => selectSlot('subclass')}
                    class="flex flex-col items-center group cursor-pointer w-full text-left">
                <div class="w-24 h-24 flex items-center justify-center mx-auto relative">
                    <!-- Ambient glow -->
                    <div class="absolute inset-0 rounded-full blur-3xl animate-pulse"
                         style="background:{subclassColor}"></div>
                    <!-- Diamond frame -->
                    {#if eq.subclass?.icon}
                        <div class="w-20 h-20 bg-[#0a0a0a] border-2 flex items-center justify-center
                                    rotate-45 transition-all duration-500 shadow-2xl overflow-hidden
                                    {selectedSlot === 'subclass'
                                        ? 'border-emerald-500/80 shadow-[0_0_20px_rgba(52,211,153,0.25)] rotate-90'
                                        : subclassEl.border + ' ' + subclassEl.glow + ' group-hover:rotate-90'}">
                            <img src={eq.subclass.icon} alt=""
                                 class="w-16 h-16 object-cover scale-110 transition-all duration-500
                                        {selectedSlot === 'subclass' ? '-rotate-90' : '-rotate-45 group-hover:-rotate-90'}" />
                        </div>
                    {:else}
                        <div class="w-20 h-20 bg-[#0a0a0a] border-2 border-zinc-800 flex items-center
                                    justify-center rotate-45 group-hover:rotate-90 transition-all duration-700 shadow-2xl
                                    {selectedSlot === 'subclass' ? 'border-emerald-500/60' : ''}">
                            <div class="w-10 h-10 border border-emerald-400/60 flex items-center justify-center">
                                <div class="w-2 h-2 bg-emerald-500"></div>
                            </div>
                        </div>
                    {/if}
                </div>
                <div class="mt-6 text-center w-full">
                    <span class="text-[9px] text-zinc-600 uppercase tracking-[0.2em] font-bold block mb-1">SUBCLASS</span>
                    <p class="text-[11px] font-bold uppercase tracking-widest transition-colors
                              {selectedSlot === 'subclass' ? 'text-emerald-400' : subclassEl.text}">
                        {eq.subclass?.name ?? '—'}
                    </p>
                </div>
            </button>

            <!-- Weapons -->
            <div class="space-y-10 w-full flex flex-col items-center pt-8 border-t border-zinc-800/40">
                {@render GearSlot('kinetic', 'KINETIC')}
                {@render GearSlot('energy',  'ENERGY')}
                {@render GearSlot('power',   'POWER')}
            </div>
        </div>

        <!-- ── COL 2: CENTER — DECORATIVE / INSPECTION ────────────────────── -->
        <div class="col-span-6 relative flex items-center justify-center min-h-[500px]">

            {#if selectedSlot && selectedItem}
                <!-- ── INSPECTION PANEL ──────────────────────────────────── -->
                <div class="w-full h-[500px] flex flex-col bg-[#0a0a0a] border border-zinc-800 relative overflow-hidden">
                    <!-- Corner accents -->
                    <span class="absolute top-0 left-0 w-3 h-3 border-t border-l border-emerald-500/40 pointer-events-none z-10"></span>
                    <span class="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-emerald-500/40 pointer-events-none z-10"></span>

                    <!-- Close button -->
                    <button onclick={() => selectedSlot = null}
                            class="absolute top-3 right-3 z-20 text-zinc-600 hover:text-zinc-300
                                   transition-colors w-6 h-6 flex items-center justify-center border border-zinc-800 hover:border-zinc-600">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>

                    <!-- Item header -->
                    <div class="flex items-center gap-4 p-5 border-b border-zinc-800 shrink-0">
                        {#if selectedItem.icon}
                            <div class="w-16 h-16 shrink-0 relative overflow-hidden border
                                        {selectedItem.tierType === 6 ? 'border-amber-500/40' : 'border-zinc-700'}">
                                <div class="absolute top-0 left-0 w-full h-px
                                            {selectedItem.tierType === 6 ? 'bg-amber-500' : 'bg-zinc-300'} opacity-60"></div>
                                <img src={selectedItem.icon} alt="" class="w-full h-full object-cover" />
                            </div>
                        {/if}
                        <div class="min-w-0 flex-1">
                            <span class="text-[8px] font-mono uppercase tracking-[0.2em]
                                         {selectedItem.tierType === 6 ? 'text-amber-500' : 'text-zinc-600'}">
                                {TIER_LABEL[selectedItem.tierType] ?? '—'}
                                {#if selectedItem.itemTypeDisplayName}· {selectedItem.itemTypeDisplayName}{/if}
                            </span>
                            <p class="font-serif text-xl font-light italic text-white leading-tight mt-0.5 truncate">
                                {selectedItem.name}
                            </p>
                            <!-- Weapon: damage type + power -->
                            {#if selectedType === 'weapon'}
                                <div class="flex items-center gap-3 mt-1">
                                    {#if selectedItem.damageType}
                                        <span class="text-[9px] font-mono uppercase tracking-[0.15em]
                                                     {damageColor[selectedItem.damageType] ?? 'text-zinc-500'}">
                                            {damageLabel[selectedItem.damageType] ?? ''}
                                        </span>
                                    {/if}
                                    {#if selectedItem.power}
                                        <span class="text-[9px] font-mono text-zinc-500">
                                            {selectedItem.power} PL
                                        </span>
                                    {/if}
                                </div>
                            {/if}
                            <!-- Armor: element name -->
                            {#if selectedType === 'armor' && selectedItem.flavorText}
                                <p class="text-[9px] font-sans text-zinc-600 mt-1 line-clamp-1 italic">
                                    {selectedItem.flavorText}
                                </p>
                            {/if}
                            <!-- Subclass: element -->
                            {#if selectedType === 'subclass'}
                                <span class="text-[9px] font-mono uppercase tracking-[0.15em] {subclassEl.text}">
                                    {classNames[char?.classType] ?? 'Guardian'} Subclass
                                </span>
                            {/if}
                        </div>
                    </div>

                    <!-- Scrollable content -->
                    <div class="flex-1 overflow-y-auto scrollbar-hide p-5 space-y-1">

                        <!-- ── WEAPON PERKS ────────────────────────────────── -->
                        {#if selectedType === 'weapon'}
                            {#each (selectedItem.perks ?? []) as perk}
                                <div class="flex items-start gap-3 py-2.5
                                            border-b border-zinc-800/60 last:border-0 group/perk">
                                    <!-- Perk icon -->
                                    <div class="shrink-0 w-9 h-9 border relative overflow-hidden
                                                transition-colors duration-200
                                                {perk.isIntrinsic
                                                    ? 'border-amber-500/40 bg-amber-500/5'
                                                    : perk.isMasterwork
                                                        ? 'border-yellow-400/40 bg-yellow-500/5'
                                                        : 'border-zinc-800 group-hover/perk:border-zinc-600'}">
                                        {#if perk.icon}
                                            <img src={perk.icon} alt="" class="w-full h-full object-cover" />
                                        {:else}
                                            <div class="w-full h-full flex items-center justify-center opacity-20">
                                                <div class="w-4 h-4 border border-zinc-500 rotate-45"></div>
                                            </div>
                                        {/if}
                                        <!-- Disabled overlay -->
                                        {#if !perk.isEnabled}
                                            <div class="absolute inset-0 bg-black/60"></div>
                                        {/if}
                                    </div>
                                    <!-- Perk text -->
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center gap-2 mb-0.5">
                                            <span class="text-[10px] font-mono font-bold uppercase tracking-wide
                                                         {perk.isIntrinsic
                                                             ? 'text-amber-400'
                                                             : perk.isMasterwork
                                                                 ? 'text-yellow-400'
                                                                 : 'text-zinc-200'}">
                                                {perk.name}
                                            </span>
                                            {#if perk.isIntrinsic}
                                                <span class="text-[7px] font-mono uppercase tracking-wider
                                                             text-amber-600 border border-amber-500/20 px-1">
                                                    INTRINSIC
                                                </span>
                                            {/if}
                                            {#if perk.isMasterwork}
                                                <span class="text-[7px] font-mono uppercase tracking-wider
                                                             text-yellow-600 border border-yellow-500/20 px-1">
                                                    MW
                                                </span>
                                            {/if}
                                        </div>
                                        {#if perk.description}
                                            <p class="text-[9px] font-sans text-zinc-500 leading-relaxed line-clamp-3">
                                                {perk.description}
                                            </p>
                                        {/if}
                                        <!-- Stat bonuses -->
                                        {#if perk.statBonuses?.length}
                                            <div class="flex flex-wrap gap-1.5 mt-1">
                                                {#each perk.statBonuses as sb}
                                                    <span class="text-[7px] font-mono text-emerald-500 border border-emerald-500/20 px-1">
                                                        +{sb.value}
                                                    </span>
                                                {/each}
                                            </div>
                                        {/if}
                                    </div>
                                </div>
                            {/each}
                            {#if !selectedItem.perks?.length}
                                <p class="text-[10px] font-sans text-zinc-700 text-center py-8">No perk data available.</p>
                            {/if}

                        <!-- ── ARMOR STATS + MODS ──────────────────────────── -->
                        {:else if selectedType === 'armor'}
                            <!-- Per-piece stat bars -->
                            {#if selectedItem.armorStats?.length}
                                <div class="mb-4">
                                    <span class="text-[9px] font-mono uppercase tracking-[0.2em] text-zinc-600 block mb-3">
                                        Piece Stats
                                    </span>
                                    {#each selectedItem.armorStats as s}
                                        <div class="flex items-center gap-3 py-1.5">
                                            <span class="text-[8px] font-mono uppercase tracking-[0.1em]
                                                         text-zinc-500 w-16 shrink-0">{s.short ?? s.name}</span>
                                            <div class="flex-1 h-px bg-zinc-900 relative">
                                                <div class="h-full {s.color ?? 'bg-zinc-500'} transition-all duration-700"
                                                     style="width:{Math.min((s.value / (s.maximum || 30)) * 100, 100)}%">
                                                </div>
                                            </div>
                                            <span class="text-[9px] font-mono text-zinc-300 w-5 text-right shrink-0">
                                                {s.value}
                                            </span>
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                            <!-- Mods -->
                            {#if selectedItem.mods?.length}
                                <div class="border-t border-zinc-800/60 pt-4">
                                    <span class="text-[9px] font-mono uppercase tracking-[0.2em] text-zinc-600 block mb-3">
                                        Mods
                                    </span>
                                    {#each selectedItem.mods as mod}
                                        <div class="flex items-start gap-3 py-2.5
                                                    border-b border-zinc-800/50 last:border-0 group/mod">
                                            <div class="shrink-0 w-9 h-9 border border-zinc-800
                                                        group-hover/mod:border-zinc-600 transition-colors overflow-hidden">
                                                {#if mod.icon}
                                                    <img src={mod.icon} alt="" class="w-full h-full object-cover" />
                                                {/if}
                                            </div>
                                            <div class="flex-1 min-w-0">
                                                <span class="text-[10px] font-mono font-bold uppercase
                                                             tracking-wide text-zinc-200 block">{mod.name}</span>
                                                {#if mod.description}
                                                    <p class="text-[9px] font-sans text-zinc-500 leading-relaxed mt-0.5 line-clamp-3">
                                                        {mod.description}
                                                    </p>
                                                {/if}
                                                {#if mod.statBonuses?.length}
                                                    <div class="flex flex-wrap gap-1.5 mt-1">
                                                        {#each mod.statBonuses as sb}
                                                            <span class="text-[7px] font-mono text-emerald-500 border border-emerald-500/20 px-1">
                                                                +{sb.value}
                                                            </span>
                                                        {/each}
                                                    </div>
                                                {/if}
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            {/if}

                        <!-- ── SUBCLASS SOCKETS ────────────────────────────── -->
                        {:else if selectedType === 'subclass'}
                            {@const sc = eq.subclassSockets}
                            <!-- Super -->
                            {#if sc?.super}
                                <div class="flex items-start gap-3 pb-4 border-b border-zinc-800/60 mb-4">
                                    {#if sc.super.icon}
                                        <div class="shrink-0 w-10 h-10 border border-zinc-800 overflow-hidden">
                                            <img src={sc.super.icon} alt="" class="w-full h-full object-cover" />
                                        </div>
                                    {/if}
                                    <div>
                                        <span class="text-[7px] font-mono uppercase tracking-[0.2em] text-zinc-600 block">Super</span>
                                        <span class="text-[11px] font-mono font-bold text-zinc-100 block">{sc.super.name}</span>
                                        {#if sc.super.description}
                                            <p class="text-[9px] font-sans text-zinc-500 mt-1 leading-relaxed line-clamp-4">
                                                {sc.super.description}
                                            </p>
                                        {/if}
                                    </div>
                                </div>
                            {/if}
                            <!-- Abilities -->
                            {#if sc?.abilities?.length}
                                <span class="text-[9px] font-mono uppercase tracking-[0.2em] text-zinc-600 block mb-2">
                                    Abilities
                                </span>
                                {#each sc.abilities as ab}
                                    <div class="flex items-start gap-3 py-2 border-b border-zinc-800/40 last:border-0">
                                        {#if ab.icon}
                                            <div class="shrink-0 w-8 h-8 border border-zinc-800 overflow-hidden">
                                                <img src={ab.icon} alt="" class="w-full h-full object-cover" />
                                            </div>
                                        {/if}
                                        <div class="flex-1 min-w-0">
                                            <span class="text-[9px] font-mono uppercase tracking-wide text-zinc-300 block leading-tight">{ab.name}</span>
                                            <span class="text-[8px] font-mono text-zinc-700 uppercase">{ab.itemTypeDisplayName}</span>
                                        </div>
                                    </div>
                                {/each}
                            {/if}
                            <!-- Aspects -->
                            {#if sc?.aspects?.length}
                                <div class="mt-3 pt-3 border-t border-zinc-800/60">
                                    <span class="text-[9px] font-mono uppercase tracking-[0.2em] text-zinc-600 block mb-2">
                                        Aspects
                                    </span>
                                    {#each sc.aspects as asp}
                                        <div class="flex items-start gap-3 py-2 border-b border-zinc-800/40 last:border-0">
                                            {#if asp.icon}
                                                <div class="shrink-0 w-8 h-8 border border-zinc-800 overflow-hidden">
                                                    <img src={asp.icon} alt="" class="w-full h-full object-cover" />
                                                </div>
                                            {/if}
                                            <div class="flex-1 min-w-0">
                                                <span class="text-[9px] font-mono uppercase tracking-wide text-zinc-300 block leading-tight">{asp.name}</span>
                                                {#if asp.description}
                                                    <p class="text-[9px] font-sans text-zinc-500 mt-0.5 leading-relaxed line-clamp-2">{asp.description}</p>
                                                {/if}
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                            <!-- Fragments -->
                            {#if sc?.fragments?.length}
                                <div class="mt-3 pt-3 border-t border-zinc-800/60">
                                    <span class="text-[9px] font-mono uppercase tracking-[0.2em] text-zinc-600 block mb-2">
                                        Fragments ({sc.fragments.length})
                                    </span>
                                    <div class="grid grid-cols-2 gap-2">
                                        {#each sc.fragments as frag}
                                            <div class="flex items-center gap-2 border border-zinc-800/60 p-2 group/frag hover:border-zinc-700 transition-colors">
                                                {#if frag.icon}
                                                    <div class="shrink-0 w-6 h-6 overflow-hidden">
                                                        <img src={frag.icon} alt="" class="w-full h-full object-cover" />
                                                    </div>
                                                {/if}
                                                <span class="text-[8px] font-mono text-zinc-400 leading-tight truncate">
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
                <div class="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none">
                    <div class="w-[400px] h-[400px] border border-emerald-500 rounded-full animate-pulse"></div>
                    <div class="absolute w-[500px] h-[500px] border border-zinc-800 rounded-full"></div>
                </div>

                <div class="w-80 h-[480px] relative z-10 flex flex-col items-center justify-center gap-8">
                    <div class="absolute inset-0 opacity-40 blur-3xl pointer-events-none"
                         style="background:linear-gradient(to top,{subclassColor},transparent)"></div>

                    <div class="text-[10px] text-zinc-800 uppercase tracking-[1em] text-center
                                rotate-90 whitespace-nowrap font-bold select-none opacity-40 absolute">
                        CHARACTER_ENTITY
                    </div>

                    <div class="relative flex flex-col items-center gap-5 z-10">
                        {#if eq.subclass?.icon}
                            <img src={eq.subclass.icon} alt=""
                                 class="w-16 h-16 object-cover opacity-15" />
                        {/if}
                        <div class="text-center">
                            <p class="text-[9px] text-zinc-700 uppercase tracking-[0.4em] font-bold mb-1">
                                Guardian Class
                            </p>
                            <p class="font-serif text-3xl font-light italic text-white/80 leading-none">
                                {classNames[char?.classType] ?? '—'}
                            </p>
                        </div>
                        {#if char?.light}
                            <div class="text-center border border-zinc-800 px-6 py-2 bg-[#0a0a0a]">
                                <p class="text-[8px] font-mono uppercase tracking-[0.3em] text-zinc-600 mb-1">
                                    Power Level
                                </p>
                                <p class="text-[22px] font-mono font-bold text-zinc-100">{char.light}</p>
                            </div>
                        {/if}
                        {#if artifact?.powerBonus}
                            <p class="text-[8px] font-mono uppercase tracking-[0.25em] text-zinc-700">
                                +{artifact.powerBonus} Artifact
                            </p>
                        {/if}
                        <!-- Click hint -->
                        <p class="text-[8px] font-mono uppercase tracking-[0.2em] text-zinc-800 mt-4">
                            Select a slot to inspect
                        </p>
                    </div>

                    <div class="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-zinc-800"></div>
                    <div class="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-zinc-800"></div>
                </div>
            {/if}
        </div>

        <!-- ── COL 3: ARMOR + STATS ────────────────────────────────────────── -->
        <div class="col-span-3 flex flex-col space-y-8 items-center h-full">

            <!-- Armor slots -->
            <div class="flex flex-col items-center gap-6 w-full">
                {@render GearSlot('helmet',    'HELMET')}
                {@render GearSlot('gauntlets', 'ARMS')}
                {@render GearSlot('chest',     'CHEST')}
                {@render GearSlot('legs',      'LEGS')}
            </div>

            <!-- Stats panel -->
            <div class="w-full mt-auto bg-[#0a0a0a] border border-zinc-800 p-5
                        shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]">
                <div class="flex justify-between items-center border-b border-zinc-800 pb-3 mb-3">
                    <span class="text-[10px] text-emerald-500 uppercase tracking-widest font-bold">STATS</span>
                    <div class="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                </div>

                {#each armorStatMeta as stat}
                    {@const total      = totalStats[stat.name] ?? 0}
                    {@const bonus      = Math.max(0, total - 100)}
                    {@const percentage = Math.min((total / 200) * 100, 100)}
                    <div class="flex items-center gap-3 w-full py-1.5">
                        <div class="w-3 h-3 bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                            <div class="w-1.5 h-1.5 transition-colors duration-300
                                        {bonus > 0 ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 'bg-zinc-700'}">
                            </div>
                        </div>
                        <div class="flex-1">
                            <div class="flex justify-between text-[8px] uppercase tracking-[0.15em] text-zinc-500 mb-1">
                                <span class="font-bold">{stat.name}</span>
                                <div class="flex items-center gap-1.5">
                                    <span class="text-zinc-200 font-black">{total}</span>
                                    {#if bonus > 0}
                                        <span class="text-emerald-500 font-bold text-[7px]">+{bonus} FATE</span>
                                    {/if}
                                </div>
                            </div>
                            <div class="h-px bg-zinc-900 w-full relative">
                                <div class="h-full transition-all duration-1000 ease-out
                                            {bonus > 0 ? 'bg-emerald-500' : 'bg-zinc-500'}"
                                     style="width:{percentage}%"></div>
                            </div>
                        </div>
                    </div>
                {/each}

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
