/**
 * /api/export — Download match history as CSV.
 *
 * Uses Supabase player_matches if available (full data); falls back to
 * activity-history-only data if not enriched yet.
 *
 * GET ?membershipId=X&membershipType=Y&charIds=A,B&count=1000
 *
 * Returns: text/csv attachment
 *
 * Columns match desktop app export exactly:
 * Match #, Date, Map, Outcome, Stack Size, Final RATING, Base PPS, PEM,
 * Mote Efficiency (%), K/D, Mob Kills, Invasion Kills, Assists, Deaths,
 * Motes Deposited, Motes Denied, Motes Picked Up, Motes Lost, Primeval Dmg,
 * Hard Carry, Carried, + all 18 medal columns
 */

import { BUNGIE_API_KEY } from '$env/static/private';
import { supabaseAdmin } from '$lib/supabase-server.js';
import { calcEgo } from '$lib/server/ego.js';

const MEDAL_KEYS = [
	'notOnMyWatch',
	'armyOfOne',
	'locksmith',
	'blockbuster',
	'rapidPayback',
	'massacre',
	'motesHaveBeen',
	'halfBanked',
	'firstToBlock',
	'payback',
	'overkillmonger',
	'killmonger',
	'thrillmonger',
	'fastFill',
	'killAfterInvasion',
	'bigGameHunter',
	'lastGuardianStanding',
	'noEscape'
];

function csvRow(cells) {
	return cells
		.map((c) => {
			const s = String(c ?? '');
			return s.includes(',') || s.includes('"') || s.includes('\n')
				? `"${s.replace(/"/g, '""')}"`
				: s;
		})
		.join(',');
}

function fmtDate(iso) {
	if (!iso) return '';
	try {
		return new Date(iso).toLocaleString('en-US', { timeZone: 'UTC' });
	} catch {
		return iso;
	}
}

export async function GET({ url }) {
	const membershipId = url.searchParams.get('membershipId');
	const membershipType = url.searchParams.get('membershipType');
	const charIdsParam = url.searchParams.get('charIds') ?? '';
	const count = Math.min(parseInt(url.searchParams.get('count') ?? '1000', 10), 10_000);

	if (!membershipId) {
		return new Response('Missing membershipId', { status: 400 });
	}

	const headers = {
		'Content-Type': 'text/csv; charset=utf-8',
		'Content-Disposition': `attachment; filename="jadestone_${membershipId}_${count}.csv"`
	};

	const HEADER_ROW = csvRow([
		'Match #',
		'Date',
		'Map',
		'Outcome',
		'Stack Size',
		'Final RATING',
		'Base PPS',
		'PEM',
		'Mote Eff %',
		'K/D',
		'Mob Kills',
		'Invasion Kills',
		'Assists',
		'Deaths',
		'Motes Deposited',
		'Motes Denied',
		'Motes Picked Up',
		'Motes Lost',
		'Primeval Dmg',
		'Hard Carry',
		'Carried',
		...MEDAL_KEYS
	]);

	// ── Try Supabase (full data) ──────────────────────────────────────────────
	try {
		const idStr = String(membershipId);
		const prefix = idStr.substring(0, 15);

		const { data: rows } = await supabaseAdmin
			.from('matches')
			.select(
				'id,map_name,created_at,outcome,ego_score,ego_base,ego_pem,mote_eff,kd,fireteam_size,is_hard_carry,is_carried,stats_json'
			)
			.or(`player_id.eq.${idStr},and(player_id.gte.${prefix}0000,player_id.lte.${prefix}9999)`)
			.not('stats_json', 'is', null)
			.order('created_at', { ascending: false })
			.limit(count);

		if (rows?.length) {
			const lines = [HEADER_ROW];
			rows.forEach((row, i) => {
				const s = row.stats_json ?? {};
				const med = s.medals ?? {};
				lines.push(
					csvRow([
						rows.length - i,
						fmtDate(row.created_at),
						row.map_name ?? 'Gambit',
						row.outcome ?? '',
						row.fireteam_size ?? 1,
						row.ego_score?.toFixed(1) ?? '',
						row.ego_base?.toFixed(1) ?? '',
						row.ego_pem?.toFixed(3) ?? '',
						row.mote_eff?.toFixed(1) ?? '',
						row.kd?.toFixed(2) ?? '',
						s.mobKills ?? 0,
						s.invasionKills ?? 0,
						s.assists ?? 0,
						s.deaths ?? 0,
						s.motesDeposited ?? 0,
						s.motesDenied ?? 0,
						s.motesPickedUp ?? 0,
						s.motesLost ?? 0,
						s.primevalDamage ?? 0,
						row.is_hard_carry ? 'Yes' : 'No',
						row.is_carried ? 'Yes' : 'No',
						...MEDAL_KEYS.map((mk) => med[mk] ?? 0)
					])
				);
			});
			return new Response(lines.join('\n'), { headers });
		}
	} catch (e) {
		console.error('Export from Supabase failed:', e.message);
		/* fall through to activity-history path */
	}

	// ── Fallback: activity-history (no medals/fireteam, basic EGO) ────────────
	const charIds = charIdsParam
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	if (!membershipType || !charIds.length) {
		return new Response(HEADER_ROW + '\n', { headers });
	}

	try {
		const pageCount = Math.ceil(count / 250);
		const perChar = await Promise.all(
			charIds.map(async (charId) => {
				const all = [];
				for (let page = 0; page < pageCount; page++) {
					const res = await fetch(
						`https://www.bungie.net/Platform/Destiny2/${membershipType}/Account/${membershipId}/Character/${charId}/Stats/Activities/?mode=63&count=250&page=${page}`,
						{ headers: { 'X-API-Key': BUNGIE_API_KEY } }
					);
					const d = await res.json();
					if (d.ErrorCode !== 1) break;
					const acts = d.Response?.activities ?? [];
					all.push(...acts);
					if (acts.length < 250) break;
				}
				return all;
			})
		);

		const seen = new Set();
		const activities = [];
		for (const acts of perChar) {
			for (const a of acts) {
				const id = a.activityDetails?.instanceId;
				if (id && seen.has(id)) continue;
				if (id) seen.add(id);
				activities.push(a);
			}
		}
		activities.sort((a, b) => new Date(b.period ?? 0) - new Date(a.period ?? 0));
		const slice = activities.slice(0, count);

		function n(entry, key) {
			return (
				entry?.extended?.values?.[key]?.basic?.value ?? entry?.values?.[key]?.basic?.value ?? 0
			);
		}

		const lines = [HEADER_ROW];
		const completed = slice.filter((a) => n(a, 'completed') === 1);
		completed.forEach((act, i) => {
			const kills = n(act, 'kills');
			const deaths = n(act, 'deaths');
			const assists = n(act, 'assists');
			const invasionKills = n(act, 'invasionKills');
			const motesDeposited = n(act, 'motesDeposited');
			const motesDenied = n(act, 'motesDenied');
			const motesPickedUp = n(act, 'motesPickedUp');
			const motesLost = n(act, 'motesLost');
			const primevalDamage = n(act, 'primevalDamage');
			const standing = n(act, 'standing');
			const outcome = standing === 0 ? 'Win' : 'Loss';
			const ego = calcEgo({
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
			});

			lines.push(
				csvRow([
					completed.length - i,
					fmtDate(act.period),
					'Gambit',
					outcome,
					1,
					ego.finalScore.toFixed(1),
					ego.basePps.toFixed(1),
					ego.pem.toFixed(3),
					ego.moteEff.toFixed(1),
					ego.simpleKd.toFixed(2),
					Math.max(0, kills - invasionKills),
					invasionKills,
					assists,
					deaths,
					motesDeposited,
					motesDenied,
					motesPickedUp,
					motesLost,
					primevalDamage,
					'No',
					'No',
					...MEDAL_KEYS.map(() => 0)
				])
			);
		});

		return new Response(lines.join('\n'), { headers });
	} catch (e) {
		return new Response('Error: ' + e.message, { status: 500 });
	}
}
