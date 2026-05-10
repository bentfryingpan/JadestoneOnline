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

<div class="min-h-screen text-white">

    <!-- ── Hero banner ──────────────────────────────────────────────────────── -->
    <div class="relative overflow-hidden border-b border-zinc-800/60">
        {#if data.pgcrImage}
            <img src={data.pgcrImage} alt={data.mapName}
                 class="absolute inset-0 w-full h-full object-cover opacity-[0.18]" />
            <div class="absolute inset-0 bg-gradient-to-b from-transparent via-[#0a0a0a]/70 to-[#0a0a0a]"></div>
        {/if}
        <div class="relative max-w-6xl mx-auto px-6 py-10">
            <a href="/" class="text-xs text-zinc-600 hover:text-zinc-400 transition-colors mb-4 inline-block font-medium">
                ← Back to search
            </a>
            <div class="flex items-end gap-6 mt-2">
                {#if data.mapIcon}
                    <img src={data.mapIcon} alt={data.mapName}
                         class="w-16 h-16 border border-zinc-700 object-cover shrink-0" />
                {/if}
                <div>
                    <span class="text-xs font-medium text-emerald-500/70 block mb-1 tracking-wide uppercase">Gambit Match</span>
                    <h1 class="font-serif text-4xl font-light italic text-white leading-none">{data.mapName}</h1>
                    <div class="h-px w-16 bg-gradient-to-r from-emerald-500/40 to-transparent mt-3 mb-2"></div>
                    <div class="flex items-center gap-4 text-sm text-zinc-500 font-medium">
                        <span>{timeAgo(data.period)}</span>
                        <span class="text-zinc-800">·</span>
                        <span>{fmtDuration(data.duration)}</span>
                        <span class="text-zinc-800">·</span>
                        <span class="font-mono text-xs text-zinc-700">{data.instanceId}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="max-w-6xl mx-auto px-6 py-8 space-y-8">

        <!-- ── Score banner ─────────────────────────────────────────────────── -->
        <div class="grid grid-cols-3 gap-4 items-center">
            <div class="text-center">
                <p class="text-2xl font-bold {data.teamAWon ? 'text-emerald-400' : 'text-red-400'}">
                    {data.teamAWon ? 'VICTORY' : 'DEFEAT'}
                </p>
                <p class="text-[10px] font-medium text-zinc-600 uppercase tracking-wider mt-1">Team Alpha</p>
                <div class="mt-2 flex justify-center gap-3 text-sm text-zinc-500 font-medium">
                    <span>{teamTotal(data.teamA, 'motesDeposited')} motes</span>
                    <span class="text-zinc-700">·</span>
                    <span>{teamTotal(data.teamA, 'kills')}K / {teamTotal(data.teamA, 'deaths')}D</span>
                </div>
                <p class="text-xs text-zinc-600 mt-1 font-mono">
                    Avg EGO: <span class="{egoColor(teamAvgEgo(data.teamA))} font-bold">{teamAvgEgo(data.teamA).toFixed(1)}</span>
                </p>
            </div>
            <div class="flex flex-col items-center gap-2">
                <div class="w-px h-8 bg-zinc-800"></div>
                <span class="text-xs font-medium text-zinc-600 uppercase tracking-widest">vs</span>
                <div class="w-px h-8 bg-zinc-800"></div>
            </div>
            <div class="text-center">
                <p class="text-2xl font-bold {data.teamBWon ? 'text-emerald-400' : 'text-red-400'}">
                    {data.teamBWon ? 'VICTORY' : 'DEFEAT'}
                </p>
                <p class="text-[10px] font-medium text-zinc-600 uppercase tracking-wider mt-1">Team Bravo</p>
                <div class="mt-2 flex justify-center gap-3 text-sm text-zinc-500 font-medium">
                    <span>{teamTotal(data.teamB, 'motesDeposited')} motes</span>
                    <span class="text-zinc-700">·</span>
                    <span>{teamTotal(data.teamB, 'kills')}K / {teamTotal(data.teamB, 'deaths')}D</span>
                </div>
                <p class="text-xs text-zinc-600 mt-1 font-mono">
                    Avg EGO: <span class="{egoColor(teamAvgEgo(data.teamB))} font-bold">{teamAvgEgo(data.teamB).toFixed(1)}</span>
                </p>
            </div>
        </div>

        <!-- ── Two-column team layout ────────────────────────────────────────── -->
        <div class="grid md:grid-cols-2 gap-6">
            {#each [
                { players: data.teamA, won: data.teamAWon, label: 'Alpha' },
                { players: data.teamB, won: data.teamBWon, label: 'Bravo' }
            ] as team}
                <div class="space-y-2">
                    <div class="flex items-center gap-3 mb-3">
                        <div class="h-px flex-1 {team.won ? 'bg-emerald-500/30' : 'bg-red-500/20'}"></div>
                        <span class="text-[10px] font-medium uppercase tracking-wider
                                     {team.won ? 'text-emerald-400' : 'text-red-400'}">
                            Team {team.label} — {team.won ? 'Victory' : 'Defeat'}
                        </span>
                        <div class="h-px flex-1 {team.won ? 'bg-emerald-500/30' : 'bg-red-500/20'}"></div>
                    </div>

                    {#each team.players as player}
                        {@const uid = `${player.membershipId}-${player.name}`}
                        {@const isExpanded = expandedPlayer === uid}

                        <div class="border overflow-hidden transition-all duration-200
                                    {team.won ? 'border-emerald-500/20 bg-emerald-950/10' : 'border-red-500/10 bg-red-950/5'}
                                    {player.role === 'carry' ? 'ring-1 ring-amber-500/20' : ''}">

                            <!-- Main row -->
                            <button class="w-full text-left px-4 py-3 flex items-center gap-3
                                           hover:bg-white/[0.03] transition-colors"
                                    onclick={() => togglePlayer(uid)}>

                                <!-- Emblem -->
                                <div class="relative shrink-0">
                                    {#if player.icon}
                                        <img src={player.icon} alt={player.name}
                                             class="w-10 h-10 border border-zinc-700/50 object-cover" />
                                    {:else}
                                        <div class="w-10 h-10 bg-zinc-900 border border-zinc-800 flex items-center justify-center text-lg">
                                            {player.className === 'Titan' ? '🛡️' : player.className === 'Hunter' ? '🏹' : player.className === 'Warlock' ? '📿' : '👤'}
                                        </div>
                                    {/if}
                                    {#if !player.completed}
                                        <span class="absolute -top-1 -right-1 text-[8px] bg-zinc-800 text-zinc-400 px-0.5 font-bold border border-zinc-700">DNF</span>
                                    {/if}
                                    {#if player.role === 'carry'}
                                        <span class="absolute -bottom-1 -right-1 text-[8px] bg-amber-500 text-black px-0.5 font-bold leading-none py-px">★</span>
                                    {/if}
                                </div>

                                <!-- Name + class -->
                                <div class="flex-1 min-w-0">
                                    {#if player.code && player.membershipId}
                                        <a href="/profile/{encodeURIComponent(player.name)}/{player.code}?mid={player.membershipId}&mt={player.membershipType}"
                                           onclick={(e) => e.stopPropagation()}
                                           class="text-sm font-semibold text-white hover:text-emerald-400 transition-colors truncate block">
                                            {player.name}<span class="text-zinc-600 text-xs font-normal">#{player.code}</span>
                                        </a>
                                    {:else}
                                        <span class="text-sm font-semibold text-zinc-400 truncate block">{player.name}</span>
                                    {/if}
                                    <div class="flex items-center gap-2">
                                        <p class="text-[10px] font-medium text-zinc-600 uppercase tracking-wider">{player.className}</p>
                                        {#if player.role === 'carry'}
                                            <span class="text-[9px] font-bold text-amber-400 border border-amber-500/30 px-1 leading-none py-px">CARRY</span>
                                        {:else if player.role === 'carried'}
                                            <span class="text-[9px] font-bold text-red-400 border border-red-500/30 px-1 leading-none py-px">CARRIED</span>
                                        {/if}
                                    </div>
                                </div>

                                <!-- EGO Score -->
                                <div class="shrink-0 text-right mr-2 border-r border-zinc-800/50 pr-3">
                                    {#if player.ego}
                                        <p class="text-base font-bold font-mono {egoColor(player.ego.finalScore)}">
                                            {player.ego.finalScore}
                                        </p>
                                        <p class="text-[9px] font-medium text-zinc-600 uppercase">EGO</p>
                                    {:else}
                                        <p class="text-sm text-zinc-700 font-mono">—</p>
                                        <p class="text-[9px] font-medium text-zinc-700 uppercase">EGO</p>
                                    {/if}
                                </div>

                                <!-- KDA -->
                                <div class="shrink-0 text-right mr-2">
                                    <p class="text-sm font-bold text-white font-mono">{player.k}/{player.d}/{player.a}</p>
                                    <p class="text-[10px] font-medium text-zinc-500">{player.kd} KD</p>
                                </div>

                                <!-- Motes banked -->
                                <div class="shrink-0 text-center min-w-[2.8rem] border-l border-zinc-800/50 pl-2">
                                    <p class="text-sm font-bold font-mono {(player.stats.motesDeposited ?? 0) >= 15 ? 'text-emerald-400' : 'text-zinc-400'}">
                                        {player.stats.motesDeposited ?? 0}
                                    </p>
                                    <p class="text-[9px] font-medium text-zinc-600 uppercase">MB</p>
                                </div>

                                <!-- Invasions (if > 0) -->
                                {#if (player.stats.invasions ?? 0) > 0}
                                    <div class="shrink-0 text-center min-w-[2.2rem] pl-2">
                                        <p class="text-sm font-bold font-mono text-violet-400">{player.stats.invasions}</p>
                                        <p class="text-[9px] font-medium text-zinc-600 uppercase">INV</p>
                                    </div>
                                {/if}

                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                                     class="w-4 h-4 text-zinc-600 shrink-0 transition-transform duration-200 {isExpanded ? 'rotate-180' : ''}">
                                    <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd"/>
                                </svg>
                            </button>

                            <!-- ── Expanded detail panel ──────────────────────── -->
                            {#if isExpanded}
                                <div class="border-t border-zinc-800/60 bg-black/20">

                                    {#if player.ego}
                                        <!-- EGO breakdown header -->
                                        <div class="grid grid-cols-5 border-b border-zinc-800/40">
                                            <div class="col-span-2 px-4 py-3 border-r border-zinc-800/40">
                                                <div class="flex items-baseline gap-2">
                                                    <span class="text-2xl font-bold font-mono {egoColor(player.ego.finalScore)}">{player.ego.finalScore}</span>
                                                    <span class="text-xs font-medium text-zinc-500">EGO Rating</span>
                                                </div>
                                                <div class="flex items-baseline gap-1.5 mt-0.5">
                                                    <span class="text-sm font-mono text-zinc-400">{player.ego.basePps}</span>
                                                    <span class="text-xs text-zinc-700">Base</span>
                                                    <span class="text-zinc-800 mx-1">×</span>
                                                    <span class="text-sm font-mono font-bold {pemColor(player.ego.pem)}">{player.ego.pem}x</span>
                                                    <span class="text-xs text-zinc-700">PEM</span>
                                                </div>
                                                <!-- PEM bar -->
                                                <div class="mt-2 flex items-center gap-2">
                                                    <div class="flex-1 h-1.5 bg-zinc-800 relative overflow-hidden">
                                                        <div class="h-full transition-all duration-700 {player.ego.pem >= 1 ? 'bg-emerald-500' : 'bg-red-500'}"
                                                             style="width:{Math.min(100, ((player.ego.pem - 0.7) / 0.7) * 100)}%"></div>
                                                        <!-- 1.0x marker -->
                                                        <div class="absolute top-0 bottom-0 w-px bg-zinc-500"
                                                             style="left:{((1.0 - 0.7) / 0.7) * 100}%"></div>
                                                    </div>
                                                    <span class="text-[9px] font-mono text-zinc-600">{player.ego.moteEff}% ME</span>
                                                </div>
                                            </div>
                                            <!-- Component breakdown bars -->
                                            <div class="col-span-3 px-4 py-3 space-y-1.5">
                                                {#each Object.entries(player.ego.components) as [comp, val]}
                                                    {@const maxComp = Math.max(...Object.values(player.ego.components), 1)}
                                                    <div class="flex items-center gap-2">
                                                        <span class="text-[9px] font-medium text-zinc-500 w-12 uppercase tracking-wider">{comp}</span>
                                                        <div class="flex-1 h-2 bg-zinc-800/60 overflow-hidden">
                                                            <div class="{COMP_COLORS[comp] ?? 'bg-zinc-500'} h-full transition-all duration-700"
                                                                 style="width:{Math.max(0, (val / maxComp) * 100)}%"></div>
                                                        </div>
                                                        <span class="text-[9px] font-mono text-zinc-400 w-8 text-right">{val}</span>
                                                    </div>
                                                {/each}
                                            </div>
                                        </div>
                                    {/if}

                                    <!-- Weapons used -->
                                    {#if player.weapons?.length}
                                        <div class="px-4 py-3 border-b border-zinc-800/40">
                                            <span class="text-[10px] font-medium text-zinc-500 uppercase tracking-wider block mb-2">Weapons Used</span>
                                            <div class="flex flex-wrap gap-3">
                                                {#each player.weapons as w}
                                                    <div class="flex items-center gap-2">
                                                        {#if w.icon}
                                                            <div class="w-8 h-8 shrink-0 border {tierBorder(w.tier)} overflow-hidden">
                                                                <img src={w.icon} alt={w.name} class="w-full h-full object-cover" />
                                                            </div>
                                                        {/if}
                                                        <div>
                                                            <p class="text-xs font-semibold text-zinc-200 leading-tight">{w.name}</p>
                                                            <p class="text-[9px] font-mono text-zinc-500">
                                                                {w.kills}K
                                                                {#if w.precision > 0}<span class="text-zinc-700"> · {w.precision} prec</span>{/if}
                                                            </p>
                                                        </div>
                                                    </div>
                                                {/each}
                                            </div>
                                        </div>
                                    {/if}

                                    <!-- Medals earned -->
                                    {#if player.medalList?.length}
                                        <div class="px-4 py-3 border-b border-zinc-800/40">
                                            <span class="text-[10px] font-medium text-zinc-500 uppercase tracking-wider block mb-2">Medals</span>
                                            <div class="flex flex-wrap gap-1.5">
                                                {#each player.medalList as medal}
                                                    <div class="flex items-center gap-1 border border-amber-500/20 bg-amber-500/5 px-2 py-1">
                                                        <span class="text-amber-400 text-[9px]">★</span>
                                                        <span class="text-[9px] font-medium text-zinc-300">{medal.label}</span>
                                                        {#if medal.count > 1}
                                                            <span class="text-[9px] font-bold text-amber-400 ml-0.5">×{medal.count}</span>
                                                        {/if}
                                                    </div>
                                                {/each}
                                            </div>
                                        </div>
                                    {/if}

                                    <!-- Full stat grid -->
                                    <div class="px-4 py-3">
                                        <span class="text-[10px] font-medium text-zinc-500 uppercase tracking-wider block mb-2">All Stats</span>
                                        <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-0">
                                            {#each DETAIL_STATS as { key, label, color }}
                                                {@const val = player.stats[key] ?? null}
                                                {#if val !== null && val !== 0}
                                                    <div class="flex items-center justify-between py-1.5 border-b border-zinc-800/30">
                                                        <span class="text-xs font-medium text-zinc-500">{label}</span>
                                                        <span class="text-sm font-bold font-mono {color}">{fmtNum(val)}</span>
                                                    </div>
                                                {/if}
                                            {/each}
                                        </div>

                                        {#if player.code && player.membershipId}
                                            <div class="mt-3 flex justify-end">
                                                <a href="/profile/{encodeURIComponent(player.name)}/{player.code}?mid={player.membershipId}&mt={player.membershipType}"
                                                   class="text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1">
                                                    View full profile
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5">
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
        <div class="bg-white/[0.02] border border-zinc-800 relative overflow-hidden">
            <span class="absolute top-0 left-0 w-2 h-2 border-t border-l border-emerald-500/30 pointer-events-none z-10"></span>
            <span class="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-emerald-500/30 pointer-events-none z-10"></span>
            <div class="p-6">
                <span class="text-xs font-medium text-zinc-500 block mb-5 uppercase tracking-wider">Team Comparison</span>
                <div class="space-y-4">
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
                                <div class="flex justify-between text-xs font-medium text-zinc-500 mb-1.5">
                                    <span class="{data.teamAWon ? 'text-emerald-400' : 'text-zinc-400'} font-bold font-mono">{fmtNum(a)}</span>
                                    <span class="uppercase tracking-wider text-[10px]">{label}</span>
                                    <span class="{data.teamBWon ? 'text-emerald-400' : 'text-zinc-400'} font-bold font-mono">{fmtNum(b)}</span>
                                </div>
                                <div class="h-1.5 overflow-hidden flex bg-zinc-900">
                                    <div class="h-full transition-all duration-700 {data.teamAWon ? 'bg-emerald-500' : 'bg-red-500/60'}"
                                         style="width: {pctA}%"></div>
                                    <div class="h-full flex-1 {data.teamBWon ? 'bg-emerald-500' : 'bg-red-500/60'}"></div>
                                </div>
                            </div>
                        {/if}
                    {/each}
                </div>
            </div>
        </div>

        <!-- ── EGO Legend ────────────────────────────────────────────────────── -->
        <div class="border border-zinc-800/60 bg-zinc-900/20 p-4">
            <span class="text-[10px] font-medium text-zinc-500 uppercase tracking-wider block mb-3">EGO Rating System</span>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                {#each [
                    { range: '110+', label: 'Elite',    color: 'text-purple-400', bg: 'border-purple-500/30' },
                    { range: '80–109', label: 'Strong', color: 'text-emerald-400', bg: 'border-emerald-500/30' },
                    { range: '50–79', label: 'Average', color: 'text-zinc-200',    bg: 'border-zinc-600/40'   },
                    { range: '<50',   label: 'Below Avg',color: 'text-red-400',   bg: 'border-red-500/30'    },
                ] as tier}
                    <div class="flex items-center gap-2 border {tier.bg} px-2 py-1.5">
                        <span class="font-mono font-bold text-sm {tier.color}">{tier.range}</span>
                        <span class="text-xs font-medium text-zinc-500">{tier.label}</span>
                    </div>
                {/each}
            </div>
            <p class="text-[10px] text-zinc-700 leading-relaxed">
                EGO = (PvE kills + Primeval damage + Invasion kills + Motes banked + Assists + Medals − Deaths penalty − Wasted motes) × Stack multiplier × PEM.
                <span class="text-zinc-600">PEM (Performance Efficiency Multiplier) rewards mote banking safety and K/D above benchmarks.</span>
            </p>
        </div>

    </div>
</div>
