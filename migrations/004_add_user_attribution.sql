-- Migration: Add user attribution to all database objects and create comments table
-- This adds created_by and updated_by fields to track which user performed actions

-- Add user attribution to videos table
ALTER TABLE videos ADD COLUMN created_by TEXT;
ALTER TABLE videos ADD COLUMN updated_by TEXT;

-- Add user attribution to transcripts table
ALTER TABLE transcripts ADD COLUMN created_by TEXT;

-- Add user attribution to tags table
ALTER TABLE tags ADD COLUMN created_by TEXT;

-- Add user attribution to chapters table
ALTER TABLE chapters ADD COLUMN created_by TEXT;

-- Add user attribution to video_logs table
ALTER TABLE video_logs ADD COLUMN created_by TEXT;

-- Create comments table for video discussions
CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL,
    parent_id TEXT, -- For threaded comments/replies
    content TEXT NOT NULL,
    created_by TEXT NOT NULL, -- Username of commenter
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_videos_created_by ON videos(created_by);
CREATE INDEX IF NOT EXISTS idx_videos_updated_by ON videos(updated_by);
CREATE INDEX IF NOT EXISTS idx_transcripts_created_by ON transcripts(created_by);
CREATE INDEX IF NOT EXISTS idx_tags_created_by ON tags(created_by);
CREATE INDEX IF NOT EXISTS idx_chapters_created_by ON chapters(created_by);
CREATE INDEX IF NOT EXISTS idx_video_logs_created_by ON video_logs(created_by);
CREATE INDEX IF NOT EXISTS idx_comments_video_id ON comments(video_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_by ON comments(created_by);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at DESC);
