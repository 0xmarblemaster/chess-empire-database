-- ============================================
-- COACH PROFILE FIELDS MIGRATION
-- Run this in Supabase SQL Editor
-- ============================================

-- Purpose: Add photo, bio, and social link fields to coaches table
-- for enhanced Coach Personal Cards

-- Step 1: Add new columns to coaches table
ALTER TABLE coaches
ADD COLUMN IF NOT EXISTS photo_url TEXT,
ADD COLUMN IF NOT EXISTS bio TEXT,
ADD COLUMN IF NOT EXISTS instagram_url TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_url TEXT;

-- Step 2: Create index for coach photo lookups (optional optimization)
CREATE INDEX IF NOT EXISTS idx_coaches_photo_url ON coaches(photo_url) WHERE photo_url IS NOT NULL;

-- ============================================
-- STORAGE BUCKET SETUP (Manual Step)
-- ============================================
-- NOTE: You must manually create the 'coach-photos' storage bucket in Supabase Dashboard:
-- 1. Go to Storage > Create Bucket
-- 2. Name: coach-photos
-- 3. Public bucket: Yes (to allow public URL access)
-- 4. File size limit: 5MB recommended
-- 5. Allowed MIME types: image/jpeg, image/png, image/webp

-- Step 3: Storage policies for coach-photos bucket
-- Run these AFTER creating the bucket

-- Policy: Authenticated users can upload coach photos
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'coach-photos') THEN
        DROP POLICY IF EXISTS "Authenticated users can upload coach photos" ON storage.objects;
        CREATE POLICY "Authenticated users can upload coach photos"
            ON storage.objects FOR INSERT
            WITH CHECK (
                bucket_id = 'coach-photos'
                AND auth.role() = 'authenticated'
            );
    END IF;
END $$;

-- Policy: Authenticated users can update coach photos
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'coach-photos') THEN
        DROP POLICY IF EXISTS "Authenticated users can update coach photos" ON storage.objects;
        CREATE POLICY "Authenticated users can update coach photos"
            ON storage.objects FOR UPDATE
            USING (
                bucket_id = 'coach-photos'
                AND auth.role() = 'authenticated'
            );
    END IF;
END $$;

-- Policy: Authenticated users can delete coach photos
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'coach-photos') THEN
        DROP POLICY IF EXISTS "Authenticated users can delete coach photos" ON storage.objects;
        CREATE POLICY "Authenticated users can delete coach photos"
            ON storage.objects FOR DELETE
            USING (
                bucket_id = 'coach-photos'
                AND auth.role() = 'authenticated'
            );
    END IF;
END $$;

-- Policy: Anyone can view coach photos
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'coach-photos') THEN
        DROP POLICY IF EXISTS "Anyone can view coach photos" ON storage.objects;
        CREATE POLICY "Anyone can view coach photos"
            ON storage.objects FOR SELECT
            USING (bucket_id = 'coach-photos');
    END IF;
END $$;

-- Success message
SELECT 'Coach profile fields added successfully! Remember to create the coach-photos storage bucket.' as result;
