import { VideoAPI } from './api/videos';

// Handler functions for vector exploration endpoints
export async function handleVectorSearch(url: URL, videoAPI: VideoAPI): Promise<Response> {
  try {
    const query = url.searchParams.get('q');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const minScore = parseFloat(url.searchParams.get('minScore') || '0.0');

    if (!query) {
      return new Response(JSON.stringify({ error: 'Search query is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const results = await videoAPI.performDetailedVectorSearch(query, limit, minScore);
    
    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function handleVectorStats(videoAPI: VideoAPI): Promise<Response> {
  try {
    const stats = await videoAPI.getVectorDatabaseStats();
    
    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
