import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get('url');

  if (!imageUrl) {
    return new NextResponse('Missing image URL', { status: 400 });
  }

  try {
    // Validate that it's a Google profile picture URL
    const url = new URL(imageUrl);
    if (!url.hostname.includes('googleusercontent.com') && !url.hostname.includes('googleapis.com')) {
      return new NextResponse('Invalid image source', { status: 400 });
    }

    // Fetch the image from Google
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SpecialistTV/1.0)',
        'Referer': 'https://accounts.google.com/',
      },
    });

    if (!response.ok) {
      return new NextResponse('Failed to fetch image', { status: response.status });
    }

    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    // Return the image with appropriate caching headers
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600, s-maxage=86400', // Cache for 1 hour in browser, 24 hours on edge
        'CDN-Cache-Control': 'max-age=86400', // Cache for 24 hours on Cloudflare edge
        'Vary': 'Accept-Encoding',
      },
    });
  } catch (error) {
    console.error('Error proxying avatar:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
