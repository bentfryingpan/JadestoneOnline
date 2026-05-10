<script>
    import {
        STAT_ABILITY_DATA, SOCKET_COLORS, classifySubclassSocket,
        fmtCooldown, getTierRow
    } from '$lib/d2data.js';

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
    const STAT_CAP         = 200;
    const STAT_PIPS        = 20;
    const STAT_PTS_PER_PIP = 10;
    const STAT_TIER_CAP    = 10;

    function statTier(val) { return Math.min(STAT_PIPS, Math.floor(val / STAT_PTS_PER_PIP)); }

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
        return { label: meta.short, fullName: meta.name, value: `${sign}${bonus.value}`, color: meta.text };
    }

    // ── Subclass socket classification ────────────────────────────────────────
    const subclassSockets = $derived(eq.subclassSockets ?? null);

    // Classify each socket in the subclass sockets object for display
    function socketTypeColor(socket) {
        const type = classifySubclassSocket(socket?.itemTypeDisplayName ?? '');
        return SOCKET_COLORS[type] ?? SOCKET_COLORS.other;
    }

    // Build ordered ability list: super, movement, class, melee, grenade
    const abilityList = $derived((() => {
        if (!subclassSockets) return [];
        const s = subclassSockets;
        return [
            s.super        ? { ...s.super,   _type: 'super'    } : null,
            ...(s.abilities ?? []).map(a => {
                const t = classifySubclassSocket(a.itemTypeDisplayName ?? '');
                return { ...a, _type: t };
            }),
        ].filter(Boolean);
    })());

    // Fragment stat bonuses (investment stats — usually negative)
    function fragmentBonuses(fragment) {
        return (fragment.statBonuses ?? [])
            .filter(b => b.value !== 0)
            .map(b => formatBonus(b))
            .filter(Boolean);
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
                                        {@render PerkIcon(perks.intrinsic, 'ring-yellow-600/60', 'text-yellow-300')}
                                    {/if}
                                    {#each perks.main.slice(0, 4) as perk}
                                        {@render PerkIcon(perk)}
                                    {/each}
                                    {#if perks.mw}
                                        {@render PerkIcon(perks.mw, 'ring-amber-400/60', 'text-amber-300', 'MW: ')}
                                    {/if}
                                    {#if perks.mod}
                                        {@render PerkIcon(perks.mod, 'ring-blue-400/40', 'text-blue-300')}
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
                {@const abilityData = STAT_ABILITY_DATA[stat.hash]}
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

                    <!-- Rich stat tooltip -->
                    <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-50 hidden group-hover:block
                                w-64 bg-[#0d0f1a] border border-white/10 rounded-xl p-3
                                shadow-2xl pointer-events-none">
                        <div class="flex items-center justify-between mb-2">
                            <p class="text-xs font-bold {stat.text}">{stat.name}</p>
                            <span class="text-[10px] font-bold px-1.5 py-0.5 rounded
                                         {val >= 100 ? 'bg-amber-500/20 text-amber-300' : 'bg-white/5 text-slate-400'}">
                                T{Math.min(20, tier)} · {val}
                            </span>
                        </div>

                        {#if stat.description}
                            <p class="text-[10px] text-slate-400 leading-snug mb-2">{stat.description}</p>
                        {/if}

                        {#if abilityData}
                            <!-- Cooldown / ability table -->
                            <div class="border-t border-white/[0.06] pt-2 space-y-1.5">
                                <p class="text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-1">
                                    {abilityData.label}
                                </p>

                                {#if abilityData.format === 'time' && abilityData.table}
                                    <!-- Simple cooldown table: show T-2 to T+2 around current tier, always show T10 -->
                                    {@const rows = abilityData.table}
                                    <div class="grid grid-cols-4 gap-x-2 gap-y-0.5">
                                        <span class="text-[8px] text-slate-600 font-semibold">Tier</span>
                                        <span class="text-[8px] text-slate-600 font-semibold col-span-3">Cooldown</span>
                                        {#each rows as row}
                                            <span class="text-[9px] font-bold
                                                         {row.tier === Math.min(10, tier) ? stat.text : 'text-slate-600'}">
                                                T{row.tier}{row.tier === Math.min(10, tier) ? ' ◀' : ''}
                                            </span>
                                            <span class="text-[9px] col-span-3
                                                         {row.tier === Math.min(10, tier) ? 'text-white font-bold' : 'text-slate-600'}">
                                                {fmtCooldown(row.seconds)}
                                            </span>
                                        {/each}
                                    </div>

                                {:else if abilityData.format === 'pct_dr' && abilityData.table}
                                    <div class="grid grid-cols-4 gap-x-2 gap-y-0.5">
                                        <span class="text-[8px] text-slate-600 font-semibold">Tier</span>
                                        <span class="text-[8px] text-slate-600 font-semibold col-span-3">DR (PvE)</span>
                                        {#each abilityData.table as row}
                                            <span class="text-[9px] font-bold
                                                         {row.tier === Math.min(10, tier) ? stat.text : 'text-slate-600'}">
                                                T{row.tier}{row.tier === Math.min(10, tier) ? ' ◀' : ''}
                                            </span>
                                            <span class="text-[9px] col-span-3
                                                         {row.tier === Math.min(10, tier) ? 'text-white font-bold' : 'text-slate-600'}">
                                                {row.tier === 0 ? 'No bonus' : `+${row.pct.toFixed(2)}% DR`}
                                            </span>
                                        {/each}
                                    </div>
                                    {#if abilityData.barricade}
                                        <p class="text-[8px] text-slate-600 mt-1.5 pt-1.5 border-t border-white/[0.04]">
                                            Titan Barricade at T{Math.min(10,tier)}: {fmtCooldown(getTierRow(abilityData.barricade, Math.min(10,tier)).seconds)}
                                        </p>
                                    {/if}

                                {:else if abilityData.format === 'pct_faster' && abilityData.table}
                                    <div class="grid grid-cols-4 gap-x-2 gap-y-0.5">
                                        <span class="text-[8px] text-slate-600 font-semibold">Tier</span>
                                        <span class="text-[8px] text-slate-600 font-semibold col-span-3">Bonus</span>
                                        {#each abilityData.table as row}
                                            <span class="text-[9px] font-bold
                                                         {row.tier === Math.min(10, tier) ? stat.text : 'text-slate-600'}">
                                                T{row.tier}{row.tier === Math.min(10, tier) ? ' ◀' : ''}
                                            </span>
                                            <span class="text-[9px] col-span-3
                                                         {row.tier === Math.min(10, tier) ? 'text-white font-bold' : 'text-slate-600'}">
                                                {row.pct === 0 ? 'No bonus' : `${row.pct}% faster charge`}
                                            </span>
                                        {/each}
                                    </div>

                                {:else if abilityData.format === 'class_ability' && abilityData.rift}
                                    <p class="text-[8px] text-slate-500 mb-1">Warlock Rift at T{Math.min(10,tier)}: <span class="text-white font-bold">{fmtCooldown(getTierRow(abilityData.rift, Math.min(10,tier)).seconds)}</span></p>
                                    <p class="text-[8px] text-slate-600">Hunter dodge / Titan barricade governed by Weapons / Health stat.</p>
                                {/if}

                                {#if abilityData.note}
                                    <p class="text-[8px] text-slate-600 italic mt-1 leading-snug border-t border-white/[0.04] pt-1">{abilityData.note}</p>
                                {/if}
                            </div>
                        {/if}

                        <div class="mt-2 pt-2 border-t border-white/[0.06]">
                            <p class="text-[8px] text-slate-700">
                                0–100: primary tiers (T0–T10) · 100–200: secondary bonus zone
                            </p>
                        </div>
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

                            <!-- Per-piece stat mini-bars -->
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

                            <!-- Armor mods with rich tooltips -->
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
                                                        w-60 bg-[#0d0f1a] border border-white/10 rounded-xl p-3
                                                        shadow-2xl pointer-events-none">
                                                <p class="text-xs font-bold text-white mb-0.5">{mod.name}</p>
                                                <p class="text-[9px] text-blue-400 mb-1.5">{mod.itemTypeDisplayName}</p>
                                                {#if mod.description}
                                                    <p class="text-[10px] text-slate-300 leading-snug mb-2">{mod.description}</p>
                                                {/if}
                                                <!-- Stat bonuses -->
                                                {#if mod.statBonuses?.length}
                                                    <div class="flex flex-wrap gap-1 pt-2 border-t border-white/[0.06]">
                                                        <span class="text-[8px] text-slate-600 w-full uppercase tracking-wider mb-0.5">Stat Bonuses</span>
                                                        {#each mod.statBonuses as bonus}
                                                            {@const fmt = formatBonus(bonus)}
                                                            {#if fmt}
                                                                <span class="text-[9px] font-bold {fmt.color} bg-white/[0.05] rounded px-1.5 py-0.5">
                                                                    {fmt.value} {fmt.fullName}
                                                                </span>
                                                            {/if}
                                                        {/each}
                                                    </div>
                                                {/if}
                                                {#if mod.conditionalBonuses?.length}
                                                    <div class="flex flex-wrap gap-1 pt-1.5 mt-1 border-t border-white/[0.04]">
                                                        <span class="text-[8px] text-slate-600 w-full uppercase tracking-wider mb-0.5">Conditional</span>
                                                        {#each mod.conditionalBonuses as bonus}
                                                            {@const fmt = formatBonus(bonus)}
                                                            {#if fmt}
                                                                <span class="text-[9px] {fmt.color} opacity-60 italic">
                                                                    {fmt.value} {fmt.fullName}
                                                                </span>
                                                            {/if}
                                                        {/each}
                                                    </div>
                                                {/if}
                                                {#if !mod.isEnabled}
                                                    <p class="text-[9px] text-red-400 mt-1.5 pt-1.5 border-t border-white/[0.06]">
                                                        ⚠ Not active (requirements unmet)
                                                    </p>
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

    <!-- ═══ SUBCLASS ABILITIES, ASPECTS & FRAGMENTS ═══════════════════════════ -->
    {#if subclassSockets && (abilityList.length || subclassSockets.aspects?.length || subclassSockets.fragments?.length)}
        <div class="border-t border-white/[0.06] p-4">
            <p class="text-[10px] text-slate-600 uppercase tracking-widest mb-4 font-semibold">
                Subclass Build
            </p>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">

                <!-- Abilities column -->
                {#if abilityList.length}
                    <div>
                        <p class="text-[9px] text-slate-700 uppercase tracking-widest mb-2">Abilities</p>
                        <div class="space-y-1.5">
                            {#each abilityList as ability}
                                {@const colors = socketTypeColor(ability)}
                                <div class="group/a relative flex items-start gap-2
                                            {colors.bg} rounded-lg px-2.5 py-2 ring-1 {colors.ring}">
                                    {#if ability.icon}
                                        <img src={ability.icon} alt={ability.name}
                                             class="w-8 h-8 rounded shrink-0 object-cover mt-0.5" />
                                    {/if}
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center gap-1.5">
                                            <p class="text-[11px] font-semibold {colors.text} truncate leading-tight">
                                                {ability.name}
                                            </p>
                                        </div>
                                        <p class="text-[9px] text-slate-600 capitalize">{ability._type}</p>
                                        {#if ability.description}
                                            <p class="text-[9px] text-slate-400 mt-0.5 leading-snug line-clamp-2">
                                                {ability.description}
                                            </p>
                                        {/if}
                                    </div>
                                    <!-- Full description tooltip -->
                                    {#if ability.description}
                                        <div class="absolute bottom-full left-0 mb-2 z-50 hidden group-hover/a:block
                                                    w-72 bg-[#0d0f1a] border border-white/10 rounded-xl p-3
                                                    shadow-2xl pointer-events-none">
                                            <div class="flex items-center gap-2 mb-2">
                                                {#if ability.icon}
                                                    <img src={ability.icon} alt="" class="w-8 h-8 rounded object-cover" />
                                                {/if}
                                                <div>
                                                    <p class="text-xs font-bold {colors.text}">{ability.name}</p>
                                                    <p class="text-[9px] text-slate-600 capitalize">{ability.itemTypeDisplayName}</p>
                                                </div>
                                            </div>
                                            <p class="text-[10px] text-slate-300 leading-snug">{ability.description}</p>
                                            {#if ability.flavorText}
                                                <p class="text-[9px] text-slate-600 italic mt-2 leading-snug">{ability.flavorText}</p>
                                            {/if}
                                        </div>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}

                <!-- Aspects column -->
                {#if subclassSockets.aspects?.length}
                    <div>
                        <p class="text-[9px] text-slate-700 uppercase tracking-widest mb-2">Aspects</p>
                        <div class="space-y-2">
                            {#each subclassSockets.aspects as aspect}
                                {@const colors = SOCKET_COLORS.aspect}
                                <div class="group/asp relative {colors.bg} rounded-lg px-2.5 py-2.5 ring-1 {colors.ring}">
                                    <div class="flex items-start gap-2">
                                        {#if aspect.icon}
                                            <img src={aspect.icon} alt={aspect.name}
                                                 class="w-8 h-8 rounded shrink-0 object-cover mt-0.5" />
                                        {/if}
                                        <div class="flex-1 min-w-0">
                                            <p class="text-[11px] font-semibold {colors.text} leading-tight">{aspect.name}</p>
                                            <p class="text-[9px] text-slate-500 mt-0.5 leading-snug line-clamp-3">
                                                {aspect.description}
                                            </p>
                                        </div>
                                    </div>
                                    <!-- Full tooltip -->
                                    <div class="absolute bottom-full left-0 mb-2 z-50 hidden group-hover/asp:block
                                                w-80 bg-[#0d0f1a] border border-white/10 rounded-xl p-3
                                                shadow-2xl pointer-events-none">
                                        <div class="flex items-center gap-2 mb-2">
                                            {#if aspect.icon}
                                                <img src={aspect.icon} alt="" class="w-9 h-9 rounded object-cover" />
                                            {/if}
                                            <div>
                                                <p class="text-xs font-bold {colors.text}">{aspect.name}</p>
                                                <p class="text-[9px] text-slate-500">Aspect · {aspect.itemTypeDisplayName}</p>
                                            </div>
                                        </div>
                                        <p class="text-[10px] text-slate-300 leading-relaxed">{aspect.description}</p>
                                        {#if aspect.flavorText}
                                            <p class="text-[9px] text-slate-600 italic mt-2 leading-snug">{aspect.flavorText}</p>
                                        {/if}
                                        {#if aspect.statBonuses?.length}
                                            <div class="mt-2 pt-2 border-t border-white/[0.06] flex flex-wrap gap-1">
                                                {#each aspect.statBonuses as bonus}
                                                    {@const fmt = formatBonus(bonus)}
                                                    {#if fmt}
                                                        <span class="text-[9px] font-bold {fmt.color} bg-white/[0.05] rounded px-1.5 py-0.5">
                                                            {fmt.value} {fmt.fullName}
                                                        </span>
                                                    {/if}
                                                {/each}
                                            </div>
                                        {/if}
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}

                <!-- Fragments column -->
                {#if subclassSockets.fragments?.length}
                    <div>
                        <p class="text-[9px] text-slate-700 uppercase tracking-widest mb-2">Fragments</p>
                        <div class="space-y-1.5">
                            {#each subclassSockets.fragments as fragment}
                                {@const colors = SOCKET_COLORS.fragment}
                                {@const bonuses = fragmentBonuses(fragment)}
                                <div class="group/frag relative flex items-start gap-2
                                            {colors.bg} rounded-lg px-2.5 py-2 ring-1 {colors.ring}">
                                    {#if fragment.icon}
                                        <img src={fragment.icon} alt={fragment.name}
                                             class="w-7 h-7 rounded shrink-0 object-cover mt-0.5" />
                                    {/if}
                                    <div class="flex-1 min-w-0">
                                        <p class="text-[10px] font-semibold {colors.text} leading-tight">{fragment.name}</p>
                                        <!-- Stat bonuses inline (fragments often have -10 penalties) -->
                                        {#if bonuses.length}
                                            <div class="flex flex-wrap gap-0.5 mt-0.5">
                                                {#each bonuses as b}
                                                    <span class="text-[8px] font-bold {b.color}">{b.value} {b.label}</span>
                                                {/each}
                                            </div>
                                        {/if}
                                        {#if fragment.description}
                                            <p class="text-[9px] text-slate-500 mt-0.5 leading-snug line-clamp-2">
                                                {fragment.description}
                                            </p>
                                        {/if}
                                    </div>
                                    <!-- Full tooltip -->
                                    <div class="absolute bottom-full left-0 mb-2 z-50 hidden group-hover/frag:block
                                                w-72 bg-[#0d0f1a] border border-white/10 rounded-xl p-3
                                                shadow-2xl pointer-events-none">
                                        <div class="flex items-center gap-2 mb-2">
                                            {#if fragment.icon}
                                                <img src={fragment.icon} alt="" class="w-8 h-8 rounded object-cover" />
                                            {/if}
                                            <div>
                                                <p class="text-xs font-bold {colors.text}">{fragment.name}</p>
                                                <p class="text-[9px] text-slate-500">Fragment</p>
                                            </div>
                                        </div>
                                        {#if fragment.description}
                                            <p class="text-[10px] text-slate-300 leading-relaxed">{fragment.description}</p>
                                        {/if}
                                        {#if fragment.flavorText}
                                            <p class="text-[9px] text-slate-600 italic mt-2 leading-snug">{fragment.flavorText}</p>
                                        {/if}
                                        {#if bonuses.length}
                                            <div class="mt-2 pt-2 border-t border-white/[0.06]">
                                                <p class="text-[8px] text-slate-600 uppercase tracking-wider mb-1">Stat Changes</p>
                                                <div class="flex flex-wrap gap-1">
                                                    {#each bonuses as b}
                                                        <span class="text-[9px] font-bold {b.color} bg-white/[0.05] rounded px-1.5 py-0.5">
                                                            {b.value} {b.fullName}
                                                        </span>
                                                    {/each}
                                                </div>
                                            </div>
                                        {/if}
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
</div>

<!-- ── Shared perk icon snippet ──────────────────────────────────────────────── -->
{#snippet PerkIcon(perk, ring = 'ring-white/10', labelClass = 'text-white', prefix = '')}
    <div class="group/p relative">
        {#if perk.icon}
            <img src={perk.icon} alt={perk.name}
                 class="w-6 h-6 object-cover rounded ring-1 {ring}
                        {perk.isEnabled === false ? 'opacity-30' : 'opacity-90'}" />
        {:else}
            <!-- Fallback: name initial if no icon -->
            <div class="w-6 h-6 rounded ring-1 {ring} bg-white/5 flex items-center justify-center">
                <span class="text-[8px] font-bold text-slate-400">{(perk.name ?? '?')[0]}</span>
            </div>
        {/if}
        <!-- Rich tooltip -->
        <div class="absolute bottom-full left-0 mb-2 z-50 hidden group-hover/p:block
                    w-72 bg-[#0d0f1a] border border-white/10 rounded-xl p-3
                    shadow-2xl pointer-events-none">
            <div class="flex items-start gap-2 mb-2">
                {#if perk.icon}
                    <img src={perk.icon} alt="" class="w-8 h-8 rounded object-cover shrink-0" />
                {/if}
                <div>
                    <p class="text-xs font-bold {labelClass} leading-tight">{prefix}{perk.name}</p>
                    {#if perk.itemTypeDisplayName}
                        <p class="text-[9px] text-slate-600 mt-0.5">{perk.itemTypeDisplayName}</p>
                    {/if}
                </div>
            </div>
            {#if perk.description}
                <p class="text-[10px] text-slate-300 leading-relaxed">{perk.description}</p>
            {/if}
            {#if perk.flavorText}
                <p class="text-[9px] text-slate-600 italic mt-2 leading-snug border-t border-white/[0.05] pt-2">{perk.flavorText}</p>
            {/if}
            <!-- investmentStat bonuses -->
            {#if perk.statBonuses?.length}
                <div class="mt-2 pt-2 border-t border-white/[0.06]">
                    <p class="text-[8px] text-slate-600 uppercase tracking-wider mb-1">Stat Bonuses</p>
                    <div class="flex flex-wrap gap-1">
                        {#each perk.statBonuses as bonus}
                            {@const fmt = formatBonus(bonus)}
                            {#if fmt}
                                <span class="text-[9px] font-bold {fmt.color} bg-white/[0.05] rounded px-1.5 py-0.5">
                                    {fmt.value} {fmt.fullName}
                                </span>
                            {/if}
                        {/each}
                    </div>
                </div>
            {/if}
            {#if perk.isEnabled === false}
                <p class="text-[9px] text-red-400 mt-2 pt-2 border-t border-white/[0.06]">
                    ⚠ Perk not active (requirements not met)
                </p>
            {/if}
        </div>
    </div>
{/snippet}
