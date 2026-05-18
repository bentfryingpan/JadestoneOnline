import { BUNGIE_API_KEY } from '$env/static/private';
import { supabaseAdmin } from '$lib/supabase-server.js';
import { error } from '@sveltejs/kit';
import { cacheWrap, cacheGet, cacheSet, SEARCH_TTL, PROFILE_TTL } from '$lib/server/cache.js';
import { computeSeasonal } from '$lib/server/seasonal.js';

// 5-minute cache for Supabase claim status (rarely changes)
const CLAIM_TTL = 300_000;

const BUNGIE_ROOT = 'https://www.bungie.net';

async function bungieGet(url) {
	const res = await fetch(BUNGIE_ROOT + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
	if (!res.ok) throw new Error(`Bungie ${res.status}: ${url}`);
	return res.json();
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
				const d = await bungieGet(
					`/Platform/Destiny2/SearchDestinyPlayer/-1/${encodeURIComponent(name + '#' + code)}/`
				);
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
	let profileBundle, dbPlayer;
	try {
		[profileBundle, dbPlayer] = await Promise.all([
			cacheWrap(profileKey, PROFILE_TTL, async () => {
				const [profileData, clanData, acctStats] = await Promise.all([
					bungieGet(
						`/Platform/Destiny2/${membershipType}/Profile/${membershipId}/?components=100,104,200,202,205`
					),
					bungieGet(`/Platform/GroupV2/User/${membershipType}/${membershipId}/0/1/`),
					bungieGet(
						`/Platform/Destiny2/${membershipType}/Account/${membershipId}/Stats/?modes=63&groups=1,2`
					)
				]);
				return { profileData, clanData, acctStats };
			}),
			(async () => {
				const claimKey = `claim:${membershipId}`;
				const cachedClaim = cacheGet(claimKey);
				if (cachedClaim !== undefined) return cachedClaim;
				const r = await supabaseAdmin
					.from('players')
					.select('claimed_by')
					.eq('id', membershipId)
					.single()
					.then((r) => r.data)
					.catch(() => null);
				cacheSet(claimKey, r, CLAIM_TTL);
				return r;
			})()
		]);
	} catch (e) {
		if (e?.status) throw e;
		throw error(502, 'Bungie API unavailable');
	}

	const { profileData, clanData, acctStats } = profileBundle;
	const profile = profileData?.Response ?? {};
	const charIds = profile?.profile?.data?.characterIds ?? [];
	const characters = profile?.characters?.data ?? {};
	const progressions = profile?.characterProgressions?.data ?? {};
	const clan = clanData?.Response?.results?.[0]?.group ?? null;
	const _statsResults = acctStats?.Response?.mergedAllCharacters?.results ?? {};

	const sortedCharIds = [...charIds].sort(
		(a, b) =>
			new Date(characters[b]?.dateLastPlayed ?? 0) - new Date(characters[a]?.dateLastPlayed ?? 0)
	);
	const mainCharId = sortedCharIds[0];

	let recentMatches = [];
	if (sortedCharIds.length > 0) {
		const perCharData = await Promise.all(
			sortedCharIds.map((charId) => {
				const key = `matches:${membershipId}:${charId}`;
				return cacheWrap(key, PROFILE_TTL, () =>
					bungieGet(
						`/Platform/Destiny2/${membershipType}/Account/${membershipId}/Character/${charId}/Stats/Activities/?mode=63&count=25&page=0`
					)
				).then((d) => d?.Response?.activities ?? []);
			})
		);
		const seen = new Set();
		const merged = [];
		for (const charMatches of perCharData) {
			for (const m of charMatches) {
				const id = m.activityDetails?.instanceId;
				if (id && !seen.has(id)) {
					seen.add(id);
					merged.push(m);
				}
			}
		}
		recentMatches = merged
			.sort((a, b) => new Date(b.period ?? 0) - new Date(a.period ?? 0))
			.slice(0, 25);
	}

	let lifetimeStats =
		_statsResults?.gambit?.allTime ??
		_statsResults?.pvecomp_gambit?.allTime ??
		_statsResults?.allPveCompetitive?.allTime ??
		_statsResults?.allPvECompetitive?.allTime ??
		Object.values(_statsResults).find((r) => (r?.allTime?.activitiesEntered?.basic?.value ?? 0) > 0)
			?.allTime ??
		null;

	if (!lifetimeStats && mainCharId) {
		try {
			const cr =
				(
					await cacheWrap(`charstats:${membershipId}:${mainCharId}`, PROFILE_TTL, () =>
						bungieGet(
							`/Platform/Destiny2/${membershipType}/Account/${membershipId}/Character/${mainCharId}/Stats/?modes=63`
						)
					)
				)?.Response ?? {};
			lifetimeStats =
				cr?.gambit?.allTime ??
				cr?.pvecomp_gambit?.allTime ??
				cr?.allPveCompetitive?.allTime ??
				cr?.allPvECompetitive?.allTime ??
				Object.values(cr).find((r) => (r?.allTime?.activitiesEntered?.basic?.value ?? 0) > 0)
					?.allTime ??
				null;
		} catch {}
	}

	if (lifetimeStats && !lifetimeStats.motesBanked && lifetimeStats.motesDeposited) {
		lifetimeStats = { ...lifetimeStats, motesBanked: lifetimeStats.motesDeposited };
	}

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

	let triumphs = {};
	let verifiedMedals = {};

	try {
		const triRes = await fetch(
			`https://www.bungie.net/Platform/Destiny2/${membershipType}/Profile/${membershipId}/?components=900`,
			{ headers: { 'X-API-Key': BUNGIE_API_KEY } }
		);
		const triData = await triRes.json();
		triumphs = triData?.Response?.profileRecords?.data?.records ?? {};
		
		for (const [key, hash] of Object.entries(VERIFIED_HASHES)) {
			const record = triumphs[hash];
			// Some medals are binary, some are counters. objectives[0].progress is the count.
			verifiedMedals[key] = record?.objectives?.[0]?.progress ?? (record?.state === 0 ? 1 : 0);
		}
	} catch {}

	const triumphArmyOfOne = verifiedMedals.armyOfOne ?? 0;

	// Determine base statsSource
	let source = !lifetimeStats ? 'none' : lifetimeStats._synthetic ? 'recent' : 'bungie';

	// 2. Fetch Performance Intelligence (Lifetime Summary + Recent Detailed)
	let dbTotals = {
		lifetime: { entered: 0, wins: 0, kills: 0, deaths: 0, motes: 0, invKills: 0 },
		recent: { entered: 0, wins: 0, kills: 0, deaths: 0, assists: 0, precision: 0, motes: 0, motesLost: 0, motesPickedUp: 0, primevalDmg: 0, primevalHeal: 0, invasions: 0, shutDowns: 0, ability: 0, super: 0, meleeKills: 0, grenadeKills: 0, blockers: 0, invKills: 0, invDeaths: 0, motesDenied: 0, armyOfOne: triumphArmyOfOne }
	};

	try {
		const idStr = String(membershipId);
		const prefix = idStr.substring(0, 15);

		// Fetch Lifetime Summary from cache table
		const { data: sData } = await supabaseAdmin
			.from('player_gambit_stats')
			.select('*')
			.eq('player_id', idStr)
			.single();

		if (sData) {
			dbTotals.lifetime = {
				entered: sData.activities_entered || 0,
				wins: sData.activities_won || 0,
				kills: sData.kills || 0,
				deaths: sData.deaths || 0,
				motes: sData.motes_deposited || 0,
				invKills: sData.invasion_kills || 0
			};
		}

		// Fetch Recent 250 for Intelligence
		const { data: mData } = await supabaseAdmin
			.from('matches')
			.select('stats_json, outcome, period, created_at')
			.or(`player_id.eq.${idStr},and(player_id.gte.${prefix}0000,player_id.lte.${prefix}9999)`)
			.order('period', { ascending: false, nullsFirst: false })
			.limit(250);

		if (mData?.length) {
			const targetPrefix = name ? String(name).split('#')[0].toLowerCase() : null;
			const targetCodeStr = code ? String(code).padStart(4, '0') : null;

			const recentAgg = mData.reduce(
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

	if (lifetimeStats) {
		const s = lifetimeStats;
		const entered = s.activitiesEntered?.basic?.value ?? 0;
		const won = s.activitiesWon?.basic?.value ?? 0;
		const kills = s.kills?.basic?.value ?? 0;
		const deaths = s.deaths?.basic?.value ?? 0;
		
		// Update lifetime summary in background
		supabaseAdmin.from('player_gambit_stats').upsert({
			player_id: String(membershipId),
			bungie_name: name,
			bungie_code: code,
			membership_type: membershipType,
			activities_entered: entered,
			activities_won: won,
			kills, deaths,
			assists: s.assists?.basic?.value ?? 0,
			invasions: s.invasions?.basic?.value ?? 0,
			invasion_kills: s.invasionKills?.basic?.value ?? 0,
			invasions_defeated: s.invasionsDefeated?.basic?.value ?? 0,
			motes_deposited: s.motesBanked?.basic?.value ?? 0,
			motes_lost: s.motesLost?.basic?.value ?? 0,
			kd_ratio: deaths > 0 ? +(kills / deaths).toFixed(2) : kills,
			win_rate: entered > 0 ? +((won / entered) * 100).toFixed(1) : 0,
			updated_at: new Date().toISOString()
		}, { onConflict: 'player_id' }).then(() => {});

		// Ensure dbTotals.lifetime is at least as good as current fetch
		dbTotals.lifetime.entered = Math.max(dbTotals.lifetime.entered, entered);
		dbTotals.lifetime.wins = Math.max(dbTotals.lifetime.wins, won);
	}

	setHeaders({ 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' });

	const seasonalStream =
		cacheGet(`seasonal:${membershipId}:${[...sortedCharIds].sort().join(',')}`) ??
		(sortedCharIds.length > 0
			? computeSeasonal(membershipType, membershipId, sortedCharIds, 25).catch(() => null)
			: null);

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
		seasonal: seasonalStream,
		dbTotals,
		verifiedMedals
	};
}
