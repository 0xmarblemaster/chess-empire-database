-- Migration 043: time_slots — per-coach lesson time slots
--
-- Replaces the 17 hard-coded ATTENDANCE_TIME_SLOTS_* arrays in admin-v2.js
-- (lines 5463-5652) with a database-driven table so admins/coaches can
-- customize slot lists without code changes. Phase 1 ships schema + RLS
-- only; admin-v2.js is untouched and continues to use the hard-coded
-- arrays. Seed data lives in migration 044.
--
-- coaches table has no user_id column; the coach->user link is on
-- user_roles.coach_id, so RLS uses that join (see migration 035 for the
-- same admin pattern via user_roles.role = 'admin').

CREATE TABLE IF NOT EXISTS time_slots (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id     UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    coach_id      UUID NOT NULL REFERENCES coaches(id)  ON DELETE CASCADE,
    schedule_type TEXT NOT NULL CHECK (
        schedule_type IN ('mon_wed', 'tue_thu', 'sat_sun', 'mon_wed_fri', 'wed_fri')
    ),
    slot_index    INT  NOT NULL CHECK (slot_index >= 0),
    start_time    TIME NOT NULL,
    end_time      TIME NOT NULL CHECK (end_time > start_time),
    label         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by    UUID REFERENCES auth.users(id),
    UNIQUE (branch_id, coach_id, schedule_type, slot_index)
);

CREATE INDEX IF NOT EXISTS idx_time_slots_branch_coach
    ON time_slots (branch_id, coach_id);

DROP TRIGGER IF EXISTS update_time_slots_updated_at ON time_slots;
CREATE TRIGGER update_time_slots_updated_at
    BEFORE UPDATE ON time_slots
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE time_slots ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read (mirrors the attendance pattern from 001)
DROP POLICY IF EXISTS "Anyone can read time_slots" ON time_slots;
CREATE POLICY "Anyone can read time_slots"
    ON time_slots FOR SELECT
    TO authenticated
    USING (true);

-- Admins manage everything (mirrors 035/041 admin pattern)
DROP POLICY IF EXISTS "Admins manage time_slots" ON time_slots;
CREATE POLICY "Admins manage time_slots"
    ON time_slots FOR ALL
    TO authenticated
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

-- Coaches can write only rows for their own coach_id
-- (the auth.uid -> coach link lives on user_roles.coach_id)
DROP POLICY IF EXISTS "Coaches manage own time_slots" ON time_slots;
CREATE POLICY "Coaches manage own time_slots"
    ON time_slots FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id  = auth.uid()
              AND user_roles.coach_id = time_slots.coach_id
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id  = auth.uid()
              AND user_roles.coach_id = time_slots.coach_id
        )
    );

COMMENT ON TABLE time_slots IS
    'Per-coach lesson time slots for the attendance calendar. Replaces hard-coded ATTENDANCE_TIME_SLOTS_* arrays in admin-v2.js. Coaches can edit only rows for their own coach_id; admins can edit any.';
