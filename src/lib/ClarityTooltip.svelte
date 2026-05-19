<script>
	import { fade } from 'svelte/transition';

	/**
	 * item: {
	 *   name: string,
	 *   typeLabel?: string,            // e.g. "JUMP", "MELEE"
	 *   sections: clarity section[]|null,  // structured Clarity data
	 *   description: string,           // Bungie fallback
	 *   bonuses: { short, name, value, text }[],
	 * }
	 * pos: { x, y }
	 * accentClass: Tailwind text color class for the perk name (e.g. 'text-sky-400')
	 * accentLineClass: Tailwind bg color class for the stem line
	 */
	let { item, pos, accentClass = 'text-sky-400', accentLineClass = 'bg-sky-400' } = $props();

	// D2 element class → Tailwind color  (matches Clarity's classNames field)
	const ELEMENT_COLORS = {
		arc: 'text-cyan-400 font-bold',
		solar: 'text-orange-400 font-bold',
		void: 'text-violet-400 font-bold',
		stasis: 'text-blue-300 font-bold',
		strand: 'text-emerald-400 font-bold',
		prismatic: 'text-amber-300 font-bold',
		kinetic: 'text-zinc-200 font-bold',
		// common styled terms Clarity uses
		bold: 'text-white font-bold',
		italic: 'italic',
		'font-bold': 'text-white font-bold',
		highlight: 'text-white font-semibold'
	};

	function partClass(classNames) {
		for (const cn of classNames) {
			if (ELEMENT_COLORS[cn]) return ELEMENT_COLORS[cn];
		}
		return null; // unstyled
	}

	/**
	 * Split a single text string on bullet separators (• or ·) and return
	 * an array of trimmed non-empty fragments.  Used inside section rendering.
	 */
	function splitBullets(text) {
		return text
			.split(/\s*[•·]\s*/)
			.map((s) => s.trim())
			.filter(Boolean);
	}

	/**
	 * Does this section's text contain a bullet list?
	 * Heuristic: any part contains '•' or '·'.
	 */
	function isBulletSection(parts) {
		return parts.some((p) => p.text.includes('•') || p.text.includes('·'));
	}
</script>

<div
	class="pointer-events-none fixed z-[2000] mb-6 -translate-x-1/2 -translate-y-full"
	style="left: {pos.x}px; top: {pos.y}px;"
	transition:fade={{ duration: 100 }}
>
	<div class="w-80 border border-zinc-800 bg-[#0a0a0a] shadow-[0_0_40px_rgba(0,0,0,0.95)]">
		<!-- Header -->
		<div class="border-b border-zinc-800 px-4 pt-3 pb-2">
			{#if item.typeLabel}
				<p class="mb-0.5 text-[8px] font-bold tracking-[0.25em] text-zinc-600 uppercase">
					{item.typeLabel}
				</p>
			{/if}
			<p class="text-[11px] font-black uppercase italic tracking-wider {accentClass}">
				{item.name ?? ''}
			</p>
		</div>

		<!-- Scrollable body -->
		<div class="scrollbar-thin max-h-64 overflow-y-auto px-4 py-3">
			{#if item.sections?.length}
				<div class="space-y-3">
					{#each item.sections as section, i}
						{#if section === null}
							<!-- spacer → visual divider -->
							<div class="h-px bg-zinc-800"></div>
						{:else if isBulletSection(section.parts)}
							<!--
								Bullet list section:
								Re-assemble the full text from parts, then split on bullet markers.
								We only do this if the section contains bullets so normal sentences
								with styled spans still render inline.
							-->
							{@const fullText = section.parts.map((p) => p.text).join('')}
							{@const bullets = splitBullets(fullText)}
							{#if bullets.length > 0}
								<ul class="space-y-1.5">
									{#each bullets as bullet}
										<li class="flex items-start gap-2">
											<span class="mt-1 h-1 w-1 shrink-0 rounded-full {accentLineClass} opacity-60"></span>
											<span class="font-sans text-[11px] leading-snug text-zinc-200">{bullet}</span>
										</li>
									{/each}
								</ul>
							{/if}
						{:else}
							<!-- Inline section: render each part with its element colour -->
							<p class="font-sans text-[11px] leading-relaxed text-zinc-200">
								{#each section.parts as part}
									{@const cls = partClass(part.classNames)}
									{#if cls}
										<span class={cls}>{part.text}</span>
									{:else}
										{part.text}
									{/if}
								{/each}
							</p>
						{/if}
					{/each}
				</div>
			{:else if item.description}
				<!-- Fallback plain text — still split on bullets for readability -->
				{@const hasBullets = item.description.includes('•') || item.description.includes('·')}
				{#if hasBullets}
					{@const bullets = splitBullets(item.description)}
					<ul class="space-y-1.5">
						{#each bullets as bullet}
							<li class="flex items-start gap-2">
								<span class="mt-1 h-1 w-1 shrink-0 rounded-full {accentLineClass} opacity-60"></span>
								<span class="font-sans text-[11px] leading-snug text-zinc-200">{bullet}</span>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="font-sans text-[11px] leading-relaxed text-zinc-200">{item.description}</p>
				{/if}
			{:else}
				<p class="font-sans text-[10px] italic text-zinc-600">No description available.</p>
			{/if}
		</div>

		<!-- Stat bonus chips -->
		{#if item.bonuses?.length}
			<div class="flex flex-wrap gap-1 border-t border-zinc-800 px-4 py-2">
				{#each item.bonuses as bonus}
					<span
						class="rounded-sm px-1.5 py-0.5 text-[8px] font-black {bonus.value > 0
							? 'bg-emerald-500/15 text-emerald-400'
							: 'bg-red-500/15 text-red-400'}"
					>
						{bonus.value > 0 ? '+' : ''}{bonus.value}
						{bonus.short}
					</span>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Stem line -->
	<div
		class="mx-auto h-5 w-[1px] {accentLineClass} opacity-40"
	></div>
</div>

<style>
	.scrollbar-thin::-webkit-scrollbar {
		width: 3px;
	}
	.scrollbar-thin::-webkit-scrollbar-track {
		background: transparent;
	}
	.scrollbar-thin::-webkit-scrollbar-thumb {
		background: #3f3f46;
		border-radius: 2px;
	}
	.scrollbar-thin {
		scrollbar-width: thin;
		scrollbar-color: #3f3f46 transparent;
	}
</style>
