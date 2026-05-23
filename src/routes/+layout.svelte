<script>
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import Nav from '$lib/Nav.svelte';

	let { children, data } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<!-- ── Parallax background (fixed so content scrolls over it) ───────────────── -->
<div class="fixed inset-0 -z-10 overflow-hidden" style="background: #060e0b;">
	<!-- Jade orb — top-left, slow drift -->
	<div
		style="
        position: absolute;
        top: -10%;
        left: -5%;
        width: 70vw;
        height: 70vw;
        max-width: 900px;
        max-height: 900px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(16,185,129,0.10) 0%, rgba(16,185,129,0.04) 40%, transparent 70%);
        animation: orb-drift-1 28s ease-in-out infinite;
        pointer-events: none;
    "
	></div>

	<!-- Indigo orb — bottom-right -->
	<div
		style="
        position: absolute;
        bottom: -15%;
        right: -10%;
        width: 65vw;
        height: 65vw;
        max-width: 800px;
        max-height: 800px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(79,70,229,0.08) 0%, rgba(79,70,229,0.03) 40%, transparent 70%);
        animation: orb-drift-2 36s ease-in-out infinite;
        pointer-events: none;
    "
	></div>

	<!-- Amber/gold orb — center, very subtle -->
	<div
		style="
        position: absolute;
        top: 35%;
        left: 45%;
        width: 40vw;
        height: 40vw;
        max-width: 600px;
        max-height: 600px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(251,191,36,0.045) 0%, transparent 65%);
        animation: orb-drift-3 22s ease-in-out infinite;
        pointer-events: none;
    "
	></div>

	<!-- Subtle noise vignette to keep edges dark -->
	<div
		style="
        position: absolute;
        inset: 0;
        background: radial-gradient(ellipse 100% 100% at 50% 50%,
            transparent 40%,
            rgba(4,8,7,0.55) 75%,
            rgba(4,8,7,0.85) 100%);
        pointer-events: none;
    "
	></div>
</div>

<!-- ── Maintenance banner ─────────────────────────────────────────────────────── -->
<div style="
    background: linear-gradient(90deg, #78350f, #92400e, #78350f);
    border-bottom: 1px solid rgba(251,191,36,0.3);
    padding: 10px 16px;
    text-align: center;
    font-size: 0.9rem;
    color: #fde68a;
    position: sticky;
    top: 0;
    z-index: 9999;
    letter-spacing: 0.01em;
">
    ⚠️ <strong>Live updates are ending June 9, 2026.</strong> Leaderboards and stats will be preserved as a final snapshot.
</div>

<!-- ── App shell ─────────────────────────────────────────────────────────────── -->
<div class="min-h-screen font-sans text-base text-slate-200">
	<Nav user={data.user} />
	{@render children()}
</div>
