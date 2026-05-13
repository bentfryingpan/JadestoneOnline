<script>
    import { fly, fade } from 'svelte/transition';
    const BUNGIE_ROOT = 'https://www.bungie.net';

    let { weapon, onClose } = $props();
    let loading = $state(true);
    let details = $state(null);

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
</script>

{#snippet perkIcon({ perk, large = false })}
    <div class="group/perk relative {large ? 'w-12 h-12' : 'w-10 h-10'} flex items-center justify-center cursor-help overflow-visible">
        <!-- The Diamond Border (Handles Rotation) -->
        <div class="absolute inset-0 bg-zinc-950 border {perk.isEnhanced ? 'border-amber-500/40 shadow-[inset_0_0_10px_rgba(245,158,11,0.1)]' : 'border-zinc-800'} rotate-45 group-hover:border-emerald-500/50 transition-all duration-300"></div>
        
        <!-- The Icon (Stays level) -->
        <img src={perk.icon} alt={perk.name} class="{large ? 'w-10 h-10' : 'w-8 h-8'} relative z-10 opacity-80 group-hover/perk:opacity-100 transition-opacity" />
        
        {#if perk.isEnhanced}
            <div class="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-500 z-20 flex items-center justify-center shadow-lg">
                <span class="text-[7px] font-black text-black">E</span>
            </div>
        {/if}

        <!-- Hover Tooltip (Static/Level) -->
        <div class="absolute bottom-[calc(100%+18px)] left-1/2 -translate-x-1/2 p-4 bg-[#0a0a0a] border border-zinc-800 w-64 opacity-0 group-hover/perk:opacity-100 transition-all pointer-events-none z-[400] shadow-2xl scale-95 group-hover/perk:scale-100">
            <p class="text-xs font-black italic uppercase {perk.isEnhanced ? 'text-amber-500' : 'text-emerald-400'} mb-1">
                {perk.name}
            </p>
            <p class="text-[10px] text-zinc-400 leading-relaxed font-serif italic">{perk.description || "No tactical data available."}</p>
            <div class="absolute top-full left-1/2 -translate-x-1/2 w-[1px] h-4 {perk.isEnhanced ? 'bg-amber-500/20' : 'bg-emerald-500/20'}"></div>
        </div>
    </div>
{/snippet}

<div class="fixed inset-0 z-[1000] flex items-center justify-center p-4 sm:p-10 font-sans" transition:fade={{ duration: 200 }}>
    <button class="absolute inset-0 bg-black/90 backdrop-blur-md cursor-default border-none" onclick={onClose}></button>

    {#if loading}
        <div class="relative z-10 flex flex-col items-center gap-4">
            <div class="w-12 h-12 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <p class="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-500 text-center uppercase">SYNCHRONIZING_ARSENAL_DATA</p>
        </div>
    {:else if details}
        <div class="relative z-10 w-full max-w-6xl bg-[#0a0a0a] border border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[95vh]" in:fly={{ y: 20, duration: 400 }}>
            
            <!-- Banner / Screenshot -->
            <div class="h-72 relative shrink-0 border-b border-zinc-800 bg-zinc-950">
                {#if details.screenshot}
                    <img src={details.screenshot} alt={details.name} class="w-full h-full object-cover opacity-60 contrast-125 grayscale-[0.2]" />
                    <div class="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/40 to-transparent"></div>
                {:else}
                    <div class="w-full h-full flex items-center justify-center opacity-10">
                        <div class="w-32 h-32 border border-zinc-500"></div>
                    </div>
                {/if}

                <div class="absolute bottom-0 left-0 w-full p-8 flex items-end justify-between">
                    <div class="flex items-center gap-8">
                        <!-- Squared Icon Container -->
                        <div class="w-24 h-24 bg-zinc-900 border border-zinc-700 relative overflow-hidden shrink-0 shadow-2xl">
                            <img src={details.icon} alt={details.name} class="w-full h-full object-cover p-1" />
                            <div class="absolute top-0 left-0 w-full h-[2px] {details.isExotic ? 'bg-amber-500' : 'bg-zinc-500'}"></div>
                        </div>
                        <div>
                            <div class="flex items-center gap-3">
                                {#if details.damageType?.icon}
                                    <img src={details.damageType.icon} alt="Damage" class="w-6 h-6 opacity-90 shadow-[0_0_10px_rgba(255,255,255,0.2)]" />
                                {/if}
                                <span class="text-[11px] font-black tracking-[0.4em] {details.isExotic ? 'text-amber-500' : 'text-emerald-500'} uppercase">
                                    {details.tier} {details.type}
                                </span>
                            </div>
                            <h2 class="text-6xl font-light italic tracking-tighter uppercase text-white mt-2 drop-shadow-2xl">{details.name}</h2>
                        </div>
                    </div>
                    <button class="bg-white/5 hover:bg-white/10 border border-white/10 px-6 py-2.5 text-[10px] font-black uppercase tracking-[0.3em] transition-all shadow-xl" onclick={onClose}>CLOSE_ARCHIVE</button>
                </div>
            </div>

            <!-- Content Area -->
            <div class="flex-1 overflow-y-auto p-12 grid grid-cols-12 gap-16 scrollbar-hide bg-[#0a0a0a]">
                
                <!-- Left: Stats -->
                <div class="col-span-12 lg:col-span-4 space-y-10 border-r border-zinc-800/30 pr-8">
                    <div>
                        <span class="text-[9px] font-sans text-zinc-500 uppercase tracking-[0.3em] font-bold block mb-8">BALLISTIC_DATA_MATRIX</span>
                        <div class="space-y-6">
                            {#each details.stats as stat}
                                <div class="group/stat">
                                    <div class="flex justify-between items-end mb-2">
                                        <span class="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em]">{stat.name}</span>
                                        <span class="text-sm font-mono font-black text-white">{stat.value}</span>
                                    </div>
                                    {#if stat.isBar}
                                        <div class="h-1.5 bg-zinc-950 border border-white/5 rounded-full overflow-hidden relative">
                                            <div class="absolute inset-y-0 left-0 {getStatColor()} transition-all duration-1000 ease-out" style="width: {Math.min(stat.value, 100)}%"></div>
                                        </div>
                                    {:else}
                                        <div class="h-[1px] bg-zinc-800/50 w-full"></div>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>

                <!-- Right: Perk Grid & Rolls -->
                <div class="col-span-12 lg:col-span-8 space-y-16">
                    {#if details.livePerks?.length > 0}
                        <div>
                            <span class="text-[9px] font-sans text-emerald-500 uppercase tracking-[0.4em] font-black block mb-8">ACTIVE_COMBAT_LOADOUT</span>
                            <div class="flex flex-wrap gap-10">
                                {#each details.livePerks as perk}
                                    {@render perkIcon({ perk, large: true })}
                                {/each}
                            </div>
                        </div>
                    {/if}

                    <div class="grid grid-cols-1 gap-16">
                        <div>
                            <span class="text-[9px] font-sans text-zinc-500 uppercase tracking-[0.4em] font-bold block mb-8">MANIFEST_POOL_ANALYSIS</span>
                            <div class="flex flex-wrap gap-x-12 gap-y-12">
                                {#each (details.perkPools || []) as pool}
                                    <div class="flex flex-col gap-10">
                                        {#each pool.perks as perk}
                                            {@render perkIcon({ perk })}
                                        {/each}
                                    </div>
                                {/each}
                            </div>
                        </div>

                        {#if details.originTraits?.length > 0}
                            <div>
                                <span class="text-[9px] font-sans text-zinc-500 uppercase tracking-[0.4em] font-bold block mb-8">ORIGIN_TRAIT_ARCHIVE</span>
                                <div class="flex flex-wrap gap-10">
                                    {#each details.originTraits as perk}
                                        {@render perkIcon({ perk, large: true })}
                                    {/each}
                                </div>
                            </div>
                        {/if}
                    </div>

                    <div class="pt-12 border-t border-zinc-800/50">
                        <span class="text-[9px] font-sans text-zinc-600 uppercase tracking-[0.4em] font-black block mb-6">TACTICAL_ARCHIVE_DATA</span>
                        <p class="text-sm font-serif italic text-zinc-400 leading-relaxed indent-8 max-w-2xl">
                            {details.description || "No classification data found in tactical archives."}
                        </p>
                    </div>
                </div>
            </div>
            
            <div class="h-12 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between px-10 shrink-0">
                <div class="flex items-center gap-8">
                    <span class="text-[9px] font-black text-zinc-700 tracking-[0.6em] uppercase">JADESTONE_INTEL_SYSTEM_V{details.hash.substring(0,4)}</span>
                    <span class="text-[9px] font-mono text-zinc-800 uppercase tracking-widest opacity-50">UID_{details.hash}</span>
                </div>
                <div class="flex items-center gap-3">
                    <div class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                    <span class="text-[9px] font-bold text-emerald-900 tracking-[0.3em] uppercase">ENCRYPTED_SIGNAL_STABLE</span>
                </div>
            </div>
        </div>
    {/if}
</div>

<style>
    .scrollbar-hide::-webkit-scrollbar { display: none; }
    .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
</style>
