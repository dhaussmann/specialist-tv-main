import { User } from '../types/auth';

/**
 * Decode a JWT token and extract user information
 * @param token - The JWT token to decode
 * @returns User object or null if invalid
 */
export function decodeJWTToken(token: string): User | null {
  try {
    // For our simple base64 encoded tokens
    const payload = JSON.parse(atob(token));
    
    // Check if token is expired
    if (Date.now() > payload.exp) {
      return null;
    }
    
    return {
      username: payload.username || 'Unknown User',
      email: payload.email,
      name: payload.name || payload.username,
      picture: payload.picture,
      exp: payload.exp
    };
  } catch (error) {
    console.error('Error decoding JWT token:', error);
    return null;
  }
}

/**
 * Generate a default avatar URL based on username
 * @param username - The username to generate avatar for
 * @returns Avatar URL
 */
export function generateAvatarUrl(username: string): string {
  // Use a simple avatar service with initials
  const initials = username
    .split(' ')
    .map(name => name.charAt(0).toUpperCase())
    .join('')
    .substring(0, 2);
    
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=3b82f6&color=ffffff&size=40`;
}

/**
 * Get display name from user object
 * @param user - User object
 * @returns Display name
 */
export function getDisplayName(user: User): string {
  return user.name || user.username || 'Unknown User';
}
