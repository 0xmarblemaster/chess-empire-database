# Database Migrations

This folder contains SQL migration scripts for the Chess Empire database.

## How to Run Migrations

### Option 1: Supabase Dashboard (Recommended)
1. Go to your Supabase project dashboard: https://supabase.com/dashboard/project/zvvunwglxuavjnzatpfj
2. Navigate to **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy the contents of the migration file
5. Paste into the SQL Editor
6. Click **Run** to execute

### Option 2: Supabase CLI
```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref zvvunwglxuavjnzatpfj

# Run the migration
supabase db execute --file migrations/update_total_lessons_to_105.sql
supabase db execute --file migrations/update_razryad_constraint.sql
```

## Migration History

### 2025-01-07: update_razryad_constraint.sql
**Purpose**: Update razryad constraint to add 4th and remove master

**Changes**:
- Updates any existing students with 'master' razryad to NULL
- Drops the existing CHECK constraint `students_razryad_check`
- Adds new CHECK constraint allowing: 'none', '4th', '3rd', '2nd', '1st', 'kms'
- Removes 'master' from allowed values

**Impact**:
- Allows admins to assign '4th' razryad to students
- Removes 'master' as a valid razryad option
- Any students with 'master' will have their razryad set to NULL

**Rollback** (if needed):
```sql
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_razryad_check;
ALTER TABLE students ADD CONSTRAINT students_razryad_check
CHECK (razryad IN ('none', '3rd', '2nd', '1st', 'kms', 'master'));
```

### 2025-01-06: update_total_lessons_to_105.sql
**Purpose**: Update total lessons from 40 to 105

**Changes**:
- Alters the `students` table default value for `total_lessons` from 40 to 105
- Updates all existing students with `total_lessons = 40` to `total_lessons = 105`
- Fixes progress calculation issues where students beyond lesson 40 showed >100% progress

**Impact**:
- All 345 students will be updated
- Progress calculations will now show correct percentages (e.g., lesson 51/105 = 49% instead of 127%)
- New students will automatically get `total_lessons = 105`

**Rollback** (if needed):
```sql
ALTER TABLE students ALTER COLUMN total_lessons SET DEFAULT 40;
UPDATE students SET total_lessons = 40 WHERE total_lessons = 105;
```
