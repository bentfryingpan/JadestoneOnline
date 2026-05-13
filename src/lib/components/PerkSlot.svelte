<script>
	/**
	 * PerkSlot — single perk icon + name + description
	 *
	 * Props:
	 *   perk        {Object}  — { name, description, icon, isSelected, isEnhanced, hash }
	 *   isIntrinsic {boolean} — show as intrinsic frame perk (full-width, square icon)
	 *   showDesc    {boolean} — always show description even if not selected
	 */
	import { bungieIcon } from '$lib/destiny.js';

	let { perk = {}, isIntrinsic = false, showDesc = true } = $props();

	const name = $derived(perk.name ?? '');
	const desc = $derived(perk.description ?? perk.perkDescription ?? perk.flavorText ?? '');
	const icon = $derived(bungieIcon(perk.icon));
	const isSelected = $derived(perk.isSelected ?? true);
	const isEnhanced = $derived(perk.isEnhanced ?? false);
</script>

{#if isIntrinsic}
	<!-- Intrinsic perk: horizontal layout, no selection state -->
	<div style="display:flex;align-items:center;gap:0.6rem;">
		{#if icon}
			<div
				style="width:42px;height:42px;flex-shrink:0;border:1px solid var(--d2-border-default);background:rgba(255,255,255,0.06);overflow:hidden;"
			>
				<img
					src={icon}
					alt={name}
					loading="lazy"
					style="width:100%;height:100%;object-fit:cover;"
				/>
			</div>
		{/if}
		<div style="min-width:0;">
			<div
				class="d2-perk-name"
				style="font-size:0.80rem;color:var(--rarity-exotic, var(--d2-text-cream));"
			>
				{name}
			</div>
			{#if desc}<div class="d2-perk-desc" style="margin-top:0.1rem;">{desc}</div>{/if}
		</div>
	</div>
{:else}
	<!-- Regular perk: icon column layout -->
	<div style="display:flex;flex-direction:column;align-items:center;gap:0.3rem;width:44px;">
		<div
			class="d2-perk-icon"
			class:selected={isSelected}
			class:unselected={!isSelected}
			title={name}
		>
			{#if icon}
				<img
					src={icon}
					alt={name}
					loading="lazy"
					style="width:100%;height:100%;object-fit:cover;"
				/>
			{:else}
				<div
					style="width:100%;height:100%;background:rgba(255,255,255,0.08);border-radius:50%;"
				></div>
			{/if}
		</div>

		{#if showDesc && isSelected && (name || desc)}
			<!-- Tooltip-style name/desc shown below when selected -->
			<div
				style="width:120px;position:absolute;z-index:20;background:rgba(8,8,12,0.97);border:1px solid var(--d2-border-default);padding:0.4rem 0.5rem;pointer-events:none;display:none;"
			>
				<div class="d2-perk-name">{name}</div>
				{#if desc}<div class="d2-perk-desc">{desc}</div>{/if}
			</div>
		{/if}
	</div>
{/if}
