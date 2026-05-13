<script>
    import { fly, fade } from 'svelte/transition';
    const BUNGIE_ROOT = 'https://www.bungie.net';

    let { weapon, onClose } = $props();
    let loading = $state(true);
    let details = $state(null);

    // Tooltip tracking
    let hoveredPerk = $state(null);
    let tooltipPos  = $state({ x: 0, y: 0 });

    async function fetchDetails() {
        try {
            const mid = weapon.membershipId ? `?mid=${weapon.membershipId}&mt=${weapon.membershipType}` : '';
            const res = await fetch(`/api/weapon/${weapon.hash}${mid}`);
            details = await res.json();
        } catch (e) {
            console.error('Failed to fetch weapon details', e);
        } finally {
            loading = false;
        }
    }

    $effect(() => {
        if (weapon?.hash) fetchDetails();
    });

    function getStatColor() {
        return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]';
    }

    function onPerkEnter(e, perk) {
        const rect = e.currentTarget.getBoundingClientRect();
        hoveredPerk = perk;
        tooltipPos = {
            x: rect.left + rect.width / 2,
            y: rect.top - 20
        };
    }
</script>

{#snippet perkIcon({ perk, large = false })}
    <div class="group/perk relative {large ? 'w-14 h-14' : 'w-12 h-12'} flex items-center justify-center cursor-help"
         onmouseenter={(e) => onPerkEnter(e, perk)}
         onmouseleave={() => hoveredPerk = null}>
        
        <!-- Circular Border (Larger Glow & Fills Blue on Hover) -->
        <div class="absolute inset-0 bg-zinc-950 border {perk.isEnhanced ? 'border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.15)]' : 'border-zinc-800'} rounded-full 
                    group-hover/perk:border-sky-400 group-hover/perk:bg-sky-500/25 group-hover/perk:shadow-[0_0_35px_rgba(56,189,248,0.7)] 
                    transition-all duration-300"></div>
        
        <!-- The Icon -->
        <img src={perk.icon} alt={perk.name} class="{large ? 'w-11 h-11' : 'w-9 h-9'} relative z-10 opacity-85 group-hover/perk:opacity-100 transition-opacity" />
        
        {#if perk.isEnhanced}
            <div class="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 z-20 flex items-center justify-center rounded-full shadow-lg border border-black/20">
                <span class="text-[8px] font-black text-black">E</span>
            </div>
        {/if}
    </div>
{/snippet}

<div class="fixed inset-0 z-[1000] flex items-center justify-center p-4 sm:p-6 font-sans" transition:fade={{ duration: 200 }}>
    <button class="absolute inset-0 bg-black/95 backdrop-blur-xl cursor-default border-none" onclick={onClose}></button>

    {#if loading}
        <div class="relative z-10 flex flex-col items-center gap-4">
            <div class="w-12 h-12 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <p class="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-500 text-center uppercase">SYNCHRONIZING_ARSENAL_DATA</p>
        </div>
    {:else if details}
        <div class="relative z-10 w-full max-w-6xl bg-[#0a0a0a] border border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]" in:fly={{ y: 20, duration: 400 }}>
            
            <!-- Banner / Screenshot -->
            <div class="h-64 relative shrink-0 border-b border-zinc-800 bg-zinc-950 z-50">
                {#if details.screenshot}
                    <img src={details.screenshot} alt={details.name} class="w-full h-full object-cover opacity-60 contrast-125 grayscale-[0.1]" />
                    <div class="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent"></div>
                {:else}
                    <div class="w-full h-full flex items-center justify-center opacity-10">
                        <div class="w-32 h-32 border border-zinc-500"></div>
                    </div>
                {/if}

                <div class="absolute bottom-0 left-0 w-full p-6 flex items-end justify-between">
                    <div class="flex items-center gap-6">
                        <div class="w-20 h-20 bg-zinc-900 border border-zinc-700 relative overflow-hidden shrink-0 shadow-2xl">
                            <img src={details.icon} alt={details.name} class="w-full h-full object-cover p-1" />
                            <div class="absolute top-0 left-0 w-full h-[2px] {details.isExotic ? 'bg-amber-500' : 'bg-zinc-500'}"></div>
                        </div>
                        <div>
                            <div class="flex items-center gap-2.5">
                                {#if details.damageType?.icon}
                                    <img src={details.damageType.icon} alt="Damage" class="w-5 h-5 opacity-90 shadow-[0_0_10px_rgba(255,255,255,0.2)]" />
                                {/if}
                                <span class="text-[10px] font-black tracking-[0.4em] {details.isExotic ? 'text-amber-500' : 'text-emerald-500'} uppercase">
                                    {details.tier} {details.type}
                                </span>
                            </div>
                            <h2 class="text-5xl font-light italic tracking-tighter uppercase text-white mt-1 drop-shadow-2xl">{details.name}</h2>
                        </div>
                    </div>
                    <button class="bg-white/5 hover:bg-white/10 border border-white/10 px-5 py-2 text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-xl" onclick={onClose}>CLOSE_ARCHIVE</button>
                </div>
            </div>

            <!-- Content Area -->
            <div class="flex-1 overflow-y-auto p-8 grid grid-cols-12 gap-10 scrollbar-hide bg-[#0a0a0a] z-10">
                
                <!-- Left: Stats -->
                <div class="col-span-12 lg:col-span-4 space-y-6 border-r border-zinc-800/30 pr-8">
                    <div>
                        <span class="text-[9px] font-sans text-zinc-500 uppercase tracking-[0.3em] font-bold block mb-6">BALLISTIC_DATA_MATRIX</span>
                        <div class="space-y-4">
                            {#each details.stats as stat}
                                <div class="group/stat">
                                    <div class="flex justify-between items-end mb-1.5">
                                        <span class="text-[9px] font-bold text-zinc-400 uppercase tracking-[0.2em]">{stat.name}</span>
                                        <span class="text-xs font-mono font-black text-white">{stat.value}</span>
                                    </div>
                                    {#if stat.isBar}
                                        <div class="h-1 bg-zinc-950 border border-white/5 rounded-full overflow-hidden relative">
                                            <div class="absolute inset-y-0 left-0 {getStatColor()} transition-all duration-1000 ease-out" style="width: {Math.min(stat.value, 100)}%"></div>
                                        </div>
                                    {:else}
                                        <div class="h-[1px] bg-zinc-800/50 w-full mt-0.5"></div>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>

                <!-- Right: Perk Grid (Denser) -->
                <div class="col-span-12 lg:col-span-8 space-y-12">
                    {#if details.livePerks?.length > 0}
                        <div>
                            <span class="text-[9px] font-sans text-emerald-500 uppercase tracking-[0.4em] font-black block mb-6">ACTIVE_COMBAT_LOADOUT</span>
                            <div class="flex flex-wrap gap-3">
                                {#each details.livePerks as perk}
                                    {@render perkIcon({ perk, large: true })}
                                {/each}
                            </div>
                        </div>
                    {/if}

                    <div class="grid grid-cols-1 gap-12">
                        <div>
                            <span class="text-[9px] font-sans text-zinc-500 uppercase tracking-[0.4em] font-bold block mb-6">MANIFEST_POOL_ANALYSIS</span>
                            <div class="flex flex-wrap gap-x-6 gap-y-6">
                                {#each (details.perkPools || []) as pool}
                                    <div class="flex flex-col gap-3">
                                        {#each pool.perks as perk}
                                            {@render perkIcon({ perk })}
                                        {/each}
                                    </div>
                                {/each}
                            </div>
                        </div>

                        {#if details.originTraits?.length > 0}
                            <div>
                                <span class="text-[9px] font-sans text-zinc-500 uppercase tracking-[0.4em] font-bold block mb-6">ORIGIN_TRAIT_ARCHIVE</span>
                                <div class="flex flex-wrap gap-3">
                                    {#each details.originTraits as perk}
                                        {@render perkIcon({ perk, large: true })}
                                    {/each}
                                </div>
                            </div>
                        {/if}
                    </div>

                    <div class="pt-8 border-t border-zinc-800/50">
                        <span class="text-[9px] font-sans text-zinc-600 uppercase tracking-[0.4em] font-black block mb-4">TACTICAL_ARCHIVE_DATA</span>
                        <p class="text-xs font-serif italic text-zinc-400 leading-relaxed indent-6 max-w-2xl">
                            {details.description || "No classification data found in tactical archives."}
                        </p>
                    </div>
                </div>
            </div>
            
            <div class="h-10 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between px-8 shrink-0 z-[60]">
                <div class="flex items-center gap-8">
                    <span class="text-[9px] font-black text-zinc-700 tracking-[0.5em] uppercase">JADESTONE_INTEL_SYSTEM_V{details.hash.substring(0,4)}</span>
                    <span class="text-[9px] font-mono text-zinc-800 uppercase tracking-widest opacity-50">UID_{details.hash}</span>
                </div>
                <div class="flex items-center gap-3">
                    <div class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                    <span class="text-[9px] font-bold text-emerald-900 tracking-[0.3em] uppercase">ENCRYPTED_SIGNAL_STABLE</span>
                </div>
            </div>
        </div>

        <!-- Global Smart Tooltip (Outside all scroll areas and headers) -->
        {#if hoveredPerk}
            <div class="fixed pointer-events-none z-[2000] -translate-x-1/2 -translate-y-full mb-6"
                 style="left: {tooltipPos.x}px; top: {tooltipPos.y}px;"
                 transition:fade={{ duration: 100 }}>
                <div class="p-4 bg-[#0a0a0a] border border-zinc-800 w-72 shadow-[0_0_40px_rgba(0,0,0,0.9)] animate-in fade-in zoom-in-95 duration-200">
                    <p class="text-[11px] font-black italic uppercase {hoveredPerk.isEnhanced ? 'text-amber-500' : 'text-sky-400'} mb-1.5 tracking-wider">
                        {hoveredPerk.name}
                    </p>
                    <p class="text-[10px] text-zinc-300 leading-relaxed font-serif italic opacity-95">
                        {hoveredPerk.description || "Active Tactical Component."}
                    </p>
                    <!-- Enhanced or Sky Blue indicator line -->
                    <div class="absolute top-full left-1/2 -translate-x-1/2 w-[1px] h-5 {hoveredPerk.isEnhanced ? 'bg-amber-500/50' : 'bg-sky-400/50'}"></div>
                </div>
            </div>
        {/if}
    {/if}
</div>

<style>
    .scrollbar-hide::-webkit-scrollbar { display: none; }
    .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
</style>
