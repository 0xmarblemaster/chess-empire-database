# Update Total Lessons to 120 - Migration Guide

## Problem
Student cards are showing "Lesson X of 105" instead of "Lesson X of 120" because:
1. The database has old records with `total_lessons = 105`
2. The schema default was set to 105

## Solution
We need to:
1. ✅ Update code defaults (DONE)
2. ✅ Update schema default (DONE)
3. ⏳ Run database migration to update existing students

## Quick Fix - Run This SQL in Supabase

### Option 1: Via Supabase Dashboard (Recommended)

1. Go to your Supabase Dashboard: https://app.supabase.com
2. Select your project: `papgcizhfkngubwofjuo`
3. Navigate to **SQL Editor** (left sidebar)
4. Click **New Query**
5. Paste this SQL:

```sql
-- Update all existing students to have 120 total lessons
UPDATE students
SET total_lessons = 120
WHERE total_lessons = 105;

-- Update the default value for future students
ALTER TABLE students
ALTER COLUMN total_lessons SET DEFAULT 120;

-- Verify the changes
SELECT
    COUNT(*) as total_students,
    COUNT(CASE WHEN total_lessons = 120 THEN 1 END) as students_with_120,
    COUNT(CASE WHEN total_lessons = 105 THEN 1 END) as students_with_105
FROM students;
```

6. Click **Run** (or press Ctrl+Enter)
7. Check the results - you should see all students now have 120 total lessons

### Option 2: Via Supabase CLI

If you have Supabase CLI installed:

```bash
cd /home/marblemaster/Desktop/Cursor/chess-empire-database
npx supabase db execute --file migrations/update_total_lessons_to_120.sql
```

## Verification

After running the migration:

1. Refresh your browser at http://localhost:3000/student.html
2. Check any student card
3. You should now see "Lesson X of 120" instead of "Lesson X of 105"

## What Was Changed

### Code Files Updated:
- ✅ `crud.js` (line 242) - Default value for new students: 105 → 120
- ✅ `crud.js` (line 851) - Default value in import function: 105 → 120
- ✅ `supabase-data.js` (line 120) - Default value in Supabase operations: 105 → 120
- ✅ `admin.js` (line 1596) - Default value in admin form: 105 → 120
- ✅ `supabase-schema.sql` (line 46) - Schema default: 105 → 120

### Database Migration:
- ⏳ `migrations/update_total_lessons_to_120.sql` - Created (needs to be run)

## Impact

- **New students**: Will automatically get `total_lessons = 120`
- **Existing students**: Need the migration SQL to be run once
- **Progress calculation**: Will show correct percentage based on 120 lessons
  - Example: Lesson 12 of 120 = 10% (instead of 11% with 105)

## Rollback (if needed)

If you need to revert this change:

```sql
-- Revert to 105
UPDATE students SET total_lessons = 105 WHERE total_lessons = 120;
ALTER TABLE students ALTER COLUMN total_lessons SET DEFAULT 105;
```
