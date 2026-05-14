<script>
	import { goto } from '$app/navigation';

	let name = $state('');
	let error = $state('');
	let suggestions = $state([]);
	let loading = $state(false);
	let selIdx = $state(-1);
	let debounce = null;

	function onInput() {
		error = '';
		selIdx = -1;
		clearTimeout(debounce);
		const q = name.trim();
		if (q.length < 2) {
			suggestions = [];
			loading = false;
			return;
		}
		loading = true;
		debounce = setTimeout(async () => {
			try {
				const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
				suggestions = await res.json();
			} catch {
				suggestions = [];
			}
			loading = false;
		}, 220);
	}

	function navigate(s) {
		suggestions = [];
		goto(`/profile/${encodeURIComponent(s.name)}/${s.code}`);
	}

	function search() {
		const trimmed = name.trim();
		if (trimmed.includes('#')) {
			const [n, code] = trimmed.split('#');
			navigate({ name: n.trim(), code: code.trim() });
		} else if (suggestions.length) {
			navigate(suggestions[0]);
		} else {
			error = 'Enter your full Bungie name — e.g. Guardian#0000';
		}
	}

	function onKeydown(e) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selIdx = Math.min(selIdx + 1, suggestions.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selIdx = Math.max(selIdx - 1, -1);
		} else if (e.key === 'Enter') {
			if (selIdx >= 0 && suggestions[selIdx]) navigate(suggestions[selIdx]);
			else search();
		} else if (e.key === 'Escape') {
			suggestions = [];
		}
	}

	function onBlur() {
		setTimeout(() => {
			suggestions = [];
		}, 180);
	}

	const features = [
		{ label: 'EGO Scoring', desc: 'Advanced performance algorithm' },
		{ label: 'Match History', desc: 'Every PGCR analyzed' },
		{ label: 'Loadout Analysis', desc: 'Weapons · Subclass · Stats' },
		{ label: 'Career Stats', desc: 'Maps · Weapons · Synergy' },
		{ label: 'Invasion Intel', desc: 'Kills · Denies · Efficiency' }
	];

	const topPlayers = [
		{ name: 'Azelia', code: '4821', score: 99.4, tier: 'S' },
		{ name: 'Saint-14', code: '0014', score: 98.2, tier: 'S' },
		{ name: 'Ikora', code: '0001', score: 97.8, tier: 'S' },
		{ name: 'Zavala', code: '0002', score: 96.5, tier: 'A' },
		{ name: 'Cayde-6', code: '0006', score: 95.9, tier: 'A' },
		{ name: 'Drifter', code: '0000', score: 94.2, tier: 'A' },
		{ name: 'Eris Morn', code: '1337', score: 93.1, tier: 'B' },
		{ name: 'Shaxx', code: '9999', score: 92.4, tier: 'B' },
		{ name: 'Saladin', code: '0404', score: 91.8, tier: 'B' },
		{ name: 'Osiris', code: '7777', score: 90.5, tier: 'B' }
	];

	const weaponMeta = [
		{ name: 'Malfeasance', type: 'Exotic HC', slot: 'Kinetic', usage: '18.4%' },
		{ name: 'Breakneck', type: 'Auto Rifle', slot: 'Kinetic', usage: '12.1%' },
		{ name: 'Trust', type: 'Hand Cannon', slot: 'Energy', usage: '15.2%' },
		{ name: 'Borrowed Time', type: 'SMG', slot: 'Energy', usage: '10.5%' },
		{ name: 'Eyes of Tomorrow', type: 'Exotic RL', slot: 'Power', usage: '22.8%' },
		{ name: 'Gjallarhorn', type: 'Exotic RL', slot: 'Power', usage: '14.6%' }
	];
</script>

<!-- ── Hero ────────────────────────────────────────────────────────────────── -->
<main
	style="
    min-height: calc(100vh - 48px);
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 4rem 1.5rem;
    position: relative; overflow: hidden;
"
>
	<!-- Subtle background glow -->
	<div
		style="
        position: absolute; inset: 0; pointer-events: none;
        background: radial-gradient(circle at 50% 50%, rgba(61,174,119,0.08) 0%, transparent 70%);
    "
	></div>

	<!-- Hero content -->
	<div style="position:relative;text-align:center;margin-bottom:3.5rem;">
		<!-- Eyebrow -->
		<div
			style="display:flex;align-items:center;justify-content:center;gap:16px;margin-bottom:1.5rem;"
		>
			<div
				style="height:1px;width:32px;background:linear-gradient(to right,transparent,var(--gambit-green));opacity:0.4;"
			></div>
			<span
				style="
                font-size:0.7rem;font-weight:500;
                letter-spacing:0.3em;text-transform:uppercase;
                color:var(--gambit-green);
                opacity:0.8;
                font-family: var(--font-family-display);
            ">Gambit Intelligence Platform</span
			>
			<div
				style="height:1px;width:32px;background:linear-gradient(to left,transparent,var(--gambit-green));opacity:0.4;"
			></div>
		</div>

		<!-- Main title — Less condensed, more elegant -->
		<h1
			style="
            font-family:var(--font-family-display);
            font-size:clamp(3.5rem,12vw,6.5rem);
            font-weight:600;
            letter-spacing:0.18em;
            text-transform:uppercase;
            color:var(--d2-text-primary);
            line-height:1;
            margin:0 0 1.5rem;
            filter: drop-shadow(0 0 20px rgba(255,255,255,0.05));
        "
		>
			Jadestone
		</h1>

		<!-- Subtle accent line -->
		<div
			style="height:1px;width:120px;background:linear-gradient(90deg,transparent,rgba(61,174,119,0.5),transparent);margin:0 auto 1.5rem;"
		></div>

		<p
			style="
            font-family:var(--font-family-sans);
            font-size:1rem;
            color:var(--d2-text-secondary);
            max-width:440px;
            margin:0 auto;
            line-height:1.7;
            letter-spacing:0.04em;
            opacity:0.9;
        "
		>
			Career statistics, match history &amp; EGO performance data for Destiny 2 Gambit
		</p>
	</div>

	<!-- ── Search & Info Section ── -->
	<div
		style="
        display:flex; align-items:flex-start; justify-content:center;
        gap:2rem; width:100%; max-width:1100px;
        position:relative; z-index:10;
    "
	>
		<!-- Left: Leaderboard -->
		<div
			style="
            flex:1; max-width:260px;
            background:rgba(6,8,12,0.35);
            border:1px solid rgba(255,255,255,0.06);
            border-radius:1.5rem;
            backdrop-filter:blur(20px);
            padding:1.5rem;
            display:none;
        "
			class="side-panel anim-in"
		>
			<h3
				style="
                font-family:var(--font-family-display); font-size:0.7rem; font-weight:700;
                letter-spacing:0.2em; text-transform:uppercase; color:var(--gambit-green);
                margin-bottom:1.25rem; opacity:0.8;
            "
			>
				Top Players
			</h3>
			<div style="display:flex; flex-direction:column; gap:0.85rem;">
				{#each topPlayers as p, i}
					<div style="display:flex; align-items:center; gap:12px;">
						<span style="font-size:0.6rem; color:var(--d2-text-muted); width:14px; font-weight:600;">{i + 1}</span>
						<span
							style="font-family:var(--font-family-sans); font-size:0.8rem; color:var(--d2-text-primary); flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"
							>{p.name}</span
						>
						<span
							class="ego-tier-{p.tier}"
							style="font-family:var(--font-family-display); font-size:0.75rem; font-weight:700; opacity:0.9;"
							>{p.score.toFixed(1)}</span
						>
					</div>
				{/each}
			</div>
		</div>

		<!-- Center: Search -->
		<div
			style="width:100%; max-width:440px; display:flex; flex-direction:column; align-items:center; position:relative;"
		>
			<div
				style="
                width:100%;
                background:rgba(6,8,12,0.55);
                border:1px solid rgba(255,255,255,0.08);
                border-radius: 2.5rem;
                backdrop-filter:blur(24px);
                box-shadow:0 12px 48px rgba(0,0,0,0.5), 0 0 20px rgba(61,174,119,0.03);
                overflow:hidden;
            "
			>
				<div style="display:flex;align-items:stretch;">
					<!-- Search icon -->
					<div
						style="padding:0 12px 0 22px;display:flex;align-items:center;color:var(--d2-text-muted);flex-shrink:0;opacity:0.6;"
					>
						<svg
							style="width:16px;height:16px;"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
							/>
						</svg>
					</div>

					<!-- Input -->
					<input
						bind:value={name}
						oninput={onInput}
						onkeydown={onKeydown}
						onblur={onBlur}
						placeholder="SEARCH GUARDIAN — name#0000"
						style="
                            flex:1; background:transparent; border:none; outline:none;
                            padding:1.1rem 8px;
                            font-family:var(--font-family-display);
                            font-size:0.85rem; font-weight:500;
                            letter-spacing:0.08em;
                            color:var(--d2-text-primary);
                            min-width:0;
                        "
					/>

					{#if loading}
						<div style="margin-right:12px;display:flex;align-items:center;">
							<div
								style="width:14px;height:14px;border:1.5px solid rgba(255,255,255,0.15);border-top-color:var(--gambit-green);border-radius:50%;animation:spin 0.7s linear infinite;"
							></div>
						</div>
					{/if}

					<!-- Search button -->
					<button
						onclick={search}
						style="
                        padding:0 28px;
                        background:rgba(61,174,119,0.08);
                        border:none;border-left:1px solid rgba(255,255,255,0.06);
                        font-family:var(--font-family-display);
                        font-size:0.75rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;
                        color:var(--gambit-green);
                        cursor:pointer;
                        transition:all 0.2s;
                    "
						onmouseenter={(e) => {
							e.currentTarget.style.background = 'rgba(61,174,119,0.18)';
							e.currentTarget.style.color = '#6de8b0';
						}}
						onmouseleave={(e) => {
							e.currentTarget.style.background = 'rgba(61,174,119,0.08)';
							e.currentTarget.style.color = 'var(--gambit-green)';
						}}
					>
						Search
					</button>
				</div>
			</div>

			<!-- Suggestions dropdown -->
			{#if suggestions.length}
				<div
					style="
                    position:absolute;top:calc(100% + 12px);left:0;right:0;z-index:50;
                    background:rgba(6,8,12,0.95);
                    border:1px solid rgba(255,255,255,0.08);
                    border-radius:1.5rem;
                    backdrop-filter:blur(32px);
                    box-shadow:0 16px 64px rgba(0,0,0,0.8);
                    overflow:hidden;
                "
				>
					{#each suggestions as s, i}
						<button
							onmousedown={() => navigate(s)}
							style="
                                width:100%;display:flex;align-items:center;gap:12px;
                                padding:12px 20px;text-align:left;
                                background:{i === selIdx ? 'rgba(61,174,119,0.08)' : 'transparent'};
                                border:none;border-bottom:1px solid rgba(255,255,255,0.04);
                                cursor:pointer;
                            "
							onmouseenter={(e) => {
								if (i !== selIdx) e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
							}}
							onmouseleave={(e) => {
								if (i !== selIdx) e.currentTarget.style.background = 'transparent';
							}}
						>
							{#if s.iconPath}
								<img
									src="https://www.bungie.net{s.iconPath}"
									alt=""
									style="width:36px;height:36px;border-radius:6px;object-fit:cover;flex-shrink:0;"
								/>
							{:else}
								<div
									style="width:36px;height:36px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;flex-shrink:0;"
								></div>
							{/if}
							<span
								style="font-family:var(--font-family-display);font-size:0.9rem;font-weight:500;letter-spacing:0.04em;color:var(--d2-text-primary);flex:1;text-align:left;"
							>
								{s.name}<span style="color:var(--d2-text-muted); opacity:0.6;">#{s.code}</span>
							</span>
							<svg
								style="width:12px;height:12px;color:var(--d2-text-muted);opacity:0.4;"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 5l7 7-7 7"
								/>
							</svg>
						</button>
					{/each}
				</div>
			{/if}

			<!-- Hint -->
			<p
				style="
                margin-top:1.5rem;
                font-size:0.65rem;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;
                color:rgba(255,255,255,0.22);
            "
			>
				Type to search · name#code to navigate directly
			</p>

			<!-- Error -->
			{#if error}
				<p
					style="font-size:0.75rem;color:#f87171;margin-top:12px;font-family:var(--font-family-display);letter-spacing:0.05em;opacity:0.9;"
				>
					{error}
				</p>
			{/if}
		</div>

		<!-- Right: Meta -->
		<div
			style="
            flex:1; max-width:260px;
            background:rgba(6,8,12,0.35);
            border:1px solid rgba(255,255,255,0.06);
            border-radius:1.5rem;
            backdrop-filter:blur(20px);
            padding:1.5rem;
            display:none;
        "
			class="side-panel anim-in"
		>
			<h3
				style="
                font-family:var(--font-family-display); font-size:0.7rem; font-weight:700;
                letter-spacing:0.2em; text-transform:uppercase; color:var(--gambit-green);
                margin-bottom:1.25rem; opacity:0.8;
            "
			>
				Weapon Meta
			</h3>
			<div style="display:flex; flex-direction:column; gap:1rem;">
				{#each weaponMeta as w}
					<div style="display:flex; flex-direction:column; gap:4px;">
						<div style="display:flex; align-items:center; justify-content:space-between;">
							<span
								style="font-family:var(--font-family-sans); font-size:0.8rem; color:var(--d2-text-primary); font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"
								>{w.name}</span
							>
							<span style="font-size:0.65rem; color:var(--gambit-green); opacity:0.8; font-weight:600;"
								>{w.usage}</span
							>
						</div>
						<span
							style="font-size:0.6rem; color:var(--d2-text-muted); letter-spacing:0.06em; text-transform:uppercase; font-weight:500;"
							>{w.slot} · {w.type}</span
						>
					</div>
				{/each}
			</div>
		</div>
	</div>

	<!-- ── Feature grid ── -->
	<div
		style="
        position:relative;margin-top:5rem;
        display:flex;flex-wrap:wrap;justify-content:center;gap:12px;
        max-width:800px;
    "
	>
		{#each features as feat, i}
			<div
				class="anim-in"
				style="
                animation-delay:{0.4 + i * 0.08}s;
                padding:12px 24px;
                background:rgba(255,255,255,0.02);
                border:1px solid rgba(255,255,255,0.05);
                border-radius:1.25rem;
                backdrop-filter:blur(8px);
                display:flex;flex-direction:column;gap:4px;
                min-width:160px;
                text-align:center;
                transition: transform 0.3s ease, background 0.3s ease;
            "
				onmouseenter={(e) => {
					e.currentTarget.style.transform = 'translateY(-4px)';
					e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
				}}
				onmouseleave={(e) => {
					e.currentTarget.style.transform = 'translateY(0)';
					e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
				}}
			>
				<span
					style="
                    font-size:0.75rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;
                    color:var(--d2-text-secondary);
                    font-family: var(--font-family-display);
                ">{feat.label}</span
				>
				<span
					style="
                    font-size:0.65rem;font-weight:400;letter-spacing:0.04em;
                    color:var(--d2-text-muted);font-family:var(--font-family-sans);
                    opacity:0.8;
                ">{feat.desc}</span
				>
			</div>
		{/each}
	</div>
</main>

<style>
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes fadeSlideUp {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.anim-in {
		animation: fadeSlideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	@media (min-width: 1024px) {
		:global(.side-panel) {
			display: block !important;
		}
	}
</style>
