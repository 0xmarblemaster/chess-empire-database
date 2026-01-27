-- ============================================
-- ATTENDANCE RECORDS BACKUP & DOCUMENTATION
-- Run this periodically to backup all attendance data
-- ============================================

-- Purpose: Create comprehensive backup of all attendance records
-- This prevents accidental data loss and provides audit trail
-- Run frequency: Weekly or before major changes

-- ============================================
-- FULL ATTENDANCE EXPORT WITH ALL DETAILS
-- ============================================

SELECT
    '========================================' as divider,
    'COMPLETE ATTENDANCE RECORDS BACKUP' as backup_type,
    NOW() as backup_timestamp;

-- Main attendance records with all related information
SELECT
    a.id as attendance_id,
    a.student_id,
    s.first_name || ' ' || s.last_name as student_name,
    s.parent_name,
    s.parent_phone,
    s.parent_email,
    a.attendance_date,
    a.is_present,
    a.schedule_type,
    a.time_slot,
    a.branch_id,
    b.name as branch_name,
    c.first_name || ' ' || c.last_name as coach_name,
    c.email as coach_email,
    a.created_at,
    a.updated_at,
    -- Additional context
    CASE
        WHEN a.is_present THEN 'Present'
        ELSE 'Absent'
    END as status,
    CASE a.schedule_type
        WHEN 'mon_wed' THEN 'Monday-Wednesday'
        WHEN 'tue_thu' THEN 'Tuesday-Thursday'
        WHEN 'mon_wed_fri' THEN 'Monday-Wednesday-Friday'
        WHEN 'sat_sun' THEN 'Saturday-Sunday'
        ELSE a.schedule_type
    END as schedule_description,
    -- Calculate age of record
    EXTRACT(DAY FROM NOW() - a.created_at) as days_since_created
FROM attendance a
LEFT JOIN students s ON s.id = a.student_id
LEFT JOIN branches b ON b.id = a.branch_id
LEFT JOIN coaches c ON c.id = s.coach_id
ORDER BY a.attendance_date DESC, b.name, s.last_name, s.first_name;

-- ============================================
-- ATTENDANCE SUMMARY STATISTICS
-- ============================================

SELECT
    '========================================' as divider,
    'ATTENDANCE STATISTICS' as section;

-- Total records count
SELECT
    'Total Attendance Records' as metric,
    COUNT(*) as count,
    MIN(attendance_date) as earliest_date,
    MAX(attendance_date) as latest_date
FROM attendance;

-- Records by branch
SELECT
    '========================================' as divider,
    'Records by Branch' as section;

SELECT
    b.name as branch_name,
    COUNT(*) as total_records,
    COUNT(*) FILTER (WHERE a.is_present = true) as present_count,
    COUNT(*) FILTER (WHERE a.is_present = false) as absent_count,
    ROUND(100.0 * COUNT(*) FILTER (WHERE a.is_present = true) / COUNT(*), 2) as attendance_percentage,
    MIN(a.attendance_date) as earliest_record,
    MAX(a.attendance_date) as latest_record
FROM attendance a
LEFT JOIN branches b ON b.id = a.branch_id
GROUP BY b.name
ORDER BY total_records DESC;

-- Records by schedule type
SELECT
    '========================================' as divider,
    'Records by Schedule Type' as section;

SELECT
    schedule_type,
    COUNT(*) as total_records,
    COUNT(DISTINCT student_id) as unique_students,
    COUNT(*) FILTER (WHERE is_present = true) as present_count,
    ROUND(100.0 * COUNT(*) FILTER (WHERE is_present = true) / COUNT(*), 2) as attendance_percentage
FROM attendance
GROUP BY schedule_type
ORDER BY total_records DESC;

-- Records by month (last 12 months)
SELECT
    '========================================' as divider,
    'Records by Month (Last 12 Months)' as section;

SELECT
    TO_CHAR(attendance_date, 'YYYY-MM') as year_month,
    COUNT(*) as total_records,
    COUNT(DISTINCT student_id) as unique_students,
    COUNT(*) FILTER (WHERE is_present = true) as present_count,
    ROUND(100.0 * COUNT(*) FILTER (WHERE is_present = true) / COUNT(*), 2) as attendance_percentage
FROM attendance
WHERE attendance_date >= NOW() - INTERVAL '12 months'
GROUP BY TO_CHAR(attendance_date, 'YYYY-MM')
ORDER BY year_month DESC;

-- Top students by attendance count
SELECT
    '========================================' as divider,
    'Top 20 Students by Attendance Records' as section;

SELECT
    s.first_name || ' ' || s.last_name as student_name,
    b.name as branch_name,
    COUNT(*) as total_records,
    COUNT(*) FILTER (WHERE a.is_present = true) as present_count,
    COUNT(*) FILTER (WHERE a.is_present = false) as absent_count,
    ROUND(100.0 * COUNT(*) FILTER (WHERE a.is_present = true) / COUNT(*), 2) as attendance_percentage
FROM attendance a
LEFT JOIN students s ON s.id = a.student_id
LEFT JOIN branches b ON b.id = s.branch_id
GROUP BY s.id, s.first_name, s.last_name, b.name
ORDER BY total_records DESC
LIMIT 20;

-- ============================================
-- DATA INTEGRITY CHECKS
-- ============================================

SELECT
    '========================================' as divider,
    'DATA INTEGRITY CHECKS' as section;

-- Check for orphaned records (no student)
SELECT
    'Orphaned Records (No Student)' as check_type,
    COUNT(*) as count
FROM attendance a
WHERE NOT EXISTS (
    SELECT 1 FROM students s WHERE s.id = a.student_id
);

-- Check for records with no branch
SELECT
    'Records with No Branch' as check_type,
    COUNT(*) as count
FROM attendance
WHERE branch_id IS NULL;

-- Check for duplicate records (same student, date, schedule, time slot)
SELECT
    'Potential Duplicate Records' as check_type,
    COUNT(*) as count
FROM (
    SELECT student_id, attendance_date, schedule_type, time_slot
    FROM attendance
    GROUP BY student_id, attendance_date, schedule_type, time_slot
    HAVING COUNT(*) > 1
) duplicates;

-- Check for future-dated records
SELECT
    'Future-Dated Records (Data Error?)' as check_type,
    COUNT(*) as count
FROM attendance
WHERE attendance_date > CURRENT_DATE;

-- ============================================
-- RECENT CHANGES (LAST 7 DAYS)
-- ============================================

SELECT
    '========================================' as divider,
    'Recent Changes (Last 7 Days)' as section;

SELECT
    a.id as attendance_id,
    s.first_name || ' ' || s.last_name as student_name,
    b.name as branch_name,
    a.attendance_date,
    a.is_present,
    a.schedule_type,
    a.time_slot,
    a.created_at,
    a.updated_at,
    CASE
        WHEN a.created_at = a.updated_at THEN 'Created'
        ELSE 'Modified'
    END as change_type
FROM attendance a
LEFT JOIN students s ON s.id = a.student_id
LEFT JOIN branches b ON b.id = a.branch_id
WHERE a.created_at >= NOW() - INTERVAL '7 days'
   OR a.updated_at >= NOW() - INTERVAL '7 days'
ORDER BY GREATEST(a.created_at, a.updated_at) DESC
LIMIT 100;

-- ============================================
-- BACKUP COMPLETION MESSAGE
-- ============================================

SELECT
    '========================================' as divider,
    'BACKUP COMPLETED' as status,
    NOW() as completion_time;

SELECT
    '✅ Attendance records backup completed successfully!' as result,
    'Total records: ' || COUNT(*) as record_count,
    'Date range: ' || MIN(attendance_date) || ' to ' || MAX(attendance_date) as date_range
FROM attendance;

-- ============================================
-- INSTRUCTIONS FOR RESTORATION
-- ============================================

/*
RESTORATION INSTRUCTIONS:
If you need to restore data from this backup:

1. This backup is READ-ONLY - it doesn't modify data
2. Save the query results to a CSV file for external backup
3. To restore specific records, use INSERT statements like:

INSERT INTO attendance (id, student_id, attendance_date, is_present, schedule_type, time_slot, branch_id, created_at, updated_at)
VALUES (
    'attendance-id-here',
    'student-id-here',
    '2026-01-15',
    true,
    'mon_wed',
    '15:00-16:00',
    'branch-id-here',
    '2026-01-15 10:00:00',
    '2026-01-15 10:00:00'
);

4. For bulk restoration, use CSV import:
   - Save results to CSV
   - Use Supabase dashboard: Table Editor → Import CSV
   - Or use psql: \copy attendance FROM 'backup.csv' CSV HEADER

5. Always test restoration on a staging environment first!
*/
