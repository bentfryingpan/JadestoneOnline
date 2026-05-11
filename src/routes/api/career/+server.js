import { json } from '@sveltejs/kit';
import { getActivityDef, getItemDef, getAllMedals } from '$lib/server/manifest.js';

const BUNGIE_ROOT = 'https://www.bungie.net';
const PGCR_ROOT   = 'https://stats.bungie.net';

import { BUNGIE_API_KEY } from '$env/static/private';
import { cacheGet, cacheSet } from '$lib/server/cache.js';

// ── Low-level Bungie GET ──────────────────────────────────────────────────────
async function bungieGet(url, root = BUNGIE_ROOT) {
    const res = await fetch(root + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
    return res.json();
}

// ── PGCR fetch (cached 24h — PGCRs are immutable) ────────────────────────────
async function fetchPgcr(instanceId) {
    const key    = `pgcr:${instanceId}`;
    const cached = cacheGet(key);
    if (cached !== undefined) return cached;
    try {
        const d = await bungieGet(
            `/Platform/Destiny2/Stats/PostGameCarnageReport/${instanceId}/`,
            PGCR_ROOT
        );
        const pgcr = d.Response ?? null;
        if (pgcr) cacheSet(key, pgcr, 86_400_000); // 24h — PGCRs never change
        return pgcr;
    } catch { return null; }
}

function gv(obj, key) {
    return obj?.[key]?.basic?.value ?? 0;
}

export async function GET({ url, setHeaders }) {
    setHeaders({ 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=60' });

    const membershipType = url.searchParams.get('membershipType');
    const membershipId   = url.searchParams.get('membershipId');
    const charId         = url.searchParams.get('charId');
    const count          = Math.min(parseInt(url.searchParams.get('count') ?? '50', 10), 250);

    if (!membershipType || !membershipId || !charId) {
        return json({ error: 'Missing params' }, { status: 400 });
    }

    // ── 1. Activity history ───────────────────────────────────────────────────
    // mode=63 = Gambit.  Fetch up to `count` completed matches.
    let activities = [];
    for (let page = 0; page < Math.ceil(count / 250); page++) {
        const data = await bungieGet(
            `/Platform/Destiny2/${membershipType}/Account/${membershipId}/Character/${charId}/Stats/Activities/?mode=63&count=${Math.min(count, 250)}&page=${page}`
        );
        if (data.ErrorCode !== 1) break;
        const batch = data.Response?.activities ?? [];
        activities.push(...batch);
        if (batch.length < 250 || activities.length >= count) break;
    }
    activities = activities.slice(0, count);

    if (!activities.length) {
        return json({ maps: [], weapons: [], allies: [], rivals: [], totalMatches: 0, matchesAnalyzed: 0 });
    }

    // ── 2. Resolve map names via manifest service (bulk, cached 24h) ──────────
    const uniqueRefIds = [...new Set(
        activities.map(a => a.activityDetails?.referenceId).filter(Boolean)
    )];
    // Warm the activity table once, then all lookups are in-memory
    await Promise.all(uniqueRefIds.map(h => getActivityDef(h)));

    // ── 3. Fetch PGCRs in parallel (batches of 10) ───────────────────────────
    const instanceIds = activities
        .map(a => a.activityDetails?.instanceId)
        .filter(Boolean);

    const BATCH_SIZE = 10;
    const pgcrResults = [];
    for (let i = 0; i < instanceIds.length; i += BATCH_SIZE) {
        const batch = instanceIds.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(batch.map(id => fetchPgcr(id)));
        pgcrResults.push(...results);
    }
    const pgcrMap = new Map(instanceIds.map((id, i) => [id, pgcrResults[i]]));

    // ── 4. Collect all unique weapon hashes, warm manifest in one shot ────────
    const allWeaponHashes = new Set();
    for (const pgcr of pgcrMap.values()) {
        if (!pgcr) continue;
        const entry = pgcr.entries?.find(e =>
            String(e.player?.destinyUserInfo?.membershipId) === String(membershipId)
        );
        for (const w of entry?.extended?.weapons ?? []) {
            if (w.referenceId) allWeaponHashes.add(w.referenceId);
        }
    }
    // Pre-warm item defs — getItemDef uses bulk-cached table internally
    await Promise.all([...allWeaponHashes].map(h => getItemDef(h)));

    // ── 5. Aggregate career stats ─────────────────────────────────────────────
    const mapsAgg    = {}; // mapName → { games, wins, losses, kills, deaths }
    const weaponsAgg = {}; // weaponName → { kills, precision, games, wins, icon, hash }
    const playersAgg = {}; // playerName → { games, wins, as_ally, as_enemy }

    let totalMatches = 0;
    let totalWins    = 0;
    let totalCarries = 0;
    let totalCarried = 0;

    for (const act of activities) {
        const instanceId = act.activityDetails?.instanceId;
        const refId      = act.activityDetails?.referenceId;
        const completed  = gv(act.values, 'completed');
        if (!completed) continue; // skip DNF

        const standing = gv(act.values, 'standing'); // 0 = win, 1 = loss
        const isWin    = standing === 0;

        // Map name from manifest (bulk table already cached)
        const actDef  = await getActivityDef(refId);
        let mapName   = actDef?.displayProperties?.name ?? 'Unknown';
        // Strip "Gambit: " / "Gambit - " prefix Bungie sometimes includes
        mapName = mapName.replace(/^Gambit[:\-]\s*/i, '').trim() || 'Gambit';

        // ── Map aggregation ──────────────────────────────────────────────────
        if (!mapsAgg[mapName]) mapsAgg[mapName] = { games: 0, wins: 0, losses: 0, kills: 0, deaths: 0 };
        mapsAgg[mapName].games++;
        if (isWin) mapsAgg[mapName].wins++; else mapsAgg[mapName].losses++;
        mapsAgg[mapName].kills  += gv(act.values, 'kills');
        mapsAgg[mapName].deaths += gv(act.values, 'deaths');

        totalMatches++;
        if (isWin) totalWins++;

        // ── PGCR-derived data ────────────────────────────────────────────────
        const pgcr = pgcrMap.get(instanceId);
        if (!pgcr) continue;

        // Find our entry in the PGCR
        const myEntry = pgcr.entries?.find(e =>
            String(e.player?.destinyUserInfo?.membershipId) === String(membershipId)
        );
        if (!myEntry) continue;

        const myTeamId = gv(myEntry.values, 'team');

        // ── Weapon aggregation (extended stats from PGCR) ────────────────────
        for (const w of myEntry.extended?.weapons ?? []) {
            const kills     = gv(w.values, 'uniqueWeaponKills');
            const precision = gv(w.values, 'uniqueWeaponPrecisionKills');
            if (kills <= 0) continue;

            // Manifest service returns from in-memory bulk table — no extra HTTP
            const wDef = await getItemDef(w.referenceId);
            const name = wDef?.displayProperties?.name ?? `Unknown (${w.referenceId})`;
            const icon = wDef?.displayProperties?.icon
                ? BUNGIE_ROOT + wDef.displayProperties.icon
                : null;
            const hash = w.referenceId;

            if (!weaponsAgg[name]) weaponsAgg[name] = { kills: 0, precision: 0, games: 0, wins: 0, icon, hash };
            weaponsAgg[name].kills     += kills;
            weaponsAgg[name].precision += precision;
            weaponsAgg[name].games++;
            if (isWin) weaponsAgg[name].wins++;
        }

        // ── Player / synergy aggregation ─────────────────────────────────────
        for (const e of pgcr.entries ?? []) {
            const eId = String(e.player?.destinyUserInfo?.membershipId ?? '');
            if (eId === String(membershipId)) continue; // skip self

            const eName    = e.player?.destinyUserInfo?.bungieGlobalDisplayName ?? '';
            const eCode    = e.player?.destinyUserInfo?.bungieGlobalDisplayNameCode ?? '';
            const fullName = eCode ? `${eName}#${String(eCode).padStart(4, '0')}` : eName;
            if (!fullName || fullName === '#0000') continue;

            const eTeamId    = gv(e.values, 'team');
            const isTeammate = eTeamId === myTeamId;

            if (!playersAgg[fullName]) {
                playersAgg[fullName] = {
                    games: 0, wins: 0, as_ally: 0, as_enemy: 0,
                    membershipId: eId,
                    membershipType: e.player?.destinyUserInfo?.membershipType ?? 0,
                };
            }
            playersAgg[fullName].games++;
            if (isWin) playersAgg[fullName].wins++;
            if (isTeammate) playersAgg[fullName].as_ally++;
            else            playersAgg[fullName].as_enemy++;
        }

        // ── Carry / carried detection ────────────────────────────────────────
        const myKills  = gv(myEntry.values, 'kills');
        const teammates = pgcr.entries?.filter(e => gv(e.values, 'team') === myTeamId) ?? [];
        const teamKills = teammates.reduce((s, e) => s + gv(e.values, 'kills'), 0);
        const teamAvg   = teamKills / Math.max(1, teammates.length);

        if (myKills > teamAvg * 1.5 && myKills > 10) totalCarries++;
        if (myKills < teamAvg * 0.4 && teamKills > 20) totalCarried++;
    }

    // ── 6. Sort and serialize ─────────────────────────────────────────────────

    // Maps: sort by games played desc
    const maps = Object.entries(mapsAgg)
        .map(([name, s]) => ({
            name,
            games:   s.games,
            wins:    s.wins,
            losses:  s.losses,
            winRate: s.games > 0 ? +((s.wins / s.games) * 100).toFixed(1) : 0,
            kd:      s.deaths > 0 ? +(s.kills / s.deaths).toFixed(2) : (s.kills || 0),
        }))
        .sort((a, b) => b.games - a.games);

    // Weapons: top 20 by kills
    const weapons = Object.entries(weaponsAgg)
        .map(([name, s]) => ({
            name,
            kills:    s.kills,
            precision: s.precision,
            games:    s.games,
            wins:     s.wins,
            winRate:  s.games > 0 ? +((s.wins / s.games) * 100).toFixed(1) : 0,
            precRate: s.kills > 0 ? +((s.precision / s.kills) * 100).toFixed(1) : 0,
            icon:     s.icon,
            hash:     s.hash,
        }))
        .sort((a, b) => b.kills - a.kills)
        .slice(0, 20);

    // Players: minimum 2 encounters; split allies vs rivals
    const allPlayers = Object.entries(playersAgg)
        .filter(([, s]) => s.games >= 2)
        .map(([name, s]) => ({
            name,
            games:         s.games,
            wins:          s.wins,
            winRate:       s.games > 0 ? +((s.wins / s.games) * 100).toFixed(1) : 0,
            as_ally:       s.as_ally,
            as_enemy:      s.as_enemy,
            membershipId:  s.membershipId,
            membershipType: s.membershipType,
        }))
        .sort((a, b) => b.games - a.games);

    // Best allies: appeared most as teammate
    const allies = allPlayers
        .filter(p => p.as_ally > p.as_enemy)
        .sort((a, b) => b.as_ally - a.as_ally)
        .slice(0, 10);

    // Frequent rivals: appeared most as enemy
    const rivals = allPlayers
        .filter(p => p.as_enemy > 0)
        .sort((a, b) => b.as_enemy - a.as_enemy)
        .slice(0, 10);

    const matchesAnalyzed = activities.filter(a => gv(a.values, 'completed')).length;

    return json({
        totalMatches,
        totalWins,
        totalCarries,
        totalCarried,
        winRate:         totalMatches > 0 ? +((totalWins / totalMatches) * 100).toFixed(1) : 0,
        maps,
        weapons,
        allies,
        rivals,
        matchesAnalyzed,
    });
}
