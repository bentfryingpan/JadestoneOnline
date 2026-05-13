/**
 * /api/pgcr-enrich — Optimized Bulk Enrichment (Robust Schema-Aligned)
 *
 * Extracts deep stats (Grenades, Melee, Super, Blockers) for all players
 * and stores them in 'stats_json' for 1:1 parity with desktop tools.
 */

import { BUNGIE_API_KEY } from '$env/static/private';
import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabase-server.js';
import { calcEgo, extractMedals as _extractMedals, detectRole } from '$lib/server/ego.js';
import { getItemDef, getActivityDef } from '$lib/server/manifest.js';
import { cacheGet, cacheSet } from '$lib/server/cache.js';

const BUNGIE_ROOT = 'https://www.bungie.net';
const PGCR_ROOT = 'https://stats.bungie.net';
const PGCR_TTL = 86_400_000;

const SLOT_BUCKETS = {
	1491708835: 'Kinetic',
	2465295065: 'Energy',
	95395402: 'Power'
};

const LOCAL_MEDALS = [
	'armyofone',
	'massacre',
	'locksmith',
	'blockbuster',
	'halfbanked',
	'firsttoblock',
	'notonmywatch',
	'moteshavebeen',
	'fastfill',
	'killmonger',
	'overkillmonger',
	'thrillmonger',
	'biggamehunter',
	'lastguardianstanding',
	'killafterinvasion',
	'noescape',
	'payback'
];

async function fetchPgcr(id) {
	const key = `pgcr:${id}`;
	const cached = cacheGet(key);
	if (cached) return cached;
	try {
		const res = await fetch(`${PGCR_ROOT}/Platform/Destiny2/Stats/PostGameCarnageReport/${id}/`, {
			headers: { 'X-API-Key': BUNGIE_API_KEY }
		});
		const text = await res.text();
		const fixed = text.replace(/:\s*(\d{15,})/g, ': "$1"');
		const data = JSON.parse(fixed);
		if (data.ErrorCode === 1) {
			cacheSet(key, data, PGCR_TTL);
			return data;
		}
	} catch {}
	return null;
}

function sv(entry, key) {
	return entry?.extended?.values?.[key]?.basic?.value ?? entry?.values?.[key]?.basic?.value ?? 0;
}

async function processPgcr(pgcr, targetId, targetName, targetCode) {
	const entries = pgcr.entries ?? [];
	if (!entries.length) return null;

	const targetPrefix = targetName ? targetName.split('#')[0].toLowerCase() : null;
	const targetCodeStr = targetCode ? String(targetCode).padStart(4, '0') : null;

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

	const roster = [];
	let targetEntryData = null;

	for (const e of entries) {
		const pInfo = e.player?.destinyUserInfo ?? {};
		const pId = String(pInfo.membershipId ?? '');
		const pName = pInfo.bungieGlobalDisplayName ?? pInfo.displayName ?? 'Unknown';
		const pCode = pInfo.bungieGlobalDisplayNameCode
			? String(pInfo.bungieGlobalDisplayNameCode).padStart(4, '0')
			: null;

		const ftSize = ftGroups[e.values?.fireteamId?.basic?.value ?? 0] ?? 1;
		const team = teamMap[e.values?.team?.basic?.value ?? 0] ?? 'Alpha';

		const isTarget =
			pId === String(targetId) ||
			(targetPrefix &&
				pName.split('#')[0].toLowerCase() === targetPrefix &&
				pCode === targetCodeStr);

		const totalKills = sv(e, 'kills');
		const invKills = sv(e, 'invasionKills') || sv(e, 'invaderKills');
		const mDep = sv(e, 'motesDeposited') || sv(e, 'motesBanked');
		const mLost = sv(e, 'motesLost');

		const stats = {
			assists: sv(e, 'assists'),
			deaths: sv(e, 'deaths'),
			kills: totalKills,
			mobKills: Math.max(0, totalKills - invKills),
			precisionKills: sv(e, 'precisionKills'),
			invasionKills: invKills,
			invasionDeaths: sv(e, 'invasionDeaths') || sv(e, 'invaderDeaths'),
			invasions: sv(e, 'invasions'),
			invasionsDefeated: sv(e, 'invasionsDefeated'),
			motesDeposited: mDep,
			motesDenied: sv(e, 'motesDenied'),
			motesLost: mLost,
			motesPickedUp: sv(e, 'motesPickedUp') || mDep + mLost,
			superKills: sv(e, 'weaponKillsSuper'),
			grenadeKills: sv(e, 'weaponKillsGrenade'),
			meleeKills: sv(e, 'weaponKillsMelee'),
			primevalDamage: sv(e, 'primevalDamage'),
			primevalHealing: sv(e, 'primevalHealing'),
			smallBlockersSent: sv(e, 'smallBlockersSent'),
			mediumBlockersSent: sv(e, 'mediumBlockersSent'),
			largeBlockersSent: sv(e, 'largeBlockersSent'),
			fireteam_size: ftSize
		};

		const egoMedals = _extractMedals(e.extended?.values ?? {});
		const ego =
			e.values?.completed?.basic?.value === 1 ? calcEgo({ ...stats, medals: egoMedals }) : null;

		const playerWeapons = [];
		for (const w of e.extended?.weapons ?? []) {
			const def = await getItemDef(w.referenceId);
			if (def) {
				playerWeapons.push({
					name: def.displayProperties.name,
					hash: w.referenceId,
					slot: SLOT_BUCKETS[def.inventory?.bucketTypeHash] ?? 'Unknown',
					kills: sv(w, 'uniqueWeaponKills'),
					precision: sv(w, 'uniqueWeaponPrecisionKills'),
					icon: BUNGIE_ROOT + def.displayProperties.icon
				});
			}
		}

		const rosterItem = {
			id: pId,
			name: pName,
			code: pCode,
			team,
			className: { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' }[e.player?.classType ?? -1] ?? 'Unknown',
			score: ego?.finalScore ?? 0,
			fireteam_size: ftSize,
			is_target: isTarget,
			stats,
			weapons: playerWeapons,
			medals: egoMedals
		};
		roster.push(rosterItem);

		if (isTarget && e.values?.completed?.basic?.value === 1) {
			targetEntryData = {
				stats: { ...stats, top_weapons: playerWeapons, medals: egoMedals },
				ego,
				outcome: e.values?.standing?.basic?.value === 0 ? 'Win' : 'Loss'
			};
		}
	}

	if (!targetEntryData) return null;

	const myTeamName = roster.find((r) => r.is_target)?.team;
	const myTeamScores = roster
		.filter((r) => r.team === myTeamName && r.score > 0)
		.map((r) => r.score);
	const { isCarry, isCarried } = detectRole(targetEntryData.ego.finalScore, myTeamScores);

	const stats_json = {
		...targetEntryData.stats,
		ego_breakdown: targetEntryData.ego.components,
		is_hard_carry: isCarry,
		is_carried: isCarried,
		roster
	};

	return { ...targetEntryData, stats_json };
}

export async function POST({ request }) {
	const { membershipId, membershipType, bungieDisplayName, bungieDisplayCode, instanceIds } =
		await request.json();
	if (!membershipId || !instanceIds?.length)
		return json({ error: 'Missing params' }, { status: 400 });

	const CHUNK_SIZE = 15; // Process 15 matches at a time in parallel
	const results = [];

	for (let i = 0; i < instanceIds.length; i += CHUNK_SIZE) {
		const chunk = instanceIds.slice(i, i + CHUNK_SIZE);
		const chunkResults = await Promise.all(
			chunk.map(async (id) => {
				try {
					const pgcrRes = await fetchPgcr(id);
					if (!pgcrRes?.Response) return null;
					const enriched = await processPgcr(
						pgcrRes.Response,
						membershipId,
						bungieDisplayName,
						bungieDisplayCode
					);
					if (!enriched) return null;

					const actDef = await getActivityDef(pgcrRes.Response.activityDetails?.referenceId);
					const mapName = (actDef?.displayProperties?.name ?? 'Gambit')
						.replace(/^Gambit[:\-]\s*/i, '')
						.trim();

					return {
						id: id,
						player_id: String(membershipId),
						map_name: mapName,
						outcome: enriched.outcome,
						ego_score: enriched.ego.finalScore,
						ego_base: enriched.ego.basePps,
						ego_pem: enriched.ego.pem,
						kd: enriched.ego.simpleKd,
						mote_eff: enriched.ego.moteEff,
						fireteam_size: enriched.stats_json.fireteam_size,
						stats_json: enriched.stats_json,
						period: pgcrRes.Response.period,
						created_at: new Date().toISOString()
					};
				} catch {
					return null;
				}
			})
		);
		results.push(...chunkResults);
	}

	const toUpsert = results.filter(Boolean);
	if (toUpsert.length === 0) return json({ stored: 0 });

	try {
		await supabaseAdmin.from('players').upsert(
			{
				id: String(membershipId),
				bungie_name: bungieDisplayName,
				bungie_code: String(bungieDisplayCode).padStart(4, '0'),
				membership_type: parseInt(membershipType),
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'id' }
		);
	} catch {}

	const { error: mErr } = await supabaseAdmin
		.from('matches')
		.upsert(toUpsert, { onConflict: 'id,player_id' });
	if (mErr) return json({ error: mErr.message }, { status: 500 });

	const { data: p } = await supabaseAdmin
		.from('players')
		.select('ngr,games_played')
		.eq('id', String(membershipId))
		.single();
	const newGames = (p?.games_played ?? 0) + toUpsert.length;
	const newNgr =
		((p?.ngr ?? 0) * (p?.games_played ?? 0) + toUpsert.reduce((s, m) => s + m.ego_score, 0)) /
		newGames;

	await supabaseAdmin.from('players').upsert({
		id: String(membershipId),
		ngr: Math.round(newNgr * 10) / 10,
		ego_score_avg: Math.round(newNgr * 10) / 10,
		games_played: newGames,
		updated_at: new Date().toISOString()
	});

	return json({ stored: toUpsert.length });
}
