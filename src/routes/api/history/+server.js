/**
 * /api/history — Full Gambit match history with per-match EGO scores.
 *
 * For unenriched matches, fetches PGCRs directly from stats.bungie.net
 * (same endpoint as the match detail page) so the first response already
 * has accurate motes, primevalDamage, invasion stats, and EGO.
 */

import { BUNGIE_API_KEY } from '$env/static/private';
import { json } from '@sveltejs/kit';
import { cacheGet, cacheSet } from '$lib/server/cache.js';
import { calcEgo, extractMedals } from '$lib/server/ego.js';
import { getActivityDef } from '$lib/server/manifest.js';
import { supabaseAdmin } from '$lib/supabase-server.js';

const BUNGIE_ROOT = 'https://www.bungie.net';
const PGCR_ROOT  = 'https://stats.bungie.net';
const HISTORY_TTL = 120_000;
const PGCR_TTL    = 86_400_000; // 24 h — PGCRs never change
// Max PGCRs to fetch inline per request.
// 100 covers the full "last season" for most active players on first load.
// After the first load all matches are cached in Supabase so subsequent loads are instant.
const INLINE_PGCR_LIMIT = 100;

async function bungieGet(url) {
	const res = await fetch(BUNGIE_ROOT + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
	const text = await res.text();
	const fixed = text.replace(/:\s*(\d{15,})/g, ': "$1"');
	return JSON.parse(fixed);
}

/** Fetch one PGCR, using the 24-h in-memory cache. */
async function fetchPgcr(instanceId) {
	const key = `pgcr:${instanceId}`;
	const cached = cacheGet(key);
	if (cached) return cached;
	try {
		const res = await fetch(
			`${PGCR_ROOT}/Platform/Destiny2/Stats/PostGameCarnageReport/${instanceId}/`,
			{ headers: { 'X-API-Key': BUNGIE_API_KEY } }
		);
		const text = await res.text();
		const fixed = text.replace(/:\s*(\d{15,})/g, ': "$1"');
		const data = JSON.parse(fixed);
		if (data.ErrorCode === 1) { cacheSet(key, data, PGCR_TTL); return data; }
	} catch {}
	return null;
}

function n(entry, key) {
	return entry?.extended?.values?.[key]?.basic?.value ?? entry?.values?.[key]?.basic?.value ?? 0;
}

/**
 * Extract one player's stats from a PGCR Response object.
 * Mirrors match detail page's +page.server.js exactly.
 */
function extractPlayerStats(pgcr, targetId) {
	const entries = pgcr.entries ?? [];
	const idStr   = String(targetId);
	const entry   = entries.find(e => String(e.player?.destinyUserInfo?.membershipId ?? '') === idStr);
	if (!entry || entry.values?.completed?.basic?.value !== 1) return null;

	const kills        = n(entry, 'kills');
	const deaths       = n(entry, 'deaths');
	const invasionKills = n(entry, 'invasionKills') || n(entry, 'invaderKills');
	const motesDeposited = n(entry, 'motesDeposited') || n(entry, 'motesBanked');
	const motesLost    = n(entry, 'motesLost');
	const motesPickedUp = n(entry, 'motesPickedUp') || (motesDeposited + motesLost);

	// Fireteam size from matching fireteamId
	const ftId = entry.values?.fireteamId?.basic?.value ?? 0;
	const fireteam_size = ftId > 0
		? entries.filter(e => e.values?.fireteamId?.basic?.value === ftId).length
		: 1;

	const stats = {
		kills,
		deaths,
		assists:       n(entry, 'assists'),
		mobKills:      Math.max(0, kills - invasionKills),
		invasionKills,
		invasionDeaths: n(entry, 'invasionDeaths') || n(entry, 'invaderDeaths'),
		invasions:     n(entry, 'invasions'),
		invasionsDefeated: n(entry, 'invasionsDefeated'),
		motesDeposited,
		motesDenied:   n(entry, 'motesDenied'),
		motesLost,
		motesPickedUp,
		primevalDamage: n(entry, 'primevalDamage'),
		primevalHealing: n(entry, 'primevalHealing'),
		superKills:    n(entry, 'weaponKillsSuper'),
		grenadeKills:  n(entry, 'weaponKillsGrenade'),
		meleeKills:    n(entry, 'weaponKillsMelee'),
		precisionKills: n(entry, 'precisionKills'),
		smallBlockersSent:  n(entry, 'smallBlockersSent'),
		mediumBlockersSent: n(entry, 'mediumBlockersSent'),
		largeBlockersSent:  n(entry, 'largeBlockersSent'),
		fireteam_size,
	};

	const medals = extractMedals(entry.extended?.values ?? {});
	const ego    = calcEgo({ ...stats, medals, fireteamSize: fireteam_size });
	const outcome = entry.values?.standing?.basic?.value === 0 ? 'Win' : 'Loss';

	return { stats, medals, ego, outcome, fireteam_size };
}

export async function GET({ url, setHeaders }) {
	setHeaders({ 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' });

	const membershipType = url.searchParams.get('membershipType');
	const membershipId = url.searchParams.get('membershipId');
	const charIdsParam = url.searchParams.get('charIds') ?? '';
	const count = Math.min(parseInt(url.searchParams.get('count') ?? '100', 10), 10_000);

	if (!membershipType || !membershipId || !charIdsParam) {
		return json({ error: 'Missing params' }, { status: 400 });
	}

	const charIds = charIdsParam
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	const pageCount = Math.ceil(count / 250);
	const cacheCount = pageCount * 250;
	const cacheKey = `history:v3:${membershipId}:${cacheCount}`;

	const flush = url.searchParams.get('flush') === 'true';
	if (!flush) {
		const cached = cacheGet(cacheKey);
		if (cached) return json({ ...cached, matches: cached.matches.slice(0, count) });
	}

	const idStr = String(membershipId);

	// ── DB-first: serve from scanner data if available ────────────────────────
	// The Railway scanner writes full match data for every player it processes.
	// If we have 10+ matches in DB, skip all Bungie API calls entirely.
	if (!flush) {
		try {
			const { data: dbMatches } = await supabaseAdmin
				.from('matches')
				.select('id, ego_score, ego_base, ego_pem, mote_eff, kd, fireteam_size, is_hard_carry, is_carried, stats_json, outcome, period, map_name')
				.eq('player_id', idStr)
				.not('ego_score', 'is', null)
				.order('period', { ascending: false, nullsFirst: false })
				.limit(count);

			if (dbMatches?.length >= 10) {
				const matches = dbMatches.map(m => {
					const stats = m.stats_json ?? {};
					return {
						instanceId:     m.id,
						period:         m.period,
						mapName:        m.map_name ?? 'Gambit',
						win:            m.outcome === 'Win',
						kd:             m.kd ?? 0,
						kills:          stats.kills          ?? (stats.mobKills ?? 0) + (stats.invasionKills ?? 0),
						deaths:         stats.deaths         ?? 0,
						assists:        stats.assists        ?? 0,
						invasionKills:  stats.invasionKills  ?? 0,
						motesDeposited: stats.motesDeposited ?? 0,
						motesDenied:    stats.motesDenied    ?? 0,
						motesPickedUp:  stats.motesPickedUp  ?? 0,
						motesLost:      stats.motesLost      ?? 0,
						primevalDamage: stats.primevalDamage ?? 0,
						fireteamSize:   m.fireteam_size      ?? 1,
						isHardCarry:    m.is_hard_carry      ?? false,
						isCarried:      m.is_carried         ?? false,
						isEnriched:     true,
						stats_json:     stats,
						medals:         stats.medals         ?? {},
						ego: {
							finalScore: m.ego_score ?? 0,
							basePps:    m.ego_base  ?? 0,
							pem:        m.ego_pem   ?? 1,
							moteEff:    m.mote_eff  ?? 0,
						},
					};
				});
				const result = { matches, totalAvailable: matches.length, unenrichedIds: [], source: 'db' };
				cacheSet(cacheKey, result, HISTORY_TTL);
				return json(result);
			}
		} catch {}
		// Fall through to Bungie if DB query fails or insufficient data
	}

	// ── Bungie fallback: player not yet in scanner DB ─────────────────────────
	const perCharData = await Promise.all(
		charIds.map(async (charId) => {
			// Fast Recent-Only: Fetch only page 0 (last 250) for rapid indexing
			const data = await bungieGet(
				`/Platform/Destiny2/${membershipType}/Account/${membershipId}/Character/${charId}/Stats/Activities/?mode=63&count=250&page=0`
			);
			if (data.ErrorCode !== 1) return [];
			return data.Response?.activities ?? [];
		})
	);

	const seen = new Set();
	const merged = [];
	for (const activities of perCharData) {
		for (const act of activities) {
			const id = act.activityDetails?.instanceId;
			if (id && seen.has(id)) continue;
			if (id) seen.add(id);
			merged.push(act);
		}
	}

	merged.sort((a, b) => new Date(b.period ?? 0) - new Date(a.period ?? 0));

	const matches = await Promise.all(
		merged.map(async (act) => {
			const completed = n(act, 'completed');
			const standing = n(act, 'standing');

			const kills = n(act, 'kills');
			const deaths = n(act, 'deaths');
			const assists = n(act, 'assists');
			const invasionKills = n(act, 'invasionKills');
			const motesDeposited = n(act, 'motesDeposited');
			const motesDenied = n(act, 'motesDenied');
			const motesPickedUp = n(act, 'motesPickedUp');
			const motesLost = n(act, 'motesLost');
			const primevalDamage = n(act, 'primevalDamage');

			const refId = act.activityDetails?.referenceId;
			const actDef = refId ? await getActivityDef(refId) : null;
			let mapName = actDef?.displayProperties?.name ?? 'Gambit';
			mapName = mapName.replace(/^Gambit[:\-]\s*/i, '').trim() || 'Gambit';

			const ego = completed
				? calcEgo({
						kills,
						deaths,
						assists,
						invasionKills,
						motesDeposited,
						motesDenied,
						motesPickedUp,
						motesLost,
						primevalDamage,
						fireteamSize: 1,
						medals: {}
					})
				: null;

			return {
				instanceId: act.activityDetails?.instanceId ?? null,
				period: act.period ?? null,
				mapName,
				win: completed === 1 && standing === 0,
				kd: deaths > 0 ? +(kills / deaths).toFixed(2) : kills,
				kills,
				deaths,
				assists,
				invasionKills,
				motesDeposited,
				motesDenied,
				motesPickedUp,
				motesLost,
				primevalDamage,
				ego
			};
		})
	);

	// ── Sync with Live 'player_matches' table ──────────────────────────────────────
	const instanceIds = matches.map((m) => m.instanceId).filter(Boolean);
	if (instanceIds.length > 0) {
		try {
			const idStr = String(membershipId);
			const prefix = idStr.substring(0, 15);

			// Chunk the query to avoid URL length limits (PostgREST GET limit)
			const CHUNK_SIZE = 100;
			const enriched = [];
			for (let i = 0; i < instanceIds.length; i += CHUNK_SIZE) {
				const chunk = instanceIds.slice(i, i + CHUNK_SIZE);
				const { data } = await supabaseAdmin
					.from('matches')
					.select('id, ego_score, ego_base, ego_pem, mote_eff, fireteam_size, is_hard_carry, is_carried, stats_json')
					.eq('player_id', idStr)
					.in('id', chunk);
				if (data) enriched.push(...data);
			}

			if (enriched.length) {
				const byId = Object.fromEntries(enriched.map((r) => [String(r.id), r]));
				for (const m of matches) {
					const e = byId[m.instanceId];
					if (e) {
						m.isEnriched = true;
						if (e.ego_score != null) m.ego = { ...m.ego, finalScore: e.ego_score };
						if (e.ego_base != null) m.ego = { ...m.ego, basePps: e.ego_base };
						if (e.ego_pem != null) m.ego = { ...m.ego, pem: e.ego_pem };
						if (e.mote_eff != null) m.ego = { ...m.ego, moteEff: e.mote_eff };
						if (e.fireteam_size != null) m.fireteamSize = e.fireteam_size;
						if (e.is_hard_carry != null) m.isHardCarry = e.is_hard_carry;
						if (e.is_carried != null) m.isCarried = e.is_carried;
						if (e.stats_json) {
							m.stats_json = e.stats_json;
							// Override activity-history stats with richer PGCR data when available
							if (e.stats_json.kills != null) m.kills = e.stats_json.kills;
							if (e.stats_json.deaths != null) m.deaths = e.stats_json.deaths;
							if (e.stats_json.assists != null) m.assists = e.stats_json.assists;
							if (e.stats_json.invasionKills != null) m.invasionKills = e.stats_json.invasionKills;
							if (e.stats_json.motesDeposited != null) m.motesDeposited = e.stats_json.motesDeposited;
							if (e.stats_json.motesDenied != null) m.motesDenied = e.stats_json.motesDenied;
							if (e.stats_json.motesPickedUp != null) m.motesPickedUp = e.stats_json.motesPickedUp;
							if (e.stats_json.motesLost != null) m.motesLost = e.stats_json.motesLost;
							if (e.stats_json.primevalDamage != null) m.primevalDamage = e.stats_json.primevalDamage;
						}
					}
				}
			}
		} catch {}
	}

	// ── Inline PGCR fetch for unenriched matches ────────────────────────────────
	// Mirrors match detail page exactly: same stats.bungie.net endpoint, same sv() parser.
	// Limits to INLINE_PGCR_LIMIT per request; fetches in parallel batches of 15.
	const stillUnenriched = matches.filter((m) => !m.isEnriched && m.instanceId);
	if (stillUnenriched.length > 0) {
		const toFetch = stillUnenriched.slice(0, INLINE_PGCR_LIMIT);
		const BATCH = 15;
		const pgcrResults = [];

		for (let i = 0; i < toFetch.length; i += BATCH) {
			const batch = toFetch.slice(i, i + BATCH);
			const batchResults = await Promise.all(
				batch.map(async (m) => {
					const pgcrData = await fetchPgcr(m.instanceId);
					if (!pgcrData?.Response) return null;
					const parsed = extractPlayerStats(pgcrData.Response, membershipId);
					if (!parsed) return null;
					return { instanceId: m.instanceId, pgcr: pgcrData.Response, parsed };
				})
			);
			pgcrResults.push(...batchResults.filter(Boolean));
		}

		// Apply parsed PGCR data to match objects
		const toWrite = [];
		for (const { instanceId, pgcr, parsed } of pgcrResults) {
			const m = matches.find((x) => x.instanceId === instanceId);
			if (!m) continue;

			const { stats, medals, ego, outcome, fireteam_size } = parsed;
			m.kills         = stats.kills;
			m.deaths        = stats.deaths;
			m.assists       = stats.assists;
			m.invasionKills = stats.invasionKills;
			m.motesDeposited = stats.motesDeposited;
			m.motesDenied   = stats.motesDenied;
			m.motesPickedUp = stats.motesPickedUp;
			m.motesLost     = stats.motesLost;
			m.primevalDamage = stats.primevalDamage;
			m.fireteamSize  = fireteam_size;
			m.kd            = stats.deaths > 0 ? +(stats.kills / stats.deaths).toFixed(2) : stats.kills;
			m.ego           = ego;
			m.isEnriched    = true;
			m.stats_json    = { ...stats, medals };

			// Map name from PGCR activityDetails if not already set
			if (m.mapName === 'Gambit' && pgcr.activityDetails?.referenceId) {
				// mapName is already resolved above from getActivityDef; keep it
			}

			// Queue for background Supabase write
			toWrite.push({
				id:            instanceId,
				player_id:     String(membershipId),
				map_name:      m.mapName,
				outcome,
				ego_score:     ego.finalScore,
				ego_base:      ego.basePps,
				ego_pem:       ego.pem,
				kd:            m.kd,
				mote_eff:      ego.moteEff,
				fireteam_size,
				is_hard_carry: false, // can't detect without full roster EGO — pgcr-enrich handles this
				is_carried:    false,
				stats_json:    m.stats_json,
				period:        m.period,
				created_at:    new Date().toISOString()
			});
		}

		// Fire-and-forget: persist to Supabase so next load is instant from DB
		if (toWrite.length > 0) {
			supabaseAdmin
				.from('matches')
				.upsert(toWrite, { onConflict: 'id,player_id' })
				.then(() => {})
				.catch(() => {});
		}
	}

	const unenrichedIds = matches
		.filter((m) => !m.isEnriched && m.instanceId)
		.map((m) => m.instanceId);

	const result = { matches, totalAvailable: merged.length, unenrichedIds };
	if (matches.length > 0) cacheSet(cacheKey, result, HISTORY_TTL);

	return json({ ...result, matches: matches.slice(0, count) });
}
