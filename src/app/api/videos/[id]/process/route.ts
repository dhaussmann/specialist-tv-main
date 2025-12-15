import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { VideoAPI } from '@/api/videos';
import { requireAuth } from '@/lib/auth-helpers';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

// POST /api/videos/[id]/process - Retrigger specific processing phase
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { env } = await getCloudflareContext();
    const session = await requireAuth(request);
    
    if (!session) {
      return NextResponse.json({ error: 'Authentication required' }, { 
        status: 401, 
        headers: corsHeaders 
      });
    }

    const resolvedParams = await params;
    const videoId = resolvedParams.id;
    const body = await request.json() as { phase?: string; force?: boolean };
    const { phase, force = false } = body;

    if (!phase) {
      return NextResponse.json({ error: 'Processing phase is required' }, { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    const validPhases = ['transcription', 'tagging', 'abstract', 'title_generation', 'chapters', 'thumbnail', 'all'];
    if (!validPhases.includes(phase)) {
      return NextResponse.json({ 
        error: `Invalid phase. Valid phases: ${validPhases.join(', ')}` 
      }, { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    const videoAPI = new VideoAPI(env);
    
    // Get video and validate it exists
    const video = await videoAPI.getVideo(videoId);
    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { 
        status: 404, 
        headers: corsHeaders 
      });
    }

    // Ensure video is ready for processing
    if (video.status !== 'ready' && video.status !== 'processing') {
      return NextResponse.json({ 
        error: `Video must be ready or processing to retrigger phases. Current status: ${video.status}` 
      }, { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    console.log(`🔄 Retriggering ${phase} for video ${videoId} (force: ${force})`);

    if (phase === 'all') {
      // Retrigger all phases in the correct order
      await retriggerAllPhases(env, videoId, video.stream_id, force);
    } else {
      // Retrigger specific phase
      await retriggerPhase(env, videoId, video.stream_id, phase, force);
    }

    return NextResponse.json({
      message: `Successfully retriggered ${phase} processing for video ${videoId}`,
      video_id: videoId,
      phase,
      force,
      timestamp: new Date().toISOString()
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('Process retrigger error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return NextResponse.json({ 
      error: 'Failed to retrigger processing', 
      details: message 
    }, { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}

// Helper function to retrigger all phases
async function retriggerAllPhases(
  env: CloudflareEnv, 
  videoId: string, 
  streamId: string, 
  force: boolean
) {
  console.log(`🔄 Retriggering all phases for video ${videoId}`);
  
  // Clear existing processing data if force is true
  if (force) {
    await clearProcessingData(env, videoId);
  }
  
  // Start with transcription - all other phases will be triggered automatically
  await env.VIDEO_PROCESSING_QUEUE.send({
    video_id: videoId,
    stream_id: streamId,
    type: 'transcription',
    status: 'pending',
  });
}

// Helper function to retrigger specific phase
async function retriggerPhase(
  env: CloudflareEnv, 
  videoId: string, 
  streamId: string, 
  phase: string,
  force: boolean
) {
  console.log(`🔄 Retriggering ${phase} for video ${videoId}`);
  
  // Clear specific phase data if force is true
  if (force) {
    await clearPhaseData(env, videoId, phase);
  }
  
  // Queue the specific phase
  await env.VIDEO_PROCESSING_QUEUE.send({
    video_id: videoId,
    stream_id: streamId,
    type: phase,
    status: 'pending',
  });
}

// Helper function to clear all processing data
async function clearProcessingData(env: CloudflareEnv, videoId: string) {
  console.log(`🗑️ Clearing all processing data for video ${videoId}`);
  
  // Clear transcripts
  await env.DB.prepare('DELETE FROM transcripts WHERE video_id = ?')
    .bind(videoId).run();
  
  // Clear chapters
  await env.DB.prepare('DELETE FROM chapters WHERE video_id = ?')
    .bind(videoId).run();
  
  // Clear tags
  await env.DB.prepare('DELETE FROM video_tags WHERE video_id = ?')
    .bind(videoId).run();
  
  // Clear video abstract
  await env.DB.prepare('UPDATE videos SET abstract = NULL WHERE id = ?')
    .bind(videoId).run();
}

// Helper function to clear specific phase data
async function clearPhaseData(env: CloudflareEnv, videoId: string, phase: string) {
  console.log(`🗑️ Clearing ${phase} data for video ${videoId}`);
  
  switch (phase) {
    case 'transcription':
      await env.DB.prepare('DELETE FROM transcripts WHERE video_id = ?')
        .bind(videoId).run();
      break;
    case 'chapters':
      await env.DB.prepare('DELETE FROM chapters WHERE video_id = ?')
        .bind(videoId).run();
      break;
    case 'tagging':
      await env.DB.prepare('DELETE FROM video_tags WHERE video_id = ?')
        .bind(videoId).run();
      break;
    case 'abstract':
      await env.DB.prepare('UPDATE videos SET abstract = NULL WHERE id = ?')
        .bind(videoId).run();
      break;
    case 'title_generation':
      // Don't clear title as it might be manually set
      console.log('Title generation retriggered - will generate new title');
      break;
    case 'thumbnail':
      // Thumbnail processing placeholder
      console.log('Thumbnail processing retriggered');
      break;
  }
}
