-- SQL to diagnose and fix RLS policies for shader_likes
-- Run this in your Supabase SQL Editor

-- First, let's check the current RLS policies
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive, 
    roles, 
    cmd, 
    qual, 
    with_check
FROM pg_policies 
WHERE tablename = 'shader_likes';

-- Now let's ensure the correct RLS policies are in place
-- These policies allow users to:
-- 1. Insert their own likes
-- 2. Delete their own likes
-- 3. View all likes (needed for counting)

-- Drop existing policies (if any)
DROP POLICY IF EXISTS "Users can insert their own likes" ON shader_likes;
DROP POLICY IF EXISTS "Users can delete their own likes" ON shader_likes;
DROP POLICY IF EXISTS "Anyone can view likes" ON shader_likes;

-- Create proper RLS policies

-- Allow authenticated users to insert their own likes
CREATE POLICY "Users can insert their own likes"
ON shader_likes
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to delete their own likes
CREATE POLICY "Users can delete their own likes"
ON shader_likes
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Allow anyone to view likes (needed for counting and checking)
CREATE POLICY "Anyone can view likes"
ON shader_likes
FOR SELECT
TO authenticated, anon
USING (true);

-- Verify RLS is enabled
ALTER TABLE shader_likes ENABLE ROW LEVEL SECURITY;

-- Check the result
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive, 
    roles, 
    cmd
FROM pg_policies 
WHERE tablename = 'shader_likes';

