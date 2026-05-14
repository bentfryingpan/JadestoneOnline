<script>
	import { goto } from '$app/navigation';

	let name = $state('');
	let error = $state('');
	let suggestions = $state([]);
	let loading = $state(false);
	let selIdx = $state(-1);
	let selectedSlot = $state('Kinetic');
	let selectedMetric = $state('EGO');
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

	const eloRanking = [
		{ name: 'Saint-14', code: '0014', score: 2850, tier: 'S' },
		{ name: 'Shaxx', code: '9999', score: 2790, tier: 'S' },
		{ name: 'Saladin', code: '0404', score: 2680, tier: 'S' },
		{ name: 'Ikora', code: '0001', score: 2620, tier: 'A' },
		{ name: 'Azelia', code: '4821', score: 2550, tier: 'A' },
		{ name: 'Zavala', code: '0002', score: 2480, tier: 'A' },
		{ name: 'Drifter', code: '0000', score: 2350, tier: 'B' },
		{ name: 'Cayde-6', code: '0006', score: 2290, tier: 'B' },
		{ name: 'Osiris', code: '7777', score: 2210, tier: 'B' },
		{ name: 'Eris Morn', code: '1337', score: 2150, tier: 'B' }
	];

	const effRanking = [
		{ name: 'Azelia', code: '4821', score: 4.82, tier: 'S' },
		{ name: 'Ikora', code: '0001', score: 3.95, tier: 'S' },
		{ name: 'Cayde-6', code: '0006', score: 3.84, tier: 'S' },
		{ name: 'Saint-14', code: '0014', score: 3.65, tier: 'A' },
		{ name: 'Drifter', code: '0000', score: 3.42, tier: 'A' },
		{ name: 'Zavala', code: '0002', score: 3.18, tier: 'A' },
		{ name: 'Osiris', code: '7777', score: 2.95, tier: 'B' },
		{ name: 'Shaxx', code: '9999', score: 2.84, tier: 'B' },
		{ name: 'Eris Morn', code: '1337', score: 2.65, tier: 'B' },
		{ name: 'Saladin', code: '0404', score: 2.42, tier: 'B' }
	];

	const currentLeaderboard = $derived(
		selectedMetric === 'EGO' ? topPlayers : selectedMetric === 'ELO' ? eloRanking : effRanking
	);

	const weaponMeta = [
		// Kinetic
		{ name: 'Malfeasance', type: 'Exotic HC', slot: 'Kinetic', usage: '18.4%' },
		{ name: 'Breakneck', type: 'Auto Rifle', slot: 'Kinetic', usage: '12.1%' },
		{ name: 'Witherhoard', type: 'Exotic GL', slot: 'Kinetic', usage: '9.8%' },
		{ name: 'Heritage', type: 'Shotgun', slot: 'Kinetic', usage: '7.5%' },
		{ name: 'Servant Leader', type: 'Scout Rifle', slot: 'Kinetic', usage: '6.2%' },
		{ name: 'Chroma Rush', type: 'Auto Rifle', slot: 'Kinetic', usage: '5.4%' },
		{ name: 'Submission', type: 'SMG', slot: 'Kinetic', usage: '4.8%' },
		{ name: 'Fatebringer', type: 'Hand Cannon', slot: 'Kinetic', usage: '3.9%' },
		{ name: 'Blinding GL', type: 'Grenade Launcher', slot: 'Kinetic', usage: '3.1%' },
		{ name: 'Wish-Ender', type: 'Exotic Bow', slot: 'Kinetic', usage: '2.8%' },
		
		// Energy
		{ name: 'Trust', type: 'Hand Cannon', slot: 'Energy', usage: '15.2%' },
		{ name: 'Borrowed Time', type: 'SMG', slot: 'Energy', usage: '10.5%' },
		{ name: 'Calus Mini-Tool', type: 'SMG', slot: 'Energy', usage: '9.2%' },
		{ name: 'Ikelos_SG_v1.0.3', type: 'Shotgun', slot: 'Energy', usage: '6.4%' },
		{ name: 'Sunshot', type: 'Exotic HC', slot: 'Energy', usage: '5.9%' },
		{ name: 'Null Composure', type: 'Fusion Rifle', slot: 'Energy', usage: '5.1%' },
		{ name: 'BXR-55 Battler', type: 'Pulse Rifle', slot: 'Energy', usage: '4.7%' },
		{ name: 'Le Monarque', type: 'Exotic Bow', slot: 'Energy', usage: '3.8%' },
		{ name: 'Forbearance', type: 'Grenade Launcher', slot: 'Energy', usage: '3.2%' },
		{ name: 'Gnawing Hunger', type: 'Auto Rifle', slot: 'Energy', usage: '2.5%' },
		
		// Power
		{ name: 'Eyes of Tomorrow', type: 'Exotic RL', slot: 'Power', usage: '22.8%' },
		{ name: 'Gjallarhorn', type: 'Exotic RL', slot: 'Power', usage: '14.6%' },
		{ name: 'Leviathan\'s Breath', type: 'Exotic Bow', slot: 'Power', usage: '11.3%' },
		{ name: 'Commemoration', type: 'Machine Gun', slot: 'Power', usage: '10.1%' },
		{ name: 'Xenophage', type: 'Exotic MG', slot: 'Power', usage: '8.4%' },
		{ name: 'The Hothead', type: 'Rocket Launcher', slot: 'Power', usage: '6.7%' },
		{ name: 'Two-Tailed Fox', type: 'Exotic RL', slot: 'Power', usage: '5.2%' },
		{ name: 'Falling Guillotine', type: 'Sword', slot: 'Power', usage: '4.5%' },
		{ name: 'Thunderlord', type: 'Exotic MG', slot: 'Power', usage: '3.8%' },
		{ name: 'Apex Predator', type: 'Rocket Launcher', slot: 'Power', usage: '2.9%' }
	];

	const filteredMeta = $derived(weaponMeta.filter((w) => w.slot === selectedSlot));
</script>

<!-- ── Hero ────────────────────────────────────────────────────────────────── -->
<main
	style="
    min-height: calc(100vh - 48px);
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 2rem 1.5rem;
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
	<div style="position:relative;text-align:center;margin-bottom:4rem;">
		<!-- Eyebrow -->
		<div
			style="display:flex;align-items:center;justify-content:center;gap:16px;margin-bottom:1.5rem;"
			class="anim-in-d1"
		>
			<div
				style="height:1px;width:32px;background:linear-gradient(to right,transparent,var(--gambit-green));opacity:0.3;"
			></div>
			<span
				style="
		font-size:0.65rem;font-weight:400;
		letter-spacing:0.4em;text-transform:uppercase;
		color:var(--gambit-green);
		opacity:0.7;
		font-family: var(--font-family-display);
		">Gambit Intelligence Platform</span
			>
			<div
				style="height:1px;width:32px;background:linear-gradient(to left,transparent,var(--gambit-green));opacity:0.3;"
			></div>
		</div>

		<!-- Main title — Lighter weight, more letter spacing -->
		<h1
			class="anim-in-d2"
			style="
		font-family:var(--font-family-display);
		font-size:clamp(3rem,10vw,5.5rem);
		font-weight:300;
		letter-spacing:0.25em;
		text-transform:uppercase;
		color:var(--d2-text-primary);
		line-height:1.1;
		margin:0 0 1.5rem;
		filter: drop-shadow(0 0 30px rgba(255,255,255,0.03));
		"
		>
			Jadestone
		</h1>

		<!-- Subtle accent line -->
		<div
			class="anim-in-d3"
			style="height:1px;width:160px;background:linear-gradient(90deg,transparent,rgba(61,174,119,0.3),transparent);margin:0 auto 1.5rem;"
		></div>

		<p
			class="anim-in-d3"
			style="
		font-family:var(--font-family-sans);
		font-size:0.95rem;
		color:var(--d2-text-secondary);
		max-width:480px;
		margin:0 auto;
		line-height:1.8;
		letter-spacing:0.06em;
		opacity:0.75;
		font-weight: 300;
		"
		>
			Career statistics, match history &amp; EGO performance data for Destiny 2 Gambit
		</p>
		</div>

		<!-- ── Search & Info Section ── -->
		<div
		style="
		display:flex; align-items:flex-start; justify-content:center;
		gap:3rem; width:100%; max-width:1400px;
		position:relative; z-index:10;
		"
		>
		<!-- Left: Leaderboard -->
		<div
			style="
		flex:1; max-width:340px;
		background:rgba(6,8,12,0.25);
		border:1px solid rgba(255,255,255,0.04);
		border-radius:2.5rem;
		backdrop-filter:blur(32px);
		padding:2.5rem;
		display:none;
		"
			class="side-panel anim-in-d4"
		>
			<h3
				style="
		font-family:var(--font-family-display); font-size:0.75rem; font-weight:400;
		letter-spacing:0.3em; text-transform:uppercase; color:var(--gambit-green);
		margin-bottom:2rem; opacity:0.6;
		"
			>
				Top Players
			</h3>

			<!-- Metric Tabs -->
			<div
				style="
		display:flex; gap:6px; margin-bottom:2rem;
		background:rgba(255,255,255,0.02); padding:5px; border-radius:1.25rem;
		"
			>
				{#each ['EGO', 'ELO', 'EFF'] as metric}
					<button
						onclick={() => (selectedMetric = metric)}
						style="
		flex:1; padding:8px 0; border:none; border-radius:1rem;
		font-family:var(--font-family-display); font-size:0.6rem; font-weight:500;
		letter-spacing:0.15em; text-transform:uppercase;
		cursor:pointer; transition:all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
		background:{selectedMetric === metric ? 'rgba(61,174,119,0.1)' : 'transparent'};
		color:{selectedMetric === metric ? 'var(--gambit-green)' : 'var(--d2-text-muted)'};
		opacity:{selectedMetric === metric ? '1' : '0.5'};
		"
					>
						{metric}
					</button>
				{/each}
			</div>

			<div style="display:flex; flex-direction:column; gap:1.25rem;">
				{#each currentLeaderboard as p, i}
					<div style="display:flex; align-items:center; gap:16px;" class="list-item-anim">
						<span style="font-size:0.65rem; color:var(--d2-text-muted); width:18px; font-weight:300; opacity:0.5;">{i + 1}</span>
						<span
							style="font-family:var(--font-family-sans); font-size:0.85rem; color:var(--d2-text-primary); flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:300; opacity:0.9;"
							>{p.name}</span
						>
						<span
							class="ego-tier-{p.tier}"
							style="font-family:var(--font-family-display); font-size:0.8rem; font-weight:500; opacity:0.8; letter-spacing:0.05em;"
						>
							{selectedMetric === 'ELO' ? p.score : p.score.toFixed(selectedMetric === 'EFF' ? 2 : 1)}
						</span>
					</div>
				{/each}
			</div>
		</div>

		<!-- Center: Search -->
		<div
			style="width:100%; max-width:480px; display:flex; flex-direction:column; align-items:center; position:relative;"
			class="anim-in-d5"
		>
			<div
				style="
		width:100%;
		background:rgba(6,8,12,0.45);
		border:1px solid rgba(255,255,255,0.06);
		border-radius: 4rem;
		backdrop-filter:blur(40px);
		box-shadow:0 30px 80px rgba(0,0,0,0.4), 0 0 40px rgba(61,174,119,0.02);
		overflow:hidden;
		"
		>
			<div style="display:flex;align-items:stretch;">
				<!-- Search icon -->
				<div
					style="padding:0 12px 0 32px;display:flex;align-items:center;color:var(--d2-text-muted);flex-shrink:0;opacity:0.4;"
				>
					<svg
						style="width:18px;height:18px;"
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
		padding:1.6rem 8px;
		font-family:var(--font-family-display);
		font-size:0.9rem; font-weight:300;
		letter-spacing:0.12em;
		color:var(--d2-text-primary);
		min-width:0;
		opacity:0.8;
		"
				/>

				{#if loading}
					<div style="margin-right:20px;display:flex;align-items:center;">
						<div
							style="width:18px;height:18px;border:1.5px solid rgba(255,255,255,0.1);border-top-color:var(--gambit-green);border-radius:50%;animation:spin 0.8s linear infinite;"
						></div>
					</div>
				{/if}

				<!-- Search button -->
				<button
					onclick={search}
					style="
		padding:0 40px;
		background:rgba(61,174,119,0.05);
		border:none;border-left:1px solid rgba(255,255,255,0.04);
		font-family:var(--font-family-display);
		font-size:0.8rem;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;
		color:var(--gambit-green);
		cursor:pointer;
		transition:all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
		opacity:0.8;
		"
					onmouseenter={(e) => {
						e.currentTarget.style.background = 'rgba(61,174,119,0.12)';
						e.currentTarget.style.color = '#6de8b0';
						e.currentTarget.style.opacity = '1';
					}}
					onmouseleave={(e) => {
						e.currentTarget.style.background = 'rgba(61,174,119,0.05)';
						e.currentTarget.style.color = 'var(--gambit-green)';
						e.currentTarget.style.opacity = '0.8';
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
		position:absolute;top:calc(100% + 20px);left:0;right:0;z-index:50;
		background:rgba(6,8,12,0.92);
		border:1px solid rgba(255,255,255,0.06);
		border-radius:2.5rem;
		backdrop-filter:blur(48px);
		box-shadow:0 40px 100px rgba(0,0,0,0.8);
		overflow:hidden;
		"
		>
			{#each suggestions as s, i}
				<button
					onmousedown={() => navigate(s)}
					style="
		width:100%;display:flex;align-items:center;gap:20px;
		padding:20px 32px;text-align:left;
		background:{i === selIdx ? 'rgba(61,174,119,0.05)' : 'transparent'};
		border:none;border-bottom:1px solid rgba(255,255,255,0.03);
		cursor:pointer;
		transition:all 0.2s;
		"
					onmouseenter={(e) => {
						if (i !== selIdx) e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
					}}
					onmouseleave={(e) => {
						if (i !== selIdx) e.currentTarget.style.background = 'transparent';
					}}
				>
					{#if s.iconPath}
						<img
							src="https://www.bungie.net{s.iconPath}"
							alt=""
							style="width:44px;height:44px;border-radius:12px;object-fit:cover;flex-shrink:0;opacity:0.9;"
						/>
					{:else}
						<div
							style="width:44px;height:44px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:12px;flex-shrink:0;"
						></div>
					{/if}
					<span
						style="font-family:var(--font-family-display);font-size:1rem;font-weight:300;letter-spacing:0.08em;color:var(--d2-text-primary);flex:1;text-align:left;opacity:0.9;"
					>
						{s.name}<span style="color:var(--d2-text-muted); opacity:0.5;">#{s.code}</span>
					</span>
					<svg
						style="width:16px;height:16px;color:var(--d2-text-muted);opacity:0.2;"
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
		margin-top:2rem;
		font-size:0.6rem;font-weight:400;letter-spacing:0.25em;text-transform:uppercase;
		color:rgba(255,255,255,0.15);
		"
		>
		Type to search · name#code to navigate directly
		</p>

		<!-- Error -->
		{#if error}
		<p
			style="font-size:0.75rem;color:#f87171;margin-top:20px;font-family:var(--font-family-display);letter-spacing:0.08em;opacity:0.8;font-weight:300;"
		>
			{error}
		</p>
		{/if}
		</div>

		<!-- Right: Meta -->
		<div
		style="
		flex:1; max-width:340px;
		background:rgba(6,8,12,0.25);
		border:1px solid rgba(255,255,255,0.04);
		border-radius:2.5rem;
		backdrop-filter:blur(32px);
		padding:2.5rem;
		display:none;
		"
		class="side-panel anim-in-d6"
		>
		<h3
		style="
		font-family:var(--font-family-display); font-size:0.75rem; font-weight:400;
		letter-spacing:0.3em; text-transform:uppercase; color:var(--gambit-green);
		margin-bottom:2rem; opacity:0.6;
		"
		>
		Weapon Meta
		</h3>

		<!-- Slot Tabs -->
		<div
		style="
		display:flex; gap:6px; margin-bottom:2rem;
		background:rgba(255,255,255,0.02); padding:5px; border-radius:1.25rem;
		"
		>
		{#each ['Kinetic', 'Energy', 'Power'] as slot}
			<button
				onclick={() => (selectedSlot = slot)}
				style="
		flex:1; padding:8px 0; border:none; border-radius:1rem;
		font-family:var(--font-family-display); font-size:0.6rem; font-weight:500;
		letter-spacing:0.15em; text-transform:uppercase;
		cursor:pointer; transition:all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
		background:{selectedSlot === slot ? 'rgba(61,174,119,0.1)' : 'transparent'};
		color:{selectedSlot === slot ? 'var(--gambit-green)' : 'var(--d2-text-muted)'};
		opacity:{selectedSlot === slot ? '1' : '0.5'};
		"
			>
				{slot}
			</button>
		{/each}
		</div>

		<div style="display:flex; flex-direction:column; gap:1.25rem;">
		{#each filteredMeta as w, i}
			<div style="display:flex; align-items:center; gap:16px;" class="list-item-anim">
				<span style="font-size:0.65rem; color:var(--d2-text-muted); width:18px; font-weight:300; opacity:0.5;">{i + 1}</span>
				<div style="display:flex; flex-direction:column; gap:4px; flex:1; min-width:0;">
					<div style="display:flex; align-items:center; justify-content:space-between;">
						<span
							style="font-family:var(--font-family-sans); font-size:0.85rem; color:var(--d2-text-primary); font-weight:300; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; opacity:0.9;"
							>{w.name}</span
						>
						<span style="font-size:0.7rem; color:var(--gambit-green); opacity:0.7; font-weight:500; letter-spacing:0.05em;"
							>{w.usage}</span
						>
					</div>
					<span
						style="font-size:0.6rem; color:var(--d2-text-muted); letter-spacing:0.1em; text-transform:uppercase; font-weight:400; opacity:0.6;"
						>{w.type}</span
					>
				</div>
			</div>
		{/each}
		</div>
		</div>
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
			transform: translateY(30px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
		}

		@keyframes listEntrance {
		from {
			opacity: 0;
			transform: translateX(-10px);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
		}

		.anim-in-d1 { animation: fadeSlideUp 1.2s cubic-bezier(0.16, 1, 0.3, 1) both; animation-delay: 0.1s; }
		.anim-in-d2 { animation: fadeSlideUp 1.2s cubic-bezier(0.16, 1, 0.3, 1) both; animation-delay: 0.25s; }
		.anim-in-d3 { animation: fadeSlideUp 1.2s cubic-bezier(0.16, 1, 0.3, 1) both; animation-delay: 0.4s; }
		.anim-in-d4 { animation: fadeSlideUp 1.2s cubic-bezier(0.16, 1, 0.3, 1) both; animation-delay: 0.6s; }
		.anim-in-d5 { animation: fadeSlideUp 1.2s cubic-bezier(0.16, 1, 0.3, 1) both; animation-delay: 0.75s; }
		.anim-in-d6 { animation: fadeSlideUp 1.2s cubic-bezier(0.16, 1, 0.3, 1) both; animation-delay: 0.9s; }

		.list-item-anim {
		animation: listEntrance 0.8s cubic-bezier(0.16, 1, 0.3, 1) both;
		}
		.list-item-anim:nth-child(1) { animation-delay: 0.1s; }
		.list-item-anim:nth-child(2) { animation-delay: 0.15s; }
		.list-item-anim:nth-child(3) { animation-delay: 0.2s; }
		.list-item-anim:nth-child(4) { animation-delay: 0.25s; }
		.list-item-anim:nth-child(5) { animation-delay: 0.3s; }
		.list-item-anim:nth-child(6) { animation-delay: 0.35s; }
		.list-item-anim:nth-child(7) { animation-delay: 0.4s; }
		.list-item-anim:nth-child(8) { animation-delay: 0.45s; }
		.list-item-anim:nth-child(9) { animation-delay: 0.5s; }
		.list-item-anim:nth-child(10) { animation-delay: 0.55s; }

		@media (min-width: 1024px) {
		:global(.side-panel) {
			display: block !important;
		}
		}
		</style>
