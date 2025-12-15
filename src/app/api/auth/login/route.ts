import { NextRequest, NextResponse } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

// POST /api/auth/login - Legacy endpoint - redirects to Auth.js
export async function POST(request: NextRequest) {
  try {
    // This endpoint is deprecated in favor of Auth.js cookie-based authentication
    // Redirect to the Auth.js sign-in page
    const url = new URL(request.url);
    const signInUrl = new URL('/auth/signin', url.origin);
    
    return NextResponse.json(
      { 
        message: 'Please use Auth.js authentication',
        redirectUrl: signInUrl.toString()
      },
      { status: 302, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Login redirect error:', error);
    return NextResponse.json(
      { message: 'Authentication system error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
