import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { VideoAPI } from '@/api/videos';
import { requireAuth, getUserFromSession } from '@/lib/auth-helpers';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

// GET /api/videos/[id] - Get video by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { env } = await getCloudflareContext();
    const videoAPI = new VideoAPI(env);
    const { id } = await params;
    
    const video = await videoAPI.getVideo(id);
    
    if (!video) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    return NextResponse.json(video, { headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({ error: message }, { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}

// PUT /api/videos/[id] - Update video by ID
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { env } = await getCloudflareContext();
    
    // Check authentication
    const session = await requireAuth(request);
    const user = getUserFromSession(session);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const videoAPI = new VideoAPI(env);
    
    const body = await request.json() as { title?: string; description?: string };
    
    if (!body.title && !body.description) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400, headers: corsHeaders }
      );
    }

    const { id } = await params;
    
    const result = await videoAPI.updateVideo(id, body);
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { 
          status: result.message === 'Video not found' ? 404 : 500,
          headers: corsHeaders 
        }
      );
    }

    return NextResponse.json({ 
      success: true, 
      message: result.message,
      video: result.video 
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

// DELETE /api/videos/[id] - Delete video by ID
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { env } = await getCloudflareContext();
    
    // Check authentication
    const session = await requireAuth(request);
    const user = getUserFromSession(session);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const videoAPI = new VideoAPI(env);
    
    const { id } = await params;
    
    const result = await videoAPI.deleteVideo(id);
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { 
          status: result.message === 'Video not found' ? 404 : 500,
          headers: corsHeaders 
        }
      );
    }

    return NextResponse.json(
      { message: result.message },
      { headers: corsHeaders }
    );
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
