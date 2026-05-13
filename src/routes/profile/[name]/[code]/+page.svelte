<script>
	import { untrack } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { goto } from '$app/navigation';
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
		const newIds = ids.filter((id) => !attemptedEnrich.has(id));
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
		motes: 0,
		motesLost: 0,
		primevalDmg: 0,
		ability: 0,
		super: 0,
		blockers: 0,
		invKills: 0,
		invDeaths: 0,
		motesDenied: 0,
		armyOfOne: 0
	});

	$effect(() => {
		const db = data.dbTotals ?? {};
		const car = career?.totals ?? {};
		const medals = career?.medals ?? [];
		const aoo = medals.find((m) => m.key === 'armyOfOne')?.count ?? 0;

		// We use Math.max to ensure stats only ever go UP during a session refresh
		statsCache.entered = Math.max(
			statsCache.entered,
			career?.totalMatches || 0,
			dEntered || 0
		);
		statsCache.wins = Math.max(
			statsCache.wins,
			db.wins || 0,
			car.wins || 0,
			(career?.source === 'supabase' ? Math.round(career.totalMatches * (career.winRate / 100)) : 0),
			dWon || 0
		);
		statsCache.kills = Math.max(statsCache.kills, db.kills || 0, car.kills || 0, dKills || 0);
		statsCache.deaths = Math.max(statsCache.deaths, db.deaths || 0, car.deaths || 0, dDeaths || 0);
		statsCache.motes = Math.max(statsCache.motes, db.motes || 0, car.motes || 0, dMotes || 0);
		statsCache.motesLost = Math.max(
			statsCache.motesLost,
			db.motesLost || 0,
			car.motesLost || 0,
			dMotesLost || 0
		);
		statsCache.primevalDmg = Math.max(
			statsCache.primevalDmg,
			db.primevalDmg || 0,
			car.primevalDmg || 0,
			dPrimevalDmg || 0
		);

		statsCache.ability = Math.max(
			statsCache.ability,
			db.ability || 0,
			car.ability || 0,
			dMeleeKills + dGrenadeKills || 0
		);
		statsCache.super = Math.max(statsCache.super, db.super || 0, car.super || 0, dSuperKills || 0);
		statsCache.blockers = Math.max(
			statsCache.blockers,
			db.blockers || 0,
			car.blockers || 0,
			dSmallBlockers + dMediumBlockers + dLargeBlockers || 0
		);
		statsCache.invKills = Math.max(
			statsCache.invKills,
			db.invKills || 0,
			car.invKills || 0,
			dInvKills || 0
		);
		statsCache.invDeaths = Math.max(
			statsCache.invDeaths,
			db.invDeaths || 0,
			car.invDeaths || 0,
			dInvaderDeaths || 0
		);
		statsCache.motesDenied = Math.max(
			statsCache.motesDenied,
			db.motesDenied || 0,
			car.motesDenied || 0,
			dMotesDenied || 0
		);
		statsCache.armyOfOne = Math.max(statsCache.armyOfOne, parseInt(aoo) || 0);
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
		if (tab === 'pursuits' && !pursuits && !pursuitsLoading) {
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
	function sv(key) {
		return ls[key]?.basic?.value ?? 0;
	}

	const ltWon = $derived(sv('activitiesWon'));
	const ltKills = $derived(sv('kills'));
	const ltDeaths = $derived(sv('deaths'));
	const ltInvasions = $derived(sv('invasions'));
	const ltInvKills = $derived(sv('invasionKills'));
	const ltMotes = $derived(sv('motesBanked') || sv('motesDeposited'));
	const ltMotesLost = $derived(sv('motesLost'));
	const ltMotesDenied = $derived(sv('motesDenied'));
	const ltPrimevalDmg = $derived(sv('primevalDamage'));
	const ltSuperKills = $derived(sv('weaponKillsSuper') || sv('superKills'));
	const ltMeleeKills = $derived(sv('weaponKillsMelee'));
	const ltGrenadeKills = $derived(sv('weaponKillsGrenade'));
	const ltSmallBlockers = $derived(sv('smallBlockersSent'));
	const ltMediumBlockers = $derived(sv('mediumBlockersSent'));
	const ltLargeBlockers = $derived(sv('largeBlockersSent'));
	const ltInvaderDeaths = $derived(sv('invaderDeaths'));

	const seasonalTotal = $derived(
		seasonal?.seasons?.length > 0
			? seasonal.seasons.reduce(
					(acc, s) => {
						acc.activitiesEntered += s.activitiesEntered ?? 0;
						acc.wins += s.wins ?? 0;
						acc.kills += s.kills ?? 0;
						acc.deaths += s.deaths ?? 0;
						acc.motesDeposited += s.motesDeposited ?? 0;
						acc.motesLost += s.motesLost ?? 0;
						acc.motesDenied += s.motesDenied ?? 0;
						acc.invasionKills += s.invasionKills ?? 0;
						acc.invaderDeaths += s.invaderDeaths ?? 0;
						acc.primevalDamage += s.primevalDamage ?? 0;
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
						motesDeposited: 0,
						motesLost: 0,
						motesDenied: 0,
						invasionKills: 0,
						invaderDeaths: 0,
						primevalDamage: 0,
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
			const wins =
				career?.source === 'supabase'
					? career.totalMatches * (career.winRate / 100)
					: (seasonalTotal?.wins ?? ltWon);
			const kills = seasonalTotal?.kills ?? ltKills;
			const inv = seasonalTotal?.invasionKills ?? ltInvKills;
			const motes =
				career?.source === 'supabase'
					? career.totalMatches * career.avgMotes
					: (seasonalTotal?.motesDeposited ?? ltMotes);
			const denied = seasonalTotal?.motesDenied ?? ltMotesDenied;
			return Math.floor(wins * 15 + kills * 0.3 + inv * 5 + motes * 0.1 + denied * 2);
		})()
	);

	const dEntered = $derived(
		seasonFilter === 'all'
			? (seasonalTotal?.activitiesEntered ?? sv('activitiesEntered'))
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.activitiesEntered ?? 0)
	);
	const dWon = $derived(
		seasonFilter === 'all'
			? (seasonalTotal?.wins ?? ltWon)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.wins ?? 0)
	);
	const dKills = $derived(
		seasonFilter === 'all'
			? (seasonalTotal?.kills ?? ltKills)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.kills ?? 0)
	);
	const dDeaths = $derived(
		seasonFilter === 'all'
			? (seasonalTotal?.deaths ?? ltDeaths)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.deaths ?? 0)
	);
	const dMotes = $derived(
		seasonFilter === 'all'
			? (seasonalTotal?.motesDeposited ?? ltMotes)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.motesDeposited ?? 0)
	);
	const dMotesLost = $derived(
		seasonFilter === 'all'
			? (seasonalTotal?.motesLost ?? ltMotesLost)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.motesLost ?? 0)
	);
	const dMotesDenied = $derived(
		seasonFilter === 'all'
			? (seasonalTotal?.motesDenied ?? ltMotesDenied)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.motesDenied ?? 0)
	);
	const dInvKills = $derived(
		seasonFilter === 'all'
			? (seasonalTotal?.invasionKills ?? ltInvKills)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.invasionKills ?? 0)
	);
	const dPrimevalDmg = $derived(
		seasonFilter === 'all'
			? (seasonalTotal?.primevalDamage ?? ltPrimevalDmg)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.primevalDamage ?? 0)
	);
	const dSuperKills = $derived(
		seasonFilter === 'all'
			? (seasonalTotal?.superKills ?? ltSuperKills)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.superKills ?? 0)
	);
	const dMeleeKills = $derived(
		seasonFilter === 'all'
			? (seasonalTotal?.meleeKills ?? ltMeleeKills)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.meleeKills ?? 0)
	);
	const dGrenadeKills = $derived(
		seasonFilter === 'all'
			? (seasonalTotal?.grenadeKills ?? ltGrenadeKills)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.grenadeKills ?? 0)
	);
	const dSmallBlockers = $derived(
		seasonFilter === 'all'
			? (seasonalTotal?.smallBlockersSent ?? ltSmallBlockers)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.smallBlockersSent ?? 0)
	);
	const dMediumBlockers = $derived(
		seasonFilter === 'all'
			? (seasonalTotal?.mediumBlockersSent ?? ltMediumBlockers)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.mediumBlockersSent ?? 0)
	);
	const dLargeBlockers = $derived(
		seasonFilter === 'all'
			? (seasonalTotal?.largeBlockersSent ?? ltLargeBlockers)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.largeBlockersSent ?? 0)
	);
	const dInvaderDeaths = $derived(
		seasonFilter === 'all'
			? (seasonalTotal?.invaderDeaths ?? ltInvaderDeaths)
			: (seasonal?.seasons?.find((s) => s.season === seasonFilter)?.invaderDeaths ?? 0)
	);

	const dWinRate = $derived(dEntered > 0 ? (dWon / dEntered) * 100 : null);
	const dKD = $derived(dDeaths > 0 ? dKills / dDeaths : null);
	const dAvgMotes = $derived(dEntered > 0 ? dMotes / dEntered : 0);

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

	const matchesList = $derived(
		(history?.matches ?? []).map((m) => ({
			instanceId: m.instanceId,
			result: m.win ? 'WIN' : 'LOSS',
			mode: 'Gambit',
			map: m.mapName,
			kd: m.kd,
			invKills: m.stats_json?.invasionKills ?? 0,
			invDeaths: m.stats_json?.invaderDeaths ?? 0,
			motes: m.motesDeposited,
			damage: m.primevalDamage,
			date: m.period ? timeAgo(m.period) : '',
			isEnriched: m.isEnriched
		}))
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
				statsCache.entered > 0 ? fmtF(statsCache.motes / statsCache.entered, 1) : career?.source === 'supabase' ? career.avgMotes : '—',
			dps: statsCache.entered > 0 && statsCache.primevalDmg > 0 ? fmt(Math.round(statsCache.primevalDmg / statsCache.entered)) : '—',
			combat: {
				total: fmt(statsCache.kills),
				precision: statsCache.kills + statsCache.deaths > 0 ? fmtF((statsCache.kills / (statsCache.kills + statsCache.deaths)) * 100, 1) + '%' : '—',
				ability: fmt(statsCache.ability),
				super: fmt(statsCache.super)
			},
			objectives: {
				deposited: fmt(statsCache.motes),
				lost: fmt(statsCache.motesLost),
				denied: fmt(statsCache.motesDenied),
				blockers: fmt(statsCache.blockers),
				healed: '—'
			},
			invasion: {
				guardians: fmt(statsCache.invKills),
				armyOfOne: fmt(statsCache.armyOfOne),
				motesDenied: fmt(statsCache.motesDenied),
				invaderDeaths: fmt(statsCache.invDeaths),
				invasions: '—',
				shutDown: '—'
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
							<div class="animate-in fade-in space-y-4 duration-700">
								<div class="relative border-b border-zinc-800/50 pb-2">
									{@render ghostLabel({ text: 'SEASONAL HISTORY' })}
									<div
										bind:this={scrollRef}
										onwheel={handleWheel}
										class="no-scrollbar flex cursor-grab gap-1 overflow-x-auto scroll-smooth py-1 active:cursor-grabbing"
									>
										{#each seasons as s}
											<button
												onclick={() => (seasonFilter = s.id)}
												class="relative flex-shrink-0 overflow-hidden border border-zinc-800/50 px-5 py-2 font-sans text-[9px] tracking-[0.2em] uppercase transition-all {seasonFilter ===
												s.id
													? 'border-zinc-700 bg-zinc-900 font-bold text-emerald-400'
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
								<div class="grid grid-cols-4 gap-4">
									<div
										class="relative border border-zinc-800 bg-[#111111] p-3 shadow-[inset_0_0_30px_rgba(0,0,0,0.5)]"
									>
										<div class="flex items-center justify-between gap-4">
											<div class="flex flex-col">
												<span
													class="font-sans text-[8px] font-bold tracking-[0.2em] text-zinc-500 uppercase"
													>Win Ratio</span
												>
												<div class="flex items-baseline gap-1.5">
													<span
														class="font-sans text-2xl font-light tracking-tighter text-white italic"
														>{playerData.overview.winRatio}</span
													>
												</div>
											</div>
											<div class="text-right">
												<p
													class="font-sans text-[8px] font-bold tracking-widest text-zinc-700 uppercase"
												>
													{playerData.overview.wins} Wins
												</p>
											</div>
										</div>
									</div>
									<div
										class="relative border border-zinc-800 bg-[#111111] p-3 shadow-[inset_0_0_30px_rgba(0,0,0,0.5)]"
									>
										<div class="flex items-center justify-between gap-4">
											<div class="flex flex-col">
												<span
													class="font-sans text-[8px] font-bold tracking-[0.2em] text-zinc-500 uppercase"
													>K/D/A</span
												>
												<div class="flex items-baseline gap-1.5">
													<span
														class="font-sans text-2xl font-light tracking-tighter text-white italic"
														>{playerData.overview.kd}</span
													>
												</div>
											</div>
											<div class="text-right">
												<p
													class="font-sans text-[8px] font-bold tracking-widest text-zinc-700 uppercase"
												>
													{playerData.overview.kills} Kills
												</p>
											</div>
										</div>
									</div>
									<div
										class="relative border border-zinc-800 bg-[#111111] p-3 shadow-[inset_0_0_30px_rgba(0,0,0,0.5)]"
									>
										<div class="flex items-center justify-between gap-4">
											<div class="flex flex-col">
												<span
													class="font-sans text-[8px] font-bold tracking-[0.2em] text-zinc-500 uppercase"
													>Motes Avg</span
												>
												<div class="flex items-baseline gap-1.5">
													<span
														class="font-sans text-2xl font-light tracking-tighter text-emerald-400 italic"
														>{playerData.overview.motesAvg}</span
													>
												</div>
											</div>
											<div class="text-right">
												<p
													class="font-sans text-[8px] font-bold tracking-widest text-zinc-700 uppercase"
												>
													Top 1%
												</p>
											</div>
										</div>
									</div>
									<div
										class="stone-card group relative border border-zinc-800 bg-gradient-to-br from-[#111111] to-[#0a0a0a] p-3 shadow-[inset_0_0_30px_rgba(0,0,0,0.5)]"
									>
										<div class="sheen-overlay"></div>
										{@render ghostLabel({ text: 'Primeval DPS', className: 'text-[8px]' })}
										<div class="relative z-10 mt-1 flex w-full items-baseline gap-2 font-sans">
											<span class="text-2xl font-light tracking-tighter text-amber-500 italic"
												>{playerData.overview.dps}</span
											>
											<div class="relative bottom-1 h-[1px] flex-1 bg-zinc-800">
												<div
													class="h-full w-[75%] bg-amber-600 shadow-[0_0_8px_rgba(217,119,6,0.3)]"
												></div>
											</div>
										</div>
									</div>
								</div>
								<div class="grid grid-cols-3 gap-6">
									{@render stoneCard({ title: 'Combat', compact: true }, combatContent)}
									{@render stoneCard({ title: 'Objectives', compact: true }, objectivesContent)}
									{@render stoneCard(
										{ title: 'Invasion', compact: true, className: 'border-rose-900/10' },
										invasionContent
									)}
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
										class="group relative block flex items-center gap-6 border border-zinc-800 bg-[#0c0c0c] p-3 font-sans no-underline transition-all hover:border-emerald-500/50"
									>
										<div
											class="absolute top-1/2 left-0 h-10 w-1 -translate-y-1/2 {m.result === 'WIN'
												? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]'
												: 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]'}"
										></div>
										<div class="w-12 text-center">
											<p
												class="text-xs font-black italic {m.result === 'WIN'
													? 'text-emerald-500'
													: 'text-rose-500'}"
											>
												{m.result}
											</p>
										</div>
										<div class="flex-1">
											<p class="font-sans text-[10px] tracking-widest text-zinc-300 uppercase">
												{m.mode}
											</p>
											<p class="text-sm font-bold text-zinc-100 uppercase">{m.map}</p>
										</div>
										<div class="grid grid-cols-3 gap-8 border-x border-zinc-800/50 px-6">
											<div>
												<p class="font-sans text-[8px] tracking-widest text-zinc-600 uppercase">
													Invasion
												</p>
												<p class="text-xs font-bold text-rose-500">{m.invKills} / {m.invDeaths}</p>
											</div>
											<div>
												<p class="font-sans text-[8px] tracking-widest text-zinc-600 uppercase">
													Motes
												</p>
												<p class="text-xs font-bold text-zinc-100">{m.motes}</p>
											</div>
											<div>
												<p class="font-sans text-[8px] tracking-widest text-zinc-600 uppercase">
													Damage
												</p>
												<p class="text-xs font-bold text-amber-500">{m.damage}</p>
											</div>
										</div>
										<div class="w-20 text-right">
											<p class="font-sans text-[9px] text-zinc-700 uppercase">{m.date}</p>
										</div>
										{#if m.isEnriched}
											<div
												class="flex h-4 w-4 rotate-45 items-center justify-center border border-emerald-500 bg-emerald-500/10"
											>
												<div class="h-1.5 w-1.5 bg-emerald-500"></div>
											</div>
										{/if}
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
