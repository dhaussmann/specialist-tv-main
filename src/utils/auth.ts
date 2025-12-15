// Authentication utilities for Cloudflare Workers

export interface AuthToken {
  username: string;
  email?: string;
  provider?: string;
  oidc_sub?: string;
  exp: number;
}

export function verifyAuthToken(authHeader: string | null): AuthToken | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.substring(7);
  
  try {
    const payload = JSON.parse(atob(token)) as AuthToken;
    
    // Check if token is expired
    if (Date.now() > payload.exp) {
      return null;
    }
    
    return payload;
  } catch {
    return null;
  }
}

export function requireAuth(request: Request): AuthToken {
  const authHeader = request.headers.get('Authorization');
  const token = verifyAuthToken(authHeader);
  
  if (!token) {
    throw new Error('Authentication required');
  }
  
  return token;
}
