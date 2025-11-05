# Supabase Setup Guide - Chess Empire Database

## Step 1: Create Students Table in Supabase

Go to your Supabase project → SQL Editor → Click "New Query" and run this SQL:

```sql
-- ============================================
-- STUDENTS TABLE FOR CHESS EMPIRE
-- ============================================
-- Simplified version for development (public access)
-- ============================================

-- Create students table
CREATE TABLE IF NOT EXISTS public.students (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Personal Information
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    age INTEGER CHECK (age >= 4 AND age <= 18),
    date_of_birth DATE,
    gender TEXT CHECK (gender IN ('male', 'female')),
    photo_url TEXT,

    -- Chess Information
    razryad TEXT DEFAULT 'none' CHECK (razryad IN ('none', '3rd', '2nd', '1st', 'kms', 'master')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'left')),

    -- Progress Tracking
    current_level INTEGER DEFAULT 1 CHECK (current_level >= 1 AND current_level <= 8),
    current_lesson INTEGER DEFAULT 1 CHECK (current_lesson >= 1),
    total_lessons INTEGER DEFAULT 40 CHECK (total_lessons >= 1),

    -- Relationships (Foreign Keys)
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    coach_id UUID REFERENCES public.coaches(id) ON DELETE SET NULL,

    -- Parent/Guardian Information
    parent_name TEXT,
    parent_phone TEXT,
    parent_email TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CREATE INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_students_name ON public.students(first_name, last_name);
CREATE INDEX IF NOT EXISTS idx_students_branch ON public.students(branch_id);
CREATE INDEX IF NOT EXISTS idx_students_coach ON public.students(coach_id);
CREATE INDEX IF NOT EXISTS idx_students_status ON public.students(status);
CREATE INDEX IF NOT EXISTS idx_students_created_at ON public.students(created_at DESC);

-- ============================================
-- AUTO-UPDATE TIMESTAMP TRIGGER
-- ============================================

-- Create function if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for students
DROP TRIGGER IF EXISTS update_students_updated_at ON public.students;
CREATE TRIGGER update_students_updated_at
    BEFORE UPDATE ON public.students
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY (PUBLIC ACCESS FOR DEV)
-- ============================================

-- Enable RLS
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- Allow public access for development
CREATE POLICY "Allow public read access" ON public.students FOR SELECT USING (true);
CREATE POLICY "Allow public insert access" ON public.students FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access" ON public.students FOR UPDATE USING (true);
CREATE POLICY "Allow public delete access" ON public.students FOR DELETE USING (true);
```

## Step 2: Verify Table Creation

After running the SQL above, verify the table was created:

```sql
-- Check table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'students'
ORDER BY ordinal_position;
```

## Step 3: Test Manual Student Addition

1. Open your Chess Empire admin dashboard at `http://localhost:8000/admin.html`
2. Click "Add Student" button
3. Fill in the form:
   - First Name: Test
   - Last Name: Student
   - Age: 10
   - Date of Birth: 2014-01-15
   - Gender: male
   - Branch: Select from dropdown
   - Coach: Select from dropdown
   - Parent Name: Parent Test
   - Parent Phone: +7 777 123 4567
   - Parent Email: parent@test.kz

4. Click "Add Student"
5. Verify the student appears in the table

## Step 4: Test JSON Import

### Sample JSON Format

Create a file `students_import.json`:

```json
{
  "students": [
    {
      "firstName": "Amir",
      "lastName": "Kazhymukan",
      "age": 10,
      "dateOfBirth": "2014-05-15",
      "gender": "male",
      "branch": "Gagarin Park",
      "coach": "Nursultan Bektasov",
      "razryad": "3rd",
      "status": "active",
      "currentLevel": 3,
      "currentLesson": 15,
      "totalLessons": 40,
      "parentName": "Kazhymukan Nurlan",
      "parentPhone": "+7 (777) 123-45-67",
      "parentEmail": "nurlan@example.kz"
    },
    {
      "firstName": "Aliya",
      "lastName": "Serikbayeva",
      "age": 8,
      "dateOfBirth": "2016-03-22",
      "gender": "female",
      "branch": "Debut",
      "coach": "Aida Smailova",
      "razryad": "none",
      "status": "active",
      "currentLevel": 2,
      "currentLesson": 8,
      "totalLessons": 40,
      "parentName": "Serikbayev Yerlan",
      "parentPhone": "+7 (777) 234-56-78",
      "parentEmail": "yerlan@example.kz"
    }
  ]
}
```

### How to Import:

1. Go to admin dashboard
2. Click "Data Management" in sidebar
3. Click "Import Data"
4. Select the `students_import.json` file
5. Verify students appear in the table

## Step 5: Verify in Supabase Dashboard

1. Go to Supabase Dashboard → Table Editor
2. Select `students` table
3. You should see all imported students with:
   - UUID primary keys
   - Foreign keys to branches and coaches
   - All fields properly populated

## Step 6: Test CRUD Operations

### Test Read:
- View student list in dashboard
- Click on a student name to view details

### Test Update:
- Click "Edit" button on a student
- Change any field (e.g., current level)
- Save and verify changes in Supabase

### Test Delete:
- Click "Delete" button on a test student
- Confirm deletion
- Verify student is removed from Supabase

## Troubleshooting

### Error: "relation public.students does not exist"
- Make sure you ran the SQL in Step 1 in Supabase SQL Editor
- Check the schema is "public" not "auth" or other

### Error: "Branch not found" or "Coach not found"
- Make sure branches and coaches tables have data
- Verify branch_id and coach_id are valid UUIDs from those tables

### Error: "permission denied"
- Check RLS policies are set to allow public access
- Verify `ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;` was run
- Ensure all 4 public access policies were created

### Data not appearing in UI:
- Check browser console for errors
- Verify Supabase config in `supabase-config.js` is correct
- Clear browser cache (Ctrl+Shift+R)
- Check Network tab for failed API calls

## Production Security

⚠️ **IMPORTANT**: The current RLS policies allow public access for development.

Before deploying to production:
1. Remove public access policies
2. Implement proper authentication (Supabase Auth)
3. Use the full `supabase-schema.sql` with role-based policies
4. Create admin user and assign role
5. Require authentication for all CRUD operations

## Next Steps

After students table is working:
1. Test bulk import with larger JSON files
2. Implement photo upload for student photos
3. Add data validation on frontend
4. Implement search and filtering
5. Add pagination for large student lists
