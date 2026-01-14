-- ============================================
-- FIX COACH PHOTOS STORAGE POLICIES
-- Run this in Supabase SQL Editor
-- ============================================

-- The previous migration used auth.role() = 'authenticated' which doesn't work
-- correctly in Supabase storage policies. Use auth.uid() IS NOT NULL instead.

-- Step 1: Drop existing policies (if any)
DROP POLICY IF EXISTS "Authenticated users can upload coach photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update coach photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete coach photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view coach photos" ON storage.objects;

-- Step 2: Create corrected storage policies for coach-photos bucket

-- Policy: Authenticated users can upload coach photos
CREATE POLICY "Authenticated users can upload coach photos"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'coach-photos'
        AND auth.uid() IS NOT NULL
    );

-- Policy: Authenticated users can update coach photos
CREATE POLICY "Authenticated users can update coach photos"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'coach-photos'
        AND auth.uid() IS NOT NULL
    )
    WITH CHECK (
        bucket_id = 'coach-photos'
        AND auth.uid() IS NOT NULL
    );

-- Policy: Authenticated users can delete coach photos
CREATE POLICY "Authenticated users can delete coach photos"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'coach-photos'
        AND auth.uid() IS NOT NULL
    );

-- Policy: Anyone can view coach photos (public bucket)
CREATE POLICY "Anyone can view coach photos"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'coach-photos');

-- ============================================
-- IMPORTANT: Make sure the bucket exists first!
-- ============================================
-- If the bucket doesn't exist, create it in Supabase Dashboard:
-- 1. Go to Storage > Create Bucket
-- 2. Name: coach-photos
-- 3. Public bucket: Yes
-- 4. File size limit: 5MB
-- 5. Allowed MIME types: image/jpeg, image/png, image/webp

-- Verify policies were created:
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE tablename = 'objects'
AND policyname LIKE '%coach%';
