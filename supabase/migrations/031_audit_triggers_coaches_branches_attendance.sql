-- Migration 031: Add audit triggers for coaches, branches, and attendance tables
-- Matches existing students audit trigger pattern: per-field UPDATE logging, single-row CREATE/DELETE

-- ============================================================
-- COACHES AUDIT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION audit_coaches_changes()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
    v_user_email TEXT;
BEGIN
    v_user_id := auth.uid();
    SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changed_by_email, changed_at)
        VALUES ('coaches', NEW.id, 'CREATE', v_user_id, v_user_email, NOW());
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changed_by_email, changed_at)
        VALUES ('coaches', OLD.id, 'DELETE', v_user_id, v_user_email, NOW());
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Track each changed field individually
        IF OLD.first_name IS DISTINCT FROM NEW.first_name THEN
            INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email, changed_at)
            VALUES ('coaches', NEW.id, 'UPDATE', 'first_name', OLD.first_name, NEW.first_name, v_user_id, v_user_email, NOW());
        END IF;
        IF OLD.last_name IS DISTINCT FROM NEW.last_name THEN
            INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email, changed_at)
            VALUES ('coaches', NEW.id, 'UPDATE', 'last_name', OLD.last_name, NEW.last_name, v_user_id, v_user_email, NOW());
        END IF;
        IF OLD.phone IS DISTINCT FROM NEW.phone THEN
            INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email, changed_at)
            VALUES ('coaches', NEW.id, 'UPDATE', 'phone', OLD.phone, NEW.phone, v_user_id, v_user_email, NOW());
        END IF;
        IF OLD.email IS DISTINCT FROM NEW.email THEN
            INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email, changed_at)
            VALUES ('coaches', NEW.id, 'UPDATE', 'email', OLD.email, NEW.email, v_user_id, v_user_email, NOW());
        END IF;
        IF OLD.branch_id IS DISTINCT FROM NEW.branch_id THEN
            INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email, changed_at)
            VALUES ('coaches', NEW.id, 'UPDATE', 'branch_id', OLD.branch_id::TEXT, NEW.branch_id::TEXT, v_user_id, v_user_email, NOW());
        END IF;
        IF OLD.photo_url IS DISTINCT FROM NEW.photo_url THEN
            INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email, changed_at)
            VALUES ('coaches', NEW.id, 'UPDATE', 'photo_url', OLD.photo_url, NEW.photo_url, v_user_id, v_user_email, NOW());
        END IF;
        IF OLD.bio IS DISTINCT FROM NEW.bio THEN
            INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email, changed_at)
            VALUES ('coaches', NEW.id, 'UPDATE', 'bio', OLD.bio, NEW.bio, v_user_id, v_user_email, NOW());
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_coaches ON coaches;
CREATE TRIGGER trg_audit_coaches
    AFTER INSERT OR UPDATE OR DELETE ON coaches
    FOR EACH ROW EXECUTE FUNCTION audit_coaches_changes();

-- ============================================================
-- BRANCHES AUDIT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION audit_branches_changes()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
    v_user_email TEXT;
BEGIN
    v_user_id := auth.uid();
    SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changed_by_email, changed_at)
        VALUES ('branches', NEW.id, 'CREATE', v_user_id, v_user_email, NOW());
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changed_by_email, changed_at)
        VALUES ('branches', OLD.id, 'DELETE', v_user_id, v_user_email, NOW());
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.name IS DISTINCT FROM NEW.name THEN
            INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email, changed_at)
            VALUES ('branches', NEW.id, 'UPDATE', 'name', OLD.name, NEW.name, v_user_id, v_user_email, NOW());
        END IF;
        IF OLD.location IS DISTINCT FROM NEW.location THEN
            INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email, changed_at)
            VALUES ('branches', NEW.id, 'UPDATE', 'location', OLD.location, NEW.location, v_user_id, v_user_email, NOW());
        END IF;
        IF OLD.phone IS DISTINCT FROM NEW.phone THEN
            INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email, changed_at)
            VALUES ('branches', NEW.id, 'UPDATE', 'phone', OLD.phone, NEW.phone, v_user_id, v_user_email, NOW());
        END IF;
        IF OLD.email IS DISTINCT FROM NEW.email THEN
            INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email, changed_at)
            VALUES ('branches', NEW.id, 'UPDATE', 'email', OLD.email, NEW.email, v_user_id, v_user_email, NOW());
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_branches ON branches;
CREATE TRIGGER trg_audit_branches
    AFTER INSERT OR UPDATE OR DELETE ON branches
    FOR EACH ROW EXECUTE FUNCTION audit_branches_changes();

-- ============================================================
-- ATTENDANCE AUDIT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION audit_attendance_changes()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
    v_user_email TEXT;
    v_student_name TEXT;
BEGIN
    v_user_id := auth.uid();
    SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

    IF TG_OP = 'INSERT' THEN
        -- For attendance, store student name in new_value for readability
        SELECT first_name || ' ' || last_name INTO v_student_name FROM students WHERE id = NEW.student_id;
        INSERT INTO audit_log (entity_type, entity_id, action, field_name, new_value, changed_by, changed_by_email, changed_at)
        VALUES ('attendance', NEW.id, 'CREATE', 'status', 
                COALESCE(v_student_name, '') || ' | ' || NEW.status || ' | ' || NEW.attendance_date::TEXT,
                v_user_id, v_user_email, NOW());
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        SELECT first_name || ' ' || last_name INTO v_student_name FROM students WHERE id = OLD.student_id;
        INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, changed_by, changed_by_email, changed_at)
        VALUES ('attendance', OLD.id, 'DELETE', 'status',
                COALESCE(v_student_name, '') || ' | ' || OLD.status || ' | ' || OLD.attendance_date::TEXT,
                v_user_id, v_user_email, NOW());
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            SELECT first_name || ' ' || last_name INTO v_student_name FROM students WHERE id = NEW.student_id;
            INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email, changed_at)
            VALUES ('attendance', NEW.id, 'UPDATE', 'status',
                    OLD.status || ' | ' || COALESCE(v_student_name, ''),
                    NEW.status || ' | ' || COALESCE(v_student_name, ''),
                    v_user_id, v_user_email, NOW());
        END IF;
        IF OLD.notes IS DISTINCT FROM NEW.notes THEN
            INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email, changed_at)
            VALUES ('attendance', NEW.id, 'UPDATE', 'notes', OLD.notes, NEW.notes, v_user_id, v_user_email, NOW());
        END IF;
        IF OLD.schedule_type IS DISTINCT FROM NEW.schedule_type THEN
            INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email, changed_at)
            VALUES ('attendance', NEW.id, 'UPDATE', 'schedule_type', OLD.schedule_type, NEW.schedule_type, v_user_id, v_user_email, NOW());
        END IF;
        IF OLD.time_slot IS DISTINCT FROM NEW.time_slot THEN
            INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email, changed_at)
            VALUES ('attendance', NEW.id, 'UPDATE', 'time_slot', OLD.time_slot, NEW.time_slot, v_user_id, v_user_email, NOW());
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_attendance ON attendance;
CREATE TRIGGER trg_audit_attendance
    AFTER INSERT OR UPDATE OR DELETE ON attendance
    FOR EACH ROW EXECUTE FUNCTION audit_attendance_changes();
