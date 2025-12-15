import { useSession } from 'next-auth/react';

interface ExtendedUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string;
  permissions?: string[];
}

interface ExtendedSession {
  user: ExtendedUser;
  expires: string;
}

export function useAdminPermissions() {
  const { data: session, status } = useSession();
  
  // Handle loading state first
  if (status === 'loading') {
    return {
      isAdmin: false,
      isCreator: false,
      isViewer: false,
      hasViewAdminPermission: false,
      canAccessAdmin: false,
      canAccessCreator: false,
      loading: true
    };
  }
  
  // Handle unauthenticated state
  if (!session?.user) {
    return {
      isAdmin: false,
      isCreator: false,
      isViewer: true, // Unauthenticated users are treated as viewers
      hasViewAdminPermission: false,
      canAccessAdmin: false,
      canAccessCreator: false,
      loading: false
    };
  }

  const extendedSession = session as ExtendedSession;
  const userRole = extendedSession.user?.role;
  const userPermissions = extendedSession.user?.permissions || [];
  
  const isAdmin = userRole === 'admin';
  const isCreator = userRole === 'creator';
  const isViewer = userRole === 'viewer' || !userRole; // Default to viewer if no role
  const hasViewAdminPermission = userPermissions.includes('view_admin');
  
  // Access permissions
  const canAccessAdmin = isAdmin || hasViewAdminPermission;
  const canAccessCreator = isAdmin || isCreator;

  return {
    isAdmin,
    isCreator,
    isViewer,
    hasViewAdminPermission,
    canAccessAdmin,
    canAccessCreator,
    loading: false,
    userRole,
    userPermissions
  };
}
