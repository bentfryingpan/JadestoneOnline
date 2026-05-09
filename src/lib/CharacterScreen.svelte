<script>
    let { char, eq, armorStatMeta = [], artifact = null } = $props();

    const classNames  = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' };
    const damageLabel = { 1:'Kinetic', 2:'Arc', 3:'Solar', 4:'Void', 6:'Stasis', 7:'Strand' };
    const damageColor = {
        1:'#C4C4C4', 2:'#79C7E3', 3:'#F0631D', 4:'#B185DF', 6:'#4D88FF', 7:'#4EEBA6'
    };
    const TIER_COLOR  = { 6:'#CEAE33', 5:'#522F65', 4:'#5076A3', 3:'#366F42', 2:'#555' };
    const TIER_LABEL  = { 6:'Exotic', 5:'Legendary', 4:'Rare', 3:'Uncommon', 2:'Common' };

    const WEAPON_SLOTS = ['kinetic','energy','power'];
    const ARMOR_SLOTS  = ['helmet','gauntlets','chest','legs','classItem'];

    // Subclass element accent
    const accent = $derived((() => {
        const n = (eq.subclass?.name ?? '').toLowerCase();
        if (n.includes('void'))   return { grad:'from-violet-900/40 to-transparent', ring:'#7C3AED', label:'text-violet-400' };
        if (n.includes('solar'))  return { grad:'from-orange-900/40 to-transparent', ring:'#EA580C', label:'text-orange-400' };
        if (n.includes('arc'))    return { grad:'from-cyan-900/40 to-transparent',   ring:'#0891B2', label:'text-cyan-400'   };
        if (n.includes('stasis')) return { grad:'from-blue-900/40 to-transparent',   ring:'#1D4ED8', label:'text-blue-400'   };
        if (n.includes('strand')) return { grad:'from-emerald-900/40 to-transparent',ring:'#059669', label:'text-emerald-400'};
        if (n.includes('prism'))  return { grad:'from-pink-900/40 to-transparent',   ring:'#DB2777', label:'text-pink-400'   };
        return { grad:'from-slate-800/40 to-transparent', ring:'#374151', label:'text-slate-400' };
    })());

    // Total armor stats summed across all 5 slots
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

    // Resolve stat meta by hash (for labelling mod stat bonuses)
    const statByHash = $derived(
        Object.fromEntries(armorStatMeta.map(m => [m.hash, m]))
    );

    // ── Stat system constants (Edge of Fate 2025) ──────────────────────────────
    // • 0–100: primary tiers (T0–T10), standard ability cooldown scaling
    // • 100–200: secondary bonus zone (additional damage res, ability damage, etc.)
    // • Total bar shows 20 pips × 10 pts = 200; first 10 pips are "primary zone"
    const STAT_CAP         = 200;  // hard cap
    const STAT_PIPS        = 20;   // visual pips
    const STAT_PTS_PER_PIP = 10;   // each pip = 10 stat points
    const STAT_TIER_CAP    = 10;   // T10 = 100 pts, boundary between primary/secondary zone

    function statTier(val) { return Math.min(STAT_PIPS, Math.floor(val / STAT_PTS_PER_PIP)); }
    function statPct(val)  { return Math.min(100, (val / STAT_CAP) * 100).toFixed(1); }

    // Weapon perks
    function weaponPerks(item) {
        if (!item?.perks) return { intrinsic: null, main: [], mod: null, mw: null };
        return {
            intrinsic: item.perks.find(p => p.isIntrinsic)  ?? null,
            mw:        item.perks.find(p => p.isMasterwork) ?? null,
            mod:       item.perks.find(p => p.isMod)        ?? null,
            main:      item.perks.filter(p => !p.isIntrinsic && !p.isMasterwork && !p.isMod)
        };
    }

    // Format investmentStat bonus for display (e.g. "+10 Health")
    function formatBonus(bonus) {
        const meta = statByHash[bonus.statHash];
        if (!meta) return null;
        const sign = bonus.value > 0 ? '+' : '';
        return { label: meta.short, value: `${sign}${bonus.value}`, color: meta.text };
    }
</script>

<!-- ── Wrapper ──────────────────────────────────────────────────────────────── -->
<div class="bg-[#0c0e1a] border border-white/[0.07] rounded-2xl overflow-hidden">

    <!-- ── Power + class header ───────────────────────────────────────────── -->
    <div class="bg-gradient-to-r {accent.grad} px-6 py-4 flex items-center justify-between border-b border-white/[0.06]">
        <div class="flex items-center gap-4">
            {#if eq.subclass?.icon}
                <img src={eq.subclass.icon} alt={eq.subclass.name}
                     class="w-10 h-10 rounded object-cover"
                     style="outline: 2px solid {accent.ring}; outline-offset: 2px;" />
            {/if}
            <div>
                <p class="text-white font-bold text-lg leading-none">{classNames[char?.classType] ?? 'Guardian'}</p>
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

    <!-- ── Main 3-col grid ────────────────────────────────────────────────── -->
    <div class="grid grid-cols-[1fr_minmax(160px,220px)_1fr] gap-0 divide-x divide-white/[0.05]">

        <!-- ═══ LEFT: Weapons ═══════════════════════════════════════════════ -->
        <div class="p-4 space-y-2">
            <p class="text-[10px] text-slate-600 uppercase tracking-widest mb-3 font-semibold">Weapons</p>

            {#each WEAPON_SLOTS as slot}
                {@const item = eq[slot]}
                {#if item}
                    {@const perks = weaponPerks(item)}
                    <div class="flex gap-3 items-start">
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

                            <!-- Perk icons row -->
                            {#if perks.intrinsic || perks.main.length}
                                <div class="flex gap-1 mt-1.5 flex-wrap items-center">
                                    {#if perks.intrinsic}
                                        <PerkIcon perk={perks.intrinsic} ring="ring-yellow-600/60" />
                                    {/if}
                                    {#each perks.main.slice(0, 4) as perk}
                                        <PerkIcon {perk} ring="ring-white/10" />
                                    {/each}
                                    {#if perks.mw}
                                        <PerkIcon perk={perks.mw} ring="ring-amber-400/60" labelClass="text-amber-300" prefix="MW: " />
                                    {/if}
                                    {#if perks.mod}
                                        <PerkIcon perk={perks.mod} ring="ring-blue-400/40" labelClass="text-blue-300" />
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

            <!-- Accessories -->
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

        <!-- ═══ CENTER: Armor Stats ══════════════════════════════════════════ -->
        <div class="p-4 flex flex-col gap-3">
            <div class="flex items-baseline justify-between">
                <p class="text-[10px] text-slate-600 uppercase tracking-widest font-semibold">Armor Stats</p>
                <p class="text-[9px] text-slate-700">/ 200</p>
            </div>

            {#each armorStatMeta as stat}
                {@const val  = totalStats[stat.name] ?? 0}
                {@const tier = statTier(val)}
                <div class="group relative">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-[11px] font-bold {stat.text}" title={stat.description}>{stat.short}</span>
                        <div class="flex items-center gap-1.5">
                            {#if val > 100}
                                <span class="text-[9px] text-amber-400 font-bold">T{Math.min(20, tier)}</span>
                            {:else}
                                <span class="text-[9px] text-slate-600">T{tier}</span>
                            {/if}
                            <span class="text-[11px] font-mono {val >= 100 ? 'text-amber-300' : 'text-slate-300'}">{val}</span>
                        </div>
                    </div>

                    <!-- 20-pip bar (each pip = 10 pts, total = 200) -->
                    <div class="flex gap-[2px]">
                        {#each Array(STAT_PIPS) as _, i}
                            <div class="h-1.5 flex-1 rounded-sm transition-colors
                                        {i < tier
                                            ? (i < STAT_TIER_CAP ? stat.color : 'bg-amber-400')
                                            : 'bg-white/10'}">
                            </div>
                        {/each}
                    </div>

                    <!-- T10 boundary marker -->
                    <div class="relative h-0">
                        <div class="absolute top-0 w-px h-2 bg-white/20 -translate-y-2"
                             style="left: calc(50% - 0.5px)"></div>
                    </div>

                    <!-- Stat description tooltip on hover -->
                    {#if stat.description}
                        <div class="absolute bottom-full left-0 mb-2 z-50 hidden group-hover:block
                                    w-52 bg-[#0d0f1a] border border-white/10 rounded-lg p-3
                                    shadow-2xl pointer-events-none">
                            <p class="text-xs font-bold {stat.text} mb-1">{stat.name}</p>
                            <p class="text-[10px] text-slate-400 leading-snug">{stat.description}</p>
                            <div class="mt-2 pt-2 border-t border-white/[0.06]">
                                <p class="text-[9px] text-slate-600">
                                    0–100: standard tiers · 100–200: secondary bonus
                                </p>
                            </div>
                        </div>
                    {/if}
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

            <!-- Ship -->
            {#if eq.ship}
                <div class="mt-auto pt-3 border-t border-white/[0.05]">
                    <div class="flex items-center gap-2">
                        {#if eq.ship.icon}
                            <img src={eq.ship.icon} alt={eq.ship.name}
                                 class="w-8 h-8 object-cover rounded ring-1 ring-white/10 opacity-60" />
                        {/if}
                        <p class="text-[10px] text-slate-600 truncate">{eq.ship.name}</p>
                    </div>
                </div>
            {/if}
        </div>

        <!-- ═══ RIGHT: Armor ═════════════════════════════════════════════════ -->
        <div class="p-4 space-y-2">
            <p class="text-[10px] text-slate-600 uppercase tracking-widest mb-3 font-semibold">Armor</p>

            {#each ARMOR_SLOTS as slot}
                {@const item = eq[slot]}
                {#if item}
                    <div class="flex gap-3 items-start">
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
                                {TIER_LABEL[item.tierType] ?? ''} · {item.itemTypeDisplayName}
                            </p>

                            <!-- Per-piece stat mini-bars (uses API max for accurate scaling) -->
                            {#if item.armorStats}
                                <div class="mt-1.5 grid grid-cols-3 gap-x-2 gap-y-0.5">
                                    {#each item.armorStats as s}
                                        {@const pct = Math.min(100, (s.value / Math.max(s.maximum, 30)) * 100)}
                                        <div class="flex items-center gap-1" title="{s.name}: {s.value} / {s.maximum}">
                                            <span class="text-[8px] font-bold {s.text} w-5 shrink-0">{s.short.split('/')[0]}</span>
                                            <div class="flex-1 h-0.5 bg-white/10 rounded-full overflow-hidden">
                                                <div class="{s.color} h-full rounded-full"
                                                     style="width:{pct.toFixed(0)}%"></div>
                                            </div>
                                            <span class="text-[8px] text-slate-400 w-4 text-right tabular-nums">{s.value}</span>
                                        </div>
                                    {/each}
                                </div>
                            {/if}

                            <!-- Armor mods with stat bonuses -->
                            {#if item.mods?.length}
                                <div class="mt-1.5 flex gap-1 flex-wrap">
                                    {#each item.mods as mod}
                                        <div class="group/m relative">
                                            {#if mod.icon}
                                                <img src={mod.icon} alt={mod.name}
                                                     class="w-5 h-5 object-cover rounded-sm ring-1
                                                            {mod.isEnabled ? 'ring-blue-400/50 opacity-90' : 'ring-white/10 opacity-40'}" />
                                            {/if}
                                            <!-- Mod tooltip -->
                                            <div class="absolute bottom-full left-0 mb-1.5 z-50 hidden group-hover/m:block
                                                        w-52 bg-[#0d0f1a] border border-white/10 rounded-lg p-2.5
                                                        shadow-2xl pointer-events-none">
                                                <p class="text-xs font-bold text-white mb-0.5">{mod.name}</p>
                                                <p class="text-[9px] text-blue-400 mb-1.5">{mod.itemTypeDisplayName}</p>
                                                {#if mod.description}
                                                    <p class="text-[10px] text-slate-400 leading-snug mb-1.5">{mod.description}</p>
                                                {/if}
                                                <!-- Stat bonuses from investmentStats -->
                                                {#if mod.statBonuses?.length}
                                                    <div class="flex flex-wrap gap-1 pt-1.5 border-t border-white/[0.06]">
                                                        {#each mod.statBonuses as bonus}
                                                            {@const fmt = formatBonus(bonus)}
                                                            {#if fmt}
                                                                <span class="text-[9px] font-bold {fmt.color} bg-white/[0.05] rounded px-1 py-0.5">
                                                                    {fmt.value} {fmt.label}
                                                                </span>
                                                            {/if}
                                                        {/each}
                                                    </div>
                                                {/if}
                                                {#if mod.conditionalBonuses?.length}
                                                    <div class="flex flex-wrap gap-1 pt-1 mt-1">
                                                        {#each mod.conditionalBonuses as bonus}
                                                            {@const fmt = formatBonus(bonus)}
                                                            {#if fmt}
                                                                <span class="text-[9px] {fmt.color} opacity-60 italic">
                                                                    {fmt.value} {fmt.label} (conditional)
                                                                </span>
                                                            {/if}
                                                        {/each}
                                                    </div>
                                                {/if}
                                            </div>
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

<!-- ── Shared perk icon snippet ──────────────────────────────────────────────── -->
{#snippet PerkIcon(perk, ring = 'ring-white/10', labelClass = 'text-white', prefix = '')}
    <div class="group/p relative">
        {#if perk.icon}
            <img src={perk.icon} alt={perk.name}
                 class="w-5 h-5 object-cover rounded-sm ring-1 {ring}
                        {perk.isEnabled === false ? 'opacity-30' : 'opacity-90'}" />
        {/if}
        <!-- Rich tooltip -->
        <div class="absolute bottom-full left-0 mb-1.5 z-50 hidden group-hover/p:block
                    w-52 bg-[#0d0f1a] border border-white/10 rounded-lg p-2.5
                    shadow-2xl pointer-events-none">
            <p class="text-xs font-bold {labelClass} mb-0.5">{prefix}{perk.name}</p>
            {#if perk.itemTypeDisplayName}
                <p class="text-[9px] text-slate-600 mb-1">{perk.itemTypeDisplayName}</p>
            {/if}
            {#if perk.description}
                <p class="text-[10px] text-slate-300 leading-snug">{perk.description}</p>
            {/if}
            {#if perk.flavorText}
                <p class="text-[9px] text-slate-600 italic mt-1 leading-snug">{perk.flavorText}</p>
            {/if}
            <!-- investmentStat bonuses (weapon perks that buff stats) -->
            {#if perk.statBonuses?.length}
                <div class="flex flex-wrap gap-1 mt-1.5 pt-1.5 border-t border-white/[0.06]">
                    {#each perk.statBonuses as bonus}
                        {@const fmt = formatBonus(bonus)}
                        {#if fmt}
                            <span class="text-[9px] font-bold {fmt.color} bg-white/[0.05] rounded px-1 py-0.5">
                                {fmt.value} {fmt.label}
                            </span>
                        {/if}
                    {/each}
                </div>
            {/if}
            {#if perk.isEnabled === false}
                <p class="text-[9px] text-red-400 mt-1 pt-1 border-t border-white/[0.06]">
                    Perk not active (requirements not met)
                </p>
            {/if}
        </div>
    </div>
{/snippet}
