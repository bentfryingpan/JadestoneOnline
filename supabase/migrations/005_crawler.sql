-- ─────────────────────────────────────────────────────────────────────────────
-- player_queue: crawler work queue — every discovered player gets a row
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS player_queue (
    player_id         TEXT PRIMARY KEY,
    membership_type   SMALLINT NOT NULL DEFAULT 3,
    bungie_name       TEXT,
    bungie_code       TEXT,
    -- When this player was last crawled (NULL = never)
    last_checked      TIMESTAMPTZ,
    -- Period of the most-recent match we have for this player (NULL = unknown)
    -- Used for incremental fetching — only pull matches newer than this
    last_match_period TIMESTAMPTZ,
    -- 3=seed, 2=site-visitor, 1=roster-discovered
    priority          SMALLINT DEFAULT 1,
    added_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Crawler picks players in order: highest priority first, least-recently-checked first
CREATE INDEX IF NOT EXISTS idx_queue_priority_checked
    ON player_queue (priority DESC, last_checked ASC NULLS FIRST);

-- ─────────────────────────────────────────────────────────────────────────────
-- rating_history: one row per (player, match) — tracks rating movement over time
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rating_history (
    id            BIGSERIAL PRIMARY KEY,
    player_id     TEXT        NOT NULL,
    instance_id   TEXT        NOT NULL,
    period        TIMESTAMPTZ,
    ego_score     REAL,
    rating_before REAL,
    rating_after  REAL,
    delta         REAL GENERATED ALWAYS AS (rating_after - rating_before) STORED,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (player_id, instance_id)
);

CREATE INDEX IF NOT EXISTS idx_rh_player_period
    ON rating_history (player_id, period DESC NULLS LAST);

-- ─────────────────────────────────────────────────────────────────────────────
-- player_jpr: per-player per-segment JPR leaderboard scores
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS player_jpr (
    player_id    TEXT    NOT NULL,
    segment      TEXT    NOT NULL,  -- 'solo' | 'duo' | 'trio' | 'stack'
    jpr          REAL    DEFAULT 0,
    output       REAL    DEFAULT 0,
    impact       REAL    DEFAULT 0,
    form         REAL    DEFAULT 0,
    games_played INTEGER DEFAULT 0,
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (player_id, segment)
);

CREATE INDEX IF NOT EXISTS idx_jpr_segment_score
    ON player_jpr (segment, jpr DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- meta_cache: global aggregated stats — weapons, maps, playstyle meta
-- Keyed by arbitrary string (e.g. 'weapons_30d', 'maps_all', 'playstyle')
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meta_cache (
    key        TEXT PRIMARY KEY,
    data       JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: service role handles all writes; public read only
ALTER TABLE player_queue   ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_jpr     ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_cache     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "queue_read"   ON player_queue   FOR SELECT USING (true);
CREATE POLICY "rh_read"      ON rating_history FOR SELECT USING (true);
CREATE POLICY "jpr_read"     ON player_jpr     FOR SELECT USING (true);
CREATE POLICY "meta_read"    ON meta_cache     FOR SELECT USING (true);
