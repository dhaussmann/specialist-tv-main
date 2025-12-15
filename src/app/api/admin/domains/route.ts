import { NextRequest, NextResponse } from 'next/server';
import { UserManager } from '@/services/user-manager';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { getContext } from '@/lib/context';

interface DomainActionRequest {
  action: string;
  domain?: string;
  defaultRole?: 'admin' | 'creator' | 'viewer';
  defaultPermissions?: string[];
  domainId?: string;
}

export async function GET(request: NextRequest) {
  try {
    await requirePermission(request, PERMISSIONS.MANAGE_DOMAINS);
    const { env } = getContext();
    const userManager = new UserManager(env);
    const domains = await userManager.getAllAuthorizedDomains();
    return NextResponse.json({ domains });

  } catch (error) {
    console.error('Error fetching domains:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission(request, PERMISSIONS.MANAGE_DOMAINS);
    const { env } = getContext();
    const userManager = new UserManager(env);
    const currentUser = await userManager.getUserById(session.user!.id);

    if (!currentUser || !userManager.hasPermission(currentUser, 'admin.access')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json() as DomainActionRequest;
    const { action } = body;

    const clientIP = request.headers.get('cf-connecting-ip') || 
                    request.headers.get('x-forwarded-for') || 
                    'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    switch (action) {
      case 'add_domain': {
        const { domain, defaultRole, defaultPermissions } = body;
        if (!domain) {
          return NextResponse.json({ error: 'Domain is required' }, { status: 400 });
        }
        
        const domainId = await userManager.addAuthorizedDomain(
          domain,
          defaultRole || 'viewer',
          defaultPermissions || [],
          currentUser.id,
          clientIP,
          userAgent
        );
        return NextResponse.json({ success: true, domainId });
      }

      case 'remove_domain': {
        const { domainId } = body;
        if (!domainId) {
          return NextResponse.json({ error: 'Domain ID is required' }, { status: 400 });
        }
        
        await userManager.removeAuthorizedDomain(domainId, currentUser.id, clientIP, userAgent);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error) {
    console.error('Error in domain management:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, { status: 500 });
  }
}
