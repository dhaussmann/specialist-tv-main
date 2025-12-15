-- Migration: Add video_logs table for tracking processing events
-- Created: 2025-08-02

-- Video logs table - for tracking processing events and debugging
CREATE TABLE IF NOT EXISTS video_logs (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL,
    level TEXT NOT NULL, -- info, warning, error, debug
    event_type TEXT NOT NULL, -- upload, transcription, tagging, chapters, webhook, etc.
    message TEXT NOT NULL,
    details TEXT, -- JSON string with additional context
    duration_ms INTEGER, -- processing time in milliseconds
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_video_logs_video_id ON video_logs(video_id);
CREATE INDEX IF NOT EXISTS idx_video_logs_created_at ON video_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_logs_level ON video_logs(level);
CREATE INDEX IF NOT EXISTS idx_video_logs_event_type ON video_logs(event_type);
