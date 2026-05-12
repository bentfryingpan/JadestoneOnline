/**
 * /api/career — Database-Aligned Career Analytics (1:1 with Live Schema)
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
    // Robust search for the player across both exact and corrupted IDs in the existing 'matches' table
    const idPrefix = String(membershipId).substring(0, 13);
    
    const { data: rows, error } = await supabaseAdmin
        .from('matches')
        .select('id,map_name,played_at,outcome,ego_score,stats_json,roster,player_id')
        .or(`player_id.eq.${membershipId},player_id.like.${idPrefix}%`)
        .not('stats_json', 'is', null) 
        .not('outcome', 'eq', 'DNF')
        .order('played_at', { ascending: false })
        .limit(5000); 

    if (error || !rows?.length) return null;

    const mapsAgg    = {};
    const weaponsAgg = {};
    const playersAgg = {};
    const medalsAgg  = {};
    const hourlyAgg  = Array.from({ length: 24 }, (_, h) => ({ hour: h, games: 0, wins: 0, scoreSum: 0 }));

    const targetPrefix = targetName ? String(targetName).split('#')[0].toLowerCase() : null;
    const targetCodeStr = targetCode ? String(targetCode).padStart(4, '0') : null;

    let totalMatches = 0, totalWins = 0;
    let totalScore = 0;

    for (const row of rows) {
        const isWin = row.outcome === 'Win';
        const stats = row.stats_json ?? {};
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
        totalScore += score;

        // Map stats
        if (!mapsAgg[mapName]) mapsAgg[mapName] = { games: 0, wins: 0, scoreSum: 0 };
        mapsAgg[mapName].games++;
        if (isWin) mapsAgg[mapName].wins++;
        mapsAgg[mapName].scoreSum += score;

        // Weapon stats
        for (const w of stats.top_weapons ?? []) {
            const wn = w.name ?? 'Unknown';
            if (!weaponsAgg[wn]) {
                weaponsAgg[wn] = { games: 0, wins: 0, kills: 0, precision: 0, scoreSum: 0, slot: w.slot ?? 'Unknown' };
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
            const isMe = String(p.id) === String(membershipId) || 
                         (targetPrefix && p.name.split('#')[0].toLowerCase() === targetPrefix && p.code === targetCodeStr);
            if (isMe) continue;
            
            const key = p.id || `${p.name}#${p.code}`;
            if (!key) continue;

            if (!playersAgg[key]) {
                playersAgg[key] = { name: p.name, code: p.code, games: 0, wins: 0, as_ally: 0, ally_wins: 0, as_enemy: 0, enemy_wins: 0 };
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
        for (const [mKey, count] of Object.entries(medals)) {
            medalsAgg[mKey] = (medalsAgg[mKey] ?? 0) + count;
        }

        // Hourly
        if (row.played_at) {
            const h = new Date(row.played_at).getHours();
            hourlyAgg[h].games++;
            if (isWin) hourlyAgg[h].wins++;
            hourlyAgg[h].scoreSum += score;
        }
    }

    const maps = Object.entries(mapsAgg)
        .map(([name, s]) => ({
            name, games: s.games, wins: s.wins, 
            winRate: +((s.wins / s.games) * 100).toFixed(1),
            avgScore: +(s.scoreSum / s.games).toFixed(1)
        }))
        .sort((a, b) => b.games - a.games);

    const weapons = Object.entries(weaponsAgg)
        .map(([name, s]) => ({
            name, games: s.games, wins: s.wins, kills: s.kills,
            precRate: s.kills > 0 ? +((s.precision / s.kills) * 100).toFixed(1) : 0,
            winRate: +((s.wins / s.games) * 100).toFixed(1),
            avgScore: +(s.scoreSum / s.games).toFixed(1),
            slot: s.slot
        }))
        .sort((a, b) => b.kills - a.kills);

    const playersList = Object.values(playersAgg);
    const allies = playersList
        .filter(p => p.as_ally >= 1)
        .map(p => ({ name: p.name, code: p.code, games: p.as_ally, winRate: +((p.ally_wins / p.as_ally) * 100).toFixed(1) }))
        .sort((a, b) => b.games - a.games).slice(0, 10);

    const rivals = playersList
        .filter(p => p.as_enemy >= 1)
        .map(p => ({ name: p.name, code: p.code, games: p.as_enemy, winRate: +((p.enemy_wins / p.as_enemy) * 100).toFixed(1) }))
        .sort((a, b) => b.games - a.games).slice(0, 10);

    const medals = Object.entries(medalsAgg)
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count);

    return {
        source: 'supabase', totalMatches, matchesAnalyzed: totalMatches,
        avgScore: totalMatches > 0 ? +(totalScore / totalMatches).toFixed(1) : 0,
        winRate:  totalMatches > 0 ? +((totalWins / totalMatches) * 100).toFixed(1) : 0,
        maps, weapons, allies, rivals, medals, hourlyStats: hourlyAgg,
        needsEnrichment: false
    };
}
