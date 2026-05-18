/**
 * /api/cron/meta — Global meta aggregation
 *
 * Called by Vercel Cron every hour.
 * Aggregates weapon pick rates, map stats, and playstyle distribution
 * from the last 30 days of enriched matches and writes to meta_cache.
 */

import { CRON_SECRET } from '$env/static/private';
import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabase-server.js';

const WINDOW_DAYS = 30;

export async function GET({ request }) {
	const authHeader = request.headers.get('authorization');
	if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

	// Pull last 30 days of enriched matches (stats_json has weapons + role data)
	const { data: matches, error } = await supabaseAdmin
		.from('matches')
		.select('stats_json, outcome, ego_score, map_name, fireteam_size, period')
		.gte('period', since)
		.not('stats_json', 'is', null)
		.order('period', { ascending: false })
		.limit(50_000);

	if (error) return json({ error: error.message }, { status: 500 });
	if (!matches?.length) return json({ cached: 0 });

	// ── Weapon meta ─────────────────────────────────────────────────────────────
	const weaponMap = {};
	for (const m of matches) {
		const weapons = m.stats_json?.top_weapons ?? [];
		const isWin   = m.outcome === 'Win';
		for (const w of weapons) {
			if (!w?.name) continue;
			const key = w.hash ?? w.name;
			if (!weaponMap[key]) {
				weaponMap[key] = {
					name: w.name, hash: w.hash, slot: w.slot, icon: w.icon,
					picks: 0, wins: 0, totalKills: 0, totalEgo: 0, egoCount: 0,
				};
			}
			const wm = weaponMap[key];
			wm.picks++;
			if (isWin) wm.wins++;
			wm.totalKills += w.kills ?? 0;
			if (m.ego_score != null) { wm.totalEgo += m.ego_score; wm.egoCount++; }
		}
	}

	const totalMatches = matches.length;
	const weapons = Object.values(weaponMap)
		.filter(w => w.picks >= 10)
		.map(w => ({
			...w,
			pickRate:  +(w.picks / totalMatches * 100).toFixed(2),
			winRate:   +(w.wins / w.picks * 100).toFixed(1),
			avgKills:  +(w.totalKills / w.picks).toFixed(1),
			avgEgo:    w.egoCount > 0 ? +(w.totalEgo / w.egoCount).toFixed(1) : null,
		}))
		.sort((a, b) => b.picks - a.picks)
		.slice(0, 100);

	// ── Map meta ────────────────────────────────────────────────────────────────
	const mapMap = {};
	for (const m of matches) {
		const name = m.map_name ?? 'Unknown';
		if (!mapMap[name]) mapMap[name] = { name, played: 0, wins: 0, totalEgo: 0, egoCount: 0 };
		const mm = mapMap[name];
		mm.played++;
		if (m.outcome === 'Win') mm.wins++;
		if (m.ego_score != null) { mm.totalEgo += m.ego_score; mm.egoCount++; }
	}

	const maps = Object.values(mapMap)
		.map(mm => ({
			name:    mm.name,
			played:  mm.played,
			winRate: +(mm.wins / mm.played * 100).toFixed(1),
			avgEgo:  mm.egoCount > 0 ? +(mm.totalEgo / mm.egoCount).toFixed(1) : null,
		}))
		.sort((a, b) => b.played - a.played);

	// ── Playstyle distribution ──────────────────────────────────────────────────
	// Classify each player-match by dominant stat contribution
	let reaper = 0, collector = 0, invader = 0, sentry = 0;
	for (const m of matches) {
		const s = m.stats_json ?? {};
		const invScore  = (s.invasionKills ?? 0) * 3 + (s.invasions ?? 0);
		const bankScore = (s.motesDeposited ?? 0) + (s.motesDenied ?? 0) * 2;
		const killScore = (s.kills ?? 0) - (s.invasionKills ?? 0);
		const defScore  = (s.invasionsDefeated ?? 0) * 2 + (s.smallBlockersSent ?? 0) + (s.mediumBlockersSent ?? 0) * 2 + (s.largeBlockersSent ?? 0) * 3;

		const max = Math.max(invScore, bankScore, killScore, defScore);
		if (max === invScore)  invader++;
		else if (max === bankScore) collector++;
		else if (max === killScore) reaper++;
		else sentry++;
	}

	const playstyle = {
		reaper:    +(reaper    / totalMatches * 100).toFixed(1),
		collector: +(collector / totalMatches * 100).toFixed(1),
		invader:   +(invader   / totalMatches * 100).toFixed(1),
		sentry:    +(sentry    / totalMatches * 100).toFixed(1),
	};

	// ── Stack size distribution ─────────────────────────────────────────────────
	const stackDist = { 1: 0, 2: 0, 3: 0, 4: 0 };
	for (const m of matches) {
		const ft = Math.min(4, Math.max(1, m.fireteam_size ?? 1));
		stackDist[ft]++;
	}

	// ── Write all to meta_cache ─────────────────────────────────────────────────
	const now = new Date().toISOString();
	await supabaseAdmin.from('meta_cache').upsert([
		{ key: 'weapons_30d',   data: { weapons, updatedAt: now, matchCount: totalMatches }, updated_at: now },
		{ key: 'maps_30d',      data: { maps,    updatedAt: now, matchCount: totalMatches }, updated_at: now },
		{ key: 'playstyle_30d', data: { playstyle, stackDist, updatedAt: now, matchCount: totalMatches }, updated_at: now },
	], { onConflict: 'key' });

	return json({
		cached: 3,
		matchCount: totalMatches,
		topWeapon: weapons[0]?.name ?? 'n/a',
		playstyle,
	});
}
