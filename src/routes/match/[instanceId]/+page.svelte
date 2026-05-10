<script>
    let { data } = $props();

    const classIcons = { Titan: '🛡️', Hunter: '🏹', Warlock: '📿' };

    function timeAgo(iso) {
        if (!iso) return '';
        const diff = Date.now() - new Date(iso).getTime();
        const m = Math.floor(diff / 60000);
        if (m < 60)    return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24)    return `${h}h ago`;
        const d = Math.floor(h / 24);
        return `${d}d ago`;
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

    // Highlighted stats in the compact player row
    const ROW_STATS = [
        { key: 'kills',             label: 'K'    },
        { key: 'deaths',            label: 'D'    },
        { key: 'assists',           label: 'A'    },
        { key: 'motesDeposited',    label: 'MB'   },
        { key: 'motesDenied',       label: 'MD'   },
        { key: 'invasions',         label: 'INV'  },
        { key: 'invasionKills',     label: 'IK'   },
        { key: 'invasionsDefeated', label: 'INVD' },
    ];

    // Full stat set shown in the expanded detail panel
    const DETAIL_STATS = [
        { key: 'kills',                    label: 'Kills',            color: 'text-zinc-200' },
        { key: 'deaths',                   label: 'Deaths',           color: 'text-red-400'  },
        { key: 'assists',                  label: 'Assists',          color: 'text-zinc-400' },
        { key: 'motesPickedUp',            label: 'Motes Picked Up',  color: 'text-amber-400'},
        { key: 'motesDeposited',           label: 'Motes Banked',     color: 'text-emerald-400'},
        { key: 'motesDenied',              label: 'Motes Denied',     color: 'text-violet-400' },
        { key: 'motesLost',                label: 'Motes Lost',       color: 'text-red-400'  },
        { key: 'invasions',                label: 'Invasions',        color: 'text-violet-400' },
        { key: 'invasionKills',            label: 'Invasion Kills',   color: 'text-violet-300' },
        { key: 'invasionsDefeated',        label: 'Invasions Blocked',color: 'text-cyan-400' },
        { key: 'primevalDamage',           label: 'Primeval Damage',  color: 'text-orange-400' },
        { key: 'primevalHealing',          label: 'Primeval Healed',  color: 'text-green-400'  },
        { key: 'smallBlooms',              label: 'Small Blockers',   color: 'text-zinc-400' },
        { key: 'largeBlooms',              label: 'Large Blockers',   color: 'text-zinc-300' },
        { key: 'superKills',               label: 'Super Kills',      color: 'text-amber-300' },
        { key: 'grenadeKills',             label: 'Grenade Kills',    color: 'text-zinc-400' },
        { key: 'meleeKills',               label: 'Melee Kills',      color: 'text-zinc-400' },
        { key: 'rechargeableAbilityKills', label: 'Ability Kills',    color: 'text-zinc-400' },
    ];

    let expandedPlayer = $state(null);
    function togglePlayer(id) {
        expandedPlayer = expandedPlayer === id ? null : id;
    }

    // Team totals
    function teamTotal(players, key) {
        return players.reduce((sum, p) => sum + (p.stats[key] ?? 0), 0);
    }

    // KD ratio
    function kd(p) {
        const d = p.stats.deaths ?? p.d ?? 0;
        const k = p.stats.kills  ?? p.k ?? 0;
        return d > 0 ? (k / d).toFixed(2) : k.toFixed(2);
    }

    // Efficiency rating: (kills + assists + motesDeposited + invasionKills) / (deaths + motesLost + 1)
    function efficiency(p) {
        const num = (p.stats.kills ?? 0) + (p.stats.assists ?? 0) + (p.stats.motesDeposited ?? 0) + (p.stats.invasionKills ?? 0);
        const den = (p.stats.deaths ?? 0) + (p.stats.motesLost ?? 0) + 1;
        return (num / den).toFixed(2);
    }
</script>

<svelte:head>
    <title>Match {data.instanceId} · Jadestone</title>
</svelte:head>

<!-- ── Page ─────────────────────────────────────────────────────────────── -->
<div class="min-h-screen text-white">

    <!-- ── Hero banner ──────────────────────────────────────────────────── -->
    <div class="relative overflow-hidden border-b border-zinc-800/60">
        {#if data.pgcrImage}
            <img src={data.pgcrImage} alt={data.mapName}
                 class="absolute inset-0 w-full h-full object-cover opacity-[0.18]" />
            <div class="absolute inset-0 bg-gradient-to-b from-transparent via-[#0a0a0a]/70 to-[#0a0a0a]"></div>
        {/if}
        <div class="relative max-w-6xl mx-auto px-6 py-10">
            <!-- Breadcrumb -->
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

    <!-- ── Main content ──────────────────────────────────────────────────── -->
    <div class="max-w-6xl mx-auto px-6 py-8 space-y-8">

        <!-- ── Score banner ─────────────────────────────────────────────── -->
        <div class="grid grid-cols-3 gap-4 items-center">
            <!-- Team A -->
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
            </div>

            <!-- VS divider -->
            <div class="flex flex-col items-center gap-2">
                <div class="w-px h-8 bg-zinc-800"></div>
                <span class="text-xs font-medium text-zinc-600 uppercase tracking-widest">vs</span>
                <div class="w-px h-8 bg-zinc-800"></div>
            </div>

            <!-- Team B -->
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
            </div>
        </div>

        <!-- ── Two-column team layout ────────────────────────────────────── -->
        <div class="grid md:grid-cols-2 gap-6">

            {#each [
                { players: data.teamA, won: data.teamAWon, label: 'Alpha' },
                { players: data.teamB, won: data.teamBWon, label: 'Bravo' }
            ] as team}
                <div class="space-y-2">

                    <!-- Team header -->
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
                                    {team.won
                                        ? 'border-emerald-500/20 bg-emerald-950/10'
                                        : 'border-red-500/10 bg-red-950/5'}">

                            <!-- Main row -->
                            <button
                                class="w-full text-left px-4 py-3 flex items-center gap-3
                                       hover:bg-white/[0.03] transition-colors"
                                onclick={() => togglePlayer(uid)}
                            >
                                <!-- Emblem / class icon -->
                                <div class="relative shrink-0">
                                    {#if player.icon}
                                        <img src={player.icon} alt={player.name}
                                             class="w-10 h-10 border border-zinc-700/50 object-cover" />
                                    {:else}
                                        <div class="w-10 h-10 bg-zinc-900 border border-zinc-800 flex items-center justify-center text-lg">
                                            {classIcons[player.className] ?? '👤'}
                                        </div>
                                    {/if}
                                    {#if !player.completed}
                                        <span class="absolute -top-1 -right-1 text-[8px] bg-zinc-800 text-zinc-400 px-0.5 font-bold border border-zinc-700">DNF</span>
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
                                    <p class="text-[10px] font-medium text-zinc-600 uppercase tracking-wider">{player.className}</p>
                                </div>

                                <!-- KDA -->
                                <div class="shrink-0 text-right mr-2">
                                    <p class="text-sm font-bold text-white font-mono">
                                        {player.k}/{player.d}/{player.a}
                                    </p>
                                    <p class="text-[10px] font-medium text-zinc-500">
                                        {kd(player)} KD
                                    </p>
                                </div>

                                <!-- Motes banked badge -->
                                <div class="shrink-0 text-center min-w-[2.8rem] border-l border-zinc-800/60 pl-3">
                                    <p class="text-sm font-bold font-mono
                                              {(player.stats.motesDeposited ?? 0) >= 15 ? 'text-emerald-400' : 'text-zinc-400'}">
                                        {player.stats.motesDeposited ?? 0}
                                    </p>
                                    <p class="text-[9px] font-medium text-zinc-600 uppercase">MB</p>
                                </div>

                                <!-- Invasions badge (only if > 0) -->
                                {#if (player.stats.invasions ?? 0) > 0}
                                    <div class="shrink-0 text-center min-w-[2.8rem] pl-2">
                                        <p class="text-sm font-bold font-mono text-violet-400">{player.stats.invasions}</p>
                                        <p class="text-[9px] font-medium text-zinc-600 uppercase">INV</p>
                                    </div>
                                {/if}

                                <!-- Expand chevron -->
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                                     class="w-4 h-4 text-zinc-600 shrink-0 transition-transform duration-200 {isExpanded ? 'rotate-180' : ''}">
                                    <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
                                </svg>
                            </button>

                            <!-- ── Expanded detail panel ──────────────────── -->
                            {#if isExpanded}
                                <div class="border-t border-zinc-800/60 bg-black/20">

                                    <!-- Summary bar: efficiency + motes lost + primeval dmg -->
                                    <div class="grid grid-cols-3 border-b border-zinc-800/40">
                                        <div class="text-center py-3 border-r border-zinc-800/40">
                                            <p class="text-lg font-bold text-emerald-400 font-mono">{efficiency(player)}</p>
                                            <p class="text-[9px] font-medium text-zinc-600 uppercase tracking-wider">Efficiency</p>
                                        </div>
                                        <div class="text-center py-3 border-r border-zinc-800/40">
                                            <p class="text-lg font-bold text-red-400 font-mono">{player.stats.motesLost ?? 0}</p>
                                            <p class="text-[9px] font-medium text-zinc-600 uppercase tracking-wider">Motes Lost</p>
                                        </div>
                                        <div class="text-center py-3">
                                            <p class="text-lg font-bold text-orange-400 font-mono">{fmtNum(player.stats.primevalDamage ?? 0)}</p>
                                            <p class="text-[9px] font-medium text-zinc-600 uppercase tracking-wider">Primeval DMG</p>
                                        </div>
                                    </div>

                                    <!-- Full stat grid -->
                                    <div class="p-4">
                                        <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
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

                                        <!-- Profile link -->
                                        {#if player.code && player.membershipId}
                                            <div class="mt-4 flex justify-end">
                                                <a href="/profile/{encodeURIComponent(player.name)}/{player.code}?mid={player.membershipId}&mt={player.membershipType}"
                                                   class="text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1">
                                                    View full profile
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5">
                                                        <path fill-rule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clip-rule="evenodd" />
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

        <!-- ── Team comparison ───────────────────────────────────────────── -->
        <div class="bg-white/[0.02] border border-zinc-800 relative overflow-hidden">
            <!-- Corner accents -->
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
                        {@const pctB = 100 - pctA}
                        {#if total > 0}
                            <div>
                                <div class="flex justify-between text-xs font-medium text-zinc-500 mb-1.5">
                                    <span class="{data.teamAWon ? 'text-emerald-400' : 'text-zinc-400'} font-bold font-mono">{fmtNum(a)}</span>
                                    <span class="uppercase tracking-wider text-[10px]">{label}</span>
                                    <span class="{data.teamBWon ? 'text-emerald-400' : 'text-zinc-400'} font-bold font-mono">{fmtNum(b)}</span>
                                </div>
                                <div class="h-1.5 overflow-hidden flex bg-zinc-900">
                                    <div class="h-full transition-all duration-700
                                                {data.teamAWon ? 'bg-emerald-500' : 'bg-red-500/60'}"
                                         style="width: {pctA}%"></div>
                                    <div class="h-full flex-1
                                                {data.teamBWon ? 'bg-emerald-500' : 'bg-red-500/60'}"
                                         style="width: {pctB}%"></div>
                                </div>
                            </div>
                        {/if}
                    {/each}
                </div>
            </div>
        </div>

    </div>
</div>
