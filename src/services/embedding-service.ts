
export interface VideoEmbedding {
  id: string;
  videoId: string;
  chunkIndex: number;
  content: string;
  metadata: {
    videoTitle: string;
    videoDescription?: string;
    chunkStart?: number;
    chunkEnd?: number;
    tags?: string[];
  };
}

export interface SimilarVideo {
  videoId: string;
  score: number;
  content: string;
  metadata: VideoEmbedding['metadata'];
}

export class EmbeddingService {
  private env: CloudflareEnv;
  private readonly CHUNK_SIZE = 1000; // Characters per chunk
  private readonly CHUNK_OVERLAP = 200; // Overlap between chunks

  constructor(env: CloudflareEnv) {
    this.env = env;
  }

  /**
   * Generate embeddings for a video transcript and store in Vectorize
   */
  async generateAndStoreEmbeddings(
    videoId: string,
    transcript: string,
    videoTitle: string,
    videoDescription?: string,
    tags?: string[]
  ): Promise<number> {
    try {
      console.log(`🔄 Generating embeddings for video: ${videoId}`);

      // Split transcript into chunks for better semantic representation
      const chunks = this.chunkText(transcript);
      
      // Generate embeddings for each chunk
      const embeddings: VideoEmbedding[] = [];
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        // Generate embedding using Cloudflare AI
        const embeddingResponse = await this.env.AI.run('@cf/baai/bge-base-en-v1.5', {
          text: chunk.content
        }) as { data: number[][] };

        const embedding: VideoEmbedding = {
          id: `${videoId}-chunk-${i}`,
          videoId,
          chunkIndex: i,
          content: chunk.content,
          metadata: {
            videoTitle,
            videoDescription,
            chunkStart: chunk.start,
            chunkEnd: chunk.end,
            tags
          }
        };

        embeddings.push(embedding);

        // Store in Vectorize
        await this.env.VIDEO_EMBEDDINGS.upsert([{
          id: embedding.id,
          values: embeddingResponse.data[0],
          metadata: {
            videoId: embedding.videoId,
            chunkIndex: embedding.chunkIndex,
            content: embedding.content,
            videoTitle: embedding.metadata.videoTitle,
            videoDescription: embedding.metadata.videoDescription || '',
            chunkStart: embedding.metadata.chunkStart || 0,
            chunkEnd: embedding.metadata.chunkEnd || 0,
            tags: embedding.metadata.tags?.join(',') || ''
          }
        }]);
      }

      console.log(`✅ Generated and stored ${embeddings.length} embeddings for video: ${videoId}`);
      return embeddings.length;
    } catch (error) {
      console.error(`❌ Error generating embeddings for video ${videoId}:`, error);
      throw error;
    }
  }

  /**
   * Search for similar videos using vector similarity (original method)
   */
  async searchSimilarVideos(
    query: string,
    limit: number = 10,
    excludeVideoId?: string
  ): Promise<SimilarVideo[]> {
    return this.searchSimilarVideosOptimized(query, limit, excludeVideoId);
  }

  /**
   * Optimized search for similar videos using vector similarity
   */
  private async searchSimilarVideosOptimized(
    query: string,
    limit: number = 10,
    excludeVideoId?: string
  ): Promise<SimilarVideo[]> {
    try {
      // Truncate very long queries to improve AI model performance
      const truncatedQuery = query.length > 2000 ? query.substring(0, 2000) + '...' : query;
      
      // Generate embedding for the search query
      const queryEmbedding = await this.env.AI.run('@cf/baai/bge-base-en-v1.5', {
        text: truncatedQuery
      }) as { data: number[][] };

      // Optimized Vectorize query with smaller topK for better performance
      const topK = Math.min(limit * 2, 20); // Reduced from limit * 3 to limit * 2, max 20
      const results = await this.env.VIDEO_EMBEDDINGS.query(queryEmbedding.data[0], {
        topK,
        returnMetadata: true
      });

      // Process results and deduplicate by video ID (optimized)
      const videoScores = new Map<string, SimilarVideo>();
      
      for (const match of results.matches) {
        const metadata = match.metadata as Record<string, unknown>;
        const videoId = metadata.videoId as string;
        
        // Skip excluded video
        if (excludeVideoId && videoId === excludeVideoId) {
          continue;
        }

        // Keep the highest scoring chunk for each video
        const existingScore = videoScores.get(videoId)?.score || 0;
        if (match.score > existingScore) {
          videoScores.set(videoId, {
            videoId,
            score: match.score,
            content: metadata.content as string,
            metadata: {
              videoTitle: metadata.videoTitle as string,
              videoDescription: (metadata.videoDescription as string) || undefined,
              chunkStart: (metadata.chunkStart as number) || undefined,
              chunkEnd: (metadata.chunkEnd as number) || undefined,
              tags: metadata.tags ? (metadata.tags as string).split(',').filter(Boolean) : undefined
            }
          });
        }
      }

      // Return top results sorted by score, with lower threshold for better recall
      return Array.from(videoScores.values())
        .filter(video => video.score > 0.5) // Lowered from 0.6 to 0.5 for better recall
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    } catch (error) {
      console.error('❌ Error searching similar videos:', error);
      throw error;
    }
  }

  // Cache for related videos (10 minute TTL)
  private relatedCache = new Map<string, { data: SimilarVideo[]; timestamp: number }>();
  private readonly RELATED_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  /**
   * Find related videos for a specific video (optimized with caching)
   */
  async getRelatedVideos(videoId: string, limit: number = 5): Promise<SimilarVideo[]> {
    try {
      // Check cache first
      const cacheKey = `related-${videoId}-${limit}`;
      const cached = this.relatedCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.RELATED_CACHE_TTL) {
        return cached.data;
      }

      // Get the video's transcript from database
      const video = await this.env.DB.prepare(`
        SELECT v.title, v.description, t.content as transcript
        FROM videos v
        LEFT JOIN transcripts t ON v.id = t.video_id
        WHERE v.id = ?
      `).bind(videoId).first();

      if (!video || !video.transcript) {
        console.log(`No transcript found for video: ${videoId}`);
        return [];
      }

      // Use optimized search with reduced topK for better performance
      const similarVideos = await this.searchSimilarVideosOptimized(
        video.transcript as string,
        limit,
        videoId // Exclude the current video
      );

      // Cache the result
      this.relatedCache.set(cacheKey, { data: similarVideos, timestamp: Date.now() });
      return similarVideos;
    } catch (error) {
      console.error(`❌ Error getting related videos for ${videoId}:`, error);
      throw error;
    }
  }

  /**
   * Delete embeddings for a video
   */
  async deleteEmbeddings(videoId: string): Promise<void> {
    try {
      // Query to find all embedding IDs for this video
      const results = await this.env.VIDEO_EMBEDDINGS.query([0], {
        topK: 1000, // Large number to get all chunks
        returnMetadata: true,
        filter: { videoId }
      });

      // Delete all embeddings for this video
      const idsToDelete = results.matches.map((match: { id: string }) => match.id);
      if (idsToDelete.length > 0) {
        await this.env.VIDEO_EMBEDDINGS.deleteByIds(idsToDelete);
        console.log(`🗑️ Deleted ${idsToDelete.length} embeddings for video: ${videoId}`);
      }
    } catch (error) {
      console.error(`❌ Error deleting embeddings for video ${videoId}:`, error);
      throw error;
    }
  }

  /**
   * Split text into chunks with overlap for better semantic representation
   */
  private chunkText(text: string): Array<{ content: string; start: number; end: number }> {
    const chunks: Array<{ content: string; start: number; end: number }> = [];
    
    if (text.length <= this.CHUNK_SIZE) {
      return [{ content: text, start: 0, end: text.length }];
    }

    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + this.CHUNK_SIZE, text.length);
      
      // Try to break at word boundaries
      if (end < text.length) {
        const lastSpace = text.lastIndexOf(' ', end);
        if (lastSpace > start + this.CHUNK_SIZE * 0.8) {
          end = lastSpace;
        }
      }

      const content = text.slice(start, end).trim();
      if (content.length > 0) {
        chunks.push({ content, start, end });
      }

      // Move start position with overlap
      start = Math.max(start + this.CHUNK_SIZE - this.CHUNK_OVERLAP, end);
    }

    return chunks;
  }

  /**
   * Get embedding statistics
   */
  async getEmbeddingStats(): Promise<{ totalEmbeddings: number; totalVideos: number }> {
    try {
      // This is a rough estimate since Vectorize doesn't have a direct count method
      const sampleResults = await this.env.VIDEO_EMBEDDINGS.query([0], {
        topK: 1000,
        returnMetadata: true
      });

      const uniqueVideos = new Set(
        sampleResults.matches
          .filter(match => match.metadata)
          .map(match => (match.metadata as Record<string, unknown>).videoId as string)
      );

      return {
        totalEmbeddings: sampleResults.matches.length,
        totalVideos: uniqueVideos.size
      };
    } catch (error) {
      console.error('❌ Error getting embedding stats:', error);
      return { totalEmbeddings: 0, totalVideos: 0 };
    }
  }
}
