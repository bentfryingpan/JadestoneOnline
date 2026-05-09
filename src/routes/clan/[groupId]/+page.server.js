import { BUNGIE_API_KEY } from '$env/static/private';
import { supabaseAdmin } from '$lib/supabase-server.js';
import { error } from '@sveltejs/kit';

const BUNGIE_ROOT = 'https://www.bungie.net';

async function bungieGet(url) {
    const res = await fetch(BUNGIE_ROOT + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
    return res.json();
}

const MEMBER_TYPE_LABELS = {
    1: 'Beginner',
    2: 'Member',
    3: 'Admin',
    4: 'Acting Founder',
    5: 'Founder',
};

export async function load({ params }) {
    const { groupId } = params;

    // Fetch clan details + members in parallel
    const [groupData, membersData] = await Promise.all([
        bungieGet(`/Platform/GroupV2/${groupId}/`),
        bungieGet(`/Platform/GroupV2/${groupId}/Members/?memberType=0&currentPage=1`),
    ]);

    if (groupData.ErrorCode !== 1 || !groupData.Response) {
        throw error(404, 'Clan not found');
    }

    const group   = groupData.Response.detail ?? {};
    const founder = groupData.Response.founder ?? {};

    // Extract member list
    const rawMembers = membersData.Response?.results ?? [];

    const membershipIds = rawMembers
        .map(m => String(m.destinyUserInfo?.membershipId))
        .filter(Boolean);

    // Fetch Supabase Gambit stats for known members in one query
    let dbStats = [];
    if (membershipIds.length) {
        const { data } = await supabaseAdmin
            .from('player_gambit_stats')
            .select('player_id, bungie_name, bungie_code, activities_entered, activities_won, kills, deaths, assists, invasions, invasion_kills, invasions_defeated, motes_deposited, motes_lost, kd_ratio, win_rate')
            .in('player_id', membershipIds.map(Number));
        dbStats = data ?? [];
    }

    const dbMap = new Map(dbStats.map(s => [String(s.player_id), s]));

    const members = rawMembers.map(m => {
        const info  = m.destinyUserInfo ?? {};
        const bInfo = m.bungieNetUserInfo ?? {};
        const mid   = String(info.membershipId);
        const db    = dbMap.get(mid) ?? null;

        const name = info.bungieGlobalDisplayName || bInfo.displayName || 'Unknown';
        const code = String(info.bungieGlobalDisplayNameCode ?? '').padStart(4, '0');

        return {
            membershipId:   mid,
            membershipType: info.membershipType,
            name,
            code,
            icon:           info.iconPath ? BUNGIE_ROOT + info.iconPath : null,
            memberType:     m.memberType ?? 2,
            memberTypeLabel:MEMBER_TYPE_LABELS[m.memberType ?? 2] ?? 'Member',
            joinDate:       m.joinDate ?? null,
            lastOnline:     m.lastOnlineStatusChange
                              ? new Date(parseInt(m.lastOnlineStatusChange) * 1000).toISOString()
                              : null,
            // Gambit stats from DB (null if not yet visited)
            gambit: db ? {
                activitiesEntered: db.activities_entered,
                wins:              db.activities_won,
                kd:                db.kd_ratio,
                winRate:           db.win_rate,
                invasions:         db.invasions,
                motesDeposited:    db.motes_deposited,
            } : null,
        };
    });

    // Sort: founders/admins first, then by win rate desc, then by name
    members.sort((a, b) => {
        if (b.memberType !== a.memberType) return b.memberType - a.memberType;
        const aWR = a.gambit?.winRate ?? -1;
        const bWR = b.gambit?.winRate ?? -1;
        return bWR - aWR;
    });

    // Clan banner info
    const banner = groupData.Response.detail?.clanInfo?.clanBannerData ?? {};

    // Aggregate clan Gambit stats (from DB members only)
    const withStats = members.filter(m => m.gambit);
    const clanStats = withStats.length ? {
        totalPlayers:  withStats.length,
        avgWinRate:    +(withStats.reduce((s, m) => s + m.gambit.winRate, 0) / withStats.length).toFixed(1),
        avgKD:         +(withStats.reduce((s, m) => s + m.gambit.kd, 0)      / withStats.length).toFixed(2),
        totalMatches:  withStats.reduce((s, m) => s + m.gambit.activitiesEntered, 0),
    } : null;

    return {
        groupId,
        name:        group.name ?? 'Unknown Clan',
        motto:       group.motto ?? '',
        about:       group.about ?? '',
        callsign:    group.clanInfo?.clanCallsign ?? '',
        memberCount: group.memberCount ?? rawMembers.length,
        banner,
        founder: {
            name:           founder.bungieNetUserInfo?.displayName ?? 'Unknown',
            membershipType: founder.destinyUserInfo?.membershipType,
        },
        members,
        clanStats,
    };
}
