import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-helpers';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

// POST /api/auth/verify - Verify Auth.js session
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);
    
    if (!session?.user) {
      return NextResponse.json(
        { 
          valid: false, 
          message: 'No valid session found' 
        },
        { status: 401, headers: corsHeaders }
      );
    }
    
    return NextResponse.json(
      { 
        valid: true, 
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
          role: session.user.role,
          permissions: session.user.permissions
        },
        expires: session.expires
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Session verification error:', error);
    return NextResponse.json(
      { 
        valid: false,
        message: 'Verification failed' 
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
