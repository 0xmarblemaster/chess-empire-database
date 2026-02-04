-- ============================================
-- MIGRATION 020: Assign Assylbek to НИШ Branch
-- Created: 2026-02-04
-- Purpose: Add Coach Assylbek Aibekuly to НИШ branch (in addition to Halyk Arena)
-- ============================================

-- STEP 1: Verify coach exists and find НИШ branch
DO $$
DECLARE
    v_coach_id UUID;
    v_nish_branch_id UUID;
    v_coach_name TEXT;
    v_branch_name TEXT;
    v_existing_branches TEXT;
BEGIN
    -- Find coach by email
    SELECT id, first_name || ' ' || last_name INTO v_coach_id, v_coach_name
    FROM coaches
    WHERE email = 'asyl.aibekuly@gmail.com';

    IF v_coach_id IS NULL THEN
        RAISE EXCEPTION 'Coach with email asyl.aibekuly@gmail.com not found';
    END IF;

    RAISE NOTICE '✅ Found coach: % (ID: %)', v_coach_name, v_coach_id;

    -- Get current branch assignments
    SELECT STRING_AGG(b.name, ', ' ORDER BY b.name) INTO v_existing_branches
    FROM coach_branches cb
    JOIN branches b ON cb.branch_id = b.id
    WHERE cb.coach_id = v_coach_id;

    IF v_existing_branches IS NOT NULL THEN
        RAISE NOTICE '📍 Current branches: %', v_existing_branches;
    ELSE
        RAISE NOTICE '⚠️  Coach has no branch assignments yet';
    END IF;

    -- Find НИШ branch (flexible search)
    SELECT id, name INTO v_nish_branch_id, v_branch_name
    FROM branches
    WHERE name ILIKE '%НИШ%' OR name ILIKE '%NISH%'
    LIMIT 1;

    IF v_nish_branch_id IS NULL THEN
        RAISE EXCEPTION 'НИШ branch not found. Available branches: %',
            (SELECT STRING_AGG(name, ', ') FROM branches);
    END IF;

    RAISE NOTICE '✅ Found НИШ branch: "%" (ID: %)', v_branch_name, v_nish_branch_id;

    -- Insert coach-branch assignment (if not already exists)
    INSERT INTO coach_branches (coach_id, branch_id)
    VALUES (v_coach_id, v_nish_branch_id)
    ON CONFLICT (coach_id, branch_id) DO NOTHING;

    RAISE NOTICE '✅ Successfully assigned % to НИШ branch', v_coach_name;
END $$;

-- STEP 2: Verify the assignment
DO $$
DECLARE
    v_result RECORD;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE 'VERIFICATION: Assylbek Branch Assignments';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

    FOR v_result IN
        SELECT
            c.first_name,
            c.last_name,
            c.email,
            STRING_AGG(b.name, ', ' ORDER BY b.name) as assigned_branches,
            COUNT(cb.branch_id) as total_branches
        FROM coaches c
        JOIN coach_branches cb ON c.id = cb.coach_id
        JOIN branches b ON cb.branch_id = b.id
        WHERE c.email = 'asyl.aibekuly@gmail.com'
        GROUP BY c.id, c.first_name, c.last_name, c.email
    LOOP
        RAISE NOTICE '👤 Coach: % %', v_result.first_name, v_result.last_name;
        RAISE NOTICE '📧 Email: %', v_result.email;
        RAISE NOTICE '🏢 Assigned Branches (%): %', v_result.total_branches, v_result.assigned_branches;
    END LOOP;
END $$;

-- STEP 3: Verify НИШ branch coaches
DO $$
DECLARE
    v_result RECORD;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE 'VERIFICATION: НИШ Branch Coaches';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

    FOR v_result IN
        SELECT
            b.name as branch,
            STRING_AGG(c.first_name || ' ' || c.last_name, ', ' ORDER BY c.last_name) as coaches,
            COUNT(cb.coach_id) as total_coaches
        FROM branches b
        JOIN coach_branches cb ON b.id = cb.branch_id
        JOIN coaches c ON cb.coach_id = c.id
        WHERE b.name ILIKE '%НИШ%' OR b.name ILIKE '%NISH%'
        GROUP BY b.id, b.name
    LOOP
        RAISE NOTICE '🏢 Branch: %', v_result.branch;
        RAISE NOTICE '👥 Total Coaches: %', v_result.total_coaches;
        RAISE NOTICE '📝 Coaches: %', v_result.coaches;
    END LOOP;

    IF NOT FOUND THEN
        RAISE NOTICE '⚠️  No coaches found for НИШ branch';
    END IF;

    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '';
END $$;

-- STEP 4: Final summary
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 020 complete!';
    RAISE NOTICE '✅ Coach Assylbek Aibekuly is now assigned to НИШ branch';
    RAISE NOTICE '✅ Admins can now select Assylbek when adding students to НИШ';
END $$;
