-- ─────────────────────────────────────────────────────────────────────────────
-- manifest_definitions: Persistent Bungie Manifest storage
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS manifest_definitions (
    table_name  TEXT NOT NULL,
    hash        TEXT NOT NULL, 
    data        JSONB NOT NULL,
    version     TEXT, -- The Bungie manifest version string
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (table_name, hash)
);

-- Index for fast lookup by hash (across all tables if needed, though primary key is composite)
CREATE INDEX idx_manifest_hash ON manifest_definitions (hash);
CREATE INDEX idx_manifest_table ON manifest_definitions (table_name);

-- RLS: Service role manages updates; read-only for authenticated/anon
ALTER TABLE manifest_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manifest_read_all" ON manifest_definitions
    FOR SELECT USING (true);
