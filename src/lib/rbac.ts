import { AuthSession, requireAuth, hasRole, hasPermission, isAdmin } from './auth-helpers';

/**
 * Role-based access control middleware and utilities
 */

export const ROLES = {
  ADMIN: 'admin',
  CREATOR: 'creator',
  VIEWER: 'viewer'
} as const;

export const PERMISSIONS = {
  CREATE_VIDEOS: 'create_videos',
  EDIT_VIDEOS: 'edit_videos',
  DELETE_VIDEOS: 'delete_videos',
  MANAGE_USERS: 'manage_users',
  MANAGE_DOMAINS: 'manage_domains',
  VIEW_ADMIN: 'view_admin',
  UPLOAD_VIDEOS: 'upload_videos',
  COMMENT_VIDEOS: 'comment_videos'
} as const;

/**
 * Default permissions for each role
 */
export const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: [
    PERMISSIONS.CREATE_VIDEOS,
    PERMISSIONS.EDIT_VIDEOS,
    PERMISSIONS.DELETE_VIDEOS,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.MANAGE_DOMAINS,
    PERMISSIONS.VIEW_ADMIN,
    PERMISSIONS.UPLOAD_VIDEOS,
    PERMISSIONS.COMMENT_VIDEOS
  ],
  [ROLES.CREATOR]: [
    PERMISSIONS.CREATE_VIDEOS,
    PERMISSIONS.EDIT_VIDEOS,
    PERMISSIONS.UPLOAD_VIDEOS,
    PERMISSIONS.COMMENT_VIDEOS
  ],
  [ROLES.VIEWER]: [
    PERMISSIONS.COMMENT_VIDEOS
  ]
} as const;

/**
 * Require specific role for API endpoint
 */
export async function requireRole(request: Request, requiredRole: string): Promise<AuthSession> {
  const session = await requireAuth(request);
  
  if (!hasRole(session, requiredRole) && !isAdmin(session)) {
    throw new Response(JSON.stringify({
      error: 'Insufficient permissions',
      message: `This action requires ${requiredRole} role or higher`
    }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return session;
}

/**
 * Require specific permission for API endpoint
 */
export async function requirePermission(request: Request, requiredPermission: string): Promise<AuthSession> {
  const session = await requireAuth(request);
  
  if (!hasPermission(session, requiredPermission) && !isAdmin(session)) {
    throw new Response(JSON.stringify({
      error: 'Insufficient permissions',
      message: `This action requires ${requiredPermission} permission`
    }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return session;
}

/**
 * Require admin role for API endpoint
 */
export async function requireAdmin(request: Request): Promise<AuthSession> {
  return requireRole(request, ROLES.ADMIN);
}

/**
 * Require creator role or higher for API endpoint
 */
export async function requireCreator(request: Request): Promise<AuthSession> {
  const session = await requireAuth(request);
  
  if (!hasRole(session, ROLES.CREATOR) && !hasRole(session, ROLES.ADMIN)) {
    throw new Response(JSON.stringify({
      error: 'Insufficient permissions',
      message: 'This action requires creator role or higher'
    }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return session;
}

/**
 * Check if user can perform action on resource
 */
export function canPerformAction(session: AuthSession | null, action: string, resourceOwnerId?: string): boolean {
  if (!session?.user) return false;
  
  // Admin can do everything
  if (isAdmin(session)) return true;
  
  // Check specific permissions
  switch (action) {
    case 'create_video':
      return hasPermission(session, PERMISSIONS.CREATE_VIDEOS);
    
    case 'edit_video':
      // Can edit own videos or if has edit permission
      return hasPermission(session, PERMISSIONS.EDIT_VIDEOS) || 
             (!!resourceOwnerId && session.user.id === resourceOwnerId);
    
    case 'delete_video':
      // Can delete own videos or if has delete permission
      return hasPermission(session, PERMISSIONS.DELETE_VIDEOS) || 
             (!!resourceOwnerId && session.user.id === resourceOwnerId);
    
    case 'manage_users':
      return hasPermission(session, PERMISSIONS.MANAGE_USERS);
    
    case 'view_admin':
      return hasPermission(session, PERMISSIONS.VIEW_ADMIN);
    
    default:
      return false;
  }
}

/**
 * Get user's effective permissions (role permissions + custom permissions)
 */
export function getEffectivePermissions(session: AuthSession | null): string[] {
  if (!session?.user) return [];
  
  const rolePermissions = ROLE_PERMISSIONS[session.user.role as keyof typeof ROLE_PERMISSIONS] || [];
  const customPermissions = session.user.permissions || [];
  
  // Combine and deduplicate permissions
  return [...new Set([...rolePermissions, ...customPermissions])];
}

/**
 * Check if user has any of the specified permissions
 */
export function hasAnyPermission(session: AuthSession | null, permissions: string[]): boolean {
  if (!session?.user) return false;
  if (isAdmin(session)) return true;
  
  const userPermissions = getEffectivePermissions(session);
  return permissions.some(permission => userPermissions.includes(permission));
}

/**
 * Check if user has all of the specified permissions
 */
export function hasAllPermissions(session: AuthSession | null, permissions: string[]): boolean {
  if (!session?.user) return false;
  if (isAdmin(session)) return true;
  
  const userPermissions = getEffectivePermissions(session);
  return permissions.every(permission => userPermissions.includes(permission));
}
