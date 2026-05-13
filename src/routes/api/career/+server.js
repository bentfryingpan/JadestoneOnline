/**
 * /api/career — 1:1 Robust Career Analytics Engine
 */

import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabase-server.js';

export async function GET({ url }) {
    const membershipId = url.searchParams.get('membershipId');
    const name         = url.searchParams.get('name');
    const code         = url.searchParams.get('code');

    if (!membershipId) return json({ error: 'Missing membershipId' }, { status: 400 });

    try {
        const idStr = String(membershipId);
        const prefix = idStr.substring(0, 15);
        
        // Robust query: Target both exact ID and potential rounded BigInts
        const { data: rows, error } = await supabaseAdmin
            .from('matches')
            .select('id, map_name, played_at, outcome, ego_score, stats_json, player_id')
            .or(`player_id.eq.${idStr},and(player_id.gte.${prefix}0000,player_id.lte.${prefix}9999)`)
            .not('stats_json', 'is', null) 
            .order('played_at', { ascending: false })
            .limit(10000); 

        if (error || !rows?.length) {
            return json({ 
                source: 'empty', totalMatches: 0, maps: [], weapons: [], allies: [], rivals: [], 
                medals: [], matchesAnalyzed: 0, needsEnrichment: true
            });
        }

        const mapsAgg    = {};
        const weaponsAgg = {};
        const playersAgg = {};
        const medalsAgg  = {};
        const hourlyAgg  = Array.from({ length: 24 }, (_, h) => ({ hour: h, games: 0, wins: 0, scoreSum: 0 }));

        const targetPrefix = name ? String(name).split('#')[0].toLowerCase() : null;
        const targetCodeStr = code ? String(code).padStart(4, '0') : null;

        let totalMatches = 0, totalWins = 0, totalScore = 0, totalMotes = 0;

        for (const row of rows) {
            const stats = row.stats_json ?? {};
            const roster = stats.roster ?? [];
            
            // 1:1 Identity Matching
            const myEntry = roster.find(r => 
                r.is_target || 
                String(r.id) === idStr ||
                (targetPrefix && String(r.name).split('#')[0].toLowerCase() === targetPrefix && String(r.code) === targetCodeStr)
            );
            
            if (!myEntry) continue; 

            const isWin = row.outcome === 'Win' || row.outcome === 'WIN' || myEntry.team === (stats.standing === 0 ? myEntry.team : null);
            const score = row.ego_score ?? 0;
            const mapName = row.map_name ?? 'Gambit';

            totalMatches++;
            if (isWin) totalWins++;
            totalScore += score;
            totalMotes += (stats.motesDeposited ?? 0);

            // Maps
            if (!mapsAgg[mapName]) mapsAgg[mapName] = { games: 0, wins: 0, scoreSum: 0 };
            mapsAgg[mapName].games++;
            if (isWin) mapsAgg[mapName].wins++;
            mapsAgg[mapName].scoreSum += score;

            // Weapons
            for (const w of stats.top_weapons ?? []) {
                const wn = w.name ?? 'Unknown';
                if (!weaponsAgg[wn]) {
                    weaponsAgg[wn] = { games: 0, wins: 0, kills: 0, precision: 0, scoreSum: 0, slot: w.slot ?? 'Unknown', icon: w.icon ?? null, hash: w.hash ?? null };
                }
                weaponsAgg[wn].games++;
                weaponsAgg[wn].kills += w.kills ?? 0;
                weaponsAgg[wn].precision += w.precision ?? 0;
                if (isWin) weaponsAgg[wn].wins++;
                weaponsAgg[wn].scoreSum += score;
            }

            // Synergy
            const myTeam = myEntry.team;
            for (const p of roster) {
                const isMe = String(p.id) === idStr || 
                             (targetPrefix && String(p.name).split('#')[0].toLowerCase() === targetPrefix && String(p.code) === targetCodeStr);
                if (isMe) continue;
                
                const key = p.id || `${p.name}#${p.code}`;
                if (!key) continue;

                if (!playersAgg[key]) {
                    playersAgg[key] = { name: p.name, code: p.code, games: 0, wins: 0, as_ally: 0, ally_wins: 0, as_enemy: 0, enemy_wins: 0 };
                }
                const pa = playersAgg[key];
                pa.games++;
                if (isWin) pa.wins++;
                if (p.team === myTeam) { pa.as_ally++; if (isWin) pa.ally_wins++; }
                else { pa.as_enemy++; if (isWin) pa.enemy_wins++; }
            }

            // Medals
            const medals = stats.medals ?? {};
            for (const [mKey, count] of Object.entries(medals)) {
                medalsAgg[mKey] = (medalsAgg[mKey] ?? 0) + count;
            }

            // Time
            if (row.played_at) {
                const h = new Date(row.played_at).getHours();
                hourlyAgg[h].games++;
                if (isWin) hourlyAgg[h].wins++;
                hourlyAgg[h].scoreSum += score;
            }
        }

        return json({
            source: 'supabase',
            totalMatches,
            matchesAnalyzed: totalMatches,
            avgScore: totalMatches > 0 ? +(totalScore / totalMatches).toFixed(1) : 0,
            winRate:  totalMatches > 0 ? +((totalWins / totalMatches) * 100).toFixed(1) : 0,
            avgMotes: totalMatches > 0 ? +(totalMotes / totalMatches).toFixed(1) : 0,
            maps: Object.entries(mapsAgg).map(([name, s]) => ({
                name, games: s.games, wins: s.wins, winRate: +((s.wins / s.games) * 100).toFixed(1), avgScore: +(s.scoreSum / s.games).toFixed(1)
            })).sort((a, b) => b.games - a.games),
            weapons: Object.entries(weaponsAgg).map(([name, s]) => ({
                name, games: s.games, wins: s.wins, kills: s.kills, precRate: s.kills > 0 ? +((s.precision / s.kills) * 100).toFixed(1) : 0,
                winRate: +((s.wins / s.games) * 100).toFixed(1), avgScore: +(s.scoreSum / s.games).toFixed(1), slot: s.slot, icon: s.icon, hash: s.hash
            })).sort((a, b) => b.kills - a.kills),
            allies: Object.values(playersAgg).filter(p => p.as_ally >= 1).map(p => ({
                name: p.name, code: p.code, games: p.as_ally, winRate: +((p.ally_wins / p.as_ally) * 100).toFixed(1)
            })).sort((a, b) => b.games - a.games).slice(0, 15),
            rivals: Object.values(playersAgg).filter(p => p.as_enemy >= 1).map(p => ({
                name: p.name, code: p.code, games: p.as_enemy, winRate: +((p.enemy_wins / p.as_enemy) * 100).toFixed(1)
            })).sort((a, b) => b.games - a.games).slice(0, 15),
            medals: Object.entries(medalsAgg).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
            hourlyStats: hourlyAgg,
            needsEnrichment: false
        });

    } catch (e) {
        return json({ error: e.message, source: 'error' }, { status: 500 });
    }
}
