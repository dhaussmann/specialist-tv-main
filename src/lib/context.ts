// src/lib/context.ts
import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * A centralized function to get the Cloudflare environment context.
 * This ensures consistent access to bindings across the application.
 */
export function getContext(): { env: CloudflareEnv } {
  try {
    // This is the standard way to get context in OpenNext on Cloudflare
    return getCloudflareContext();
  } catch {
    // In a browser-like environment (e.g., local dev without wrangler), getCloudflareContext will throw.
    // Fallback for local development or other environments
    console.warn('Could not get Cloudflare context, falling back to process.env');
    return { env: process.env as unknown as CloudflareEnv };
  }
}
