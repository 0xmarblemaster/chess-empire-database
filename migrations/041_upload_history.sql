-- Migration 041: Upload History (rating_uploads + unified_uploads view)
-- Mirrors the pattern from 039 (tournaments_uploads): one header row per
-- batch CSV/Excel import of student ratings. Lets the admin UI show a
-- combined "Upload History" tab for both rating CSVs and Swiss-Manager
-- tournament uploads.
--
-- The Upload History tab queries unified_uploads (UNION of
-- tournaments_uploads + rating_uploads) and the per-batch detail view
-- joins through tournament_results.upload_id / student_ratings.upload_id.

-- ============================================================
-- 1. rating_uploads
-- ============================================================
CREATE TABLE IF NOT EXISTS rating_uploads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_filename TEXT,
    rating_date     DATE,
    row_count       INTEGER,
    uploaded_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ru_uploaded_at_idx
    ON rating_uploads(uploaded_at DESC);

COMMENT ON TABLE rating_uploads IS
    'One row per rating CSV/Excel batch import. Powers the Ratings Management Upload History tab.';

-- ============================================================
-- 2. student_ratings.upload_id back-reference
-- ============================================================
ALTER TABLE student_ratings
    ADD COLUMN IF NOT EXISTS upload_id UUID
    REFERENCES rating_uploads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sr_upload_idx
    ON student_ratings(upload_id);

-- ============================================================
-- 3. Row Level Security (copies 039 tournaments_uploads pattern)
-- ============================================================
ALTER TABLE rating_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage rating_uploads" ON rating_uploads;
CREATE POLICY "Admins manage rating_uploads"
    ON rating_uploads FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
              AND user_roles.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
              AND user_roles.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Coaches read rating_uploads" ON rating_uploads;
CREATE POLICY "Coaches read rating_uploads"
    ON rating_uploads FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
              AND user_roles.role = 'coach'
        )
    );

-- ============================================================
-- 4. unified_uploads view (tournaments + rating CSV batches)
-- ============================================================
-- The UI joins uploaded_by -> users separately via the supabase client.
CREATE OR REPLACE VIEW unified_uploads AS
    SELECT
        id,
        'tournament'::text       AS type,
        COALESCE(kind::text, 'tournament') AS label,
        source_filename,
        tournament_date          AS effective_date,
        NULL::int                AS row_count,
        uploaded_by,
        uploaded_at
    FROM tournaments_uploads
    UNION ALL
    SELECT
        id,
        'rating'::text           AS type,
        'rating_csv'::text       AS label,
        source_filename,
        rating_date              AS effective_date,
        row_count,
        uploaded_by,
        uploaded_at
    FROM rating_uploads;

GRANT SELECT ON unified_uploads TO authenticated;

COMMENT ON VIEW unified_uploads IS
    'UNION of tournaments_uploads + rating_uploads. Powers the Upload History tab in admin Ratings Management.';
