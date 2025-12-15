// AI processing service for transcription, tagging, and chapters

import { VideoLogger } from './video-logger';
import { EmbeddingService } from './embedding-service';

export interface ProcessingJob {
  video_id: string;
  stream_id: string;
  type: 'transcription' | 'tagging' | 'chapters' | 'thumbnail' | 'abstract';
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export class AIProcessor {
  private logger: VideoLogger;
  private embeddingService: EmbeddingService;

  constructor(private env: CloudflareEnv) {
    this.logger = new VideoLogger(env);
    this.embeddingService = new EmbeddingService(env);
  }

  // Generate transcript using Cloudflare Stream's native AI captions with AI enhancement
  async generateTranscript(streamId: string, videoId: string): Promise<string> {
    const logStep = this.logger.logProcessingStep(
      videoId,
      'transcription',
      'AI caption generation and enhancement using Cloudflare Stream',
      { streamId }
    );

    try {
      await this.logger.log(videoId, 'info', 'transcription', 'Starting AI caption generation and enhancement', { streamId });
      
      // First, check if AI captions already exist
      const existingCaptionsResponse = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.env.STREAM_ACCOUNT_ID}/stream/${streamId}/captions`,
        {
          headers: {
            'Authorization': `Bearer ${this.env.STREAM_API_TOKEN}`,
          },
        }
      );

      let shouldGenerateNew = true;
      let rawTranscriptContent = '';
      let vttContent = '';

      if (existingCaptionsResponse.ok) {
        const existingData = await existingCaptionsResponse.json() as {
          result: Array<{
            language: string;
            generated: boolean;
            status?: string;
          }>
        };
        
        const existingEnglishCaption = existingData.result.find(cap => cap.language === 'en' && cap.generated);
        
        if (existingEnglishCaption) {
          if (existingEnglishCaption.status === 'ready') {
            // AI captions already exist and are ready - download them directly via VTT endpoint
            await this.logger.log(videoId, 'info', 'transcription', 'AI captions already exist, downloading via VTT endpoint');
            
            const vttResponse = await fetch(
              `https://api.cloudflare.com/client/v4/accounts/${this.env.STREAM_ACCOUNT_ID}/stream/${streamId}/captions/en/vtt`,
              {
                headers: {
                  'Authorization': `Bearer ${this.env.STREAM_API_TOKEN}`,
                },
              }
            );
            
            if (vttResponse.ok) {
              vttContent = await vttResponse.text();
              rawTranscriptContent = this.extractTextFromVTT(vttContent);
              shouldGenerateNew = false;
              await this.logger.log(videoId, 'info', 'transcription', 'Successfully downloaded existing AI captions via VTT', { 
                contentLength: rawTranscriptContent.length 
              });
            }
          } else {
            // AI captions exist but are still processing
            await this.logger.log(videoId, 'info', 'transcription', 'AI captions already exist but are still processing, waiting for completion');
            shouldGenerateNew = false;
          }
        }
      }

      // Only generate new captions if they don't exist
      if (shouldGenerateNew) {
        await this.logger.log(videoId, 'info', 'transcription', 'Generating new AI captions');
        
        const captionResponse = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${this.env.STREAM_ACCOUNT_ID}/stream/${streamId}/captions/en/generate`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.env.STREAM_API_TOKEN}`,
            }
          }
        );

        if (!captionResponse.ok) {
          const errorText = await captionResponse.text();
          const errorMsg = `Failed to generate AI captions: ${captionResponse.status} ${captionResponse.statusText} - ${errorText}`;
          logStep.error(errorMsg, { status: captionResponse.status, statusText: captionResponse.statusText });
          throw new Error(errorMsg);
        }

        await this.logger.log(videoId, 'info', 'transcription', 'AI caption generation requested successfully');
        
        // Wait a moment for caption generation to start
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Poll for caption completion (max 30 seconds) or use existing content
      let attempts = 0;
      const maxAttempts = 15;
      let captionContent = rawTranscriptContent; // Use existing content if available
      
      // Only poll if we don't already have content
      while (!captionContent && attempts < maxAttempts) {
        try {
          // Check caption status and download if ready
          const statusResponse = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${this.env.STREAM_ACCOUNT_ID}/stream/${streamId}/captions`,
            {
              headers: {
                'Authorization': `Bearer ${this.env.STREAM_API_TOKEN}`,
              },
            }
          );

          if (statusResponse.ok) {
            const statusData = await statusResponse.json() as {
              result: Array<{
                language: string;
                generated: boolean;
                status?: string;
              }>
            };
            
            const englishCaption = statusData.result.find(cap => cap.language === 'en' && cap.generated);
            
            if (englishCaption && englishCaption.status === 'ready') {
              // Download the caption file via VTT endpoint
              const vttResponse = await fetch(
                `https://api.cloudflare.com/client/v4/accounts/${this.env.STREAM_ACCOUNT_ID}/stream/${streamId}/captions/en/vtt`,
                {
                  headers: {
                    'Authorization': `Bearer ${this.env.STREAM_API_TOKEN}`,
                  },
                }
              );
              
              if (vttResponse.ok) {
                vttContent = await vttResponse.text();
                captionContent = this.extractTextFromVTT(vttContent);
                await this.logger.log(videoId, 'info', 'transcription', 'Successfully extracted transcript from VTT', {
                  contentLength: captionContent.length
                });
                break;
              }
            } else if (englishCaption && englishCaption.status === 'error') {
              throw new Error('AI caption generation failed');
            }
          }
          
          attempts++;
          if (attempts < maxAttempts) {
            await this.logger.log(videoId, 'info', 'transcription', `Waiting for AI captions... (attempt ${attempts}/${maxAttempts})`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (pollError) {
          await this.logger.log(videoId, 'warning', 'transcription', `Caption polling attempt ${attempts + 1} failed`, { error: pollError });
          attempts++;
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }
      
      if (!captionContent) {
        throw new Error('Failed to generate or retrieve AI captions within timeout period');
      }

      // Enhance transcript using AI for better readability and structure
      await this.logger.log(videoId, 'info', 'transcription', 'Enhancing transcript with AI for better readability');
      const enhancedTranscript = await this.enhanceTranscriptWithAI(captionContent, videoId);

      // Store enhanced transcript and VTT content in database
      const transcriptId = crypto.randomUUID();
      await this.env.DB.prepare(`
        INSERT INTO transcripts (id, video_id, content, vtt_content, language, confidence_score)
        VALUES (?, ?, ?, ?, 'en', ?)
      `).bind(transcriptId, videoId, enhancedTranscript, vttContent, 0.95).run(); // Slightly lower confidence for AI-enhanced content

      await this.logger.log(videoId, 'info', 'transcription', 'Enhanced transcript stored in database', { 
        transcriptId, 
        originalLength: captionContent.length,
        enhancedLength: enhancedTranscript.length,
        confidence: 0.95 
      });

      // Update search index
      await this.updateSearchIndex(videoId);
      
      // Generate and store vector embeddings for semantic search
      await this.generateEmbeddingsForVideo(videoId, enhancedTranscript);
      
      logStep.complete('AI caption generation and enhancement completed successfully', {
        originalLength: captionContent.length,
        enhancedLength: enhancedTranscript.length,
        transcriptId
      });

      return enhancedTranscript;
    } catch (error) {
      logStep.error('AI caption generation failed', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  // Helper method to extract plain text from VTT caption format
  private extractTextFromVTT(vttContent: string): string {
    const lines = vttContent.split('\n');
    const textLines: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip VTT headers, timestamps, and empty lines
      if (line === 'WEBVTT' || 
          line === '' || 
          line.includes('-->') ||
          line.startsWith('NOTE') ||
          /^\d+$/.test(line)) {
        continue;
      }
      
      // This should be caption text
      if (line) {
        textLines.push(line);
      }
    }
    
    return textLines.join(' ').trim();
  }

  // Enhance transcript using AI for better readability and structure
  private async enhanceTranscriptWithAI(rawTranscript: string, videoId: string): Promise<string> {
    try {
      await this.logger.log(videoId, 'info', 'transcription', 'Starting AI transcript enhancement');
      
      const prompt = `
        Please enhance this video transcript for better readability and structure while preserving all the original content and meaning.
        
        Improvements to make:
        1. Fix grammar and punctuation
        2. Add proper paragraph breaks for different topics or speakers
        3. Correct obvious transcription errors (but don't change technical terms)
        4. Improve sentence structure for clarity
        5. Maintain all technical terminology and specific details
        6. Keep the conversational tone if it's a presentation or demo
        
        Original transcript:
        ${rawTranscript}
        
        Return only the enhanced transcript without any additional commentary or formatting markers.
      `;

      const response = await this.env.AI.run('@cf/meta/llama-4-scout-17b-16e-instruct', {
        prompt,
        max_tokens: Math.min(4000, Math.max(1000, rawTranscript.length * 1.5)), // Dynamic token limit based on input
      });

      const enhancedTranscript = response.response?.trim() || rawTranscript;
      
      // Fallback to original if enhancement seems to have failed or is too short
      if (enhancedTranscript.length < rawTranscript.length * 0.5) {
        await this.logger.log(videoId, 'warning', 'transcription', 'AI enhancement produced short result, using original transcript');
        return rawTranscript;
      }
      
      await this.logger.log(videoId, 'info', 'transcription', 'AI transcript enhancement completed', {
        originalLength: rawTranscript.length,
        enhancedLength: enhancedTranscript.length,
        improvementRatio: (enhancedTranscript.length / rawTranscript.length).toFixed(2)
      });
      
      return enhancedTranscript;
    } catch (error) {
      await this.logger.log(videoId, 'error', 'transcription', 'AI transcript enhancement failed, using original', { error });
      return rawTranscript; // Fallback to original transcript if enhancement fails
    }
  }

  // Generate AI tags for presales searchability
  async generateTags(videoId: string, transcript: string, title: string): Promise<string[]> {
    try {
      const prompt = `
        Analyze this video content and generate relevant tags for searchability.
        
        Title: ${title}
        Transcript: ${transcript.substring(0, 2000)}...
        
        Generate 5-10 specific, searchable tags that a presales team would use to find this content.
        Return only the tags as a comma-separated list. Tags should be as short as possible and concise. Return the tags and only the tags, nothing else.
        
        Examples of good presales tags:
        - Product names (e.g., "Cloudflare Workers", "CDN", "Security")
        - Customer types (e.g., "Enterprise", "SMB", "Developer")
        - Use cases (e.g., "API Protection", "Performance Optimization")
        - Difficulty (e.g., "Beginner", "Advanced", "Technical Deep Dive")
        - Topics (e.g., "Demo", "Troubleshooting", "Best Practices")
      `;

      const response = await this.env.AI.run('@cf/meta/llama-4-scout-17b-16e-instruct', {
        prompt,
        max_tokens: 200,
      });

      const tagsText = response.response || '';
      const tagNames = tagsText
        .split(',')
        .map(tag => tag.trim().toLowerCase())
        .filter(tag => tag.length > 0)
        .slice(0, 10);

      // Clear existing tags for this video to ensure complete replacement
      await this.env.DB.prepare(`
        DELETE FROM video_tags WHERE video_id = ?
      `).bind(videoId).run();

      // Store new tags in database
      for (const tagName of tagNames) {
        // Insert or get existing tag
        let tagId: string;
        const existingTag = await this.env.DB.prepare(`
          SELECT id FROM tags WHERE name = ?
        `).bind(tagName).first();

        if (existingTag) {
          tagId = (existingTag as { id: string }).id;
        } else {
          tagId = crypto.randomUUID();
          await this.env.DB.prepare(`
            INSERT INTO tags (id, name, category) VALUES (?, ?, 'auto-generated')
          `).bind(tagId, tagName).run();
        }

        // Link tag to video
        await this.env.DB.prepare(`
          INSERT INTO video_tags (video_id, tag_id, confidence_score)
          VALUES (?, ?, 0.8)
        `).bind(videoId, tagId).run();
      }

      // Update search index
      await this.updateSearchIndex(videoId);

      return tagNames;
    } catch (error) {
      console.error('Tag generation failed:', error);
      throw error;
    }
  }

  // Generate AI chapters for video navigation
  async generateChapters(videoId: string, transcript: string, duration: number): Promise<void> {
    const logStep = this.logger.logProcessingStep(
      videoId,
      'chapters',
      'AI chapter generation based on enhanced transcript',
      { duration, transcriptLength: transcript.length }
    );

    try {
      await this.logger.log(videoId, 'info', 'chapters', 'Starting AI chapter generation', {
        duration,
        transcriptLength: transcript.length
      });
      const prompt = `
        Analyze this video transcript and create chapters for easy navigation.
        Video duration: ${duration} seconds
        
        Transcript: ${transcript}
        
        Create 3-8 chapters with:
        - Descriptive titles
        - Start/end timestamps (in seconds)
        - Brief summaries
        - Ensure timestamps don't overlap and are within video duration
        
        CRITICAL INSTRUCTIONS:
        - Return ONLY ONE valid JSON array
        - No markdown formatting, code blocks, or extra text
        - Do NOT repeat the JSON array
        - Do NOT include explanations or comments
        - Stop immediately after the closing bracket ]
        
        Example format:
        [
          {
            "title": "Introduction and Overview",
            "start_time": 0,
            "end_time": 120,
            "summary": "Brief description of what's covered"
          }
        ]
      `;

      const response = await this.env.AI.run('@cf/meta/llama-4-scout-17b-16e-instruct', {
        prompt,
        max_tokens: 500,
      });

      let chapters: Array<{ start_time: number; end_time: number; title: string; summary: string }> = [];
      try {
        let parsedChapters;
        
        // Handle both string and object responses
        if (typeof response.response === 'string') {
          // Extract JSON from string response, handling markdown code blocks
          let jsonString = response.response || '[]';
          
          // Check if response is wrapped in markdown code blocks
          const codeBlockMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (codeBlockMatch) {
            jsonString = codeBlockMatch[1].trim();
          }
          
          // Handle duplicate JSON arrays - extract the first complete one
          const jsonArrayMatches = jsonString.match(/\[\s*[\s\S]*?\]/g);
          if (jsonArrayMatches && jsonArrayMatches.length > 0) {
            // Use the first complete JSON array found
            jsonString = jsonArrayMatches[0];
          }
          
          parsedChapters = JSON.parse(jsonString);
        } else {
          // Response is already a parsed object/array
          parsedChapters = response.response || [];
        }
        
        // Validate chapters structure
        if (Array.isArray(parsedChapters)) {
          chapters = parsedChapters.filter(chapter => 
            chapter && 
            typeof chapter.title === 'string' && 
            typeof chapter.start_time === 'number' && 
            typeof chapter.end_time === 'number' &&
            chapter.start_time >= 0 &&
            chapter.end_time <= duration &&
            chapter.start_time < chapter.end_time
          );
          
          await this.logger.log(videoId, 'info', 'chapters', 'Successfully parsed and validated AI-generated chapters', {
            originalCount: parsedChapters.length,
            validatedCount: chapters.length,
            responseType: typeof response.response,
            sampleData: JSON.stringify(parsedChapters).substring(0, 200) + '...' // Log first 200 chars for debugging
          });
        } else {
          throw new Error('Parsed response is not an array');
        }
      } catch (parseError) {
        const responsePreview = typeof response.response === 'string' 
          ? response.response.substring(0, 500) + (response.response.length > 500 ? '...' : '')
          : JSON.stringify(response.response).substring(0, 500) + '...';
          
        await this.logger.log(videoId, 'warning', 'chapters', 'Failed to parse AI response, using fallback chapters', {
          error: parseError,
          responseType: typeof response.response,
          responseLength: typeof response.response === 'string' ? response.response.length : 'N/A',
          responsePreview,
          errorMessage: parseError instanceof Error ? parseError.message : 'Unknown error'
        });
        // Fallback: create simple chapters based on duration
        const chapterCount = Math.min(Math.ceil(duration / 300), 8); // Every 5 minutes, max 8
        for (let i = 0; i < chapterCount; i++) {
          const startTime = Math.floor((duration / chapterCount) * i);
          const endTime = Math.floor((duration / chapterCount) * (i + 1));
          chapters.push({
            title: `Chapter ${i + 1}`,
            start_time: startTime,
            end_time: Math.min(endTime, duration),
            summary: `Content from ${Math.floor(startTime / 60)}:${(startTime % 60).toString().padStart(2, '0')} to ${Math.floor(endTime / 60)}:${(endTime % 60).toString().padStart(2, '0')}`,
          });
        }
      }

      // Clear existing chapters for this video to ensure complete replacement
      await this.env.DB.prepare(`
        DELETE FROM chapters WHERE video_id = ?
      `).bind(videoId).run();

      // Store new chapters in database
      for (const chapter of chapters) {
        const chapterId = crypto.randomUUID();
        await this.env.DB.prepare(`
          INSERT INTO chapters (id, video_id, title, start_time, end_time, summary)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
          chapterId,
          videoId,
          chapter.title,
          chapter.start_time,
          chapter.end_time,
          chapter.summary || ''
        ).run();
      }

      await this.logger.log(videoId, 'info', 'chapters', 'Chapters stored in database', {
        chapterCount: chapters.length
      });

      logStep.complete('AI chapter generation completed successfully', {
        chapterCount: chapters.length,
        duration
      });
    } catch (error) {
      logStep.error('Chapter generation failed', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // Generate AI thumbnail based on prompt
  async generateThumbnail(prompt: string, videoId: string): Promise<string> {
    try {
      const response = await this.env.AI.run('@cf/stabilityai/stable-diffusion-xl-base-1.0', {
        prompt: `Professional video thumbnail: ${prompt}. Clean, modern design suitable for business presentation.`,
        num_steps: 20,
      });

      // Convert response to blob and upload to R2
      const imageBlob = new Blob([response as unknown as BlobPart], { type: 'image/png' });
      const thumbnailKey = `thumbnails/${videoId}-${Date.now()}.png`;
      
      await this.env.THUMBNAILS.put(thumbnailKey, imageBlob, {
        httpMetadata: {
          contentType: 'image/png',
        },
      });

      const thumbnailUrl = `https://your-r2-domain.com/${thumbnailKey}`;
      
      // Update video with thumbnail URL
      await this.env.DB.prepare(`
        UPDATE videos SET thumbnail_url = ? WHERE id = ?
      `).bind(thumbnailUrl, videoId).run();

      return thumbnailUrl;
    } catch (error) {
      console.error('Thumbnail generation failed:', error);
      throw error;
    }
  }

  // Update search index for a video
  private async updateSearchIndex(videoId: string): Promise<void> {
    try {
      // Get video data
      const video = await this.env.DB.prepare(`
        SELECT v.*, t.content as transcript_content
        FROM videos v
        LEFT JOIN transcripts t ON v.id = t.video_id
        WHERE v.id = ?
      `).bind(videoId).first();

      if (!video) return;

      // Get tags
      const tags = await this.env.DB.prepare(`
        SELECT GROUP_CONCAT(t.name, ' ') as tag_names
        FROM video_tags vt
        JOIN tags t ON vt.tag_id = t.id
        WHERE vt.video_id = ?
      `).bind(videoId).first();

      const videoData = video as { title: string; description: string; transcript_content?: string };
      const tagNames = (tags as { tag_names?: string })?.tag_names || '';

      // Update FTS index
      await this.env.DB.prepare(`
        INSERT OR REPLACE INTO search_index (video_id, title, description, transcript_content, tags)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        videoId,
        videoData.title,
        videoData.description || '',
        videoData.transcript_content || '',
        tagNames
      ).run();
    } catch (error) {
      console.error('Search index update failed:', error);
    }
  }

  // Generate vector embeddings for a video transcript
  private async generateEmbeddingsForVideo(videoId: string, transcript: string): Promise<void> {
    try {
      await this.logger.log(videoId, 'info', 'transcription', 'Starting vector embedding generation for transcript');

      // Get video metadata for embedding context
      const video = await this.env.DB.prepare(`
        SELECT title, description
        FROM videos
        WHERE id = ?
      `).bind(videoId).first();

      if (!video) {
        throw new Error(`Video not found: ${videoId}`);
      }

      // Get video tags for additional context
      const tagsResult = await this.env.DB.prepare(`
        SELECT GROUP_CONCAT(t.name, ',') as tag_names
        FROM video_tags vt
        JOIN tags t ON vt.tag_id = t.id
        WHERE vt.video_id = ?
      `).bind(videoId).first();

      const tags = tagsResult?.tag_names ? (tagsResult.tag_names as string).split(',') : undefined;

      // Generate and store embeddings
      await this.embeddingService.generateAndStoreEmbeddings(
        videoId,
        transcript,
        video.title as string,
        video.description as string,
        tags
      );

      await this.logger.log(videoId, 'info', 'transcription', 'Vector embedding generation completed successfully');
    } catch (error) {
      await this.logger.log(videoId, 'error', 'transcription', 'Vector embedding generation failed', { error });
      console.error(`Failed to generate embeddings for video ${videoId}:`, error);
      // Don't throw error to avoid breaking transcript generation
    }
  }

  // Generate AI abstract based on video transcript
  async generateAbstract(videoId: string): Promise<string> {
    const logStep = this.logger.logProcessingStep(
      videoId,
      'abstract',
      'AI abstract generation using video transcript',
      { videoId }
    );

    try {
      await this.logger.log(videoId, 'info', 'abstract', 'Starting AI abstract generation', { videoId });

      // Get video details and transcript
      const video = await this.env.DB.prepare(`
        SELECT title, description
        FROM videos
        WHERE id = ?
      `).bind(videoId).first() as { title: string; description?: string } | null;

      if (!video) {
        throw new Error(`Video not found: ${videoId}`);
      }

      const transcript = await this.env.DB.prepare(`
        SELECT content FROM transcripts WHERE video_id = ?
      `).bind(videoId).first() as { content: string } | null;

      if (!transcript || !transcript.content) {
        throw new Error(`No transcript found for video: ${videoId}`);
      }

      await this.logger.log(videoId, 'info', 'abstract', 'Retrieved video transcript for abstract generation');

      // Create AI prompt for abstract generation
      const systemPrompt = `You are an AI assistant that creates concise, informative abstracts for video content. 
Your task is to analyze the video transcript and create a brief abstract that captures the key points and main themes.

Guidelines:
- Keep the abstract between 2-4 sentences (50-150 words)
- Focus on the main topics, key insights, and practical takeaways
- Write in a professional, clear tone
- Avoid redundant information already in the title or description
- Make it engaging and informative for someone deciding whether to watch
- Do not include timestamps or speaker references
- Focus on content value and key learnings`;

      const userPrompt = `Video Title: "${video.title}"
${video.description ? `Video Description: "${video.description}"\n` : ''}\nTranscript:\n${transcript.content.substring(0, 4000)}${transcript.content.length > 4000 ? '...' : ''}

Please create a concise abstract for this video content:`;

      await this.logger.log(videoId, 'info', 'abstract', 'Sending transcript to AI for abstract generation');

      // Generate abstract using Cloudflare AI
      const response = await this.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 200,
        temperature: 0.7
      });

      let abstract = '';
      if (response && response.response) {
        abstract = typeof response.response === 'string' 
          ? response.response.trim() 
          : String(response.response).trim();
      }

      if (!abstract) {
        throw new Error('AI failed to generate abstract');
      }

      await this.logger.log(videoId, 'info', 'abstract', 'AI abstract generated successfully', { 
        abstractLength: abstract.length 
      });

      // Store abstract in database
      await this.env.DB.prepare(`
        UPDATE videos 
        SET abstract = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).bind(abstract, videoId).run();

      await this.logger.log(videoId, 'info', 'abstract', 'Abstract stored in database successfully');
      await logStep.complete('Abstract generation completed successfully');

      return abstract;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.logger.log(videoId, 'error', 'abstract', 'Abstract generation failed', { error: errorMessage });
      await logStep.error(`Abstract generation failed: ${errorMessage}`, error instanceof Error ? error : undefined);
      throw error;
    }
  }

  // Generate AI title based on video transcript
  async generateTitle(videoId: string): Promise<string> {
    const logStep = this.logger.logProcessingStep(
      videoId,
      'title_generation',
      'AI title generation using video transcript',
      { videoId }
    );

    try {
      await this.logger.log(videoId, 'info', 'title_generation', 'Starting AI title generation', { videoId });

      // Get video details and transcript
      const video = await this.env.DB.prepare(`
        SELECT title, description
        FROM videos
        WHERE id = ?
      `).bind(videoId).first() as { title: string; description?: string } | null;

      if (!video) {
        throw new Error(`Video not found: ${videoId}`);
      }

      const transcript = await this.env.DB.prepare(`
        SELECT content FROM transcripts WHERE video_id = ?
      `).bind(videoId).first() as { content: string } | null;

      if (!transcript || !transcript.content) {
        throw new Error(`No transcript found for video: ${videoId}`);
      }

      await this.logger.log(videoId, 'info', 'title_generation', 'Retrieved video transcript for title generation');

      // Create AI prompt for title generation
      const systemPrompt = `You are an AI assistant that creates compelling, descriptive titles for video content.
Your task is to analyze the video transcript and create a concise, engaging title that accurately represents the main topic and key insights.

Guidelines:
- Keep the title between 5-12 words (40-80 characters)
- Make it descriptive and specific to the content
- Use clear, professional language
- Avoid clickbait or overly promotional language
- Focus on the main topic, key insights, or practical value
- Make it searchable and informative
- Do not use quotes, colons, or special characters
- Capitalize properly (title case)`;

      const userPrompt = `Current Title: "${video.title}"
${video.description ? `Current Description: "${video.description}"\n` : ''}\nTranscript:\n${transcript.content.substring(0, 4000)}${transcript.content.length > 4000 ? '...' : ''}

Please create a better, more descriptive title for this video content:`;

      await this.logger.log(videoId, 'info', 'title_generation', 'Sending transcript to AI for title generation');

      // Generate title using Cloudflare AI
      const response = await this.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 50,
        temperature: 0.7
      });

      let title = '';
      if (response && response.response) {
        title = typeof response.response === 'string' 
          ? response.response.trim() 
          : String(response.response).trim();
      }

      if (!title) {
        throw new Error('AI failed to generate title');
      }

      // Clean up the title (remove quotes, limit length, etc.)
      title = title.replace(/^["']|["']$/g, ''); // Remove surrounding quotes
      title = title.substring(0, 100); // Limit to 100 characters
      title = title.trim();

      await this.logger.log(videoId, 'info', 'title_generation', 'AI title generated successfully', { 
        titleLength: title.length,
        generatedTitle: title
      });

      await logStep.complete('Title generation completed successfully');

      return title;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.logger.log(videoId, 'error', 'title_generation', 'Title generation failed', { error: errorMessage });
      await logStep.error(`Title generation failed: ${errorMessage}`, error instanceof Error ? error : undefined);
      throw error;
    }
  }
}
