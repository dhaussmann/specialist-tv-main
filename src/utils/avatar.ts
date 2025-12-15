/**
 * Generates a proxied avatar URL to avoid direct requests to Google
 * and prevent rate limiting issues
 */
export function getProxiedAvatarUrl(originalUrl: string | null | undefined): string | null {
  if (!originalUrl) {
    return null;
  }

  // Check if it's already a proxied URL to avoid double-proxying
  if (originalUrl.includes('/api/proxy/avatar')) {
    return originalUrl;
  }

  // Only proxy Google URLs
  if (originalUrl.includes('googleusercontent.com') || originalUrl.includes('googleapis.com')) {
    return `/api/proxy/avatar?url=${encodeURIComponent(originalUrl)}`;
  }

  // Return original URL for non-Google sources
  return originalUrl;
}
