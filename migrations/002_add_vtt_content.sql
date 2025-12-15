-- Add VTT content column to transcripts table
ALTER TABLE transcripts ADD COLUMN vtt_content TEXT;

-- Create index for better performance when querying VTT content
CREATE INDEX IF NOT EXISTS idx_transcripts_video_id ON transcripts(video_id);
