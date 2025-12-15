
export type LogLevel = 'debug' | 'info' | 'warning' | 'error';

export type EventType = 
  | 'upload' 
  | 'webhook' 
  | 'transcription' 
  | 'tagging' 
  | 'chapters' 
  | 'abstract'
  | 'title_generation'
  | 'update'
  | 'deletion' 
  | 'status_update'
  | 'error'
  | 'processing_start'
  | 'processing_complete';

export interface VideoLogEntry {
  id: string;
  video_id: string;
  level: LogLevel;
  event_type: EventType;
  message: string;
  details?: Record<string, unknown>;
  duration_ms?: number | null;
  created_at: string;
  created_by?: string;
}

export class VideoLogger {
  constructor(private env: CloudflareEnv) {}

  /**
   * Log an event for a video
   */
  async log(
    videoId: string,
    level: LogLevel,
    eventType: EventType,
    message: string,
    details?: Record<string, unknown>,
    durationMs?: number,
    createdBy?: string
  ): Promise<void> {
    try {
      const logId = crypto.randomUUID();
      
      await this.env.DB.prepare(`
        INSERT INTO video_logs (id, video_id, level, event_type, message, details, duration_ms, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        logId,
        videoId,
        level,
        eventType,
        message,
        details ? JSON.stringify(details) : null,
        durationMs || null,
        createdBy || null
      ).run();

      // Also log to console in development mode
      if (this.env.ENVIRONMENT === 'development') {
        const logMessage = `[${level.toUpperCase()}] Video ${videoId} - ${eventType}: ${message}`;
        if (details) {
          console.log(logMessage, details);
        } else {
          console.log(logMessage);
        }
      }
    } catch (error) {
      // Don't let logging errors break the main flow
      console.error('Failed to write video log:', error);
    }
  }

  /**
   * Log the start of a processing step and return a function to log completion
   */
  logProcessingStep(
    videoId: string,
    eventType: EventType,
    message: string,
    details?: Record<string, unknown>
  ) {
    const startTime = Date.now();
    
    // Log the start
    this.log(videoId, 'info', eventType, `Started: ${message}`, details);
    
    // Return completion function
    return {
      complete: (successMessage?: string, finalDetails?: Record<string, unknown>) => {
        const duration = Date.now() - startTime;
        this.log(
          videoId, 
          'info', 
          eventType, 
          successMessage || `Completed: ${message}`, 
          finalDetails || details, 
          duration
        );
      },
      error: (errorMessage: string, error?: Error | Record<string, unknown>) => {
        const duration = Date.now() - startTime;
        this.log(
          videoId, 
          'error', 
          eventType, 
          `Failed: ${errorMessage}`, 
          { originalDetails: details, error: error instanceof Error ? error.message : error }, 
          duration
        );
      }
    };
  }

  /**
   * Get logs for a specific video
   */
  async getVideoLogs(videoId: string, limit: number = 50): Promise<VideoLogEntry[]> {
    const result = await this.env.DB.prepare(`
      SELECT id, video_id, level, event_type, message, details, duration_ms, created_at, created_by
      FROM video_logs
      WHERE video_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(videoId, limit).all();

    return result.results.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      video_id: row.video_id as string,
      level: row.level as LogLevel,
      event_type: row.event_type as EventType,
      message: row.message as string,
      details: row.details ? JSON.parse(row.details as string) : undefined,
      duration_ms: (row.duration_ms as number | null) || undefined,
      created_at: row.created_at as string,
      created_by: row.created_by ? row.created_by as string : undefined,
    }));
  }

  /**
   * Get recent logs across all videos
   */
  async getRecentLogs(limit: number = 100): Promise<VideoLogEntry[]> {
    const result = await this.env.DB.prepare(`
      SELECT id, video_id, level, event_type, message, details, duration_ms, created_at
      FROM video_logs
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(limit).all();

    return result.results.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      video_id: row.video_id as string,
      level: row.level as LogLevel,
      event_type: row.event_type as EventType,
      message: row.message as string,
      details: row.details ? JSON.parse(row.details as string) : undefined,
      duration_ms: (row.duration_ms as number | null) || undefined,
      created_at: row.created_at as string,
    }));
  }

  /**
   * Get logs by level (for filtering errors, warnings, etc.)
   */
  async getLogsByLevel(level: LogLevel, limit: number = 50): Promise<VideoLogEntry[]> {
    const result = await this.env.DB.prepare(`
      SELECT id, video_id, level, event_type, message, details, duration_ms, created_at
      FROM video_logs
      WHERE level = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(level, limit).all();

    return result.results.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      video_id: row.video_id as string,
      level: row.level as LogLevel,
      event_type: row.event_type as EventType,
      message: row.message as string,
      details: row.details ? JSON.parse(row.details as string) : undefined,
      duration_ms: (row.duration_ms as number | null) || undefined,
      created_at: row.created_at as string,
    }));
  }

  /**
   * Clean up old logs (keep only recent ones)
   */
  async cleanupOldLogs(daysToKeep: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const result = await this.env.DB.prepare(`
      DELETE FROM video_logs
      WHERE created_at < ?
    `).bind(cutoffDate.toISOString()).run();

    return result.meta.changes || 0;
  }
}
