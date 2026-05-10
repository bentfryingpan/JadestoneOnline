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

    // ── Stat name → hash lookup (for mod stat bonus labels) ───────────────────
    const statHashToName = $derived(
        Object.fromEntries((armorStatMeta ?? []).map(s => [s.hash, s.name]))
    );

    // ── FATE zone: primary-zone caps + computed secondary-zone bonuses ───────────
    // All secondary benefits scale linearly 101→200 (bonus = stat − 100, max 100).
    const FATE_PRIMARY = {
        'Weapons':    'T10 (100): Max weapon handling · fastest ready/stow · optimal stability',
        'Health':     'T10 (100): 40% damage reduction in PvE · fastest shield regen',
        'Class':      'T10 (100): Fastest class ability cooldown',
        'Grenade':    'T10 (100): ~32 s grenade cooldown',
        'Super':      'T10 (100): Fastest passive Super regen',
        'Melee':      'T10 (100): ~32 s melee ability cooldown',
        // Legacy names (Edge of Fate renames these stats)
        'Mobility':   'T10 (100): Max weapon handling · fastest ready/stow · optimal stability',
        'Resilience': 'T10 (100): 40% damage reduction in PvE',
        'Recovery':   'T10 (100): Fastest class ability cooldown',
        'Discipline': 'T10 (100): ~32 s grenade cooldown',
        'Intellect':  'T10 (100): Fastest passive Super regen',
        'Strength':   'T10 (100): ~32 s melee cooldown',
    };

    // Returns an array of { label, value } lines computed from points-above-100.
    // Scaling sourced from Edge of Fate datamining; linear between 101–200.
    function calcFateBonuses(statName, bonus) {
        const b = Math.min(Math.max(bonus, 0), 100); // clamp 0–100
        const pct = (max, dp = 1) => ((b / 100) * max).toFixed(dp) + '%';
        const hp  = (max)         => ((b / 100) * max).toFixed(1) + ' HP';
        switch (statName) {
            // Weapons / Mobility
            case 'Weapons': case 'Mobility':
                return [
                    { label: 'Primary/Special vs bosses (PvE)', value: '+' + pct(15, 1) },
                    { label: 'Heavy vs bosses (PvE)',            value: '+' + pct(10, 1) },
                    { label: 'Guardian damage (PvP)',            value: '+' + pct(6,  1) },
                    { label: 'Double ammo pickup (at 200)',      value: pct(100, 0)       },
                ];
            // Health / Resilience
            case 'Health': case 'Resilience':
                return [
                    { label: 'Extra shield HP (PvE)',     value: hp(20)       },
                    { label: 'Shield recharge speed',     value: '+' + pct(50, 0) },
                ];
            // Class / Recovery
            case 'Class': case 'Recovery':
                return [
                    { label: 'Overshield on class ability', value: hp(40) },
                ];
            // Grenade / Discipline
            case 'Grenade': case 'Discipline':
                return [
                    { label: 'Grenade damage (PvE)', value: '+' + pct(65, 1) },
                    { label: 'Grenade damage (PvP)', value: '+' + pct(20, 1) },
                ];
            // Super / Intellect
            case 'Super': case 'Intellect':
                return [
                    { label: 'Super damage (PvE)',   value: '+' + pct(45, 1) },
                    { label: 'Super damage (PvP)',   value: '+' + pct(15, 1) },
                ];
            // Melee / Strength
            case 'Melee': case 'Strength':
                return [
                    { label: 'Melee damage (PvE)',   value: '+' + pct(30, 1) },
                    { label: 'Melee damage (PvP)',   value: '+' + pct(20, 1) },
                ];
            default:
                return [];
        }
    }

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
<!-- Tier diamond colors: exotic=amber, legendary=violet, rare=blue, uncommon=green -->
{#snippet TierDiamond(tierType)}
    {@const c =
        tierType === 6 ? 'border-amber-400  bg-amber-400/20  shadow-[0_0_6px_rgba(251,191,36,0.5)]'  :
        tierType === 5 ? 'border-violet-400 bg-violet-400/20 shadow-[0_0_6px_rgba(167,139,250,0.4)]' :
        tierType === 4 ? 'border-blue-400   bg-blue-400/20'   :
        tierType === 3 ? 'border-green-400  bg-green-400/20'  :
                         'border-zinc-600   bg-zinc-800'}
    <div class="w-3 h-3 rotate-45 border {c} transition-all duration-300"></div>
{/snippet}

{#snippet GearSlot(key, label)}
    {@const item     = eq[key]}
    {@const exotic   = item?.tierType === 6}
    {@const mw       = item?.masterwork ?? false}
    {@const isActive = selectedSlot === key}
    {@const tierCount = item?.tierType ?? 0}
    {@const tierColor =
        item?.tierType === 6 ? 'bg-amber-400' :
        item?.tierType === 5 ? 'bg-violet-400' :
        item?.tierType === 4 ? 'bg-blue-400' :
        item?.tierType === 3 ? 'bg-green-400' : 'bg-zinc-400'}
    <button onclick={() => selectSlot(key)}
            class="group flex flex-col items-center gap-1 w-full text-left transition-all">
        <div class="w-14 h-14 bg-[#0c0c0c] relative mx-auto overflow-hidden
                    shadow-[inset_0_0_15px_rgba(0,0,0,0.5)] transition-all duration-300
                    border
                    {isActive
                        ? 'border-emerald-500/70 shadow-[0_0_14px_rgba(52,211,153,0.2)]'
                        : mw && !exotic
                            ? 'border-yellow-400/60 shadow-[0_0_12px_rgba(234,179,8,0.22)] group-hover:border-yellow-300'
                            : exotic
                                ? 'border-amber-500/40 group-hover:border-amber-500/70'
                                : 'border-zinc-800 group-hover:border-zinc-600'}">
            <!-- Top rarity bar -->
            <div class="absolute top-0 left-0 w-full h-[2px] z-10
                        {mw && !exotic
                            ? 'bg-gradient-to-r from-yellow-600 via-yellow-200 to-yellow-600'
                            : exotic ? 'bg-amber-400' : 'bg-zinc-100 opacity-20'}"></div>
            <!-- Item icon -->
            {#if item?.icon}
                <img src={item.icon} alt="" class="w-full h-full object-cover" />
                <!-- Seasonal / DLC watermark overlay (same size as icon) -->
                {#if item?.iconWatermark}
                    <img src={item.iconWatermark} alt=""
                         class="absolute inset-0 w-full h-full object-cover pointer-events-none z-10"/>
                {/if}
            {:else}
                <div class="w-full h-full flex items-center justify-center opacity-10">
                    <div class="w-6 h-6 border border-zinc-500 rotate-45"></div>
                </div>
            {/if}
            <!-- Tier diamonds — vertical strip overlaid on right edge -->
            {#if item && tierCount > 0}
                <div class="absolute right-0 top-0 bottom-0 flex flex-col items-center justify-center gap-[3px] px-[3px] z-10
                            bg-gradient-to-l from-black/70 to-transparent">
                    {#if item.tierType === 6}
                        <!-- Exotic: single large glowing amber diamond -->
                        <div class="w-[7px] h-[7px] rotate-45 shrink-0 bg-amber-400
                                    shadow-[0_0_6px_rgba(251,191,36,0.9)]"></div>
                    {:else}
                        {#each {length: Math.min(tierCount, 5)} as _}
                            <div class="w-[5px] h-[5px] rotate-45 shrink-0 {tierColor}"></div>
                        {/each}
                    {/if}
                </div>
            {/if}
            <!-- Selected outline -->
            {#if isActive}
                <div class="absolute inset-0 border border-emerald-500/30 pointer-events-none"></div>
            {/if}
        </div>
        <div class="text-center w-full mt-1">
            <p class="text-[9px] text-zinc-600 font-medium leading-none uppercase tracking-wider">{label}</p>
            <p class="text-[10px] font-semibold truncate px-1 transition-colors mt-0.5
                      {isActive ? 'text-emerald-400' : 'text-zinc-200 group-hover:text-white'}">
                {item?.name ?? '—'}
            </p>
        </div>
    </button>
{/snippet}

<!-- ── Perk snippets ─────────────────────────────────────────────────────────── -->
{#snippet PerkRow(perk)}
    <div class="flex items-start gap-2.5 py-2 border-b border-zinc-800/40 last:border-0 group/perk">
        <div class="shrink-0 w-8 h-8 border relative overflow-hidden
                    {perk.isIntrinsic ? 'border-amber-500/40 bg-amber-500/5' :
                     perk.isMasterwork ? 'border-yellow-400/30 bg-yellow-500/5' :
                     'border-zinc-800 group-hover/perk:border-zinc-600'}">
            {#if perk.icon}<img src={perk.icon} alt="" class="w-full h-full object-cover"/>
            {:else}<div class="w-full h-full flex items-center justify-center opacity-20"><div class="w-3 h-3 border border-zinc-500 rotate-45"></div></div>{/if}
            {#if !perk.isEnabled}<div class="absolute inset-0 bg-black/60"></div>{/if}
        </div>
        <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 mb-0.5">
                <span class="text-[9px] font-mono font-bold uppercase tracking-wide
                             {perk.isIntrinsic ? 'text-amber-400' : perk.isMasterwork ? 'text-yellow-400' : 'text-zinc-200'}">
                    {perk.name}
                </span>
            </div>
            {#if perk.description}
                <p class="text-[8px] font-sans text-zinc-500 leading-relaxed line-clamp-2">{perk.description}</p>
            {/if}
        </div>
    </div>
{/snippet}

{#snippet PerkIcon(perk)}
    <div class="group/perk flex items-center gap-2 p-1.5 border border-zinc-800/60
                hover:border-zinc-700 transition-colors cursor-default relative">
        <div class="shrink-0 w-7 h-7 border border-zinc-800 overflow-hidden relative">
            {#if perk.icon}<img src={perk.icon} alt="" class="w-full h-full object-cover"/>
            {:else}<div class="w-full h-full flex items-center justify-center opacity-10"><div class="w-3 h-3 border border-zinc-600 rotate-45"></div></div>{/if}
            {#if !perk.isEnabled}<div class="absolute inset-0 bg-black/50"></div>{/if}
        </div>
        <span class="text-[8px] font-mono text-zinc-400 truncate flex-1 leading-tight">{perk.name}</span>
        <!-- Mini tooltip -->
        {#if perk.description}
            <div class="absolute bottom-full left-0 mb-1 z-50 opacity-0 group-hover/perk:opacity-100
                        translate-y-1 group-hover/perk:translate-y-0 transition-all duration-150
                        pointer-events-none w-48">
                <div class="bg-[#141414] border border-zinc-700 p-2 shadow-[0_0_16px_rgba(0,0,0,0.8)]">
                    <p class="text-[8px] font-mono font-bold text-zinc-200 mb-1">{perk.name}</p>
                    <p class="text-[7px] font-sans text-zinc-500 leading-relaxed">{perk.description}</p>
                </div>
            </div>
        {/if}
    </div>
{/snippet}

{#snippet TraitCard(perk)}
    <div class="group/trait relative border transition-all duration-200 cursor-default
                {perk.isEnhanced
                    ? 'border-yellow-500/40 bg-yellow-500/5 hover:border-yellow-400/70 hover:shadow-[0_0_12px_rgba(234,179,8,0.2)]'
                    : 'border-zinc-800 hover:border-zinc-600'}
                {!perk.isEnabled ? 'opacity-50' : ''}">
        <!-- Enhanced indicator bar -->
        {#if perk.isEnhanced}
            <div class="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-yellow-500/60 via-yellow-300/40 to-transparent"></div>
        {/if}
        <div class="flex items-start gap-2 p-2">
            <div class="shrink-0 w-8 h-8 relative overflow-hidden">
                {#if perk.icon}
                    <img src={perk.icon} alt="" class="w-full h-full object-cover"/>
                    {#if perk.isEnhanced}
                        <!-- Gold overlay shimmer for enhanced -->
                        <div class="absolute inset-0 pointer-events-none"
                             style="background:radial-gradient(ellipse at top left,rgba(234,179,8,0.25) 0%,transparent 70%)"></div>
                    {/if}
                {/if}
                {#if !perk.isEnabled}<div class="absolute inset-0 bg-black/60"></div>{/if}
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1 mb-0.5">
                    <span class="text-[9px] font-mono font-bold uppercase tracking-wide leading-tight
                                 {perk.isEnhanced ? 'text-yellow-300' : 'text-zinc-200'}">
                        {perk.name}
                    </span>
                    {#if perk.isEnhanced}
                        <span class="text-[6px] font-mono font-bold text-yellow-500 border border-yellow-500/30 px-1 leading-none py-px shrink-0">ENH</span>
                    {/if}
                </div>
                <p class="text-[7px] font-sans text-zinc-600 leading-relaxed line-clamp-3">{perk.description ?? ''}</p>
            </div>
        </div>
        <!-- Stat bonus chips -->
        {#if perk.statBonuses?.length}
            <div class="flex flex-wrap gap-1 px-2 pb-1.5">
                {#each perk.statBonuses as sb}
                    <span class="text-[6px] font-mono text-emerald-500 border border-emerald-500/20 px-1 py-px">
                        +{sb.value} {statHashToName[sb.statHash] ?? ''}
                    </span>
                {/each}
            </div>
        {/if}
    </div>
{/snippet}

<!-- ── Main Layout ─────────────────────────────────────────────────────────── -->
<div class="max-w-6xl mx-auto py-10 px-4">
    <div class="grid grid-cols-12 gap-6 items-start">

        <!-- ── COL 1: SUBCLASS + WEAPONS ──────────────────────────────────── -->
        <div class="col-span-2 space-y-8 flex flex-col items-center">

            <!-- Subclass slot -->
            <button onclick={() => selectSlot('subclass')}
                    class="flex flex-col items-center group cursor-pointer w-full text-left">
                <div class="w-16 h-16 flex items-center justify-center mx-auto relative">
                    <!-- Ambient glow -->
                    <div class="absolute inset-0 rounded-full blur-3xl animate-pulse"
                         style="background:{subclassColor}"></div>
                    <!-- Diamond frame -->
                    {#if eq.subclass?.icon}
                        <div class="w-14 h-14 bg-[#0a0a0a] border-2 flex items-center justify-center
                                    rotate-45 transition-all duration-500 shadow-2xl overflow-hidden
                                    {selectedSlot === 'subclass'
                                        ? 'border-emerald-500/80 shadow-[0_0_20px_rgba(52,211,153,0.25)] rotate-90'
                                        : subclassEl.border + ' ' + subclassEl.glow + ' group-hover:rotate-90'}">
                            <img src={eq.subclass.icon} alt=""
                                 class="w-10 h-10 object-cover scale-110 transition-all duration-500
                                        {selectedSlot === 'subclass' ? '-rotate-90' : '-rotate-45 group-hover:-rotate-90'}" />
                        </div>
                    {:else}
                        <div class="w-14 h-14 bg-[#0a0a0a] border-2 border-zinc-800 flex items-center
                                    justify-center rotate-45 group-hover:rotate-90 transition-all duration-700 shadow-2xl
                                    {selectedSlot === 'subclass' ? 'border-emerald-500/60' : ''}">
                            <div class="w-7 h-7 border border-emerald-400/60 flex items-center justify-center">
                                <div class="w-1.5 h-1.5 bg-emerald-500"></div>
                            </div>
                        </div>
                    {/if}
                </div>
                <div class="mt-4 text-center w-full">
                    <span class="text-[9px] text-zinc-600 font-medium block mb-0.5">Subclass</span>
                    <p class="text-[10px] font-semibold truncate transition-colors
                              {selectedSlot === 'subclass' ? 'text-emerald-400' : subclassEl.text}">
                        {eq.subclass?.name ?? '—'}
                    </p>
                </div>
            </button>

            <!-- Weapons -->
            <div class="space-y-6 w-full flex flex-col items-center pt-6 border-t border-zinc-800/40">
                {@render GearSlot('kinetic', 'KINETIC')}
                {@render GearSlot('energy',  'ENERGY')}
                {@render GearSlot('power',   'POWER')}
            </div>
        </div>

        <!-- ── COL 2: CENTER — DECORATIVE / INSPECTION ────────────────────── -->
        <div class="col-span-8 relative flex items-center justify-center min-h-[520px]">

            {#if selectedSlot && selectedItem}
                {@const hdrTierCount = selectedItem.tierType === 6
                    ? 1
                    : Math.max(0, (selectedItem.tierType ?? 1) - 1)}
                {@const hdrTierColor =
                    selectedItem.tierType === 6 ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]' :
                    selectedItem.tierType === 5 ? 'bg-violet-500' :
                    selectedItem.tierType === 4 ? 'bg-blue-400' :
                    selectedItem.tierType === 3 ? 'bg-green-400' : 'bg-zinc-400'}
                <!-- ── INSPECTION PANEL ──────────────────────────────────── -->
                <div class="w-full h-[580px] flex flex-col bg-[#0a0a0a] border border-zinc-800 relative overflow-hidden">
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

                    <!-- ── Item header: full-width screenshot banner ── -->
                    <div class="relative shrink-0 h-36 overflow-hidden">
                        <!-- Screenshot background -->
                        {#if selectedItem.screenshot}
                            <img src={selectedItem.screenshot} alt=""
                                 class="absolute inset-0 w-full h-full object-cover object-center"
                                 style="filter:brightness(0.55) saturate(0.85)"/>
                        {:else if selectedItem.masterwork && selectedType === 'weapon'}
                            <div class="absolute inset-0"
                                 style="background:linear-gradient(135deg,rgb(81,48,101),rgb(50,28,65))"></div>
                        {:else}
                            <div class="absolute inset-0 bg-zinc-950"></div>
                        {/if}
                        <!-- Left-side gradient so text stays readable -->
                        <div class="absolute inset-0 bg-gradient-to-r from-black/95 via-black/60 to-transparent"></div>
                        <!-- Bottom tier-colored rule -->
                        <div class="absolute bottom-0 left-0 w-full h-[2px]
                                    {selectedItem.tierType === 6 ? 'bg-amber-400/70' :
                                     selectedItem.masterwork && selectedType === 'weapon' ? 'bg-yellow-400/60' :
                                     selectedItem.tierType === 5 ? 'bg-violet-500/50' :
                                     selectedItem.tierType === 4 ? 'bg-blue-400/40' : 'bg-zinc-700/60'}"></div>

                        <!-- Content -->
                        <div class="relative flex items-center gap-4 px-5 h-full">
                            <!-- Icon + watermark + tier diamonds -->
                            <div class="shrink-0 flex items-center gap-3">
                                <div class="relative w-[72px] h-[72px] border shadow-lg
                                            {selectedItem.tierType === 6 ? 'border-amber-500/70' :
                                             selectedItem.masterwork && selectedType === 'weapon' ? 'border-yellow-400/60' :
                                             selectedItem.tierType === 5 ? 'border-violet-500/50' : 'border-zinc-600/80'}">
                                    {#if selectedItem.icon}
                                        <img src={selectedItem.icon} alt="" class="w-full h-full object-cover"/>
                                        <!-- DLC / seasonal watermark overlaid on icon -->
                                        {#if selectedItem.iconWatermark}
                                            <img src={selectedItem.iconWatermark} alt=""
                                                 class="absolute inset-0 w-full h-full object-cover pointer-events-none"/>
                                        {/if}
                                    {/if}
                                </div>
                                <!-- Vertical tier diamonds — in-game style -->
                                {#if hdrTierCount > 0}
                                    <div class="flex flex-col gap-[4px] items-center">
                                        {#if selectedItem.tierType === 6}
                                            <!-- Exotic: single prominent diamond -->
                                            <div class="w-3.5 h-3.5 rotate-45 shrink-0 {hdrTierColor}"></div>
                                        {:else}
                                            {#each {length: hdrTierCount} as _}
                                                <div class="w-2.5 h-2.5 rotate-45 shrink-0 {hdrTierColor}"></div>
                                            {/each}
                                        {/if}
                                    </div>
                                {/if}
                            </div>

                            <!-- Text -->
                            <div class="min-w-0 flex-1">
                                <span class="text-xs font-medium
                                             {selectedItem.tierType === 6 ? 'text-amber-400' :
                                              selectedItem.masterwork && selectedType === 'weapon' ? 'text-yellow-300' :
                                              selectedItem.tierType === 5 ? 'text-violet-400' : 'text-zinc-400'}">
                                    {selectedItem.tierTypeName ?? TIER_LABEL[selectedItem.tierType] ?? '—'}
                                    {#if selectedItem.itemTypeDisplayName}
                                        <span class="text-zinc-500"> · {selectedItem.itemTypeDisplayName}</span>
                                    {/if}
                                </span>
                                <p class="text-[1.6rem] font-bold text-white leading-tight mt-0.5 truncate drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
                                    {selectedItem.name}
                                </p>
                                {#if selectedType === 'weapon'}
                                    <div class="flex items-center gap-3 mt-1.5">
                                        {#if selectedItem.damageType}
                                            <div class="flex items-center gap-1.5">
                                                {#if selectedItem.damageTypeIcon}
                                                    <img src={selectedItem.damageTypeIcon} alt=""
                                                         class="w-4 h-4 object-contain drop-shadow"/>
                                                {/if}
                                                <span class="text-sm font-semibold
                                                             {damageColor[selectedItem.damageType] ?? 'text-zinc-300'}">
                                                    {selectedItem.damageTypeName ?? damageLabel[selectedItem.damageType] ?? ''}
                                                </span>
                                            </div>
                                        {/if}
                                        {#if selectedItem.power}
                                            <span class="text-sm font-semibold text-zinc-200">
                                                {selectedItem.power}
                                                <span class="text-zinc-500 font-normal"> PL</span>
                                            </span>
                                        {/if}
                                    </div>
                                {/if}
                                {#if selectedType === 'armor' && selectedItem.flavorText}
                                    <p class="text-xs text-zinc-400 mt-1 line-clamp-1 italic drop-shadow">
                                        {selectedItem.flavorText}
                                    </p>
                                {/if}
                                {#if selectedType === 'subclass'}
                                    <span class="text-sm font-semibold {subclassEl.text}">
                                        {classNames[char?.classType] ?? 'Guardian'} · Subclass
                                    </span>
                                {/if}
                            </div>
                        </div>
                    </div>

                    <!-- Scrollable content -->
                    <div class="flex-1 overflow-y-auto scrollbar-hide p-5 space-y-1">

                        <!-- ── WEAPON INSPECT (DIM-style layout) ─────────── -->
                        {#if selectedType === 'weapon'}
                            {@const perks     = selectedItem.perks ?? []}
                            {@const intrinsic = perks.find(p => p.isIntrinsic)}
                            {@const traits    = perks.filter(p => !p.isIntrinsic && !p.isMasterwork && p.itemTypeDisplayName?.toLowerCase().includes('trait'))}
                            {@const other     = perks.filter(p => !p.isIntrinsic && !p.isMasterwork && !p.itemTypeDisplayName?.toLowerCase().includes('trait'))}
                            {@const mwPerk    = perks.find(p => p.isMasterwork)}

                            <!-- Aggregate enabled perk stat bonuses per hash -->
                            {@const perkBonus = (() => {
                                const m = {};
                                for (const p of perks) {
                                    if (!p.isEnabled) continue;
                                    for (const sb of p.statBonuses ?? []) {
                                        m[sb.statHash] = (m[sb.statHash] ?? 0) + sb.value;
                                    }
                                }
                                return m;
                            })()}

                            <!-- ① STATS — DIM grid: label · number · bar -->
                            {#if selectedItem.weaponStats?.length}
                                <div class="mb-4 pb-4 border-b border-zinc-800/60">
                                    {#each selectedItem.weaponStats as s}
                                        {@const bonus    = perkBonus[s.hash] ?? 0}
                                        {@const baseVal  = Math.max(0, s.value - bonus)}
                                        {@const maxVal   = s.maximum || 100}
                                        {@const basePct  = Math.min((baseVal / maxVal) * 100, 100)}
                                        {@const bonusPct = Math.min(Math.max((bonus / maxVal) * 100, 0), 100 - basePct)}
                                        <div class="grid items-center mb-2"
                                             style="grid-template-columns:130px 40px 1fr">
                                            <span class="text-xs font-medium leading-none
                                                         {bonus > 0 ? 'text-amber-400' : 'text-zinc-400'}">
                                                {s.name}
                                            </span>
                                            <span class="text-xs font-bold text-right pr-2 leading-none
                                                         {bonus > 0 ? 'text-amber-400' : 'text-zinc-200'}">
                                                {s.value}
                                            </span>
                                            <div class="h-2.5 bg-zinc-800 flex overflow-hidden rounded-sm">
                                                <div class="h-full bg-zinc-300 shrink-0 transition-all duration-500 rounded-sm"
                                                     style="width:{basePct}%"></div>
                                                {#if bonusPct > 0}
                                                    <div class="h-full bg-amber-400 shrink-0 transition-all duration-500"
                                                         style="width:{bonusPct}%"></div>
                                                {/if}
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            {/if}

                            {#if !perks.length}
                                <p class="text-sm text-zinc-600 text-center py-6">No perk data available.</p>
                            {/if}

                            <!-- ② FRAME / INTRINSIC row -->
                            {#if intrinsic}
                                <div class="flex items-center gap-3 py-2.5 border-b border-zinc-800/50 mb-3">
                                    {#if intrinsic.icon}
                                        <div class="w-10 h-10 shrink-0 border border-amber-500/30 bg-amber-500/5 overflow-hidden rounded-sm">
                                            <img src={intrinsic.icon} alt="" class="w-full h-full object-cover"/>
                                        </div>
                                    {/if}
                                    <div class="min-w-0 flex-1">
                                        <span class="text-sm font-semibold text-amber-400 block leading-tight truncate">
                                            {intrinsic.name}
                                        </span>
                                        {#if intrinsic.description}
                                            <p class="text-xs text-zinc-500 leading-relaxed line-clamp-1 mt-0.5">
                                                {intrinsic.description}
                                            </p>
                                        {/if}
                                    </div>
                                    <span class="text-[10px] font-medium text-amber-700/70 shrink-0 uppercase tracking-wide">Frame</span>
                                </div>
                            {/if}

                            <!-- ③ SOCKETS — clean row of square icons (barrels, mag, grip, origin, MW) -->
                            {#if other.length || mwPerk}
                                {@const allSockets = [...other, ...(mwPerk ? [mwPerk] : [])]}
                                <div class="flex flex-wrap gap-2 py-3 border-b border-zinc-800/50 mb-3">
                                    {#each allSockets as p}
                                        <div class="group/pi relative flex flex-col items-center gap-1">
                                            <div class="w-10 h-10 border relative overflow-hidden cursor-default transition-colors
                                                        {p.isMasterwork
                                                            ? 'border-yellow-500/50 bg-yellow-500/5 hover:border-yellow-400'
                                                            : p.isEnabled
                                                                ? 'border-zinc-700 hover:border-zinc-500 bg-zinc-900/40'
                                                                : 'border-zinc-800/40 opacity-40'}">
                                                <div class="absolute top-0 left-0 w-full h-[2px]
                                                            {p.isMasterwork ? 'bg-yellow-400/70' : 'bg-zinc-600/30'}"></div>
                                                {#if p.icon}
                                                    <img src={p.icon} alt="" class="w-full h-full object-cover"/>
                                                {/if}
                                                {#if !p.isEnabled}
                                                    <div class="absolute inset-0 bg-black/50"></div>
                                                {/if}
                                            </div>
                                            <span class="text-[9px] font-medium text-zinc-600 text-center leading-tight w-10 truncate">{p.name}</span>
                                            <!-- Tooltip -->
                                            <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50
                                                        opacity-0 group-hover/pi:opacity-100 translate-y-1 group-hover/pi:translate-y-0
                                                        transition-all duration-150 pointer-events-none w-52">
                                                <div class="bg-[#141414] border border-zinc-700 px-3 py-2.5 shadow-[0_0_24px_rgba(0,0,0,0.95)]">
                                                    <p class="text-sm font-semibold mb-0.5 {p.isMasterwork ? 'text-yellow-400' : 'text-zinc-100'}">{p.name}</p>
                                                    {#if p.itemTypeDisplayName}
                                                        <p class="text-[10px] font-medium text-zinc-500 mb-1">{p.itemTypeDisplayName}</p>
                                                    {/if}
                                                    {#if p.description}
                                                        <p class="text-xs text-zinc-400 leading-relaxed">{p.description}</p>
                                                    {/if}
                                                    {#if p.statBonuses?.length}
                                                        <div class="flex flex-wrap gap-1 mt-2">
                                                            {#each p.statBonuses as sb}
                                                                <span class="text-xs font-medium text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5">
                                                                    +{sb.value} {statHashToName[sb.statHash] ?? ''}
                                                                </span>
                                                            {/each}
                                                        </div>
                                                    {/if}
                                                </div>
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            {/if}

                            <!-- ④ TRAITS — square icons with name + description -->
                            {#if traits.length}
                                <div>
                                    <span class="text-xs font-medium text-zinc-500 block mb-2">Traits</span>
                                    <div class="grid grid-cols-2 gap-x-4 gap-y-3">
                                        {#each traits as p}
                                            <div class="flex items-start gap-3 {!p.isEnabled ? 'opacity-50' : ''}">
                                                <!-- Square icon -->
                                                <div class="w-11 h-11 shrink-0 border relative overflow-hidden
                                                            {p.isEnhanced ? 'border-yellow-500/60 bg-yellow-500/5' : 'border-zinc-700 bg-zinc-900/40'}">
                                                    {#if p.isEnhanced}
                                                        <div class="absolute top-0 left-0 w-full h-[2px] bg-yellow-400/70"></div>
                                                    {/if}
                                                    {#if p.icon}
                                                        <img src={p.icon} alt="" class="w-full h-full object-cover"/>
                                                    {/if}
                                                </div>
                                                <!-- Name + description -->
                                                <div class="flex-1 min-w-0 pt-0.5">
                                                    <div class="flex items-center gap-1.5 mb-0.5">
                                                        <span class="text-sm font-semibold leading-tight truncate
                                                                     {p.isEnhanced ? 'text-yellow-300' : 'text-zinc-100'}">
                                                            {p.name}
                                                        </span>
                                                        {#if p.isEnhanced}
                                                            <span class="text-[9px] font-bold text-yellow-500 border border-yellow-500/30 px-1 py-px leading-none shrink-0">ENH</span>
                                                        {/if}
                                                    </div>
                                                    <p class="text-xs text-zinc-500 leading-relaxed line-clamp-3">{p.description ?? ''}</p>
                                                </div>
                                            </div>
                                        {/each}
                                    </div>
                                </div>
                            {/if}

                        <!-- ── ARMOR STATS + MODS ──────────────────────────── -->
                        {:else if selectedType === 'armor'}
                            <!-- Per-piece stat bars -->
                            {#if selectedItem.armorStats?.length}
                                <div class="mb-4">
                                    <span class="text-xs font-medium text-zinc-500 block mb-3">
                                        Piece Stats
                                    </span>
                                    {#each selectedItem.armorStats as s}
                                        <div class="flex items-center gap-3 py-1.5">
                                            <span class="text-xs font-medium text-zinc-400 w-20 shrink-0">{s.short ?? s.name}</span>
                                            <div class="flex-1 h-2 bg-zinc-800 rounded-sm relative overflow-hidden">
                                                <div class="h-full {s.color ?? 'bg-zinc-400'} rounded-sm transition-all duration-700"
                                                     style="width:{Math.min((s.value / (s.maximum || 30)) * 100, 100)}%">
                                                </div>
                                            </div>
                                            <span class="text-xs font-bold text-zinc-200 w-6 text-right shrink-0">
                                                {s.value}
                                            </span>
                                        </div>
                                    {/each}
                                </div>
                            {/if}

                            <!-- ── IN-GAME-STYLE MOD SLOTS ──────────────────── -->
                            {#if true}
                                {@const capacity = selectedItem.energyCapacity ?? 10}
                                {@const used     = selectedItem.energyUsed     ?? 0}
                                {@const mods     = selectedItem.mods            ?? []}
                                {@const slots    = selectedItem.modSlotCount    ?? 4}
                                {@const empty    = Math.max(0, slots - mods.length)}
                                <div class="border-t border-zinc-800/60 pt-4">

                                    <!-- Header: label + energy bar -->
                                    <div class="flex items-center justify-between mb-3">
                                        <div class="flex items-center gap-2">
                                            <span class="text-xs font-medium text-zinc-400">Mods</span>
                                            {#if selectedItem.masterwork}
                                                <span class="text-[10px] font-semibold text-yellow-400 border border-yellow-400/30 px-1.5 py-0.5 rounded-sm">
                                                    Masterworked
                                                </span>
                                            {/if}
                                        </div>
                                        <!-- Energy pips -->
                                        <div class="flex items-center gap-1">
                                            <span class="text-xs font-medium text-zinc-500 mr-1">{used}/{capacity}</span>
                                            <div class="flex gap-px">
                                                {#each {length: capacity} as _, i}
                                                    <div class="w-2.5 h-1.5 rounded-sm transition-colors
                                                                {i < used
                                                                    ? selectedItem.masterwork
                                                                        ? 'bg-yellow-400/70'
                                                                        : 'bg-emerald-500/70'
                                                                    : 'bg-zinc-800'}">
                                                    </div>
                                                {/each}
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Mod slot row (D2-style: square icons in a row) -->
                                    <div class="flex gap-2 flex-wrap">
                                        <!-- Filled mod slots -->
                                        {#each mods as mod}
                                            <div class="group/mod relative cursor-default shrink-0">
                                                <!-- Slot square -->
                                                <div class="w-[52px] h-[52px] relative overflow-hidden
                                                            border transition-all duration-200
                                                            {mod.statBonuses?.length
                                                                ? 'border-emerald-500/40 bg-emerald-500/5 group-hover/mod:border-emerald-400/70'
                                                                : 'border-zinc-700 bg-[#0c0c0c] group-hover/mod:border-zinc-500'}">
                                                    {#if mod.icon}
                                                        <img src={mod.icon} alt="" class="w-full h-full object-cover" />
                                                    {:else}
                                                        <div class="w-full h-full flex items-center justify-center opacity-20">
                                                            <div class="w-5 h-5 border border-zinc-600 rotate-45"></div>
                                                        </div>
                                                    {/if}
                                                    <!-- Energy cost — bottom-right overlay (matches D2 UI) -->
                                                    {#if mod.energyCost > 0}
                                                        <div class="absolute bottom-0 right-0 w-5 h-5
                                                                    bg-black/80 flex items-center justify-center
                                                                    border-t border-l border-zinc-700/60">
                                                            <span class="text-[9px] font-mono font-bold text-emerald-400 leading-none">
                                                                {mod.energyCost}
                                                            </span>
                                                        </div>
                                                    {/if}
                                                    <!-- Stat bonus — top-left tag -->
                                                    {#if mod.statBonuses?.length}
                                                        <div class="absolute top-0 left-0 px-1 py-px
                                                                    bg-emerald-500/20 border-r border-b border-emerald-500/30">
                                                            <span class="text-[7px] font-mono font-bold text-emerald-300 leading-none">
                                                                +{mod.statBonuses[0].value}
                                                            </span>
                                                        </div>
                                                    {/if}
                                                </div>
                                                <!-- Hover tooltip -->
                                                <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50
                                                            opacity-0 group-hover/mod:opacity-100
                                                            translate-y-1 group-hover/mod:translate-y-0
                                                            transition-all duration-200 pointer-events-none min-w-[180px]">
                                                    <div class="bg-[#141414] border border-zinc-700
                                                                px-3 py-2.5 shadow-[0_0_20px_rgba(0,0,0,0.9)] rounded-sm">
                                                        <span class="text-sm font-semibold text-zinc-100 block mb-1">{mod.name}</span>
                                                        {#if mod.description}
                                                            <p class="text-xs text-zinc-400 leading-relaxed mb-1.5 max-w-[200px]">
                                                                {mod.description}
                                                            </p>
                                                        {/if}
                                                        <div class="flex items-center gap-3 flex-wrap">
                                                            {#if mod.energyCost > 0}
                                                                <span class="text-xs text-zinc-500">
                                                                    Cost: <span class="text-emerald-400 font-semibold">{mod.energyCost}</span>
                                                                </span>
                                                            {/if}
                                                            {#each (mod.statBonuses ?? []) as sb}
                                                                <span class="text-xs font-medium text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded-sm">
                                                                    +{sb.value} {statHashToName[sb.statHash] ?? ''}
                                                                </span>
                                                            {/each}
                                                        </div>
                                                        {#each (mod.conditionalBonuses ?? []) as sb}
                                                            <span class="text-xs text-zinc-500 border border-zinc-800 px-1.5 py-0.5 mt-1 inline-block rounded-sm">
                                                                +{sb.value} {statHashToName[sb.statHash] ?? ''} (conditional)
                                                            </span>
                                                        {/each}
                                                    </div>
                                                </div>
                                            </div>
                                        {/each}

                                        <!-- Empty mod slots -->
                                        {#each {length: empty} as _}
                                            <div class="w-[52px] h-[52px] border border-zinc-800/60 bg-[#090909]
                                                        flex items-center justify-center shrink-0">
                                                <!-- D2-style empty slot indicator: two crossing lines -->
                                                <div class="relative w-5 h-5 opacity-20">
                                                    <div class="absolute inset-0 flex items-center justify-center">
                                                        <div class="w-full h-px bg-zinc-500"></div>
                                                    </div>
                                                    <div class="absolute inset-0 flex items-center justify-center">
                                                        <div class="w-px h-full bg-zinc-500"></div>
                                                    </div>
                                                </div>
                                            </div>
                                        {/each}
                                    </div>

                                    <!-- Remaining energy display -->
                                    {#if capacity - used > 0}
                                        <p class="text-xs font-medium text-zinc-600 mt-2">
                                            {capacity - used} energy remaining
                                        </p>
                                    {:else}
                                        <p class="text-xs font-medium text-emerald-600 mt-2">
                                            Full capacity
                                        </p>
                                    {/if}
                                </div>
                            {/if}

                        <!-- ── SUBCLASS SOCKETS ────────────────────────────── -->
                        {:else if selectedType === 'subclass'}
                            {@const sc = eq.subclassSockets}
                            <!-- Super -->
                            {#if sc?.super}
                                <div class="flex items-start gap-4 pb-4 border-b border-zinc-800/60 mb-4">
                                    {#if sc.super.icon}
                                        <div class="shrink-0 w-12 h-12 border border-zinc-700 overflow-hidden rounded-sm">
                                            <img src={sc.super.icon} alt="" class="w-full h-full object-cover" />
                                        </div>
                                    {/if}
                                    <div>
                                        <span class="text-xs font-medium text-zinc-500 block">Super</span>
                                        <span class="text-base font-semibold text-zinc-100 block">{sc.super.name}</span>
                                        {#if sc.super.description}
                                            <p class="text-xs text-zinc-500 mt-1 leading-relaxed line-clamp-4">
                                                {sc.super.description}
                                            </p>
                                        {/if}
                                    </div>
                                </div>
                            {/if}
                            <!-- Abilities -->
                            {#if sc?.abilities?.length}
                                <span class="text-xs font-medium text-zinc-500 block mb-2">Abilities</span>
                                {#each sc.abilities as ab}
                                    <div class="flex items-start gap-3 py-2 border-b border-zinc-800/40 last:border-0">
                                        {#if ab.icon}
                                            <div class="shrink-0 w-9 h-9 border border-zinc-700 overflow-hidden rounded-sm">
                                                <img src={ab.icon} alt="" class="w-full h-full object-cover" />
                                            </div>
                                        {/if}
                                        <div class="flex-1 min-w-0">
                                            <span class="text-sm font-medium text-zinc-200 block leading-tight">{ab.name}</span>
                                            <span class="text-xs text-zinc-500">{ab.itemTypeDisplayName}</span>
                                        </div>
                                    </div>
                                {/each}
                            {/if}
                            <!-- Aspects -->
                            {#if sc?.aspects?.length}
                                <div class="mt-3 pt-3 border-t border-zinc-800/60">
                                    <span class="text-xs font-medium text-zinc-500 block mb-2">Aspects</span>
                                    {#each sc.aspects as asp}
                                        <div class="flex items-start gap-3 py-2 border-b border-zinc-800/40 last:border-0">
                                            {#if asp.icon}
                                                <div class="shrink-0 w-9 h-9 border border-zinc-700 overflow-hidden rounded-sm">
                                                    <img src={asp.icon} alt="" class="w-full h-full object-cover" />
                                                </div>
                                            {/if}
                                            <div class="flex-1 min-w-0">
                                                <span class="text-sm font-medium text-zinc-200 block leading-tight">{asp.name}</span>
                                                {#if asp.description}
                                                    <p class="text-xs text-zinc-500 mt-0.5 leading-relaxed line-clamp-2">{asp.description}</p>
                                                {/if}
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                            <!-- Fragments -->
                            {#if sc?.fragments?.length}
                                <div class="mt-3 pt-3 border-t border-zinc-800/60">
                                    <span class="text-xs font-medium text-zinc-500 block mb-2">
                                        Fragments ({sc.fragments.length})
                                    </span>
                                    <div class="grid grid-cols-2 gap-2">
                                        {#each sc.fragments as frag}
                                            <div class="flex items-center gap-2.5 border border-zinc-800/60 p-2 group/frag hover:border-zinc-700 transition-colors rounded-sm">
                                                {#if frag.icon}
                                                    <div class="shrink-0 w-7 h-7 overflow-hidden">
                                                        <img src={frag.icon} alt="" class="w-full h-full object-cover" />
                                                    </div>
                                                {/if}
                                                <span class="text-xs font-medium text-zinc-400 leading-tight truncate">
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
                        <p class="text-xs font-medium text-zinc-700 mt-4">
                            Select a slot to inspect
                        </p>
                    </div>

                    <div class="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-zinc-800"></div>
                    <div class="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-zinc-800"></div>
                </div>
            {/if}
        </div>

        <!-- ── COL 3: STATS (left) + ARMOR (right) ──────────────────────────── -->
        <div class="col-span-2 flex gap-3 items-start">

            <!-- ── Vertical stats column ──────────────────────────────────── -->
            <div class="flex flex-col gap-0 shrink-0 pt-1">
                <!-- STATS label -->
                <div class="flex items-center gap-1.5 mb-3">
                    <span class="text-[10px] font-semibold text-emerald-500">Stats</span>
                    <div class="w-1 h-1 bg-emerald-500 rounded-full animate-pulse"></div>
                </div>

                {#each armorStatMeta as stat}
                    {@const total       = totalStats[stat.name] ?? 0}
                    {@const bonus       = Math.max(0, total - 100)}
                    {@const primary     = FATE_PRIMARY[stat.name]}
                    {@const fateBonuses = calcFateBonuses(stat.name, bonus)}
                    <!-- Each stat: number above, short name below -->
                    <div class="group/stat relative flex flex-col items-center py-2.5 px-1
                                border-b border-zinc-800/40 last:border-0 cursor-default">
                        <!-- Number -->
                        <span class="text-[15px] font-mono font-bold leading-none transition-colors
                                     {bonus > 0 ? 'text-emerald-400' : total >= 80 ? 'text-zinc-200' : 'text-zinc-500'}">
                            {total}
                        </span>
                        <!-- Thin bar below number -->
                        <div class="w-8 h-px bg-zinc-900 mt-1 mb-1 relative overflow-hidden">
                            <div class="absolute left-0 top-0 h-full bg-zinc-600 transition-all duration-700"
                                 style="width:{Math.min((Math.min(total,100)/200)*100,50)}%"></div>
                            {#if bonus > 0}
                                <div class="absolute top-0 h-full bg-emerald-500 transition-all duration-700"
                                     style="left:50%;width:{Math.min((bonus/100)*50,50)}%"></div>
                            {/if}
                        </div>
                        <!-- Short name -->
                        <span class="text-[7px] font-mono uppercase tracking-[0.1em]
                                     {bonus > 0 ? 'text-emerald-600' : 'text-zinc-700'} leading-none">
                            {stat.short ?? stat.name.slice(0,3)}
                        </span>

                        <!-- Hover tooltip (anchored right of the stats column) -->
                        {#if primary}
                            <div class="absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50
                                        opacity-0 group-hover/stat:opacity-100
                                        -translate-x-1 group-hover/stat:translate-x-0
                                        transition-all duration-200 pointer-events-none w-[220px]">
                                <div class="bg-[#111] border border-zinc-700 p-3 shadow-[0_0_24px_rgba(0,0,0,0.9)] rounded-sm">
                                    <div class="flex items-center justify-between mb-1.5">
                                        <span class="text-xs font-semibold text-zinc-200">{stat.name}</span>
                                        <span class="text-xs font-bold {bonus > 0 ? 'text-emerald-400' : 'text-zinc-300'}">{total}</span>
                                    </div>
                                    <p class="text-xs text-zinc-500 leading-relaxed">{primary}</p>
                                    {#if bonus > 0 && fateBonuses.length}
                                        <div class="border-t border-emerald-500/20 pt-2 mt-2">
                                            <span class="text-[10px] font-semibold text-emerald-500 block mb-1.5">+{bonus} above cap</span>
                                            {#each fateBonuses as fb}
                                                <div class="flex items-center justify-between gap-3 mb-1 last:mb-0">
                                                    <span class="text-xs text-zinc-500">{fb.label}</span>
                                                    <span class="text-xs font-bold text-emerald-400 shrink-0">{fb.value}</span>
                                                </div>
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                            </div>
                        {/if}
                    </div>
                {/each}

                <!-- Total + tier -->
                <div class="pt-3 mt-1 border-t border-zinc-800 text-center">
                    <span class="text-xs font-bold text-zinc-200 block leading-none">{grandTotal}</span>
                    <span class="text-[9px] font-medium text-emerald-500 mt-0.5 block">T{buildTier}</span>
                </div>
            </div>

            <!-- ── Armor slots ──────────────────────────────────────────────── -->
            <div class="flex flex-col items-center gap-4 flex-1">
                {@render GearSlot('helmet',    'Helmet')}
                {@render GearSlot('gauntlets', 'Arms')}
                {@render GearSlot('chest',     'Chest')}
                {@render GearSlot('legs',      'Legs')}
                {@render GearSlot('classItem', 'Class')}
            </div>
        </div>

    </div>
</div>
