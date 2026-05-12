/**
 * /api/career — Career stats from Supabase player_matches (PGCR-enriched data).
 *
 * When player_matches has data it's used directly — fast and complete.
 * Falls back to activity-history + PGCR path for new users who haven't enriched yet.
 *
 * Query params: membershipType, membershipId, charIds (comma-sep), count (default 250)
 * Returns: { maps, weapons, allies, rivals, totalMatches, totalWins, carries, carried,
 *            playstyle, medals, hourlyStats, classStats }
 */

import { json } from '@sveltejs/kit';
import { BUNGIE_API_KEY } from '$env/static/private';
import { getActivityDef } from '$lib/server/manifest.js';
import { cacheGet, cacheSet } from '$lib/server/cache.js';
import { supabaseAdmin } from '$lib/supabase-server.js';

const CAREER_TTL = 120_000; // 2 min — refreshes as new matches are enriched

// ── Playstyle scoring — exact from desktop app get_dominant_playstyle() ─────
function computePlaystyle(matches) {
    let reaper = 0, collector = 0, invader = 0, sentry = 0;
    for (const m of matches) {
        const s = m.stats ?? {};
        const med = s.medals ?? {};
        reaper    += (s.mobKills ?? 0) * 0.5
            + (med.massacre ?? 0) * 10 + (med.overkillmonger ?? 0) * 8
            + (med.killmonger ?? 0) * 4 + (med.thrillmonger ?? 0) * 2
            + (med.bigGameHunter ?? 0) * 3;
        collector += (s.motesDeposited ?? 0) * 1.0
            + (med.halfBanked ?? 0) * 15 + (med.fastFill ?? 0) * 5
            + (med.firstToBlock ?? 0) * 5;
        invader   += (s.invasionKills ?? 0) * 4.0 + (s.motesDenied ?? 0) * 2.0
            + (med.armyOfOne ?? 0) * 15 + (med.motesHaveBeen ?? 0) * 10;
        sentry    += (med.noEscape ?? 0) * 5
            + (med.notOnMyWatch ?? 0) * 15 + (med.locksmith ?? 0) * 8
            + (med.blockbuster ?? 0) * 8 + (med.rapidPayback ?? 0) * 10
            + (med.payback ?? 0) * 5;
    }
    const total = Math.max(1, reaper + collector + invader + sentry);
    const scores = [
        { label: 'Reaper',    score: reaper    / total, color: 'text-red-400' },
        { label: 'Collector', score: collector / total, color: 'text-amber-400' },
        { label: 'Invader',   score: invader   / total, color: 'text-purple-400' },
        { label: 'Sentry',    score: sentry    / total, color: 'text-blue-400' },
    ];
    const dominant = scores.reduce((a, b) => a.score > b.score ? a : b);
    return { dominant: dominant.label, color: dominant.color, breakdown: scores.map(s => ({ ...s, pct: +(s.score * 100).toFixed(1) })) };
}

// ── Supabase career computation ───────────────────────────────────────────────
async function careerFromSupabase(membershipId, count) {
    const { data: rows, error } = await supabaseAdmin
        .from('player_matches')
        .select('pgcr_id,map_name,map_image,period,outcome,ego_score,ego_base,ego_pem,mote_eff,kd,fireteam_size,is_hard_carry,is_carried,stats,components,roster')
        .eq('player_id', parseInt(membershipId))
        .not('outcome', 'eq', 'DNF')
        .order('period', { ascending: false })
        .limit(count);

    if (error || !rows?.length) return null;

    const mapsAgg    = {};
    const weaponsAgg = {};
    const playersAgg = {};
    const medalsAgg  = {};
    const hourlyAgg  = Array.from({ length: 24 }, (_, h) => ({ hour: h, games: 0, wins: 0, scoreSum: 0 }));
    const classAgg   = { Titan: null, Hunter: null, Warlock: null };

    let totalMatches = 0, totalWins = 0, carries = 0, carried = 0;
    let totalScore = 0;
    let totalKills = 0, totalDeaths = 0;

    for (const row of rows) {
        const isWin = row.outcome === 'Win';
        const stats = row.stats ?? {};
        const medals = stats.medals ?? {};
        const mapName = row.map_name ?? 'Gambit';
        const score = row.ego_score ?? 0;
        const kills  = (stats.mobKills ?? 0) + (stats.invasionKills ?? 0);
        const deaths = stats.deaths ?? 0;
        totalMatches++;
        if (isWin) totalWins++;
        if (row.is_hard_carry) carries++;
        if (row.is_carried) carried++;
        totalScore += score;
        totalKills  += kills;
        totalDeaths += deaths;

        // Map stats
        if (!mapsAgg[mapName]) mapsAgg[mapName] = { games: 0, wins: 0, scoreSum: 0, kills: 0, deaths: 0, map_image: row.map_image ?? null };
        mapsAgg[mapName].games++;
        if (isWin) mapsAgg[mapName].wins++;
        mapsAgg[mapName].scoreSum += score;
        mapsAgg[mapName].kills    += kills;
        mapsAgg[mapName].deaths   += deaths;
        // Prefer non-null image (any match for this map may have it)
        if (!mapsAgg[mapName].map_image && row.map_image) mapsAgg[mapName].map_image = row.map_image;

        // Weapon synergy
        for (const w of stats.top_weapons ?? []) {
            const wn = w.name ?? 'Unknown';
            if (!weaponsAgg[wn]) weaponsAgg[wn] = { games: 0, wins: 0, kills: 0, precision: 0, scoreSum: 0, icon: w.icon ?? null, hash: w.hash ?? null };
            weaponsAgg[wn].games++;
            weaponsAgg[wn].kills     += w.kills     ?? 0;
            weaponsAgg[wn].precision += w.precision ?? 0;
            if (isWin) weaponsAgg[wn].wins++;
            weaponsAgg[wn].scoreSum += score;
        }

        // Teammates & rivals
        const myTeam = (row.roster ?? []).find(r => r.is_target)?.team;
        for (const p of row.roster ?? []) {
            if (p.is_target) continue;
            const key = p.code ? `${p.name}#${p.code}` : p.name;
            if (!key || key === 'Unknown') continue;
            const isTeammate = p.team === myTeam;
            if (!playersAgg[key]) playersAgg[key] = { games: 0, wins: 0, as_ally: 0, as_enemy: 0, className: p.className ?? 'Unknown' };
            playersAgg[key].games++;
            if (isWin) playersAgg[key].wins++;
            if (isTeammate) playersAgg[key].as_ally++; else playersAgg[key].as_enemy++;
        }

        // Medals
        for (const [key, count] of Object.entries(medals)) {
            medalsAgg[key] = (medalsAgg[key] ?? 0) + count;
        }

        // Class stats
        const className = (row.stats?.className) ?? null;
        if (className && className in classAgg) {
            if (!classAgg[className]) classAgg[className] = { games: 0, wins: 0, scoreSum: 0 };
            classAgg[className].games++;
            if (isWin) classAgg[className].wins++;
            classAgg[className].scoreSum += score;
        }

        // Hourly stats
        if (row.period) {
            const h = new Date(row.period).getHours();
            hourlyAgg[h].games++;
            if (isWin) hourlyAgg[h].wins++;
            hourlyAgg[h].scoreSum += score;
        }

        // Carry/carried flags already stored by pgcr-enrich in is_hard_carry / is_carried
    }

    const maps = Object.entries(mapsAgg)
        .map(([name, s]) => ({
            name,
            games:     s.games,
            wins:      s.wins,
            losses:    s.games - s.wins,
            winRate:   s.games  > 0 ? +((s.wins   / s.games)  * 100).toFixed(1) : 0,
            avgScore:  s.games  > 0 ? +(s.scoreSum / s.games).toFixed(1)         : 0,
            kd:        s.deaths > 0 ? +(s.kills    / s.deaths).toFixed(2)        : s.kills > 0 ? s.kills : 0,
            map_image: s.map_image ?? null,
        }))
        .sort((a, b) => b.games - a.games);

    const weapons = Object.entries(weaponsAgg)
        .map(([name, s]) => ({
            name, games: s.games, wins: s.wins, kills: s.kills,
            precRate: s.kills > 0 ? +((s.precision / s.kills) * 100).toFixed(1) : 0,
            winRate:  s.games > 0 ? +((s.wins / s.games) * 100).toFixed(1) : 0,
            avgScore: s.games > 0 ? +(s.scoreSum / s.games).toFixed(1) : 0,
            icon: s.icon, hash: s.hash,
        }))
        .sort((a, b) => b.kills - a.kills)   // sort by total kills
        .slice(0, 20);

    const allPlayers = Object.entries(playersAgg)
        .filter(([, s]) => s.games >= 2)
        .map(([name, s]) => ({
            name, games: s.games, wins: s.wins,
            winRate: s.games > 0 ? +((s.wins / s.games) * 100).toFixed(1) : 0,
            as_ally: s.as_ally, as_enemy: s.as_enemy, className: s.className,
        }));

    const allies = allPlayers.filter(p => p.as_ally > p.as_enemy)
        .sort((a, b) => b.as_ally - a.as_ally).slice(0, 15);
    const rivals = allPlayers.filter(p => p.as_enemy >= p.as_ally && p.as_enemy > 0)
        .sort((a, b) => b.as_enemy - a.as_enemy).slice(0, 15);

    const bestAlly = allies.find(p => p.winRate >= 50) ?? allies[0] ?? null;
    const nemesis  = rivals.sort((a, b) => a.winRate - b.winRate)[0] ?? null;

    const medals = Object.entries(medalsAgg)
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count);

    const hourlyStats = hourlyAgg.map(h => ({
        ...h,
        winRate: h.games > 0 ? +((h.wins / h.games) * 100).toFixed(1) : 0,
        avgScore: h.games > 0 ? +(h.scoreSum / h.games).toFixed(1) : 0,
    }));

    const classStats = Object.entries(classAgg).map(([cls, s]) => ({
        className: cls,
        games: s?.games ?? 0,
        wins: s?.wins ?? 0,
        winRate: s?.games > 0 ? +((s.wins / s.games) * 100).toFixed(1) : 0,
        avgScore: s?.games > 0 ? +(s.scoreSum / s.games).toFixed(1) : 0,
    }));

    const playstyle = computePlaystyle(rows);

    const overallKd = totalDeaths > 0 ? +(totalKills / totalDeaths).toFixed(2) : totalKills;

    return {
        source: 'supabase',
        totalMatches, totalWins, carries, carried,
        avgScore:    totalMatches > 0 ? +(totalScore  / totalMatches).toFixed(1)        : 0,
        winRate:     totalMatches > 0 ? +((totalWins  / totalMatches) * 100).toFixed(1) : 0,
        kd:          overallKd,
        carryPct:    totalMatches > 0 ? +((carries    / totalMatches) * 100).toFixed(1) : 0,
        carriedPct:  totalMatches > 0 ? +((carried    / totalMatches) * 100).toFixed(1) : 0,
        maps, weapons, allies, rivals, bestAlly, nemesis,
        medals, hourlyStats, classStats, playstyle,
        matchesAnalyzed: totalMatches,
    };
}

export async function GET({ url, setHeaders }) {
    setHeaders({ 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' });

    const membershipId   = url.searchParams.get('membershipId');
    const membershipType = url.searchParams.get('membershipType');
    const charIdsParam   = url.searchParams.get('charIds') ?? '';
    const count          = Math.min(parseInt(url.searchParams.get('count') ?? '250', 10), 10_000);

    if (!membershipId) return json({ error: 'Missing membershipId' }, { status: 400 });

    const cacheKey = `career:${membershipId}:${count}`;
    const cached = cacheGet(cacheKey);
    if (cached) return json(cached);

    // ── Try Supabase first ────────────────────────────────────────────────────
    try {
        const result = await careerFromSupabase(membershipId, count);
        if (result && result.totalMatches > 0) {
            cacheSet(cacheKey, result, CAREER_TTL);
            return json(result);
        }
    } catch (e) {
        console.warn('Career Supabase error:', e.message);
    }

    // ── Fallback: light career from activity history (no PGCRs) ──────────────
    // This runs for new users who haven't triggered PGCR enrichment yet.
    const charIds = charIdsParam.split(',').map(s => s.trim()).filter(Boolean);
    if (!membershipType || !charIds.length) {
        return json({ source: 'none', totalMatches: 0, maps: [], weapons: [], allies: [], rivals: [], medals: [], hourlyStats: [], classStats: [], playstyle: null, matchesAnalyzed: 0 });
    }

    try {
        // Pull 250 matches from activity history across all chars
        const perChar = await Promise.all(charIds.map(async charId => {
            const res = await fetch(
                `https://www.bungie.net/Platform/Destiny2/${membershipType}/Account/${membershipId}/Character/${charId}/Stats/Activities/?mode=63&count=250&page=0`,
                { headers: { 'X-API-Key': BUNGIE_API_KEY } }
            );
            const d = await res.json();
            return d.ErrorCode === 1 ? (d.Response?.activities ?? []) : [];
        }));

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

        // Build lightweight career stats from activity history only
        function nv(entry, key) {
            return entry?.extended?.values?.[key]?.basic?.value
                ?? entry?.values?.[key]?.basic?.value ?? 0;
        }

        const mapsAgg = {};
        const hourlyAgg = Array.from({ length: 24 }, (_, h) => ({ hour: h, games: 0, wins: 0, scoreSum: 0 }));
        let totalMatches = 0, totalWins = 0;

        for (const act of slice) {
            if (nv(act, 'completed') !== 1) continue;
            const isWin = nv(act, 'standing') === 0;
            totalMatches++;
            if (isWin) totalWins++;

            const refId = act.activityDetails?.referenceId;
            let mapName = 'Gambit';
            if (refId) {
                const def = await getActivityDef(refId);
                mapName = (def?.displayProperties?.name ?? 'Gambit')
                    .replace(/^Gambit[:\-]\s*/i, '').trim() || 'Gambit';
            }
            if (!mapsAgg[mapName]) mapsAgg[mapName] = { games: 0, wins: 0 };
            mapsAgg[mapName].games++;
            if (isWin) mapsAgg[mapName].wins++;

            if (act.period) {
                const h = new Date(act.period).getHours();
                hourlyAgg[h].games++;
                if (isWin) hourlyAgg[h].wins++;
            }
        }

        const maps = Object.entries(mapsAgg)
            .map(([name, s]) => ({ name, games: s.games, wins: s.wins, winRate: s.games > 0 ? +((s.wins / s.games) * 100).toFixed(1) : 0, avgScore: 0 }))
            .sort((a, b) => b.games - a.games);

        const hourlyStats = hourlyAgg.map(h => ({
            ...h, winRate: h.games > 0 ? +((h.wins / h.games) * 100).toFixed(1) : 0, avgScore: 0,
        }));

        const result = {
            source: 'activity',
            totalMatches, totalWins, carries: 0, carried: 0,
            winRate: totalMatches > 0 ? +((totalWins / totalMatches) * 100).toFixed(1) : 0,
            avgScore: 0, carryPct: 0, carriedPct: 0,
            maps, weapons: [], allies: [], rivals: [], bestAlly: null, nemesis: null,
            medals: [], hourlyStats, classStats: [], playstyle: null,
            matchesAnalyzed: totalMatches,
            needsEnrichment: true, // tells client to trigger pgcr-enrich
        };
        if (result.totalMatches > 0) cacheSet(cacheKey, result, CAREER_TTL);
        return json(result);
    } catch (e) {
        return json({ error: e.message, source: 'error', totalMatches: 0, maps: [], weapons: [], allies: [], rivals: [], medals: [], hourlyStats: [], classStats: [], playstyle: null, matchesAnalyzed: 0 });
    }
}
