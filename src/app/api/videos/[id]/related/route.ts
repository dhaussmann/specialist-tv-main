import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { VideoAPI } from '@/api/videos';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Response cache headers for better performance
const cacheHeaders = {
  'Cache-Control': 'public, max-age=300, s-maxage=300', // 5 minutes cache
  'CDN-Cache-Control': 'public, max-age=300',
  'Vary': 'Accept-Encoding',
};

export async function OPTIONS() {
  return new NextResponse(null, { 
    headers: {
      ...corsHeaders,
      'Cache-Control': 'public, max-age=86400' // Cache OPTIONS for 24 hours
    }
  });
}

// GET /api/videos/[id]/related - Get related videos (optimized with caching)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { env } = await getCloudflareContext();
    const videoAPI = new VideoAPI(env);
    
    const { id } = await params;
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '5', 10);
    
    // Validate limit parameter
    const validatedLimit = Math.min(Math.max(limit, 1), 20); // Between 1 and 20
    
    const startTime = Date.now();
    const relatedVideos = await videoAPI.getRelatedVideos(id, validatedLimit);
    const duration = Date.now() - startTime;
    
    console.log(`Related videos API took ${duration}ms for video ${id}`);
    
    return NextResponse.json(relatedVideos, { 
      headers: {
        ...corsHeaders,
        ...cacheHeaders,
        'X-Response-Time': `${duration}ms`,
        'X-Cache-Status': 'MISS' // Will be HIT if served from cache
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(`Related videos API error for video ${(await params).id}:`, error);
    
    return NextResponse.json({ error: message }, { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}
