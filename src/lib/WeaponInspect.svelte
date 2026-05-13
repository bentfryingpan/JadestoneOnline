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

    // Helper for stat bar color
    function getStatColor(name) {
        const n = name.toLowerCase();
        if (n.includes('range')) return 'bg-sky-500';
        if (n.includes('impact')) return 'bg-rose-500';
        if (n.includes('stability')) return 'bg-emerald-500';
        if (n.includes('handling')) return 'bg-amber-500';
        if (n.includes('reload')) return 'bg-indigo-500';
        return 'bg-zinc-500';
    }
</script>

<div class="fixed inset-0 z-[1000] flex items-center justify-center p-4 sm:p-10 font-sans" transition:fade={{ duration: 200 }}>
    <!-- Backdrop -->
    <button class="absolute inset-0 bg-black/90 backdrop-blur-md cursor-default border-none" onclick={onClose}></button>

    {#if loading}
        <div class="relative z-10 flex flex-col items-center gap-4">
            <div class="w-12 h-12 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <p class="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-500">Initializing_Relational_Sync</p>
        </div>
    {:else if details}
        <div class="relative z-10 w-full max-w-5xl bg-[#0a0a0a] border border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" in:fly={{ y: 20, duration: 400 }}>
            
            <!-- Banner / Screenshot -->
            <div class="h-64 relative shrink-0 border-b border-zinc-800 bg-zinc-950">
                {#if details.screenshot}
                    <img src={details.screenshot} alt={details.name} class="w-full h-full object-cover opacity-60 contrast-125 grayscale-[0.2]" />
                    <div class="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent"></div>
                {:else}
                    <div class="w-full h-full flex items-center justify-center opacity-10">
                        <div class="w-32 h-32 border border-zinc-500 rotate-45"></div>
                    </div>
                {/if}

                <!-- Header Info Overlay -->
                <div class="absolute bottom-0 left-0 w-full p-8 flex items-end justify-between">
                    <div class="flex items-center gap-6">
                        <div class="w-20 h-20 bg-zinc-900 border border-zinc-700 relative overflow-hidden rotate-45 shrink-0 shadow-2xl">
                            <img src={details.icon} alt={details.name} class="w-full h-full object-cover -rotate-45 p-1" />
                            <div class="absolute top-0 left-0 w-full h-[2px] {details.isExotic ? 'bg-amber-500' : 'bg-zinc-500'}"></div>
                        </div>
                        <div class="font-sans">
                            <div class="flex items-center gap-3">
                                {#if details.damageType?.icon}
                                    <img src={details.damageType.icon} alt="Damage" class="w-5 h-5 opacity-80" />
                                {/if}
                                <span class="text-[10px] font-black tracking-[0.4em] {details.isExotic ? 'text-amber-500' : 'text-emerald-500'} uppercase">
                                    {details.tier} {details.type}
                                </span>
                            </div>
                            <h2 class="text-5xl font-light italic tracking-tighter uppercase text-white mt-1">{details.name}</h2>
                        </div>
                    </div>
                    <button class="bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all" onclick={onClose}>Close_Link</button>
                </div>
            </div>

            <!-- Content -->
            <div class="flex-1 overflow-y-auto p-10 grid grid-cols-12 gap-12 scrollbar-hide">
                
                <!-- Left: Stats (DIM Style) -->
                <div class="col-span-12 lg:col-span-5 space-y-8">
                    <div>
                        <span class="text-[8px] font-sans text-zinc-500 uppercase tracking-[0.3em] font-bold block mb-4">BALLISTIC_DATA_MATRIX</span>
                        <div class="space-y-4">
                            {#each details.stats as stat}
                                <div class="group/stat">
                                    <div class="flex justify-between items-end mb-1.5">
                                        <span class="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{stat.name}</span>
                                        <span class="text-sm font-mono font-black text-white">{stat.value}</span>
                                    </div>
                                    <div class="h-1 bg-zinc-900 rounded-full overflow-hidden relative">
                                        <div class="absolute inset-y-0 left-0 {getStatColor(stat.name)} transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(255,255,255,0.1)]" style="width: {stat.value}%"></div>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>

                <!-- Right: Lore & Identification -->
                <div class="col-span-12 lg:col-span-7 space-y-10">
                    {#if details.perks?.length > 0}
                        <div>
                            <span class="text-[8px] font-sans text-zinc-500 uppercase tracking-[0.3em] font-bold block mb-4">LIVE_ROLL_COMPONENTS</span>
                            <div class="grid grid-cols-2 gap-3">
                                {#each details.perks as perk}
                                    <div class="flex items-center gap-3 bg-zinc-900/50 border border-zinc-800 p-2 group/perk hover:border-emerald-500/30 transition-colors">
                                        <img src={perk.icon} alt={perk.name} class="w-8 h-8 opacity-80 group-hover/perk:opacity-100 transition-opacity" />
                                        <div class="min-w-0">
                                            <p class="text-[10px] font-black italic uppercase text-zinc-200 truncate">{perk.name}</p>
                                            <p class="text-[7px] text-zinc-600 uppercase font-bold tracking-tighter truncate">{perk.description || "Active Tactical Perk"}</p>
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/if}

                    <div>
                        <span class="text-[8px] font-sans text-zinc-500 uppercase tracking-[0.3em] font-bold block mb-4">EQUIPMENT_LORE_ENTRY</span>
                        <p class="text-sm font-serif italic text-zinc-400 leading-relaxed indent-6">
                            {details.description || "No classification data found in tactical archives."}
                        </p>
                    </div>

                    <div class="pt-10 border-t border-zinc-800/50">
                        <div class="grid grid-cols-2 gap-8">
                            <div class="bg-zinc-900/30 border border-zinc-800 p-4">
                                <span class="text-[7px] font-bold text-zinc-600 uppercase tracking-widest block mb-2">IDENTIFIER_HASH</span>
                                <span class="text-xs font-mono text-zinc-400">{details.hash}</span>
                            </div>
                            <div class="bg-zinc-900/30 border border-zinc-800 p-4">
                                <span class="text-[7px] font-bold text-zinc-600 uppercase tracking-widest block mb-2">DATABASE_LINK</span>
                                <a href="https://destinyitemmanager.com/en/inspect/{details.hash}" target="_blank" class="text-xs font-bold text-emerald-500 hover:text-white transition-colors">OPEN_IN_DIM</a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Footer Branding -->
            <div class="h-10 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between px-8">
                <span class="text-[8px] font-black text-zinc-700 tracking-[0.5em] uppercase">JADESTONE_INTEL_SYSTEM_V{details.hash.substring(0,4)}</span>
                <div class="flex items-center gap-2">
                    <div class="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                    <span class="text-[8px] font-bold text-emerald-900 tracking-widest uppercase">ENCRYPTED_SIGNAL</span>
                </div>
            </div>
        </div>
    {/if}
</div>

<style>
    .scrollbar-hide::-webkit-scrollbar { display: none; }
    .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
</style>
