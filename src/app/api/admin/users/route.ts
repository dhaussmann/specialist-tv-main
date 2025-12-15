import { NextRequest, NextResponse } from 'next/server';
import { UserManager } from '@/services/user-manager';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { getContext } from '@/lib/context';

export async function GET(request: NextRequest) {
  try {
    await requirePermission(request, PERMISSIONS.MANAGE_USERS);
    const { env } = getContext();
    const userManager = new UserManager(env);
    const [users, invitations] = await Promise.all([
      userManager.getAllUsers(),
      userManager.getAllInvitations()
    ]);
    return NextResponse.json({ users, invitations });

  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface UserActionRequest {
  action: string;
  userId?: string;
  role?: 'admin' | 'creator' | 'viewer';
  permissions?: string[];
  email?: string;
  expiresInDays?: number;
  invitationId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission(request, PERMISSIONS.MANAGE_USERS);
    const { env } = getContext();
    const userManager = new UserManager(env);
    const currentUser = await userManager.getUserById(session.user!.id);

    if (!currentUser || !userManager.hasPermission(currentUser, 'admin.access')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json() as UserActionRequest;
    const { action } = body;

    const clientIP = request.headers.get('cf-connecting-ip') || 
                    request.headers.get('x-forwarded-for') || 
                    'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    switch (action) {
      case 'update_role': {
        const { userId, role } = body;
        if (!userId || !role) {
          return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }
        
        await userManager.updateUserRole(userId, role, currentUser.id, clientIP, userAgent);
        return NextResponse.json({ success: true });
      }

      case 'update_permissions': {
        const { userId, permissions } = body;
        if (!userId || !Array.isArray(permissions)) {
          return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }
        
        await userManager.updateUserPermissions(userId, permissions, currentUser.id, clientIP, userAgent);
        return NextResponse.json({ success: true });
      }

      case 'deactivate_user': {
        const { userId } = body;
        if (!userId) {
          return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
        }
        
        await userManager.deactivateUser(userId, currentUser.id, clientIP, userAgent);
        return NextResponse.json({ success: true });
      }

      case 'activate_user': {
        const { userId } = body;
        if (!userId) {
          return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
        }
        
        await userManager.activateUser(userId, currentUser.id, clientIP, userAgent);
        return NextResponse.json({ success: true });
      }

      case 'create_invitation': {
        const { email, role, permissions, expiresInDays } = body;
        if (!email || !role) {
          return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }
        
        const invitationId = await userManager.createInvitation(
          email,
          role,
          permissions || [],
          currentUser.id,
          expiresInDays,
          clientIP,
          userAgent
        );
        return NextResponse.json({ success: true, invitationId });
      }

      case 'delete_user': {
        const { userId } = body;
        if (!userId) {
          return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
        }
        
        // Prevent self-deletion
        if (userId === currentUser.id) {
          return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
        }
        
        await userManager.deleteUser(userId, currentUser.id, clientIP, userAgent);
        return NextResponse.json({ success: true });
      }

      case 'cancel_invitation': {
        const { invitationId } = body;
        if (!invitationId) {
          return NextResponse.json({ error: 'Missing invitationId' }, { status: 400 });
        }
        
        await userManager.cancelInvitation(invitationId, currentUser.id, clientIP, userAgent);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error) {
    console.error('Error in user management:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, { status: 500 });
  }
}
