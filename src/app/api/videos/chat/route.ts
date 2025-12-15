import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { requireAuth } from '@/lib/auth-helpers';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

// POST /api/videos/chat - Video chat with AI
export async function POST(request: NextRequest) {
  try {
    const { env } = await getCloudflareContext();

    // Require authentication
    const session = await requireAuth(request);
    
    console.log('Video chat session:', { 
      userId: session.user?.id, 
      email: session.user?.email,
      role: session.user?.role 
    });
    
    const { message, transcript, videoTitle, videoDescription } = await request.json() as {
      message: string;
      transcript: string;
      videoTitle: string;
      videoDescription?: string;
    };

    if (!message || !transcript) {
      return NextResponse.json(
        { error: 'Message and transcript are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Create a context-aware prompt for the AI
    const systemPrompt = `You are an AI assistant helping users understand video content. You have access to the full transcript of a video titled "${videoTitle}"${videoDescription ? ` with description: "${videoDescription}"` : ''}.

Transcript:
${transcript}

Please answer questions about this video based on the transcript content. Be helpful, accurate, and reference specific parts of the transcript when relevant. If asked about timestamps or specific moments, try to relate them to the content. Keep responses concise but informative.`;

    const userPrompt = `User question: ${message}`;

    // Use Cloudflare AI to generate response
    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 512,
      temperature: 0.7
    });

    // Extract the response text
    const aiResponse = response.response || 'I apologize, but I couldn\'t generate a response. Please try asking your question again.';

    return NextResponse.json({ response: aiResponse }, { headers: corsHeaders });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    
    console.error('Video chat error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({ error: message }, { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}
