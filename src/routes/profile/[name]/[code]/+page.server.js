import { BUNGIE_API_KEY } from '$env/static/private';
import { supabaseAdmin } from '$lib/supabase-server.js';
import { error } from '@sveltejs/kit';
import { cacheWrap, cacheGet, cacheSet, SEARCH_TTL, PROFILE_TTL } from '$lib/server/cache.js';

// Season date ranges — also used to gate award visibility (only after season ends)
const SEASONS = [
	{ name: 'Season of the Haunted',    number: 17, start: '2022-05-24', end: '2022-08-23' },
	{ name: 'Season of Plunder',        number: 18, start: '2022-08-23', end: '2022-12-06' },
	{ name: 'Season of the Seraph',     number: 19, start: '2022-12-06', end: '2023-02-28' },
	{ name: 'Season of Defiance',       number: 20, start: '2023-02-28', end: '2023-05-23' },
	{ name: 'Season of the Deep',       number: 21, start: '2023-05-23', end: '2023-09-05' },
	{ name: 'Season of the Witch',      number: 22, start: '2023-09-05', end: '2023-11-28' },
	{ name: 'Season of the Wish',       number: 23, start: '2023-11-28', end: '2024-02-27' },
	{ name: 'The Final Shape / Echoes', number: 24, start: '2024-02-27', end: '2024-10-08' },
	{ name: 'Revenant',                 number: 25, start: '2024-10-08', end: '2025-02-04' },
	{ name: 'Heresy',                   number: 26, start: '2025-02-04', end: '2025-05-20' },
	{ name: 'Edge of Fate',             number: 27, start: '2025-05-20', end: '2099-01-01' },
];

function computeSeasonalFromMatches(matches) {
	if (!matches?.length) return null;
	const bySeason = {};
	for (const m of matches) {
		if (!m.period) continue;
		const d = m.period.substring(0, 10);
		const season = SEASONS.find(s => d >= s.start && d < s.end);
		if (!season) continue;
		const stats = m.stats_json ?? {};
		if (!bySeason[season.number]) {
			bySeason[season.number] = {
				season: season.number, name: season.name,
				activitiesEntered: 0, wins: 0, kills: 0, deaths: 0, assists: 0,
				invasionKills: 0, motesDeposited: 0, motesDenied: 0,
				motesPickedUp: 0, motesLost: 0, primevalDamage: 0, primevalHealing: 0,
				superKills: 0, grenadeKills: 0, meleeKills: 0, precisionKills: 0,
				invasionDeaths: 0, invasions: 0, invasionsDefeated: 0,
				smallBlockersSent: 0, mediumBlockersSent: 0, largeBlockersSent: 0,
			};
		}
		const b = bySeason[season.number];
		b.activitiesEntered++;
		if (m.outcome === 'Win') b.wins++;
		b.kills          += stats.kills          ?? (stats.mobKills ?? 0) + (stats.invasionKills ?? 0);
		b.deaths         += stats.deaths         ?? 0;
		b.assists        += stats.assists        ?? 0;
		b.invasionKills  += stats.invasionKills  ?? 0;
		b.motesDeposited += stats.motesDeposited ?? 0;
		b.motesDenied    += stats.motesDenied    ?? 0;
		b.motesPickedUp  += stats.motesPickedUp  ?? 0;
		b.motesLost      += stats.motesLost      ?? 0;
		b.primevalDamage += stats.primevalDamage ?? 0;
		b.primevalHealing+= stats.primevalHealing?? 0;
		b.superKills     += stats.superKills ?? stats.weaponKillsSuper   ?? 0;
		b.grenadeKills   += stats.grenadeKills ?? stats.weaponKillsGrenade ?? 0;
		b.meleeKills     += stats.meleeKills ?? stats.weaponKillsMelee   ?? 0;
		b.precisionKills += stats.precisionKills ?? 0;
		b.invasionDeaths += stats.invasionDeaths ?? stats.invaderDeaths  ?? 0;
		b.invasions      += stats.invasions      ?? 0;
		b.invasionsDefeated += stats.invasionsDefeated ?? 0;
		b.smallBlockersSent  += stats.smallBlockersSent  ?? 0;
		b.mediumBlockersSent += stats.mediumBlockersSent ?? 0;
		b.largeBlockersSent  += stats.largeBlockersSent  ?? 0;
	}
	const seasons = Object.values(bySeason).sort((a, b) => b.season - a.season);
	return seasons.length ? { seasons } : null;
}

// 5-minute cache for Supabase claim status (rarely changes)
const CLAIM_TTL = 300_000;

const BUNGIE_ROOT = 'https://www.bungie.net';

async function bungieGet(url, retries = 3) {
	let lastErr;
	for (let attempt = 0; attempt < retries; attempt++) {
		if (attempt > 0) await new Promise(r => setTimeout(r, 600 * attempt));
		try {
			const res = await fetch(BUNGIE_ROOT + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
			// Don't retry 4xx — those are definitive (not found, bad request, etc.)
			if (res.status >= 400 && res.status < 500) throw new Error(`Bungie ${res.status}: ${url}`);
			if (!res.ok) { lastErr = new Error(`Bungie ${res.status}: ${url}`); continue; }
			const text = await res.text();
			return JSON.parse(text.replace(/:\s*(\d{15,})/g, ': "$1"'));
		} catch (e) {
			if (e.message.startsWith('Bungie 4')) throw e; // re-throw 4xx immediately
			lastErr = e;
		}
	}
	throw lastErr;
}

export async function load({ params, parent, url, setHeaders }) {
	const { name, code } = params;
	const { user } = await parent();

	let membershipType, membershipId;
	const midParam = url.searchParams.get('mid');
	const mtParam = url.searchParams.get('mt');

	if (midParam && mtParam) {
		membershipId = midParam;
		membershipType = parseInt(mtParam, 10);
	} else {
		try {
			const searchKey = `search:${name.toLowerCase()}#${code}`;
			const player = await cacheWrap(searchKey, SEARCH_TTL, async () => {
				// Use POST endpoint — handles special characters (colons, emojis, etc.) reliably
				const res = await fetch(
					`${BUNGIE_ROOT}/Platform/Destiny2/SearchDestinyPlayerByBungieName/-1/`,
					{
						method: 'POST',
						headers: { 'X-API-Key': BUNGIE_API_KEY, 'Content-Type': 'application/json' },
						body: JSON.stringify({ displayName: name, displayNameCode: parseInt(code, 10) }),
					}
				);
				const text = await res.text();
				const d = JSON.parse(text.replace(/:\s*(\d{15,})/g, ': "$1"'));
				if (!d || d.ErrorCode !== 1 || !Array.isArray(d.Response) || !d.Response.length)
					return null;
				return (
					d.Response.find((p) => p.crossSaveOverride === p.membershipType) ??
					d.Response.find((p) => p.membershipType === 3) ??
					d.Response[0]
				);
			});

			if (!player?.membershipType || !player?.membershipId) throw error(404, 'Player not found');
			membershipType = player.membershipType;
			membershipId = String(player.membershipId);
		} catch (e) {
			if (e?.status) throw e;
			throw error(502, 'Bungie API unavailable');
		}
	}

	const profileKey = `profile:${membershipId}`;
	const idStr = String(membershipId);

	let profileBundle, dbPlayer, dbGambitStats, dbMatches, dbJprRows, dbAwards;
	try {
		[profileBundle, dbPlayer, dbGambitStats, dbMatches, dbJprRows, dbAwards] = await Promise.all([
			// ── Bungie: profile + triumphs in one call — clan/stats served from DB ──
			cacheWrap(profileKey, PROFILE_TTL, async () => {
				const profileData = await bungieGet(
					`/Platform/Destiny2/${membershipType}/Profile/${membershipId}/?components=100,104,200,202,205,900`
				);
				return { profileData };
			}),
			// ── DB: player record (claim + banner + pinned badges) ──
			(async () => {
				const claimKey = `claim:${membershipId}`;
				const cachedClaim = cacheGet(claimKey);
				if (cachedClaim !== undefined) return cachedClaim;
				const r = await supabaseAdmin
					.from('players')
					.select('claimed_by, banner_url, pinned_award_keys')
					.eq('id', membershipId)
					.single()
					.then((r) => r.data)
					.catch(() => null);
				cacheSet(claimKey, r, CLAIM_TTL);
				return r;
			})(),
			// ── DB: lifetime gambit stats — in parallel with Bungie calls ──
			supabaseAdmin
				.from('player_gambit_stats')
				.select('*')
				.eq('player_id', idStr)
				.single()
				.then(r => r.data ?? null)
				.catch(() => null),
			// ── DB: recent matches — in parallel with Bungie calls ──
			supabaseAdmin
				.from('matches')
				.select('stats_json, outcome, period, created_at')
				.eq('player_id', idStr)
				.order('period', { ascending: false, nullsFirst: false })
				.limit(150)
				.then(r => r.data ?? [])
				.catch(() => []),
			// ── DB: JPR rows — in parallel with Bungie calls ──
			supabaseAdmin
				.from('player_jpr')
				.select('segment, jpr, games_played')
				.eq('player_id', idStr)
				.gte('games_played', 20)
				.then(r => r.data ?? [])
				.catch(() => []),
			// ── DB: season awards ──
			supabaseAdmin
				.from('player_season_awards')
				.select('season, slug, title, rank, tier, color, icon, platform, data')
				.eq('player_id', idStr)
				.order('season', { ascending: false })
				.then(r => r.data ?? [])
				.catch(() => []),
		]);
	} catch (e) {
		if (e?.status) throw e;
		throw error(502, 'Bungie API unavailable');
	}

	const { profileData } = profileBundle;
	const profile = profileData?.Response ?? {};
	const charIds = profile?.profile?.data?.characterIds ?? [];
	const characters = profile?.characters?.data ?? {};
	const progressions = profile?.characterProgressions?.data ?? {};
	const triData = profileData; // triumphs fetched as component 900 on the same call
	const clan = null; // scanner doesn't store clan — skipped to eliminate extra Bungie call
	const _statsResults = {}; // no longer fetching acctStats from Bungie

	const sortedCharIds = [...charIds].sort(
		(a, b) =>
			new Date(characters[b]?.dateLastPlayed ?? 0) - new Date(characters[a]?.dateLastPlayed ?? 0)
	);
	const mainCharId = sortedCharIds[0];

	// recentMatches served from DB — no Bungie activity history calls needed
	const recentMatches = [];

	// lifetimeStats served from DB — scanner keeps player_gambit_stats up to date
	const lifetimeStats = null;

	// 1. Fetch Basic Profile & Triumphs (Records)
	// Targeted verified Gambit medal and triumph hashes for instant intelligence
	const VERIFIED_HASHES = {
		// Medals (The "Records" that track medal counts)
		armyOfOne: 511083400,
		massacre: 3483842827,
		maximumCarnage: 1639297179,
		locksmith: 3976371416,
		halfBanked: 1197518485,
		firstToBlock: 1622244172,
		moteHaveBeen: 947052851,
		killmonger: 1438116414,
		overkillmonger: 433799052,
		thrillmonger: 2257346269,
		notOnMyWatch: 1334533602,
		bigGameHunter: 3359240632,
		fastFill: 2918365694,
		lastGuardianStanding: 4220005143,
		noEscape: 2476159161,
		payback: 3800921268,
		blockbuster: 2345177128,
		rapidPayback: 353633377,
		
		// Major Triumphs
		protectTheRunner: 2467484432,
		lightVersusLight: 572729504,
		darkAgeArsenal: 1965921084,
		prestige: 1306483854,
		mostMotes: 1398935792
	};

	let verifiedMedals = {};

	try {
		const triumphs = profile?.profileRecords?.data?.records ?? {};
		for (const [key, hash] of Object.entries(VERIFIED_HASHES)) {
			const record = triumphs[hash];
			verifiedMedals[key] = record?.objectives?.[0]?.progress ?? (record?.state === 0 ? 1 : 0);
		}
	} catch {}

	const triumphArmyOfOne = verifiedMedals.armyOfOne ?? 0;

	// Stats source is now always DB
	const source = dbGambitStats ? 'db' : (dbMatches?.length ? 'recent' : 'none');

	// 2. Aggregate Performance Intelligence from pre-loaded DB data
	let dbTotals = {
		lifetime: { entered: 0, wins: 0, kills: 0, deaths: 0, motes: 0, invKills: 0 },
		recent: { entered: 0, wins: 0, kills: 0, deaths: 0, assists: 0, precision: 0, motes: 0, motesLost: 0, motesPickedUp: 0, primevalDmg: 0, primevalHeal: 0, invasions: 0, shutDowns: 0, ability: 0, super: 0, meleeKills: 0, grenadeKills: 0, blockers: 0, invKills: 0, invDeaths: 0, motesDenied: 0, armyOfOne: triumphArmyOfOne }
	};

	try {
		if (dbGambitStats) {
			dbTotals.lifetime = {
				entered: dbGambitStats.activities_entered || 0,
				wins: dbGambitStats.activities_won || 0,
				kills: dbGambitStats.kills || 0,
				deaths: dbGambitStats.deaths || 0,
				motes: dbGambitStats.motes_deposited || 0,
				invKills: dbGambitStats.invasion_kills || 0
			};
		}

		if (dbMatches?.length) {
			const targetPrefix = name ? String(name).split('#')[0].toLowerCase() : null;
			const targetCodeStr = code ? String(code).padStart(4, '0') : null;
			const recentAgg = dbMatches.reduce(
				(acc, m) => {
					const stats = m.stats_json ?? {};
					const roster = stats.roster ?? [];
					const myEntry = roster.find(r => r.is_target || String(r.id) === idStr || (targetPrefix && String(r.name).split('#')[0].toLowerCase() === targetPrefix && String(r.code) === targetCodeStr));
					if (!myEntry) return acc;

					acc.entered++;
					const isWin = m.outcome === 'Win' || m.outcome === 'WIN' || myEntry.team === (stats.standing === 0 ? myEntry.team : null);
					if (isWin) acc.wins++;
					acc.kills += stats.kills ?? ((stats.mobKills ?? 0) + (stats.invasionKills ?? 0));
					acc.deaths += stats.deaths ?? 0;
					acc.assists += stats.assists ?? 0;
					acc.precision += stats.precisionKills ?? 0;
					acc.motes += stats.motesDeposited ?? 0;
					acc.motesLost += stats.motesLost ?? 0;
					acc.motesPickedUp += stats.motesPickedUp ?? 0;
					acc.primevalDmg += stats.primevalDamage ?? 0;
					acc.primevalHeal += stats.primevalHealing ?? 0;
					acc.invasions += stats.invasions ?? 0;
					acc.shutDowns += stats.invasionsDefeated ?? 0;
					const meleek = stats.meleeKills ?? stats.weaponKillsMelee ?? 0;
					const grenadek = stats.grenadeKills ?? stats.weaponKillsGrenade ?? 0;
					acc.meleeKills += meleek;
					acc.grenadeKills += grenadek;
					acc.ability += meleek + grenadek;
					acc.super += stats.superKills ?? stats.weaponKillsSuper ?? 0;
					acc.blockers += (stats.smallBlockersSent ?? 0) + (stats.mediumBlockersSent ?? 0) + (stats.largeBlockersSent ?? 0);
					acc.invKills += stats.invasionKills ?? 0;
					acc.invDeaths += stats.invaderDeaths ?? stats.invasionDeaths ?? 0;
					acc.motesDenied += stats.motesDenied ?? 0;
					const mds = stats.medals ?? {};
					acc.armyOfOne += mds.armyOfOne ?? 0;
					return acc;
				},
				{ ...dbTotals.recent }
			);
			dbTotals.recent = recentAgg;
		}
	} catch {}

	// Background sync removed — Railway scanner owns player_gambit_stats updates

	setHeaders({ 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' });

	// Seasonal stats computed from DB matches — instant, no Bungie pagination
	const seasonal = computeSeasonalFromMatches(dbMatches);

	// ── JPR Leaderboard Ranks ────────────────────────────────────────────────
	// dbJprRows already loaded in parallel — just need rank counts now
	let jprRanks = null;
	try {
		if (dbJprRows?.length) {
			const rankResults = await Promise.all(
				dbJprRows.map(async (row) => {
					const { count } = await supabaseAdmin
						.from('player_jpr')
						.select('*', { count: 'exact', head: true })
						.eq('segment', row.segment)
						.gte('games_played', 20)
						.gt('jpr', row.jpr);
					return { segment: row.segment, rank: (count ?? 0) + 1, jpr: row.jpr, games: row.games_played };
				})
			);
			jprRanks = Object.fromEntries(rankResults.map((r) => [r.segment, { rank: r.rank, jpr: r.jpr, games: r.games }]));
		}
	} catch {}

	const mainChar = characters[mainCharId];
	return {
		player: {
			membershipType,
			membershipId,
			bungieGlobalDisplayName: name,
			bungieGlobalDisplayNameCode: code
		},
		characters,
		characterIds: sortedCharIds,
		membershipType,
		membershipId,
		recentMatches,
		lifetimeStats,
		statsSource: source,
		clan,
		emblemBg: mainChar?.emblemBackgroundPath ? BUNGIE_ROOT + mainChar.emblemBackgroundPath : null,
		gambitProgression: progressions[mainCharId]?.progressions?.[3008065600],
		isClaimed: !!dbPlayer?.claimed_by,
		isOwner: user?.membershipId === membershipId,
		canClaim: user?.membershipId === membershipId && !dbPlayer?.claimed_by,
		seasonal,
		dbTotals,
		verifiedMedals,
		jprRanks,
		// Only surface awards for seasons that have already ended
		awards: (dbAwards ?? []).filter((a) => {
			const season = SEASONS.find((s) => s.number === a.season);
			if (!season) return false;
			const today = new Date().toISOString().slice(0, 10);
			return today >= season.end;
		}),
		bannerUrl: dbPlayer?.banner_url ?? null,
		pinnedAwardKeys: dbPlayer?.pinned_award_keys ?? []
	};
}
