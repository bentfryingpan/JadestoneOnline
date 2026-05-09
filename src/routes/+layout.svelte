<script>
    import './layout.css';
    import favicon from '$lib/assets/favicon.svg';
    import Nav from '$lib/Nav.svelte';

    let { children, data } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="min-h-screen bg-[#09090f] text-slate-100">
    <Nav user={data.user} />
    {@render children()}
</div>
