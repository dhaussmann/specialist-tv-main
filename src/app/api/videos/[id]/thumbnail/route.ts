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

// GET /api/videos/[id]/thumbnail - Get thumbnail preview options
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { env } = await getCloudflareContext();
    const videoAPI = new VideoAPI(env);
    
    const { id } = await params;
    
    const result = await videoAPI.generateThumbnailPreviews(id);
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400, headers: corsHeaders }
      );
    }
    
    return NextResponse.json(
      { previews: result.previews },
      { headers: corsHeaders }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({ error: message }, { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}

// POST /api/videos/[id]/thumbnail - Update video thumbnail
export async function POST(
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
    
    const { thumbnailTimestampPct } = await request.json() as { thumbnailTimestampPct?: number };

    if (thumbnailTimestampPct === undefined || typeof thumbnailTimestampPct !== 'number') {
      return NextResponse.json(
        { error: 'thumbnailTimestampPct is required and must be a number between 0 and 1' },
        { status: 400, headers: corsHeaders }
      );
    }

    const { id } = await params;
    
    const result = await videoAPI.updateVideoThumbnail(id, thumbnailTimestampPct, user.email);
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400, headers: corsHeaders }
      );
    }
    
    return NextResponse.json(
      { 
        message: result.message,
        thumbnail_url: result.thumbnailUrl
      },
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
