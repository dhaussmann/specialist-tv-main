import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { VideoAPI } from '@/api/videos';
import { verifyWebhookSignature } from '@/utils/webhook';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

// POST /api/stream/webhook - Handle Stream webhook
export async function POST(request: NextRequest) {
  try {
    const { env } = await getCloudflareContext();
    
    // Get request body as text for signature verification
    const requestBody = await request.text();
    
    // Verify webhook signature if configured
    if (env.WEBHOOK_SECRET) {
      const signature = request.headers.get('webhook-signature');
      if (!signature) {
        console.error('Missing webhook signature');
        return new NextResponse('Missing signature', { 
          status: 401, 
          headers: corsHeaders 
        });
      }
      
      const isValid = await verifyWebhookSignature(requestBody, signature, env.WEBHOOK_SECRET);
      if (!isValid) {
        console.error('Invalid webhook signature');
        return new NextResponse('Invalid signature', { 
          status: 401, 
          headers: corsHeaders 
        });
      }
      
      console.log('✅ Webhook signature verified');
    }
    
    // Parse the webhook payload
    const webhook = JSON.parse(requestBody) as {
      uid?: string;
      readyToStream?: boolean;
      status?: {
        state?: 'pendingupload' | 'downloading' | 'queued' | 'inprogress' | 'ready' | 'error';
        pctComplete?: string;
        errorReasonCode?: string;
        errorReasonText?: string;
      };
      meta?: Record<string, unknown>;
      created?: string;
      modified?: string;
    };
    
    console.log('📨 Received Stream webhook:', JSON.stringify(webhook, null, 2));

    const streamId = webhook.uid;
    if (!streamId) {
      console.log('No stream ID in webhook, ignoring');
      return new NextResponse('OK', { 
        status: 200, 
        headers: corsHeaders 
      });
    }

    // Find video by stream_id in our database
    const videoAPI = new VideoAPI(env);
    const video = await env.DB.prepare(`
      SELECT id FROM videos WHERE stream_id = ?
    `).bind(streamId).first() as { id: string } | null;

    if (!video) {
      console.log(`No video found for stream ID ${streamId}`);
      return new NextResponse('OK', { 
        status: 200, 
        headers: corsHeaders 
      });
    }

    const videoId = video.id;
    console.log(`Found video ${videoId} for stream ${streamId}`);

    // Handle different webhook events based on actual Stream webhook format
    if (webhook.status?.state === 'ready' || webhook.readyToStream === true) {
      console.log(`🎬 Video ${videoId} is ready for processing, starting immediate pipeline`);
      
      // Update video status to ready first
      await videoAPI.syncVideoStatusFromStream(videoId);
      
      // Start processing pipeline immediately - all phases will run in parallel after transcription
      await env.VIDEO_PROCESSING_QUEUE.send({
        video_id: videoId,
        stream_id: streamId,
        type: 'transcription',
        status: 'pending',
      });

      console.log(`✅ Started immediate processing pipeline for video ${videoId}`);
    } else if (webhook.status?.state === 'inprogress') {
      console.log(`🔄 Video ${videoId} is still encoding (${webhook.status.pctComplete}% complete)`);
      await videoAPI.syncVideoStatusFromStream(videoId);
    } else {
      // For other webhook events, just sync the status
      console.log(`📊 Syncing status for video ${videoId} due to webhook (state: ${webhook.status?.state})`);
      await videoAPI.syncVideoStatusFromStream(videoId);
    }

    return new NextResponse('OK', { 
      status: 200, 
      headers: corsHeaders 
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new NextResponse('Error', { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}
