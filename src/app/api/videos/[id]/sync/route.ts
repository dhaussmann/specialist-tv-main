import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { VideoAPI } from '@/api/videos';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { getUserFromSession } from '@/lib/auth-helpers';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

// POST /api/videos/[id]/sync - Force sync specific video status
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  try {
    const { env } = await getCloudflareContext();
    
    // Require edit permission (creators and admins can sync)
    const session = await requirePermission(request, PERMISSIONS.EDIT_VIDEOS);
    const user = getUserFromSession(session);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const videoId = resolvedParams.id;
    if (!videoId) {
      return NextResponse.json(
        { error: 'Video ID is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const videoAPI = new VideoAPI(env);
    
    // Check if video exists
    const video = await videoAPI.getVideo(videoId);
    if (!video) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    // Force sync the video status
    await videoAPI.syncVideoStatusFromStream(videoId);
    
    // Get updated video data
    const updatedVideo = await videoAPI.getVideo(videoId);
    
    return NextResponse.json(
      { 
        message: 'Video sync completed',
        video: updatedVideo
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
