-- Chess Empire Data Migration
-- Insert existing data from data.js into Supabase tables

-- ============================================
-- 1. INSERT BRANCHES
-- ============================================

INSERT INTO branches (name, location, phone, email) VALUES
('Gagarin Park', 'Almaty, Gagarin Park', '+7 (727) 250-12-34', 'gagarinpark@chessempire.kz'),
('Debut', 'Almaty, Auezov District', '+7 (727) 251-23-45', 'debut@chessempire.kz'),
('Almaty Arena', 'Almaty, Bostandyk District', '+7 (727) 252-34-56', 'arena@chessempire.kz'),
('Halyk Arena', 'Almaty, Almaly District', '+7 (727) 253-45-67', 'halyk@chessempire.kz'),
('Zhandosova', 'Almaty, Zhandosov Street', '+7 (727) 254-56-78', 'zhandosova@chessempire.kz'),
('Abaya Rozybakieva', 'Almaty, Abay Avenue', '+7 (727) 255-67-89', 'abaya@chessempire.kz'),
('Almaty 1', 'Almaty, Railway Station Area', '+7 (727) 256-78-90', 'almaty1@chessempire.kz');

-- ============================================
-- 2. INSERT COACHES (with branch references)
-- ============================================

-- Get branch IDs for reference
WITH branch_ids AS (
    SELECT id, name FROM branches
)
INSERT INTO coaches (first_name, last_name, phone, email, branch_id)
SELECT
    split_part(coach_name, ' ', 1) as first_name,
    split_part(coach_name, ' ', 2) as last_name,
    phone,
    email,
    b.id as branch_id
FROM (VALUES
    ('Nurgalimov Chingis', '+7 (701) 123-45-67', 'chingis@chessempire.kz', 'Gagarin Park'),
    ('Aidar Serik', '+7 (701) 234-56-78', 'aidar@chessempire.kz', 'Debut'),
    ('Nurlan Bakytzhan', '+7 (701) 345-67-89', 'nurlan@chessempire.kz', 'Almaty Arena'),
    ('Damir Arman', '+7 (701) 456-78-90', 'damir@chessempire.kz', 'Halyk Arena'),
    ('Arman Marat', '+7 (701) 567-89-01', 'arman@chessempire.kz', 'Zhandosova'),
    ('Serik Mukhtar', '+7 (701) 678-90-12', 'serik@chessempire.kz', 'Abaya Rozybakieva'),
    ('Mukhtar Bekzat', '+7 (701) 789-01-23', 'mukhtar@chessempire.kz', 'Almaty 1'),
    ('Bekzat Kanat', '+7 (701) 890-12-34', 'bekzat@chessempire.kz', 'Gagarin Park'),
    ('Kanat Samat', '+7 (701) 901-23-45', 'kanat@chessempire.kz', 'Debut'),
    ('Samat Azamat', '+7 (701) 012-34-56', 'samat@chessempire.kz', 'Almaty Arena')
) AS coach_data(coach_name, phone, email, branch_name)
LEFT JOIN branch_ids b ON b.name = coach_data.branch_name;

-- ============================================
-- 3. INSERT STUDENTS (Note: This is a sample - you'll need to run a script to convert all 70 students)
-- ============================================

-- Sample insert for first few students
-- You'll need to get the actual branch_id and coach_id from Supabase after branches and coaches are inserted

-- This is a template - actual migration will need UUIDs from Supabase
-- INSERT INTO students (first_name, last_name, age, branch_id, coach_id, razryad, status, current_level, current_lesson, total_lessons)
-- VALUES ...

-- ============================================
-- 4. CREATE ADMIN USER ROLE
-- ============================================

-- After creating the admin user via Supabase Auth UI with:
-- Email: 0xmarblemaster@gmail.com
-- Password: TheBestGame2025!

-- Then run this (replace <admin-uuid> with actual user UUID):
-- INSERT INTO user_roles (user_id, role)
-- VALUES ('<admin-uuid>', 'admin');

-- ============================================
-- NOTES FOR MANUAL EXECUTION
-- ============================================

/*
TO EXECUTE THIS MIGRATION:

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. First, run the schema file (supabase-schema.sql)
4. Then run this migration file (supabase-data-migration.sql)
5. Create the admin user via Auth > Users > Invite User:
   - Email: 0xmarblemaster@gmail.com
   - Set password: TheBestGame2025!
6. Get the user UUID from auth.users table
7. Insert admin role:
   INSERT INTO user_roles (user_id, role)
   VALUES ('<your-admin-uuid>', 'admin');

8. For the complete student data migration, you can use the JavaScript migration script
   that will be created next to programmatically insert all 70 students.
*/
