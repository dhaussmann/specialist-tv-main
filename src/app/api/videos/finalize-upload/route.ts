import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { requireAuth, getUserFromSession } from '@/lib/auth-helpers';
import { VideoAPI } from '@/api/videos';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

// POST /api/videos/finalize-upload - Create database record after successful upload
export async function POST(request: NextRequest) {
  try {
    const { env } = await getCloudflareContext();
    
    // Check authentication
    const session = await requireAuth(request);
    const user = getUserFromSession(session);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json() as {
      video_id: string;
      stream_id: string;
      title: string;
      description?: string;
      thumbnail_url: string;
    };
    const { video_id, stream_id, title, description, thumbnail_url } = body;

    if (!video_id || !stream_id || !title) {
      return NextResponse.json(
        { error: 'video_id, stream_id, and title are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Store video metadata in D1 database
    await env.DB.prepare(`
      INSERT INTO videos (id, title, description, stream_id, status, thumbnail_url, created_by)
      VALUES (?, ?, ?, ?, 'processing', ?, ?)
    `).bind(video_id, title, description || '', stream_id, thumbnail_url, user.email || null).run();

    // Initialize VideoAPI for sync functionality
    const videoAPI = new VideoAPI(env);

    // Schedule immediate sync to check processing status
    setTimeout(async () => {
      try {
        await videoAPI.syncVideoStatusFromStream(video_id);
      } catch (error) {
        console.error('Error in immediate sync after upload:', error);
      }
    }, 5000); // Check after 5 seconds

    // Schedule additional syncs at increasing intervals
    const syncIntervals = [15000, 30000, 60000, 120000]; // 15s, 30s, 1m, 2m
    syncIntervals.forEach((interval) => {
      setTimeout(async () => {
        try {
          const video = await videoAPI.getVideo(video_id);
          if (video && video.status === 'processing') {
            await videoAPI.syncVideoStatusFromStream(video_id);
          }
        } catch (error) {
          console.error(`Error in scheduled sync after ${interval}ms:`, error);
        }
      }, interval);
    });

    // Return video object for immediate UI update
    const currentTime = new Date().toISOString();
    const video = {
      id: video_id,
      title,
      description: description || undefined,
      stream_id,
      upload_date: currentTime,
      status: 'processing',
      created_at: currentTime,
      updated_at: currentTime,
      thumbnail_url,
    };

    return NextResponse.json({ video }, { headers: corsHeaders });

  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({ error: message }, { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}
