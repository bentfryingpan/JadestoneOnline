<script>
    import './layout.css';
    import favicon from '$lib/assets/favicon.svg';
    import Nav from '$lib/Nav.svelte';

    let { children, data } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="min-h-screen bg-[#080808] text-zinc-200 font-sans">
    <Nav user={data.user} />
    {@render children()}
</div>
