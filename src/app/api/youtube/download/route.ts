import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { YouTubeProcessor } from '@/services/youtube-processor';
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

// POST /api/youtube/download - Download YouTube video
export async function POST(request: NextRequest) {
  try {
    const { env } = await getCloudflareContext();
    
    // Check authentication
    const session = await requireAuth(request);
    const user = getUserFromSession(session);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const videoAPI = new VideoAPI(env);
    
    const { url, format, title, description } = await request.json() as {
      url: string;
      format: { itag: number; quality: string; format: string; ext: string };
      title?: string;
      description?: string;
    };
    
    if (!url || !format) {
      return NextResponse.json(
        { error: 'URL and format are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const youtubeProcessor = new YouTubeProcessor(env);
    
    if (!youtubeProcessor.isValidYouTubeUrl(url)) {
      return NextResponse.json(
        { error: 'Invalid YouTube URL' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Extract video ID from URL
    const videoId = youtubeProcessor.extractVideoId(url);
    if (!videoId) {
      return NextResponse.json(
        { error: 'Could not extract video ID from URL' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Get video info first
    const videoInfo = await youtubeProcessor.getVideoInfo(videoId);
    
    // Download the video
    const downloadResult = await youtubeProcessor.downloadVideo(url, format);
    
    if (!downloadResult.success || !downloadResult.videoBuffer) {
      return NextResponse.json(
        { error: downloadResult.error || 'Download failed' },
        { status: 500, headers: corsHeaders }
      );
    }

    // Create a File object from the buffer
    const videoFile = new File(
      [downloadResult.videoBuffer], 
      downloadResult.filename || `youtube_${videoInfo.videoId}.${format.ext}`,
      { type: `video/${format.ext}` }
    );

    // Upload to Cloudflare Stream using existing VideoAPI
    const uploadResult = await videoAPI.uploadVideo(
      videoFile,
      title || videoInfo.title,
      description || videoInfo.description,
      'youtube-downloader'
    );

    return NextResponse.json({
      success: true,
      video: uploadResult,
      originalVideoInfo: videoInfo
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
