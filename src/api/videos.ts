// API handlers for video management

import { Video, UploadResponse, SearchResult, StreamUploadResponse, Chapter, Tag, Transcript, VideoWithScore } from '../types';
import { VideoLogger, VideoLogEntry } from '../services/video-logger';
import { EmbeddingService, SimilarVideo } from '../services/embedding-service';
import { VideoCompletionChecker } from './video-completion-checker';

// Helper function to validate and transform database results to Video objects
function validateVideo(record: Record<string, unknown>): Video {
  // Validate required fields
  if (!record.id || typeof record.id !== 'string') {
    throw new Error('Invalid video record: missing or invalid id');
  }
  if (!record.title || typeof record.title !== 'string') {
    throw new Error('Invalid video record: missing or invalid title');
  }
  if (!record.stream_id || typeof record.stream_id !== 'string') {
    throw new Error('Invalid video record: missing or invalid stream_id');
  }
  if (!record.upload_date || typeof record.upload_date !== 'string') {
    throw new Error('Invalid video record: missing or invalid upload_date');
  }
  if (!record.status || !['processing', 'ready', 'error'].includes(record.status as string)) {
    throw new Error('Invalid video record: missing or invalid status');
  }
  if (!record.created_at || typeof record.created_at !== 'string') {
    throw new Error('Invalid video record: missing or invalid created_at');
  }
  if (!record.updated_at || typeof record.updated_at !== 'string') {
    throw new Error('Invalid video record: missing or invalid updated_at');
  }

  return {
    id: record.id,
    title: record.title,
    description: record.description ? String(record.description) : undefined,
    abstract: record.abstract ? String(record.abstract) : undefined,
    stream_id: record.stream_id,
    thumbnail_url: record.thumbnail_url ? String(record.thumbnail_url) : undefined,
    duration: record.duration ? Number(record.duration) : undefined,
    file_size: record.file_size ? Number(record.file_size) : undefined,
    upload_date: record.upload_date,
    status: record.status as 'processing' | 'ready' | 'error',
    tags: record.tags ? (record.tags as string).split(',').filter(Boolean) : undefined,
    view_count: record.view_count ? Number(record.view_count) : undefined,
    created_at: record.created_at,
    updated_at: record.updated_at,
    created_by: record.created_by ? String(record.created_by) : undefined,
    updated_by: record.updated_by ? String(record.updated_by) : undefined,
  };
}

// Interface for database records that include similarity_score from SQL queries
interface VideoRecordWithSimilarity extends Record<string, unknown> {
  similarity_score: number;
}

export class VideoAPI {
  private env: CloudflareEnv;
  private logger: VideoLogger;
  private embeddingService: EmbeddingService;
  private completionChecker: VideoCompletionChecker;

  constructor(env: CloudflareEnv) {
    this.env = env;
    this.logger = new VideoLogger(env);
    this.embeddingService = new EmbeddingService(env);
    this.completionChecker = new VideoCompletionChecker(env);
  }

  // Generate unique video ID
  private generateId(): string {
    return crypto.randomUUID();
  }

  // Upload video to Cloudflare Stream
  async uploadVideo(file: File, title: string, description?: string, createdBy?: string): Promise<UploadResponse> {
    const videoId = this.generateId();
    
    // Debug: Check if Stream API credentials are configured
    console.log('Stream API Configuration:', {
      hasAccountId: !!this.env.STREAM_ACCOUNT_ID,
      hasApiToken: !!this.env.STREAM_API_TOKEN,
      accountIdLength: this.env.STREAM_ACCOUNT_ID?.length || 0,
      apiTokenLength: this.env.STREAM_API_TOKEN?.length || 0
    });
    
    if (!this.env.STREAM_ACCOUNT_ID || !this.env.STREAM_API_TOKEN) {
      throw new Error('Stream API credentials not configured. Please check STREAM_ACCOUNT_ID and STREAM_API_TOKEN environment variables.');
    }
    
    // Create direct upload URL with Cloudflare Stream
    const streamResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${this.env.STREAM_ACCOUNT_ID}/stream/direct_upload`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.env.STREAM_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          maxDurationSeconds: 3600, // 1 hour max
          expiry: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour expiry
          meta: {
            video_id: videoId,
            title,
            description: description || '',
          },
          requireSignedURLs: false,
          thumbnailTimestampPct: 0.5,
        }),
      }
    );

    if (!streamResponse.ok) {
      let errorMessage = `Stream API error (${streamResponse.status}): ${streamResponse.statusText}`;
      
      try {
        const errorData = await streamResponse.json() as {
          errors?: Array<{ message: string }>;
          error?: string;
          [key: string]: unknown;
        };
        if (errorData.errors && errorData.errors.length > 0) {
          errorMessage += ` - ${errorData.errors.map(e => e.message).join(', ')}`;
        } else if (errorData.error) {
          errorMessage += ` - ${errorData.error}`;
        }
        console.error('Stream API error details:', errorData);
      } catch (e) {
        console.error('Could not parse Stream API error response:', e);
      }
      
      throw new Error(errorMessage);
    }

    const streamData: StreamUploadResponse = await streamResponse.json();
    const streamId = streamData.result.uid;
    const uploadUrl = streamData.result.uploadURL;

    // Store video metadata in D1 with Cloudflare Stream thumbnail URL
    const thumbnailUrl = `https://videodelivery.net/${streamId}/thumbnails/thumbnail.jpg?time=0s&height=600`;
    await this.env.DB.prepare(`
      INSERT INTO videos (id, title, description, stream_id, status, thumbnail_url, created_by)
      VALUES (?, ?, ?, ?, 'processing', ?, ?)
    `).bind(videoId, title, description || '', streamId, thumbnailUrl, createdBy || null).run();

    // Schedule immediate sync to check processing status
    // This will help detect when the video becomes ready faster
    setTimeout(async () => {
      try {
        await this.syncVideoStatusFromStream(videoId);
      } catch (error) {
        console.error('Error in immediate sync after upload:', error);
      }
    }, 5000); // Check after 5 seconds

    // Schedule additional syncs at increasing intervals
    const syncIntervals = [15000, 30000, 60000, 120000]; // 15s, 30s, 1m, 2m
    syncIntervals.forEach((interval, index) => {
      setTimeout(async () => {
        try {
          const video = await this.getVideo(videoId);
          if (video && video.status === 'processing') {
            await this.syncVideoStatusFromStream(videoId);
          }
        } catch (error) {
          console.error(`Error in scheduled sync ${index + 1} after upload:`, error);
        }
      }, interval);
    });

    return {
      video_id: videoId,
      stream_id: streamId,
      upload_url: uploadUrl,
    };
  }

  // Get video by ID
  async getVideo(videoId: string): Promise<Video | null> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM videos WHERE id = ?
    `).bind(videoId).first();

    return result ? validateVideo(result) : null;
  }

  // Update video details
  async updateVideo(videoId: string, updates: { title?: string; description?: string; abstract?: string }, updatedBy?: string): Promise<{ success: boolean; message: string; video?: Video }> {
    try {
      // Check if video exists
      const existingVideo = await this.getVideo(videoId);
      if (!existingVideo) {
        return { success: false, message: 'Video not found' };
      }

      // Build update query dynamically
      const updateFields: string[] = [];
      const params: (string | null)[] = [];

      if (updates.title !== undefined) {
        updateFields.push('title = ?');
        params.push(updates.title);
      }

      if (updates.description !== undefined) {
        updateFields.push('description = ?');
        params.push(updates.description || null);
      }

      if (updates.abstract !== undefined) {
        updateFields.push('abstract = ?');
        params.push(updates.abstract || null);
      }

      if (updateFields.length === 0) {
        return { success: false, message: 'No fields to update' };
      }

      // Add updated_at timestamp, updated_by, and video ID
      updateFields.push('updated_at = CURRENT_TIMESTAMP');
      if (updatedBy) {
        updateFields.push('updated_by = ?');
        params.push(updatedBy);
      }
      params.push(videoId);

      const query = `UPDATE videos SET ${updateFields.join(', ')} WHERE id = ?`;
      
      await this.env.DB.prepare(query).bind(...params).run();

      // Get updated video
      const updatedVideo = await this.getVideo(videoId);
      
      await this.logger.log(videoId, 'info', 'update', 'Video details updated', { 
        updatedFields: Object.keys(updates) 
      }, undefined, updatedBy);

      return {
        success: true,
        message: 'Video updated successfully',
        video: updatedVideo!
      };

    } catch (error) {
      await this.logger.log(videoId, 'error', 'update', 'Failed to update video', { error });
      console.error(`Failed to update video ${videoId}:`, error);
      return { success: false, message: 'Failed to update video' };
    }
  }

  // List all videos with pagination
  async listVideos(page = 1, limit = 20, status?: string): Promise<Video[]> {
    const offset = (page - 1) * limit;
    let query = `
      SELECT 
        v.*,
        GROUP_CONCAT(DISTINCT tag.name) as tags
      FROM videos v
      LEFT JOIN video_tags vt ON v.id = vt.video_id
      LEFT JOIN tags tag ON vt.tag_id = tag.id`;
    const params: (string | number)[] = [];

    if (status) {
      query += ` WHERE v.status = ?`;
      params.push(status);
    }

    query += ` GROUP BY v.id ORDER BY v.upload_date DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const result = await this.env.DB.prepare(query).bind(...params).all();
    return result.results.map(record => validateVideo(record));
  }

  // Enhanced vector-based search using the existing /api/vectors/search endpoint
  async searchVideos(query: string, limit = 20): Promise<SearchResult[]> {
    console.log('Search query received:', query);
    
    try {
      // Use the same vector search endpoint that powers the /vector page
      // Try with minimum score of 0.60 first (high confidence)
      const vectorResults = await this.performDetailedVectorSearch(query, limit, 0.60);
      
      if (vectorResults.length > 0) {
        console.log(`Found ${vectorResults.length} vector results with score >= 0.60`);
        return await this.convertVectorResultsToSearchResults(vectorResults);
      }
      
      // Try with lower threshold (0.40) for broader results
      console.log('No high-confidence results, trying lower threshold (0.40)');
      const lowerThresholdResults = await this.performDetailedVectorSearch(query, Math.min(limit, 10), 0.40);
      
      if (lowerThresholdResults.length > 0) {
        console.log(`Found ${lowerThresholdResults.length} results with lower threshold`);
        return await this.convertVectorResultsToSearchResults(lowerThresholdResults);
      }
      
    } catch (error) {
      console.error('Vector search failed:', error);
    }
    
    // Final fallback to basic search
    console.log('Falling back to basic search');
    return await this.performBasicSearch(query, limit);
  }
  
  // Helper method to convert vector search results to SearchResult format
  private async convertVectorResultsToSearchResults(vectorResults: {
    videoId: string;
    title: string;
    description: string;
    chunkIndex: number;
    content: string;
    score: number;
    metadata: {
      videoTitle: string;
      videoDescription: string;
      chunkStart: number;
      chunkEnd: number;
      tags: string;
    };
  }[]): Promise<SearchResult[]> {
    const searchResults: SearchResult[] = [];
    const processedVideoIds = new Set<string>();
    
    for (const vectorResult of vectorResults) {
      // Skip if we've already processed this video (take highest scoring chunk)
      if (processedVideoIds.has(vectorResult.videoId)) {
        continue;
      }
      processedVideoIds.add(vectorResult.videoId);
      
      try {
        // Get full video details
        const video = await this.getVideo(vectorResult.videoId);
        if (!video || video.status !== 'ready') {
          console.log(`Skipping video ${vectorResult.videoId} - not ready`);
          continue;
        }
        
        // Get additional data in parallel
        const [tags, chapters, transcriptData] = await Promise.all([
          this.getVideoTags(vectorResult.videoId),
          this.getVideoChapters(vectorResult.videoId),
          this.getVideoTranscript(vectorResult.videoId)
        ]);
        
        // Convert transcript data to proper Transcript interface
        const transcript: Transcript | undefined = transcriptData ? {
          id: `transcript-${vectorResult.videoId}`,
          video_id: vectorResult.videoId,
          content: transcriptData.content,
          language: transcriptData.language,
          confidence_score: transcriptData.confidence_score,
          created_at: video.created_at
        } : undefined;
        
        const searchResult: SearchResult = {
          video,
          tags,
          chapters,
          transcript,
          relevance_score: vectorResult.score * 10, // Scale to 0-10 range
          search_type: 'vector'
        };
        
        searchResults.push(searchResult);
        console.log(`Added search result for video: ${video.title} (score: ${vectorResult.score})`);
      } catch (error) {
        console.error(`Error processing vector result for video ${vectorResult.videoId}:`, error);
      }
    }
    
    // Sort by relevance score (highest first)
    searchResults.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));
    
    console.log(`Returning ${searchResults.length} vector search results`);
    return searchResults;
  }
  
  // Check if search index exists and has entries
  private async searchIndexExists(): Promise<boolean> {
    try {
      const indexCount = await this.env.DB.prepare('SELECT COUNT(*) as count FROM search_index').first() as { count: number };
      return indexCount.count > 0;
    } catch (error) {
      console.log('Search index table does not exist:', error);
      return false;
    }
  }

  // Basic search fallback when no vector embeddings exist
  private async performBasicSearch(query: string, limit: number): Promise<SearchResult[]> {
    const searchQuery = `%${query.toLowerCase()}%`;
    
    const results = await this.env.DB.prepare(`
      SELECT 
        v.*,
        t.content as transcript_content,
        GROUP_CONCAT(DISTINCT tag.name) as tags,
        GROUP_CONCAT(DISTINCT c.title) as chapter_titles,
        'basic' as search_type
      FROM videos v
      LEFT JOIN transcripts t ON v.id = t.video_id
      LEFT JOIN video_tags vt ON v.id = vt.video_id
      LEFT JOIN tags tag ON vt.tag_id = tag.id
      LEFT JOIN chapters c ON v.id = c.video_id
      WHERE v.status = 'ready' 
        AND (LOWER(v.title) LIKE ? OR LOWER(v.description) LIKE ? OR LOWER(t.content) LIKE ?)
      GROUP BY v.id
      ORDER BY v.created_at DESC
      LIMIT ?
    `).bind(searchQuery, searchQuery, searchQuery, limit).all();

    return await this.processSearchResults(results.results, 'basic');
  }

  // Preprocess search query for better matching
  private preprocessSearchQuery(query: string): string {
    // Remove common stop words and normalize
    const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'how', 'what', 'when', 'where', 'why', 'is', 'are', 'was', 'were'];
    
    const words = query.toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.includes(word));
    
    // Add wildcards for partial matching
    const wildcardQuery = words.map(word => `${word}*`).join(' OR ');
    
    return wildcardQuery || query; // Fallback to original if preprocessing fails
  }
  
  // Perform full-text search using FTS5
  private async performFTSSearch(query: string, limit: number): Promise<SearchResult[]> {
    try {
      const searchResults = await this.env.DB.prepare(`
        SELECT 
          v.*,
          t.content as transcript_content,
          GROUP_CONCAT(DISTINCT tag.name) as tags,
          GROUP_CONCAT(DISTINCT c.title) as chapter_titles,
          bm25(search_index) as relevance_score,
          'fts' as search_type
        FROM search_index
        JOIN videos v ON search_index.video_id = v.id
        LEFT JOIN transcripts t ON v.id = t.video_id
        LEFT JOIN video_tags vt ON v.id = vt.video_id
        LEFT JOIN tags tag ON vt.tag_id = tag.id
        LEFT JOIN chapters c ON v.id = c.video_id
        WHERE search_index MATCH ? AND v.status = 'ready'
        GROUP BY v.id
        ORDER BY relevance_score DESC
        LIMIT ?
      `).bind(query, limit).all();
      
      return await this.processSearchResults(searchResults.results, 'fts');
    } catch (error) {
      console.error('FTS search failed:', error);
      return [];
    }
  }
  
  // Perform semantic search using content similarity
  private async performSemanticSearch(query: string, limit: number): Promise<SearchResult[]> {
    try {
      // Semantic search using content matching and similarity
      const searchResults = await this.env.DB.prepare(`
        SELECT 
          v.*,
          t.content as transcript_content,
          GROUP_CONCAT(DISTINCT tag.name) as tags,
          GROUP_CONCAT(DISTINCT c.title) as chapter_titles,
          (
            CASE 
              WHEN v.title LIKE ? THEN 10
              WHEN v.description LIKE ? THEN 8
              WHEN t.content LIKE ? THEN 6
              WHEN tag.name LIKE ? THEN 5
              WHEN c.title LIKE ? THEN 4
              ELSE 0
            END
          ) as relevance_score,
          'semantic' as search_type
        FROM videos v
        LEFT JOIN transcripts t ON v.id = t.video_id
        LEFT JOIN video_tags vt ON v.id = vt.video_id
        LEFT JOIN tags tag ON vt.tag_id = tag.id
        LEFT JOIN chapters c ON v.id = c.video_id
        WHERE (
          v.title LIKE ? OR
          v.description LIKE ? OR
          t.content LIKE ? OR
          tag.name LIKE ? OR
          c.title LIKE ?
        ) AND v.status = 'ready'
        GROUP BY v.id
        HAVING relevance_score > 0
        ORDER BY relevance_score DESC
        LIMIT ?
      `).bind(
        `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`,
        `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`,
        limit
      ).all();
      
      return await this.processSearchResults(searchResults.results, 'semantic');
    } catch (error) {
      console.error('Semantic search failed:', error);
      return [];
    }
  }
  
  // Perform tag-based search for better categorization
  private async performTagBasedSearch(query: string, limit: number): Promise<SearchResult[]> {
    try {
      const searchResults = await this.env.DB.prepare(`
        SELECT 
          v.*,
          t.content as transcript_content,
          GROUP_CONCAT(DISTINCT tag.name) as tags,
          GROUP_CONCAT(DISTINCT c.title) as chapter_titles,
          COUNT(DISTINCT CASE WHEN tag.name LIKE ? THEN tag.id END) * 3 as relevance_score,
          'tag' as search_type
        FROM videos v
        LEFT JOIN transcripts t ON v.id = t.video_id
        LEFT JOIN video_tags vt ON v.id = vt.video_id
        LEFT JOIN tags tag ON vt.tag_id = tag.id
        LEFT JOIN chapters c ON v.id = c.video_id
        WHERE v.status = 'ready'
        GROUP BY v.id
        HAVING relevance_score > 0
        ORDER BY relevance_score DESC
        LIMIT ?
      `).bind(`%${query}%`, limit).all();
      
      return await this.processSearchResults(searchResults.results, 'tag');
    } catch (error) {
      console.error('Tag-based search failed:', error);
      return [];
    }
  }
  
  // Perform vector similarity search using embeddings
  private async performVectorSearch(query: string, limit: number): Promise<SearchResult[]> {
    try {
      // Use the embedding service to find similar videos
      const similarVideos: SimilarVideo[] = await this.embeddingService.searchSimilarVideos(query, limit);
      
      if (similarVideos.length === 0) {
        return [];
      }
      
      // Get video details for the similar videos
      const videoIds = similarVideos.map(v => v.videoId);
      const placeholders = videoIds.map(() => '?').join(',');
      
      const searchResults = await this.env.DB.prepare(`
        SELECT 
          v.*,
          t.content as transcript_content,
          GROUP_CONCAT(DISTINCT tag.name) as tags,
          GROUP_CONCAT(DISTINCT c.title) as chapter_titles,
          'vector' as search_type
        FROM videos v
        LEFT JOIN transcripts t ON v.id = t.video_id
        LEFT JOIN video_tags vt ON v.id = vt.video_id
        LEFT JOIN tags tag ON vt.tag_id = tag.id
        LEFT JOIN chapters c ON v.id = c.video_id
        WHERE v.id IN (${placeholders}) AND v.status = 'ready'
        GROUP BY v.id
      `).bind(...videoIds).all();
      
      // Process results and add similarity scores
      const processedResults = await this.processSearchResults(searchResults.results, 'vector');
      
      // Map similarity scores to processed results
      const similarityMap = new Map(similarVideos.map(v => [v.videoId, v.score]));
      
      return processedResults.map(result => ({
        ...result,
        relevance_score: (similarityMap.get(result.video.id) || 0) * 10 // Scale similarity to relevance score
      }));
      
    } catch (error) {
      console.error('Vector search failed:', error);
      return [];
    }
  }
  
  // Process search results into SearchResult format
  private async processSearchResults(results: Record<string, unknown>[], searchType: string): Promise<SearchResult[]> {
    const processedResults: SearchResult[] = [];
    
    for (const row of results) {
      try {
        const baseVideo = validateVideo(row);
        
        // Get detailed data for each video
        const [tags, chapters, transcript] = await Promise.all([
          this.getVideoTags(baseVideo.id),
          this.getVideoChapters(baseVideo.id),
          row.transcript_content ? {
            id: '',
            video_id: baseVideo.id,
            content: String(row.transcript_content),
            language: 'en',
            created_at: baseVideo.created_at,
          } : undefined
        ]);
        
        processedResults.push({
          video: baseVideo,
          transcript: transcript || undefined,
          tags,
          chapters,
          relevance_score: Number((row as VideoRecordWithSimilarity).similarity_score) || 0,
          search_type: searchType,
        });
      } catch (error) {
        console.error('Error processing search result:', error);
        continue;
      }
    }
    
    // Sort by relevance score (highest first)
    processedResults.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));
    
    console.log(`Returning ${processedResults.length} ${searchType} search results`);
    return processedResults;
  }
  
  // Combine and deduplicate search results with intelligent scoring
  private combineSearchResults(
    ftsResults: SearchResult[],
    semanticResults: SearchResult[],
    tagResults: SearchResult[],
    vectorResults: SearchResult[],
    limit: number
  ): SearchResult[] {
    const resultMap = new Map<string, SearchResult>();
    
    // Add FTS results (highest priority)
    ftsResults.forEach(result => {
      const existing = resultMap.get(result.video.id);
      if (!existing || result.relevance_score > existing.relevance_score) {
        resultMap.set(result.video.id, {
          ...result,
          relevance_score: result.relevance_score * 1.5, // Boost FTS scores
          search_type: 'fts'
        });
      }
    });
    
    // Add semantic results
    semanticResults.forEach(result => {
      const existing = resultMap.get(result.video.id);
      if (!existing) {
        resultMap.set(result.video.id, {
          ...result,
          search_type: 'semantic'
        });
      } else {
        // Boost score if found in multiple search types
        existing.relevance_score += result.relevance_score * 0.5;
        existing.search_type = 'combined';
      }
    });
    
    // Add tag results
    tagResults.forEach(result => {
      const existing = resultMap.get(result.video.id);
      if (!existing) {
        resultMap.set(result.video.id, {
          ...result,
          search_type: 'tag'
        });
      } else {
        // Boost score if found in multiple search types
        existing.relevance_score += result.relevance_score * 0.3;
        existing.search_type = 'combined';
      }
    });
    
    // Add vector similarity results
    vectorResults.forEach(result => {
      const existing = resultMap.get(result.video.id);
      if (!existing) {
        resultMap.set(result.video.id, {
          ...result,
          search_type: 'vector'
        });
      } else {
        // Boost score if found in multiple search types
        existing.relevance_score += result.relevance_score * 0.7; // Vector results get good boost
        existing.search_type = 'combined';
      }
    });
    
    // Sort by relevance score and return top results
    return Array.from(resultMap.values())
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, limit);
  }
  
  // Rebuild the search index for all videos
  private async rebuildSearchIndex(): Promise<void> {
    try {
      console.log('Rebuilding search index...');
      
      // Get all ready videos with their transcripts and tags
      const videos = await this.env.DB.prepare(`
        SELECT 
          v.id,
          v.title,
          v.description,
          t.content as transcript_content,
          GROUP_CONCAT(tag.name, ' ') as tag_names
        FROM videos v
        LEFT JOIN transcripts t ON v.id = t.video_id
        LEFT JOIN video_tags vt ON v.id = vt.video_id
        LEFT JOIN tags tag ON vt.tag_id = tag.id
        WHERE v.status = 'ready'
        GROUP BY v.id
      `).all();
      
      console.log(`Found ${videos.results.length} videos to index`);
      
      // Clear existing index
      await this.env.DB.prepare('DELETE FROM search_index').run();
      
      // Rebuild index for each video
      for (const video of videos.results) {
        const videoData = video as {
          id: string;
          title: string;
          description?: string;
          transcript_content?: string;
          tag_names?: string;
        };
        
        await this.env.DB.prepare(`
          INSERT INTO search_index (video_id, title, description, transcript_content, tags)
          VALUES (?, ?, ?, ?, ?)
        `).bind(
          videoData.id,
          videoData.title,
          videoData.description || '',
          videoData.transcript_content || '',
          videoData.tag_names || ''
        ).run();
      }
      
      console.log('Search index rebuilt successfully');
    } catch (error) {
      console.error('Failed to rebuild search index:', error);
    }
  }
  
  // Public method to manually rebuild search index
  async rebuildSearchIndexManually(): Promise<void> {
    await this.rebuildSearchIndex();
  }

  // Cache for related videos (5 minute TTL)
  private relatedVideosCache = new Map<string, { data: VideoWithScore[]; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Get related videos using vector similarity only
  async getRelatedVideos(videoId: string, limit = 5): Promise<VideoWithScore[]> {
    try {
      // Check cache first
      const cacheKey = `${videoId}-${limit}`;
      const cached = this.relatedVideosCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        console.log(`Cache hit for related videos: ${videoId}`);
        return cached.data;
      }

      // Use only vector similarity (no fallback)
      const result = await this.getVectorBasedRelated(videoId, limit);
      
      console.log(`Found ${result.length} vector-based related videos for ${videoId}`);
      
      // Cache the result
      this.relatedVideosCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
      
    } catch (error) {
      console.error(`Error getting related videos for ${videoId}:`, error);
      return [];
    }
  }

  // Vector-based related videos (no timeout, let it complete)
  private async getVectorBasedRelated(videoId: string, limit: number): Promise<VideoWithScore[]> {
    const similarVideos = await this.embeddingService.getRelatedVideos(videoId, limit);
    
    if (similarVideos.length === 0) {
      console.log(`No vector embeddings found for video: ${videoId}`);
      return [];
    }
    
    // Single optimized query to get video records with scores
    const videoIds = similarVideos.map(sv => sv.videoId);
    const placeholders = videoIds.map(() => '?').join(',');
    
    const videoRecords = await this.env.DB.prepare(`
      SELECT * FROM videos 
      WHERE id IN (${placeholders}) AND status = 'ready'
    `).bind(...videoIds).all();
    
    // Create score lookup map for O(1) access
    const scoreMap = new Map(similarVideos.map(sv => [sv.videoId, sv.score]));
    
    return videoRecords.results
      .map(record => {
        const video = validateVideo(record);
        return {
          ...video,
          confidence_score: scoreMap.get(video.id) || 0
        };
      })
      .sort((a, b) => (b.confidence_score || 0) - (a.confidence_score || 0))
      .slice(0, limit);
  }


  // Get video tags
  private async getVideoTags(videoId: string): Promise<Tag[]> {
    const result = await this.env.DB.prepare(`
      SELECT t.* FROM tags t
      JOIN video_tags vt ON t.id = vt.tag_id
      WHERE vt.video_id = ?
    `).bind(videoId).all<Tag>();
    
    return result.results ?? [];
  }

  // Get video chapters
  async getVideoChapters(videoId: string): Promise<Chapter[]> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM chapters WHERE video_id = ? ORDER BY start_time ASC
    `).bind(videoId).all();
    
    return result.results as unknown as Chapter[];
  }

  // Get video tags (public method)
  async getVideoTagsPublic(videoId: string): Promise<Tag[]> {
    return this.getVideoTags(videoId);
  }

  // Get video transcript
  async getVideoTranscript(videoId: string): Promise<{ content: string; language: string; confidence_score?: number } | null> {
    const result = await this.env.DB.prepare(`
      SELECT content, language, confidence_score FROM transcripts WHERE video_id = ?
    `).bind(videoId).first();
    
    if (!result) {
      return null;
    }
    
    return {
      content: String(result.content),
      language: String(result.language || 'en'),
      confidence_score: result.confidence_score ? Number(result.confidence_score) : undefined,
    };
  }

  // Get video VTT content
  async getVideoVTT(videoId: string): Promise<string | null> {
    const result = await this.env.DB.prepare(`
      SELECT vtt_content FROM transcripts WHERE video_id = ?
    `).bind(videoId).first();
    
    if (!result || !result.vtt_content) {
      return null;
    }
    
    return String(result.vtt_content);
  }

  // Update video status
  async updateVideoStatus(videoId: string, status: string, metadata?: {
    duration?: number;
    thumbnail_url?: string;
    file_size?: number;
  }, updatedBy?: string): Promise<void> {
    let query = `UPDATE videos SET status = ?, updated_at = CURRENT_TIMESTAMP`;
    const params: (string | number)[] = [status];

    if (metadata) {
      if (metadata.duration) {
        query += `, duration = ?`;
        params.push(metadata.duration);
      }
      if (metadata.thumbnail_url) {
        query += `, thumbnail_url = ?`;
        params.push(metadata.thumbnail_url);
      }
      if (metadata.file_size) {
        query += `, file_size = ?`;
        params.push(metadata.file_size);
      }
    }

    if (updatedBy) {
      query += `, updated_by = ?`;
      params.push(updatedBy);
    }

    query += ` WHERE id = ?`;
    params.push(videoId);

    await this.env.DB.prepare(query).bind(...params).run();
  }

  // Sync video status from Cloudflare Stream API
  async syncVideoStatusFromStream(videoId: string): Promise<void> {
    try {
      // Get video from database to get stream_id
      const video = await this.getVideo(videoId);
      if (!video) {
        console.error(`Video ${videoId} not found in database`);
        return;
      }

      // Get status from Stream API
      const streamResponse = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.env.STREAM_ACCOUNT_ID}/stream/${video.stream_id}`,
        {
          headers: {
            'Authorization': `Bearer ${this.env.STREAM_API_TOKEN}`,
          },
        }
      );

      if (!streamResponse.ok) {
        console.error(`Failed to get stream status for ${video.stream_id}: ${streamResponse.statusText}`);
        return;
      }

      const streamData = await streamResponse.json() as {
        result: {
          status: {
            state: 'pendingupload' | 'downloading' | 'queued' | 'inprogress' | 'ready' | 'error';
            pctComplete?: string;
            errorReasonCode?: string;
            errorReasonText?: string;
          };
          duration?: number;
          preview?: string;
          thumbnail?: string;
          meta?: Record<string, unknown>;
        };
        success: boolean;
      };

      if (!streamData.success) {
        console.error(`Stream API returned error for ${video.stream_id}`);
        return;
      }

      const streamStatus = streamData.result.status.state;
      const duration = streamData.result.duration;
      // Use Cloudflare Stream's thumbnail URL format
      const thumbnailUrl = streamData.result.thumbnail || `https://videodelivery.net/${video.stream_id}/thumbnails/thumbnail.jpg?time=0s&height=600`;

      // Map Stream status to our status
      let newStatus: string;
      switch (streamStatus) {
        case 'ready':
          // Don't mark as ready yet - need to check if full processing pipeline is complete
          newStatus = 'processing';
          break;
        case 'error':
          newStatus = 'error';
          break;
        case 'pendingupload':
        case 'downloading':
        case 'queued':
        case 'inprogress':
        default:
          newStatus = 'processing';
          break;
      }

      // Update video status if it changed
      if (video.status !== newStatus) {
        console.log(`Updating video ${videoId} status from ${video.status} to ${newStatus}`);
        
        await this.updateVideoStatus(videoId, newStatus, {
          duration,
          thumbnail_url: thumbnailUrl,
        });
      }

      // Check if video is ready in Stream and if processing pipeline is complete
      if (streamStatus === 'ready') {
        // Check if we have a transcript (indicates processing has started)
        const transcript = await this.env.DB.prepare(`
          SELECT id FROM transcripts WHERE video_id = ?
        `).bind(videoId).first();
        
        if (!transcript) {
          console.log(`Video ${videoId} is ready but not processed yet, starting processing pipeline`);
          
          // Start processing pipeline
          await this.env.VIDEO_PROCESSING_QUEUE.send({
            video_id: videoId,
            stream_id: video.stream_id,
            type: 'transcription',
            status: 'pending',
          });
        } else {
          // Check if all processing is complete
          const isComplete = await this.completionChecker.isProcessingComplete(videoId);
          
          if (isComplete && video.status !== 'ready') {
            console.log(`Video ${videoId} processing pipeline complete, marking as ready`);
            await this.updateVideoStatus(videoId, 'ready', {
              duration,
              thumbnail_url: thumbnailUrl,
            });
          } else if (!isComplete) {
            console.log(`Video ${videoId} stream ready but processing pipeline incomplete`);
            const status = await this.completionChecker.getProcessingStatus(videoId);
            console.log(`Processing status for ${videoId}:`, status);
          }
        }
      }
    } catch (error) {
      console.error(`Error syncing video status for ${videoId}:`, error);
    }
  }

// ...
  // Sync all processing videos from Stream API with rate limiting
  async syncAllProcessingVideos(): Promise<void> {
    try {
      const processingVideos = await this.env.DB.prepare(`
        SELECT id FROM videos WHERE status = 'processing'
      `).all();

      console.log(`Found ${processingVideos.results.length} videos in processing status`);

      // Rate limit: Process videos in batches with delays to avoid overwhelming Stream API
      const batchSize = 5; // Process 5 videos at a time
      const delayBetweenBatches = 2000; // 2 second delay between batches
      
      for (let i = 0; i < processingVideos.results.length; i += batchSize) {
        const batch = processingVideos.results.slice(i, i + batchSize);
        
        // Process batch in parallel
        await Promise.all(
          batch.map(async (video) => {
            try {
              await this.syncVideoStatusFromStream(String(video.id));
            } catch (error) {
              console.error(`Failed to sync video ${video.id}:`, error);
            }
          })
        );
        
        // Delay between batches (except for the last batch)
        if (i + batchSize < processingVideos.results.length) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
      }
      
      console.log('Completed syncing all processing videos');
    } catch (error) {
      console.error('Error syncing processing videos:', error);
    }
  }

  // Delete video from both database and Cloudflare Stream
  async deleteVideo(videoId: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`Starting deletion process for video ${videoId}`);
      
      // First, get the video to retrieve stream_id
      const video = await this.getVideo(videoId);
      if (!video) {
        return {
          success: false,
          message: 'Video not found'
        };
      }

      const streamId = video.stream_id;
      console.log(`Found video with stream_id: ${streamId}`);

      // Delete from Cloudflare Stream first
      if (streamId) {
        try {
          const streamDeleteResponse = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${this.env.STREAM_ACCOUNT_ID}/stream/${streamId}`,
            {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${this.env.STREAM_API_TOKEN}`,
              },
            }
          );

          if (!streamDeleteResponse.ok) {
            const errorText = await streamDeleteResponse.text();
            console.warn(`Failed to delete from Stream API: ${streamDeleteResponse.status} ${streamDeleteResponse.statusText} - ${errorText}`);
            // Continue with database deletion even if Stream deletion fails
          } else {
            console.log(`Successfully deleted video from Cloudflare Stream: ${streamId}`);
          }
        } catch (streamError) {
          console.warn('Error deleting from Cloudflare Stream:', streamError);
          // Continue with database deletion even if Stream deletion fails
        }
      }

      // Delete from database - use transaction for consistency
      const deleteQueries = [
        // Delete video tags
        this.env.DB.prepare('DELETE FROM video_tags WHERE video_id = ?').bind(videoId),
        
        // Delete chapters
        this.env.DB.prepare('DELETE FROM chapters WHERE video_id = ?').bind(videoId),
        
        // Delete transcripts
        this.env.DB.prepare('DELETE FROM transcripts WHERE video_id = ?').bind(videoId),
        
        // Note: webhooks table doesn't have video_id column, so we skip it
        // The webhooks are generic and not tied to specific videos in the current schema
        
        // Finally, delete the video itself (this will also remove from FTS5 due to CASCADE)
        this.env.DB.prepare('DELETE FROM videos WHERE id = ?').bind(videoId)
      ];
      
      // Handle FTS5 search index deletion separately since it has special syntax
      try {
        // For FTS5 with external content, we need to use the 'delete' command
        await this.env.DB.prepare('INSERT INTO search_index(search_index, video_id) VALUES("delete", ?)').bind(videoId).run();
      } catch (ftsError) {
        console.warn('FTS5 deletion failed (may not exist):', ftsError);
        // Continue with other deletions even if FTS5 fails
      }

      // Execute all deletions in a batch
      await this.env.DB.batch(deleteQueries);
      
      console.log(`Successfully deleted video ${videoId} from database`);

      return {
        success: true,
        message: 'Video deleted successfully'
      };
      
    } catch (error) {
      console.error(`Error deleting video ${videoId}:`, error);
      return {
        success: false,
        message: `Failed to delete video: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get logs for a specific video
   */
  async getVideoLogs(videoId: string, limit: number = 50): Promise<VideoLogEntry[]> {
    return await this.logger.getVideoLogs(videoId, limit);
  }

  /**
   * Get recent logs across all videos
   */
  async getRecentLogs(limit: number = 100): Promise<VideoLogEntry[]> {
    return await this.logger.getRecentLogs(limit);
  }

  /**
   * Get logs by level (errors, warnings, etc.)
   */
  async getLogsByLevel(level: 'debug' | 'info' | 'warning' | 'error', limit: number = 50): Promise<VideoLogEntry[]> {
    return await this.logger.getLogsByLevel(level, limit);
  }

  // Manual AI Processing Actions

  /**
   * Manually generate chapters for a video
   */
  async generateChaptersManually(videoId: string): Promise<{ success: boolean; message: string; chapters?: Chapter[] }> {
    try {
      // Check if video exists and has transcript
      const video = await this.getVideo(videoId);
      if (!video) {
        return { success: false, message: 'Video not found' };
      }

      const transcript = await this.getVideoTranscript(videoId);
      if (!transcript || !transcript.content) {
        return { success: false, message: 'No transcript available for chapter generation' };
      }

      // Import AIProcessor and generate chapters
      const { AIProcessor } = await import('../services/ai-processor');
      const aiProcessor = new AIProcessor(this.env);
      
      await this.logger.log(videoId, 'info', 'chapters', 'Manual chapter generation started');
      
      // Get video duration for chapter generation
      const duration = video.duration || 3600; // Default to 1 hour if not available
      await aiProcessor.generateChapters(videoId, transcript.content, duration);
      
      // Fetch the generated chapters from database
      const chapters = await this.getVideoChapters(videoId);
      
      await this.logger.log(videoId, 'info', 'chapters', `Manual chapter generation completed: ${chapters.length} chapters`);
      
      return { 
        success: true, 
        message: `Successfully generated ${chapters.length} chapters`,
        chapters 
      };
      
    } catch (error) {
      await this.logger.log(videoId, 'error', 'chapters', 'Manual chapter generation failed', { error });
      console.error(`Manual chapter generation failed for video ${videoId}:`, error);
      return { success: false, message: 'Chapter generation failed' };
    }
  }

  /**
   * Manually generate tags for a video
   */
  async generateTagsManually(videoId: string): Promise<{ success: boolean; message: string; tags?: Tag[] }> {
    try {
      // Check if video exists and has transcript
      const video = await this.getVideo(videoId);
      if (!video) {
        return { success: false, message: 'Video not found' };
      }

      const transcript = await this.getVideoTranscript(videoId);
      if (!transcript || !transcript.content) {
        return { success: false, message: 'No transcript available for tag generation' };
      }

      // Import AIProcessor and generate tags
      const { AIProcessor } = await import('../services/ai-processor');
      const aiProcessor = new AIProcessor(this.env);
      
      await this.logger.log(videoId, 'info', 'tagging', 'Manual tag generation started');
      
      const tagNames = await aiProcessor.generateTags(videoId, transcript.content, video.title);
      
      // Fetch the generated tags from database
      const tags = await this.getVideoTags(videoId);
      
      await this.logger.log(videoId, 'info', 'tagging', `Manual tag generation completed: ${tagNames.length} tags`);
      
      return { 
        success: true, 
        message: `Successfully generated ${tagNames.length} tags`,
        tags 
      };
      
    } catch (error) {
      await this.logger.log(videoId, 'error', 'tagging', 'Manual tag generation failed', { error });
      console.error(`Manual tag generation failed for video ${videoId}:`, error);
      return { success: false, message: 'Tag generation failed' };
    }
  }

  /**
   * Manually generate abstract for a video
   */
  async generateAbstractManually(videoId: string): Promise<{ success: boolean; message: string; abstract?: string }> {
    try {
      // Check if video exists and has transcript
      const video = await this.getVideo(videoId);
      if (!video) {
        return { success: false, message: 'Video not found' };
      }

      const transcript = await this.getVideoTranscript(videoId);
      if (!transcript || !transcript.content) {
        return { success: false, message: 'No transcript available for abstract generation' };
      }

      // Import AIProcessor and generate abstract
      const { AIProcessor } = await import('../services/ai-processor');
      const aiProcessor = new AIProcessor(this.env);
      
      await this.logger.log(videoId, 'info', 'abstract', 'Manual abstract generation started');
      
      const abstract = await aiProcessor.generateAbstract(videoId);
      
      await this.logger.log(videoId, 'info', 'abstract', `Manual abstract generation completed: ${abstract.length} characters`);
      
      return { 
        success: true, 
        message: `Successfully generated abstract (${abstract.length} characters)`,
        abstract 
      };
      
    } catch (error) {
      await this.logger.log(videoId, 'error', 'abstract', 'Manual abstract generation failed', { error });
      console.error(`Manual abstract generation failed for video ${videoId}:`, error);
      return { success: false, message: 'Abstract generation failed' };
    }
  }

  /**
   * Manually generate title for a video
   */
  async generateTitleManually(videoId: string): Promise<{ success: boolean; message: string; title?: string }> {
    try {
      // Check if video exists and has transcript
      const video = await this.getVideo(videoId);
      if (!video) {
        return { success: false, message: 'Video not found' };
      }

      const transcript = await this.getVideoTranscript(videoId);
      if (!transcript || !transcript.content) {
        return { success: false, message: 'No transcript available for title generation' };
      }

      // Import AIProcessor and generate title
      const { AIProcessor } = await import('../services/ai-processor');
      const aiProcessor = new AIProcessor(this.env);
      
      await this.logger.log(videoId, 'info', 'title_generation', 'Manual title generation started');
      
      const title = await aiProcessor.generateTitle(videoId);
      
      await this.logger.log(videoId, 'info', 'title_generation', `Manual title generation completed: "${title}"`);
      
      return { 
        success: true, 
        message: `Successfully generated title: "${title}"`,
        title 
      };
      
    } catch (error) {
      await this.logger.log(videoId, 'error', 'title_generation', 'Manual title generation failed', { error });
      console.error(`Manual title generation failed for video ${videoId}:`, error);
      return { success: false, message: 'Title generation failed' };
    }
  }

  /**
   * Manually generate transcript for a video
   */
  async generateTranscriptManually(videoId: string): Promise<{ success: boolean; message: string; transcript?: string }> {
    try {
      // Check if video exists
      const video = await this.getVideo(videoId);
      if (!video) {
        return { success: false, message: 'Video not found' };
      }

      // Import AIProcessor and generate transcript
      const { AIProcessor } = await import('../services/ai-processor');
      const aiProcessor = new AIProcessor(this.env);
      
      await this.logger.log(videoId, 'info', 'transcription', 'Manual transcript generation started');
      
      // Generate transcript using AI processor (requires streamId and videoId)
      const transcript = await aiProcessor.generateTranscript(video.stream_id, videoId);
      
      await this.logger.log(videoId, 'info', 'transcription', `Manual transcript generation completed: ${transcript.length} characters`);
      
      return { 
        success: true, 
        message: `Successfully generated transcript (${transcript.length} characters)`,
        transcript 
      };
      
    } catch (error) {
      await this.logger.log(videoId, 'error', 'transcription', 'Manual transcript generation failed', { error });
      console.error(`Manual transcript generation failed for video ${videoId}:`, error);
      return { success: false, message: 'Transcript generation failed' };
    }
  }

  /**
   * Manually vectorize transcript for a video
   */
  async vectorizeTranscriptManually(videoId: string): Promise<{ success: boolean; message: string; embeddingCount?: number }> {
    try {
      // Check if video exists and has transcript
      const video = await this.getVideo(videoId);
      if (!video) {
        return { success: false, message: 'Video not found' };
      }

      const transcript = await this.getVideoTranscript(videoId);
      if (!transcript || !transcript.content) {
        return { success: false, message: 'No transcript available for vectorization' };
      }

      await this.logger.log(videoId, 'info', 'transcription', 'Manual transcript vectorization started');
      
      // Get video tags for embedding metadata
      const tags = await this.getVideoTags(videoId);
      const tagNames = tags.map(tag => tag.name);
      
      // Generate and store embeddings
      const embeddingCount = await this.embeddingService.generateAndStoreEmbeddings(
        videoId,
        transcript.content,
        video.title,
        video.description || undefined,
        tagNames
      );
      
      await this.logger.log(videoId, 'info', 'transcription', `Manual transcript vectorization completed: ${embeddingCount} embeddings`);
      
      return { 
        success: true, 
        message: `Successfully generated ${embeddingCount} vector embeddings`,
        embeddingCount: embeddingCount 
      };
      
    } catch (error) {
      await this.logger.log(videoId, 'error', 'transcription', 'Manual transcript vectorization failed', { error });
      console.error(`Manual transcript vectorization failed for video ${videoId}:`, error);
      return { success: false, message: 'Transcript vectorization failed' };
    }
  }

  /**
   * Get embedding statistics for a video
   */
  async getEmbeddingStats(videoId: string): Promise<{ hasEmbeddings: boolean; embeddingCount?: number }> {
    try {
      const stats = await this.embeddingService.getEmbeddingStats();
      return {
        hasEmbeddings: stats.totalEmbeddings > 0,
        embeddingCount: stats.totalEmbeddings
      };
    } catch (error) {
      console.error(`Failed to get embedding stats for video ${videoId}:`, error);
      return { hasEmbeddings: false };
    }
  }

  // Perform detailed vector search with confidence scores for exploration
  async performDetailedVectorSearch(
    query: string, 
    limit: number, 
    minScore: number
  ): Promise<{
    videoId: string;
    title: string;
    description: string;
    chunkIndex: number;
    content: string;
    score: number;
    metadata: {
      videoTitle: string;
      videoDescription: string;
      chunkStart: number;
      chunkEnd: number;
      tags: string;
    };
  }[]> {
    try {
      // Validate query parameter
      if (!query || typeof query !== 'string' || query.trim() === '') {
        console.error('Invalid query parameter:', query);
        return [];
      }

      // Generate embedding for the search query
      console.log('Generating embedding for query:', query);
      const queryEmbedding = await this.env.AI.run('@cf/baai/bge-base-en-v1.5', {
        text: query.trim()
      }) as { data: number[][] };

      // Validate embedding response
      if (!queryEmbedding || !queryEmbedding.data || !Array.isArray(queryEmbedding.data) || queryEmbedding.data.length === 0) {
        console.error('Invalid embedding response:', queryEmbedding);
        return [];
      }

      // Search for similar vectors
      console.log('Querying vector database with embedding of length:', queryEmbedding.data[0].length);
      const vectorResults = await this.env.VIDEO_EMBEDDINGS.query(
        queryEmbedding.data[0],
        {
          topK: limit * 2, // Get more results to filter by score
          returnMetadata: true,
          returnValues: false
        }
      );

      // Validate vector search results
      if (!vectorResults || !vectorResults.matches || !Array.isArray(vectorResults.matches)) {
        console.error('Invalid vector search results:', vectorResults);
        return [];
      }

      console.log(`Found ${vectorResults.matches.length} vector matches, filtering by minScore: ${minScore}`);

      // Filter by minimum score and format results
      const filteredResults = vectorResults.matches
        .filter(match => {
          if (!match || typeof match.score !== 'number') {
            console.warn('Invalid match object:', match);
            return false;
          }
          return match.score >= minScore;
        })
        .slice(0, limit)
        .map(match => {
          try {
            return {
              videoId: String(match.metadata?.videoId || ''),
              title: String(match.metadata?.videoTitle || ''),
              description: String(match.metadata?.videoDescription || ''),
              chunkIndex: Number(match.metadata?.chunkIndex || 0),
              content: String(match.metadata?.content || ''),
              score: match.score,
              metadata: {
                videoTitle: String(match.metadata?.videoTitle || ''),
                videoDescription: String(match.metadata?.videoDescription || ''),
                chunkStart: Number(match.metadata?.chunkStart || 0),
                chunkEnd: Number(match.metadata?.chunkEnd || 0),
                tags: String(match.metadata?.tags || '')
              }
            };
          } catch (error) {
            console.error('Error processing match:', match, error);
            return null;
          }
        })
        .filter((result): result is {
          videoId: string;
          title: string;
          description: string;
          chunkIndex: number;
          content: string;
          score: number;
          metadata: {
            videoTitle: string;
            videoDescription: string;
            chunkStart: number;
            chunkEnd: number;
            tags: string;
          };
        } => result !== null);

      return filteredResults;
    } catch (error) {
      console.error('Detailed vector search error:', error);
      return [];
    }
  }

  // Get vector database statistics
  async getVectorDatabaseStats(): Promise<{
    totalEmbeddings: number;
    uniqueVideos: number;
    averageChunksPerVideo: number;
    lastUpdated: string | null;
  }> {
    try {
      // Get total embeddings count by querying with a dummy vector
      const dummyVector = new Array(768).fill(0);
      const queryResult = await this.env.VIDEO_EMBEDDINGS.query(
        dummyVector,
        {
          topK: 10000, // Large number to get total count
          returnMetadata: true,
          returnValues: false
        }
      );

      const totalEmbeddings = queryResult.matches.length;
      
      // Get unique video count
      const uniqueVideoIds = new Set(
        queryResult.matches.map(match => match.metadata?.videoId).filter(Boolean)
      );
      const uniqueVideos = uniqueVideoIds.size;
      
      // Calculate average chunks per video
      const averageChunksPerVideo = uniqueVideos > 0 ? totalEmbeddings / uniqueVideos : 0;

      return {
        totalEmbeddings,
        uniqueVideos,
        averageChunksPerVideo,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting vector database stats:', error);
      return {
        totalEmbeddings: 0,
        uniqueVideos: 0,
        averageChunksPerVideo: 0,
        lastUpdated: null
      };
    }
  }

  // Get Cloudflare Stream analytics (view count) for a video
  async getStreamAnalytics(streamId: string): Promise<{ viewCount: number } | null> {
    try {
      if (!this.env.STREAM_ACCOUNT_ID || !this.env.STREAM_API_TOKEN) {
        console.warn('Stream API credentials not configured for analytics');
        return null;
      }

      // Get analytics from Cloudflare Stream API
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.env.STREAM_ACCOUNT_ID}/stream/analytics/views?videoId=${streamId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.env.STREAM_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        console.warn(`Failed to fetch analytics for stream ${streamId}:`, response.status);
        return null;
      }

      const data = await response.json() as {
        success: boolean;
        result?: {
          totals?: {
            views?: number;
          };
        };
      };

      if (data.success && data.result?.totals?.views !== undefined) {
        return { viewCount: data.result.totals.views };
      }

      return { viewCount: 0 };
    } catch (error) {
      console.error(`Error fetching analytics for stream ${streamId}:`, error);
      return null;
    }
  }

  // Update video view count from Cloudflare Stream analytics
  async updateVideoViewCount(videoId: string): Promise<number | null> {
    try {
      const video = await this.getVideo(videoId);
      if (!video || !video.stream_id) {
        return null;
      }

      const analytics = await this.getStreamAnalytics(video.stream_id);
      if (analytics === null) {
        return null;
      }

      // Update the view count in the database
      await this.env.DB.prepare(`
        UPDATE videos SET view_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(analytics.viewCount, videoId).run();

      return analytics.viewCount;
    } catch (error) {
      console.error(`Error updating view count for video ${videoId}:`, error);
      return null;
    }
  }

  // Batch update view counts for multiple videos
  async batchUpdateViewCounts(videoIds: string[]): Promise<void> {
    try {
      const updatePromises = videoIds.map(videoId => this.updateVideoViewCount(videoId));
      await Promise.allSettled(updatePromises);
    } catch (error) {
      console.error('Error in batch updating view counts:', error);
    }
  }

  // Update video thumbnail using percentage-based timestamp
  async updateVideoThumbnail(videoId: string, thumbnailTimestampPct: number, updatedBy?: string): Promise<{ success: boolean; message: string; thumbnailUrl?: string }> {
    try {
      // Validate percentage (0.0 to 1.0)
      if (thumbnailTimestampPct < 0 || thumbnailTimestampPct > 1) {
        return { success: false, message: 'Thumbnail timestamp percentage must be between 0 and 1' };
      }

      // Get video details
      const video = await this.getVideo(videoId);
      if (!video) {
        return { success: false, message: 'Video not found' };
      }

      if (!this.env.STREAM_ACCOUNT_ID || !this.env.STREAM_API_TOKEN) {
        return { success: false, message: 'Stream API credentials not configured' };
      }

      // Update thumbnail timestamp in Cloudflare Stream
      const streamResponse = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.env.STREAM_ACCOUNT_ID}/stream/${video.stream_id}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.env.STREAM_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            thumbnailTimestampPct: thumbnailTimestampPct,
          }),
        }
      );

      if (!streamResponse.ok) {
        let errorMessage = `Stream API error (${streamResponse.status}): ${streamResponse.statusText}`;
        try {
          const errorData = await streamResponse.json() as {
            errors?: Array<{ message: string }>;
            error?: string;
          };
          if (errorData.errors && errorData.errors.length > 0) {
            errorMessage += ` - ${errorData.errors.map(e => e.message).join(', ')}`;
          } else if (errorData.error) {
            errorMessage += ` - ${errorData.error}`;
          }
        } catch (e) {
          console.error('Could not parse Stream API error response:', e);
        }
        return { success: false, message: errorMessage };
      }

      // Generate new thumbnail URL with timestamp (convert percentage to seconds)
      const videoDuration = video.duration || 60; // Default to 60 seconds if duration unknown
      const timeInSeconds = Math.floor(videoDuration * thumbnailTimestampPct);
      const thumbnailUrl = `https://videodelivery.net/${video.stream_id}/thumbnails/thumbnail.jpg?time=${timeInSeconds}s&height=600&fit=crop`;
      
      // Update thumbnail URL in database
      await this.env.DB.prepare(`
        UPDATE videos SET thumbnail_url = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ?
      `).bind(thumbnailUrl, updatedBy || null, videoId).run();

      await this.logger.log(videoId, 'info', 'update', 'Video thumbnail updated', { 
        thumbnailTimestampPct,
        thumbnailUrl 
      }, undefined, updatedBy);

      return {
        success: true,
        message: 'Thumbnail updated successfully',
        thumbnailUrl
      };

    } catch (error) {
      await this.logger.log(videoId, 'error', 'update', 'Failed to update video thumbnail', { error });
      console.error(`Failed to update thumbnail for video ${videoId}:`, error);
      return { success: false, message: 'Failed to update thumbnail' };
    }
  }

  // Generate thumbnail preview URLs for selection
  async generateThumbnailPreviews(videoId: string): Promise<{ success: boolean; message: string; previews?: Array<{ percentage: number; url: string; label: string }> }> {
    try {
      const video = await this.getVideo(videoId);
      if (!video) {
        return { success: false, message: 'Video not found' };
      }

      if (video.status !== 'ready') {
        return { success: false, message: 'Video must be ready to generate thumbnail previews' };
      }

      // Get video duration to calculate time in seconds
      const videoDuration = video.duration || 60; // Default to 60 seconds if duration unknown
      
      // Generate preview thumbnails at different time points
      const previewPercentages = [
        { percentage: 0.1, label: '10% (Beginning)' },
        { percentage: 0.25, label: '25% (Early)' },
        { percentage: 0.5, label: '50% (Middle)' },
        { percentage: 0.75, label: '75% (Late)' },
        { percentage: 0.9, label: '90% (Near End)' }
      ];

      const previews = previewPercentages.map(({ percentage, label }) => {
        const timeInSeconds = Math.floor(videoDuration * percentage);
        return {
          percentage,
          url: `https://videodelivery.net/${video.stream_id}/thumbnails/thumbnail.jpg?time=${timeInSeconds}s&height=300&width=400&fit=crop`,
          label
        };
      });

      return {
        success: true,
        message: 'Thumbnail previews generated successfully',
        previews
      };

    } catch (error) {
      console.error(`Failed to generate thumbnail previews for video ${videoId}:`, error);
      return { success: false, message: 'Failed to generate thumbnail previews' };
    }
  }
}
