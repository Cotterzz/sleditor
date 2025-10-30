-- Add user_display_name column to shader_comments table
-- Run this in your Supabase SQL Editor

ALTER TABLE shader_comments 
ADD COLUMN IF NOT EXISTS user_display_name text;

-- Optional: Create an index for faster queries
CREATE INDEX IF NOT EXISTS shader_comments_user_display_name_idx 
ON shader_comments(user_display_name);

