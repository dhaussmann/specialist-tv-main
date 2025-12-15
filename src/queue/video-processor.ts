// Queue consumer for async video processing

import { ProcessingJob, StreamInfoResponse, WebhookPayload } from '../types';
import { AIProcessor } from '../services/ai-processor';
import { VideoAPI } from '../api/videos';
import { VideoCompletionChecker } from '../api/video-completion-checker';

export async function handleVideoProcessing(
  batch: MessageBatch<ProcessingJob>,
  env: CloudflareEnv
): Promise<void> {
  const aiProcessor = new AIProcessor(env);
  const videoAPI = new VideoAPI(env);
  const completionChecker = new VideoCompletionChecker(env);

  for (const message of batch.messages) {
    const job = message.body;
    
    try {
      console.log(`Processing job: ${job.type} for video ${job.video_id}`);
      
      switch (job.type) {
        case 'transcription':
          await processTranscription(job, aiProcessor, videoAPI, env);
          break;
          
        case 'tagging':
          await processTagging(job, aiProcessor, videoAPI, env);
          break;
          
        case 'chapters':
          await processChapters(job, aiProcessor, videoAPI, env, completionChecker);
          break;
          
        case 'abstract':
          await processAbstract(job, aiProcessor, videoAPI, env, completionChecker);
          break;
          
        case 'title_generation':
          await processTitleGeneration(job, aiProcessor, videoAPI, env, completionChecker);
          break;
          
        case 'thumbnail':
          await processThumbnail(job);
          break;
          
        default:
          console.warn(`Unknown job type: ${job.type}`);
      }
      
      // Acknowledge successful processing
      message.ack();
      
    } catch (error) {
      console.error(`Failed to process job ${job.type} for video ${job.video_id}:`, error);
      
      // Extract error message safely
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Retry logic - retry up to 3 times
      if (message.attempts < 3) {
        message.retry();
      } else {
        // Mark video as error state after max retries
        await videoAPI.updateVideoStatus(job.video_id, 'error');
        message.ack(); // Acknowledge to remove from queue
        
        // Send error webhook
        await sendWebhook(env, {
          event_type: 'processing_failed',
          video_id: job.video_id,
          data: { error: errorMessage, job_type: job.type },
          timestamp: new Date().toISOString(),
        });
      }
    }
  }
}

async function processTranscription(
  job: ProcessingJob,
  aiProcessor: AIProcessor,
  videoAPI: VideoAPI,
  env: CloudflareEnv
): Promise<void> {
  console.log(`Starting transcription for video ${job.video_id}`);
  
  const transcript = await aiProcessor.generateTranscript(job.stream_id, job.video_id);
  
  // Queue all remaining phases in parallel for faster processing
  const remainingPhases = ['tagging', 'abstract', 'title_generation', 'chapters'];
  
  for (const phase of remainingPhases) {
    await env.VIDEO_PROCESSING_QUEUE.send({
      video_id: job.video_id,
      stream_id: job.stream_id,
      type: phase,
      status: 'pending',
    });
  }
  
  console.log(`Transcription completed for video ${job.video_id}, queued all remaining phases`);
  
  // Send webhook notification
  await sendWebhook(env, {
    event_type: 'transcription_complete',
    video_id: job.video_id,
    data: { transcript_length: transcript.length },
    timestamp: new Date().toISOString(),
  });
}

async function processTagging(
  job: ProcessingJob,
  aiProcessor: AIProcessor,
  videoAPI: VideoAPI,
  env: CloudflareEnv
): Promise<void> {
  console.log(`Starting tagging for video ${job.video_id}`);
  
  // Get video and transcript
  const video = await videoAPI.getVideo(job.video_id);
  if (!video) {
    throw new Error(`Video ${job.video_id} not found`);
  }
  
  const transcript = await env.DB.prepare(`
    SELECT content FROM transcripts WHERE video_id = ?
  `).bind(job.video_id).first() as { content: string } | null;
  
  if (!transcript) {
    throw new Error(`Transcript not found for video ${job.video_id}`);
  }
  
  const tags = await aiProcessor.generateTags(
    job.video_id,
    transcript.content,
    video.title
  );
  
  console.log(`Tagging completed for video ${job.video_id}:`, tags);
  
  // Send webhook notification
  await sendWebhook(env, {
    event_type: 'tagging_complete',
    video_id: job.video_id,
    data: { tags },
    timestamp: new Date().toISOString(),
  });
}

async function processChapters(
  job: ProcessingJob,
  aiProcessor: AIProcessor,
  videoAPI: VideoAPI,
  env: CloudflareEnv,
  completionChecker: VideoCompletionChecker
): Promise<void> {
  console.log(`Starting chapter generation for video ${job.video_id}`);
  
  // Get video duration from Stream API
  const streamResponse = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.STREAM_ACCOUNT_ID}/stream/${job.stream_id}`,
    {
      headers: {
        'Authorization': `Bearer ${env.STREAM_API_TOKEN}`,
      },
    }
  );
  
  if (!streamResponse.ok) {
    throw new Error(`Failed to get stream info: ${streamResponse.statusText}`);
  }
  
  const streamData: StreamInfoResponse = await streamResponse.json();
  const duration = streamData.result.duration || 0;
  
  // Get transcript
  const transcript = await env.DB.prepare(`
    SELECT content FROM transcripts WHERE video_id = ?
  `).bind(job.video_id).first() as { content: string } | null;
  
  if (!transcript) {
    throw new Error(`Transcript not found for video ${job.video_id}`);
  }
  
  await aiProcessor.generateChapters(
    job.video_id,
    transcript.content,
    duration
  );
  
  console.log(`Chapter generation completed for video ${job.video_id}`);
  
  // Send webhook notification
  await sendWebhook(env, {
    event_type: 'chapters_complete',
    video_id: job.video_id,
    data: { duration },
    timestamp: new Date().toISOString(),
  });
  
  // Check if all processing is complete and mark as ready if so
  await checkAndMarkComplete(job.video_id, videoAPI, completionChecker, env, duration);
}

async function processAbstract(
  job: ProcessingJob,
  aiProcessor: AIProcessor,
  videoAPI: VideoAPI,
  env: CloudflareEnv,
  completionChecker: VideoCompletionChecker
): Promise<void> {
  console.log(`Starting abstract generation for video ${job.video_id}`);
  
  const abstract = await aiProcessor.generateAbstract(job.video_id);
  
  console.log(`Abstract generation completed for video ${job.video_id}`);
  
  // Send webhook notification
  await sendWebhook(env, {
    event_type: 'abstract_complete',
    video_id: job.video_id,
    data: { abstract_length: abstract.length },
    timestamp: new Date().toISOString(),
  });
  
  // Check if all processing is complete
  await checkAndMarkComplete(job.video_id, videoAPI, completionChecker, env);
}

async function processTitleGeneration(
  job: ProcessingJob,
  aiProcessor: AIProcessor,
  videoAPI: VideoAPI,
  env: CloudflareEnv,
  completionChecker: VideoCompletionChecker
): Promise<void> {
  console.log(`Starting title generation for video ${job.video_id}`);
  
  const title = await aiProcessor.generateTitle(job.video_id);
  
  // Update the video title in the database
  await env.DB.prepare(`
    UPDATE videos 
    SET title = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `).bind(title, job.video_id).run();
  
  console.log(`Title generation completed for video ${job.video_id}: "${title}"`);
  
  // Send webhook notification
  await sendWebhook(env, {
    event_type: 'title_generation_complete',
    video_id: job.video_id,
    data: { new_title: title },
    timestamp: new Date().toISOString(),
  });
  
  // Check if all processing is complete
  await checkAndMarkComplete(job.video_id, videoAPI, completionChecker, env);
}

async function processThumbnail(
  job: ProcessingJob
): Promise<void> {
  console.log(`Processing thumbnail for video ${job.video_id}`);
  // Thumbnail processing logic would go here
  // For now, this is a placeholder
  console.log(`Thumbnail processing completed for video ${job.video_id}`);
}

// Helper function to check completion and mark video as ready
async function checkAndMarkComplete(
  videoId: string,
  videoAPI: VideoAPI,
  completionChecker: VideoCompletionChecker,
  env: CloudflareEnv,
  duration?: number
): Promise<void> {
  const isComplete = await completionChecker.isProcessingComplete(videoId);
  
  if (isComplete) {
    console.log(`✅ All processing complete for video ${videoId}, marking as ready`);
    await videoAPI.updateVideoStatus(videoId, 'ready', { duration });
    
    // Send final webhook notification
    await sendWebhook(env, {
      event_type: 'processing_complete',
      video_id: videoId,
      data: { duration, status: 'ready' },
      timestamp: new Date().toISOString(),
    });
  }
}

async function sendWebhook(env: CloudflareEnv, payload: WebhookPayload): Promise<void> {
  try {
    const webhookId = crypto.randomUUID();
    
    // Store webhook in database
    await env.DB.prepare(`
      INSERT INTO webhooks (id, event_type, payload, status)
      VALUES (?, ?, ?, 'pending')
    `).bind(webhookId, payload.event_type, JSON.stringify(payload)).run();
    
    // In a real implementation, you would send this to configured webhook URLs
    // For now, we'll just log it
    console.log(`Webhook stored: ${payload.event_type} for video ${payload.video_id}`);
    
    // Mark webhook as sent
    await env.DB.prepare(`
      UPDATE webhooks SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(webhookId).run();
    
  } catch (error) {
    console.error('Failed to send webhook:', error);
  }
}
