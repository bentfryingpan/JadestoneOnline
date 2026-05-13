<script>
	/**
	 * StatBar — DIM-style segmented weapon stat bar
	 *
	 * Props:
	 *   stat {Object} — { name, value, baseValue, maximum, isMasterworked, modValue, traitValue }
	 */
	let { stat = {} } = $props();

	const name = $derived(stat.name ?? '');
	const value = $derived(stat.value ?? 0);
	const baseValue = $derived(stat.baseValue ?? value);
	const maximum = $derived(stat.maximum ?? 100);
	const isMW = $derived(stat.isMasterworked ?? false);
	const modValue = $derived(stat.modValue ?? 0); // blue bar segment
	const traitValue = $derived(stat.traitValue ?? 0); // light segment from perks

	// Clamped percentage helpers
	const pct = (v) => Math.min(100, Math.max(0, (v / maximum) * 100));

	const baseWidth = $derived(pct(Math.max(0, baseValue - traitValue - modValue)));
	const traitWidth = $derived(pct(traitValue));
	const modWidth = $derived(pct(modValue));
	const mwWidth = $derived(isMW ? pct(1) : 0); // tiny masterwork end bar
</script>

<div class="d2-stat-row">
	<div class="d2-stat-name" class:masterworked={isMW}>{name}</div>

	<div
		class="d2-stat-bar-track"
		role="meter"
		aria-label={name}
		aria-valuenow={value}
		aria-valuemax={maximum}
	>
		{#if baseWidth > 0}
			<div class="d2-stat-bar-segment base" style="width:{baseWidth}%"></div>
		{/if}
		{#if traitWidth > 0}
			<div class="d2-stat-bar-segment parts" style="width:{traitWidth}%"></div>
		{/if}
		{#if modWidth > 0}
			<div class="d2-stat-bar-segment mod" style="width:{modWidth}%"></div>
		{/if}
		{#if isMW}
			<div class="d2-stat-bar-segment masterwork" style="width:3px;flex-shrink:0;"></div>
		{/if}
	</div>

	<div
		class="d2-stat-val"
		class:masterworked={isMW}
		class:buffed={value > baseValue && !isMW}
		class:debuffed={value < baseValue}
	>
		{value}
	</div>
</div>
