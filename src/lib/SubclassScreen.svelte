<script>
    let { char, eq, sockets } = $props();

    const classNames = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' };

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

<!-- ── Subclass Layout (matches CharacterScreen 3-column Gemini grid) ──────── -->
<div class="max-w-6xl mx-auto py-10 px-4">
    <div class="grid grid-cols-12 gap-12 items-start">

        <!-- ── COL 1: SUPER + SUBCLASS ICON ─────────────────────────────── -->
        <div class="col-span-3 flex flex-col items-center space-y-10">

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
                <div class="mt-6 text-center w-full">
                    <span class="text-[9px] text-zinc-600 uppercase tracking-[0.2em] font-bold block mb-1">Subclass</span>
                    <p class="text-[11px] font-bold uppercase tracking-widest {subclassEl.text}">
                        {eq.subclass?.name ?? '—'}
                    </p>
                    <p class="text-[9px] font-mono uppercase tracking-[0.2em] text-zinc-700 mt-0.5">
                        {classNames[char?.classType] ?? 'Guardian'}
                    </p>
                </div>
            </div>

            <!-- Super ability slot -->
            <div class="w-full pt-8 border-t border-zinc-800/40">
                <span class="text-[9px] font-mono uppercase tracking-[0.25em] text-zinc-600 block mb-4">Super</span>
                {#if sockets?.super}
                    <button onclick={() => selectAbility(sockets.super)}
                            class="group flex flex-col items-center gap-3 w-full text-left
                                   transition-all duration-200">
                        <div class="w-20 h-20 bg-[#0c0c0c] border mx-auto overflow-hidden
                                    shadow-[inset_0_0_15px_rgba(0,0,0,0.5)] transition-all duration-300
                                    {selectedAbility?.name === sockets.super.name
                                        ? 'border-emerald-500/70 shadow-[0_0_14px_rgba(52,211,153,0.2)]'
                                        : subclassEl.border.replace('/50','/30') + ' group-hover:' + subclassEl.border}">
                            <!-- Rarity bar -->
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
                            <p class="text-[8px] text-zinc-600 uppercase tracking-widest font-bold">Super</p>
                            <p class="text-[10px] font-bold uppercase tracking-tight truncate w-28 mx-auto
                                      transition-colors {selectedAbility?.name === sockets.super.name
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
                <span class="text-[9px] font-mono uppercase tracking-[0.25em] text-zinc-600 block mb-4">Abilities</span>
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
                                <p class="text-[8px] font-mono uppercase tracking-widest font-bold
                                          {isActive ? 'text-emerald-400' : subclassEl.text}">
                                    {abilityTypeLabel(ability.itemTypeDisplayName)}
                                </p>
                                <p class="text-[9px] font-bold uppercase tracking-tight truncate w-20 mx-auto
                                          transition-colors {isActive ? 'text-emerald-300' : 'text-zinc-300 group-hover:text-white'}">
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
                            <p class="text-[8px] font-mono text-zinc-800 uppercase">Empty</p>
                        </div>
                    {/each}
                </div>
            </div>

            <!-- Inspection panel / Decorative center -->
            <div class="w-full flex-1 relative">
                {#if selectedAbility}
                    <!-- Ability inspection -->
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
                                <div class="w-14 h-14 shrink-0 border {subclassEl.border} overflow-hidden relative">
                                    <div class="absolute top-0 left-0 w-full h-px {subclassEl.bar} opacity-60"></div>
                                    <img src={selectedAbility.icon} alt="" class="w-full h-full object-cover" />
                                </div>
                            {/if}
                            <div>
                                <span class="text-[8px] font-mono uppercase tracking-[0.2em] {subclassEl.text} block">
                                    {selectedAbility.itemTypeDisplayName}
                                </span>
                                <p class="font-serif text-xl font-light italic text-white leading-tight">
                                    {selectedAbility.name}
                                </p>
                            </div>
                        </div>

                        <!-- Description -->
                        <div class="p-5">
                            {#if selectedAbility.description}
                                <p class="text-sm font-sans text-zinc-400 leading-relaxed">
                                    {selectedAbility.description}
                                </p>
                            {/if}
                            <!-- Stat bonuses (fragments) -->
                            {#if selectedAbility.statBonuses?.length}
                                <div class="flex flex-wrap gap-2 mt-4">
                                    {#each selectedAbility.statBonuses as sb}
                                        <span class="text-[9px] font-mono border px-2 py-0.5
                                                     {sb.value > 0
                                                         ? 'text-emerald-400 border-emerald-500/30'
                                                         : 'text-red-400 border-red-500/30'}">
                                            {sb.value > 0 ? '+' : ''}{sb.value}
                                        </span>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    </div>
                {:else}
                    <!-- Decorative idle -->
                    <div class="w-full h-48 flex items-center justify-center relative border border-zinc-800/40">
                        <div class="absolute inset-0 opacity-30 blur-3xl pointer-events-none"
                             style="background:linear-gradient(to top,{subclassColor},transparent)"></div>
                        <p class="text-[8px] font-mono uppercase tracking-[0.25em] text-zinc-800 relative">
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
                <span class="text-[9px] font-mono uppercase tracking-[0.25em] text-zinc-600 block mb-4">Aspects</span>
                <div class="flex flex-col items-center gap-6">
                    {#each sockets?.aspects ?? [] as aspect}
                        {@const isActive = selectedAbility?.name === aspect.name}
                        <button onclick={() => selectAbility(aspect)}
                                class="group flex flex-col items-center gap-2 w-full text-left transition-all">
                            <div class="w-20 h-20 bg-[#0c0c0c] border mx-auto overflow-hidden
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
                                <p class="text-[8px] text-zinc-600 uppercase tracking-widest font-bold">Aspect</p>
                                <p class="text-[10px] font-bold uppercase tracking-tight truncate w-28 mx-auto
                                          transition-colors {isActive ? 'text-emerald-400' : 'text-zinc-200 group-hover:text-white'}">
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
                            <p class="text-[8px] font-mono text-zinc-700 uppercase">Empty</p>
                        </div>
                    {/each}
                </div>
            </div>

            <!-- Fragments -->
            <div class="w-full pt-8 border-t border-zinc-800/40">
                <div class="flex items-center justify-between mb-4">
                    <span class="text-[9px] font-mono uppercase tracking-[0.25em] text-zinc-600">Fragments</span>
                    <span class="text-[8px] font-mono text-zinc-700">
                        {sockets?.fragments?.length ?? 0} equipped
                    </span>
                </div>
                <div class="grid grid-cols-3 gap-2">
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
                            <p class="text-[7px] font-mono uppercase tracking-tight text-center leading-tight px-0.5
                                      transition-colors w-14 truncate
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
                            <p class="text-[7px] font-mono text-zinc-800">—</p>
                        </div>
                    {/each}
                </div>
            </div>

        </div>
    </div>
</div>
