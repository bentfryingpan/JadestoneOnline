-- ─────────────────────────────────────────────────────────────────────────────
-- player_ngr_cache: running-mean EGO per player (mirrors desktop player_ngr table)
-- Updated by pgcr-enrich each time a new match is stored.
-- Used to show lobby difficulty (NGR tier) on match pages.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS player_ngr_cache (
    player_id    BIGINT  PRIMARY KEY,   -- Bungie membershipId
    bungie_name  TEXT,
    bungie_code  TEXT,
    ngr          REAL    NOT NULL DEFAULT 0,  -- running average EGO score
    games        INTEGER NOT NULL DEFAULT 0,  -- total matches counted
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ngr_ngr ON player_ngr_cache (ngr DESC);

-- RLS: service role does all writes; read-only for all
ALTER TABLE player_ngr_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ngr_read_all" ON player_ngr_cache
    FOR SELECT USING (true);
