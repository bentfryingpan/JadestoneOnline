-- ─────────────────────────────────────────────────────────────────────────────
-- matches: per-player per-match enriched PGCR data (live table used by all APIs)
-- NOTE: This is the ACTIVE table. player_matches (migration 001) is the old name.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS matches (
    id              TEXT    NOT NULL,          -- Bungie instanceId (pgcr_id)
    player_id       TEXT    NOT NULL,          -- Bungie membershipId as TEXT
    map_name        TEXT,
    outcome         TEXT,                      -- 'Win' | 'Loss' | 'DNF'
    ego_score       REAL,
    ego_base        REAL,
    ego_pem         REAL,
    kd              REAL,
    mote_eff        REAL,
    fireteam_size   SMALLINT DEFAULT 1,
    is_hard_carry   BOOLEAN  DEFAULT FALSE,
    is_carried      BOOLEAN  DEFAULT FALSE,
    -- Full enriched stats blob: { kills, deaths, assists, mobKills, invasionKills,
    --   motesDeposited, motesDenied, motesPickedUp, motesLost, primevalDamage,
    --   superKills, grenadeKills, meleeKills, medals, top_weapons, roster, ... }
    stats_json      JSONB,
    period          TIMESTAMPTZ,               -- actual match timestamp
    created_at      TIMESTAMPTZ DEFAULT NOW(), -- DB insert time

    PRIMARY KEY (id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_matches_player_period
    ON matches (player_id, period DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_matches_player_outcome
    ON matches (player_id, outcome);

CREATE INDEX IF NOT EXISTS idx_matches_stats_json
    ON matches USING gin (stats_json);

-- ─────────────────────────────────────────────────────────────────────────────
-- players: per-player identity + NGR rolling average
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS players (
    id              TEXT    PRIMARY KEY,       -- Bungie membershipId as TEXT
    bungie_name     TEXT,
    bungie_code     TEXT,
    membership_type SMALLINT,
    ngr             REAL    DEFAULT 0,         -- running-mean EGO
    games_played    INTEGER DEFAULT 0,
    ego_score_avg   REAL    DEFAULT 0,
    claimed_by      TEXT,                      -- auth user id who claimed this profile
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_players_ngr ON players (ngr DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- player_gambit_stats: lifetime Bungie API stats cache per player
-- Written on profile load from Bungie account stats endpoint.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS player_gambit_stats (
    player_id           TEXT    PRIMARY KEY,
    bungie_name         TEXT,
    bungie_code         TEXT,
    membership_type     SMALLINT,
    activities_entered  INTEGER DEFAULT 0,
    activities_won      INTEGER DEFAULT 0,
    kills               INTEGER DEFAULT 0,
    deaths              INTEGER DEFAULT 0,
    assists             INTEGER DEFAULT 0,
    invasions           INTEGER DEFAULT 0,
    invasion_kills      INTEGER DEFAULT 0,
    invasions_defeated  INTEGER DEFAULT 0,
    motes_deposited     INTEGER DEFAULT 0,
    motes_lost          INTEGER DEFAULT 0,
    kd_ratio            REAL    DEFAULT 0,
    win_rate            REAL    DEFAULT 0,
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: service role handles all writes; public read
ALTER TABLE matches              ENABLE ROW LEVEL SECURITY;
ALTER TABLE players              ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_gambit_stats  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "matches_read_all"   ON matches              FOR SELECT USING (true);
CREATE POLICY "players_read_all"   ON players              FOR SELECT USING (true);
CREATE POLICY "gambit_stats_read"  ON player_gambit_stats  FOR SELECT USING (true);
