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

    // Stats to highlight in the main row
    const ROW_STATS = [
        { key: 'kills',          label: 'K'   },
        { key: 'deaths',         label: 'D'   },
        { key: 'assists',        label: 'A'   },
        { key: 'motesDeposited', label: 'MB'  },
        { key: 'motesDenied',    label: 'MD'  },
        { key: 'invasions',      label: 'INV' },
        { key: 'invasionKills',  label: 'IK'  },
        { key: 'invasionsDefeated', label: 'INVD' },
    ];

    // Stats shown in the extended drawer
    const DRAWER_STATS = [
        { key: 'motesPickedUp',            label: 'Motes Picked'   },
        { key: 'motesLost',                label: 'Motes Lost'      },
        { key: 'primevalDamage',           label: 'Primeval DMG'    },
        { key: 'primevalHealing',          label: 'Primeval Heal'   },
        { key: 'smallBlooms',              label: 'Small Blooms'    },
        { key: 'largeBlooms',              label: 'Large Blooms'    },
        { key: 'superKills',               label: 'Super Kills'     },
        { key: 'grenadeKills',             label: 'Grenade Kills'   },
        { key: 'meleeKills',               label: 'Melee Kills'     },
        { key: 'rechargeableAbilityKills', label: 'Ability Kills'  },
    ];

    let expandedPlayer = $state(null);
    function togglePlayer(id) {
        expandedPlayer = expandedPlayer === id ? null : id;
    }

    // Team totals
    function teamTotal(players, key) {
        return players.reduce((sum, p) => sum + (p.stats[key] ?? 0), 0);
    }
</script>

<svelte:head>
    <title>Match {data.instanceId} · Jadestone</title>
</svelte:head>

<!-- ── Page background with map art ──────────────────────────────────────── -->
<div class="min-h-screen bg-[#090b14] text-white">

    <!-- Hero banner -->
    <div class="relative overflow-hidden border-b border-white/[0.06]">
        {#if data.pgcrImage}
            <img src={data.pgcrImage} alt={data.mapName}
                 class="absolute inset-0 w-full h-full object-cover opacity-20" />
            <div class="absolute inset-0 bg-gradient-to-b from-transparent via-[#090b14]/70 to-[#090b14]"></div>
        {/if}
        <div class="relative max-w-6xl mx-auto px-6 py-10">
            <!-- Breadcrumb -->
            <a href="/" class="text-xs text-slate-500 hover:text-slate-400 transition-colors mb-4 inline-block">
                ← Back to search
            </a>
            <div class="flex items-end gap-6 mt-2">
                {#if data.mapIcon}
                    <img src={data.mapIcon} alt={data.mapName}
                         class="w-16 h-16 rounded-xl border border-white/10 object-cover shrink-0" />
                {/if}
                <div>
                    <p class="text-[11px] text-emerald-400 uppercase tracking-widest font-bold mb-1">
                        Gambit Match
                    </p>
                    <h1 class="text-3xl font-bold tracking-tight">{data.mapName}</h1>
                    <div class="flex items-center gap-4 mt-2 text-sm text-slate-400">
                        <span>{timeAgo(data.period)}</span>
                        <span class="text-slate-600">·</span>
                        <span>{fmtDuration(data.duration)}</span>
                        <span class="text-slate-600">·</span>
                        <span class="font-mono text-xs text-slate-600">{data.instanceId}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- ── Main content ─────────────────────────────────────────────────────── -->
    <div class="max-w-6xl mx-auto px-6 py-8 space-y-8">

        <!-- ── Score banner ──────────────────────────────────────────────── -->
        <div class="grid grid-cols-3 gap-4 items-center">
            <!-- Team A header -->
            <div class="text-center">
                <p class="text-2xl font-black {data.teamAWon ? 'text-emerald-400' : 'text-red-400'}">
                    {data.teamAWon ? 'VICTORY' : 'DEFEAT'}
                </p>
                <p class="text-xs text-slate-600 uppercase tracking-widest mt-1">Team Alpha</p>
                <div class="mt-2 flex justify-center gap-3 text-sm text-slate-400">
                    <span>{teamTotal(data.teamA, 'motesDeposited')} motes</span>
                    <span class="text-slate-600">·</span>
                    <span>{teamTotal(data.teamA, 'kills')}K/{teamTotal(data.teamA, 'deaths')}D</span>
                </div>
            </div>

            <!-- VS divider -->
            <div class="flex flex-col items-center gap-2">
                <div class="w-px h-8 bg-white/10"></div>
                <span class="text-xs text-slate-600 font-bold uppercase tracking-widest">vs</span>
                <div class="w-px h-8 bg-white/10"></div>
            </div>

            <!-- Team B header -->
            <div class="text-center">
                <p class="text-2xl font-black {data.teamBWon ? 'text-emerald-400' : 'text-red-400'}">
                    {data.teamBWon ? 'VICTORY' : 'DEFEAT'}
                </p>
                <p class="text-xs text-slate-600 uppercase tracking-widest mt-1">Team Bravo</p>
                <div class="mt-2 flex justify-center gap-3 text-sm text-slate-400">
                    <span>{teamTotal(data.teamB, 'motesDeposited')} motes</span>
                    <span class="text-slate-600">·</span>
                    <span>{teamTotal(data.teamB, 'kills')}K/{teamTotal(data.teamB, 'deaths')}D</span>
                </div>
            </div>
        </div>

        <!-- ── Stat column headers ────────────────────────────────────────── -->
        <div class="hidden md:grid grid-cols-[1fr_auto] gap-4">
            <div></div>
            <div class="grid gap-1 text-[10px] text-slate-600 uppercase tracking-wider font-semibold pr-4"
                 style="grid-template-columns: repeat({ROW_STATS.length}, minmax(2.5rem, 1fr))">
                {#each ROW_STATS as { label }}
                    <span class="text-center">{label}</span>
                {/each}
            </div>
        </div>

        <!-- ── Two-column team layout ─────────────────────────────────────── -->
        <div class="grid md:grid-cols-2 gap-6">

            {#each [
                { players: data.teamA, won: data.teamAWon, label: 'Alpha' },
                { players: data.teamB, won: data.teamBWon, label: 'Bravo' }
            ] as team}
                <div class="space-y-1.5">
                    <!-- Team label -->
                    <div class="flex items-center gap-3 mb-3">
                        <div class="h-px flex-1 {team.won ? 'bg-emerald-500/30' : 'bg-red-500/20'}"></div>
                        <span class="text-[10px] font-bold uppercase tracking-widest
                                     {team.won ? 'text-emerald-400' : 'text-red-400'}">
                            Team {team.label} — {team.won ? 'Victory' : 'Defeat'}
                        </span>
                        <div class="h-px flex-1 {team.won ? 'bg-emerald-500/30' : 'bg-red-500/20'}"></div>
                    </div>

                    {#each team.players as player}
                        {@const uid = `${player.membershipId}-${player.name}`}
                        {@const isExpanded = expandedPlayer === uid}

                        <div class="border rounded-xl overflow-hidden transition-colors
                                    {team.won
                                        ? 'border-emerald-500/20 bg-emerald-950/10 hover:bg-emerald-950/20'
                                        : 'border-red-500/10 bg-red-950/5 hover:bg-red-950/10'}">

                            <!-- Main row -->
                            <button
                                class="w-full text-left px-4 py-3 flex items-center gap-3"
                                onclick={() => togglePlayer(uid)}
                            >
                                <!-- Class icon + player icon -->
                                <div class="relative shrink-0">
                                    {#if player.icon}
                                        <img src={player.icon} alt={player.name}
                                             class="w-9 h-9 rounded-lg border border-white/10 object-cover" />
                                    {:else}
                                        <div class="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-base">
                                            {classIcons[player.className] ?? '👤'}
                                        </div>
                                    {/if}
                                    <!-- Not completed badge -->
                                    {#if !player.completed}
                                        <span class="absolute -top-1 -right-1 text-[8px] bg-slate-700 text-slate-400 rounded px-0.5 font-bold">DNF</span>
                                    {/if}
                                </div>

                                <!-- Name + class -->
                                <div class="flex-1 min-w-0">
                                    {#if player.code}
                                        <a href="/profile/{encodeURIComponent(player.name)}/{player.code}"
                                           onclick={(e) => e.stopPropagation()}
                                           class="text-sm font-semibold text-white hover:text-emerald-400 transition-colors truncate block">
                                            {player.name}<span class="text-slate-600 text-xs font-normal">#{player.code}</span>
                                        </a>
                                    {:else}
                                        <span class="text-sm font-semibold text-slate-400 truncate block">{player.name}</span>
                                    {/if}
                                    <p class="text-[10px] text-slate-600 uppercase tracking-wider">{player.className}</p>
                                </div>

                                <!-- K/D/A compact -->
                                <div class="shrink-0 text-right mr-2">
                                    <p class="text-sm font-mono font-bold text-white">
                                        {player.k}/{player.d}/{player.a}
                                    </p>
                                    <p class="text-[10px] text-slate-500">
                                        {player.kd} KD
                                    </p>
                                </div>

                                <!-- Motes banked badge -->
                                <div class="shrink-0 text-center min-w-[3rem]">
                                    <p class="text-xs font-bold {(player.stats.motesDeposited ?? 0) >= 15 ? 'text-emerald-400' : 'text-slate-400'}">
                                        {player.stats.motesDeposited ?? 0}
                                    </p>
                                    <p class="text-[9px] text-slate-600 uppercase">MB</p>
                                </div>

                                <!-- Invasions badge -->
                                {#if (player.stats.invasions ?? 0) > 0}
                                    <div class="shrink-0 text-center min-w-[3rem]">
                                        <p class="text-xs font-bold text-violet-400">{player.stats.invasions}</p>
                                        <p class="text-[9px] text-slate-600 uppercase">INV</p>
                                    </div>
                                {/if}

                                <!-- Expand chevron -->
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                                     class="w-4 h-4 text-slate-600 shrink-0 transition-transform {isExpanded ? 'rotate-180' : ''}">
                                    <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
                                </svg>
                            </button>

                            <!-- Expanded stat drawer -->
                            {#if isExpanded}
                                <div class="px-4 pb-4 pt-1 border-t border-white/[0.06]">
                                    <!-- Full stat grid -->
                                    <div class="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-2">
                                        {#each [...ROW_STATS, ...DRAWER_STATS] as { key, label }}
                                            {@const val = player.stats[key] ?? null}
                                            {#if val !== null}
                                                <div class="bg-white/[0.03] rounded-lg px-3 py-2 text-center">
                                                    <p class="text-xs font-bold text-white">{fmtNum(val)}</p>
                                                    <p class="text-[9px] text-slate-600 mt-0.5 uppercase tracking-wider">{label}</p>
                                                </div>
                                            {/if}
                                        {/each}
                                    </div>

                                    <!-- Profile link -->
                                    {#if player.code}
                                        <div class="mt-3 flex justify-end">
                                            <a href="/profile/{encodeURIComponent(player.name)}/{player.code}"
                                               class="text-xs text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1">
                                                View full profile
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5">
                                                    <path fill-rule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clip-rule="evenodd" />
                                                </svg>
                                            </a>
                                        </div>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            {/each}
        </div>

        <!-- ── Team comparison bar chart ─────────────────────────────────── -->
        <div class="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
            <h2 class="text-xs text-slate-500 uppercase tracking-widest font-semibold mb-5">
                Team Comparison
            </h2>
            <div class="space-y-3">
                {#each [
                    { key: 'kills',          label: 'Total Kills'      },
                    { key: 'motesDeposited', label: 'Motes Banked'     },
                    { key: 'motesDenied',    label: 'Motes Denied'     },
                    { key: 'invasions',      label: 'Invasions'        },
                    { key: 'invasionKills',  label: 'Invasion Kills'   },
                    { key: 'primevalDamage', label: 'Primeval Damage'  },
                ] as { key, label }}
                    {@const a = teamTotal(data.teamA, key)}
                    {@const b = teamTotal(data.teamB, key)}
                    {@const total = a + b}
                    {@const pctA = total > 0 ? Math.round((a / total) * 100) : 50}
                    {@const pctB = 100 - pctA}
                    {#if total > 0}
                        <div>
                            <div class="flex justify-between text-[10px] text-slate-500 mb-1.5 uppercase tracking-wider">
                                <span class="{data.teamAWon ? 'text-emerald-400' : 'text-slate-400'} font-bold">{a}</span>
                                <span>{label}</span>
                                <span class="{data.teamBWon ? 'text-emerald-400' : 'text-slate-400'} font-bold">{b}</span>
                            </div>
                            <div class="h-1.5 rounded-full overflow-hidden flex bg-white/5">
                                <div class="h-full rounded-full transition-all
                                            {data.teamAWon ? 'bg-emerald-500' : 'bg-red-500/60'}"
                                     style="width: {pctA}%"></div>
                                <div class="h-full flex-1 rounded-full
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
