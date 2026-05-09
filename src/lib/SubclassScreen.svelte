<script>
    let { char, eq, sockets } = $props();

    const classNames = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' };

    const theme = $derived((() => {
        const n = (eq.subclass?.name ?? '').toLowerCase();
        if (n.includes('void'))   return { grad:'from-violet-950 via-[#0c0e1a] to-[#0c0e1a]', border:'border-violet-500/40', ring:'ring-violet-500/50', accent:'text-violet-400', bar:'bg-violet-500', glow:'shadow-violet-900/60' };
        if (n.includes('solar'))  return { grad:'from-orange-950 via-[#0c0e1a] to-[#0c0e1a]', border:'border-orange-500/40', ring:'ring-orange-500/50', accent:'text-orange-400', bar:'bg-orange-500', glow:'shadow-orange-900/60' };
        if (n.includes('arc'))    return { grad:'from-cyan-950 via-[#0c0e1a] to-[#0c0e1a]',   border:'border-cyan-500/40',   ring:'ring-cyan-400/50',   accent:'text-cyan-400',   bar:'bg-cyan-400',   glow:'shadow-cyan-900/60'   };
        if (n.includes('stasis')) return { grad:'from-blue-950 via-[#0c0e1a] to-[#0c0e1a]',   border:'border-blue-500/40',   ring:'ring-blue-400/50',   accent:'text-blue-400',   bar:'bg-blue-400',   glow:'shadow-blue-900/60'   };
        if (n.includes('strand')) return { grad:'from-emerald-950 via-[#0c0e1a] to-[#0c0e1a]',border:'border-emerald-500/40',ring:'ring-emerald-400/50',accent:'text-emerald-400',bar:'bg-emerald-400', glow:'shadow-emerald-900/60'};
        if (n.includes('prism'))  return { grad:'from-fuchsia-950 via-[#0c0e1a] to-[#0c0e1a]',border:'border-fuchsia-500/40',ring:'ring-fuchsia-400/50',accent:'text-fuchsia-400',bar:'bg-fuchsia-400', glow:'shadow-fuchsia-900/60'};
        return { grad:'from-slate-900 via-[#0c0e1a] to-[#0c0e1a]', border:'border-white/10', ring:'ring-white/20', accent:'text-slate-400', bar:'bg-slate-500', glow:'shadow-slate-900/60' };
    })());

    function abilityLabel(t) {
        const n = t.toLowerCase();
        if (n.includes('movement')) return 'Jump';
        if (n.includes('melee'))   return 'Melee';
        if (n.includes('grenade')) return 'Grenade';
        if (n.includes('class'))   return 'Class';
        return t;
    }
</script>

<!-- ── Wrapper ──────────────────────────────────────────────────────────────── -->
<div class="bg-[#0c0e1a] border border-white/[0.07] rounded-2xl overflow-hidden">

    <!-- ── Hero: Subclass + Super ─────────────────────────────────────────── -->
    <div class="bg-gradient-to-b {theme.grad} px-6 pt-6 pb-4 border-b {theme.border}">
        <div class="flex items-center gap-5">

            <!-- Super icon (large) -->
            {#if sockets?.super?.icon}
                <div class="relative shrink-0">
                    <div class="absolute inset-0 rounded-xl blur-xl opacity-60 {theme.bar}"></div>
                    <img src={sockets.super.icon} alt={sockets.super.name}
                         class="relative w-20 h-20 object-cover rounded-xl {theme.ring} ring-2 shadow-2xl {theme.glow}" />
                </div>
            {:else if eq.subclass?.icon}
                <img src={eq.subclass.icon} alt={eq.subclass?.name}
                     class="w-20 h-20 object-cover rounded-xl {theme.ring} ring-2" />
            {:else}
                <div class="w-20 h-20 rounded-xl bg-white/5 {theme.ring} ring-2"></div>
            {/if}

            <!-- Labels -->
            <div>
                <p class="text-xs {theme.accent} uppercase tracking-widest font-bold mb-1">
                    {eq.subclass?.name ?? 'Unknown'}
                </p>
                <p class="text-white text-xl font-bold leading-tight">
                    {sockets?.super?.name ?? 'Super Ability'}
                </p>
                {#if sockets?.super?.description}
                    <p class="text-slate-400 text-sm mt-1.5 max-w-md leading-snug line-clamp-2">
                        {sockets.super.description}
                    </p>
                {/if}
                <p class="text-[11px] text-slate-600 mt-2 uppercase tracking-wider">
                    {classNames[char?.classType] ?? 'Guardian'} · Super
                </p>
            </div>
        </div>
    </div>

    <!-- ── Abilities row ─────────────────────────────────────────────────── -->
    <div class="px-6 py-5 border-b {theme.border}">
        <p class="text-[10px] text-slate-600 uppercase tracking-widest font-semibold mb-4">Abilities</p>

        <div class="grid grid-cols-4 gap-3">
            {#each sockets?.abilities ?? [] as ability}
                <div class="group relative flex flex-col items-center gap-2">
                    <!-- Icon -->
                    <div class="relative w-16 h-16 rounded-lg {theme.ring} ring-1 overflow-hidden
                                bg-white/5 hover:scale-105 transition-transform cursor-default">
                        {#if ability.icon}
                            <img src={ability.icon} alt={ability.name}
                                 class="w-full h-full object-cover" />
                        {/if}
                        {#if !ability.isEnabled}
                            <div class="absolute inset-0 bg-black/60"></div>
                        {/if}
                    </div>

                    <!-- Label -->
                    <div class="text-center">
                        <p class="text-[10px] {theme.accent} font-bold uppercase tracking-wider">
                            {abilityLabel(ability.itemTypeDisplayName)}
                        </p>
                        <p class="text-[11px] text-slate-300 leading-tight text-center line-clamp-2">
                            {ability.name}
                        </p>
                    </div>

                    <!-- Tooltip -->
                    <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 hidden group-hover:block
                                w-56 bg-[#0d0f1a] border border-white/10 rounded-xl p-3 shadow-2xl pointer-events-none">
                        <p class="text-xs font-bold text-white mb-1">{ability.name}</p>
                        <p class="text-[10px] {theme.accent}">{ability.itemTypeDisplayName}</p>
                        {#if ability.description}
                            <p class="text-[10px] text-slate-400 mt-1.5 leading-snug">{ability.description}</p>
                        {/if}
                    </div>
                </div>
            {/each}

            <!-- Empty slots -->
            {#each Array(Math.max(0, 4 - (sockets?.abilities?.length ?? 0))) as _}
                <div class="w-16 h-16 rounded-lg border border-white/10 border-dashed opacity-20 mx-auto"></div>
            {/each}
        </div>
    </div>

    <!-- ── Aspects + Fragments ───────────────────────────────────────────── -->
    <div class="grid grid-cols-[1fr_2fr] divide-x divide-white/[0.05]">

        <!-- Aspects -->
        <div class="px-6 py-5 border-b {theme.border}">
            <p class="text-[10px] text-slate-600 uppercase tracking-widest font-semibold mb-4">Aspects</p>

            <div class="space-y-3">
                {#each sockets?.aspects ?? [] as aspect}
                    <div class="group relative flex items-center gap-3 hover:bg-white/[0.03]
                                rounded-xl p-2 -m-2 transition-colors cursor-default">
                        <div class="relative w-14 h-14 shrink-0 rounded-lg {theme.ring} ring-1 overflow-hidden bg-white/5">
                            {#if aspect.icon}
                                <img src={aspect.icon} alt={aspect.name} class="w-full h-full object-cover" />
                            {/if}
                        </div>
                        <div>
                            <p class="text-sm font-semibold text-white leading-tight">{aspect.name}</p>
                            {#if aspect.description}
                                <p class="text-[10px] text-slate-400 mt-0.5 line-clamp-2 leading-snug">
                                    {aspect.description}
                                </p>
                            {/if}
                        </div>
                        <!-- Tooltip -->
                        <div class="absolute bottom-full left-0 mb-2 z-50 hidden group-hover:block
                                    w-64 bg-[#0d0f1a] border border-white/10 rounded-xl p-3 shadow-2xl pointer-events-none">
                            <p class="text-xs font-bold text-white mb-1">{aspect.name}</p>
                            <p class="text-[10px] {theme.accent} mb-1">Aspect</p>
                            {#if aspect.description}
                                <p class="text-[10px] text-slate-400 leading-snug">{aspect.description}</p>
                            {/if}
                        </div>
                    </div>
                {/each}

                {#each Array(Math.max(0, 2 - (sockets?.aspects?.length ?? 0))) as _}
                    <div class="flex items-center gap-3 opacity-20">
                        <div class="w-14 h-14 rounded-lg border border-white/10 border-dashed shrink-0"></div>
                        <p class="text-xs text-slate-600">Empty aspect</p>
                    </div>
                {/each}
            </div>
        </div>

        <!-- Fragments -->
        <div class="px-6 py-5">
            <p class="text-[10px] text-slate-600 uppercase tracking-widest font-semibold mb-4">
                Fragments
                <span class="text-slate-700 normal-case tracking-normal ml-2">
                    {sockets?.fragments?.length ?? 0} equipped
                </span>
            </p>

            <div class="grid grid-cols-3 gap-2">
                {#each sockets?.fragments ?? [] as fragment}
                    <div class="group relative flex flex-col items-center gap-1.5 cursor-default">
                        <div class="w-12 h-12 rounded-lg {theme.ring} ring-1 overflow-hidden bg-white/5
                                    hover:scale-105 transition-transform">
                            {#if fragment.icon}
                                <img src={fragment.icon} alt={fragment.name}
                                     class="w-full h-full object-cover" />
                            {/if}
                        </div>
                        <p class="text-[9px] text-slate-400 text-center leading-tight line-clamp-2 px-0.5">
                            {fragment.name}
                        </p>
                        <!-- Tooltip -->
                        <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 hidden group-hover:block
                                    w-52 bg-[#0d0f1a] border border-white/10 rounded-xl p-3 shadow-2xl pointer-events-none">
                            <p class="text-xs font-bold text-white mb-1">{fragment.name}</p>
                            <p class="text-[10px] {theme.accent} mb-1">Fragment</p>
                            {#if fragment.description}
                                <p class="text-[10px] text-slate-400 leading-snug">{fragment.description}</p>
                            {/if}
                        </div>
                    </div>
                {/each}

                <!-- Empty slots (fragments unlocked by aspects, up to 5 max) -->
                {#each Array(Math.max(0, 5 - (sockets?.fragments?.length ?? 0))) as _}
                    <div class="flex flex-col items-center gap-1.5 opacity-15">
                        <div class="w-12 h-12 rounded-lg border border-white/10 border-dashed"></div>
                        <p class="text-[9px] text-slate-600">—</p>
                    </div>
                {/each}
            </div>
        </div>
    </div>
</div>
