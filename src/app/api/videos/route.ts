import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { VideoAPI } from '@/api/videos';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { getUserFromSession } from '@/lib/auth-helpers';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

// GET /api/videos - List videos
export async function GET(request: NextRequest) {
  try {
    const { env } = await getCloudflareContext();
    const videoAPI = new VideoAPI(env);
    
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status') || undefined;

    const videos = await videoAPI.listVideos(page, limit, status);
    
    return NextResponse.json(videos, { headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({ error: message }, { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}

// PATCH /api/videos - Update video metadata
export async function PATCH(request: NextRequest) {
  try {
    const { env } = await getCloudflareContext();
    
    // Require edit permission
    const session = await requirePermission(request, PERMISSIONS.EDIT_VIDEOS);
    const user = getUserFromSession(session);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    const videoAPI = new VideoAPI(env);
    const body = await request.json() as { id?: string; title?: string; description?: string; abstract?: string };
    const { id, title, description, abstract } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Video ID is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const result = await videoAPI.updateVideo(id, { title, description, abstract });
    
    return NextResponse.json(result, { headers: corsHeaders });
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

// POST /api/videos - Upload video
export async function POST(request: NextRequest) {
  try {
    const { env } = await getCloudflareContext();
    
    // Require upload permission
    const session = await requirePermission(request, PERMISSIONS.UPLOAD_VIDEOS);
    const user = getUserFromSession(session);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const videoAPI = new VideoAPI(env);
    
    const formData = await request.formData();
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const file = formData.get('video') as File;

    if (!title || !file) {
      return NextResponse.json(
        { error: 'Title and video file are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const result = await videoAPI.uploadVideo(file, title, description);
    
    return NextResponse.json(result, { headers: corsHeaders });
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
