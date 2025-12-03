-- ============================================
-- DIAGNOSE: Check if "test test" student exists in Supabase
-- ============================================

-- Step 1: Search for student by name
SELECT
    'Search by Name' as check_type,
    id,
    first_name,
    last_name,
    age,
    branch_id,
    coach_id,
    status,
    created_at,
    updated_at
FROM students
WHERE LOWER(first_name) LIKE '%test%'
   OR LOWER(last_name) LIKE '%test%'
ORDER BY created_at DESC;

-- Step 2: Count total students in Supabase
SELECT
    'Total Students in DB' as check_type,
    COUNT(*) as total_count,
    COUNT(CASE WHEN status = 'active' THEN 1 END) as active_count,
    COUNT(CASE WHEN status = 'frozen' THEN 1 END) as frozen_count,
    COUNT(CASE WHEN status = 'left' THEN 1 END) as left_count
FROM students;

-- Step 3: Check recent students (last 10 added)
SELECT
    'Recent Students' as check_type,
    id,
    first_name,
    last_name,
    age,
    status,
    created_at
FROM students
ORDER BY created_at DESC
LIMIT 10;

-- Step 4: Check if there are any students with NULL or invalid IDs
SELECT
    'Invalid IDs Check' as check_type,
    id,
    first_name,
    last_name,
    CASE
        WHEN id IS NULL THEN '❌ NULL ID'
        WHEN id = '' THEN '❌ Empty ID'
        ELSE '✓ Valid ID'
    END as id_status
FROM students
WHERE id IS NULL OR id = ''
LIMIT 10;

-- Step 5: Check students at Halyk Arena (same branch as "test test")
SELECT
    'Halyk Arena Students' as check_type,
    s.id,
    s.first_name,
    s.last_name,
    s.age,
    b.name as branch_name,
    c.first_name || ' ' || c.last_name as coach_name,
    s.status
FROM students s
LEFT JOIN branches b ON b.id = s.branch_id
LEFT JOIN coaches c ON c.id = s.coach_id
WHERE b.name = 'Halyk Arena'
ORDER BY s.created_at DESC
LIMIT 20;
