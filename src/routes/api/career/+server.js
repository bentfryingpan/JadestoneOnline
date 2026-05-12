/**
 * /api/career — Career stats from Supabase player_matches (PGCR-enriched data).
 */

import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabase-server.js';

export async function GET({ url }) {
    const membershipId = url.searchParams.get('membershipId');
    const name         = url.searchParams.get('name');
    const code         = url.searchParams.get('code');
    const count        = Math.min(parseInt(url.searchParams.get('count') ?? '250', 10), 1000);

    if (!membershipId) return json({ error: 'Missing membershipId' }, { status: 400 });

    try {
        const result = await careerFromSupabase(membershipId, name, code, count);
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

async function careerFromSupabase(membershipId, targetName, targetCode, count) {
    // Robust search for the player across both exact and corrupted IDs
    // Corrupted IDs usually start with the same 13+ digits
    const idPrefix = String(membershipId).substring(0, 13);
    
    const { data: rows, error } = await supabaseAdmin
        .from('player_matches')
        .select('pgcr_id,map_name,map_image,period,outcome,ego_score,is_hard_carry,is_carried,stats,roster,player_id')
        .or(`player_id.eq.${membershipId},player_id.like.${idPrefix}%`)
        .not('stats', 'is', null) 
        .not('outcome', 'eq', 'DNF')
        .order('period', { ascending: false })
        .limit(5000); 

    if (error || !rows?.length) return null;

    const mapsAgg    = {};
    const weaponsAgg = {};
    const playersAgg = {};
    const medalsAgg  = {};
    const hourlyAgg  = Array.from({ length: 24 }, (_, h) => ({ hour: h, games: 0, wins: 0, scoreSum: 0 }));
    const classAgg   = { Titan: { games: 0, wins: 0, scoreSum: 0 }, Hunter: { games: 0, wins: 0, scoreSum: 0 }, Warlock: { games: 0, wins: 0, scoreSum: 0 } };

    const targetPrefix = targetName ? String(targetName).split('#')[0].toLowerCase() : null;
    const targetCodeStr = targetCode ? String(targetCode).padStart(4, '0') : null;

    let totalMatches = 0, totalWins = 0, carries = 0, carried = 0;
    let totalScore = 0;

    for (const row of rows) {
        const isWin = row.outcome === 'Win';
        const stats = row.stats ?? {};
        const medals = stats.medals ?? {};
        const mapName = row.map_name ?? 'Gambit';
        const score = row.ego_score ?? 0;
        const roster = row.roster ?? [];

        // ROBUST TARGET FINDING (1:1 with Python Jadestone logic)
        const myEntry = roster.find(r => 
            r.is_target || 
            String(r.id) === String(membershipId) ||
            (targetPrefix && r.name.split('#')[0].toLowerCase() === targetPrefix && r.code === targetCodeStr)
        );
        
        if (!myEntry) continue; 

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

        // Weapon stats
        for (const w of stats.top_weapons ?? []) {
            const wn = w.name ?? 'Unknown';
            if (!weaponsAgg[wn]) {
                weaponsAgg[wn] = { games: 0, wins: 0, kills: 0, precision: 0, scoreSum: 0, icon: w.icon ?? null, hash: w.hash ?? null, slot: w.slot ?? 'Unknown' };
            }
            weaponsAgg[wn].games++;
            weaponsAgg[wn].kills += w.kills ?? 0;
            weaponsAgg[wn].precision += w.precision ?? 0;
            if (isWin) weaponsAgg[wn].wins++;
            weaponsAgg[wn].scoreSum += score;
        }

        // Teammate/Rival logic
        const myTeam = myEntry.team;
        for (const p of roster) {
            // Check if teammate is NOT me (robust check)
            const isMe = String(p.id) === String(membershipId) || 
                         (targetPrefix && p.name.split('#')[0].toLowerCase() === targetPrefix && p.code === targetCodeStr);
            if (isMe) continue;
            
            const pId = String(p.id);
            const pName = p.name;
            const pCode = p.code ? String(p.code).padStart(4, '0') : null;
            const key = pId || `${pName}#${pCode}`;
            if (!key) continue;

            if (!playersAgg[key]) {
                playersAgg[key] = { 
                    name: pName, code: pCode, games: 0, wins: 0, 
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

        // Medal stats
        for (const [mKey, count] of Object.entries(medals)) {
            medalsAgg[mKey] = (medalsAgg[mKey] ?? 0) + count;
        }

        // Class stats
        const className = myEntry.className;
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
            name, games: s.games, wins: s.wins, losses: s.games - s.wins,
            winRate: +((s.wins / s.games) * 100).toFixed(1),
            avgScore: +(s.scoreSum / s.games).toFixed(1),
            map_image: s.map_image
        }))
        .sort((a, b) => b.games - a.games);

    const weapons = Object.entries(weaponsAgg)
        .map(([name, s]) => ({
            name, games: s.games, wins: s.wins, kills: s.kills,
            precRate: s.kills > 0 ? +((s.precision / s.kills) * 100).toFixed(1) : 0,
            winRate: +((s.wins / s.games) * 100).toFixed(1),
            avgScore: +(s.scoreSum / s.games).toFixed(1),
            icon: s.icon, hash: s.hash, slot: s.slot
        }))
        .sort((a, b) => b.kills - a.kills);

    const playersList = Object.values(playersAgg);
    const allies = playersList
        .filter(p => p.as_ally >= 1)
        .map(p => ({
            name: p.name, code: p.code, games: p.as_ally,
            winRate: +((p.ally_wins / p.as_ally) * 100).toFixed(1)
        }))
        .sort((a, b) => b.games - a.games)
        .slice(0, 10);

    const rivals = playersList
        .filter(p => p.as_enemy >= 1)
        .map(p => ({
            name: p.name, code: p.code, games: p.as_enemy,
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
        carries, carried,
        maps, weapons, allies, rivals, medals,
        hourlyStats: hourlyAgg,
        classStats: Object.entries(classAgg).map(([cn, s]) => ({
            className: cn, games: s.games,
            winRate: s.games > 0 ? +((s.wins / s.games) * 100).toFixed(1) : 0,
            avgScore: s.games > 0 ? +(s.scoreSum / s.games).toFixed(1) : 0
        })),
        needsEnrichment: false
    };
}
