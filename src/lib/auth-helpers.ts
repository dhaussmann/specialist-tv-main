import { D1Adapter } from "@auth/d1-adapter";
import { getContext } from './context';

export interface AuthSession {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: string;
    permissions?: string[];
  };
  expires: string;
}


/**
 * Get the current session from a request with enhanced error handling
 */
// This function is the correct way to get the session on the server-side in this environment.
// It programmatically creates a request to the /api/auth/session endpoint and handles it with Auth.js.
async function getServerSession(request: Request): Promise<AuthSession | null> {
  const { env } = getContext();
  console.log('[auth-helpers] Attempting to get server session...');
  const isDev = env.NEXTJS_ENV === 'development';
  const cookieName = isDev ? "authjs.session-token" : "__Secure-authjs.session-token";
  const cookies = request.headers.get('Cookie');
    const sessionToken = cookies?.match(new RegExp(`${cookieName}=([^;]+)`))?.[1];
  console.log(`[auth-helpers] Cookie name: ${cookieName}`);
  console.log(`[auth-helpers] Session token from cookie: ${sessionToken ? 'found' : 'not found'}`);

    if (!sessionToken) {
    console.log('[auth-helpers] No session token found in cookies.');
    return null;
  }

  const adapter = D1Adapter(env.DB);
  if (!adapter?.getSessionAndUser) {
    return null;
  }
    const sessionAndUser = await adapter.getSessionAndUser(sessionToken);
  console.log(`[auth-helpers] D1 Adapter returned: ${sessionAndUser ? 'session and user found' : 'null'}`);
  const { session, user } = sessionAndUser ?? { session: null, user: null };

    if (!session || !user) {
    console.log('[auth-helpers] Session or user is null, returning null from getServerSession.');
    return null;
  }

  // Get user role and permissions from database
  let userRole = 'viewer';
  let userPermissions: string[] = [];
  
  try {
    // Get user by email from database
    const userRecord = await env.DB.prepare(`
      SELECT id, role, permissions FROM users WHERE email = ? AND is_active = true
    `).bind(user.email!).first();
    
    if (userRecord) {
      userRole = (userRecord.role as string) || 'viewer';
      userPermissions = userRecord.permissions ? JSON.parse(userRecord.permissions as string) : [];
    }
  } catch (error) {
    console.log('[auth-helpers] Error fetching user role/permissions:', error);
  }

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: userRole,
      permissions: userPermissions,
    },
    expires: session.expires.toISOString(),
  };
}

export async function getSession(request: Request): Promise<AuthSession | null> {
        return getServerSession(request);
}

/**
 * Require authentication for an API endpoint with enhanced validation
 */
export async function requireAuth(request: Request): Promise<AuthSession> {
    const session = await getServerSession(request);
  
  if (!session?.user) {
    throw new Response(JSON.stringify({ 
      error: 'Authentication required',
      message: 'Please sign in to access this resource'
    }), {
      status: 401,
      headers: { 
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer realm="Specialist TV"'
      }
    })
  }
  
  // Additional validation for session integrity
  if (!session.user.id || !session.user.email) {
    throw new Response(JSON.stringify({ 
      error: 'Invalid session',
      message: 'Session is missing required user information'
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  
  return session
}

/**
 * Get user info from session with enhanced data extraction
 */
export function getUserFromSession(session: AuthSession | null): { 
  id: string; 
  email: string; 
  name: string;
  image?: string;
  role?: string;
  permissions?: string[];
} | null {
  if (!session?.user) {
    return null
  }
  
  return {
    id: session.user.id,
    email: session.user.email || 'unknown',
    name: session.user.name || session.user.email?.split('@')[0] || 'unknown',
    image: session.user.image || undefined,
    role: session.user.role,
    permissions: session.user.permissions,
  }
}

/**
 * Check if user has specific role
 */
export function hasRole(session: AuthSession | null, role: string): boolean {
  return session?.user?.role === role;
}

/**
 * Check if user has specific permission
 */
export function hasPermission(session: AuthSession | null, permission: string): boolean {
  return session?.user?.permissions?.includes(permission) || false;
}

/**
 * Check if user is admin
 */
export function isAdmin(session: AuthSession | null): boolean {
  return hasRole(session, 'admin');
}

/**
 * Check if user can create content
 */
export function canCreate(session: AuthSession | null): boolean {
  return hasPermission(session, 'create_videos') || hasRole(session, 'admin') || hasRole(session, 'creator');
}

/**
 * Validate session expiration and refresh if needed
 */
export function isSessionValid(session: AuthSession | null): boolean {
  if (!session) return false
  
  const expiresAt = new Date(session.expires)
  const now = new Date()
  
  // Check if session expires within the next 5 minutes
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000)
  
  return expiresAt > fiveMinutesFromNow
}
