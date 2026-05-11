<script>
    let { char, eq, sockets } = $props();

    const classNames = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' };

    // Destiny 2 stat hash → display name (standard + Edge of Fate names)
    const STAT_NAMES = {
        2996146975: 'Mobility',
        392767087:  'Resilience',
        1943323491: 'Recovery',
        1735777505: 'Discipline',
        144602215:  'Intellect',
        4244567218: 'Strength',
        // Edge of Fate renames
        3897515592: 'Weapons',
        2223994109: 'Health',
        3596744046: 'Class',
        3022375125: 'Grenade',
        2285636663: 'Super',
        2961038739: 'Melee',
    };

    // Selected ability/aspect/fragment for center inspection
    let selectedAbility = $state(null);

    function selectAbility(item) {
        selectedAbility = selectedAbility?.name === item?.name ? null : item;
    }

    // Subclass theming
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
        if (n.includes('void'))      return { border: 'border-violet-500/50', glow: 'shadow-[0_0_20px_rgba(139,92,246,0.25)]', text: 'text-violet-400',  bar: 'bg-violet-500'  };
        if (n.includes('solar'))     return { border: 'border-orange-500/50', glow: 'shadow-[0_0_20px_rgba(249,115,22,0.25)]',  text: 'text-orange-400', bar: 'bg-orange-500' };
        if (n.includes('arc'))       return { border: 'border-cyan-400/50',   glow: 'shadow-[0_0_20px_rgba(34,211,238,0.25)]',  text: 'text-cyan-400',   bar: 'bg-cyan-400'   };
        if (n.includes('stasis'))    return { border: 'border-blue-500/50',   glow: 'shadow-[0_0_20px_rgba(59,130,246,0.25)]',  text: 'text-blue-400',   bar: 'bg-blue-500'   };
        if (n.includes('strand'))    return { border: 'border-emerald-500/50',glow: 'shadow-[0_0_20px_rgba(16,185,129,0.25)]',  text: 'text-emerald-400',bar: 'bg-emerald-500'};
        return { border: 'border-zinc-600/50', glow: '', text: 'text-zinc-400', bar: 'bg-zinc-500' };
    })());

    function abilityTypeLabel(t) {
        const n = (t ?? '').toLowerCase();
        if (n.includes('movement') || n.includes('jump')) return 'Jump';
        if (n.includes('melee'))   return 'Melee';
        if (n.includes('grenade')) return 'Grenade';
        if (n.includes('class'))   return 'Class';
        return t ?? '';
    }
</script>

<!-- ── Subclass Layout ────────────────────────────────────────────────────── -->
<div class="max-w-6xl mx-auto py-10 px-4">
    <div class="grid grid-cols-12 gap-8 items-start">

        <!-- ── COL 1: SUPER + SUBCLASS ICON ─────────────────────────────── -->
        <div class="col-span-3 flex flex-col items-center space-y-8">

            <!-- Subclass diamond -->
            <div class="flex flex-col items-center w-full">
                <div class="w-24 h-24 flex items-center justify-center mx-auto relative">
                    <div class="absolute inset-0 rounded-full blur-3xl animate-pulse"
                         style="background:{subclassColor}"></div>
                    {#if eq.subclass?.icon}
                        <div class="w-20 h-20 bg-[#0a0a0a] border-2 {subclassEl.border} {subclassEl.glow}
                                    flex items-center justify-center rotate-45 shadow-2xl overflow-hidden">
                            <img src={eq.subclass.icon} alt=""
                                 class="w-16 h-16 object-cover -rotate-45 scale-110" />
                        </div>
                    {:else}
                        <div class="w-20 h-20 bg-[#0a0a0a] border-2 border-zinc-800 flex items-center
                                    justify-center rotate-45 shadow-2xl">
                            <div class="w-10 h-10 border border-emerald-400/60 flex items-center justify-center">
                                <div class="w-2 h-2 bg-emerald-500"></div>
                            </div>
                        </div>
                    {/if}
                </div>
                <div class="mt-5 text-center w-full">
                    <span class="text-[10px] font-medium text-zinc-600 uppercase tracking-wider block mb-1">Subclass</span>
                    <p class="text-sm font-semibold {subclassEl.text}">
                        {eq.subclass?.name ?? '—'}
                    </p>
                    <p class="text-xs text-zinc-600 mt-0.5">
                        {classNames[char?.classType] ?? 'Guardian'}
                    </p>
                </div>
            </div>

            <!-- Super ability slot -->
            <div class="w-full pt-6 border-t border-zinc-800/40">
                <span class="text-[10px] font-medium text-zinc-500 uppercase tracking-wider block mb-4">Super</span>
                {#if sockets?.super}
                    <button onclick={() => selectAbility(sockets.super)}
                            class="group flex flex-col items-center gap-3 w-full text-left
                                   transition-all duration-200">
                        <div class="w-20 h-20 bg-[#0c0c0c] border mx-auto overflow-hidden relative
                                    shadow-[inset_0_0_15px_rgba(0,0,0,0.5)] transition-all duration-300
                                    {selectedAbility?.name === sockets.super.name
                                        ? 'border-emerald-500/70 shadow-[0_0_14px_rgba(52,211,153,0.2)]'
                                        : subclassEl.border.replace('/50','/30') + ' group-hover:' + subclassEl.border}">
                            <div class="absolute top-0 left-0 w-full h-px {subclassEl.bar} opacity-70 pointer-events-none"></div>
                            {#if sockets.super.icon}
                                <img src={sockets.super.icon} alt="" class="w-full h-full object-cover" />
                            {:else}
                                <div class="w-full h-full flex items-center justify-center opacity-10">
                                    <div class="w-10 h-10 border border-zinc-500 rotate-45"></div>
                                </div>
                            {/if}
                        </div>
                        <div class="text-center w-full">
                            <p class="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Super</p>
                            <p class="text-sm font-semibold leading-tight mt-0.5 transition-colors
                                      {selectedAbility?.name === sockets.super.name
                                          ? 'text-emerald-400' : 'text-zinc-200 group-hover:text-white'}">
                                {sockets.super.name}
                            </p>
                        </div>
                    </button>
                {:else}
                    <div class="w-20 h-20 bg-[#0c0c0c] border border-zinc-800 mx-auto flex items-center justify-center opacity-20">
                        <div class="w-10 h-10 border border-zinc-500 rotate-45"></div>
                    </div>
                {/if}
            </div>

        </div>

        <!-- ── COL 2: CENTER — ABILITIES + INSPECTION ─────────────────────── -->
        <div class="col-span-6 relative flex flex-col items-center min-h-[500px] gap-8">

            <!-- Abilities row -->
            <div class="w-full">
                <span class="text-[10px] font-medium text-zinc-500 uppercase tracking-wider block mb-4">Abilities</span>
                <div class="grid grid-cols-4 gap-4">
                    {#each sockets?.abilities ?? [] as ability}
                        {@const isActive = selectedAbility?.name === ability.name}
                        <button onclick={() => selectAbility(ability)}
                                class="group flex flex-col items-center gap-2 w-full text-left transition-all">
                            <div class="w-16 h-16 bg-[#0c0c0c] border mx-auto overflow-hidden relative
                                        shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] transition-all duration-300
                                        {isActive
                                            ? 'border-emerald-500/70 shadow-[0_0_10px_rgba(52,211,153,0.15)]'
                                            : subclassEl.border.replace('/50','/20') + ' group-hover:' + subclassEl.border}">
                                <div class="absolute top-0 left-0 w-full h-px {subclassEl.bar} opacity-50"></div>
                                {#if ability.icon}
                                    <img src={ability.icon} alt="" class="w-full h-full object-cover" />
                                {:else}
                                    <div class="w-full h-full flex items-center justify-center opacity-10">
                                        <div class="w-8 h-8 border border-zinc-500 rotate-45"></div>
                                    </div>
                                {/if}
                                {#if !ability.isEnabled}
                                    <div class="absolute inset-0 bg-black/60"></div>
                                {/if}
                            </div>
                            <div class="text-center">
                                <p class="text-[10px] font-medium uppercase tracking-wider
                                          {isActive ? 'text-emerald-400' : subclassEl.text}">
                                    {abilityTypeLabel(ability.itemTypeDisplayName)}
                                </p>
                                <p class="text-xs font-semibold leading-tight mt-0.5 transition-colors
                                          {isActive ? 'text-emerald-300' : 'text-zinc-300 group-hover:text-white'}">
                                    {ability.name}
                                </p>
                            </div>
                        </button>
                    {/each}
                    <!-- Empty ability slots -->
                    {#each Array(Math.max(0, 4 - (sockets?.abilities?.length ?? 0))) as _}
                        <div class="flex flex-col items-center gap-2">
                            <div class="w-16 h-16 border border-zinc-800 border-dashed opacity-20 flex items-center justify-center">
                                <div class="w-8 h-8 border border-zinc-700 rotate-45 opacity-50"></div>
                            </div>
                            <p class="text-xs text-zinc-800">Empty</p>
                        </div>
                    {/each}
                </div>
            </div>

            <!-- Inspection panel / Decorative center -->
            <div class="w-full flex-1 relative">
                {#if selectedAbility}
                    <!-- Ability / Fragment / Aspect inspection -->
                    <div class="w-full bg-[#0a0a0a] border border-zinc-800 relative overflow-hidden">
                        <span class="absolute top-0 left-0 w-3 h-3 border-t border-l border-emerald-500/40 pointer-events-none z-10"></span>
                        <span class="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-emerald-500/40 pointer-events-none z-10"></span>

                        <!-- Close -->
                        <button onclick={() => selectedAbility = null}
                                class="absolute top-3 right-3 z-20 text-zinc-600 hover:text-zinc-300
                                       transition-colors w-6 h-6 flex items-center justify-center border border-zinc-800 hover:border-zinc-600">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>

                        <!-- Header -->
                        <div class="flex items-center gap-4 p-5 border-b border-zinc-800">
                            {#if selectedAbility.icon}
                                <div class="w-16 h-16 shrink-0 border {subclassEl.border} overflow-hidden relative">
                                    <div class="absolute top-0 left-0 w-full h-px {subclassEl.bar} opacity-60"></div>
                                    <img src={selectedAbility.icon} alt="" class="w-full h-full object-cover" />
                                </div>
                            {/if}
                            <div class="min-w-0 flex-1">
                                <span class="text-[10px] font-medium uppercase tracking-wider {subclassEl.text} block mb-1">
                                    {selectedAbility.itemTypeDisplayName ?? 'Ability'}
                                </span>
                                <p class="font-serif text-xl font-light italic text-white leading-tight">
                                    {selectedAbility.name}
                                </p>
                            </div>
                        </div>

                        <!-- Description + stat bonuses -->
                        <div class="p-5 space-y-4">
                            {#if selectedAbility.description || selectedAbility.perkDescription || selectedAbility.flavorText}
                                <p class="text-sm text-zinc-400 leading-relaxed">
                                    {selectedAbility.description || selectedAbility.perkDescription || selectedAbility.flavorText}
                                </p>
                            {:else}
                                <p class="text-sm text-zinc-600 italic">No description available.</p>
                            {/if}

                            <!-- Stat bonuses — show name + value -->
                            {#if selectedAbility.statBonuses?.length}
                                <div class="pt-4 border-t border-zinc-800/60">
                                    <span class="text-[10px] font-medium text-zinc-500 uppercase tracking-wider block mb-3">
                                        Stat Changes
                                    </span>
                                    <div class="flex flex-wrap gap-2">
                                        {#each selectedAbility.statBonuses as sb}
                                            {@const statName = STAT_NAMES[sb.statHash] ?? ('Stat ' + sb.statHash)}
                                            <div class="flex items-center gap-1.5 border px-2.5 py-1.5
                                                         {sb.value > 0
                                                             ? 'border-emerald-500/30 bg-emerald-500/5'
                                                             : 'border-red-500/30 bg-red-500/5'}">
                                                <span class="text-sm font-bold
                                                             {sb.value > 0 ? 'text-emerald-400' : 'text-red-400'}">
                                                    {sb.value > 0 ? '+' : ''}{sb.value}
                                                </span>
                                                <span class="text-xs font-medium text-zinc-400">{statName}</span>
                                            </div>
                                        {/each}
                                    </div>
                                </div>
                            {/if}
                        </div>
                    </div>
                {:else}
                    <!-- Decorative idle -->
                    <div class="w-full h-48 flex items-center justify-center relative border border-zinc-800/40">
                        <div class="absolute inset-0 opacity-30 blur-3xl pointer-events-none"
                             style="background:linear-gradient(to top,{subclassColor},transparent)"></div>
                        <p class="text-xs font-medium text-zinc-700 uppercase tracking-widest relative">
                            Select a slot to inspect
                        </p>
                        <div class="absolute top-0 left-0 w-6 h-6 border-t border-l border-zinc-800"></div>
                        <div class="absolute bottom-0 right-0 w-6 h-6 border-b border-r border-zinc-800"></div>
                    </div>
                {/if}
            </div>

        </div>

        <!-- ── COL 3: ASPECTS + FRAGMENTS ─────────────────────────────────── -->
        <div class="col-span-3 flex flex-col space-y-8 items-center">

            <!-- Aspects -->
            <div class="w-full">
                <span class="text-[10px] font-medium text-zinc-500 uppercase tracking-wider block mb-4">Aspects</span>
                <div class="flex flex-col items-center gap-5">
                    {#each sockets?.aspects ?? [] as aspect}
                        {@const isActive = selectedAbility?.name === aspect.name}
                        <button onclick={() => selectAbility(aspect)}
                                class="group flex flex-col items-center gap-2 w-full text-left transition-all">
                            <div class="w-20 h-20 bg-[#0c0c0c] border mx-auto overflow-hidden relative
                                        shadow-[inset_0_0_15px_rgba(0,0,0,0.5)] transition-all duration-300
                                        {isActive
                                            ? 'border-emerald-500/70 shadow-[0_0_14px_rgba(52,211,153,0.2)]'
                                            : subclassEl.border.replace('/50','/20') + ' group-hover:' + subclassEl.border}">
                                <div class="absolute top-0 left-0 w-full h-px {subclassEl.bar} opacity-60 pointer-events-none"></div>
                                {#if aspect.icon}
                                    <img src={aspect.icon} alt="" class="w-full h-full object-cover" />
                                {:else}
                                    <div class="w-full h-full flex items-center justify-center opacity-10">
                                        <div class="w-10 h-10 border border-zinc-500 rotate-45"></div>
                                    </div>
                                {/if}
                            </div>
                            <div class="text-center w-full">
                                <p class="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Aspect</p>
                                <p class="text-xs font-semibold leading-tight mt-0.5 transition-colors
                                          {isActive ? 'text-emerald-400' : 'text-zinc-200 group-hover:text-white'}">
                                    {aspect.name}
                                </p>
                            </div>
                        </button>
                    {/each}
                    <!-- Empty aspect slots -->
                    {#each Array(Math.max(0, 2 - (sockets?.aspects?.length ?? 0))) as _}
                        <div class="flex flex-col items-center gap-2 opacity-20">
                            <div class="w-20 h-20 border border-dashed border-zinc-700 flex items-center justify-center">
                                <div class="w-8 h-8 border border-zinc-600 rotate-45"></div>
                            </div>
                            <p class="text-xs text-zinc-700">Empty</p>
                        </div>
                    {/each}
                </div>
            </div>

            <!-- Fragments -->
            <div class="w-full pt-6 border-t border-zinc-800/40">
                <div class="flex items-center justify-between mb-4">
                    <span class="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Fragments</span>
                    <span class="text-[10px] text-zinc-600">
                        {sockets?.fragments?.length ?? 0} equipped
                    </span>
                </div>
                <!-- 2-column grid so full names can display without truncation -->
                <div class="grid grid-cols-2 gap-2">
                    {#each sockets?.fragments ?? [] as frag}
                        {@const isActive = selectedAbility?.name === frag.name}
                        <button onclick={() => selectAbility(frag)}
                                class="group flex flex-col items-center gap-1.5 transition-all">
                            <div class="w-14 h-14 bg-[#0c0c0c] border overflow-hidden relative
                                        shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] transition-all duration-200
                                        {isActive
                                            ? 'border-emerald-500/60'
                                            : subclassEl.border.replace('/50','/15') + ' group-hover:' + subclassEl.border.replace('/50','/40')}">
                                <div class="absolute top-0 left-0 w-full h-px {subclassEl.bar} opacity-40"></div>
                                {#if frag.icon}
                                    <img src={frag.icon} alt="" class="w-full h-full object-cover" />
                                {:else}
                                    <div class="w-full h-full flex items-center justify-center opacity-10">
                                        <div class="w-6 h-6 border border-zinc-500 rotate-45"></div>
                                    </div>
                                {/if}
                            </div>
                            <!-- Full name — wraps to 2 lines, no truncation -->
                            <p class="text-[9px] font-medium text-center leading-tight w-full px-0.5 line-clamp-2
                                      transition-colors
                                      {isActive ? 'text-emerald-400' : 'text-zinc-500 group-hover:text-zinc-300'}">
                                {frag.name}
                            </p>
                        </button>
                    {/each}
                    <!-- Empty fragment slots -->
                    {#each Array(Math.max(0, 5 - (sockets?.fragments?.length ?? 0))) as _}
                        <div class="flex flex-col items-center gap-1.5 opacity-15">
                            <div class="w-14 h-14 border border-dashed border-zinc-700 flex items-center justify-center">
                                <div class="w-5 h-5 border border-zinc-600 rotate-45"></div>
                            </div>
                            <p class="text-[9px] text-zinc-800">—</p>
                        </div>
                    {/each}
                </div>
            </div>

        </div>
    </div>
</div>
