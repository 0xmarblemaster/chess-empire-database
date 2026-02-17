-- Migration 032: Add current_lesson tracking to audit trigger
-- The original trigger (021) tracks current_level but missed current_lesson
-- This replaces the function in-place (CREATE OR REPLACE), no trigger recreation needed

CREATE OR REPLACE FUNCTION log_entity_changes()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
    v_user_email TEXT;
    v_entity_type TEXT;
    v_old_record JSONB;
    v_new_record JSONB;
BEGIN
    v_user_id := auth.uid();
    SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
    IF v_user_email IS NULL THEN v_user_email := 'system@chessempire.kz'; END IF;
    v_entity_type := TG_TABLE_NAME;

    IF (TG_OP = 'DELETE') THEN
        INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
        VALUES (v_entity_type, OLD.id, 'DELETE', NULL, NULL, NULL, v_user_id, v_user_email);
        RETURN OLD;
    END IF;

    IF (TG_OP = 'INSERT') THEN
        INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
        VALUES (v_entity_type, NEW.id, 'CREATE', NULL, NULL, NULL, v_user_id, v_user_email);
        RETURN NEW;
    END IF;

    IF (TG_OP = 'UPDATE') THEN
        v_old_record := to_jsonb(OLD);
        v_new_record := to_jsonb(NEW);

        -- Students: Track 16 fields (added current_lesson)
        IF v_entity_type = 'students' THEN
            IF OLD.first_name IS DISTINCT FROM NEW.first_name THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'first_name', OLD.first_name, NEW.first_name, v_user_id, v_user_email);
            END IF;
            IF OLD.last_name IS DISTINCT FROM NEW.last_name THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'last_name', OLD.last_name, NEW.last_name, v_user_id, v_user_email);
            END IF;
            IF OLD.age IS DISTINCT FROM NEW.age THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'age', OLD.age::TEXT, NEW.age::TEXT, v_user_id, v_user_email);
            END IF;
            IF OLD.status IS DISTINCT FROM NEW.status THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'status', OLD.status, NEW.status, v_user_id, v_user_email);
            END IF;
            IF OLD.branch_id IS DISTINCT FROM NEW.branch_id THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'branch_id', OLD.branch_id::TEXT, NEW.branch_id::TEXT, v_user_id, v_user_email);
            END IF;
            IF OLD.coach_id IS DISTINCT FROM NEW.coach_id THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'coach_id', OLD.coach_id::TEXT, NEW.coach_id::TEXT, v_user_id, v_user_email);
            END IF;
            IF OLD.current_level IS DISTINCT FROM NEW.current_level THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'current_level', OLD.current_level::TEXT, NEW.current_level::TEXT, v_user_id, v_user_email);
            END IF;
            IF OLD.current_lesson IS DISTINCT FROM NEW.current_lesson THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'current_lesson', OLD.current_lesson::TEXT, NEW.current_lesson::TEXT, v_user_id, v_user_email);
            END IF;
            IF OLD.parent_name IS DISTINCT FROM NEW.parent_name THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'parent_name', OLD.parent_name, NEW.parent_name, v_user_id, v_user_email);
            END IF;
            IF OLD.parent_phone IS DISTINCT FROM NEW.parent_phone THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'parent_phone', OLD.parent_phone, NEW.parent_phone, v_user_id, v_user_email);
            END IF;
            IF OLD.parent_email IS DISTINCT FROM NEW.parent_email THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'parent_email', OLD.parent_email, NEW.parent_email, v_user_id, v_user_email);
            END IF;
            IF OLD.enrollment_date IS DISTINCT FROM NEW.enrollment_date THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'enrollment_date', OLD.enrollment_date::TEXT, NEW.enrollment_date::TEXT, v_user_id, v_user_email);
            END IF;
            IF OLD.school IS DISTINCT FROM NEW.school THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'school', OLD.school, NEW.school, v_user_id, v_user_email);
            END IF;
            IF OLD.address IS DISTINCT FROM NEW.address THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'address', OLD.address, NEW.address, v_user_id, v_user_email);
            END IF;
            IF OLD.notes IS DISTINCT FROM NEW.notes THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'notes', OLD.notes, NEW.notes, v_user_id, v_user_email);
            END IF;
            IF OLD.photo_url IS DISTINCT FROM NEW.photo_url THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'photo_url', OLD.photo_url, NEW.photo_url, v_user_id, v_user_email);
            END IF;
        END IF;

        IF v_entity_type = 'coaches' THEN
            IF OLD.first_name IS DISTINCT FROM NEW.first_name THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'first_name', OLD.first_name, NEW.first_name, v_user_id, v_user_email);
            END IF;
            IF OLD.last_name IS DISTINCT FROM NEW.last_name THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'last_name', OLD.last_name, NEW.last_name, v_user_id, v_user_email);
            END IF;
            IF OLD.email IS DISTINCT FROM NEW.email THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'email', OLD.email, NEW.email, v_user_id, v_user_email);
            END IF;
            IF OLD.phone IS DISTINCT FROM NEW.phone THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'phone', OLD.phone, NEW.phone, v_user_id, v_user_email);
            END IF;
            IF OLD.branch_id IS DISTINCT FROM NEW.branch_id THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'branch_id', OLD.branch_id::TEXT, NEW.branch_id::TEXT, v_user_id, v_user_email);
            END IF;
        END IF;

        IF v_entity_type = 'branches' THEN
            IF OLD.name IS DISTINCT FROM NEW.name THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'name', OLD.name, NEW.name, v_user_id, v_user_email);
            END IF;
            IF OLD.location IS DISTINCT FROM NEW.location THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'location', OLD.location, NEW.location, v_user_id, v_user_email);
            END IF;
            IF OLD.phone IS DISTINCT FROM NEW.phone THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'phone', OLD.phone, NEW.phone, v_user_id, v_user_email);
            END IF;
            IF OLD.email IS DISTINCT FROM NEW.email THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'email', OLD.email, NEW.email, v_user_id, v_user_email);
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
