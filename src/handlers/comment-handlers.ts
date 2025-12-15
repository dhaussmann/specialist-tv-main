import { CommentsAPI } from '../api/comments';
import { decodeJWTToken } from '../utils/jwt';
import { AuthSession } from '../lib/auth-helpers';

// Comment handler functions
export async function handleGetVideoComments(videoId: string, env: CloudflareEnv): Promise<Response> {
  try {
    const commentsAPI = new CommentsAPI(env);
    
    const comments = await commentsAPI.getVideoComments(videoId);
    const count = await commentsAPI.getCommentCount(videoId);
    
    return new Response(JSON.stringify({ comments, count }), {
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

export async function handleCreateComment(request: Request, videoId: string, env: CloudflareEnv, session?: AuthSession): Promise<Response> {
  try {
    const commentsAPI = new CommentsAPI(env);
    
    // Use session from Auth.js if provided, otherwise fall back to JWT
    let user;
    if (session?.user) {
      user = {
        username: session.user.email || session.user.name || session.user.id, // Use email, name, or id as username
        id: session.user.id
      };
    } else {
      // Fallback to legacy JWT authentication
      const authHeader = request.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Invalid authorization header' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      
      const token = authHeader.substring(7);
      const decodedUser = decodeJWTToken(token);
      
      if (!decodedUser) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      
      user = decodedUser;
    }
    
    const body = await request.json() as { content: string; parent_id?: string };
    
    if (!body.content?.trim()) {
      return new Response(JSON.stringify({ error: 'Comment content is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    const result = await commentsAPI.createComment(
      videoId,
      body.content.trim(),
      user.username,
      body.parent_id
    );
    
    return new Response(JSON.stringify(result), {
      status: result.success ? 201 : 400,
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

export async function handleUpdateComment(request: Request, videoId: string, commentId: string, env: CloudflareEnv): Promise<Response> {
  try {
    const commentsAPI = new CommentsAPI(env);
    
    // Get user from auth token
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Invalid authorization header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    const token = authHeader.substring(7);
    const user = decodeJWTToken(token);
    
    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    const body = await request.json() as { content: string };
    
    if (!body.content?.trim()) {
      return new Response(JSON.stringify({ error: 'Comment content is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    const result = await commentsAPI.updateComment(
      commentId,
      body.content.trim(),
      user.username
    );
    
    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 400,
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

export async function handleDeleteComment(request: Request, videoId: string, commentId: string, env: CloudflareEnv): Promise<Response> {
  try {
    const commentsAPI = new CommentsAPI(env);
    
    // Get user from auth token
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Invalid authorization header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    const token = authHeader.substring(7);
    const user = decodeJWTToken(token);
    
    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    const result = await commentsAPI.deleteComment(commentId, user.username);
    
    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 400,
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
