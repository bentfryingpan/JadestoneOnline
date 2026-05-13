import adapter from '@sveltejs/adapter-vercel';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: adapter({
			// Pin to US East — closest region to Bungie's API servers.
			// This cuts upstream latency for all Bungie API calls by 50-150ms
			// compared to a random Vercel region or an EU edge node.
			regions: ['iad1'],

			// Node 22 for latest V8 perf + native fetch improvements
			runtime: 'nodejs22.x',

			// 512MB gives faster cold starts than the default 1024MB for
			// functions that are mostly I/O-bound (Bungie API calls).
			memory: 512,

			// 30s max — profile pages typically resolve in <3s
			maxDuration: 30
		})
	}
};

export default config;
