<script>
	import { untrack } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { egoColor } from '$lib/ego.js';
	import SubclassScreen from '$lib/SubclassScreen.svelte';
	import CharacterScreen from '$lib/CharacterScreen.svelte';

	let { data } = $props();

	// ── Lookups ────────────────────────────────────────────────────────────────
	const classNames = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' };
	const raceNames = { 0: 'Human', 1: 'Awoken', 2: 'Exo' };

	// ── State ──────────────────────────────────────────────────────────────────
	let tab = $state('overview');
	let profileTab = $state('overview');
	function setTab(t) {
		profileTab = t;
		tab = t;
	}

	let activeChar = $state(untrack(() => data.characterIds[0] ?? null));
	let seasonFilter = $state('all');
	let claiming = $state(false);
	let claimed = $state(false);
	$effect(() => {
		claimed = data.isClaimed;
	});
	$effect(() => {
		if (!activeChar && data.characterIds.length > 0) {
			activeChar = data.characterIds[0];
		}
	});

	// Mouse parallax
	let mouseX = $state(0);
	let mouseY = $state(0);
	function onHeroMouseMove(e) {
		mouseX = (e.clientX / window.innerWidth - 0.5) * 20;
		mouseY = (e.clientY / window.innerHeight - 0.5) * 20;
	}
	function onHeroMouseLeave() {
		mouseX = 0;
		mouseY = 0;
	}
	const mousePos = $derived({ x: mouseX, y: mouseY });

	// UI helpers
	let activeWeaponSlot = $state('kinetic');
	let scrollRef = $state(null);
	function handleWheel(e) {
		if (scrollRef) scrollRef.scrollLeft += e.deltaY;
	}

	const tabsList = [
		'Overview',
		'Matches',
		'Weaponry',
		'Synergy',
		'Maps',
		'Pursuits',
		'Loadout',
		'Vault'
	];

	// ── Inventory (Vault) ──────────────────────────────────────────────────────
	let inventory = $state(null);
	let inventoryLoading = $state(false);

	async function fetchInventory() {
		if (inventoryLoading || inventory) return;
		inventoryLoading = true;
		try {
			const res = await fetch(
				`/api/inventory?membershipType=${data.membershipType}&membershipId=${data.membershipId}`
			);
			inventory = await res.json();
		} catch {
		} finally {
			inventoryLoading = false;
		}
	}

	$effect(() => {
		if (tab === 'vault' && !inventory && !inventoryLoading) {
			fetchInventory();
		}
	});

	// ── Lazy loadout ───────────────────────────────────────────────────────────
	let loadout = $state(null);
	let loadoutLoading = $state(false);
	let loadoutCharId = $state(null);

	async function fetchLoadout() {
		if (loadoutLoading || loadoutCharId === activeChar || !activeChar) return;
		loadoutLoading = true;
		try {
			const res = await fetch(
				`/api/loadout?membershipType=${data.membershipType}&membershipId=${data.membershipId}&charId=${activeChar}`
			);
			const d = await res.json();
			loadout = d;
			loadoutCharId = activeChar;
		} catch (e) {
			console.error('Loadout fetch failed', e);
		} finally {
			loadoutLoading = false;
		}
	}

	// ── Seasonal stats (server-streamed) ──────────────────────────────────────
	let seasonal = $state(null);
	let seasonalLoading = $state(true);

	$effect(() => {
		const s = data.seasonal;
		if (s == null) {
			seasonalLoading = false;
			return;
		}
		if (typeof s.then === 'function') {
			seasonalLoading = true;
			s.then((result) => {
				seasonal = result;
				seasonalLoading = false;
			}).catch(() => {
				seasonalLoading = false;
			});
		} else {
			seasonal = s;
			seasonalLoading = false;
		}
	});

	// ── Match history ──────────────────────────────────────────────────────────
	let history = $state({ matches: [] });
	let historyLoading = $state(false);

	async function fetchHistory(flush = false) {
		if (historyLoading) return;
		historyLoading = true;
		try {
			const charIds = data.characterIds.join(',');
			const res = await fetch(
				`/api/history?membershipType=${data.membershipType}&membershipId=${data.membershipId}&charIds=${charIds}&count=250${flush ? '&flush=true' : ''}`
			);
			const d = await res.json();
			history = d;

			if (d.unenrichedIds?.length > 0 && !deepScanning) {
				autoEnrich(d.unenrichedIds);
			}
		} catch (e) {
			console.error('History fetch failed', e);
		} finally {
			historyLoading = false;
		}
	}

	let attemptedEnrich = new Set();
	async function autoEnrich(ids) {
		// Shift to 'Recent 250' focus: Only index the first 250 IDs for rapid intelligence
		const newIds = ids.slice(0, 250).filter((id) => !attemptedEnrich.has(id));
		if (deepScanning || newIds.length === 0) return;
		deepScanning = true;
		deepScanStatus = 'auto-syncing';
		deepScanProgress = { current: 0, total: newIds.length };

		try {
			const CHUNK_SIZE = 50;
			for (let i = 0; i < newIds.length; i += CHUNK_SIZE) {
				const chunk = newIds.slice(i, i + CHUNK_SIZE);
				chunk.forEach((id) => attemptedEnrich.add(id));
				const res = await fetch('/api/pgcr-enrich', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						membershipId: data.membershipId,
						membershipType: data.membershipType,
						bungieDisplayName: data.player.bungieGlobalDisplayName,
						bungieDisplayCode: data.player.bungieGlobalDisplayNameCode,
						instanceIds: chunk
					})
				});
				const r = await res.json();
				deepScanProgress.current += r.stored ?? chunk.length;
			}
			await fetchHistory(true);
			await fetchCareer();
		} catch {
		} finally {
			deepScanning = false;
		}
	}

	// ── Career analytics ───────────────────────────────────────────────────────
	let career = $state(null);
	let careerLoading = $state(false);

	// ── Stats Persistence ──────────────────────────────────────────────────────
	let statsCache = $state({
		entered: 0,
		wins: 0,
		kills: 0,
		deaths: 0,
		assists: 0,
		precision: 0,
		motes: 0,
		motesLost: 0,
		motesPickedUp: 0,
		primevalDmg: 0,
		primevalHeal: 0,
		ability: 0,
		super: 0,
		blockers: 0,
		invKills: 0,
		invDeaths: 0,
		invasions: 0,
		shutDowns: 0,
		motesDenied: 0,
		armyOfOne: 0,
		massacre: 0,
		maximumCarnage: 0,
		locksmith: 0,
		halfBanked: 0,
		firstToBlock: 0,
		moteHaveBeen: 0,
		killmonger: 0,
		overkillmonger: 0,
		thrillmonger: 0,
		notOnMyWatch: 0,
		bigGameHunter: 0,
		fastFill: 0,
		lastGuardianStanding: 0,
		noEscape: 0,
		payback: 0,
		blockbuster: 0,
		rapidPayback: 0,
		protectTheRunner: 0,
		lightVersusLight: 0
	});

	$effect(() => {
		const dbl = data.dbTotals?.lifetime ?? {};
		const dbr = data.dbTotals?.recent ?? {};
		const car = career?.totals ?? {};
		const medals = career?.medals ?? [];
		const ver = data.verifiedMedals ?? {};

		// Map all verified medals directly to statsCache
		Object.keys(ver).forEach(key => {
			if (key in statsCache) {
				statsCache[key] = Math.max(statsCache[key], ver[key] || 0);
			}
		});

		// We use Math.max to ensure stats only ever go UP during a session refresh
		statsCache.entered = Math.max(
			statsCache.entered,
			career?.totalMatches || 0,
			dEntered || 0,
			dbl.entered || 0
		);
		statsCache.wins = Math.max(
			statsCache.wins,
			dbl.wins || 0,
			car.wins || 0,
			(career?.source === 'supabase' ? Math.round(career.totalMatches * (career.winRate / 100)) : 0),
			dWon || 0
		);
		statsCache.kills = Math.max(statsCache.kills, dbr.kills || 0, car.kills || 0, dKills || 0);
		statsCache.deaths = Math.max(statsCache.deaths, dbr.deaths || 0, car.deaths || 0, dDeaths || 0);
		statsCache.assists = Math.max(statsCache.assists, dbr.assists || 0, car.assists || 0);
		statsCache.precision = Math.max(statsCache.precision, dbr.precision || 0, car.precision || 0);
		statsCache.motes = Math.max(statsCache.motes, dbr.motes || 0, car.motes || 0, dMotes || 0);
		statsCache.motesLost = Math.max(
			statsCache.motesLost,
			dbr.motesLost || 0,
			car.motesLost || 0,
			dMotesLost || 0
		);
		statsCache.motesPickedUp = Math.max(statsCache.motesPickedUp, dbr.motesPickedUp || 0, car.motesPickedUp || 0);
		statsCache.primevalDmg = Math.max(
			statsCache.primevalDmg,
			dbr.primevalDmg || 0,
			car.primevalDmg || 0,
			dPrimevalDmg || 0
		);
		statsCache.primevalHeal = Math.max(
			statsCache.primevalHeal, 
			dbr.primevalHeal || 0, 
			car.primevalHeal || 0,
			dHealed || 0
		);

		statsCache.ability = Math.max(
			statsCache.ability,
			dbr.ability || 0,
			car.ability || 0,
			dAbility || 0
		);
		statsCache.super = Math.max(statsCache.super, dbr.super || 0, car.super || 0, dSuperKills || 0);
		statsCache.blockers = Math.max(
			statsCache.blockers,
			dbr.blockers || 0,
			car.blockers || 0,
			dBlockers || 0
		);
		statsCache.invKills = Math.max(
			statsCache.invKills,
			dbr.invKills || 0,
			car.invKills || 0,
			dInvKills || 0
		);
		statsCache.invDeaths = Math.max(
			statsCache.invDeaths,
			dbr.invDeaths || 0,
			car.invDeaths || 0,
			dInvaderDeaths || 0
		);
		statsCache.invasions = Math.max(
			statsCache.invasions, 
			dbr.invasions || 0, 
			car.invasions || 0,
			dInvasions || 0
		);
		statsCache.shutDowns = Math.max(
			statsCache.shutDowns,
			dbr.shutDowns || 0,
			car.shutDowns || 0,
			dShutDowns || 0
		);
		statsCache.motesDenied = Math.max(
			statsCache.motesDenied,
			dbr.motesDenied || 0,
			car.motesDenied || 0,
			dMotesDenied || 0
		);
	});
	async function fetchCareer() {
		if (careerLoading) return;
		careerLoading = true;
		try {
			const res = await fetch(
				`/api/career?membershipId=${data.membershipId}&name=${encodeURIComponent(data.player.bungieGlobalDisplayName)}&code=${data.player.bungieGlobalDisplayNameCode}&count=5000`
			);
			career = await res.json();
		} catch (e) {
			console.error('Career fetch failed', e);
		} finally {
			careerLoading = false;
		}
	}

	// ── Deep Career Scan (Crawler) ─────────────────────────────────────────────
	let deepScanning = $state(false);
	let deepScanStatus = $state('');
	let deepScanProgress = $state({ current: 0, total: 0 });

	$effect(() => {
		if (tab === 'matches' || tab === 'weaponry' || tab === 'synergy' || tab === 'maps') {
			if (history.matches.length === 0) fetchHistory();
			if (!career) fetchCareer();
		}
	});

	// ── Favorites ──────────────────────────────────────────────────────────────
	let favorites = $state(new Set());
	let favsLoaded = $state(false);

	async function loadFavorites() {
		if (favsLoaded) return;
		try {
			const res = await fetch(`/api/favorites?membershipId=${data.membershipId}`);
			const d = await res.json();
			favorites = new Set(d.favorites ?? []);
			favsLoaded = true;
		} catch {}
	}

	// ── Pursuits (Triumphs/Collectibles) ──────────────────────────────────────
	let pursuits = $state(null);
	let pursuitsLoading = $state(false);

	async function fetchPursuits() {
		if (pursuitsLoading || pursuits) return;
		pursuitsLoading = true;
		try {
			const res = await fetch(
				`/api/pursuits?membershipType=${data.membershipType}&membershipId=${data.membershipId}`
			);
			pursuits = await res.json();
		} catch {
		} finally {
			pursuitsLoading = false;
		}
	}

	$effect(() => {
		// Background Intelligence Fetch
		if (!pursuits && !pursuitsLoading) {
			fetchPursuits();
		}
	});

	$effect(() => {
		if ((tab === 'loadout' || tab === 'subclass') && activeChar && activeChar !== loadoutCharId) {
			fetchLoadout();
		}
	});

	// ── Derived ────────────────────────────────────────────────────────────────
	const char = $derived(data.characters[activeChar] ?? {});
	const eq = $derived(loadout?.equipment ?? {});

	const gambitRank = $derived(
		(() => {
			const lvl = data.gambitProgression?.level ?? 0;
			if (lvl < 4) return 'Guardian';
			if (lvl < 8) return 'Brave';
			if (lvl < 13) return 'Heroic';
			if (lvl < 18) return 'Fabled';
			if (lvl < 24) return 'Mythic';
			return 'Legend';
		})()
	);
	const gambitPct = $derived(
		(() => {
			const prog = data.gambitProgression?.progressToNextLevel ?? 0;
			const next = data.gambitProgression?.nextLevelAt ?? 1;
			return Math.round((prog / next) * 100);
		})()
	);

	const ls = $derived(data.lifetimeStats ?? {});
	function sv(key, key2 = null) {
		const val = ls[key]?.basic?.value ?? (key2 ? ls[key2]?.basic?.value : null);
		return val ?? 0;
	}

	const ltWon = $derived(sv('activitiesWon'));
	const ltKills = $derived(sv('kills'));
	const ltDeaths = $derived(sv('deaths'));
	const ltAssists = $derived(sv('assists'));
	const ltPrecision = $derived(sv('precisionKills'));
	const ltInvasions = $derived(sv('invasions'));
	const ltInvKills = $derived(sv('invasionKills', 'invaderKills'));
	const ltMotes = $derived(sv('motesBanked') || sv('motesDeposited'));
	const ltMotesLost = $derived(sv('motesLost'));
	const ltMotesDenied = $derived(sv('motesDenied'));
	const ltPrimevalDmg = $derived(sv('primevalDamage'));
	const ltSuperKills = $derived(sv('weaponKillsSuper') || sv('superKills'));
	const ltMeleeKills = $derived(sv('weaponKillsMelee') || sv('meleeKills'));
	const ltGrenadeKills = $derived(sv('weaponKillsGrenade') || sv('grenadeKills'));
	const ltSmallBlockers = $derived(sv('smallBlockersSent'));
	const ltMediumBlockers = $derived(sv('mediumBlockersSent'));
	const ltLargeBlockers = $derived(sv('largeBlockersSent'));
	const ltInvaderDeaths = $derived(sv('invasionDeaths', 'invaderDeaths'));
	const ltShutDowns = $derived(sv('invasionsDefeated'));
	const ltHealed = $derived(sv('primevalHealing'));

	const seasonalTotal = $derived(
		seasonal?.seasons?.length > 0
			? seasonal.seasons.reduce(
					(acc, s) => {
						acc.activitiesEntered += s.activitiesEntered ?? 0;
						acc.wins += s.wins ?? 0;
						acc.kills += s.kills ?? 0;
						acc.deaths += s.deaths ?? 0;
						acc.assists += s.assists ?? 0;
						acc.precisionKills += s.precisionKills ?? 0;
						acc.motesDeposited += s.motesDeposited ?? 0;
						acc.motesLost += s.motesLost ?? 0;
						acc.motesDenied += s.motesDenied ?? 0;
						acc.invasionKills += s.invasionKills ?? 0;
						acc.invaderDeaths += s.invaderDeaths ?? 0;
						acc.primevalDamage += s.primevalDamage ?? 0;
						acc.primevalHealing += s.primevalHealing ?? 0;
						acc.invasions += s.invasions ?? 0;
						acc.invasionsDefeated += s.invasionsDefeated ?? 0;
						acc.superKills += s.superKills ?? 0;
						acc.meleeKills += s.meleeKills ?? 0;
						acc.grenadeKills += s.grenadeKills ?? 0;
						acc.smallBlockersSent += s.smallBlockersSent ?? 0;
						acc.mediumBlockersSent += s.mediumBlockersSent ?? 0;
						acc.largeBlockersSent += s.largeBlockersSent ?? 0;
						return acc;
					},
					{
						activitiesEntered: 0,
						wins: 0,
						kills: 0,
						deaths: 0,
						assists: 0,
						precisionKills: 0,
						motesDeposited: 0,
						motesLost: 0,
						motesDenied: 0,
						invasionKills: 0,
						invaderDeaths: 0,
						primevalDamage: 0,
						primevalHealing: 0,
						invasions: 0,
						invasionsDefeated: 0,
						superKills: 0,
						meleeKills: 0,
						grenadeKills: 0,
						smallBlockersSent: 0,
						mediumBlockersSent: 0,
						largeBlockersSent: 0
					}
				)
			: null
	);

	const egoRating = $derived(
		(() => {
			const wins = dWon;
			const kills = dKills;
			const inv = dInvKills;
			const motes = dMotes;
			const denied = dMotesDenied;
			return Math.floor(wins * 15 + kills * 0.3 + inv * 5 + motes * 0.1 + denied * 2);
		})()
	);

	// ── Match list (must come before historySum since historySum uses it) ────────
	const matchesList = $derived(
		(history?.matches ?? []).map((m) => {
			const sj = m.stats_json ?? {};
			const ego = m.ego ?? {};
			const enriched = m.isEnriched ?? false;

			// When a match is enriched, stats_json (from full PGCR) is the authoritative source.
			// Activity history often returns 0 for stats like motesDeposited/primevalDamage
			// (either missing or rounded), so we can't use ?? which treats 0 as valid.
			// Priority: enriched PGCR (sj) > activity history (m) > 0
			function pick(sjVal, mVal) {
				if (enriched && sjVal != null) return sjVal;
				// Activity history: treat 0 as "no data" only when enriched PGCR has a real value
				if (mVal != null && mVal !== 0) return mVal;
				if (enriched && sjVal != null) return sjVal; // sjVal could be 0, that's fine from PGCR
				return mVal ?? 0;
			}

			const kills        = enriched ? (sj.kills || (sj.mobKills || 0) + (sj.invasionKills || 0) || m.kills || 0) : (m.kills || 0);
			const deaths       = pick(sj.deaths,       m.deaths);
			const assists      = pick(sj.assists,      m.assists);
			const invasionKills = pick(sj.invasionKills, m.invasionKills);
			const motesDeposited = pick(sj.motesDeposited, m.motesDeposited);
			const motesDenied  = pick(sj.motesDenied,  m.motesDenied);
			const motesPickedUp = pick(sj.motesPickedUp, m.motesPickedUp);
			const motesLost    = pick(sj.motesLost,    m.motesLost);
			// primevalDamage is NOT in activity history — always use stats_json when enriched
			const primevalDamage = enriched ? (sj.primevalDamage ?? 0) : (m.primevalDamage ?? 0);
			const kd = deaths > 0 ? +(kills / deaths).toFixed(2) : (kills || m.kd || 0);

			return {
				instanceId: m.instanceId,
				result: m.win ? 'WIN' : 'LOSS',
				map: m.mapName ?? 'Gambit',
				period: m.period,
				date: m.period ? timeAgo(m.period) : '',
				isEnriched: enriched,
				// EGO
				egoScore: ego.finalScore ?? null,
				egoBase: ego.basePps ?? null,
				egoPem: ego.pem ?? null,
				egoMoteEff: ego.moteEff ?? null,
				egoComponents: ego.components ?? null,
				// Combat
				kills, deaths, assists, kd,
				// Invasion
				invKills: invasionKills,
				invDeaths: sj.invaderDeaths ?? sj.invasionDeaths ?? 0,
				// Motes
				motesDeposited, motesDenied, motesPickedUp, motesLost,
				// Damage
				primevalDamage,
				// Ability (only from PGCR)
				meleeKills:    sj.meleeKills    ?? sj.weaponKillsMelee    ?? 0,
				grenadeKills:  sj.grenadeKills  ?? sj.weaponKillsGrenade  ?? 0,
				superKills:    sj.superKills    ?? sj.weaponKillsSuper    ?? 0,
				precisionKills: sj.precisionKills ?? 0,
				// Carry
				fireteamSize: m.fireteamSize ?? sj.fireteam_size ?? 1,
				isHardCarry: m.isHardCarry ?? false,
				isCarried:   m.isCarried   ?? false,
				// Medals (only present on PGCR-enriched matches)
				medals: sj.medals ?? {},
			};
		})
	);

	// ── History Aggregation (Instant Recent 250) ──────────────────────────────
	// Uses matchesList so all field names are already normalised.
	const historySum = $derived(
		matchesList.reduce(
			(acc, m) => {
				acc.totalCount++;
				if (m.result === 'WIN') acc.wins++;

				acc.kills         += m.kills         ?? 0;
				acc.deaths        += m.deaths        ?? 0;
				acc.assists       += m.assists       ?? 0;
				acc.invKills      += m.invKills      ?? 0;
				acc.invDeaths     += m.invDeaths     ?? 0;
				acc.motes         += m.motesDeposited ?? 0;
				acc.motesPickedUp += m.motesPickedUp  ?? 0;
				acc.motesLost     += m.motesLost      ?? 0;
				acc.motesDenied   += m.motesDenied    ?? 0;
				acc.primevalDmg   += m.primevalDamage ?? 0;
				acc.meleeKills    += m.meleeKills     ?? 0;
				acc.grenadeKills  += m.grenadeKills   ?? 0;
				acc.superKills    += m.superKills     ?? 0;
				acc.precisionKills += m.precisionKills ?? 0;

				if (m.egoScore != null) {
					acc.egoSum   += m.egoScore;
					acc.egoCount++;
				}

				if (m.isEnriched) {
					acc.enrichedCount++;
					if (m.isHardCarry) acc.hardCarryCount++;
					if (m.isCarried)   acc.carriedCount++;
					if ((m.fireteamSize ?? 1) > 1) {
						acc.fireteamSum   += m.fireteamSize;
						acc.fireteamCount++;
					}
					// Aggregate medals (only available on enriched PGCR matches)
					for (const [mk, mv] of Object.entries(m.medals ?? {})) {
						if (typeof mv === 'number') acc.medals[mk] = (acc.medals[mk] ?? 0) + mv;
					}
				}
				return acc;
			},
			{
				totalCount: 0, wins: 0,
				kills: 0, deaths: 0, assists: 0,
				invKills: 0, invDeaths: 0,
				motes: 0, motesPickedUp: 0, motesLost: 0, motesDenied: 0,
				primevalDmg: 0,
				meleeKills: 0, grenadeKills: 0, superKills: 0, precisionKills: 0,
				egoSum: 0, egoCount: 0,
				enrichedCount: 0, hardCarryCount: 0, carriedCount: 0,
				fireteamSum: 0, fireteamCount: 0,
				medals: {}
			}
		)
	);

	// ── 250-match calculated metrics ──────────────────────────────────────────
	// These REQUIRE our own calculation — Bungie API doesn't expose per-game averages.
	const h250 = $derived((() => {
		const n  = historySum.totalCount;
		const en = historySum.enrichedCount;
		if (n === 0) return {
			moteEff: null, avgMotes: null, avgEgo: null,
			winRate250: null, kd250: null,
			avgKills: null, avgDeaths: null, avgAssists: null,
			avgInvKills: null, avgInvDeaths: null,
			avgMotesDenied: null, avgMotesLost: null,
			avgPrimDmg: null, avgMeleeKills: null, avgGrenadeKills: null, avgSuperKills: null,
			precisionPct: null,
			hardCarryRate: null, carriedRate: null, avgStack: null,
			medals: {}, medalsPerGame: {},
			n: 0, en: 0
		};

		// Mote Efficiency: deposited / pickedUp (PGCR-accurate).
		// Fallback: deposited / (deposited + lost) when pickedUp unavailable (activity history).
		const deposited   = historySum.motes;
		const pickedUp    = historySum.motesPickedUp;
		const lost        = historySum.motesLost;
		const moteEff = pickedUp > 0
			? +(deposited / pickedUp * 100).toFixed(1)
			: (deposited + lost) > 0
				? +(deposited / (deposited + lost) * 100).toFixed(1)
				: null;

		// Medal per-game rates (enriched matches only — need PGCR data)
		const medals = historySum.medals;
		const mpg = en > 0
			? Object.fromEntries(Object.entries(medals).map(([k, v]) => [k, +(v / en).toFixed(2)]))
			: {};

		const pg = (val, dp = 1) => n > 0 ? +(val / n).toFixed(dp) : null;

		return {
			// Motes
			moteEff,
			avgMotes:        pg(deposited),
			avgMotesLost:    pg(lost),
			avgMotesDenied:  pg(historySum.motesDenied),
			// EGO
			avgEgo:          historySum.egoCount > 0 ? +(historySum.egoSum / historySum.egoCount).toFixed(1) : null,
			// Win / K/D
			winRate250:      pg(historySum.wins * 100),
			kd250:           historySum.deaths > 0 ? +(historySum.kills / historySum.deaths).toFixed(2) : historySum.kills > 0 ? +historySum.kills.toFixed(2) : null,
			// Combat per game
			avgKills:        pg(historySum.kills),
			avgDeaths:       pg(historySum.deaths),
			avgAssists:      pg(historySum.assists),
			precisionPct:    historySum.kills > 0 ? +(historySum.precisionKills / historySum.kills * 100).toFixed(1) : null,
			// Ability per game
			avgMeleeKills:   pg(historySum.meleeKills),
			avgGrenadeKills: pg(historySum.grenadeKills),
			avgSuperKills:   pg(historySum.superKills),
			// Invasion per game
			avgInvKills:     pg(historySum.invKills, 2),
			avgInvDeaths:    pg(historySum.invDeaths, 2),
			// Damage per game
			avgPrimDmg:      n > 0 ? Math.round(historySum.primevalDmg / n) : null,
			// Carry rates (enriched only)
			hardCarryRate:   en > 0 ? +(historySum.hardCarryCount / en * 100).toFixed(1) : null,
			carriedRate:     en > 0 ? +(historySum.carriedCount   / en * 100).toFixed(1) : null,
			avgStack:        historySum.fireteamCount > 0 ? +(historySum.fireteamSum / historySum.fireteamCount).toFixed(1) : null,
			// Medals (enriched matches only)
			medals,
			medalsPerGame: mpg,
			n, en
		};
	})());

	const dEntered = $derived(
		seasonFilter === 'all'
			? Math.max(seasonalTotal?.activitiesEntered ?? 0, sv('activitiesEntered'), data.dbTotals?.lifetime?.entered ?? 0)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.activitiesEntered ?? 0)
	);
	const dWon = $derived(
		seasonFilter === 'all'
			? Math.max(seasonalTotal?.wins ?? 0, ltWon, data.dbTotals?.lifetime?.wins ?? 0)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.wins ?? 0)
	);
	const dKills = $derived(
		seasonFilter === 'all'
			? Math.max(seasonalTotal?.kills ?? 0, ltKills, data.dbTotals?.recent?.kills ?? 0)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.kills ?? 0)
	);
	const dDeaths = $derived(
		seasonFilter === 'all'
			? Math.max(seasonalTotal?.deaths ?? 0, ltDeaths, data.dbTotals?.recent?.deaths ?? 0)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.deaths ?? 0)
	);
	const dMotes = $derived(
		seasonFilter === 'all'
			? Math.max(seasonalTotal?.motesDeposited ?? 0, ltMotes, data.dbTotals?.recent?.motes ?? 0, historySum.motes)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.motesDeposited ?? 0)
	);
	const dMotesLost = $derived(
		seasonFilter === 'all'
			? Math.max(seasonalTotal?.motesLost ?? 0, ltMotesLost, data.dbTotals?.recent?.motesLost ?? 0)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.motesLost ?? 0)
	);
	const dMotesDenied = $derived(
		seasonFilter === 'all'
			? Math.max(seasonalTotal?.motesDenied ?? 0, ltMotesDenied, data.dbTotals?.recent?.motesDenied ?? 0)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.motesDenied ?? 0)
	);
	const dInvKills = $derived(
		seasonFilter === 'all'
			? Math.max(seasonalTotal?.invasionKills ?? 0, ltInvKills, data.dbTotals?.recent?.invKills ?? 0)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.invasionKills ?? 0)
	);
	const dPrimevalDmg = $derived(
		seasonFilter === 'all'
			? Math.max(seasonalTotal?.primevalDamage ?? 0, ltPrimevalDmg, data.dbTotals?.recent?.primevalDmg ?? 0)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.primevalDamage ?? 0)
	);
	const dSuperKills = $derived(
		seasonFilter === 'all'
			? Math.max(seasonalTotal?.superKills ?? 0, ltSuperKills, data.dbTotals?.recent?.super ?? 0)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.superKills ?? 0)
	);
	const dMeleeKills = $derived(
		seasonFilter === 'all'
			? Math.max(seasonalTotal?.meleeKills ?? 0, ltMeleeKills, data.dbTotals?.recent?.meleeKills ?? 0)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.meleeKills ?? 0)
	);
	const dGrenadeKills = $derived(
		seasonFilter === 'all'
			? Math.max(seasonalTotal?.grenadeKills ?? 0, ltGrenadeKills, data.dbTotals?.recent?.grenadeKills ?? 0)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.grenadeKills ?? 0)
	);
	const dAbility = $derived(
		seasonFilter === 'all'
			? Math.max((seasonalTotal?.meleeKills ?? 0) + (seasonalTotal?.grenadeKills ?? 0), data.dbTotals?.recent?.ability ?? 0)
			: ((seasonal?.seasons?.find((s) => s.season === seasonFilter)?.meleeKills ?? 0) + (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.grenadeKills ?? 0))
	);
	const dBlockers = $derived(
		seasonFilter === 'all'
			? Math.max((seasonalTotal?.smallBlockersSent ?? 0) + (seasonalTotal?.mediumBlockersSent ?? 0) + (seasonalTotal?.largeBlockersSent ?? 0), data.dbTotals?.recent?.blockers ?? 0)
			: ((seasonal?.seasons?.find((s) => s.season === seasonFilter)?.smallBlockersSent ?? 0) + (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.mediumBlockersSent ?? 0) + (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.largeBlockersSent ?? 0))
	);
	const dArmyOfOne = $derived(
		seasonFilter === 'all'
			? Math.max(seasonalTotal?.armyOfOne ?? 0, statsCache.armyOfOne)
			: 0
	);
	const dMassacre = $derived(
		seasonFilter === 'all'
			? Math.max(seasonalTotal?.massacre ?? 0, statsCache.massacre)
			: 0
	);
	const dSmallBlockers = $derived(
		seasonFilter === 'all'
			? Math.max(seasonalTotal?.smallBlockersSent ?? 0, ltSmallBlockers)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.smallBlockersSent ?? 0)
	);
	const dMediumBlockers = $derived(
		seasonFilter === 'all'
			? Math.max(seasonalTotal?.mediumBlockersSent ?? 0, ltMediumBlockers)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.mediumBlockersSent ?? 0)
	);
	const dLargeBlockers = $derived(
		seasonFilter === 'all'
			? Math.max(seasonalTotal?.largeBlockersSent ?? 0, ltLargeBlockers)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.largeBlockersSent ?? 0)
	);
	const dInvaderDeaths = $derived(
		seasonFilter === 'all'
			? Math.max(seasonalTotal?.invaderDeaths ?? 0, ltInvaderDeaths, data.dbTotals?.recent?.invDeaths ?? 0)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.invaderDeaths ?? 0)
	);

	const dInvasions = $derived(
		seasonFilter === 'all'
			? Math.max(seasonalTotal?.invasions ?? 0, ltInvasions, data.dbTotals?.recent?.invasions ?? 0)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.invasions ?? 0)
	);
	const dShutDowns = $derived(
		seasonFilter === 'all'
			? Math.max(seasonalTotal?.invasionsDefeated ?? 0, ltShutDowns, data.dbTotals?.recent?.shutDowns ?? 0)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.invasionsDefeated ?? 0)
	);
	const dHealed = $derived(
		seasonFilter === 'all'
			? Math.max(seasonalTotal?.primevalHealing ?? 0, ltHealed, data.dbTotals?.recent?.primevalHeal ?? 0)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.primevalHealing ?? 0)
	);
	const dPrecision = $derived(
		seasonFilter === 'all'
			? Math.max(seasonalTotal?.precisionKills ?? 0, ltPrecision, data.dbTotals?.recent?.precision ?? 0)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.precisionKills ?? 0)
	);

	const dWinRate = $derived(dEntered > 0 ? (dWon / dEntered) * 100 : null);
	const dKD = $derived(dDeaths > 0 ? dKills / dDeaths : null);
	const dAvgMotes = $derived(
		seasonFilter === 'all'
			? (h250.avgMotes != null ? h250.avgMotes : (dEntered > 0 ? dMotes / dEntered : 0))
			: (dEntered > 0 ? dMotes / dEntered : 0)
	);

	const SEASON_NAMES = {
		19: '19: SERAPH',
		20: '20: DEFIANCE',
		21: '21: DEEP',
		22: '22: WITCH',
		23: '23: WISH',
		24: 'EP: ECHOES',
		25: 'EP: REVENANT',
		26: 'EP: HERESY',
		27: 'EDGE OF FATE'
	};

	function fmt(n) {
		const num = Number(n);
		return Number.isFinite(num) ? num.toLocaleString() : '—';
	}
	function fmtF(n, d = 2) {
		const num = Number(n);
		return Number.isFinite(num) ? num.toFixed(d) : '—';
	}
	function fmtNum(n) {
		if (n === null || n === undefined) return '—';
		if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
		if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
		return String(Math.round(n));
	}
	function timeAgo(iso) {
		if (!iso) return '—';
		const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
		if (m < 60) return `${m}m ago`;
		const h = Math.floor(m / 60);
		if (h < 24) return `${h}h ago`;
		return `${Math.floor(h / 24)}d ago`;
	}

	const seasons = $derived(
		seasonal?.seasons?.map((s) => ({
			id: s.season,
			label: SEASON_NAMES[s.seasonNumber] ?? `Season ${s.seasonNumber}`
		})) ?? []
	);

	const weaponData = $derived(
		(() => {
			const grouped = { kinetic: [], energy: [], power: [] };
			if (career?.weapons) {
				career.weapons.forEach((w) => {
					const item = {
						name: w.name,
						type: w.slot,
						kills: w.kills,
						precision: w.precRate + '%',
						color: (w.winRate ?? 0) >= 60 ? 'text-emerald-400' : 'text-zinc-200',
						icon: w.icon,
						hash: w.hash
					};
					const slot = (w.slot ?? '').toLowerCase();
					if (slot === 'kinetic') grouped.kinetic.push(item);
					else if (slot === 'energy') grouped.energy.push(item);
					else if (slot === 'power') grouped.power.push(item);
					else grouped.kinetic.push(item);
				});
			}
			return grouped;
		})()
	);

	const playerData = $derived({
		identity: {
			name: data.player.bungieGlobalDisplayName,
			code: data.player.bungieGlobalDisplayNameCode,
			clan: data.clan?.name ?? null,
			rating: career?.source === 'supabase' && career.avgScore ? career.avgScore : egoRating,
			level: data.gambitProgression?.level ?? 0,
			rank: gambitRank,
			rankValue: gambitPct
		},
		overview: {
			winRatio:
				statsCache.wins > 0 && statsCache.entered > 0
					? fmtF((statsCache.wins / statsCache.entered) * 100, 1) + '%'
					: career?.source === 'supabase'
						? career.winRate + '%'
						: dWinRate != null
							? fmtF(dWinRate, 1) + '%'
							: '—',
			wins: statsCache.wins,
			kd: statsCache.kills > 0 && statsCache.deaths > 0 
				? fmtF(statsCache.kills / statsCache.deaths, 2) 
				: dKD != null ? fmtF(dKD, 2) : '—',
			kills: statsCache.kills,
			motesAvg:
				statsCache.entered > 0 ? fmtF(statsCache.motes / statsCache.entered, 1) : career?.source === 'supabase' ? career.avgMotes : dAvgMotes ? fmtF(dAvgMotes, 1) : '—',
			dps: statsCache.entered > 0 && statsCache.primevalDmg > 0 ? fmt(Math.round(statsCache.primevalDmg / statsCache.entered)) : '—',
			combat: {
				total: fmt(statsCache.kills),
				precision: statsCache.kills > 0 ? fmtF((statsCache.precision / statsCache.kills) * 100, 1) + '%' : '—',
				ability: fmt(statsCache.ability),
				super: fmt(statsCache.super)
			},
			objectives: {
				deposited: fmt(statsCache.motes),
				lost: fmt(statsCache.motesLost),
				denied: fmt(statsCache.motesDenied),
				blockers: fmt(statsCache.blockers),
				healed: statsCache.primevalHeal > 0 ? fmt(statsCache.primevalHeal) : '—'
			},
			invasion: {
				guardians: fmt(statsCache.invKills),
				armyOfOne: fmt(statsCache.armyOfOne),
				motesDenied: fmt(statsCache.motesDenied),
				invaderDeaths: fmt(statsCache.invDeaths),
				invasions: statsCache.invasions > 0 ? fmt(statsCache.invasions) : '—',
				shutDown: statsCache.shutDowns > 0 ? fmt(statsCache.shutDowns) : '—'
			}
		},
		loadout: {
			subclass: classNames[char?.classType] ?? 'Guardian',
			stats: {
				Mobility: char?.stats?.[2996146975] ?? 0,
				Resilience: char?.stats?.[3927053327] ?? 0,
				Recovery: char?.stats?.[1943323491] ?? 0,
				Discipline: char?.stats?.[1735777505] ?? 0,
				Intellect: char?.stats?.[144602215] ?? 0,
				Strength: char?.stats?.[4244567218] ?? 0
			},
			bonuses: {
				Mobility: 0,
				Resilience: 0,
				Recovery: 0,
				Discipline: 0,
				Intellect: 0,
				Strength: 0
			},
			weapons: [
				{
					slot: 'KINETIC',
					name: eq.kinetic?.name ?? '—',
					quality: eq.kinetic?.tierTypeName ?? '',
					icon: eq.kinetic?.icon ?? null,
					hash: eq.kinetic?.itemHash ?? null
				},
				{
					slot: 'ENERGY',
					name: eq.energy?.name ?? '—',
					quality: eq.energy?.tierTypeName ?? '',
					icon: eq.energy?.icon ?? null,
					hash: eq.energy?.itemHash ?? null
				},
				{
					slot: 'POWER',
					name: eq.power?.name ?? '—',
					quality: eq.power?.tierTypeName ?? '',
					icon: eq.power?.icon ?? null,
					hash: eq.power?.itemHash ?? null
				}
			],
			armor: [
				{
					slot: 'HELMET',
					name: eq.helmet?.name ?? '—',
					quality: eq.helmet?.tierTypeName ?? '',
					icon: eq.helmet?.icon ?? null,
					hash: eq.helmet?.itemHash ?? null
				},
				{
					slot: 'ARMS',
					name: eq.gauntlets?.name ?? '—',
					quality: eq.gauntlets?.tierTypeName ?? '',
					icon: eq.gauntlets?.icon ?? null,
					hash: eq.gauntlets?.itemHash ?? null
				},
				{
					slot: 'CHEST',
					name: eq.chest?.name ?? '—',
					quality: eq.chest?.tierTypeName ?? '',
					icon: eq.chest?.icon ?? null,
					hash: eq.chest?.itemHash ?? null
				},
				{
					slot: 'LEGS',
					name: eq.legs?.name ?? '—',
					quality: eq.legs?.tierTypeName ?? '',
					icon: eq.legs?.icon ?? null,
					hash: eq.legs?.itemHash ?? null
				}
			]
		}
	});

	const grandTotal = $derived(
		Object.values(playerData.loadout.stats).reduce((a, b) => a + (b || 0), 0)
	);
	const buildTier = $derived(Math.floor(grandTotal / 10));
</script>

<!-- ── Snippets ───────────────────────────────────────────────────────────── -->
{#snippet ghostLabel({ text, className = '' })}
	<span
		class="mb-1 block font-sans text-[8px] font-bold tracking-[0.2em] text-zinc-500 uppercase {className}"
		>{text}</span
	>
{/snippet}

{#snippet engravedHeader({ text, className = '' })}
	<div class="mb-4 flex items-center gap-2 {className}">
		<div class="h-[1px] w-8 bg-gradient-to-r from-transparent to-emerald-500/50"></div>
		<span class="font-display text-[10px] font-bold tracking-[0.2em] text-emerald-500 uppercase"
			>{text}</span
		>
		<div
			class="h-[1px] flex-1 bg-gradient-to-r from-emerald-500/50 to-transparent opacity-30"
		></div>
	</div>
{/snippet}

{#snippet stoneCard({ title = null, compact = false, className = '' }, contentSnippet)}
	<div
		class="group relative overflow-hidden border border-zinc-800 bg-[#111111] p-5 shadow-[inset_0_0_30px_rgba(0,0,0,0.5)] transition-all duration-500 hover:border-zinc-700 {className} stone-card"
	>
		<div class="sheen-overlay"></div>
		{#if title}
			{@render ghostLabel({ text: title })}
		{/if}
		<div class="relative z-10">{@render contentSnippet()}</div>
	</div>
{/snippet}

{#snippet detailStatCompact({ label, value, rank = null, awakened = false })}
	<div
		class="group/stat relative flex items-center justify-between border-b border-zinc-800/40 py-2"
	>
		{#if awakened}
			<div
				class="absolute -left-2 h-4 w-0.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
			></div>
		{/if}
		<span class="font-sans text-[10px] tracking-widest text-zinc-500 uppercase">{label}</span>
		<div class="flex items-baseline gap-2">
			<span class="text-sm font-bold text-zinc-200">{value}</span>
			{#if rank}
				<span
					class="text-[8px] font-black italic {rank.includes('%')
						? 'text-emerald-500'
						: 'text-amber-500'}">{rank}</span
				>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet sidebarIcon({ label, active, icon, action })}
	<button
		onclick={action}
		class="group relative flex flex-col items-center gap-1 transition-all duration-300"
	>
		<div
			class="flex h-10 w-10 items-center justify-center border {active
				? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
				: 'border-zinc-800 text-zinc-600 hover:border-zinc-500 hover:text-zinc-300'} rotate-45 transition-all group-hover:rotate-90"
		>
			<span class="-rotate-45 text-xs font-bold transition-all group-hover:-rotate-90">{icon}</span>
		</div>
		<span
			class="mt-3 text-[7px] font-bold tracking-[0.2em] {active
				? 'text-emerald-500'
				: 'text-zinc-700'}">{label}</span
		>
		{#if active}
			<div
				class="absolute top-1/2 -left-8 h-8 w-1 -translate-y-1/2 bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.8)]"
			></div>
		{/if}
	</button>
{/snippet}

{#snippet medalBadge({ label, color, icon })}
	{@const colorClasses =
		color === 'emerald'
			? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
			: color === 'amber'
				? 'border-amber-600/30 bg-amber-950/20 text-amber-500'
				: color === 'rose'
					? 'border-rose-600/30 bg-rose-950/20 text-rose-500'
					: 'border-zinc-500/40 bg-zinc-900/50 text-zinc-200 shadow-[0_0_15px_rgba(255,255,255,0.02)]'}
	<div
		class="group relative flex h-8 w-8 rotate-45 cursor-help items-center justify-center border transition-all hover:scale-110 hover:rotate-90 {colorClasses}"
	>
		<span class="-rotate-45 text-[10px] font-bold transition-all group-hover:-rotate-90"
			>{icon}</span
		>
		<div
			class="pointer-events-none absolute bottom-full z-[100] mb-4 rotate-[-45deg] border border-zinc-800 bg-[#0a0a0a] px-3 py-1.5 font-sans text-[9px] tracking-[0.2em] whitespace-nowrap text-zinc-100 uppercase opacity-0 shadow-2xl transition-opacity group-hover:rotate-[-90deg] group-hover:opacity-100"
		>
			{label}
		</div>
	</div>
{/snippet}

{#snippet rankMedallion({ tier, value })}
	<div class="absolute -top-4 -right-4 z-30 flex h-12 w-12 items-center justify-center">
		<div
			class="absolute inset-0 rotate-45 animate-[spin_10s_linear_infinite] border-2 border-emerald-500/20"
		></div>
		<div
			class="absolute inset-1 -rotate-45 animate-[spin_15s_linear_infinite] border border-emerald-500/40"
		></div>
		<div
			class="flex h-8 w-8 rotate-45 flex-col items-center justify-center bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.6)]"
		>
			<span class="-rotate-45 text-[8px] leading-none font-black text-black">RANK</span>
			<span class="mt-0.5 -rotate-45 text-[14px] leading-none font-black text-black"
				>{tier.substring(0, 1)}</span
			>
		</div>
	</div>
{/snippet}

{#snippet jadestoneSlot({ slot, name, quality, icon, hash = null })}
	{@const rarityColor = quality === 'Exotic' ? 'bg-amber-500' : 'bg-zinc-100'}
	{@const borderColor = quality === 'Exotic' ? 'border-amber-500/20' : 'border-zinc-800'}
	<div class="group relative flex w-full cursor-pointer flex-col items-center gap-2 font-sans">
		<a
			href={hash ? `https://destinyitemmanager.com/en/inspect/${hash}` : '#'}
			target="_blank"
			class="h-16 w-16 border bg-[#0c0c0c] {borderColor} relative mx-auto block overflow-hidden shadow-[inset_0_0_15px_rgba(0,0,0,0.5)] transition-all duration-300 group-hover:border-emerald-500/50"
		>
			<div class="absolute top-0 left-0 h-[1px] w-full opacity-70 {rarityColor}"></div>
			{#if icon}
				<img
					src={icon}
					alt={name}
					class="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100"
				/>
			{:else}
				<div
					class="flex h-full w-full items-center justify-center opacity-10 transition-opacity group-hover:opacity-30"
				>
					<div class="h-8 w-8 rotate-45 border border-zinc-500"></div>
				</div>
			{/if}
			<div
				class="absolute right-0 bottom-0 bg-black/60 px-1.5 font-sans text-[8px] font-bold tracking-tighter text-zinc-500 uppercase"
			>
				MAX
			</div>
			<div
				class="absolute inset-0 flex items-center justify-center bg-emerald-500/10 opacity-0 transition-opacity group-hover:opacity-100"
			>
				<span class="text-[8px] font-black tracking-widest text-emerald-400">INSPECT</span>
			</div>
		</a>
		<div class="w-full text-center">
			<p class="font-sans text-[8px] font-bold tracking-widest text-zinc-600 uppercase">{slot}</p>
			<p
				class="mx-auto w-24 truncate text-[10px] font-bold tracking-tight text-zinc-200 uppercase group-hover:text-white"
			>
				{name}
			</p>
		</div>
	</div>
{/snippet}

{#snippet inventoryItemCard({ item })}
	<a
		href="https://destinyitemmanager.com/en/inspect/{item.hash}"
		target="_blank"
		class="group stone-card relative block overflow-hidden border border-zinc-800 bg-[#111111] p-4 no-underline transition-all duration-500 hover:border-emerald-500/50"
	>
		<div class="sheen-overlay"></div>
		<div class="relative z-10 flex items-center gap-4">
			<div
				class="relative h-12 w-12 shrink-0 rotate-45 overflow-hidden border border-zinc-800 bg-zinc-900 transition-all duration-500 group-hover:rotate-90"
			>
				<img
					src={item.icon}
					alt={item.name}
					class="h-full w-full -rotate-45 object-cover transition-all duration-500 group-hover:-rotate-90"
				/>
				<div
					class="absolute top-0 left-0 h-[1px] w-full {item.isExotic
						? 'bg-amber-500'
						: 'bg-zinc-500'}"
				></div>
			</div>
			<div class="min-w-0 flex-1">
				<div class="flex items-baseline justify-between">
					<h3
						class="truncate text-[11px] font-black tracking-wider text-zinc-100 uppercase italic transition-colors group-hover:text-emerald-400"
					>
						{item.name}
					</h3>
					<span class="font-mono text-[10px] font-bold text-zinc-500"> {item.power} </span>
				</div>
				<p class="mt-0.5 text-[8px] font-bold tracking-widest text-zinc-600 uppercase">
					{item.type}
				</p>
				<div class="mt-2 flex gap-1">
					{#each (item.perks ?? []).slice(0, 4) as perk}
						<img
							src={perk.icon}
							alt={perk.name}
							class="h-4 w-4 rounded-full border border-zinc-800 bg-black/40"
						/>
					{/each}
				</div>
			</div>
		</div>
	</a>
{/snippet}

{#snippet fateStatRow({ label, value, bonus = 0 })}
	{@const totalValue = value + bonus}
	{@const percentage = Math.min((totalValue / 200) * 100, 100)}
	<div class="group flex w-full items-center gap-3 py-1.5 font-sans">
		<div
			class="flex h-3 w-3 shrink-0 items-center justify-center border border-zinc-800 bg-zinc-900"
		>
			<div
				class="h-1.5 w-1.5 {bonus > 0
					? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]'
					: 'bg-zinc-700'} transition-colors duration-300"
			></div>
		</div>
		<div class="flex-1">
			<div
				class="mb-1 flex justify-between font-sans text-[8px] tracking-[0.15em] text-zinc-500 uppercase"
			>
				<span class="font-bold">{label}</span>
				<div class="flex items-center gap-1.5">
					<span class="font-black text-zinc-200">{totalValue}</span>
				</div>
			</div>
			<div class="relative h-[1px] w-full bg-zinc-900">
				<div
					class="h-full {bonus > 0
						? 'bg-emerald-500'
						: 'bg-zinc-500'} transition-all duration-1000 ease-out"
					style="width: {percentage}%"
				></div>
			</div>
		</div>
	</div>
{/snippet}

{#snippet combatContent()}
	{@render detailStatCompact({
		label: 'Total Kills',
		value: playerData.overview.combat?.total ?? playerData.overview.kills,
		rank: 'Top 1%',
		awakened: true
	})}
	{@render detailStatCompact({
		label: 'Precision',
		value: playerData.overview.combat?.precision ?? '—',
		rank: 'DIAMOND',
		awakened: true
	})}
	{@render detailStatCompact({
		label: 'Ability',
		value: playerData.overview.combat?.ability ?? '—'
	})}
	{@render detailStatCompact({ label: 'Super', value: playerData.overview.combat?.super ?? '—' })}
{/snippet}

{#snippet objectivesContent()}
	{@render detailStatCompact({
		label: 'Deposited',
		value: playerData.overview.objectives.deposited,
		rank: 'Top 2%',
		awakened: true
	})}
	{@render detailStatCompact({
		label: 'Lost',
		value: playerData.overview.objectives.lost,
		rank: 'LOW'
	})}
	{@render detailStatCompact({
		label: 'Blockers',
		value: playerData.overview.objectives.blockers ?? '—'
	})}
	{@render detailStatCompact({
		label: 'Healed',
		value: playerData.overview.objectives.healed ?? '—'
	})}
{/snippet}

{#snippet invasionContent()}
	{@render detailStatCompact({
		label: 'Guardians',
		value: playerData.overview.invasion.guardians,
		rank: 'Top 0.5%',
		awakened: true
	})}
	{@render detailStatCompact({
		label: 'Army of One',
		value: playerData.overview.invasion.armyOfOne ?? '—',
		rank: 'GOLD'
	})}
	{@render detailStatCompact({
		label: 'Motes Denied',
		value: playerData.overview.invasion.motesDenied ?? '—'
	})}
	{@render detailStatCompact({
		label: 'Invader Deaths',
		value: playerData.overview.invasion.invaderDeaths ?? '—'
	})}
	{@render detailStatCompact({
		label: 'Invasions',
		value: playerData.overview.invasion.invasions ?? '—'
	})}
	{@render detailStatCompact({
		label: 'Shut Down',
		value: playerData.overview.invasion.shutDown ?? '—'
	})}
{/snippet}

<div class="flex h-screen overflow-hidden bg-[#080808] font-sans text-slate-200">
	<nav
		class="z-50 flex w-16 shrink-0 flex-col items-center border-r border-zinc-800 bg-[#0a0a0a] py-8"
	>
		<div
			class="mb-12 flex h-9 w-9 rotate-45 cursor-pointer items-center justify-center bg-zinc-100 font-black text-black shadow-2xl transition-colors duration-500 hover:bg-emerald-500"
		>
			<span class="-rotate-45 text-lg">J</span>
		</div>
		<div class="flex flex-col items-center space-y-8">
			{@render sidebarIcon({
				label: 'HOME',
				active: false,
				icon: 'H',
				action: () => (window.location.href = '/')
			})}
			{@render sidebarIcon({
				label: 'PROFILE',
				active: profileTab === 'overview',
				icon: 'P',
				action: () => setTab('overview')
			})}
			{@render sidebarIcon({ label: 'DATABASE', active: false, icon: 'D', action: () => {} })}
			{@render sidebarIcon({
				label: 'SETTINGS',
				active: false,
				icon: 'S',
				action: () => goto('/settings')
			})}
		</div>
	</nav>

	<div
		class="relative flex min-w-0 flex-1 flex-col overflow-hidden"
		onmousemove={onHeroMouseMove}
		onmouseleave={onHeroMouseLeave}
	>
		<div
			class="pointer-events-none absolute inset-0 z-[60] opacity-[0.02] mix-blend-screen"
			style="background-image: url('https://www.transparenttextures.com/patterns/stardust.png')"
		></div>
		<header class="relative h-64 shrink-0 overflow-hidden border-b border-zinc-800">
			<div
				class="absolute inset-[-40px] z-0 transition-transform duration-100 ease-out"
				style="transform: translate({mousePos.x}px, {mousePos.y}px)"
			>
				<img
					src="https://images.unsplash.com/photo-1614850523296-d8c1af93d400?auto=format&fit=crop&q=80&w=2000"
					alt="Background"
					class="h-full w-full object-cover opacity-30 contrast-150 grayscale-[0.4]"
				/>
				<div
					class="absolute inset-0 z-10 bg-gradient-to-t from-[#080808] via-[#080808]/80 to-transparent"
				></div>
			</div>
			<div
				class="relative z-30 mx-auto flex h-full w-full max-w-7xl items-end gap-24 p-10 font-sans"
			>
				<div class="group relative shrink-0">
					<div
						class="relative h-32 w-32 overflow-hidden border border-zinc-700 bg-[#0c0c0c] p-1.5 shadow-2xl"
					>
						<div
							class="flex h-full w-full items-center justify-center bg-[#111111] font-serif text-5xl font-black text-zinc-800 italic select-none"
						>
							{playerData.identity.name.substring(0, 3).toUpperCase()}
						</div>
						<div class="absolute top-0 left-0 h-3 w-3 border-t border-l border-zinc-400"></div>
						<div class="absolute right-0 bottom-0 h-3 w-3 border-r border-b border-zinc-400"></div>
					</div>
					{@render rankMedallion({
						tier: playerData.identity.rank,
						value: playerData.identity.rankValue
					})}
					<div
						class="absolute -bottom-3 -left-3 z-20 border border-zinc-700 bg-[#0a0a0a] px-2.5 py-1 text-[9px] font-black tracking-widest text-zinc-300 uppercase shadow-2xl"
					>
						LVL {playerData.identity.level}
					</div>
				</div>
				<div class="mb-2 flex-1 font-sans">
					<div class="flex flex-col gap-1">
						<button
							onclick={() => window.location.reload()}
							class="text-left"
						>
							<h1
								class="text-6xl leading-none font-light tracking-tighter text-white uppercase italic transition-colors hover:text-emerald-500 drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]"
							>
								{playerData.identity.name}
							</h1>
						</button>
						<div class="mt-2 flex items-center gap-2">
							<span
								class="font-sans text-[12px] font-medium tracking-[0.2em] text-zinc-500 uppercase"
								>{playerData.identity.clan ?? 'No Clan'}</span
							>
						</div>
					</div>
					<div class="mt-10 flex items-center gap-6">
						{@render medalBadge({ icon: '✓', color: 'silver', label: 'Verified Identity' })}
						{@render medalBadge({ icon: '◈', color: 'amber', label: 'Diamond ELO' })}
						{@render medalBadge({ icon: '⚔', color: 'silver', label: 'Army of One' })}
						{@render medalBadge({ icon: 'Ω', color: 'emerald', label: 'Awakened Jadestone' })}
						{@render medalBadge({ icon: 'M', color: 'silver', label: 'Mote Collector' })}
					</div>
				</div>
				<div class="relative z-10 mb-2 flex shrink-0 gap-14 text-right font-sans">
					<div class="flex flex-col items-end gap-6">
						<div>
							{@render ghostLabel({ text: 'RATING' })}
							<div class="flex flex-col items-end">
								<span class="font-sans text-5xl leading-none font-light tracking-tighter text-white"
									>{playerData.identity.rating?.toLocaleString() ?? '—'}</span
								>
								<span
									class="mt-3 font-sans text-[10px] font-bold tracking-[0.3em] text-emerald-500 uppercase italic drop-shadow-md"
									>#WORLDWIDE</span
								>
							</div>
						</div>
					</div>
				</div>
			</div>
		</header>

		<nav
			class="relative z-50 flex h-14 shrink-0 items-center justify-center gap-4 border-b border-zinc-800 bg-[#0a0a0a] font-sans"
		>
			{#each tabsList as tabLabel}
				{@const tabId = tabLabel.toLowerCase()}
				<button
					onclick={() => setTab(tabId)}
					class="relative h-10 border-x border-t border-transparent px-8 font-sans text-[10px] font-bold tracking-[0.3em] uppercase transition-all duration-500 {profileTab ===
					tabId
						? 'border-zinc-700/50 bg-[#151515] text-white shadow-[inset_0_2px_5px_rgba(255,255,255,0.05)]'
						: 'text-zinc-600 hover:text-zinc-300'}"
				>
					<div class="relative z-10">{tabLabel}</div>
					{#if profileTab === tabId}
						<div
							class="absolute bottom-0 left-0 z-20 h-[1px] w-full bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.9)]"
						></div>
						<div
							class="pointer-events-none absolute top-full left-1/2 h-[40px] w-[180%] -translate-x-1/2 bg-emerald-500/10 opacity-80 blur-2xl"
						></div>
					{/if}
				</button>
			{/each}
		</nav>

		<main class="scrollbar-hide flex-1 overflow-y-auto bg-[#080808] p-10">
			<div class="mx-auto max-w-6xl">
				{#key profileTab}
					<div in:fly={{ y: 10, duration: 400 }}>
						{#if deepScanning}
							{#if deepScanStatus === 'auto-syncing'}
								<div
									class="animate-in fade-in slide-in-from-top-2 mb-6 flex items-center justify-between border border-emerald-500/10 bg-emerald-500/5 p-4 duration-700"
								>
									<div class="flex items-center gap-4">
										<div
											class="flex h-5 w-5 rotate-45 animate-spin items-center justify-center border border-emerald-500/30"
										>
											<div class="h-2 w-2 bg-emerald-500/50"></div>
										</div>
										<div>
											<p
												class="font-sans text-[10px] font-black tracking-[0.2em] text-emerald-500/70 uppercase"
											>
												Background Intelligence Sync
											</p>
											<p
												class="font-sans text-[8px] font-bold tracking-[0.1em] text-emerald-600/50 uppercase"
											>
												Processing recent field reports...
											</p>
										</div>
									</div>
									<div class="text-right">
										<span class="font-sans text-[10px] font-bold tracking-widest text-emerald-600"
											>{deepScanProgress.current} / {deepScanProgress.total}</span
										>
									</div>
								</div>
							{:else}
								<div
									class="animate-in fade-in zoom-in-95 relative mb-10 overflow-hidden border border-emerald-500/20 bg-emerald-950/10 p-6 shadow-2xl duration-500"
								>
									<div class="absolute inset-0 animate-pulse bg-emerald-500/5"></div>
									<div class="relative z-10 flex items-center justify-between">
										<div class="flex items-center gap-6">
											<div
												class="flex h-10 w-10 rotate-45 animate-[spin_4s_linear_infinite] items-center justify-center border border-emerald-500"
											>
												<div class="h-5 w-5 rotate-45 border border-emerald-400"></div>
											</div>
											<div>
												<p
													class="font-sans text-[12px] font-black tracking-[0.3em] text-emerald-500 uppercase"
												>
													{deepScanStatus === 'syncing'
														? 'Mirroring Manifest...'
														: deepScanStatus === 'discovering'
															? 'Discovering History...'
															: 'Enriching Career Intelligence...'}
												</p>
												<p
													class="mt-1 font-sans text-[10px] font-bold tracking-[0.2em] text-emerald-600/80 uppercase"
												>
													{deepScanProgress.current} / {deepScanProgress.total} segments processed
												</p>
											</div>
										</div>
										<div class="text-right">
											<span
												class="font-sans text-3xl font-light tracking-tighter text-emerald-400 italic"
											>
												{deepScanProgress.total > 0
													? Math.round((deepScanProgress.current / deepScanProgress.total) * 100)
													: 0}%
											</span>
										</div>
									</div>
									<div class="relative mt-6 h-[1px] w-full overflow-hidden bg-zinc-800">
										<div
											class="absolute inset-y-0 left-0 bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,1)] transition-all duration-700 ease-out"
											style="width: {deepScanProgress.total > 0
												? (deepScanProgress.current / deepScanProgress.total) * 100
												: 0}%"
										></div>
									</div>
								</div>
							{/if}
						{/if}

						{#if profileTab === 'overview'}
							<div class="animate-in fade-in space-y-8 duration-700">
								<!-- Seasonal Navigation -->
								<div class="relative border-b border-zinc-800/50 pb-2">
									{@render ghostLabel({ text: 'SEASONAL ARCHIVE ACCESS' })}
									<div
										bind:this={scrollRef}
										onwheel={handleWheel}
										class="no-scrollbar flex gap-2 overflow-x-auto scroll-smooth py-1"
									>
										<button
											onclick={() => (seasonFilter = 'all')}
											class="relative flex-shrink-0 border border-zinc-800/50 px-6 py-2.5 font-sans text-[10px] tracking-[0.2em] uppercase transition-all {seasonFilter ===
											'all'
												? 'border-emerald-500/30 bg-emerald-500/10 font-black text-emerald-400'
												: 'text-zinc-600 hover:border-zinc-700 hover:text-zinc-400'}"
										>
											GLOBAL HISTORY
											{#if seasonFilter === 'all'}
												<div
													class="absolute bottom-0 left-0 h-[2px] w-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.8)]"
												></div>
											{/if}
										</button>
										{#each seasons as s}
											<button
												onclick={() => (seasonFilter = s.id)}
												class="relative flex-shrink-0 border border-zinc-800/50 px-6 py-2.5 font-sans text-[10px] tracking-[0.2em] uppercase transition-all {seasonFilter ===
												s.id
													? 'border-emerald-500/30 bg-emerald-500/10 font-black text-emerald-400'
													: 'text-zinc-600 hover:border-zinc-700 hover:text-zinc-400'}"
											>
												{s.label}
												{#if seasonFilter === s.id}
													<div
														class="absolute bottom-0 left-0 h-[2px] w-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.8)]"
													></div>
												{/if}
											</button>
										{/each}
									</div>
								</div>

								<!-- Summary Bar -->
								<div class="grid grid-cols-4 gap-4">
									<div class="relative border border-zinc-800 bg-[#0c0c0c] p-4 shadow-[inset_0_0_40px_rgba(0,0,0,0.7)]">
										<span class="block text-[8px] font-bold tracking-widest text-zinc-600 uppercase">Deployment Count</span>
										<div class="mt-1 flex items-baseline gap-2">
											<span class="text-3xl font-light tracking-tighter text-white italic">{fmt(dEntered)}</span>
											<span class="text-[9px] font-bold text-zinc-700 uppercase">Matches</span>
										</div>
										{#if h250.n > 0}
											<p class="mt-1 text-[8px] text-zinc-600">{h250.n} loaded · {h250.en} enriched</p>
										{/if}
									</div>
									<div class="relative border border-zinc-800 bg-[#0c0c0c] p-4 shadow-[inset_0_0_40px_rgba(0,0,0,0.7)]">
										<span class="block text-[8px] font-bold tracking-widest text-zinc-600 uppercase">Success Rate</span>
										<div class="mt-1 flex items-baseline gap-2">
											<span class="text-3xl font-light tracking-tighter text-emerald-500 italic">
												{h250.winRate250 != null ? h250.winRate250 + '%' : (dWinRate != null ? fmtF(dWinRate, 1) + '%' : '—')}
											</span>
										</div>
										<p class="mt-1 text-[8px] text-zinc-600 uppercase tracking-wider">
											{h250.n > 0 ? `${historySum.wins}W of ${h250.n} recent` : 'lifetime avg'}
										</p>
									</div>
									<div class="relative border border-zinc-800 bg-[#0c0c0c] p-4 shadow-[inset_0_0_40px_rgba(0,0,0,0.7)]">
										<span class="block text-[8px] font-bold tracking-widest text-zinc-600 uppercase">Lethality Index</span>
										<div class="mt-1 flex items-baseline gap-2">
											<span class="text-3xl font-light tracking-tighter text-white italic">
												{h250.kd250 != null ? h250.kd250 : (dKD != null ? fmtF(dKD, 2) : '—')}
											</span>
											<span class="text-[9px] font-bold text-zinc-700 uppercase">K/D</span>
										</div>
										<p class="mt-1 text-[8px] text-zinc-600 uppercase tracking-wider">
											{h250.avgKills != null ? `${h250.avgKills} kills / game` : ''}
										</p>
									</div>
									<div class="relative border border-zinc-800 bg-[#0c0c0c] p-4 shadow-[inset_0_0_40px_rgba(0,0,0,0.7)]">
										<span class="block text-[8px] font-bold tracking-widest text-zinc-600 uppercase">Avg EGO Score</span>
										<div class="mt-1 flex items-baseline gap-2">
											<span class="text-3xl font-light tracking-tighter text-amber-500 italic">
												{h250.avgEgo ?? (career?.avgScore ? career.avgScore : fmt(egoRating))}
											</span>
										</div>
										<p class="mt-1 text-[8px] text-zinc-600 uppercase tracking-wider">
											{h250.n > 0 ? `per game · ${h250.n} matches` : 'career estimate'}
										</p>
									</div>
								</div>

									<!-- Data Information Tables -->
								<div class="grid grid-cols-1 gap-8 lg:grid-cols-2">
									<!-- Combat & Efficiency -->
									<div class="space-y-8">
										<div class="border border-zinc-800 bg-[#0c0c0c]/50 p-6">
											{@render ghostLabel({ text: `COMBAT_PERFORMANCE · ${h250.n || '?'} GAMES`, className: 'mb-6' })}
											<div class="space-y-4">
												{@render detailStatCompact({ label: 'K/D Ratio', value: h250.kd250 ?? fmtF(dKD, 2), awakened: (h250.kd250 ?? dKD ?? 0) >= 1.0, rank: h250.n > 0 ? `${fmt(historySum.kills)}K · ${fmt(historySum.deaths)}D` : null })}
												{@render detailStatCompact({ label: 'Kills / Game', value: h250.avgKills ?? fmtF(dKills, 0), rank: h250.n > 0 ? `${fmt(historySum.kills)} total` : null, awakened: (h250.avgKills ?? 0) > 20 })}
												{@render detailStatCompact({ label: 'Deaths / Game', value: h250.avgDeaths ?? fmtF(dDeaths, 0), rank: h250.n > 0 ? `${fmt(historySum.deaths)} total` : null })}
												{@render detailStatCompact({ label: 'Assists / Game', value: h250.avgAssists ?? '—', rank: h250.n > 0 ? `${fmt(historySum.assists)} total` : null })}
												{@render detailStatCompact({ label: 'Precision %', value: h250.precisionPct != null ? h250.precisionPct + '%' : '—', awakened: (h250.precisionPct ?? 0) > 30 })}
												{#if (h250.medals?.maximumCarnage ?? 0) > 0 || statsCache.maximumCarnage > 0}
													{@render detailStatCompact({ label: 'Maximum Carnage', value: fmt(Math.max(h250.medals?.maximumCarnage ?? 0, statsCache.maximumCarnage)), awakened: true, rank: h250.medalsPerGame?.maximumCarnage ? h250.medalsPerGame.maximumCarnage + '/game' : null })}
												{/if}
												{#if (h250.medals?.massacre ?? 0) > 0 || dMassacre > 0}
													{@render detailStatCompact({ label: 'Massacre Medals', value: fmt(Math.max(h250.medals?.massacre ?? 0, dMassacre)), awakened: true, rank: h250.medalsPerGame?.massacre ? h250.medalsPerGame.massacre + '/game' : null })}
												{/if}
												{#if (h250.medals?.thrillmonger ?? 0) > 0 || statsCache.thrillmonger > 0}
													{@render detailStatCompact({ label: 'Thrillmonger Medals', value: fmt(Math.max(h250.medals?.thrillmonger ?? 0, statsCache.thrillmonger)), awakened: true, rank: h250.medalsPerGame?.thrillmonger ? h250.medalsPerGame.thrillmonger + '/game' : null })}
												{/if}
												{#if (h250.medals?.overkillmonger ?? 0) > 0 || statsCache.overkillmonger > 0}
													{@render detailStatCompact({ label: 'Overkillmonger Medals', value: fmt(Math.max(h250.medals?.overkillmonger ?? 0, statsCache.overkillmonger)), rank: h250.medalsPerGame?.overkillmonger ? h250.medalsPerGame.overkillmonger + '/game' : null })}
												{/if}
												{#if (h250.medals?.killmonger ?? 0) > 0 || statsCache.killmonger > 0}
													{@render detailStatCompact({ label: 'Killmonger Medals', value: fmt(Math.max(h250.medals?.killmonger ?? 0, statsCache.killmonger)), rank: h250.medalsPerGame?.killmonger ? h250.medalsPerGame.killmonger + '/game' : null })}
												{/if}
											</div>
										</div>

										<div class="border border-zinc-800 bg-[#0c0c0c]/50 p-6">
											{@render ghostLabel({ text: `ABILITY_METRICS · ${h250.n || '?'} GAMES`, className: 'mb-6' })}
											<div class="space-y-4">
												{@render detailStatCompact({ label: 'Super Kills / Game', value: h250.avgSuperKills ?? fmtF(dSuperKills, 0), rank: h250.n > 0 ? `${fmt(historySum.superKills)} total` : null, awakened: (h250.avgSuperKills ?? 0) > 0.5 })}
												{@render detailStatCompact({ label: 'Melee Kills / Game', value: h250.avgMeleeKills ?? fmtF(dMeleeKills, 0), rank: h250.n > 0 ? `${fmt(historySum.meleeKills)} total` : null })}
												{@render detailStatCompact({ label: 'Grenade Kills / Game', value: h250.avgGrenadeKills ?? fmtF(dGrenadeKills, 0), rank: h250.n > 0 ? `${fmt(historySum.grenadeKills)} total` : null })}
												{@render detailStatCompact({ label: 'Ability Kills / Game', value: h250.avgMeleeKills != null && h250.avgGrenadeKills != null ? fmtF(h250.avgMeleeKills + h250.avgGrenadeKills, 1) : fmt(dAbility), awakened: (h250.avgMeleeKills ?? 0) + (h250.avgGrenadeKills ?? 0) > 3 })}
												{#if (h250.medals?.lightVersusLight ?? 0) > 0 || statsCache.lightVersusLight > 0}
													{@render detailStatCompact({ label: 'Light vs. Light (Super)', value: fmt(Math.max(h250.medals?.lightVersusLight ?? 0, statsCache.lightVersusLight)), awakened: true, rank: h250.medalsPerGame?.lightVersusLight ? h250.medalsPerGame.lightVersusLight + '/game' : null })}
												{/if}
											</div>
										</div>
									</div>

									<!-- Objectives & Invasion -->
									<div class="space-y-8">
										<div class="border border-zinc-800 bg-[#0c0c0c]/50 p-6">
											{@render ghostLabel({ text: `MOTE_ANALYSIS · ${h250.n || '?'} GAMES`, className: 'mb-6' })}
											<div class="space-y-4">
												{@render detailStatCompact({ label: 'Banked / Game', value: h250.avgMotes ?? fmtF(dAvgMotes, 1), rank: h250.n > 0 ? `${fmt(historySum.motes)} total` : null, awakened: (h250.avgMotes ?? 0) > 40 })}
												{@render detailStatCompact({ label: 'Mote Efficiency', value: h250.moteEff != null ? h250.moteEff + '%' : ((dMotes + dMotesLost) > 0 ? fmtF((dMotes / (dMotes + dMotesLost)) * 100, 1) + '%' : '—'), awakened: (h250.moteEff ?? 0) > 90, rank: h250.moteEff != null ? (h250.moteEff > 90 ? 'ELITE' : h250.moteEff > 80 ? 'SOLID' : 'LOW') : null })}
												{@render detailStatCompact({ label: 'Lost / Game', value: h250.avgMotesLost ?? fmtF(dMotesLost, 0), rank: h250.n > 0 ? `${fmt(historySum.motesLost)} total` : null })}
												{@render detailStatCompact({ label: 'Denied / Game', value: h250.avgMotesDenied ?? fmtF(dMotesDenied, 0), rank: h250.n > 0 ? `${fmt(historySum.motesDenied)} total` : null, awakened: (h250.avgMotesDenied ?? 0) > 5 })}
												{@render detailStatCompact({ label: 'Primeval Dmg / Game', value: h250.avgPrimDmg != null ? fmtNum(h250.avgPrimDmg) : fmtNum(dPrimevalDmg), rank: h250.n > 0 ? `${fmtNum(historySum.primevalDmg)} total` : null, awakened: (h250.avgPrimDmg ?? 0) > 200000 })}
												{#if (h250.medals?.halfBanked ?? 0) > 0 || statsCache.halfBanked > 0}
													{@render detailStatCompact({ label: 'Half-Banked Medals', value: fmt(Math.max(h250.medals?.halfBanked ?? 0, statsCache.halfBanked)), awakened: true, rank: h250.medalsPerGame?.halfBanked ? h250.medalsPerGame.halfBanked + '/game' : null })}
												{/if}
												{#if (h250.medals?.fastFill ?? 0) > 0 || statsCache.fastFill > 0}
													{@render detailStatCompact({ label: 'Fast Fill Medals', value: fmt(Math.max(h250.medals?.fastFill ?? 0, statsCache.fastFill)), rank: h250.medalsPerGame?.fastFill ? h250.medalsPerGame.fastFill + '/game' : null })}
												{/if}
												{#if (h250.medals?.locksmith ?? 0) > 0 || statsCache.locksmith > 0}
													{@render detailStatCompact({ label: 'Locksmith Medals', value: fmt(Math.max(h250.medals?.locksmith ?? 0, statsCache.locksmith)), awakened: true, rank: h250.medalsPerGame?.locksmith ? h250.medalsPerGame.locksmith + '/game' : null })}
												{/if}
												{#if (h250.medals?.firstToBlock ?? 0) > 0 || statsCache.firstToBlock > 0}
													{@render detailStatCompact({ label: 'First to Block', value: fmt(Math.max(h250.medals?.firstToBlock ?? 0, statsCache.firstToBlock)), rank: h250.medalsPerGame?.firstToBlock ? h250.medalsPerGame.firstToBlock + '/game' : null })}
												{/if}
												{#if (h250.medals?.blockbuster ?? 0) > 0 || statsCache.blockbuster > 0}
													{@render detailStatCompact({ label: 'Blockbuster Medals', value: fmt(Math.max(h250.medals?.blockbuster ?? 0, statsCache.blockbuster)), rank: h250.medalsPerGame?.blockbuster ? h250.medalsPerGame.blockbuster + '/game' : null })}
												{/if}
												{#if statsCache.protectTheRunner > 0}
													{@render detailStatCompact({ label: 'Protect the Runner', value: fmt(statsCache.protectTheRunner), awakened: true })}
												{/if}
											</div>
										</div>

										<div class="border border-zinc-800 bg-[#0c0c0c]/50 p-6">
											{@render ghostLabel({ text: `INVASION_REPORT · ${h250.n || '?'} GAMES`, className: 'mb-6' })}
											<div class="space-y-4">
												{@render detailStatCompact({ label: 'Inv. Kills / Game', value: h250.avgInvKills ?? fmtF(dInvKills, 0), rank: h250.n > 0 ? `${fmt(historySum.invKills)} total` : null, awakened: (h250.avgInvKills ?? 0) >= 1 })}
												{@render detailStatCompact({ label: 'Inv. Deaths / Game', value: h250.avgInvDeaths ?? fmtF(dInvaderDeaths, 0), rank: h250.n > 0 ? `${fmt(historySum.invDeaths)} total` : null })}
												{@render detailStatCompact({ label: 'Kills / Invasion', value: (historySum.invKills > 0 && historySum.n > 0) ? fmtF(historySum.invKills / Math.max(1, historySum.n * (h250.avgInvKills ?? 0) / Math.max(1, historySum.invKills)), 1) : fmtF(dInvasions > 0 ? dInvKills / dInvasions : 0, 1) })}
												{@render detailStatCompact({ label: 'Motes Denied / Game', value: h250.avgMotesDenied ?? fmtF(dMotesDenied, 0), rank: h250.n > 0 ? `${fmt(historySum.motesDenied)} total` : null, awakened: (h250.avgMotesDenied ?? 0) > 5 })}
												{@render detailStatCompact({ label: 'Invaders Shut Down', value: fmt(dShutDowns), rank: h250.n > 0 && dShutDowns > 0 ? fmtF(dShutDowns / h250.n, 2) + '/game' : null })}
												{#if (h250.medals?.armyOfOne ?? 0) > 0 || dArmyOfOne > 0}
													{@render detailStatCompact({ label: 'Army of One', value: fmt(Math.max(h250.medals?.armyOfOne ?? 0, dArmyOfOne)), awakened: true, rank: h250.medalsPerGame?.armyOfOne ? h250.medalsPerGame.armyOfOne + '/game' : null })}
												{/if}
												{#if (h250.medals?.notOnMyWatch ?? 0) > 0 || statsCache.notOnMyWatch > 0}
													{@render detailStatCompact({ label: 'Not on My Watch', value: fmt(Math.max(h250.medals?.notOnMyWatch ?? 0, statsCache.notOnMyWatch)), awakened: true, rank: h250.medalsPerGame?.notOnMyWatch ? h250.medalsPerGame.notOnMyWatch + '/game' : null })}
												{/if}
												{#if (h250.medals?.bigGameHunter ?? 0) > 0 || statsCache.bigGameHunter > 0}
													{@render detailStatCompact({ label: 'Big Game Hunter', value: fmt(Math.max(h250.medals?.bigGameHunter ?? 0, statsCache.bigGameHunter)), rank: h250.medalsPerGame?.bigGameHunter ? h250.medalsPerGame.bigGameHunter + '/game' : null })}
												{/if}
												{#if (h250.medals?.noEscape ?? 0) > 0 || statsCache.noEscape > 0}
													{@render detailStatCompact({ label: 'No Escape Medals', value: fmt(Math.max(h250.medals?.noEscape ?? 0, statsCache.noEscape)), rank: h250.medalsPerGame?.noEscape ? h250.medalsPerGame.noEscape + '/game' : null })}
												{/if}
												{#if (h250.medals?.payback ?? 0) > 0 || statsCache.payback > 0}
													{@render detailStatCompact({ label: 'Payback Medals', value: fmt(Math.max(h250.medals?.payback ?? 0, statsCache.payback)), rank: h250.medalsPerGame?.payback ? h250.medalsPerGame.payback + '/game' : null })}
												{/if}
												{#if (h250.medals?.lastGuardianStanding ?? 0) > 0 || statsCache.lastGuardianStanding > 0}
													{@render detailStatCompact({ label: 'Last Guardian Standing', value: fmt(Math.max(h250.medals?.lastGuardianStanding ?? 0, statsCache.lastGuardianStanding)), awakened: true, rank: h250.medalsPerGame?.lastGuardianStanding ? h250.medalsPerGame.lastGuardianStanding + '/game' : null })}
												{/if}
											</div>
										</div>
									</div>
								</div>

								<!-- Visual Disclaimer -->
								<div class="mt-12 flex items-center justify-center gap-4 border-t border-zinc-800 pt-8 opacity-40">
									<div class="h-1 w-1 rounded-full bg-emerald-500 animate-pulse"></div>
									<span class="text-[8px] font-bold tracking-[0.5em] text-zinc-600 uppercase">
										End of Tactical Archive Section _UID_{data.membershipId}
									</span>
									<div class="h-1 w-1 rounded-full bg-emerald-500 animate-pulse"></div>
								</div>
							</div>
						{:else if profileTab === 'matches'}
							<div
								class="animate-in slide-in-from-bottom-2 mx-auto max-w-5xl space-y-3 duration-500"
							>
								<div class="flex items-center justify-between">
									{@render ghostLabel({ text: 'RECENT MATCH HISTORY' })}
								</div>
								{#each matchesList as m}
									<a
										href="/match/{m.instanceId}"
										class="group relative block border font-sans no-underline transition-all duration-300 {m.result === 'WIN' ? 'border-zinc-800 hover:border-emerald-500/40' : 'border-zinc-800 hover:border-rose-500/30'} bg-[#0c0c0c]"
									>
										<!-- Win/loss accent bar -->
										<div
											class="absolute top-0 left-0 h-full w-0.5 {m.result === 'WIN'
												? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]'
												: 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.3)]'}"
										></div>

										<div class="flex items-stretch gap-0 pl-3">
											<!-- Left: outcome + map + date -->
											<div class="flex w-40 shrink-0 flex-col justify-center py-3 pl-2 pr-4">
												<p class="text-xs font-black italic {m.result === 'WIN' ? 'text-emerald-400' : 'text-rose-400'}">{m.result}</p>
												<p class="mt-0.5 truncate text-[11px] font-bold text-zinc-100 uppercase leading-tight">{m.map}</p>
												<p class="mt-1 text-[8px] text-zinc-600 uppercase tracking-wider">{m.date}</p>
											</div>

											<!-- EGO score block -->
											<div class="flex w-24 shrink-0 flex-col items-center justify-center border-x border-zinc-800/60 px-3 py-3">
												{#if m.egoScore != null}
													<span class="text-2xl font-light italic leading-none" style="color: {egoColor(m.egoScore)}">{m.egoScore.toFixed(1)}</span>
													<span class="mt-0.5 text-[7px] font-bold tracking-[0.2em] text-zinc-700 uppercase">EGO</span>
													{#if m.egoBase != null}
														<div class="mt-1.5 flex gap-2 text-[7px] text-zinc-600">
															<span>{m.egoBase.toFixed(1)} <span class="text-zinc-700">BASE</span></span>
															<span class="text-zinc-800">|</span>
															<span class="text-violet-500/70">{m.egoPem?.toFixed(2)} <span class="text-zinc-700">PEM</span></span>
														</div>
													{/if}
												{:else}
													<span class="text-xs text-zinc-700 italic">—</span>
													<span class="mt-0.5 text-[7px] font-bold tracking-[0.2em] text-zinc-700 uppercase">EGO</span>
												{/if}
											</div>

											<!-- Main stats grid -->
											<div class="flex flex-1 flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
												<!-- Combat row -->
												<div class="flex items-center gap-5">
													<div class="min-w-[3rem]">
														<p class="text-[7px] font-bold tracking-widest text-zinc-600 uppercase">Kills</p>
														<p class="text-xs font-bold text-zinc-100">{m.kills}</p>
													</div>
													<div class="min-w-[3rem]">
														<p class="text-[7px] font-bold tracking-widest text-zinc-600 uppercase">Deaths</p>
														<p class="text-xs font-bold text-rose-400">{m.deaths}</p>
													</div>
													<div class="min-w-[3rem]">
														<p class="text-[7px] font-bold tracking-widest text-zinc-600 uppercase">Assists</p>
														<p class="text-xs font-bold text-sky-400">{m.assists}</p>
													</div>
													<div class="min-w-[3.5rem]">
														<p class="text-[7px] font-bold tracking-widest text-zinc-600 uppercase">K/D</p>
														<p class="text-xs font-bold text-zinc-300">{m.kd.toFixed(2)}</p>
													</div>
												</div>

												<div class="h-8 w-px bg-zinc-800/60 self-center"></div>

												<!-- Motes row -->
												<div class="flex items-center gap-5">
													<div class="min-w-[3rem]">
														<p class="text-[7px] font-bold tracking-widest text-zinc-600 uppercase">Banked</p>
														<p class="text-xs font-bold text-emerald-400">{m.motesDeposited}</p>
													</div>
													<div class="min-w-[3rem]">
														<p class="text-[7px] font-bold tracking-widest text-zinc-600 uppercase">Denied</p>
														<p class="text-xs font-bold text-violet-400">{m.motesDenied}</p>
													</div>
													<div class="min-w-[3rem]">
														<p class="text-[7px] font-bold tracking-widest text-zinc-600 uppercase">Lost</p>
														<p class="text-xs font-bold text-rose-400/80">{m.motesLost}</p>
													</div>
												</div>

												<div class="h-8 w-px bg-zinc-800/60 self-center"></div>

												<!-- Invasion + Damage -->
												<div class="flex items-center gap-5">
													<div class="min-w-[3.5rem]">
														<p class="text-[7px] font-bold tracking-widest text-zinc-600 uppercase">Invasion</p>
														<p class="text-xs font-bold text-violet-400">{m.invKills} <span class="text-zinc-700">/</span> <span class="text-rose-500/70">{m.invDeaths}</span></p>
													</div>
													<div class="min-w-[4rem]">
														<p class="text-[7px] font-bold tracking-widest text-zinc-600 uppercase">Dmg</p>
														<p class="text-xs font-bold text-amber-400">{fmtNum(m.primevalDamage)}</p>
													</div>
													{#if m.fireteamSize > 1}
														<div class="min-w-[2.5rem]">
															<p class="text-[7px] font-bold tracking-widest text-zinc-600 uppercase">Stack</p>
															<p class="text-xs font-bold text-zinc-300">{m.fireteamSize}×</p>
														</div>
													{/if}
												</div>
											</div>

											<!-- Right: carry badges + enriched -->
											<div class="flex shrink-0 flex-col items-end justify-center gap-1.5 px-4 py-3">
												{#if m.isHardCarry}
													<span class="border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[7px] font-black tracking-widest text-emerald-400 uppercase">CARRY</span>
												{/if}
												{#if m.isCarried}
													<span class="border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[7px] font-black tracking-widest text-rose-400 uppercase">CARRIED</span>
												{/if}
												{#if m.isEnriched}
													<div class="mt-auto flex h-3.5 w-3.5 rotate-45 items-center justify-center border border-emerald-500/60 bg-emerald-500/10">
														<div class="h-1 w-1 bg-emerald-500"></div>
													</div>
												{:else}
													<div class="mt-auto h-3.5 w-3.5 rotate-45 border border-zinc-800 bg-zinc-900/50"></div>
												{/if}
											</div>
										</div>
									</a>
								{/each}
								{#if history.matches.length === 0 && !historyLoading}
									<div
										class="col-span-full py-20 text-center text-[10px] tracking-[0.3em] text-zinc-700 uppercase"
									>
										No matches loaded. Start a Deep Scan to begin.
									</div>
								{/if}
							</div>
						{:else if profileTab === 'weaponry'}
							<div class="animate-in fade-in mx-auto max-w-6xl space-y-6 duration-700">
								<div class="flex items-center justify-between border-b border-zinc-800 pb-4">
									{@render ghostLabel({ text: 'WEAPON STATISTICS' })}
									<div
										class="flex overflow-hidden rounded-sm border border-zinc-800 bg-zinc-950 p-0.5"
									>
										{#each ['kinetic', 'energy', 'power'] as slot}
											<button
												onclick={() => (activeWeaponSlot = slot)}
												class="relative px-4 py-1.5 font-sans text-[8px] tracking-widest uppercase transition-all {activeWeaponSlot ===
												slot
													? 'font-bold text-emerald-400'
													: 'text-zinc-700 hover:text-zinc-500'}"
											>
												{slot}
												{#if activeWeaponSlot === slot}
													<div
														class="absolute bottom-0 left-0 h-[1px] w-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"
													></div>
												{/if}
											</button>
										{/each}
									</div>
								</div>
								<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
									{#each weaponData[activeWeaponSlot] || [] as w}
										<div
											class="group stone-card relative overflow-hidden border border-zinc-800 bg-[#111111] p-5 font-sans shadow-[inset_0_0_30px_rgba(0,0,0,0.5)] transition-all duration-500 hover:border-zinc-600"
										>
											<div class="sheen-overlay"></div>
											<div class="mb-6 flex items-start justify-between">
												<div class="flex gap-4">
													<div
														class="relative h-10 w-10 overflow-hidden border border-zinc-800 bg-zinc-900"
													>
														{#if w.icon}
															<img src={w.icon} alt={w.name} class="h-full w-full object-cover" />
														{/if}
													</div>
													<div>
														<h3 class="text-sm font-black uppercase italic {w.color}">{w.name}</h3>
														<p class="font-sans text-[8px] tracking-widest text-zinc-600 uppercase">
															{w.type}
														</p>
													</div>
												</div>
												<a
													href="https://destinyitemmanager.com/en/inspect/{w.hash}"
													target="_blank"
													class="border border-emerald-500/20 px-2 py-1 text-[8px] font-black text-emerald-500"
													>DIM</a
												>
											</div>
											<div class="relative z-10 grid grid-cols-2 gap-4">
												<div>
													<p
														class="font-sans text-[7px] font-bold tracking-widest text-zinc-700 uppercase"
													>
														Hostiles Slain
													</p>
													<p class="text-sm font-bold text-zinc-200">{w.kills}</p>
												</div>
												<div>
													<p
														class="font-sans text-[7px] font-bold tracking-widest text-zinc-700 uppercase"
													>
														Precision Resonance
													</p>
													<p class="text-sm font-bold text-emerald-500">{w.precision}</p>
												</div>
											</div>
										</div>
									{/each}
									{#if !weaponData[activeWeaponSlot]?.length}
										<div
											class="col-span-full py-20 text-center text-[10px] tracking-[0.3em] text-zinc-700 uppercase"
										>
											No recorded data. Perform a Deep Scan to fill this arsenal.
										</div>
									{/if}
								</div>
							</div>
						{:else if profileTab === 'synergy'}
							<div
								class="animate-in slide-in-from-bottom-2 mx-auto max-w-6xl space-y-8 duration-500"
							>
								<div>
									{@render engravedHeader({ text: 'BATTLE BROTHERS (ALLIES)' })}
									<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
										{#each career?.allies ?? [] as teammate}
											<div
												class="group stone-card relative border border-zinc-800 bg-[#111111] p-5 shadow-[inset_0_0_30px_rgba(0,0,0,0.5)] transition-all duration-500 hover:border-emerald-700/50"
											>
												<div class="sheen-overlay"></div>
												<div class="relative z-10 flex items-center">
													<div
														class="ml-2 flex h-12 w-12 shrink-0 rotate-45 items-center justify-center border border-zinc-800 bg-zinc-900"
													>
														<span class="-rotate-45 text-[10px] font-black text-emerald-500 italic"
															>{teammate.winRate}%</span
														>
													</div>
													<div class="ml-12 flex-1 font-sans">
														<p class="text-sm font-bold tracking-wide text-zinc-100 uppercase">
															{teammate.name} <span class="text-zinc-600">#{teammate.code}</span>
														</p>
														<div class="mt-1 flex items-center gap-4">
															<span
																class="font-sans text-[9px] font-bold tracking-widest text-emerald-600 uppercase"
																>{teammate.games} GAMES TOGETHER</span
															>
														</div>
													</div>
												</div>
											</div>
										{/each}
									</div>
								</div>
								<div>
									{@render engravedHeader({
										text: 'NEMESIS TRACKER (RIVALS)',
										className: 'text-rose-500'
									})}
									<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
										{#each career?.rivals ?? [] as rival}
											<div
												class="group stone-card relative border border-zinc-800 bg-[#111111] p-5 shadow-[inset_0_0_30px_rgba(0,0,0,0.5)] transition-all duration-500 hover:border-rose-900/50"
											>
												<div class="sheen-overlay"></div>
												<div class="relative z-10 flex items-center">
													<div
														class="ml-2 flex h-12 w-12 shrink-0 rotate-45 items-center justify-center border border-zinc-800 bg-zinc-900"
													>
														<span class="-rotate-45 text-[10px] font-black text-rose-500 italic"
															>{rival.winRate}%</span
														>
													</div>
													<div class="ml-12 flex-1 font-sans">
														<p class="text-sm font-bold tracking-wide text-zinc-100 uppercase">
															{rival.name} <span class="text-zinc-600">#{rival.code}</span>
														</p>
														<div class="mt-1 flex items-center gap-4">
															<span
																class="font-sans text-[9px] font-bold tracking-widest text-rose-600 uppercase"
																>{rival.games} ENCOUNTERS</span
															>
														</div>
													</div>
												</div>
											</div>
										{/each}
									</div>
								</div>
							</div>
						{:else if profileTab === 'maps'}
							<div class="animate-in fade-in mx-auto max-w-6xl space-y-6 duration-500">
								{@render engravedHeader({ text: 'MAP EFFICIENCY' })}
								<div class="grid grid-cols-2 gap-4 font-sans lg:grid-cols-4">
									{#each career?.maps ?? [] as map}
										<div
											class="group stone-card relative overflow-hidden border border-zinc-800 bg-[#111111] p-5 text-center shadow-[inset_0_0_30px_rgba(0,0,0,0.5)] transition-all duration-500 hover:border-emerald-500/50"
										>
											<div class="sheen-overlay"></div>
											<div class="relative z-10">
												<div
													class="relative mb-3 flex h-16 w-full items-center justify-center overflow-hidden border border-zinc-800 bg-zinc-950/50"
												>
													<div
														class="h-8 w-8 rotate-45 border border-zinc-800 transition-colors group-hover:border-emerald-500/30"
													></div>
												</div>
												<p
													class="text-xs font-black tracking-tighter text-zinc-300 uppercase italic"
												>
													{map.name}
												</p>
												<p class="mt-2 text-sm font-bold text-emerald-500">
													{map.winRate}% WIN RATE
												</p>
												<p class="mt-1 text-[8px] tracking-widest text-zinc-600 uppercase">
													{map.games} matches
												</p>
											</div>
										</div>
									{/each}
								</div>
							</div>
						{:else if profileTab === 'pursuits'}
							<div
								class="animate-in slide-in-from-bottom-2 mx-auto max-w-6xl space-y-6 duration-700"
							>
								{@render engravedHeader({ text: 'CAREER ACHIEVEMENTS' })}
								<div class="grid gap-3">
									{#each pursuits?.records?.slice(0, 15) ?? [] as m}
										<div
											class="group stone-card relative border border-zinc-800 bg-[#111111] p-5 font-sans transition-all hover:border-zinc-600"
										>
											<div class="sheen-overlay"></div>
											<div class="relative z-10 mb-2 flex items-start justify-between">
												<div class="flex gap-4">
													<img
														src={m.icon}
														alt={m.name}
														class="h-8 w-8 opacity-50 transition-opacity group-hover:opacity-100"
													/>
													<div>
														<h3 class="text-sm font-black text-zinc-100 uppercase italic">
															{m.name}
														</h3>
														<p class="mt-1 font-serif text-[10px] text-zinc-500 italic">
															"{m.description}"
														</p>
													</div>
												</div>
												<p class="font-sans text-[9px] font-bold text-emerald-500 uppercase">
													{m.isCompleted ? 'EARNED' : 'IN PROGRESS'}
												</p>
											</div>
											<div class="relative z-10 mt-4 flex items-center gap-4 font-sans">
												<div class="h-[2px] flex-1 overflow-hidden bg-zinc-900">
													<div
														class="h-full bg-emerald-500 transition-all duration-1000"
														style="width: {m.isCompleted
															? 100
															: (m.objectives[0]?.progress / m.objectives[0]?.completionValue) *
																100}%;"
													></div>
												</div>
											</div>
										</div>
									{/each}
								</div>
							</div>
						{:else if profileTab === 'loadout'}
							<div class="animate-in fade-in zoom-in-95 mx-auto max-w-6xl px-4 py-10 duration-700">
								<div class="grid grid-cols-12 items-start gap-12 font-sans">
									<div class="col-span-3 flex flex-col items-center space-y-12">
										<div class="group flex w-full cursor-pointer flex-col items-center">
											<div class="relative mx-auto flex h-24 w-24 items-center justify-center">
												<div
													class="absolute inset-0 animate-pulse rounded-full bg-emerald-500/5 blur-3xl"
												></div>
												<div
													class="flex h-20 w-20 rotate-45 items-center justify-center border-2 border-zinc-800 bg-[#0a0a0a] shadow-2xl transition-all duration-700 group-hover:rotate-90 group-hover:border-emerald-500/50"
												>
													<div
														class="flex h-10 w-10 -rotate-45 rotate-45 items-center justify-center border border-emerald-400"
													>
														<div class="h-2 w-2 bg-emerald-500"></div>
													</div>
												</div>
											</div>
											<div class="mt-6 w-full text-center">
												<span
													class="mb-1 block font-sans text-[9px] font-bold tracking-[0.2em] text-zinc-600 uppercase"
													>SUBCLASS</span
												>
												<p class="text-[11px] font-bold tracking-widest text-zinc-100 uppercase">
													{playerData.loadout.subclass}
												</p>
											</div>
										</div>
										<div
											class="flex w-full flex-col items-center space-y-10 border-t border-zinc-800/40 pt-8"
										>
											{#each playerData.loadout.weapons as w}
												{@render jadestoneSlot({
													slot: w.slot,
													name: w.name,
													quality: w.quality,
													icon: w.icon,
													hash: w.hash
												})}
											{/each}
										</div>
									</div>
									<div class="relative col-span-6 flex min-h-[500px] items-center justify-center">
										<div
											class="pointer-events-none absolute inset-0 flex items-center justify-center opacity-5"
										>
											<div
												class="h-[400px] w-[400px] animate-pulse rounded-full border border-emerald-500"
											></div>
											<div
												class="absolute h-[500px] w-[500px] rounded-full border border-zinc-800"
											></div>
										</div>
										<div
											class="relative z-10 flex h-[480px] w-80 flex-col items-center justify-center"
										>
											<div
												class="absolute inset-0 bg-gradient-to-t from-emerald-500/10 via-transparent to-transparent opacity-40 blur-3xl"
											></div>
											<div
												class="rotate-90 text-center font-sans text-[10px] font-bold tracking-[1em] whitespace-nowrap text-zinc-800 uppercase opacity-40 select-none"
											>
												CHARACTER_ENTITY
											</div>
											<div
												class="absolute top-0 left-0 h-8 w-8 border-t-2 border-l-2 border-zinc-800"
											></div>
											<div
												class="absolute right-0 bottom-0 h-8 w-8 border-r-2 border-b-2 border-zinc-800"
											></div>
										</div>
									</div>
									<div class="col-span-3 flex h-full flex-col items-center space-y-8">
										<div class="flex w-full flex-col items-center gap-6">
											{#each playerData.loadout.armor as a}
												{@render jadestoneSlot({
													slot: a.slot,
													name: a.name,
													quality: a.quality,
													icon: a.icon,
													hash: a.hash
												})}
											{/each}
										</div>
										<div
											class="mt-auto w-full border border-zinc-800 bg-[#0a0a0a] p-5 font-sans shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]"
										>
											<div
												class="mb-3 flex items-center justify-between border-b border-zinc-800 pb-3"
											>
												<span
													class="text-[10px] font-bold tracking-widest text-emerald-500 uppercase"
													>STATS</span
												>
												<div class="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"></div>
											</div>
											{#each Object.entries(playerData.loadout.stats) as [statName, statValue]}
												{@render fateStatRow({
													label: statName,
													value: statValue,
													bonus: playerData.loadout.bonuses[statName]
												})}
											{/each}
											<div
												class="mt-6 flex items-center justify-between border-t border-zinc-800 pt-3"
											>
												<span class="text-[8px] font-bold tracking-widest text-zinc-600 uppercase"
													>TOTAL RATING: {grandTotal}</span
												>
												<span
													class="text-[10px] font-bold tracking-tighter text-emerald-400 uppercase italic"
													>BUILD TIER {buildTier}</span
												>
											</div>
										</div>
									</div>
								</div>
							</div>
						{:else if profileTab === 'vault'}
							<div
								class="animate-in fade-in slide-in-from-bottom-2 mx-auto max-w-6xl space-y-10 duration-700"
							>
								<div>
									{@render engravedHeader({ text: 'PERSONAL_ARSENAL' })}
									<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
										{#if inventoryLoading}
											{#each Array(9) as _}
												<div class="h-20 animate-pulse border border-zinc-800 bg-zinc-900/20"></div>
											{/each}
										{:else if inventory?.weapons}
											{#each inventory.weapons as item}
												{@render inventoryItemCard({ item })}
											{/each}
										{:else}
											<div
												class="col-span-full py-20 text-center text-[10px] tracking-[0.3em] text-zinc-700 uppercase"
											>
												No inventory data loaded.
											</div>
										{/if}
									</div>
								</div>
								<div>
									{@render engravedHeader({ text: 'GUARD_PROTECTION' })}
									<div class="grid grid-cols-1 gap-4 opacity-60 md:grid-cols-2 lg:grid-cols-3">
										{#if inventory?.armor}
											{#each inventory.armor as item}
												{@render inventoryItemCard({ item })}
											{/each}
										{/if}
									</div>
								</div>
							</div>
						{/if}
					</div>
				{/key}
			</div>
		</main>
	</div>
</div>

<style>
	.stone-card {
		box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.5);
	}
	.sheen-overlay {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			135deg,
			rgba(255, 255, 255, 0.05) 0%,
			transparent 50%,
			rgba(255, 255, 255, 0.02) 100%
		);
		pointer-events: none;
	}
	.no-scrollbar::-webkit-scrollbar {
		display: none;
	}
	.no-scrollbar {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
</style>
