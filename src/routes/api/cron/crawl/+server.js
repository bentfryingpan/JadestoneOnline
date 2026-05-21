/**
 * /api/cron/crawl — Roster-graph crawler
 *
 * Called by Vercel Cron every 5 minutes.
 * Each run:
 *   1. Pull a batch of players from player_queue (highest-priority, least-recently-checked)
 *   2. For each player, fetch activity history since their last known match
 *   3. Enrich any new PGCRs → write to matches table
 *   4. Extract all 7 roster-mates from each new match → add to queue (if unknown)
 *   5. Write rating_history rows (before/after NGR delta per match)
 *   6. Recompute JPR for this player from their last 500 enriched matches
 *   7. Update player_queue.last_checked + last_match_period
 *
 * Rate budget per run (conservative for 30s Vercel timeout):
 *   BATCH_SIZE players × (1 history call + MAX_NEW_PGCRS pgcr calls) + Supabase writes
 */

import { BUNGIE_API_KEY } from '$env/static/private';
import { env } from '$env/dynamic/private';
const CRON_SECRET = env.CRON_SECRET;
import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabase-server.js';
import { cacheGet, cacheSet } from '$lib/server/cache.js';
import { calcEgo, extractMedals } from '$lib/server/ego.js';
import { getActivityDef, getItemDef } from '$lib/server/manifest.js';
import { calcJPR, saveJPR } from '$lib/server/jpr.js';
import { computeSeasonAwards, currentSeason, membershipTypeToPlatform } from '$lib/server/awards.js';

const BUNGIE_ROOT  = 'https://www.bungie.net';
const PGCR_ROOT    = 'https://stats.bungie.net';
const PGCR_TTL     = 86_400_000;
const BATCH_SIZE   = 8;   // players per cron run
const MAX_NEW_PGCRS = 15; // max new PGCRs to enrich per player per run
const PGCR_PARALLEL = 8;  // parallel PGCR fetches per player

const SLOT_BUCKETS = {
	1498876634: 'Kinetic',
	2465295065: 'Energy',
	953998645:  'Power',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function bungieGet(url) {
	const res  = await fetch(BUNGIE_ROOT + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
	const text = await res.text();
	return JSON.parse(text.replace(/:\s*(\d{15,})/g, ': "$1"'));
}

async function fetchPgcr(instanceId) {
	const key    = `pgcr:${instanceId}`;
	const cached = cacheGet(key);
	if (cached) return cached;
	try {
		const res  = await fetch(
			`${PGCR_ROOT}/Platform/Destiny2/Stats/PostGameCarnageReport/${instanceId}/`,
			{ headers: { 'X-API-Key': BUNGIE_API_KEY } }
		);
		const text = await res.text();
		const data = JSON.parse(text.replace(/:\s*(\d{15,})/g, ': "$1"'));
		if (data.ErrorCode === 1) { cacheSet(key, data, PGCR_TTL); return data; }
	} catch {}
	return null;
}

function sv(entry, key) {
	return entry?.extended?.values?.[key]?.basic?.value ??
	       entry?.values?.[key]?.basic?.value ?? 0;
}

// ── PGCR processing (mirrors pgcr-enrich) ────────────────────────────────────

async function processPgcr(pgcr, targetId) {
	const entries = pgcr.entries ?? [];
	if (!entries.length) return null;

	const idStr = String(targetId);

	const ftGroups = {};
	for (const e of entries) {
		const ftId = e.values?.fireteamId?.basic?.value ?? 0;
		if (ftId > 0) ftGroups[ftId] = (ftGroups[ftId] ?? 0) + 1;
	}

	const teamMap = {};
	let tIdx = 0;
	for (const e of entries) {
		const tv = e.values?.team?.basic?.value ?? 0;
		if (!(tv in teamMap)) teamMap[tv] = tIdx++ === 0 ? 'Alpha' : 'Bravo';
	}

	let targetEntry = null;
	const roster    = [];

	for (const e of entries) {
		const pInfo = e.player?.destinyUserInfo ?? {};
		const pId   = String(pInfo.membershipId ?? '');
		const pName = pInfo.bungieGlobalDisplayName ?? pInfo.displayName ?? 'Unknown';
		const pCode = pInfo.bungieGlobalDisplayNameCode
			? String(pInfo.bungieGlobalDisplayNameCode).padStart(4, '0')
			: null;
		const pMt   = pInfo.membershipType ?? 3;

		const ftSize = ftGroups[e.values?.fireteamId?.basic?.value ?? 0] ?? 1;
		const team   = teamMap[e.values?.team?.basic?.value ?? 0] ?? 'Alpha';

		const totalKills = sv(e, 'kills');
		const invKills   = sv(e, 'invasionKills') || sv(e, 'invaderKills');
		const mDep       = sv(e, 'motesDeposited') || sv(e, 'motesBanked');
		const mLost      = sv(e, 'motesLost');

		const stats = {
			assists:            sv(e, 'assists'),
			deaths:             sv(e, 'deaths'),
			kills:              totalKills,
			mobKills:           Math.max(0, totalKills - invKills),
			precisionKills:     sv(e, 'precisionKills'),
			invasionKills:      invKills,
			invasionDeaths:     sv(e, 'invasionDeaths') || sv(e, 'invaderDeaths'),
			invasions:          sv(e, 'invasions'),
			invasionsDefeated:  sv(e, 'invasionsDefeated'),
			motesDeposited:     mDep,
			motesDenied:        sv(e, 'motesDenied'),
			motesLost:          mLost,
			motesPickedUp:      sv(e, 'motesPickedUp') || mDep + mLost,
			superKills:         sv(e, 'weaponKillsSuper'),
			grenadeKills:       sv(e, 'weaponKillsGrenade'),
			meleeKills:         sv(e, 'weaponKillsMelee'),
			primevalDamage:     sv(e, 'primevalDamage'),
			primevalHealing:    sv(e, 'primevalHealing'),
			smallBlockersSent:  sv(e, 'smallBlockersSent'),
			mediumBlockersSent: sv(e, 'mediumBlockersSent'),
			largeBlockersSent:  sv(e, 'largeBlockersSent'),
			fireteam_size:      ftSize,
		};

		const medals  = extractMedals(e.extended?.values ?? {});
		const completed = e.values?.completed?.basic?.value === 1;
		const ego       = completed ? calcEgo({ ...stats, medals, fireteamSize: ftSize }) : null;

		// Weapons
		const weapons = [];
		for (const w of e.extended?.weapons ?? []) {
			const def = await getItemDef(w.referenceId);
			if (def) {
				weapons.push({
					name:      def.displayProperties.name,
					hash:      w.referenceId,
					slot:      SLOT_BUCKETS[def.inventory?.bucketTypeHash] ?? 'Unknown',
					kills:     sv(w, 'uniqueWeaponKills'),
					precision: sv(w, 'uniqueWeaponPrecisionKills'),
					icon:      BUNGIE_ROOT + def.displayProperties.icon,
				});
			}
		}

		const rosterEntry = {
			id:           pId,
			name:         pName,
			code:         pCode,
			membershipType: pMt,
			team,
			fireteam_size: ftSize,
			score:        ego?.finalScore ?? 0,
			is_target:    pId === idStr,
			stats,
			weapons,
			medals,
		};
		roster.push(rosterEntry);

		if (pId === idStr && completed) {
			targetEntry = {
				stats: { ...stats, top_weapons: weapons, medals },
				ego,
				outcome: e.values?.standing?.basic?.value === 0 ? 'Win' : 'Loss',
				fireteam_size: ftSize,
				membershipType: pMt, // platform the player used for THIS match
			};
		}
	}

	if (!targetEntry) return null;

	return {
		...targetEntry,
		stats_json: {
			...targetEntry.stats,
			ego_breakdown: targetEntry.ego?.components,
			roster,
		},
		roster,
	};
}

// ── Queue helpers ─────────────────────────────────────────────────────────────

/**
 * Add newly discovered roster players to the queue.
 * Only inserts rows that don't already exist (onConflict: do nothing).
 */
async function queueRosterPlayers(roster) {
	const rows = roster
		.filter(p => p.id && p.id !== '0' && !p.is_target)
		.map(p => ({
			player_id:       p.id,
			membership_type: p.membershipType ?? 3,
			bungie_name:     p.name ?? null,
			bungie_code:     p.code ?? null,
			priority:        1,
			added_at:        new Date().toISOString(),
		}));

	if (rows.length === 0) return;

	// Insert-if-not-exists: don't overwrite priority of players already in queue
	await supabaseAdmin
		.from('player_queue')
		.upsert(rows, { onConflict: 'player_id', ignoreDuplicates: true });
}

// ── Per-player crawl ──────────────────────────────────────────────────────────

async function crawlPlayer(queueRow) {
	const { player_id, membership_type, bungie_name, bungie_code, last_match_period } = queueRow;
	const log = { player_id, bungie_name, newMatches: 0, newPlayers: 0, error: null };

	try {
		// 1. Fetch character IDs
		const profileData = await bungieGet(
			`/Platform/Destiny2/${membership_type}/Profile/${player_id}/?components=100`
		);
		if (profileData.ErrorCode !== 1) {
			log.error = `profile ErrorCode ${profileData.ErrorCode}`;
			return log;
		}
		const charIds = profileData.Response?.profile?.data?.characterIds ?? [];
		if (!charIds.length) { log.error = 'no characters'; return log; }

		// 2. Fetch activity history for each character (page 0 only = last 250)
		const allActivities = [];
		const seen = new Set();
		for (const charId of charIds) {
			const data = await bungieGet(
				`/Platform/Destiny2/${membership_type}/Account/${player_id}/Character/${charId}/Stats/Activities/?mode=63&count=250&page=0`
			);
			if (data.ErrorCode !== 1) continue;
			for (const act of data.Response?.activities ?? []) {
				const id = act.activityDetails?.instanceId;
				if (!id || seen.has(id)) continue;
				seen.add(id);
				// Skip matches we already have (incremental)
				if (last_match_period && act.period && new Date(act.period) <= new Date(last_match_period)) continue;
				allActivities.push(act);
			}
		}

		if (!allActivities.length) {
			log.newMatches = 0;
			return log;
		}

		// Sort newest-first, cap at MAX_NEW_PGCRS
		allActivities.sort((a, b) => new Date(b.period) - new Date(a.period));
		const toProcess = allActivities.slice(0, MAX_NEW_PGCRS);

		// 3. Fetch PGCRs in parallel batches
		const enriched = [];
		for (let i = 0; i < toProcess.length; i += PGCR_PARALLEL) {
			const batch = toProcess.slice(i, i + PGCR_PARALLEL);
			const batchResults = await Promise.all(
				batch.map(async (act) => {
					const instanceId = act.activityDetails?.instanceId;
					const pgcrRes    = await fetchPgcr(instanceId);
					if (!pgcrRes?.Response) return null;

					const processed = await processPgcr(pgcrRes.Response, player_id);
					if (!processed) return null;

					const actDef = await getActivityDef(pgcrRes.Response.activityDetails?.referenceId);
					const mapName = (actDef?.displayProperties?.name ?? 'Gambit')
						.replace(/^Gambit[:\-]\s*/i, '')
						.trim() || 'Gambit';

					return {
						instanceId,
						period:  act.period,
						mapName,
						processed,
						roster:  processed.roster ?? [],
					};
				})
			);
			enriched.push(...batchResults.filter(Boolean));
		}

		if (!enriched.length) return log;

		// 4. Write matches to Supabase
		const matchRows = enriched.map(({ instanceId, period, mapName, processed }) => ({
			id:            instanceId,
			player_id:     String(player_id),
			// Use the per-match membershipType from the PGCR entry so cross-save
			// players are bucketed by the platform they actually played on.
			platform:      membershipTypeToPlatform(processed.membershipType ?? membership_type),
			map_name:      mapName,
			outcome:       processed.outcome,
			ego_score:     processed.ego.finalScore,
			ego_base:      processed.ego.basePps,
			ego_pem:       processed.ego.pem,
			kd:            processed.stats.deaths > 0
				? +(processed.stats.kills / processed.stats.deaths).toFixed(2)
				: processed.stats.kills,
			mote_eff:      processed.ego.moteEff,
			fireteam_size: processed.fireteam_size,
			is_hard_carry: false,
			is_carried:    false,
			stats_json:    processed.stats_json,
			period,
			created_at:    new Date().toISOString(),
		}));

		await supabaseAdmin
			.from('matches')
			.upsert(matchRows, { onConflict: 'id,player_id' });
		log.newMatches = matchRows.length;

		// 5. Queue all discovered roster-mates (fire-and-forget)
		const allRosterPlayers = enriched.flatMap(e => e.roster);
		await queueRosterPlayers(allRosterPlayers);
		log.newPlayers = new Set(allRosterPlayers.map(p => p.id)).size;

		// 6. Compute rating deltas — read current NGR, then update per-match
		const { data: playerRow } = await supabaseAdmin
			.from('players')
			.select('ngr, games_played, platforms')
			.eq('id', String(player_id))
			.single();

		let currentNgr   = playerRow?.ngr ?? 0;
		let currentGames = playerRow?.games_played ?? 0;

		const ratingHistoryRows = [];
		for (const { instanceId, period, processed } of enriched) {
			const egoScore  = processed.ego.finalScore;
			const before    = currentNgr;
			currentGames   += 1;
			currentNgr      = (before * (currentGames - 1) + egoScore) / currentGames;

			ratingHistoryRows.push({
				player_id:     String(player_id),
				instance_id:   instanceId,
				period,
				ego_score:     egoScore,
				rating_before: Math.round(before * 10) / 10,
				rating_after:  Math.round(currentNgr * 10) / 10,
			});
		}

		if (ratingHistoryRows.length) {
			await supabaseAdmin
				.from('rating_history')
				.upsert(ratingHistoryRows, { onConflict: 'player_id,instance_id' });
		}

		// Merge platforms seen in new matches with player's existing platforms
		const newPlatforms = [...new Set(matchRows.map((m) => m.platform).filter(Boolean))];
		const existingPlatforms = playerRow?.platforms ?? [];
		const allPlatforms = [...new Set([...existingPlatforms, ...newPlatforms])];

		// Update players table with new NGR + platform tracking
		await supabaseAdmin.from('players').upsert({
			id:            String(player_id),
			bungie_name:   bungie_name ?? null,
			bungie_code:   bungie_code ?? null,
			membership_type: membership_type,
			platforms:     allPlatforms,
			ngr:           Math.round(currentNgr * 10) / 10,
			ego_score_avg: Math.round(currentNgr * 10) / 10,
			games_played:  currentGames,
			updated_at:    new Date().toISOString(),
		}, { onConflict: 'id' });

		// 7. Recompute JPR from all stored enriched matches (last 500 for performance)
		const { data: allMatches } = await supabaseAdmin
			.from('matches')
			.select('ego_score, outcome, fireteam_size, period')
			.eq('player_id', String(player_id))
			.not('ego_score', 'is', null)
			.order('period', { ascending: false })
			.limit(500);

		if (allMatches?.length) {
			const jprResult = calcJPR(allMatches);
			await saveJPR(supabaseAdmin, String(player_id), jprResult);
		}

	} catch (err) {
		log.error = err?.message ?? String(err);
	}

	return log;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET({ request }) {
	// Verify Vercel cron secret (or skip in dev)
	const authHeader = request.headers.get('authorization');
	if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const startTime = Date.now();

	// Pull next batch from queue: priority DESC, oldest last_checked first
	const { data: batch, error: qErr } = await supabaseAdmin
		.from('player_queue')
		.select('player_id, membership_type, bungie_name, bungie_code, last_match_period, priority')
		.order('priority', { ascending: false })
		.order('last_checked', { ascending: true, nullsFirst: true })
		.limit(BATCH_SIZE);

	if (qErr || !batch?.length) {
		return json({ processed: 0, message: qErr?.message ?? 'queue empty' });
	}

	// Mark all as "being processed" immediately to prevent double-processing
	const batchIds = batch.map(r => r.player_id);
	await supabaseAdmin
		.from('player_queue')
		.update({ last_checked: new Date().toISOString() })
		.in('player_id', batchIds);

	// Process players sequentially to stay under rate limits
	const results = [];
	let newestPeriods = {};

	for (const row of batch) {
		const result = await crawlPlayer(row);
		results.push(result);

		// Update last_match_period so next run only fetches newer matches
		if (result.newMatches > 0) {
			newestPeriods[row.player_id] = new Date().toISOString();
		}
	}

	// Write last_match_period updates back to queue
	const periodUpdates = Object.entries(newestPeriods).map(([player_id, period]) =>
		supabaseAdmin
			.from('player_queue')
			.update({ last_match_period: period })
			.eq('player_id', player_id)
	);
	await Promise.all(periodUpdates);

	const totalNew = results.reduce((s, r) => s + (r.newMatches ?? 0), 0);
	const elapsed  = Date.now() - startTime;

	// Fire-and-forget award standings refresh whenever new matches were ingested.
	// This keeps the live leaderboard fresh so rankings are accurate when a season ends.
	if (totalNew > 0) {
		const activeSeason = currentSeason();
		if (activeSeason) {
			// Refresh both platform pools asynchronously — doesn't block the response
			computeSeasonAwards(activeSeason.number, supabaseAdmin, 'pc').catch(() => {});
			computeSeasonAwards(activeSeason.number, supabaseAdmin, 'console').catch(() => {});
		}
	}

	return json({
		processed:   results.length,
		totalNew,
		newPlayers:  results.reduce((s, r) => s + (r.newPlayers ?? 0), 0),
		elapsedMs:   elapsed,
		results,
	});
}
