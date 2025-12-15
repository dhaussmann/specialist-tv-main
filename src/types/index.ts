// Types for the Knowledge Management POC

export interface Video {
  id: string;
  title: string;
  description?: string;
  abstract?: string;
  stream_id: string;
  thumbnail_url?: string;
  duration?: number;
  file_size?: number;
  upload_date: string;
  status: 'processing' | 'ready' | 'error';
  tags?: string[];
  view_count?: number;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface Transcript {
  id: string;
  video_id: string;
  content: string;
  language: string;
  confidence_score?: number;
  created_at: string;
  created_by?: string;
}

export interface Tag {
  id: string;
  name: string;
  category?: string;
  created_at: string;
  created_by?: string;
}

export interface VideoTag {
  video_id: string;
  tag_id: string;
  confidence_score: number;
}

export interface Chapter {
  id: string;
  video_id: string;
  title: string;
  start_time: number;
  end_time: number;
  summary?: string;
  created_at: string;
  created_by?: string;
}

export interface Comment {
  id: string;
  video_id: string;
  parent_id?: string;
  content: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  replies?: Comment[];
}

export interface SearchResult {
  video: Video;
  transcript?: Transcript;
  tags: Tag[];
  chapters: Chapter[];
  relevance_score: number;
  search_type?: string; // Type of search that found this result: 'fts', 'semantic', 'tag', 'combined'
}

// Video with confidence score for search results display
export interface VideoWithScore extends Video {
  confidence_score?: number;
}

export interface UploadResponse {
  video_id: string;
  stream_id: string;
  upload_url: string;
}

export interface ProcessingJob {
  video_id: string;
  stream_id: string;
  type: 'transcription' | 'tagging' | 'chapters' | 'thumbnail' | 'abstract' | 'title_generation';
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface WebhookPayload {
  event_type: string;
  video_id: string;
  data: WebhookData;
  timestamp: string;
}

export interface WebhookData {
  status?: 'processing' | 'completed' | 'failed' | 'ready';
  stream_id?: string;
  duration?: number;
  thumbnail_url?: string;
  error_message?: string;
  progress?: number;
  [key: string]: unknown;
}

// Cloudflare Stream API response types
export interface StreamUploadResponse {
  result: {
    uid: string;
    uploadURL: string;
    watermark?: {
      uid: string;
    };
  };
  success: boolean;
  errors: unknown[];
  messages: unknown[];
}

export interface StreamInfoResponse {
  result: {
    uid: string;
    duration?: number;
    preview: string;
    status: {
      state: string;
      pctComplete: string;
    };
    meta: {
      name?: string;
    };
    created: string;
    modified: string;
    size?: number;
  };
  success: boolean;
  errors: unknown[];
  messages: unknown[];
}

export interface StreamVideoInfo {
  result: {
    uid: string;
    thumbnail: string;
    thumbnailTimestampPct: number;
    readyToStream: boolean;
    status: {
      state: string;
      pctComplete: string;
      errorReasonCode: string;
      errorReasonText: string;
    };
    meta: {
      [key: string]: string;
    };
    created: string;
    modified: string;
    size: number;
    preview: string;
    allowedOrigins: string[];
    requireSignedURLs: boolean;
    uploaded: string;
    uploadExpiry: string;
    maxSizeBytes: number;
    maxDurationSeconds: number;
    duration: number;
    input: {
      width: number;
      height: number;
    };
    playback: {
      hls: string;
      dash: string;
    };
    watermark?: {
      uid: string;
      size: number;
      height: number;
      width: number;
      created: string;
      downloadedFrom: string;
      name: string;
      opacity: number;
      padding: number;
      scale: number;
      position: string;
    };
  };
  success: boolean;
  errors: unknown[];
  messages: unknown[];
}
