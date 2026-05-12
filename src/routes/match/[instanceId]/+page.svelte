<script>
    import { egoColor, ngrTier, ngrTierColor } from '$lib/ego.js';
    import { fly, fade } from 'svelte/transition';

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

    let expandedPlayer = $state(null);
    function togglePlayer(id) { expandedPlayer = expandedPlayer === id ? null : id; }

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
        { key: 'smallBlooms',       label: 'Small Blockers',    color: 'text-zinc-400'  },
        { key: 'largeBlooms',       label: 'Large Blockers',    color: 'text-zinc-300'  },
    ];
</script>

<!-- ── Gemini snippets ────────────────────────────────────────────────────── -->
{#snippet ghostLabel({ text, className = "" })}
    <span class="text-[8px] font-sans text-zinc-500 uppercase tracking-[0.2em] font-bold block mb-1 {className}">{text}</span>
{/snippet}

{#snippet stoneCard({ title = null, className = "" }, contentSnippet)}
    <div class="bg-[#111111] border border-zinc-800 p-5 relative shadow-[inset_0_0_30px_rgba(0,0,0,0.5)] group overflow-hidden transition-all duration-500 hover:border-zinc-700 {className} stone-card">
        <div class="sheen-overlay"></div>
        {#if title} {@render ghostLabel({ text: title })} {/if}
        <div class="relative z-10"> {@render contentSnippet()} </div>
    </div>
{/snippet}

{#snippet medalIconBadge({ medal })}
    <div class="group relative flex items-center justify-center w-10 h-10 border border-amber-500/20 bg-amber-950/10 rotate-45 transition-all hover:scale-110 hover:rotate-90 cursor-help overflow-hidden">
        <div class="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent opacity-50"></div>
        {#if medal.icon}
            <img src={medal.icon} alt={medal.label} class="w-8 h-8 -rotate-45 group-hover:-rotate-90 transition-transform object-contain" />
        {:else}
            <span class="text-[10px] font-bold text-amber-500 -rotate-45 group-hover:-rotate-90 transition-all">★</span>
        {/if}
        {#if medal.count > 1}
            <div class="absolute bottom-1 right-1 bg-black/80 border border-amber-500/40 px-1 py-0.5 -rotate-45 group-hover:-rotate-90 transition-all">
                <span class="text-[8px] font-black text-amber-400 leading-none">x{medal.count}</span>
            </div>
        {/if}
        <!-- Tooltip -->
        <div class="absolute bottom-full mb-4 px-3 py-1.5 bg-[#0a0a0a] border border-zinc-800 text-[9px] uppercase tracking-[0.2em] text-zinc-100 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-[100] shadow-2xl rotate-[-45deg] group-hover:rotate-[-90deg] font-sans">
            {medal.label}
        </div>
    </div>
{/snippet}

<svelte:head>
    <title>{data.mapName} Match Intelligence · Jadestone</title>
</svelte:head>

<div class="min-h-screen bg-[#080808] text-slate-200 font-sans overflow-x-hidden">
    <!-- ── Hero Section ──────────────────────────────────────────────────────── -->
    <header class="h-80 relative border-b border-zinc-800 overflow-hidden shrink-0">
        {#if data.pgcrImage}
            <div class="absolute inset-0 z-0">
                <img src={data.pgcrImage} alt={data.mapName} class="w-full h-full object-cover grayscale-[0.3] opacity-40 contrast-125" />
                <div class="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/60 to-transparent z-10"></div>
            </div>
        {/if}
        <div class="max-w-7xl mx-auto h-full p-10 flex flex-col justify-end relative z-30 font-sans">
            <a href="/profile/{data.teamA[0]?.name}/{data.teamA[0]?.code}" class="text-[10px] font-sans font-bold text-emerald-500 uppercase tracking-[0.3em] mb-6 hover:text-emerald-400 transition-colors">← Back to Profile</a>
            <div class="flex items-end gap-10">
                {#if data.mapIcon}
                    <div class="w-24 h-24 bg-[#0c0c0c] border border-zinc-700 p-1.5 relative shadow-2xl overflow-hidden rotate-45 shrink-0 group hover:rotate-90 transition-all duration-700">
                        <img src={data.mapIcon} alt={data.mapName} class="w-full h-full object-cover -rotate-45 group-hover:-rotate-90 transition-all duration-700 opacity-80" />
                    </div>
                {/if}
                <div class="mb-2 flex-1">
                    <span class="text-[12px] font-sans text-emerald-500 uppercase tracking-[0.4em] font-black block mb-2">Gambit Intelligence PGCR</span>
                    <h1 class="text-6xl font-light italic tracking-tighter uppercase leading-none text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]">{data.mapName}</h1>
                    <div class="flex items-center gap-6 mt-6 font-sans text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                        <div class="flex items-center gap-2"> <div class="w-1.5 h-1.5 bg-emerald-500 rotate-45"></div> {timeAgo(data.period)} </div>
                        <div class="flex items-center gap-2"> <div class="w-1.5 h-1.5 bg-zinc-700 rotate-45"></div> {fmtDuration(data.duration)} </div>
                        {#if data.lobbyTier && data.lobbyTier !== 'Unranked'}
                            <div class="flex items-center gap-2 border border-emerald-500/20 px-3 py-1 bg-emerald-950/10">
                                <span class="text-emerald-500">{data.lobbyTier} LOBBY</span>
                                {#if data.lobbyModifier} <span class="text-zinc-600">/ {data.lobbyModifier}</span> {/if}
                            </div>
                        {/if}
                    </div>
                </div>
                <div class="text-right shrink-0">
                    {@render ghostLabel({ text: "INSTANCE_ID" })}
                    <span class="text-2xl font-mono text-zinc-700 select-all">{data.instanceId}</span>
                </div>
            </div>
        </div>
    </header>

    <main class="max-w-7xl mx-auto p-10 space-y-12">
        <!-- ── Scoreboard Banner ─────────────────────────────────────────────── -->
        <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-10 bg-[#0c0c0c] border border-zinc-800 p-8 shadow-2xl relative overflow-hidden">
            <div class="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-emerald-500/50 via-transparent to-rose-500/50"></div>
            
            <!-- Alpha Team -->
            <div class="text-center font-sans">
                <p class="text-4xl font-black italic uppercase tracking-tighter {data.teamAWon ? 'text-emerald-500' : 'text-rose-500'}">{data.teamAWon ? 'VICTORY' : 'DEFEAT'}</p>
                <p class="text-[10px] font-bold text-zinc-500 tracking-[0.3em] uppercase mt-1">Alpha Intelligence</p>
                <div class="flex justify-center gap-8 mt-6">
                    <div class="text-center"> <p class="text-[8px] text-zinc-600 uppercase font-bold tracking-widest">Banked</p> <p class="text-xl font-light text-emerald-400 italic">{teamTotal(data.teamA, 'motesDeposited')}</p> </div>
                    <div class="text-center"> <p class="text-[8px] text-zinc-600 uppercase font-bold tracking-widest">Efficiency</p> <p class="text-xl font-light text-zinc-200 italic">{teamTotal(data.teamA, 'kills')} / {teamTotal(data.teamA, 'deaths')}</p> </div>
                </div>
                <div class="mt-6 flex flex-col items-center">
                    <div class="text-[9px] text-zinc-600 uppercase font-black tracking-[0.2em] mb-1">TEAM_RATING</div>
                    <span class="text-2xl font-light italic text-white" style="color: {egoColor(teamAvgEgo(data.teamA))}">{teamAvgEgo(data.teamA).toFixed(1)}</span>
                </div>
            </div>

            <!-- VS Divider -->
            <div class="flex flex-col items-center gap-4 py-4 opacity-30">
                <div class="w-[1px] h-12 bg-zinc-600"></div>
                <div class="w-6 h-6 border border-zinc-600 rotate-45 flex items-center justify-center font-black text-[10px]">VS</div>
                <div class="w-[1px] h-12 bg-zinc-600"></div>
            </div>

            <!-- Bravo Team -->
            <div class="text-center font-sans">
                <p class="text-4xl font-black italic uppercase tracking-tighter {data.teamBWon ? 'text-emerald-500' : 'text-rose-500'}">{data.teamBWon ? 'VICTORY' : 'DEFEAT'}</p>
                <p class="text-[10px] font-bold text-zinc-500 tracking-[0.3em] uppercase mt-1">Bravo Intelligence</p>
                <div class="flex justify-center gap-8 mt-6">
                    <div class="text-center"> <p class="text-[8px] text-zinc-600 uppercase font-bold tracking-widest">Banked</p> <p class="text-xl font-light text-emerald-400 italic">{teamTotal(data.teamB, 'motesDeposited')}</p> </div>
                    <div class="text-center"> <p class="text-[8px] text-zinc-600 uppercase font-bold tracking-widest">Efficiency</p> <p class="text-xl font-light text-zinc-200 italic">{teamTotal(data.teamB, 'kills')} / {teamTotal(data.teamB, 'deaths')}</p> </div>
                </div>
                <div class="mt-6 flex flex-col items-center">
                    <div class="text-[9px] text-zinc-600 uppercase font-black tracking-[0.2em] mb-1">TEAM_RATING</div>
                    <span class="text-2xl font-light italic text-white" style="color: {egoColor(teamAvgEgo(data.teamB))}">{teamAvgEgo(data.teamB).toFixed(1)}</span>
                </div>
            </div>
        </div>

        <!-- ── Player Grid ───────────────────────────────────────────────────── -->
        <div class="grid grid-cols-2 gap-8 font-sans">
            {#each [{ players: data.teamA, won: data.teamAWon, label: 'ALPHA' }, { players: data.teamB, won: data.teamBWon, label: 'BRAVO' }] as team}
                <div class="space-y-4">
                    <div class="flex items-center gap-3 mb-6">
                        <div class="w-2 h-2 rotate-45 {team.won ? 'bg-emerald-500' : 'bg-rose-500'}"></div>
                        <h2 class="text-[12px] font-black tracking-[0.4em] uppercase text-zinc-400">ENCOUNTER_ROSTER: {team.label}</h2>
                        <div class="flex-1 h-[1px] bg-zinc-800 opacity-30"></div>
                    </div>
                    
                    {#each team.players as p}
                        {@const uid = `${p.membershipId}-${p.name}`}
                        {@const isExp = expandedPlayer === uid}
                        
                        <div class="group bg-[#111111] border border-zinc-800 hover:border-zinc-600 transition-all duration-300 {p.role==='carry' ? 'border-l-4 border-l-amber-500' : ''}">
                            <button onclick={() => togglePlayer(uid)} class="w-full p-4 flex items-center gap-6">
                                <div class="relative">
                                    <div class="w-12 h-12 bg-zinc-900 border border-zinc-800 relative overflow-hidden rotate-45 group-hover:rotate-90 transition-all duration-500">
                                        {#if p.icon}
                                            <img src={p.icon} alt={p.name} class="w-full h-full object-cover -rotate-45 group-hover:-rotate-90 transition-all duration-500" />
                                        {:else}
                                            <div class="w-full h-full flex items-center justify-center -rotate-45 group-hover:-rotate-90 transition-all duration-500 font-black text-zinc-700">?</div>
                                        {/if}
                                    </div>
                                    {#if p.role === 'carry'}
                                        <div class="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 flex items-center justify-center rotate-45 shadow-[0_0_10px_rgba(245,158,11,0.5)]">
                                            <span class="text-[8px] font-black text-black -rotate-45">★</span>
                                        </div>
                                    {/if}
                                </div>
                                <div class="flex-1 text-left min-w-0">
                                    <div class="flex items-baseline gap-2">
                                        <span class="text-sm font-black italic uppercase tracking-wider text-zinc-100 truncate">{p.name}</span>
                                        {#if p.code} <span class="text-[10px] font-sans font-bold text-zinc-700">#{p.code}</span> {/if}
                                    </div>
                                    <p class="text-[8px] font-bold text-zinc-600 uppercase tracking-widest mt-1">{p.className}</p>
                                </div>
                                
                                <div class="text-right px-4 border-x border-zinc-800/50">
                                    <p class="text-[8px] text-zinc-700 uppercase font-black tracking-widest mb-0.5">Rating</p>
                                    <span class="text-xl font-light italic font-sans" style="color: {egoColor(p.ego?.finalScore ?? 0)}">{p.ego?.finalScore ?? '—'}</span>
                                </div>

                                <div class="text-right min-w-[80px]">
                                    <p class="text-xs font-bold text-zinc-200">{p.k}/{p.d}/{p.a}</p>
                                    <p class="text-[8px] font-black text-zinc-600 uppercase tracking-widest mt-1">{p.kd} KD</p>
                                </div>
                            </button>

                            {#if isExp}
                                <div in:fly={{ y: -10, duration: 400 }} class="p-6 border-t border-zinc-800/50 bg-[#0a0a0a]/50">
                                    <div class="grid grid-cols-2 gap-10">
                                        <!-- Left: EGO & Performance -->
                                        <div>
                                            {@render ghostLabel({ text: "PERFORMANCE_BREAKDOWN" })}
                                            <div class="space-y-3 mt-4">
                                                {#each Object.entries(p.ego?.components ?? {}) as [comp, val]}
                                                    <div class="flex items-center gap-3">
                                                        <span class="text-[9px] font-black text-zinc-500 uppercase w-16 tracking-widest">{comp}</span>
                                                        <div class="flex-1 h-1 bg-zinc-900 overflow-hidden">
                                                            <div class="h-full {comp==='PvE'?'bg-sky-500':comp==='PvP'?'bg-rose-500':comp==='Banking'?'bg-emerald-500':'bg-amber-500'}" 
                                                                 style="width: {Math.min(100, val)}%"></div>
                                                        </div>
                                                        <span class="text-[10px] font-mono font-bold text-zinc-400">{val}</span>
                                                    </div>
                                                {/each}
                                            </div>
                                            
                                            <!-- Medal Shelf -->
                                            <div class="mt-8">
                                                {@render ghostLabel({ text: "ACHIEVED_MEDALS" })}
                                                <div class="flex flex-wrap gap-4 mt-4">
                                                    {#each (p.medalList ?? []) as medal}
                                                        {@render medalIconBadge({ medal })}
                                                    {/each}
                                                    {#if !(p.medalList?.length)}
                                                        <p class="text-[10px] text-zinc-700 italic uppercase tracking-widest">No medals recorded.</p>
                                                    {/if}
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Right: Combat Intelligence -->
                                        <div>
                                            {@render ghostLabel({ text: "WEAPON_RESONANCE" })}
                                            <div class="grid gap-3 mt-4">
                                                {#each (p.weapons ?? []) as w}
                                                    <div class="flex items-center gap-4 bg-zinc-950/50 border border-zinc-900 p-2 group/weapon hover:border-zinc-700 transition-colors">
                                                        <div class="w-10 h-10 bg-zinc-900 border border-zinc-800 relative overflow-hidden shrink-0">
                                                            {#if w.icon} <img src={w.icon} alt={w.name} class="w-full h-full object-cover" /> {/if}
                                                            <div class="absolute top-0 left-0 w-full h-[1px] {w.tier>=6 ? 'bg-amber-500' : 'bg-zinc-500'}"></div>
                                                        </div>
                                                        <div class="flex-1 min-w-0">
                                                            <p class="text-[11px] font-black italic uppercase text-zinc-200 truncate">{w.name}</p>
                                                            <p class="text-[9px] font-mono text-zinc-600 mt-0.5">{w.kills} HOSTILES • {w.precision} PREC</p>
                                                        </div>
                                                        <a href="https://destinyitemmanager.com/en/inspect/{w.hash}" target="_blank" class="opacity-0 group-hover/weapon:opacity-100 transition-opacity px-2 py-1 border border-emerald-500/30 text-emerald-500 text-[8px] font-black uppercase tracking-tighter hover:bg-emerald-500/10">DIM</a>
                                                    </div>
                                                {/each}
                                            </div>

                                            <div class="mt-8">
                                                {@render ghostLabel({ text: "STATISTICAL_VECTORS" })}
                                                <div class="grid grid-cols-2 gap-x-8 gap-y-1 mt-4">
                                                    {#each DETAIL_STATS.slice(3, 11) as { key, label, color }}
                                                        {@const val = p.stats[key] ?? 0}
                                                        <div class="flex justify-between items-center border-b border-zinc-900 py-1">
                                                            <span class="text-[9px] font-sans text-zinc-600 uppercase tracking-widest">{label}</span>
                                                            <span class="text-[10px] font-mono font-bold text-zinc-300">{fmtNum(val)}</span>
                                                        </div>
                                                    {/each}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            {/each}
        </div>

        <!-- ── Comparative Analytics ────────────────────────────────────────── -->
        <div class="grid grid-cols-2 gap-10">
            <div class="bg-[#111111] border border-zinc-800 p-8 shadow-inner relative overflow-hidden stone-card">
                <div class="sheen-overlay"></div>
                {@render ghostLabel({ text: "BATTLE_METRICS_COMPARISON" })}
                <div class="space-y-6 mt-8 relative z-10">
                    {#each [{ key: 'motesDeposited', label: 'Motes Banked' }, { key: 'kills', label: 'Hostiles Slain' }, { key: 'primevalDamage', label: 'Primeval DPS' }, { key: 'invasions', label: 'Invasion Vectors' }] as { key, label }}
                        {@const a = teamTotal(data.teamA, key)}
                        {@const b = teamTotal(data.teamB, key)}
                        {@const total = Math.max(a + b, 1)}
                        {@const pctA = (a / total) * 100}
                        <div class="space-y-2">
                            <div class="flex justify-between text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">
                                <span class={data.teamAWon ? 'text-emerald-500' : ''}>{fmtNum(a)}</span>
                                <span>{label}</span>
                                <span class={data.teamBWon ? 'text-emerald-500' : ''}>{fmtNum(b)}</span>
                            </div>
                            <div class="h-1 bg-zinc-900 flex">
                                <div class="h-full {data.teamAWon ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-zinc-700'}" style="width: {pctA}%"></div>
                                <div class="h-full {data.teamBWon ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-zinc-700'} flex-1"></div>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>

            <div class="bg-[#111111] border border-zinc-800 p-8 shadow-inner relative overflow-hidden stone-card">
                <div class="sheen-overlay"></div>
                {@render ghostLabel({ text: "INTELLIGENCE_LEGEND" })}
                <div class="grid grid-cols-2 gap-4 mt-8 relative z-10">
                    {#each [{ range: '110+', label: 'ELITE', color: '#c084fc' }, { range: '80–109', label: 'STRONG', color: '#10b981' }, { range: '50–79', label: 'AVERAGE', color: '#cbd5e1' }, { range: '<50', label: 'RECLAIMED', color: '#f87171' }] as tier}
                        <div class="border border-zinc-800 p-3 bg-zinc-950/50">
                            <p class="text-xs font-black italic" style="color: {tier.color}">{tier.range}</p>
                            <p class="text-[8px] font-bold text-zinc-600 uppercase tracking-widest mt-1">{tier.label} DATASTREAM</p>
                        </div>
                    {/each}
                </div>
                <p class="text-[9px] font-sans text-zinc-600 mt-10 leading-relaxed uppercase tracking-widest font-bold">
                    EGO Ratings are computed via a multi-vector calculus encompassing PvE impact, banking reliability, and PvP efficiency multipliers.
                </p>
            </div>
        </div>
    </main>
</div>

<style>
    .stone-card {
        box-shadow: inset 0 0 30px rgba(0,0,0,0.5);
    }
    .sheen-overlay {
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 50%, rgba(255,255,255,0.02) 100%);
        pointer-events: none;
    }
</style>
