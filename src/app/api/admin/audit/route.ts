import { NextRequest, NextResponse } from 'next/server';
import { UserManager } from '@/services/user-manager';
import { requireAuth } from '@/lib/auth-helpers';
import { getContext } from '@/lib/context';

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const { env } = getContext();
    const userManager = new UserManager(env);
    const currentUser = await userManager.getUserById(session.user!.id);

    if (!currentUser || !userManager.hasPermission(currentUser, 'admin.access')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');

    const auditLog = await userManager.getAuditLog(limit);
    return NextResponse.json({ auditLog });

  } catch (error) {
    console.error('Error fetching audit log:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
