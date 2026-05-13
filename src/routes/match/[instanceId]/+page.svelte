<script>
    import { egoColor } from '$lib/ego.js';
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
    function teamAvgEgo(players) {
        const done = players.filter(p => p.score > 0);
        if (!done.length) return 0;
        return done.reduce((s, p) => s + p.score, 0) / done.length;
    }

    let expandedPlayer = $state(null);
    function togglePlayer(id) { expandedPlayer = expandedPlayer === id ? null : id; }

    const PRIMARY_STATS = [
        { key: 'kills', label: 'HOSTILES', color: 'text-zinc-100' },
        { key: 'motesDeposited', label: 'BANKED', color: 'text-emerald-400' },
        { key: 'invasionKills', label: 'INVASION', color: 'text-violet-400' },
        { key: 'primevalDamage', label: 'DPS', color: 'text-amber-400' },
    ];

    const ABILITY_STATS = [
        { key: 'precisionKills', label: 'Precision', color: 'text-emerald-500' },
        { key: 'weaponKillsGrenade', label: 'Grenade', color: 'text-sky-400' },
        { key: 'weaponKillsMelee', label: 'Melee', color: 'text-orange-400' },
        { key: 'weaponKillsSuper', label: 'Super', color: 'text-amber-300' },
    ];

    const LOSS_STATS = [
        { key: 'deaths', label: 'Deaths', color: 'text-rose-500' },
        { key: 'motesLost', label: 'Motes Lost', color: 'text-rose-400' },
        { key: 'motesDenied', label: 'Denied', color: 'text-violet-500' },
    ];
</script>

{#snippet ghostLabel({ text, className = "" })}
    <span class="text-[8px] font-sans text-zinc-500 uppercase tracking-[0.2em] font-bold block mb-1 {className}">{text}</span>
{/snippet}

{#snippet medalIcon({ medal })}
    <div class="group relative flex items-center justify-center w-12 h-12">
        <!-- The Diamond Border (Handles Rotation) -->
        <div class="absolute inset-0 border border-amber-500/20 bg-amber-950/10 rotate-45 transition-all duration-500 group-hover:scale-110 group-hover:rotate-90 cursor-help overflow-hidden">
            {#if medal.icon}
                <img src={medal.icon} alt={medal.label} class="w-full h-full -rotate-45 group-hover:-rotate-90 transition-transform duration-500 object-contain p-1" />
            {:else}
                <div class="w-full h-full flex items-center justify-center -rotate-45 group-hover:-rotate-90 transition-all duration-500">
                    <span class="text-[10px] font-bold text-amber-500">★</span>
                </div>
            {/if}
            {#if medal.count > 1}
                <div class="absolute bottom-1 right-1 bg-black/80 border border-amber-500/40 px-1 py-0.5 -rotate-45 group-hover:-rotate-90 transition-all">
                    <span class="text-[8px] font-black text-amber-400 leading-none">x{medal.count}</span>
                </div>
            {/if}
        </div>

        <!-- Tooltip (Outside rotation and overflow for maximum visibility) -->
        <div class="absolute bottom-full mb-6 left-1/2 -translate-x-1/2 px-3 py-2 bg-[#0a0a0a] border border-zinc-800 text-[10px] uppercase tracking-[0.2em] text-zinc-100 opacity-0 group-hover:opacity-100 transition-all duration-300 whitespace-nowrap pointer-events-none z-[300] shadow-2xl scale-95 group-hover:scale-100 font-sans">
            <div class="relative z-10">{medal.label}</div>
            <div class="absolute top-full left-1/2 -translate-x-1/2 w-[1px] h-4 bg-amber-500/40"></div>
            <!-- Tooltip Backlight -->
            <div class="absolute inset-0 bg-amber-500/5 blur-sm -z-10"></div>
        </div>
    </div>
{/snippet}

<div class="min-h-screen bg-[#080808] text-slate-200 font-sans overflow-x-hidden">
    <header class="h-64 relative border-b border-zinc-800 overflow-hidden shrink-0">
        {#if data.pgcrImage}
            <div class="absolute inset-0 z-0">
                <img src={data.pgcrImage} alt={data.mapName} class="w-full h-full object-cover grayscale-[0.3] opacity-40 contrast-125" />
                <div class="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/60 to-transparent z-10"></div>
            </div>
        {/if}
        <div class="max-w-7xl mx-auto h-full p-10 flex flex-col justify-end relative z-30 font-sans">
            <div class="flex items-end justify-between">
                <div>
                    <span class="text-[10px] font-sans text-emerald-500 uppercase tracking-[0.4em] font-black block mb-2">INTELLIGENCE_PGCR</span>
                    <h1 class="text-5xl font-light italic tracking-tighter uppercase leading-none text-white drop-shadow-2xl">{data.mapName}</h1>
                </div>
                <div class="flex gap-8 text-right font-sans text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-2">
                    <div><span class="text-zinc-700 block mb-1">DATED</span>{timeAgo(data.period)}</div>
                    <div><span class="text-zinc-700 block mb-1">LENGTH</span>{fmtDuration(data.duration)}</div>
                </div>
            </div>
        </div>
    </header>

    <main class="max-w-7xl mx-auto p-10 space-y-8">
        <div class="grid grid-cols-2 gap-8">
            {#each [{ players: data.teamA, won: data.teamAWon, label: 'ALPHA' }, { players: data.teamB, won: data.teamBWon, label: 'BRAVO' }] as team}
                <div class="space-y-4">
                    <div class="flex items-center justify-between border-b border-zinc-800 pb-3">
                        <div class="flex items-center gap-3">
                            <div class="w-2.5 h-2.5 rotate-45 {team.won ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-rose-500'}"></div>
                            <h2 class="text-xs font-black tracking-[0.3em] text-zinc-100">{team.label}_OPS</h2>
                        </div>
                        <span class="text-sm font-light italic text-white" style="color: {egoColor(teamAvgEgo(team.players))}">{teamAvgEgo(team.players).toFixed(1)} <span class="text-[8px] font-bold text-zinc-700 not-italic ml-1 uppercase">TEAM_EGO</span></span>
                    </div>
                    
                    {#each team.players as p}
                        {@const uid = `${p.membershipId}-${p.name}`}
                        {@const isExp = expandedPlayer === uid}
                        <div class="bg-[#0c0c0c] border border-zinc-800 hover:border-zinc-700 transition-all duration-300">
                            <button onclick={() => togglePlayer(uid)} class="w-full p-4 flex items-center gap-6">
                                <div class="w-10 h-10 bg-zinc-900 border border-zinc-800 relative overflow-hidden rotate-45 shrink-0">
                                    {#if p.icon} <img src={p.icon} alt={p.name} class="w-full h-full object-cover -rotate-45 opacity-80" /> {/if}
                                </div>
                                <div class="flex-1 text-left min-w-0">
                                    <span class="text-base font-black italic uppercase tracking-wider text-zinc-100 truncate">{p.name}</span>
                                    <div class="flex gap-4 mt-1">
                                        {#each PRIMARY_STATS as { key, label, color }}
                                            <div class="flex items-baseline gap-1.5">
                                                <span class="text-[7px] font-bold text-zinc-600 uppercase">{label}</span>
                                                <span class="text-[10px] font-black {color}">{fmtNum(p.stats[key])}</span>
                                            </div>
                                        {/each}
                                    </div>
                                </div>
                                <div class="text-right px-4 border-l border-zinc-800/50">
                                    <span class="text-xl font-light italic" style="color: {egoColor(p.score)}">{p.score}</span>
                                    <p class="text-[7px] font-bold text-zinc-700 uppercase tracking-widest">EGO_RATING</p>
                                </div>
                            </button>

                            {#if isExp}
                                <div in:fly={{ y: -5, duration: 300 }} class="p-6 border-t border-zinc-800/50 bg-[#080808]/80 space-y-8">
                                    <div class="grid grid-cols-2 gap-8">
                                        <div>
                                            {@render ghostLabel({ text: "ABILITY_PRECISION" })}
                                            <div class="grid grid-cols-2 gap-3 mt-3">
                                                {#each ABILITY_STATS as { key, label, color }}
                                                    <div class="bg-zinc-950/50 border border-zinc-900 p-3">
                                                        <p class="text-[7px] font-bold text-zinc-700 uppercase tracking-widest">{label}</p>
                                                        <p class="text-base font-light italic {color}">{p.stats[key] ?? 0}</p>
                                                    </div>
                                                {/each}
                                                {#each LOSS_STATS as { key, label, color }}
                                                    <div class="bg-zinc-950/50 border border-zinc-900 p-3">
                                                        <p class="text-[7px] font-bold text-zinc-700 uppercase tracking-widest">{label}</p>
                                                        <p class="text-base font-light italic {color}">{p.stats[key] ?? 0}</p>
                                                    </div>
                                                {/each}
                                            </div>
                                        </div>

                                        <div>
                                            {@render ghostLabel({ text: "ACHIEVED_RECORDS" })}
                                            <div class="flex flex-wrap gap-3 mt-3">
                                                {#each (p.medalList ?? []) as medal}
                                                    {@render medalIcon({ medal })}
                                                {/each}
                                            </div>
                                            <div class="mt-8">
                                                {@render ghostLabel({ text: "EQUIPMENT_RESONANCE" })}
                                                <div class="space-y-1.5 mt-3">
                                                    {#each (p.weapons ?? []) as w}
                                                        <div class="flex items-center justify-between bg-zinc-950/50 border border-zinc-900 p-2 group/weapon">
                                                            <div class="flex items-center gap-3">
                                                                <img src={w.icon} alt={w.name} class="w-7 h-7 opacity-60 group-hover/weapon:opacity-100 transition-opacity" />
                                                                <div>
                                                                    <p class="text-[9px] font-black italic uppercase text-zinc-200">{w.name}</p>
                                                                    <p class="text-[7px] text-zinc-600 uppercase font-bold">{w.kills} KILLS</p>
                                                                </div>
                                                            </div>
                                                            <a href="https://destinyitemmanager.com/en/inspect/{w.hash}" target="_blank" class="px-2 py-0.5 border border-emerald-500/10 text-[7px] text-emerald-900 font-black hover:text-emerald-500 hover:border-emerald-500/40 transition-all">INSPECT</a>
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
    </main>
</div>
