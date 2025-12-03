-- ============================================
-- CHECK COACH USER ROLE CONFIGURATION
-- ============================================
-- Check the user_roles for vasilyevvasily.1997@mail.ru

SELECT
    'User Role Details' as check_type,
    ur.id,
    ur.user_id,
    ur.role,
    ur.coach_id,
    ur.can_view_all_students,
    ur.can_edit_students,
    ur.can_manage_branches,
    ur.can_manage_coaches,
    u.email
FROM user_roles ur
JOIN auth.users u ON u.id = ur.user_id
WHERE u.email = 'vasilyevvasily.1997@mail.ru';

-- Check if there's a matching coach record
SELECT
    'Matching Coach Record' as check_type,
    c.id as coach_id,
    c.first_name,
    c.last_name,
    c.email
FROM coaches c
WHERE c.email = 'vasilyevvasily.1997@mail.ru';

-- Check students assigned to this email
SELECT
    'Students Assigned' as check_type,
    s.id,
    s.first_name,
    s.last_name,
    s.coach_id,
    c.first_name as coach_first_name,
    c.last_name as coach_last_name,
    c.email as coach_email
FROM students s
LEFT JOIN coaches c ON c.id = s.coach_id
WHERE c.email = 'vasilyevvasily.1997@mail.ru';
