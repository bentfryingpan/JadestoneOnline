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
    function teamTotal(players, key) {
        return players.reduce((sum, p) => sum + (p.stats[key] ?? 0), 0);
    }
    function teamAvgEgo(players) {
        const done = players.filter(p => p.score > 0);
        if (!done.length) return 0;
        return done.reduce((s, p) => s + p.score, 0) / done.length;
    }

    let expandedPlayer = $state(null);
    function togglePlayer(id) { expandedPlayer = expandedPlayer === id ? null : id; }

    const COMBAT_STATS = [
        { key: 'kills', label: 'Hostiles', color: 'text-zinc-200' },
        { key: 'precisionKills', label: 'Precision', color: 'text-emerald-400' },
        { key: 'grenadeKills', label: 'Grenade', color: 'text-sky-400' },
        { key: 'meleeKills', label: 'Melee', color: 'text-orange-400' },
        { key: 'superKills', label: 'Super', color: 'text-amber-400' },
    ];

    const GAMBIT_STATS = [
        { key: 'motesDeposited', label: 'Banked', color: 'text-emerald-500' },
        { key: 'motesLost', label: 'Lost', color: 'text-rose-500' },
        { key: 'motesDenied', label: 'Denied', color: 'text-violet-500' },
        { key: 'invasions', label: 'Invasions', color: 'text-violet-400' },
        { key: 'invasionKills', label: 'Invasion Kills', color: 'text-violet-300' },
    ];
</script>

{#snippet ghostLabel({ text, className = "" })}
    <span class="text-[8px] font-sans text-zinc-500 uppercase tracking-[0.2em] font-bold block mb-1 {className}">{text}</span>
{/snippet}

{#snippet medalBadge({ medal })}
    <div class="group relative flex items-center justify-center w-12 h-12 border border-amber-500/20 bg-amber-950/10 rotate-45 transition-all hover:scale-110 hover:rotate-90 cursor-help overflow-hidden">
        {#if medal.icon}
            <img src={medal.icon} alt={medal.label} class="w-10 h-10 -rotate-45 group-hover:-rotate-90 transition-transform object-contain" />
        {:else}
            <span class="text-[10px] font-bold text-amber-500 -rotate-45 group-hover:-rotate-90 transition-all">★</span>
        {/if}
        {#if medal.count > 1}
            <div class="absolute bottom-1 right-1 bg-black/80 border border-amber-500/40 px-1 py-0.5 -rotate-45 group-hover:-rotate-90 transition-all">
                <span class="text-[8px] font-black text-amber-400 leading-none">x{medal.count}</span>
            </div>
        {/if}
        <div class="absolute bottom-full mb-4 px-3 py-1.5 bg-[#0a0a0a] border border-zinc-800 text-[9px] uppercase tracking-[0.2em] text-zinc-100 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-[100] shadow-2xl rotate-[-45deg] group-hover:rotate-[-90deg] font-sans">
            {medal.label}
        </div>
    </div>
{/snippet}

<div class="min-h-screen bg-[#080808] text-slate-200 font-sans overflow-x-hidden">
    <header class="h-80 relative border-b border-zinc-800 overflow-hidden shrink-0">
        {#if data.pgcrImage}
            <div class="absolute inset-0 z-0">
                <img src={data.pgcrImage} alt={data.mapName} class="w-full h-full object-cover grayscale-[0.3] opacity-40 contrast-125" />
                <div class="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/60 to-transparent z-10"></div>
            </div>
        {/if}
        <div class="max-w-7xl mx-auto h-full p-10 flex flex-col justify-end relative z-30 font-sans">
            <div class="flex items-end gap-10">
                <div class="mb-2 flex-1">
                    <span class="text-[12px] font-sans text-emerald-500 uppercase tracking-[0.4em] font-black block mb-2">PGCR Intelligence</span>
                    <h1 class="text-6xl font-light italic tracking-tighter uppercase leading-none text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]">{data.mapName}</h1>
                    <div class="flex items-center gap-6 mt-6 font-sans text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                        <div class="flex items-center gap-2"> <div class="w-1.5 h-1.5 bg-emerald-500 rotate-45"></div> {timeAgo(data.period)} </div>
                        <div class="flex items-center gap-2"> <div class="w-1.5 h-1.5 bg-zinc-700 rotate-45"></div> {fmtDuration(data.duration)} </div>
                    </div>
                </div>
            </div>
        </div>
    </header>

    <main class="max-w-7xl mx-auto p-10 space-y-12">
        <div class="grid grid-cols-2 gap-12">
            {#each [{ players: data.teamA, won: data.teamAWon, label: 'ALPHA' }, { players: data.teamB, won: data.teamBWon, label: 'BRAVO' }] as team}
                <div class="space-y-6">
                    <div class="flex items-center justify-between border-b border-zinc-800 pb-4">
                        <div class="flex items-center gap-3">
                            <div class="w-3 h-3 rotate-45 {team.won ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-rose-500'}"></div>
                            <h2 class="text-sm font-black tracking-[0.4em] uppercase text-zinc-100">{team.label} INTEL</h2>
                        </div>
                        <span class="text-xl font-light italic text-white" style="color: {egoColor(teamAvgEgo(team.players))}">{teamAvgEgo(team.players).toFixed(1)} <span class="text-[10px] font-bold text-zinc-700 not-italic ml-1 uppercase">TEAM EGO</span></span>
                    </div>
                    
                    {#each team.players as p}
                        {@const uid = `${p.membershipId}-${p.name}`}
                        {@const isExp = expandedPlayer === uid}
                        <div class="bg-[#111111] border border-zinc-800 hover:border-zinc-700 transition-all duration-300">
                            <button onclick={() => togglePlayer(uid)} class="w-full p-6 flex items-center gap-8">
                                <div class="w-14 h-14 bg-zinc-900 border border-zinc-800 relative overflow-hidden rotate-45 shrink-0 group-hover:rotate-90 transition-all duration-500">
                                    {#if p.icon} <img src={p.icon} alt={p.name} class="w-full h-full object-cover -rotate-45 group-hover:-rotate-90 transition-all duration-500 opacity-80" /> {/if}
                                </div>
                                <div class="flex-1 text-left min-w-0">
                                    <div class="flex items-baseline gap-2">
                                        <span class="text-lg font-black italic uppercase tracking-wider text-zinc-100 truncate">{p.name}</span>
                                        <span class="text-[10px] font-mono text-zinc-700">#{p.code}</span>
                                    </div>
                                    <p class="text-[9px] font-bold text-zinc-600 uppercase tracking-[0.2em] mt-1">{p.className}</p>
                                </div>
                                <div class="text-right px-6 border-x border-zinc-800/50">
                                    {@render ghostLabel({ text: "RATING" })}
                                    <span class="text-2xl font-light italic font-sans" style="color: {egoColor(p.score)}">{p.score}</span>
                                </div>
                                <div class="text-right min-w-[100px]">
                                    <p class="text-sm font-black text-zinc-200">{p.k} / {p.d} / {p.a}</p>
                                    <p class="text-[9px] font-bold text-zinc-600 uppercase tracking-widest mt-1">{p.kd} EFFICIENCY</p>
                                </div>
                            </button>

                            {#if isExp}
                                <div in:fly={{ y: -10, duration: 400 }} class="p-8 border-t border-zinc-800/50 bg-[#0a0a0a]/50 space-y-10">
                                    <div class="grid grid-cols-2 gap-12">
                                        <!-- Column 1: Combat Performance -->
                                        <div class="space-y-6">
                                            {@render ghostLabel({ text: "COMBAT_VECTOR_ANALYSIS" })}
                                            <div class="grid grid-cols-2 gap-4">
                                                {#each COMBAT_STATS as { key, label, color }}
                                                    <div class="bg-zinc-900/30 border border-zinc-800 p-3">
                                                        <p class="text-[8px] font-bold text-zinc-600 uppercase tracking-widest">{label}</p>
                                                        <p class="text-lg font-light italic {color}">{p.stats[key] ?? 0}</p>
                                                    </div>
                                                {/each}
                                            </div>
                                            <div class="mt-8">
                                                {@render ghostLabel({ text: "ACHIEVED_MEDALS" })}
                                                <div class="flex flex-wrap gap-4 mt-4">
                                                    {#each (p.medalList ?? []) as medal}
                                                        {@render medalBadge({ medal })}
                                                    {/each}
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Column 2: Gambit Intelligence -->
                                        <div class="space-y-6">
                                            {@render ghostLabel({ text: "GAMBIT_PROTOCOL_STATS" })}
                                            <div class="grid grid-cols-2 gap-4">
                                                {#each GAMBIT_STATS as { key, label, color }}
                                                    <div class="bg-zinc-900/30 border border-zinc-800 p-3">
                                                        <p class="text-[8px] font-bold text-zinc-600 uppercase tracking-widest">{label}</p>
                                                        <p class="text-lg font-light italic {color}">{p.stats[key] ?? 0}</p>
                                                    </div>
                                                {/each}
                                            </div>
                                            <div class="mt-8">
                                                {@render ghostLabel({ text: "WEAPON_RESONANCE" })}
                                                <div class="space-y-2 mt-4">
                                                    {#each (p.weapons ?? []) as w}
                                                        <div class="flex items-center justify-between bg-zinc-900/50 border border-zinc-800 p-2 group/weapon hover:border-zinc-600 transition-colors">
                                                            <div class="flex items-center gap-3">
                                                                <img src={w.icon} alt={w.name} class="w-8 h-8 opacity-70 group-hover/weapon:opacity-100 transition-opacity" />
                                                                <div>
                                                                    <p class="text-[10px] font-black italic uppercase text-zinc-200">{w.name}</p>
                                                                    <p class="text-[8px] text-zinc-600 uppercase font-bold">{w.kills} KILLS</p>
                                                                </div>
                                                            </div>
                                                            <a href="https://destinyitemmanager.com/en/inspect/{w.hash}" target="_blank" class="px-2 py-1 border border-emerald-500/20 text-[8px] text-emerald-500 font-black hover:bg-emerald-500/10 opacity-0 group-hover/weapon:opacity-100 transition-opacity">DIM</a>
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
