-- Check if vasilyevvasily.1997@mail.ru has a role
SELECT
    u.id as user_id,
    u.email,
    u.email_confirmed_at,
    u.created_at,
    ur.role,
    ur.can_edit_students,
    ur.can_view_all_students,
    ur.can_manage_branches,
    ur.can_manage_coaches
FROM auth.users u
LEFT JOIN user_roles ur ON u.id = ur.user_id
WHERE u.email = 'vasilyevvasily.1997@mail.ru';
