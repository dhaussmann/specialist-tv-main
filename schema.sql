-- Database schema for Knowledge Management POC

-- Videos table - core video metadata
CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    stream_id TEXT UNIQUE NOT NULL, -- Cloudflare Stream video ID
    thumbnail_url TEXT,
    duration INTEGER, -- in seconds
    file_size INTEGER, -- in bytes
    upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'processing', -- processing, ready, error
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Transcripts table - AI-generated transcripts
CREATE TABLE IF NOT EXISTS transcripts (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL,
    content TEXT NOT NULL,
    language TEXT DEFAULT 'en',
    confidence_score REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
);

-- Tags table - AI-generated tags for searchability
CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    category TEXT, -- topic, product, customer_type, difficulty, etc.
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Video tags junction table
CREATE TABLE IF NOT EXISTS video_tags (
    video_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    confidence_score REAL DEFAULT 1.0,
    PRIMARY KEY (video_id, tag_id),
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- Chapters table - AI-generated video chapters
CREATE TABLE IF NOT EXISTS chapters (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL,
    title TEXT NOT NULL,
    start_time INTEGER NOT NULL, -- in seconds
    end_time INTEGER NOT NULL, -- in seconds
    summary TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
);

-- Search index for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
    video_id,
    title,
    description,
    transcript_content,
    tags,
    content='videos',
    content_rowid='rowid'
);

-- Webhooks table - for notification tracking
CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL, -- video_uploaded, processing_complete, etc.
    payload TEXT NOT NULL, -- JSON payload
    status TEXT DEFAULT 'pending', -- pending, sent, failed
    attempts INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sent_at DATETIME
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_upload_date ON videos(upload_date DESC);
CREATE INDEX IF NOT EXISTS idx_transcripts_video_id ON transcripts(video_id);
CREATE INDEX IF NOT EXISTS idx_chapters_video_id ON chapters(video_id);
CREATE INDEX IF NOT EXISTS idx_video_tags_video_id ON video_tags(video_id);
CREATE INDEX IF NOT EXISTS idx_video_tags_tag_id ON video_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_status ON webhooks(status);
