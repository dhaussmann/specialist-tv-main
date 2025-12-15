// Service to check if video processing pipeline is complete
export class VideoCompletionChecker {
  constructor(private env: CloudflareEnv) {}

  /**
   * Check if all processing steps are complete for a video
   * Returns true only when transcript, tags, chapters, abstract, and title are all generated
   */
  async isProcessingComplete(videoId: string): Promise<boolean> {
    try {
      // Check if transcript exists
      const transcript = await this.env.DB.prepare(`
        SELECT id FROM transcripts WHERE video_id = ?
      `).bind(videoId).first();

      if (!transcript) {
        return false;
      }

      // Check if tags exist
      const tags = await this.env.DB.prepare(`
        SELECT video_id FROM video_tags WHERE video_id = ? LIMIT 1
      `).bind(videoId).first();

      if (!tags) {
        return false;
      }

      // Check if chapters exist
      const chapters = await this.env.DB.prepare(`
        SELECT id FROM chapters WHERE video_id = ? LIMIT 1
      `).bind(videoId).first();

      if (!chapters) {
        return false;
      }

      // Check if video has abstract and generated title
      const video = await this.env.DB.prepare(`
        SELECT abstract, title FROM videos WHERE id = ?
      `).bind(videoId).first() as { abstract: string | null; title: string } | null;

      if (!video || !video.abstract || !video.title) {
        return false;
      }

      // All processing steps are complete
      return true;
    } catch (error) {
      console.error(`Error checking processing completion for video ${videoId}:`, error);
      return false;
    }
  }

  /**
   * Get processing status details for a video
   */
  async getProcessingStatus(videoId: string): Promise<{
    transcript: boolean;
    tags: boolean;
    chapters: boolean;
    abstract: boolean;
    title: boolean;
    complete: boolean;
  }> {
    try {
      const transcript = await this.env.DB.prepare(`
        SELECT id FROM transcripts WHERE video_id = ?
      `).bind(videoId).first();

      const tags = await this.env.DB.prepare(`
        SELECT video_id FROM video_tags WHERE video_id = ? LIMIT 1
      `).bind(videoId).first();

      const chapters = await this.env.DB.prepare(`
        SELECT id FROM chapters WHERE video_id = ? LIMIT 1
      `).bind(videoId).first();

      const video = await this.env.DB.prepare(`
        SELECT abstract, title FROM videos WHERE id = ?
      `).bind(videoId).first() as { abstract: string | null; title: string } | null;

      const status = {
        transcript: !!transcript,
        tags: !!tags,
        chapters: !!chapters,
        abstract: !!(video?.abstract),
        title: !!(video?.title),
        complete: false
      };

      status.complete = status.transcript && status.tags && status.chapters && status.abstract && status.title;

      return status;
    } catch (error) {
      console.error(`Error getting processing status for video ${videoId}:`, error);
      return {
        transcript: false,
        tags: false,
        chapters: false,
        abstract: false,
        title: false,
        complete: false
      };
    }
  }
}
