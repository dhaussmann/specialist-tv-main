// Manual AI Processing Action Handlers
import { VideoAPI } from './api/videos';

export async function handleGenerateChaptersManually(videoId: string, videoAPI: VideoAPI): Promise<Response> {
  try {
    const result = await videoAPI.generateChaptersManually(videoId);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ 
      success: false, 
      message: `Failed to generate chapters: ${message}` 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function handleGenerateTagsManually(videoId: string, videoAPI: VideoAPI): Promise<Response> {
  try {
    const result = await videoAPI.generateTagsManually(videoId);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ 
      success: false, 
      message: `Failed to generate tags: ${message}` 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function handleGenerateAbstractManually(videoId: string, videoAPI: VideoAPI): Promise<Response> {
  try {
    const result = await videoAPI.generateAbstractManually(videoId);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ 
      success: false, 
      message: `Failed to generate abstract: ${message}` 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function handleGenerateTitleManually(videoId: string, videoAPI: VideoAPI): Promise<Response> {
  try {
    const result = await videoAPI.generateTitleManually(videoId);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ 
      success: false, 
      message: `Failed to generate title: ${message}` 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function handleGenerateTranscriptManually(videoId: string, videoAPI: VideoAPI): Promise<Response> {
  try {
    const result = await videoAPI.generateTranscriptManually(videoId);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ 
      success: false, 
      message: `Failed to generate transcript: ${message}` 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function handleVectorizeTranscriptManually(videoId: string, videoAPI: VideoAPI): Promise<Response> {
  try {
    const result = await videoAPI.vectorizeTranscriptManually(videoId);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ 
      success: false, 
      message: `Failed to vectorize transcript: ${message}` 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function handleGetEmbeddingStats(videoId: string, videoAPI: VideoAPI): Promise<Response> {
  try {
    const stats = await videoAPI.getEmbeddingStats(videoId);
    return new Response(JSON.stringify(stats), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ 
      hasEmbeddings: false, 
      error: message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
