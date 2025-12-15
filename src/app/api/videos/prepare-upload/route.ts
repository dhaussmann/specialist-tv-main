import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { requireAuth, getUserFromSession } from '@/lib/auth-helpers';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

interface StreamUploadResponse {
  result: {
    uid: string;
    uploadURL: string;
  };
  success: boolean;
}

// POST /api/videos/prepare-upload - Get Cloudflare Stream direct upload URL
export async function POST(request: NextRequest) {
  try {
    const { env } = await getCloudflareContext();
    
    // Check authentication
    const session = await requireAuth(request);
    const user = getUserFromSession(session);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json() as { title: string; description?: string };
    const { title, description } = body;

    if (!title) {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!env.STREAM_ACCOUNT_ID || !env.STREAM_API_TOKEN) {
      return NextResponse.json(
        { error: 'Stream API credentials not configured' },
        { status: 500, headers: corsHeaders }
      );
    }

    // Generate unique video ID
    const videoId = crypto.randomUUID();
    
    // Create direct upload URL with Cloudflare Stream
    const streamResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.STREAM_ACCOUNT_ID}/stream/direct_upload`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.STREAM_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          maxDurationSeconds: 7200, // 2 hours max
          expiry: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hour expiry
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
        };
        if (errorData.errors && errorData.errors.length > 0) {
          errorMessage += ` - ${errorData.errors.map(e => e.message).join(', ')}`;
        } else if (errorData.error) {
          errorMessage += ` - ${errorData.error}`;
        }
      } catch (e) {
        console.error('Could not parse Stream API error response:', e);
      }
      
      return NextResponse.json(
        { error: errorMessage },
        { status: 500, headers: corsHeaders }
      );
    }

    const streamData: StreamUploadResponse = await streamResponse.json();
    const streamId = streamData.result.uid;
    const uploadUrl = streamData.result.uploadURL;

    return NextResponse.json({
      video_id: videoId,
      stream_id: streamId,
      upload_url: uploadUrl,
      thumbnail_url: `https://videodelivery.net/${streamId}/thumbnails/thumbnail.jpg?time=0s&height=600`
    }, { headers: corsHeaders });

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
