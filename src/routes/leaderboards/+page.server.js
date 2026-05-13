import { supabaseAdmin } from '$lib/supabase-server.js';

const CATEGORIES = {
	winrate: { col: 'win_rate', label: 'Win Rate', min: 50 },
	kd: { col: 'kd_ratio', label: 'K/D Ratio', min: 20 },
	invasions: { col: 'invasions', label: 'Invasions', min: 20 },
	motes: { col: 'motes_deposited', label: 'Motes Banked', min: 20 },
	wins: { col: 'activities_won', label: 'Total Wins', min: 20 },
	matches: { col: 'activities_entered', label: 'Total Matches', min: 20 }
};

export async function load({ url }) {
	const cat = url.searchParams.get('cat') ?? 'wins';
	const cfg = CATEGORIES[cat] ?? CATEGORIES.wins;

	const { data: rows } = await supabaseAdmin
		.from('player_gambit_stats')
		.select(
			'player_id, bungie_name, bungie_code, activities_entered, activities_won, kd_ratio, win_rate, invasions, invasion_kills, motes_deposited, motes_lost, updated_at'
		)
		.gte('activities_entered', cfg.min)
		.order(cfg.col, { ascending: false })
		.limit(100);

	return { rows: rows ?? [], cat, categories: CATEGORIES };
}
