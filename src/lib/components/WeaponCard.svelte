<script>
/**
 * WeaponCard — Destiny-style weapon tooltip / card
 *
 * Props:
 *   weapon  {Object}  — enriched weapon def from manifest (getItemDef output + extras)
 *   compact {boolean} — show condensed card without perks/stats
 *   class   {string}  — additional classes
 */
import { bungieIcon, rarityClass, rarityColor, rarityLabel, damageTypeName, damageTypeColor, AMMO_TYPE_NAMES, DISPLAY_STAT_ORDER, statMaxValue } from '$lib/destiny.js';
import StatBar   from './StatBar.svelte';
import PerkSlot  from './PerkSlot.svelte';

let { weapon = {}, compact = false, class: cls = '' } = $props();

const BUNGIE_ROOT = 'https://www.bungie.net';

// Resolved display data
const name       = $derived(weapon.displayProperties?.name ?? 'Unknown');
const icon       = $derived(bungieIcon(weapon.displayProperties?.icon));
const screenshot = $derived(bungieIcon(weapon.screenshot));
const tierType   = $derived(weapon.inventory?.tierType ?? 2);
const rClass     = $derived(rarityClass(tierType));
const rColor     = $derived(rarityColor(tierType));
const rLabel     = $derived(rarityLabel(tierType));
const typeName   = $derived(weapon.itemTypeDisplayName ?? '');
const archetype  = $derived(weapon.archetype ?? '');
const flavorText = $derived(weapon.flavorText ?? '');
const dmgType    = $derived(weapon.defaultDamageType ?? 0);
const dmgName    = $derived(damageTypeName(dmgType));
const dmgColor   = $derived(damageTypeColor(dmgType));
const ammoType   = $derived(weapon.equippingBlock?.ammoType ?? 1);
const ammoName   = $derived(AMMO_TYPE_NAMES[ammoType] ?? 'Primary');

// Stats — filter to displayable weapon stats in correct order
const rawStats  = $derived(weapon.stats?.stats ?? {});
const statRows  = $derived(
    DISPLAY_STAT_ORDER
        .map(hash => {
            const entry = rawStats[hash] ?? rawStats[String(hash)];
            if (!entry || entry.statTypeHash == null) return null;
            const statName = weapon._statNames?.[hash] ?? entry.displayProperties?.name ?? `Stat ${hash}`;
            if (!statName || statName === 'Not Applicable') return null;
            return {
                hash,
                name: statName,
                value: entry.value ?? 0,
                baseValue: entry.displayInterpolation ? entry.value : (entry.value ?? 0),
                maximum: statMaxValue(hash),
                isMasterworked: false,
            };
        })
        .filter(Boolean)
);

// Intrinsic / perk columns — weapon.perks from our enriched server data
const intrinsic = $derived(weapon._intrinsic ?? null);
const perkCols  = $derived(weapon._perkColumns ?? []);
</script>

<div
    class="d2-weapon-tooltip {rClass} {cls}"
    style="--rarity-color: {rColor}"
    role="article"
    aria-label={name}
>
    <!-- ── Header ── -->
    <header class="d2-weapon-tooltip__header">
        {#if icon}
        <div class="d2-weapon-tooltip__icon" style="--rarity-bg: {rColor}22">
            <img src={icon} alt={name} loading="lazy" />
        </div>
        {/if}

        <div class="d2-weapon-tooltip__meta">
            <div class="d2-weapon-tooltip__name">{name}</div>
            <div class="d2-weapon-tooltip__type">
                <!-- damage dot -->
                <span class="d2-element-dot" style="background:{dmgColor};display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:4px;vertical-align:middle;"></span>
                {dmgName} · {typeName}
            </div>
            {#if archetype}
            <div class="d2-weapon-tooltip__archetype">{archetype}</div>
            {/if}
            <div style="display:flex;align-items:center;gap:0.5rem;margin-top:0.15rem;">
                <span style="font-family:var(--font-family-display);font-size:0.68rem;font-weight:600;letter-spacing:0.10em;text-transform:uppercase;color:{rColor}">{rLabel}</span>
                <span class="d2-label" style="color:var(--d2-text-muted)">{ammoName} Ammo</span>
            </div>
        </div>
    </header>

    <!-- ── Screenshot banner ── -->
    {#if screenshot && !compact}
    <div style="width:100%;height:80px;overflow:hidden;position:relative;">
        <img src={screenshot} alt="" aria-hidden="true" loading="lazy"
            style="width:100%;height:100%;object-fit:cover;object-position:center 30%;opacity:0.55;" />
        <div style="position:absolute;inset:0;background:linear-gradient(to top, rgba(8,8,12,1) 0%, rgba(8,8,12,0) 60%);"></div>
    </div>
    {/if}

    {#if !compact}
    <!-- ── Intrinsic perk ── -->
    {#if intrinsic}
    <div style="padding:0.5rem 1rem;border-bottom:1px solid var(--d2-border-subtle);">
        <PerkSlot perk={intrinsic} isIntrinsic={true} />
    </div>
    {/if}

    <!-- ── Weapon stats ── -->
    {#if statRows.length}
    <section class="d2-stats">
        {#each statRows as stat (stat.hash)}
        <StatBar {stat} />
        {/each}
    </section>
    {/if}

    <!-- ── Perk columns ── -->
    {#if perkCols.length}
    <div style="border-top:1px solid var(--d2-border-subtle);">
        {#each perkCols as col, ci (ci)}
        <div style="display:flex;padding:0.4rem 0.75rem;gap:0.4rem;border-bottom:1px solid var(--d2-border-subtle);align-items:flex-start;">
            {#each col as perk (perk.hash ?? perk.name)}
            <PerkSlot {perk} />
            {/each}
        </div>
        {/each}
    </div>
    {/if}

    <!-- ── Flavor text ── -->
    {#if flavorText}
    <p style="padding:0.625rem 1rem;font-family:var(--font-family-sans);font-size:0.70rem;font-style:italic;color:var(--d2-text-muted);line-height:1.5;border-top:1px solid var(--d2-border-subtle);">
        {flavorText}
    </p>
    {/if}
    {/if}
</div>
