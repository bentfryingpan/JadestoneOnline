<script>
    let { data } = $props();

    function timeAgo(iso) {
        if (!iso) return '';
        const diff = Date.now() - new Date(iso).getTime();
        const m = Math.floor(diff / 60000);
        if (m < 60)    return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24)    return `${h}h ago`;
        return `${Math.floor(h / 24)}d ago`;
    }
    function fmtDuration(s) {
        if (!s) return '—';
        return `${Math.floor(s / 60)}m ${s % 60}s`;
    }
    function fmtNum(n) {
        if (n === null || n === undefined) return '—';
        if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
        if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
        return String(Math.round(n));
    }
    function teamTotal(players, key) {
        return players.reduce((sum, p) => sum + (p.stats[key] ?? 0), 0);
    }
    function teamAvgEgo(players) {
        const done = players.filter(p => p.ego);
        if (!done.length) return 0;
        return done.reduce((s, p) => s + p.ego.finalScore, 0) / done.length;
    }

    const roleLabel = { carry: 'Hard Carry', carried: 'Carried', solid: '' };
    const roleColor = { carry: 'text-amber-400', carried: 'text-red-400', solid: '' };

    // Score color thresholds (from desktop app)
    function egoColor(score) {
        if (!score) return 'text-zinc-600';
        if (score >= 110) return 'text-purple-400';
        if (score >= 80)  return 'text-emerald-400';
        if (score >= 50)  return 'text-zinc-200';
        return 'text-red-400';
    }
    function pemColor(pem) {
        if (!pem) return 'text-zinc-600';
        return pem >= 1.0 ? 'text-emerald-400' : 'text-red-400';
    }
    function tierBorder(tier) {
        if (tier === 6) return 'border-amber-500/60';
        if (tier === 5) return 'border-violet-500/50';
        return 'border-zinc-700/60';
    }

    let expandedPlayer = $state(null);
    function togglePlayer(id) { expandedPlayer = expandedPlayer === id ? null : id; }

    // Component breakdown labels and colors
    const COMP_COLORS = {
        PvE:     'bg-sky-500',
        PvP:     'bg-violet-500',
        Banking: 'bg-emerald-500',
        Medals:  'bg-amber-500',
    };

    const DETAIL_STATS = [
        { key: 'kills',             label: 'Kills',             color: 'text-zinc-200'  },
        { key: 'deaths',            label: 'Deaths',            color: 'text-red-400'   },
        { key: 'assists',           label: 'Assists',           color: 'text-zinc-400'  },
        { key: 'motesPickedUp',     label: 'Motes Picked',      color: 'text-amber-400' },
        { key: 'motesDeposited',    label: 'Motes Banked',      color: 'text-emerald-400'},
        { key: 'motesDenied',       label: 'Motes Denied',      color: 'text-violet-400'},
        { key: 'motesLost',         label: 'Motes Lost',        color: 'text-red-400'   },
        { key: 'invasions',         label: 'Invasions',         color: 'text-violet-300'},
        { key: 'invasionKills',     label: 'Invasion Kills',    color: 'text-violet-400'},
        { key: 'invasionsDefeated', label: 'Invaders Killed',   color: 'text-cyan-400'  },
        { key: 'primevalDamage',    label: 'Primeval Damage',   color: 'text-orange-400'},
        { key: 'primevalHealing',   label: 'Primeval Healed',   color: 'text-green-400' },
        { key: 'superKills',        label: 'Super Kills',       color: 'text-amber-300' },
        { key: 'grenadeKills',      label: 'Grenade Kills',     color: 'text-zinc-400'  },
        { key: 'meleeKills',        label: 'Melee Kills',       color: 'text-zinc-400'  },
        { key: 'rechargeableAbilityKills', label: 'Ability Kills', color: 'text-zinc-400' },
        { key: 'smallBlooms',       label: 'Small Blockers',    color: 'text-zinc-400'  },
        { key: 'largeBlooms',       label: 'Large Blockers',    color: 'text-zinc-300'  },
    ];
</script>

<svelte:head>
    <title>Match {data.instanceId} · Jadestone</title>
</svelte:head>

<div style="min-height:100vh;color:#fff;">

    <!-- ── Hero banner ──────────────────────────────────────────────────────── -->
    <div style="position:relative;overflow:hidden;border-bottom:1px solid rgba(255,255,255,0.07);">
        {#if data.pgcrImage}
            <img src={data.pgcrImage} alt={data.mapName}
                 style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0.18;" />
            <div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent,rgba(10,10,10,0.70),#0a0a0a);"></div>
        {/if}
        <div style="position:relative;max-width:72rem;margin:0 auto;padding:2.5rem 1.5rem;">
            <a href="/" style="font-family:var(--font-family-display);font-size:0.68rem;font-weight:600;letter-spacing:0.10em;text-transform:uppercase;color:var(--d2-text-muted);text-decoration:none;display:inline-block;margin-bottom:1rem;transition:color 0.15s;"
               onmouseenter={e=>e.currentTarget.style.color='var(--d2-text-secondary)'}
               onmouseleave={e=>e.currentTarget.style.color='var(--d2-text-muted)'}>
                ← Back
            </a>
            <div style="display:flex;align-items:flex-end;gap:1.5rem;margin-top:0.5rem;">
                {#if data.mapIcon}
                    <img src={data.mapIcon} alt={data.mapName}
                         style="width:64px;height:64px;border:1px solid rgba(61,174,119,0.3);object-fit:cover;flex-shrink:0;" />
                {/if}
                <div>
                    <span style="font-family:var(--font-family-display);font-size:0.65rem;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:var(--gambit-green);display:block;margin-bottom:0.35rem;">Gambit Match</span>
                    <h1 style="font-family:var(--font-family-display);font-size:clamp(1.8rem,5vw,2.8rem);font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--d2-text-primary);line-height:1;margin:0;">{data.mapName}</h1>
                    <div style="height:2px;width:64px;background:linear-gradient(90deg,var(--gambit-green),transparent);margin:0.6rem 0 0.5rem;"></div>
                    <div style="display:flex;align-items:center;gap:1rem;font-family:var(--font-family-display);font-size:0.72rem;font-weight:500;letter-spacing:0.06em;color:var(--d2-text-muted);">
                        <span>{timeAgo(data.period)}</span>
                        <span style="color:rgba(255,255,255,0.15);">·</span>
                        <span>{fmtDuration(data.duration)}</span>
                        <span style="color:rgba(255,255,255,0.15);">·</span>
                        <span style="font-family:var(--font-family-mono);font-size:0.62rem;color:rgba(255,255,255,0.18);">{data.instanceId}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div style="max-width:72rem;margin:0 auto;padding:2rem 1.5rem;display:flex;flex-direction:column;gap:2rem;">

        <!-- ── Score banner ─────────────────────────────────────────────────── -->
        <div style="
            display:grid;grid-template-columns:1fr auto 1fr;gap:1rem;align-items:center;
            background:rgba(6,8,12,0.85);border:1px solid rgba(255,255,255,0.08);
            border-top:2px solid rgba(61,174,119,0.5);
            padding:1.25rem 1.5rem;
            clip-path:polygon(10px 0%,100% 0%,100% 100%,0% 100%,0% 10px);
            font-family:var(--font-family-display);
        ">
            <!-- Alpha -->
            <div style="text-align:center;">
                <p style="font-size:1.5rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:{data.teamAWon ? 'var(--gambit-green)' : '#e05050'};margin:0 0 0.2rem;">
                    {data.teamAWon ? 'Victory' : 'Defeat'}
                </p>
                <p style="font-size:0.62rem;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:var(--d2-text-muted);margin:0 0 0.5rem;">Team Alpha</p>
                <div style="display:flex;justify-content:center;gap:0.75rem;font-size:0.75rem;color:var(--d2-text-secondary);">
                    <span>{teamTotal(data.teamA, 'motesDeposited')} motes</span>
                    <span style="color:rgba(255,255,255,0.2);">·</span>
                    <span>{teamTotal(data.teamA, 'kills')}K/{teamTotal(data.teamA, 'deaths')}D</span>
                </div>
                <p style="font-size:0.70rem;color:var(--d2-text-muted);margin-top:0.3rem;">
                    Avg EGO: <span style="font-weight:700;color:{egoColor(teamAvgEgo(data.teamA)).replace('text-','').replace('-400','').replace('emerald','#34d399').replace('purple','#c084fc').replace('red','#f87171').replace('zinc-200','#e4e4e7').replace('zinc-600','#52525b')}">{teamAvgEgo(data.teamA).toFixed(1)}</span>
                </p>
            </div>

            <!-- VS -->
            <div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:0 1rem;">
                <div style="width:1px;height:28px;background:rgba(255,255,255,0.10);"></div>
                <span style="font-size:0.62rem;font-weight:800;letter-spacing:0.18em;color:rgba(255,255,255,0.20);">VS</span>
                <div style="width:1px;height:28px;background:rgba(255,255,255,0.10);"></div>
            </div>

            <!-- Bravo -->
            <div style="text-align:center;">
                <p style="font-size:1.5rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:{data.teamBWon ? 'var(--gambit-green)' : '#e05050'};margin:0 0 0.2rem;">
                    {data.teamBWon ? 'Victory' : 'Defeat'}
                </p>
                <p style="font-size:0.62rem;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:var(--d2-text-muted);margin:0 0 0.5rem;">Team Bravo</p>
                <div style="display:flex;justify-content:center;gap:0.75rem;font-size:0.75rem;color:var(--d2-text-secondary);">
                    <span>{teamTotal(data.teamB, 'motesDeposited')} motes</span>
                    <span style="color:rgba(255,255,255,0.2);">·</span>
                    <span>{teamTotal(data.teamB, 'kills')}K/{teamTotal(data.teamB, 'deaths')}D</span>
                </div>
                <p style="font-size:0.70rem;color:var(--d2-text-muted);margin-top:0.3rem;">
                    Avg EGO: <span style="font-weight:700;">{teamAvgEgo(data.teamB).toFixed(1)}</span>
                </p>
            </div>
        </div>

        <!-- ── Two-column team layout ────────────────────────────────────────── -->
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:1.5rem;">
            {#each [
                { players: data.teamA, won: data.teamAWon, label: 'Alpha' },
                { players: data.teamB, won: data.teamBWon, label: 'Bravo' }
            ] as team}
                <div style="display:flex;flex-direction:column;gap:0;">
                    <!-- Team header -->
                    <div style="
                        display:flex;align-items:center;gap:0;
                        background:{team.won ? 'rgba(61,174,119,0.10)' : 'rgba(180,40,40,0.08)'};
                        border:1px solid {team.won ? 'rgba(61,174,119,0.25)' : 'rgba(180,40,40,0.20)'};
                        border-left:3px solid {team.won ? 'var(--gambit-green)' : '#c0392b'};
                        padding:0.5rem 1rem;
                        margin-bottom:2px;
                        clip-path:polygon(8px 0%,100% 0%,100% 100%,0% 100%,0% 8px);
                    ">
                        <span style="font-family:var(--font-family-display);font-size:0.70rem;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:{team.won ? 'var(--gambit-green)' : '#e05050'};flex:1;">
                            Team {team.label}
                        </span>
                        <span style="font-family:var(--font-family-display);font-size:0.60rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:{team.won ? 'var(--gambit-green)' : '#e05050'};opacity:0.8;">
                            {team.won ? 'Round Won' : 'Round Lost'}
                        </span>
                    </div>

                    {#each team.players as player}
                        {@const uid = `${player.membershipId}-${player.name}`}
                        {@const isExpanded = expandedPlayer === uid}

                        <div style="
                            overflow:hidden;
                            border:1px solid {player.role==='carry' ? 'rgba(206,174,51,0.25)' : team.won ? 'rgba(61,174,119,0.12)' : 'rgba(255,255,255,0.06)'};
                            border-left:2px solid {player.role==='carry' ? 'var(--rarity-exotic)' : team.won ? 'rgba(61,174,119,0.25)' : 'rgba(180,40,40,0.20)'};
                            background:{player.role==='carry' ? 'rgba(206,174,51,0.03)' : team.won ? 'rgba(61,174,119,0.04)' : 'rgba(180,40,40,0.03)'};
                            margin-bottom:2px;
                            transition:background 0.15s;
                        ">
                            <!-- Main row -->
                            <button style="
                                width:100%;text-align:left;
                                padding:0.55rem 0.875rem;
                                display:flex;align-items:center;gap:0.625rem;
                                background:transparent;border:none;cursor:pointer;
                                transition:background 0.12s;
                            "
                            onclick={() => togglePlayer(uid)}
                            onmouseenter={e=>e.currentTarget.style.background='rgba(255,255,255,0.03)'}
                            onmouseleave={e=>e.currentTarget.style.background='transparent'}>

                                <!-- Emblem -->
                                <div style="position:relative;flex-shrink:0;">
                                    {#if player.icon}
                                        <img src={player.icon} alt={player.name}
                                             style="width:38px;height:38px;border:1px solid rgba(255,255,255,0.12);object-fit:cover;" />
                                    {:else}
                                        <div style="width:38px;height:38px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.10);display:flex;align-items:center;justify-content:center;font-size:1rem;">
                                            {player.className === 'Titan' ? '🛡️' : player.className === 'Hunter' ? '🏹' : player.className === 'Warlock' ? '📿' : '👤'}
                                        </div>
                                    {/if}
                                    {#if !player.completed}
                                        <span style="position:absolute;top:-4px;right:-4px;font-family:var(--font-family-display);font-size:7px;font-weight:800;background:rgba(0,0,0,0.9);color:var(--d2-text-muted);padding:1px 2px;border:1px solid rgba(255,255,255,0.15);">DNF</span>
                                    {/if}
                                    {#if player.role === 'carry'}
                                        <span style="position:absolute;bottom:-4px;right:-4px;font-size:8px;background:var(--rarity-exotic);color:#000;padding:1px 2px;font-weight:900;line-height:1;">★</span>
                                    {/if}
                                </div>

                                <!-- Name + class -->
                                <div style="flex:1;min-width:0;">
                                    {#if player.code && player.membershipId}
                                        <a href="/profile/{encodeURIComponent(player.name)}/{player.code}?mid={player.membershipId}&mt={player.membershipType}"
                                           onclick={(e) => e.stopPropagation()}
                                           style="font-family:var(--font-family-display);font-size:0.82rem;font-weight:700;letter-spacing:0.03em;color:var(--d2-text-primary);text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;transition:color 0.15s;"
                                           onmouseenter={e=>e.currentTarget.style.color='var(--gambit-green)'}
                                           onmouseleave={e=>e.currentTarget.style.color='var(--d2-text-primary)'}>
                                            {player.name}<span style="color:var(--d2-text-muted);font-size:0.72rem;font-weight:400;">#{player.code}</span>
                                        </a>
                                    {:else}
                                        <span style="font-family:var(--font-family-display);font-size:0.82rem;font-weight:600;color:var(--d2-text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;">{player.name}</span>
                                    {/if}
                                    <div style="display:flex;align-items:center;gap:6px;margin-top:2px;">
                                        <p style="font-family:var(--font-family-display);font-size:0.60rem;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:var(--d2-text-muted);">{player.className}</p>
                                        {#if player.role === 'carry'}
                                            <span style="font-family:var(--font-family-display);font-size:0.55rem;font-weight:800;letter-spacing:0.12em;color:var(--rarity-exotic);border:1px solid rgba(206,174,51,0.4);padding:1px 4px;">CARRY</span>
                                        {:else if player.role === 'carried'}
                                            <span style="font-family:var(--font-family-display);font-size:0.55rem;font-weight:800;letter-spacing:0.12em;color:#e05050;border:1px solid rgba(224,80,80,0.35);padding:1px 4px;">CARRIED</span>
                                        {/if}
                                    </div>
                                </div>

                                <!-- EGO Score badge -->
                                <div style="flex-shrink:0;text-align:right;margin-right:8px;padding-right:10px;border-right:1px solid rgba(255,255,255,0.08);">
                                    {#if player.ego}
                                        <p class="ego-badge__score {egoColor(player.ego.finalScore)}" style="font-family:var(--font-family-display);font-size:1.1rem;font-weight:800;line-height:1;letter-spacing:-0.01em;">
                                            {player.ego.finalScore}
                                        </p>
                                        <p style="font-family:var(--font-family-display);font-size:0.55rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.25);margin-top:1px;">EGO</p>
                                    {:else}
                                        <p style="font-family:var(--font-family-mono);font-size:0.9rem;color:rgba(255,255,255,0.18);">—</p>
                                        <p style="font-family:var(--font-family-display);font-size:0.55rem;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.18);">EGO</p>
                                    {/if}
                                </div>

                                <!-- KDA -->
                                <div style="flex-shrink:0;text-align:right;margin-right:8px;">
                                    <p style="font-family:var(--font-family-display);font-size:0.85rem;font-weight:700;color:var(--d2-text-primary);letter-spacing:0.02em;">{player.k}/{player.d}/{player.a}</p>
                                    <p style="font-family:var(--font-family-display);font-size:0.62rem;font-weight:500;color:var(--d2-text-muted);">{player.kd} KD</p>
                                </div>

                                <!-- Motes banked -->
                                <div style="flex-shrink:0;text-align:center;min-width:2.5rem;border-left:1px solid rgba(255,255,255,0.08);padding-left:8px;">
                                    <p style="font-family:var(--font-family-display);font-size:0.88rem;font-weight:800;color:{(player.stats.motesDeposited??0)>=15?'var(--gambit-green)':'var(--d2-text-secondary)'};letter-spacing:0.02em;">
                                        {player.stats.motesDeposited ?? 0}
                                    </p>
                                    <p style="font-family:var(--font-family-display);font-size:0.55rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.25);">MB</p>
                                </div>

                                <!-- Invasions -->
                                {#if (player.stats.invasions ?? 0) > 0}
                                    <div style="flex-shrink:0;text-align:center;min-width:2rem;padding-left:6px;">
                                        <p style="font-family:var(--font-family-display);font-size:0.88rem;font-weight:800;color:var(--dmg-void);letter-spacing:0.02em;">{player.stats.invasions}</p>
                                        <p style="font-family:var(--font-family-display);font-size:0.55rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.25);">INV</p>
                                    </div>
                                {/if}

                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                                     style="width:14px;height:14px;color:rgba(255,255,255,0.25);flex-shrink:0;transition:transform 0.2s;transform:{isExpanded?'rotate(180deg)':'rotate(0)'};margin-left:2px;">
                                    <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd"/>
                                </svg>
                            </button>

                            <!-- ── Expanded detail panel ──────────────────────── -->
                            {#if isExpanded}
                                <div style="border-top:1px solid rgba(255,255,255,0.07);background:rgba(0,0,0,0.25);">

                                    {#if player.ego}
                                        <!-- EGO breakdown -->
                                        <div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid rgba(255,255,255,0.07);">
                                            <!-- Left: score + PEM -->
                                            <div style="padding:0.875rem 1rem;border-right:1px solid rgba(255,255,255,0.07);">
                                                <div style="display:flex;align-items:baseline;gap:0.5rem;margin-bottom:0.25rem;">
                                                    <span style="font-family:var(--font-family-display);font-size:1.5rem;font-weight:800;line-height:1;color:{player.ego.finalScore>=110?'#c084fc':player.ego.finalScore>=80?'var(--gambit-green)':player.ego.finalScore>=50?'var(--d2-text-primary)':'#f87171'};">
                                                        {player.ego.finalScore}
                                                    </span>
                                                    <span style="font-family:var(--font-family-display);font-size:0.60rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.30);">EGO Rating</span>
                                                </div>
                                                <div style="display:flex;align-items:baseline;gap:0.25rem;margin-bottom:0.5rem;">
                                                    <span style="font-family:var(--font-family-mono);font-size:0.78rem;color:var(--d2-text-muted);">{player.ego.basePps}</span>
                                                    <span style="font-family:var(--font-family-display);font-size:0.60rem;color:rgba(255,255,255,0.22);">Base ×</span>
                                                    <span style="font-family:var(--font-family-mono);font-size:0.78rem;font-weight:700;color:{player.ego.pem>=1?'var(--gambit-green)':'#f87171'};">{player.ego.pem}x</span>
                                                    <span style="font-family:var(--font-family-display);font-size:0.60rem;color:rgba(255,255,255,0.22);">PEM</span>
                                                </div>
                                                <!-- PEM bar -->
                                                <div style="display:flex;align-items:center;gap:0.5rem;">
                                                    <div style="flex:1;height:3px;background:rgba(255,255,255,0.08);position:relative;overflow:visible;">
                                                        <div style="height:100%;background:{player.ego.pem>=1?'var(--gambit-green)':'#f87171'};width:{Math.min(100,((player.ego.pem-0.7)/0.7)*100)}%;transition:width 0.6s;"></div>
                                                        <div style="position:absolute;top:-2px;bottom:-2px;width:1px;background:rgba(255,255,255,0.35);left:{((1.0-0.7)/0.7)*100}%;"></div>
                                                    </div>
                                                    <span style="font-family:var(--font-family-mono);font-size:0.60rem;color:rgba(255,255,255,0.25);white-space:nowrap;">{player.ego.moteEff}% ME</span>
                                                </div>
                                            </div>
                                            <!-- Right: component bars -->
                                            <div style="padding:0.875rem 1rem;display:flex;flex-direction:column;gap:0.35rem;justify-content:center;">
                                                {#each Object.entries(player.ego.components) as [comp, val]}
                                                    {@const maxComp = Math.max(...Object.values(player.ego.components), 1)}
                                                    <div style="display:flex;align-items:center;gap:0.5rem;">
                                                        <span style="font-family:var(--font-family-display);font-size:0.58rem;font-weight:700;letter-spacing:0.10em;text-transform:uppercase;color:rgba(255,255,255,0.30);width:3rem;flex-shrink:0;">{comp}</span>
                                                        <div style="flex:1;height:4px;background:rgba(255,255,255,0.06);overflow:hidden;">
                                                            <div style="height:100%;width:{Math.max(0,(val/maxComp)*100)}%;background:{comp==='PvE'?'#38bdf8':comp==='PvP'?'#a78bfa':comp==='Banking'?'var(--gambit-green)':'var(--rarity-exotic)'};transition:width 0.6s;"></div>
                                                        </div>
                                                        <span style="font-family:var(--font-family-mono);font-size:0.65rem;color:var(--d2-text-muted);width:1.75rem;text-align:right;flex-shrink:0;">{val}</span>
                                                    </div>
                                                {/each}
                                            </div>
                                        </div>
                                    {/if}

                                    <!-- Weapons used -->
                                    {#if player.weapons?.length}
                                        <div style="padding:0.75rem 1rem;border-bottom:1px solid rgba(255,255,255,0.07);">
                                            <span style="font-family:var(--font-family-display);font-size:0.60rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.30);display:block;margin-bottom:0.5rem;">Weapons Used</span>
                                            <div style="display:flex;flex-wrap:wrap;gap:0.75rem;">
                                                {#each player.weapons as w}
                                                    <div style="display:flex;align-items:center;gap:0.5rem;">
                                                        {#if w.icon}
                                                            <div style="width:34px;height:34px;flex-shrink:0;border:1px solid rgba(255,255,255,{w.tier>=6?'0.35':w.tier>=5?'0.25':'0.12'});overflow:hidden;">
                                                                <img src={w.icon} alt={w.name} style="width:100%;height:100%;object-fit:cover;" />
                                                            </div>
                                                        {/if}
                                                        <div>
                                                            <p style="font-family:var(--font-family-display);font-size:0.75rem;font-weight:600;color:var(--d2-text-primary);line-height:1.2;">{w.name}</p>
                                                            <p style="font-family:var(--font-family-mono);font-size:0.62rem;color:var(--d2-text-muted);margin-top:1px;">
                                                                {w.kills}K{#if w.precision > 0}<span style="color:rgba(255,255,255,0.20);"> · {w.precision} prec</span>{/if}
                                                            </p>
                                                        </div>
                                                    </div>
                                                {/each}
                                            </div>
                                        </div>
                                    {/if}

                                    <!-- Medals earned -->
                                    {#if player.medalList?.length}
                                        <div style="padding:0.75rem 1rem;border-bottom:1px solid rgba(255,255,255,0.07);">
                                            <span style="font-family:var(--font-family-display);font-size:0.60rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.30);display:block;margin-bottom:0.5rem;">Medals</span>
                                            <div style="display:flex;flex-wrap:wrap;gap:0.375rem;">
                                                {#each player.medalList as medal}
                                                    <div style="display:flex;align-items:center;gap:0.25rem;border:1px solid rgba(206,174,51,0.25);background:rgba(206,174,51,0.05);padding:2px 8px;">
                                                        <span style="color:var(--rarity-exotic);font-size:0.60rem;">★</span>
                                                        <span style="font-family:var(--font-family-display);font-size:0.65rem;font-weight:500;color:var(--d2-text-secondary);">{medal.label}</span>
                                                        {#if medal.count > 1}
                                                            <span style="font-family:var(--font-family-display);font-size:0.65rem;font-weight:800;color:var(--rarity-exotic);margin-left:2px;">×{medal.count}</span>
                                                        {/if}
                                                    </div>
                                                {/each}
                                            </div>
                                        </div>
                                    {/if}

                                    <!-- Full stat grid -->
                                    <div style="padding:0.75rem 1rem;">
                                        <span style="font-family:var(--font-family-display);font-size:0.60rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.30);display:block;margin-bottom:0.5rem;">All Stats</span>
                                        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0 1.5rem;">
                                            {#each DETAIL_STATS as { key, label, color }}
                                                {@const val = player.stats[key] ?? null}
                                                {#if val !== null && val !== 0}
                                                    <div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                                                        <span style="font-family:var(--font-family-display);font-size:0.65rem;font-weight:500;color:var(--d2-text-muted);">{label}</span>
                                                        <span style="font-family:var(--font-family-mono);font-size:0.75rem;font-weight:700;color:{color.replace('text-amber-400','#fbbf24').replace('text-emerald-400','var(--gambit-green)').replace('text-red-400','#f87171').replace('text-violet-400','#a78bfa').replace('text-violet-300','#c4b5fd').replace('text-cyan-400','#22d3ee').replace('text-orange-400','#fb923c').replace('text-green-400','#4ade80').replace('text-amber-300','#fcd34d').replace('text-zinc-400','rgba(255,255,255,0.40)').replace('text-zinc-200','rgba(255,255,255,0.80)')}">{fmtNum(val)}</span>
                                                    </div>
                                                {/if}
                                            {/each}
                                        </div>

                                        {#if player.code && player.membershipId}
                                            <div style="margin-top:0.75rem;display:flex;justify-content:flex-end;">
                                                <a href="/profile/{encodeURIComponent(player.name)}/{player.code}?mid={player.membershipId}&mt={player.membershipType}"
                                                   style="font-family:var(--font-family-display);font-size:0.70rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--gambit-green);text-decoration:none;display:flex;align-items:center;gap:4px;transition:color 0.15s;"
                                                   onmouseenter={e=>e.currentTarget.style.color='#6de8b0'}
                                                   onmouseleave={e=>e.currentTarget.style.color='var(--gambit-green)'}>
                                                    View Full Profile
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style="width:12px;height:12px;">
                                                        <path fill-rule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clip-rule="evenodd"/>
                                                    </svg>
                                                </a>
                                            </div>
                                        {/if}
                                    </div>
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            {/each}
        </div>

        <!-- ── Team comparison ───────────────────────────────────────────────── -->
        <div style="
            background:rgba(6,8,12,0.80);
            border:1px solid rgba(255,255,255,0.08);
            border-top:2px solid rgba(61,174,119,0.35);
            clip-path:polygon(10px 0%,100% 0%,100% 100%,0% 100%,0% 10px);
            padding:1.25rem 1.5rem;
        ">
            <span style="font-family:var(--font-family-display);font-size:0.62rem;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:var(--gambit-green);display:block;margin-bottom:1.25rem;">Team Comparison</span>
            <div style="display:flex;flex-direction:column;gap:0.75rem;">
                {#each [
                    { key: 'kills',          label: 'Total Kills'     },
                    { key: 'motesDeposited', label: 'Motes Banked'    },
                    { key: 'motesDenied',    label: 'Motes Denied'    },
                    { key: 'invasions',      label: 'Invasions'       },
                    { key: 'invasionKills',  label: 'Invasion Kills'  },
                    { key: 'primevalDamage', label: 'Primeval Damage' },
                ] as { key, label }}
                    {@const a = teamTotal(data.teamA, key)}
                    {@const b = teamTotal(data.teamB, key)}
                    {@const total = a + b}
                    {@const pctA = total > 0 ? Math.round((a / total) * 100) : 50}
                    {#if total > 0}
                        <div>
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                                <span style="font-family:var(--font-family-mono);font-size:0.78rem;font-weight:700;color:{data.teamAWon?'var(--gambit-green)':'rgba(255,255,255,0.45)'};">{fmtNum(a)}</span>
                                <span style="font-family:var(--font-family-display);font-size:0.60rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.28);">{label}</span>
                                <span style="font-family:var(--font-family-mono);font-size:0.78rem;font-weight:700;color:{data.teamBWon?'var(--gambit-green)':'rgba(255,255,255,0.45)'};">{fmtNum(b)}</span>
                            </div>
                            <div style="height:3px;display:flex;background:rgba(255,255,255,0.06);overflow:hidden;">
                                <div style="height:100%;width:{pctA}%;background:{data.teamAWon?'var(--gambit-green)':'rgba(180,40,40,0.70)'};transition:width 0.6s;"></div>
                                <div style="height:100%;flex:1;background:{data.teamBWon?'var(--gambit-green)':'rgba(180,40,40,0.70)'};"></div>
                            </div>
                        </div>
                    {/if}
                {/each}
            </div>
        </div>

        <!-- ── EGO Legend ────────────────────────────────────────────────────── -->
        <div style="
            border:1px solid rgba(255,255,255,0.07);
            background:rgba(6,8,12,0.60);
            padding:1rem 1.25rem;
            clip-path:polygon(0 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%);
        ">
            <span style="font-family:var(--font-family-display);font-size:0.60rem;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:rgba(255,255,255,0.28);display:block;margin-bottom:0.75rem;">EGO Rating System</span>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.5rem;margin-bottom:0.75rem;">
                {#each [
                    { range: '110+',   label: 'Elite',     color: '#c084fc', border: 'rgba(192,132,252,0.30)' },
                    { range: '80–109', label: 'Strong',    color: 'var(--gambit-green)', border: 'rgba(61,174,119,0.30)' },
                    { range: '50–79',  label: 'Average',   color: 'rgba(255,255,255,0.75)', border: 'rgba(255,255,255,0.15)' },
                    { range: '<50',    label: 'Below Avg', color: '#f87171', border: 'rgba(248,113,113,0.30)' },
                ] as tier}
                    <div style="display:flex;align-items:center;gap:0.5rem;border:1px solid {tier.border};padding:5px 10px;">
                        <span style="font-family:var(--font-family-mono);font-size:0.78rem;font-weight:700;color:{tier.color};">{tier.range}</span>
                        <span style="font-family:var(--font-family-display);font-size:0.62rem;font-weight:600;color:rgba(255,255,255,0.28);letter-spacing:0.04em;">{tier.label}</span>
                    </div>
                {/each}
            </div>
            <p style="font-family:var(--font-family-sans);font-size:0.68rem;color:rgba(255,255,255,0.18);line-height:1.6;">
                EGO = (PvE kills + Primeval damage + Invasion kills + Motes banked + Assists + Medals − Deaths penalty − Wasted motes) × Stack multiplier × PEM.
                <span style="color:rgba(255,255,255,0.13);">PEM (Performance Efficiency Multiplier) rewards mote banking safety and K/D above benchmarks.</span>
            </p>
        </div>

    </div>
</div>
