import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { VideoAPI } from '@/api/videos';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

// POST /api/sync - Manual trigger for syncing all processing videos
export async function POST(request: NextRequest) {
  try {
    const { env } = await getCloudflareContext();
    
    // Check if request has admin authorization (optional security layer)
    const authHeader = request.headers.get('authorization');
    if (authHeader && !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Invalid authorization format' }, { status: 401 });
    }

    const videoAPI = new VideoAPI(env);
    
    console.log('Manual sync triggered via API');
    await videoAPI.syncAllProcessingVideos();
    
    return NextResponse.json(
      { 
        message: 'Manual sync completed successfully',
        timestamp: new Date().toISOString()
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Manual sync error:', message);
    
    return NextResponse.json({ 
      error: 'Sync failed', 
      details: message 
    }, { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}
