/**
 * /api/career — Career stats from Supabase player_matches (PGCR-enriched data).
 */

import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabase-server.js';

export async function GET({ url }) {
    const membershipId = url.searchParams.get('membershipId');
    const count        = Math.min(parseInt(url.searchParams.get('count') ?? '250', 10), 1000);

    if (!membershipId) return json({ error: 'Missing membershipId' }, { status: 400 });

    try {
        const result = await careerFromSupabase(membershipId, count);
        if (!result) {
            return json({ 
                source: 'empty', totalMatches: 0, maps: [], weapons: [], allies: [], rivals: [], 
                medals: [], hourlyStats: [], classStats: [], playstyle: null, matchesAnalyzed: 0,
                needsEnrichment: true
            });
        }
        return json(result);
    } catch (e) {
        return json({ error: e.message, source: 'error', totalMatches: 0, maps: [], weapons: [], allies: [], rivals: [], medals: [], hourlyStats: [], classStats: [], playstyle: null, matchesAnalyzed: 0 });
    }
}

async function careerFromSupabase(membershipId, count) {
    const { data: rows, error } = await supabaseAdmin
        .from('player_matches')
        .select('pgcr_id,map_name,map_image,period,outcome,ego_score,is_hard_carry,is_carried,stats,roster')
        .eq('player_id', membershipId)
        .not('outcome', 'eq', 'DNF')
        .order('period', { ascending: false })
        .limit(count);

    if (error || !rows?.length) return null;

    const mapsAgg    = {};
    const weaponsAgg = {};
    const playersAgg = {};
    const medalsAgg  = {};
    const hourlyAgg  = Array.from({ length: 24 }, (_, h) => ({ hour: h, games: 0, wins: 0, scoreSum: 0 }));
    const classAgg   = { Titan: { games: 0, wins: 0, scoreSum: 0 }, Hunter: { games: 0, wins: 0, scoreSum: 0 }, Warlock: { games: 0, wins: 0, scoreSum: 0 } };

    let totalMatches = 0, totalWins = 0, carries = 0, carried = 0;
    let totalScore = 0;

    for (const row of rows) {
        const isWin = row.outcome === 'Win';
        const stats = row.stats ?? {};
        const medals = stats.medals ?? {};
        const mapName = row.map_name ?? 'Gambit';
        const score = row.ego_score ?? 0;
        
        totalMatches++;
        if (isWin) totalWins++;
        if (row.is_hard_carry) carries++;
        if (row.is_carried) carried++;
        totalScore += score;

        // Map stats
        if (!mapsAgg[mapName]) mapsAgg[mapName] = { games: 0, wins: 0, scoreSum: 0, map_image: row.map_image ?? null };
        mapsAgg[mapName].games++;
        if (isWin) mapsAgg[mapName].wins++;
        mapsAgg[mapName].scoreSum += score;
        if (!mapsAgg[mapName].map_image && row.map_image) mapsAgg[mapName].map_image = row.map_image;

        // Weapons
        for (const w of stats.top_weapons ?? []) {
            const wn = w.name ?? 'Unknown';
            if (!weaponsAgg[wn]) weaponsAgg[wn] = { games: 0, wins: 0, kills: 0, precision: 0, scoreSum: 0, icon: w.icon ?? null, hash: w.hash ?? null, slot: w.slot ?? 'Unknown' };
            weaponsAgg[wn].games++;
            weaponsAgg[wn].kills     += w.kills     ?? 0;
            weaponsAgg[wn].precision += w.precision ?? 0;
            if (isWin) weaponsAgg[wn].wins++;
            weaponsAgg[wn].scoreSum += score;
        }

        // Players (Teammates & Rivals)
        const roster = row.roster ?? [];
        const myEntry = roster.find(r => r.is_target);
        const myTeam  = myEntry?.team;
        
        for (const p of roster) {
            if (p.is_target) continue;
            // Handle potentially corrupted IDs in roster by using name+code as fallback key
            const key = p.id || `${p.name}#${p.code}`;
            if (!key) continue;
            
            if (!playersAgg[key]) {
                playersAgg[key] = { 
                    name: p.name, code: p.code, games: 0, wins: 0, 
                    as_ally: 0, ally_wins: 0, 
                    as_enemy: 0, enemy_wins: 0, 
                    className: p.className ?? 'Unknown' 
                };
            }
            const pa = playersAgg[key];
            pa.games++;
            if (isWin) pa.wins++;
            
            if (p.team === myTeam) {
                pa.as_ally++;
                if (isWin) pa.ally_wins++;
            } else {
                pa.as_enemy++;
                if (isWin) pa.enemy_wins++;
            }
        }

        // Medals
        for (const [key, count] of Object.entries(medals)) {
            medalsAgg[key] = (medalsAgg[key] ?? 0) + count;
        }

        // Class stats
        const className = stats.className;
        if (className && classAgg[className]) {
            classAgg[className].games++;
            if (isWin) classAgg[className].wins++;
            classAgg[className].scoreSum += score;
        }

        // Hourly
        if (row.period) {
            const h = new Date(row.period).getHours();
            hourlyAgg[h].games++;
            if (isWin) hourlyAgg[h].wins++;
            hourlyAgg[h].scoreSum += score;
        }
    }

    const maps = Object.entries(mapsAgg)
        .map(([name, s]) => ({
            name,
            games:     s.games,
            wins:      s.wins,
            losses:    s.games - s.wins,
            winRate:   +((s.wins / s.games) * 100).toFixed(1),
            avgScore:  +(s.scoreSum / s.games).toFixed(1),
            map_image: s.map_image
        }))
        .sort((a, b) => b.games - a.games);

    const weapons = Object.entries(weaponsAgg)
        .map(([name, s]) => ({
            name, games: s.games, wins: s.wins, kills: s.kills,
            precRate: s.kills > 0 ? +((s.precision / s.kills) * 100).toFixed(1) : 0,
            winRate:  +((s.wins / s.games) * 100).toFixed(1),
            avgScore: +(s.scoreSum / s.games).toFixed(1),
            icon: s.icon, hash: s.hash, slot: s.slot
        }))
        .sort((a, b) => b.kills - a.kills);

    const players = Object.values(playersAgg);
    const allies = players
        .filter(p => p.as_ally >= 1)
        .map(p => ({
            id: p.id, name: p.name, code: p.code, games: p.as_ally,
            winRate: +((p.ally_wins / p.as_ally) * 100).toFixed(1)
        }))
        .sort((a, b) => b.games - a.games)
        .slice(0, 10);

    const rivals = players
        .filter(p => p.as_enemy >= 1)
        .map(p => ({
            id: p.id, name: p.name, code: p.code, games: p.as_enemy,
            winRate: +((p.enemy_wins / p.as_enemy) * 100).toFixed(1) 
        }))
        .sort((a, b) => b.games - a.games)
        .slice(0, 10);

    const medals = Object.entries(medalsAgg)
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count);

    return {
        source: 'supabase',
        totalMatches,
        matchesAnalyzed: totalMatches,
        avgScore: totalMatches > 0 ? +(totalScore / totalMatches).toFixed(1) : 0,
        winRate:  totalMatches > 0 ? +((totalWins / totalMatches) * 100).toFixed(1) : 0,
        carries,
        carried,
        maps,
        weapons,
        allies,
        rivals,
        medals,
        hourlyStats: hourlyAgg,
        classStats: Object.entries(classAgg).map(([className, s]) => ({
            className,
            games: s.games,
            winRate: s.games > 0 ? +((s.wins / s.games) * 100).toFixed(1) : 0,
            avgScore: s.games > 0 ? +(s.scoreSum / s.games).toFixed(1) : 0
        })),
        needsEnrichment: totalMatches < 5 // Lower threshold for sparse accounts
    };
}
