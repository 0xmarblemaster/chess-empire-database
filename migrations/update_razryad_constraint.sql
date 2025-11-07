-- Migration: Update razryad constraint to add 4th and remove master
-- Date: 2025-01-07
-- Description: Updates the CHECK constraint on students.razryad to:
--              - Add '4th' razryad option
--              - Remove 'master' option
--              - Update any existing students with 'master' to NULL

-- Step 1: Update any existing students with 'master' razryad to NULL
UPDATE students
SET razryad = NULL
WHERE razryad = 'master';

-- Step 2: Drop the existing CHECK constraint
ALTER TABLE students
DROP CONSTRAINT IF EXISTS students_razryad_check;

-- Step 3: Add the new CHECK constraint with updated values
ALTER TABLE students
ADD CONSTRAINT students_razryad_check
CHECK (razryad IN ('none', '4th', '3rd', '2nd', '1st', 'kms'));

-- Step 4: Update the default value (if needed)
ALTER TABLE students
ALTER COLUMN razryad SET DEFAULT 'none';

-- Verification query (run separately to check results)
-- SELECT DISTINCT razryad, COUNT(*) as count
-- FROM students
-- GROUP BY razryad
-- ORDER BY razryad;
