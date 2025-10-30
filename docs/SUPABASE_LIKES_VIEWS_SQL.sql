-- SQL Functions and Triggers for Views and Likes
-- Run these in your Supabase SQL Editor

-- Function to increment view count
CREATE OR REPLACE FUNCTION increment_view_count(shader_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE shaders
  SET view_count = view_count + 1
  WHERE id = shader_id;
END;
$$;

-- ============================================================================
-- AUTO-UPDATE LIKE COUNTS WITH TRIGGERS
-- ============================================================================

-- Function to automatically increment like count when a like is added
CREATE OR REPLACE FUNCTION increment_shader_like_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE shaders
  SET like_count = like_count + 1
  WHERE id = NEW.shader_id;
  RETURN NEW;
END;
$$;

-- Function to automatically decrement like count when a like is removed
CREATE OR REPLACE FUNCTION decrement_shader_like_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE shaders
  SET like_count = GREATEST(like_count - 1, 0)
  WHERE id = OLD.shader_id;
  RETURN OLD;
END;
$$;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trigger_increment_like_count ON shader_likes;
DROP TRIGGER IF EXISTS trigger_decrement_like_count ON shader_likes;

-- Create trigger for INSERT (when a like is added)
CREATE TRIGGER trigger_increment_like_count
AFTER INSERT ON shader_likes
FOR EACH ROW
EXECUTE FUNCTION increment_shader_like_count();

-- Create trigger for DELETE (when a like is removed)
CREATE TRIGGER trigger_decrement_like_count
AFTER DELETE ON shader_likes
FOR EACH ROW
EXECUTE FUNCTION decrement_shader_like_count();

