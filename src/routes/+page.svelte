<script>
    import { goto } from '$app/navigation';

    let name        = $state('');
    let error       = $state('');
    let suggestions = $state([]);
    let loading     = $state(false);
    let selIdx      = $state(-1);
    let debounce    = null;

    function onInput() {
        error  = '';
        selIdx = -1;
        clearTimeout(debounce);
        const q = name.trim();
        if (q.length < 2) { suggestions = []; loading = false; return; }
        loading = true;
        debounce = setTimeout(async () => {
            try {
                const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
                suggestions = await res.json();
            } catch { suggestions = []; }
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

    function onBlur() { setTimeout(() => { suggestions = []; }, 180); }

    const features = [
        { label: 'EGO Scoring',      desc: 'Advanced performance algorithm' },
        { label: 'Match History',    desc: 'Every PGCR analyzed'            },
        { label: 'Loadout Analysis', desc: 'Weapons · Subclass · Stats'     },
        { label: 'Career Stats',     desc: 'Maps · Weapons · Synergy'       },
        { label: 'Invasion Intel',   desc: 'Kills · Denies · Efficiency'    },
    ];
</script>

<!-- ── Hero ────────────────────────────────────────────────────────────────── -->
<main style="
    min-height: calc(100vh - 48px);
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 5rem 1.5rem;
    position: relative; overflow: hidden;
    font-family: var(--font-family-display);
">

    <!-- Subtle grid -->
    <div style="
        position: absolute; inset: 0; pointer-events: none;
        background-image:
            linear-gradient(rgba(61,174,119,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(61,174,119,0.04) 1px, transparent 1px);
        background-size: 64px 64px;
    "></div>

    <!-- Corner marks (Destiny UI language) -->
    <div style="position:absolute;top:32px;left:32px;width:20px;height:20px;border-top:1px solid var(--gambit-green);border-left:1px solid var(--gambit-green);opacity:0.4;pointer-events:none;"></div>
    <div style="position:absolute;top:32px;right:32px;width:20px;height:20px;border-top:1px solid var(--gambit-green);border-right:1px solid var(--gambit-green);opacity:0.4;pointer-events:none;"></div>
    <div style="position:absolute;bottom:32px;left:32px;width:20px;height:20px;border-bottom:1px solid rgba(255,255,255,0.12);border-left:1px solid rgba(255,255,255,0.12);pointer-events:none;"></div>
    <div style="position:absolute;bottom:32px;right:32px;width:20px;height:20px;border-bottom:1px solid rgba(255,255,255,0.12);border-right:1px solid rgba(255,255,255,0.12);pointer-events:none;"></div>

    <!-- Hero content -->
    <div style="position:relative;text-align:center;margin-bottom:3rem;">

        <!-- Eyebrow -->
        <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:1.25rem;">
            <div style="height:1px;width:48px;background:linear-gradient(to right,transparent,var(--gambit-green));opacity:0.6;"></div>
            <span style="
                font-size:0.65rem;font-weight:700;
                letter-spacing:0.20em;text-transform:uppercase;
                color:var(--gambit-green);
            ">Gambit Intelligence Platform</span>
            <div style="height:1px;width:48px;background:linear-gradient(to left,transparent,var(--gambit-green));opacity:0.6;"></div>
        </div>

        <!-- Main title — Destiny-style condensed bold, NO italic serif -->
        <h1 style="
            font-family:var(--font-family-display);
            font-size:clamp(3.5rem,10vw,6rem);
            font-weight:700;
            letter-spacing:0.12em;
            text-transform:uppercase;
            color:var(--d2-text-primary);
            line-height:0.9;
            margin:0 0 1rem;
        ">Jadestone</h1>

        <!-- Gambit green accent line -->
        <div style="height:2px;width:80px;background:linear-gradient(90deg,transparent,var(--gambit-green),transparent);margin:0 auto 1.25rem;"></div>

        <p style="
            font-family:var(--font-family-sans);
            font-size:0.88rem;
            color:var(--d2-text-muted);
            max-width:360px;
            margin:0 auto;
            line-height:1.6;
            letter-spacing:0.02em;
        ">Career statistics, match history &amp; EGO performance data for Destiny 2 Gambit</p>
    </div>

    <!-- ── Search panel ── -->
    <div style="position:relative;width:100%;max-width:440px;">

        <!-- Panel with top notch + gambit border -->
        <div style="
            background:rgba(6,8,12,0.90);
            border:1px solid rgba(255,255,255,0.12);
            border-top:2px solid var(--gambit-green);
            clip-path:polygon(10px 0%,100% 0%,100% 100%,0% 100%,0% 10px);
            backdrop-filter:blur(16px);
            box-shadow:0 0 40px rgba(0,0,0,0.6), 0 0 20px rgba(61,174,119,0.05);
        ">
            <div style="display:flex;align-items:stretch;">
                <!-- Search icon -->
                <div style="padding:0 12px 0 16px;display:flex;align-items:center;color:var(--d2-text-muted);flex-shrink:0;">
                    <svg style="width:14px;height:14px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
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
                        padding:1rem 8px;
                        font-family:var(--font-family-display);
                        font-size:0.80rem; font-weight:500;
                        letter-spacing:0.08em;
                        color:var(--d2-text-primary);
                        min-width:0;
                    "
                />

                {#if loading}
                    <div style="margin-right:12px;display:flex;align-items:center;">
                        <div style="width:12px;height:12px;border:1.5px solid rgba(255,255,255,0.15);border-top-color:var(--gambit-green);border-radius:50%;animation:spin 0.7s linear infinite;"></div>
                    </div>
                {/if}

                <!-- Search button -->
                <button onclick={search} style="
                    padding:0 20px;
                    background:rgba(61,174,119,0.12);
                    border:none;border-left:1px solid rgba(255,255,255,0.08);
                    font-family:var(--font-family-display);
                    font-size:0.68rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;
                    color:var(--gambit-green);
                    cursor:pointer;
                    transition:background 0.15s,color 0.15s;
                    flex-shrink:0;
                "
                onmouseenter={e => { e.currentTarget.style.background='rgba(61,174,119,0.22)'; e.currentTarget.style.color='#6de8b0'; }}
                onmouseleave={e => { e.currentTarget.style.background='rgba(61,174,119,0.12)'; e.currentTarget.style.color='var(--gambit-green)'; }}>
                    Search
                </button>
            </div>
        </div>

        <!-- Error -->
        {#if error}
            <p style="font-size:0.72rem;color:#f87171;margin-top:8px;margin-left:4px;font-family:var(--font-family-display);letter-spacing:0.05em;">{error}</p>
        {/if}

        <!-- Suggestions dropdown -->
        {#if suggestions.length}
            <div style="
                position:absolute;top:100%;left:0;right:0;z-index:50;margin-top:2px;
                background:rgba(6,8,12,0.98);
                border:1px solid rgba(255,255,255,0.10);
                border-top:2px solid var(--gambit-green);
                box-shadow:0 16px 48px rgba(0,0,0,0.8);
                overflow:hidden;
                clip-path:polygon(0 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%);
            ">
                {#each suggestions as s, i}
                    <button
                        onmousedown={() => navigate(s)}
                        style="
                            width:100%;display:flex;align-items:center;gap:10px;
                            padding:10px 16px;text-align:left;
                            background:{i === selIdx ? 'rgba(61,174,119,0.08)' : 'transparent'};
                            border:none;border-bottom:1px solid rgba(255,255,255,0.05);
                            cursor:pointer;
                        "
                        onmouseenter={e => { if (i!==selIdx) e.currentTarget.style.background='rgba(255,255,255,0.04)'; }}
                        onmouseleave={e => { if (i!==selIdx) e.currentTarget.style.background='transparent'; }}>
                        {#if s.iconPath}
                            <img src="https://www.bungie.net{s.iconPath}" alt="" style="width:32px;height:32px;object-fit:cover;flex-shrink:0;" />
                        {:else}
                            <div style="width:32px;height:32px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.10);flex-shrink:0;transform:rotate(45deg);"></div>
                        {/if}
                        <span style="font-family:var(--font-family-display);font-size:0.85rem;font-weight:500;letter-spacing:0.04em;color:var(--d2-text-primary);flex:1;text-align:left;">
                            {s.name}<span style="color:var(--d2-text-muted);">#{s.code}</span>
                        </span>
                        <svg style="width:10px;height:10px;color:var(--d2-text-muted);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                        </svg>
                    </button>
                {/each}
            </div>
        {/if}
    </div>

    <!-- Hint -->
    <p style="
        margin-top:12px;
        font-size:0.65rem;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;
        color:rgba(255,255,255,0.18);
    ">Type to search · name#code to navigate directly</p>

    <!-- ── Feature grid ── -->
    <div style="
        position:relative;margin-top:4rem;
        display:flex;flex-wrap:wrap;justify-content:center;gap:8px;
        max-width:560px;
    ">
        {#each features as feat, i}
            <div class="anim-in" style="
                animation-delay:{i*0.06}s;
                padding:8px 16px;
                background:rgba(255,255,255,0.03);
                border:1px solid rgba(255,255,255,0.08);
                border-left:2px solid rgba(61,174,119,0.30);
                clip-path:polygon(6px 0%,100% 0%,100% 100%,0% 100%,0% 6px);
                display:flex;flex-direction:column;gap:2px;
            ">
                <span style="
                    font-size:0.70rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;
                    color:var(--d2-text-secondary);
                ">{feat.label}</span>
                <span style="
                    font-size:0.60rem;font-weight:400;letter-spacing:0.06em;
                    color:var(--d2-text-muted);font-family:var(--font-family-sans);
                ">{feat.desc}</span>
            </div>
        {/each}
    </div>

</main>

<style>
@keyframes spin { to { transform: rotate(360deg); } }
</style>
