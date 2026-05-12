-- ─────────────────────────────────────────────────────────────────────────────
-- player_matches: full per-player per-match PGCR data (mirrors desktop matches_v3)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS player_matches (
    pgcr_id         TEXT    NOT NULL,
    player_id       BIGINT  NOT NULL,   -- Bungie membershipId
    bungie_name     TEXT,
    bungie_code     TEXT,
    membership_type SMALLINT,

    -- Match metadata
    map_name        TEXT,
    map_image       TEXT,
    period          TIMESTAMPTZ,
    duration        INTEGER,            -- seconds
    outcome         TEXT,               -- 'Win' | 'Loss' | 'DNF'

    -- EGO score breakdown
    ego_score       REAL,
    ego_base        REAL,
    ego_pem         REAL,
    mote_eff        REAL,
    kd              REAL,
    inv_yield       REAL,
    fireteam_size   SMALLINT DEFAULT 1,
    is_hard_carry   BOOLEAN  DEFAULT FALSE,
    is_carried      BOOLEAN  DEFAULT FALSE,

    -- Full gambit stats (for career computation)
    -- { kills, deaths, assists, mobKills, invasionKills, invasions, invasionsDefeated,
    --   motesDeposited, motesDenied, motesPickedUp, motesLost, primevalDamage,
    --   superKills, grenadeKills, meleeKills, medals: {canonical: count},
    --   top_weapons: [{name, kills, hash, icon}] }
    stats           JSONB,

    -- EGO component breakdown { PvE, PvP, Banking, Medals }
    components      JSONB,

    -- Roster: [{id, name, code, team, score, is_target, class, fireteam_size}]
    roster          JSONB,

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    PRIMARY KEY (pgcr_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_pm_player_period
    ON player_matches (player_id, period DESC);

CREATE INDEX IF NOT EXISTS idx_pm_player_outcome
    ON player_matches (player_id, outcome);

CREATE INDEX IF NOT EXISTS idx_pm_player_map
    ON player_matches (player_id, map_name);

-- ─────────────────────────────────────────────────────────────────────────────
-- player_favorites: saved/starred matches per player (like favorites_v4)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS player_favorites (
    pgcr_id    TEXT   NOT NULL,
    player_id  BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (pgcr_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_fav_player
    ON player_favorites (player_id, created_at DESC);

-- Row-Level Security (players can only read/write their own rows)
ALTER TABLE player_matches   ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_favorites ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS, anon/authenticated are read-only on their own rows.
-- For now, service role does all writes; no client-side writes needed.
