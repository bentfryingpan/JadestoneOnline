<script>
	import { page } from '$app/state';
	import { goto } from '$app/navigation';

	let { user = null } = $props();

	const links = $derived([
		{ href: '/leaderboards', label: 'Leaderboards' },
		...(user ? [{ href: '/settings', label: 'Settings' }] : [])
	]);

	const active = $derived(page.url.pathname);

	let searchOpen = $state(false);
	let searchVal = $state('');
	let suggestions = $state([]);
	let loading = $state(false);
	let selIdx = $state(-1);
	let inputEl = $state(null);
	let debounce = null;

	function openSearch() {
		searchOpen = true;
		setTimeout(() => inputEl?.focus(), 10);
	}

	function onInput() {
		selIdx = -1;
		clearTimeout(debounce);
		const q = searchVal.trim();
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
		searchVal = '';
		searchOpen = false;
		goto(`/profile/${encodeURIComponent(s.name)}/${s.code}`);
	}

	function onKeydown(e) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selIdx = Math.min(selIdx + 1, suggestions.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selIdx = Math.max(selIdx - 1, -1);
		} else if (e.key === 'Enter') {
			if (selIdx >= 0 && suggestions[selIdx]) {
				navigate(suggestions[selIdx]);
			} else if (searchVal.includes('#')) {
				const [n, c] = searchVal.split('#');
				navigate({ name: n.trim(), code: c.trim() });
			}
		} else if (e.key === 'Escape') {
			suggestions = [];
			if (!searchVal) searchOpen = false;
		}
	}

	function onBlur() {
		setTimeout(() => {
			if (!searchVal) searchOpen = false;
			suggestions = [];
		}, 180);
	}
</script>

<!-- ── Destiny-style Navigation ──────────────────────────────────────────────── -->
<nav
	style="
    position: sticky; top: 0; z-index: 50;
    height: 48px;
    display: flex; align-items: stretch;
    background: rgba(6, 8, 10, 0.92);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-bottom: 1px solid rgba(255,255,255,0.08);
    font-family: var(--font-family-display);
"
>
	<!-- Gambit accent line at very top -->
	<div
		style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--gambit-green) 0%,rgba(61,174,119,0.3) 30%,transparent 60%);pointer-events:none;"
	></div>

	<!-- Brand -->
	<a
		href="/"
		style="
        display: flex; align-items: center; gap: 10px;
        padding: 0 20px;
        border-right: 1px solid rgba(255,255,255,0.07);
        text-decoration: none;
        transition: background 0.15s ease;
        flex-shrink: 0;
    "
		onmouseenter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
		onmouseleave={(e) => (e.currentTarget.style.background = 'transparent')}
	>
		<!-- Diamond emblem with gambit green -->
		<div
			style="
            width: 22px; height: 22px;
            background: var(--gambit-green);
            display: flex; align-items: center; justify-content: center;
            transform: rotate(45deg);
            box-shadow: 0 0 12px rgba(61,174,119,0.5);
            flex-shrink: 0;
        "
		>
			<span
				style="transform:rotate(-45deg);font-size:10px;font-weight:900;color:#000;line-height:1;"
				>J</span
			>
		</div>
		<span
			style="
            font-size: 0.78rem;
            font-weight: 700;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            color: var(--d2-text-secondary);
        ">Jadestone</span
		>
	</a>

	<!-- Nav links -->
	{#each links as link}
		<a
			href={link.href}
			style="
            display: flex; align-items: center;
            padding: 0 20px;
            border-right: 1px solid rgba(255,255,255,0.07);
            text-decoration: none;
            font-size: 0.72rem;
            font-weight: 600;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            position: relative;
            transition: color 0.15s ease, background 0.15s ease;
            color: {active.startsWith(link.href)
				? 'var(--d2-text-primary)'
				: 'var(--d2-text-muted)'};
            background: {active.startsWith(link.href) ? 'rgba(255,255,255,0.04)' : 'transparent'};
        "
		>
			{link.label}
			{#if active.startsWith(link.href)}
				<div
					style="position:absolute;bottom:-1px;left:0;right:0;height:2px;background:var(--gambit-green);box-shadow:0 0 8px rgba(61,174,119,0.6);"
				></div>
			{/if}
		</a>
	{/each}

	<div style="flex:1;"></div>

	<!-- Search -->
	{#if searchOpen}
		<div style="position:relative;border-left:1px solid rgba(255,255,255,0.07);">
			<div
				style="
                display:flex;align-items:center;gap:8px;
                height:100%;padding:0 16px;width:240px;
            "
			>
				<svg
					style="width:13px;height:13px;color:var(--d2-text-muted);flex-shrink:0;"
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
				<input
					bind:this={inputEl}
					bind:value={searchVal}
					oninput={onInput}
					onkeydown={onKeydown}
					onblur={onBlur}
					placeholder="Search Guardian…"
					style="
                        flex:1; background:transparent; border:none; outline:none;
                        font-family:var(--font-family-display);
                        font-size:0.78rem; letter-spacing:0.04em;
                        color:var(--d2-text-primary);
                        min-width:0;
                    "
				/>
				{#if loading}
					<div
						style="width:11px;height:11px;border:1.5px solid rgba(255,255,255,0.15);border-top-color:var(--gambit-green);border-radius:50%;animation:spin 0.7s linear infinite;flex-shrink:0;"
					></div>
				{/if}
			</div>

			{#if suggestions.length}
				<div
					style="
                    position:absolute;top:100%;right:0;width:300px;z-index:100;
                    background:rgba(6,8,10,0.98);
                    border:1px solid rgba(255,255,255,0.10);
                    border-top:2px solid var(--gambit-green);
                    box-shadow:0 16px 48px rgba(0,0,0,0.8);
                    overflow:hidden;
                    clip-path:polygon(0 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%);
                "
				>
					{#each suggestions as s, i}
						<button
							onmousedown={() => navigate(s)}
							style="
                                width:100%;display:flex;align-items:center;gap:10px;
                                padding:10px 14px;text-align:left;
                                background:{i === selIdx ? 'rgba(61,174,119,0.08)' : 'transparent'};
                                border:none;border-bottom:1px solid rgba(255,255,255,0.05);
                                cursor:pointer;transition:background 0.1s;
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
									style="width:30px;height:30px;object-fit:cover;flex-shrink:0;"
								/>
							{:else}
								<div
									style="width:30px;height:30px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.10);flex-shrink:0;transform:rotate(45deg);display:flex;align-items:center;justify-content:center;"
								>
									<span style="transform:rotate(-45deg);font-size:10px;color:var(--d2-text-muted);"
										>?</span
									>
								</div>
							{/if}
							<span
								style="font-family:var(--font-family-display);font-size:0.82rem;font-weight:500;color:var(--d2-text-primary);flex:1;text-align:left;letter-spacing:0.03em;"
							>
								{s.name}<span style="color:var(--d2-text-muted);">#{s.code}</span>
							</span>
							<svg
								style="width:10px;height:10px;color:var(--d2-text-muted);flex-shrink:0;"
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
		</div>
	{:else}
		<button
			onclick={openSearch}
			style="
                    height:100%;padding:0 16px;
                    border:none;border-left:1px solid rgba(255,255,255,0.07);
                    background:transparent;cursor:pointer;
                    color:var(--d2-text-muted);
                    transition:color 0.15s,background 0.15s;
                "
			title="Search Guardian"
			onmouseenter={(e) => {
				e.currentTarget.style.color = 'var(--d2-text-secondary)';
				e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
			}}
			onmouseleave={(e) => {
				e.currentTarget.style.color = 'var(--d2-text-muted)';
				e.currentTarget.style.background = 'transparent';
			}}
		>
			<svg style="width:15px;height:15px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
				/>
			</svg>
		</button>
	{/if}

	<!-- Auth -->
	<div
		style="display:flex;align-items:stretch;border-left:1px solid rgba(255,255,255,0.07);flex-shrink:0;"
	>
		{#if user}
			<a
				href="/profile/{encodeURIComponent(user.bungieName)}/{user.bungieCode}"
				style="
		font-family:var(--font-family-display);
		font-size:0.72rem;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;
		color:var(--d2-text-muted);padding:0 14px;
		display:flex;align-items:center;
		text-decoration:none;transition:color 0.15s,background 0.15s;
		border-right: 1px solid rgba(255,255,255,0.07);
		"
				onmouseenter={(e) => {
					e.currentTarget.style.color = 'var(--d2-text-primary)';
					e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
				}}
				onmouseleave={(e) => {
					e.currentTarget.style.color = 'var(--d2-text-muted)';
					e.currentTarget.style.background = 'transparent';
				}}
			>
				{user.displayName}
			</a>
			<a
				href="/auth/logout"
				style="
                display:flex;align-items:center;padding:0 14px;
                font-family:var(--font-family-display);
                font-size:0.68rem;font-weight:600;letter-spacing:0.10em;text-transform:uppercase;
                color:var(--d2-text-muted);text-decoration:none;
                border-left:1px solid rgba(255,255,255,0.07);
                transition:color 0.15s,background 0.15s;
            "
				onmouseenter={(e) => {
					e.currentTarget.style.color = 'var(--d2-text-primary)';
					e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
				}}
				onmouseleave={(e) => {
					e.currentTarget.style.color = 'var(--d2-text-muted)';
					e.currentTarget.style.background = 'transparent';
				}}
			>
				Sign Out
			</a>
		{:else}
			<a
				href="/auth/login?returnTo={encodeURIComponent(active)}"
				style="
                display:flex;align-items:center;padding:0 20px;
                font-family:var(--font-family-display);
                font-size:0.72rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;
                color:var(--gambit-green);text-decoration:none;
                transition:color 0.15s,background 0.15s;
            "
				onmouseenter={(e) => {
					e.currentTarget.style.background = 'rgba(61,174,119,0.08)';
				}}
				onmouseleave={(e) => {
					e.currentTarget.style.background = 'transparent';
				}}
			>
				Sign In
			</a>
		{/if}
	</div>
</nav>

<style>
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
