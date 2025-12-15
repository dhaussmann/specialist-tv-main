import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb' // Increase body size limit for video uploads
    }
  },
  images: {
    unoptimized: true, // Disable image optimization for Cloudflare Stream compatibility
  },
  // Allow Cloudflare Stream components and assets
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-src 'self' https://*.videodelivery.net https://videodelivery.net https://*.cloudflarestream.com https://ui-avatars.com; img-src 'self' data: https://i.ytimg.com https://*.videodelivery.net https://videodelivery.net https://*.cloudflarestream.com https://ui-avatars.com https://*.googleusercontent.com; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.cloudflarestream.com; connect-src 'self' https://*.videodelivery.net https://videodelivery.net https://*.cloudflarestream.com;"
          }
        ]
      }
    ]
  }
};

export default nextConfig;

// added by create cloudflare to enable calling `getCloudflareContext()` in `next dev`
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
initOpenNextCloudflareForDev();
