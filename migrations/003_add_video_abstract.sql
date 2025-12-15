-- Migration: Add abstract field to videos table
-- This will store AI-generated video abstracts for display in UI

ALTER TABLE videos ADD COLUMN abstract TEXT;

-- Create index for better query performance when filtering by abstract
CREATE INDEX IF NOT EXISTS idx_videos_abstract ON videos(abstract);
