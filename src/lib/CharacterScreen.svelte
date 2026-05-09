<script>
    let { char, eq, armorStatMeta = [], artifact = null } = $props();

    const classNames  = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' };
    const damageLabel = { 1:'Kinetic', 2:'Arc', 3:'Solar', 4:'Void', 6:'Stasis', 7:'Strand' };
    const damageColor = {
        1:'#C4C4C4', 2:'#79C7E3', 3:'#F0631D', 4:'#B185DF', 6:'#4D88FF', 7:'#4EEBA6'
    };

    const TIER_COLOR  = { 6:'#CEAE33', 5:'#522F65', 4:'#5076A3', 3:'#366F42', 2:'#555' };
    const TIER_LABEL  = { 6:'Exotic', 5:'Legendary', 4:'Rare', 3:'Uncommon', 2:'Common' };

    const WEAPON_SLOTS  = ['kinetic','energy','power'];
    const ARMOR_SLOTS   = ['helmet','gauntlets','chest','legs','classItem'];
    const UTILITY_SLOTS = ['ghost','vehicle','ship'];

    // Subclass element accent (reactive — eq changes when character switches)
    const accent = $derived((() => {
        const n = (eq.subclass?.name ?? '').toLowerCase();
        if (n.includes('void'))   return { grad: 'from-violet-900/40 to-transparent', ring: '#7C3AED', label: 'text-violet-400' };
        if (n.includes('solar'))  return { grad: 'from-orange-900/40 to-transparent', ring: '#EA580C', label: 'text-orange-400' };
        if (n.includes('arc'))    return { grad: 'from-cyan-900/40 to-transparent',   ring: '#0891B2', label: 'text-cyan-400'   };
        if (n.includes('stasis')) return { grad: 'from-blue-900/40 to-transparent',   ring: '#1D4ED8', label: 'text-blue-400'   };
        if (n.includes('strand')) return { grad: 'from-emerald-900/40 to-transparent',ring: '#059669', label: 'text-emerald-400'};
        if (n.includes('prism'))  return { grad: 'from-pink-900/40 to-transparent',   ring: '#DB2777', label: 'text-pink-400'   };
        return { grad: 'from-slate-800/40 to-transparent',  ring: '#374151', label: 'text-slate-400' };
    })());

    // Total armor stats
    const totalStats = $derived((() => {
        const totals = {};
        for (const m of armorStatMeta) totals[m.name] = 0;
        for (const slot of ARMOR_SLOTS) {
            for (const s of eq[slot]?.armorStats ?? []) {
                totals[s.name] = (totals[s.name] ?? 0) + s.value;
            }
        }
        return totals;
    })());

    function weaponPerks(item) {
        if (!item?.perks) return { intrinsic: null, main: [], mod: null, mw: null };
        return {
            intrinsic: item.perks.find(p => p.isIntrinsic)  ?? null,
            mw:        item.perks.find(p => p.isMasterwork) ?? null,
            mod:       item.perks.find(p => p.isMod)        ?? null,
            main:      item.perks.filter(p => !p.isIntrinsic && !p.isMasterwork && !p.isMod)
        };
    }

    // Stat bar max (each stat 0–100, but builds rarely exceed 100 per stat;
    // total across 5 pieces capped at ~340 per stat for master builds)
    const STAT_MAX = 340;
</script>

<!-- ── Wrapper ──────────────────────────────────────────────────────────────── -->
<div class="bg-[#0c0e1a] border border-white/[0.07] rounded-2xl overflow-hidden">

    <!-- ── Top bar: power + class + subclass ──────────────────────────────── -->
    <div class="bg-gradient-to-r {accent.grad} px-6 py-4 flex items-center justify-between
                border-b border-white/[0.06]">
        <div class="flex items-center gap-4">
            {#if eq.subclass?.icon}
                <img src={eq.subclass.icon} alt={eq.subclass.name}
                     class="w-10 h-10 rounded object-cover"
                     style="outline: 2px solid {accent.ring}; outline-offset: 2px;" />
            {/if}
            <div>
                <p class="text-white font-bold text-lg leading-none">
                    {classNames[char?.classType] ?? 'Guardian'}
                </p>
                {#if eq.subclass}
                    <p class="text-sm {accent.label} mt-0.5">{eq.subclass.name}</p>
                {/if}
            </div>
        </div>

        <div class="text-right">
            <p class="text-xs text-slate-500 uppercase tracking-wider">Power</p>
            <p class="text-3xl font-black text-yellow-400 leading-none">{char?.light ?? '—'}</p>
        </div>
    </div>

    <!-- ── Main 3-column grid ──────────────────────────────────────────────── -->
    <div class="grid grid-cols-[1fr_minmax(160px,220px)_1fr] gap-0 divide-x divide-white/[0.05]">

        <!-- ── LEFT: Weapons ────────────────────────────────────────────────── -->
        <div class="p-4 space-y-2">
            <p class="text-[10px] text-slate-600 uppercase tracking-widest mb-3 font-semibold">Weapons</p>

            {#each WEAPON_SLOTS as slot}
                {@const item = eq[slot]}
                {#if item}
                    {@const perks = weaponPerks(item)}
                    <div class="group flex gap-3 items-start hover:bg-white/[0.03] rounded-lg p-2 -m-2 transition-colors">
                        <!-- Icon -->
                        <div class="relative shrink-0 w-14 h-14 rounded"
                             style="outline: 2px solid {TIER_COLOR[item.tierType] ?? '#555'}; outline-offset: -1px;">
                            {#if item.icon}
                                <img src={item.icon} alt={item.name} class="w-full h-full object-cover rounded" />
                            {:else}
                                <div class="w-full h-full bg-white/5 rounded"></div>
                            {/if}
                            {#if item.power}
                                <span class="absolute bottom-0.5 right-0.5 text-[9px] font-bold
                                             text-yellow-300 bg-black/70 px-0.5 rounded leading-none py-0.5">
                                    {item.power}
                                </span>
                            {/if}
                        </div>

                        <!-- Info -->
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-semibold text-white truncate leading-tight">{item.name}</p>
                            <p class="text-[11px] text-slate-500 mt-0.5">
                                {item.itemTypeDisplayName}
                                {#if item.damageType && item.damageType !== 1}
                                    · <span style="color:{damageColor[item.damageType]}">{damageLabel[item.damageType]}</span>
                                {/if}
                            </p>
                            <!-- Perk row -->
                            {#if perks.intrinsic || perks.main.length}
                                <div class="flex gap-1 mt-1.5 flex-wrap">
                                    {#if perks.intrinsic}
                                        <div class="group/p relative">
                                            {#if perks.intrinsic.icon}
                                                <img src={perks.intrinsic.icon} alt={perks.intrinsic.name}
                                                     class="w-5 h-5 object-cover rounded-sm opacity-90
                                                            ring-1 ring-yellow-600/60" />
                                            {/if}
                                            <div class="absolute bottom-full left-0 mb-1.5 z-50 hidden group-hover/p:block
                                                        w-44 bg-[#0d0f1a] border border-white/10 rounded-lg p-2 shadow-xl pointer-events-none">
                                                <p class="text-xs font-bold text-yellow-300">{perks.intrinsic.name}</p>
                                                {#if perks.intrinsic.description}
                                                    <p class="text-[10px] text-slate-400 mt-0.5 leading-snug">{perks.intrinsic.description}</p>
                                                {/if}
                                            </div>
                                        </div>
                                    {/if}
                                    {#each perks.main.slice(0,4) as perk}
                                        <div class="group/p relative">
                                            {#if perk.icon}
                                                <img src={perk.icon} alt={perk.name}
                                                     class="w-5 h-5 object-cover rounded-sm opacity-80
                                                            ring-1 ring-white/10
                                                            {perk.isEnabled ? 'opacity-90' : 'opacity-30'}" />
                                            {/if}
                                            <div class="absolute bottom-full left-0 mb-1.5 z-50 hidden group-hover/p:block
                                                        w-44 bg-[#0d0f1a] border border-white/10 rounded-lg p-2 shadow-xl pointer-events-none">
                                                <p class="text-xs font-bold text-white">{perk.name}</p>
                                                {#if perk.description}
                                                    <p class="text-[10px] text-slate-400 mt-0.5 leading-snug">{perk.description}</p>
                                                {/if}
                                            </div>
                                        </div>
                                    {/each}
                                    {#if perks.mw}
                                        <div class="group/p relative">
                                            {#if perks.mw.icon}
                                                <img src={perks.mw.icon} alt={perks.mw.name}
                                                     class="w-5 h-5 object-cover rounded-sm ring-1 ring-amber-400/60" />
                                            {/if}
                                            <div class="absolute bottom-full left-0 mb-1.5 z-50 hidden group-hover/p:block
                                                        w-44 bg-[#0d0f1a] border border-white/10 rounded-lg p-2 shadow-xl pointer-events-none">
                                                <p class="text-xs font-bold text-amber-300">MW: {perks.mw.name}</p>
                                            </div>
                                        </div>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    </div>
                {:else}
                    <div class="flex gap-3 items-center opacity-20">
                        <div class="w-14 h-14 rounded border border-white/10 border-dashed"></div>
                        <p class="text-xs text-slate-500 capitalize">{slot}</p>
                    </div>
                {/if}
            {/each}

            <!-- Utility -->
            <div class="pt-3 mt-1 border-t border-white/[0.05]">
                <p class="text-[10px] text-slate-600 uppercase tracking-widest mb-2 font-semibold">Accessories</p>
                <div class="flex gap-2">
                    {#each ['ghost','vehicle'] as slot}
                        {@const item = eq[slot]}
                        {#if item?.icon}
                            <div class="group relative">
                                <img src={item.icon} alt={item.name}
                                     class="w-10 h-10 rounded object-cover ring-1 ring-white/10" />
                                <div class="absolute bottom-full left-0 mb-1.5 z-50 hidden group-hover:block
                                            whitespace-nowrap bg-[#0d0f1a] border border-white/10
                                            rounded px-2 py-1 text-[10px] text-white shadow-xl pointer-events-none">
                                    {item.name}
                                </div>
                            </div>
                        {:else}
                            <div class="w-10 h-10 rounded border border-white/10 border-dashed opacity-20"></div>
                        {/if}
                    {/each}
                </div>
            </div>
        </div>

        <!-- ── CENTER: Stats ─────────────────────────────────────────────────── -->
        <div class="p-4 flex flex-col gap-3">
            <p class="text-[10px] text-slate-600 uppercase tracking-widest font-semibold">Armor Stats</p>

            {#each armorStatMeta as stat}
                {@const val = totalStats[stat.name] ?? 0}
                {@const pct = Math.min(100, (val / STAT_MAX) * 100)}
                {@const tier = Math.floor(val / 10)}
                <div>
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-[11px] font-bold {stat.text}">{stat.short}</span>
                        <span class="text-[11px] font-mono text-slate-300">{val}</span>
                    </div>
                    <!-- Tier blocks (like in-game: 10 blocks, each = 10 points) -->
                    <div class="flex gap-0.5">
                        {#each Array(10) as _, i}
                            <div class="h-1.5 flex-1 rounded-sm
                                        {i < tier ? stat.color : 'bg-white/10'}"></div>
                        {/each}
                    </div>
                </div>
            {/each}

            <!-- Artifact -->
            {#if artifact}
                <div class="mt-2 pt-3 border-t border-white/[0.05]">
                    <p class="text-[10px] text-slate-600 uppercase tracking-widest mb-2 font-semibold">Artifact</p>
                    <div class="flex items-center gap-2">
                        {#if artifact.icon}
                            <img src={artifact.icon} alt={artifact.name}
                                 class="w-9 h-9 object-cover rounded ring-1 ring-white/10" />
                        {/if}
                        <div>
                            <p class="text-xs text-white font-medium leading-tight">{artifact.name}</p>
                            <p class="text-[10px] text-yellow-400 mt-0.5">+{artifact.powerBonus} Power</p>
                        </div>
                    </div>
                </div>
            {/if}

            <!-- Ship (bottom of center) -->
            {#if eq.ship}
                <div class="mt-auto pt-3 border-t border-white/[0.05]">
                    <div class="group relative flex items-center gap-2">
                        {#if eq.ship.icon}
                            <img src={eq.ship.icon} alt={eq.ship.name}
                                 class="w-8 h-8 object-cover rounded ring-1 ring-white/10 opacity-60" />
                        {/if}
                        <p class="text-[10px] text-slate-600 truncate">{eq.ship.name}</p>
                    </div>
                </div>
            {/if}
        </div>

        <!-- ── RIGHT: Armor ──────────────────────────────────────────────────── -->
        <div class="p-4 space-y-2">
            <p class="text-[10px] text-slate-600 uppercase tracking-widest mb-3 font-semibold">Armor</p>

            {#each ARMOR_SLOTS as slot}
                {@const item = eq[slot]}
                {#if item}
                    <div class="group flex gap-3 items-start hover:bg-white/[0.03] rounded-lg p-2 -m-2 transition-colors">
                        <!-- Icon -->
                        <div class="relative shrink-0 w-14 h-14 rounded"
                             style="outline: 2px solid {TIER_COLOR[item.tierType] ?? '#555'}; outline-offset: -1px;">
                            {#if item.icon}
                                <img src={item.icon} alt={item.name} class="w-full h-full object-cover rounded" />
                            {:else}
                                <div class="w-full h-full bg-white/5 rounded"></div>
                            {/if}
                            {#if item.power}
                                <span class="absolute bottom-0.5 right-0.5 text-[9px] font-bold
                                             text-yellow-300 bg-black/70 px-0.5 rounded leading-none py-0.5">
                                    {item.power}
                                </span>
                            {/if}
                        </div>

                        <!-- Info -->
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-semibold text-white truncate leading-tight">{item.name}</p>
                            <p class="text-[11px] text-slate-500 mt-0.5">{TIER_LABEL[item.tierType] ?? ''} · {item.itemTypeDisplayName}</p>

                            <!-- Armor stat mini-bars -->
                            {#if item.armorStats}
                                <div class="mt-1.5 grid grid-cols-3 gap-x-2 gap-y-0.5">
                                    {#each item.armorStats as s}
                                        <div class="flex items-center gap-1" title="{s.name}: {s.value}">
                                            <span class="text-[8px] font-bold {s.text} w-5 shrink-0">{s.short}</span>
                                            <div class="flex-1 h-0.5 bg-white/10 rounded-full overflow-hidden">
                                                <div class="{s.color} h-full rounded-full transition-all"
                                                     style="width:{Math.min(100, (s.value/42)*100).toFixed(0)}%"></div>
                                            </div>
                                            <span class="text-[8px] text-slate-400 w-3 text-right">{s.value}</span>
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    </div>
                {:else}
                    <div class="flex gap-3 items-center opacity-20">
                        <div class="w-14 h-14 rounded border border-white/10 border-dashed"></div>
                        <p class="text-xs text-slate-500 capitalize">{slot}</p>
                    </div>
                {/if}
            {/each}
        </div>
    </div>
</div>
