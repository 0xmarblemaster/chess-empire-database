-- Migration 048: normalize coaches.email to lowercase
--
-- Supabase auth.users always stores email lowercased, but coaches.email
-- was previously inserted with whatever case the admin typed. When the two
-- diverge, auth-helpers.js getRoleInfo() fails to find the coach row and
-- silently falls through to isAdmin=true. The role mismatch then makes the
-- "Admins manage time_slots" RLS policy reject the coach's UPDATE/DELETE,
-- so the Edit Time Slot modal closes as if it succeeded but no row changes.
--
-- This migration closes the hole at the data layer:
--   1. Trigger: lower(NEW.email) on every INSERT / UPDATE of coaches.email.
--   2. Backfill: lowercase any existing mismatched rows.
--
-- auth-helpers.js was also switched to .ilike() so callers are protected
-- even if a row somehow lands here case-mismatched in the future.

DROP TRIGGER IF EXISTS coaches_email_lowercase_trigger ON coaches;
DROP FUNCTION IF EXISTS coaches_email_lowercase();

CREATE FUNCTION coaches_email_lowercase()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.email IS NOT NULL THEN
        NEW.email := lower(NEW.email);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER coaches_email_lowercase_trigger
BEFORE INSERT OR UPDATE OF email ON coaches
FOR EACH ROW
EXECUTE FUNCTION coaches_email_lowercase();

UPDATE coaches
SET email = lower(email)
WHERE email IS NOT NULL AND email <> lower(email);
