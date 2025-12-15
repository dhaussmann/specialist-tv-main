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

// GET /api/logs/level - Get logs by level
export async function GET(request: NextRequest) {
  try {
    const { env } = await getCloudflareContext();
    const videoAPI = new VideoAPI(env);
    
    const { searchParams } = new URL(request.url);
    const level = searchParams.get('level') as 'debug' | 'info' | 'warning' | 'error';
    const limit = parseInt(searchParams.get('limit') || '50');
    
    if (!level || !['debug', 'info', 'warning', 'error'].includes(level)) {
      return NextResponse.json(
        { error: 'Invalid or missing level parameter' },
        { status: 400, headers: corsHeaders }
      );
    }
    
    const logs = await videoAPI.getLogsByLevel(level, limit);
    
    return NextResponse.json(logs, { headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({ error: message }, { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}
