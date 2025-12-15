import { D1Adapter } from "@auth/d1-adapter";
import { AuthConfig } from "@auth/core/types";
import Google from "@auth/core/providers/google";
import { UserManager, ROLE_PERMISSIONS } from "@/services/user-manager";

export function getAuthConfig(env: CloudflareEnv): AuthConfig {
  console.log('=== AUTH CONFIG DEBUG START ===');
  console.log('Environment variables check:');
  console.log('- AUTH_SECRET:', env.AUTH_SECRET ? '✓ SET' : '✗ MISSING');
  console.log('- GOOGLE_CLIENT_ID:', env.GOOGLE_CLIENT_ID ? '✓ SET' : '✗ MISSING');
  console.log('- GOOGLE_CLIENT_SECRET:', env.GOOGLE_CLIENT_SECRET ? '✓ SET' : '✗ MISSING');
  console.log('- DB:', env.DB ? '✓ AVAILABLE' : '✗ MISSING');
  console.log('- NEXTJS_ENV:', env.NEXTJS_ENV || 'undefined');
  
  const isDev = env.NEXTJS_ENV === 'development';
  console.log('Development mode:', isDev);
  
  return {
    secret: env.AUTH_SECRET,
    trustHost: true,
    basePath: "/api/auth",
    useSecureCookies: !isDev, // Force non-secure cookies in development
    adapter: D1Adapter(env.DB),
    providers: [
      Google({
        allowDangerousEmailAccountLinking: true,
        clientId: env.GOOGLE_CLIENT_ID!,
        clientSecret: env.GOOGLE_CLIENT_SECRET!,
        authorization: {
          params: {
            scope: "openid email profile",
            access_type: "offline",
            prompt: "consent",
            response_type: "code",
          },
        },
        checks: ["pkce", "state"],
        client: {
          token_endpoint_auth_method: "client_secret_post",
        },
        profile(profile: {
          sub: string;
          name?: string;
          email?: string;
          picture?: string;
          email_verified?: boolean;
        }) {
          return {
            id: profile.sub,
            name: profile.name,
            email: profile.email,
            image: profile.picture,
            emailVerified: profile.email_verified ? new Date() : null,
          };
        },
      }),
    ],
    callbacks: {
      async session({ session, user }) {
        // The user object is passed when using database sessions.
        // We can add the user ID to the session for use in API routes.
        if (user) {
          session.user.id = user.id;
          // Ensure profile picture is included in session
          session.user.image = user.image;
        }
        return session;
      },
      async signIn({ user, account, profile }) {
        console.log('🔵 Auth.js signIn callback:', { 
          user: user?.email, 
          provider: account?.provider,
          profilePicture: profile?.picture || user?.image 
        });
        
        if (account?.provider === 'google' && user?.email) {
          try {
            const userManager = new UserManager(env);
            
            // Check user authorization (handles both domain and invitation-based auth)
            const authResult = await userManager.isUserAuthorized(user.email);
            
            if (authResult.authorized) {
              console.log(`✅ User authorized via ${authResult.source}:`, user.email, {
                role: authResult.role,
                permissions: authResult.permissions
              });
              
              // For invited users, mark invitation as used and create user record if needed
              if (authResult.source === 'invitation') {
                await userManager.markInvitationUsed(user.email);
                console.log('📧 Invitation marked as used for:', user.email);
              }
              
              // Explicitly update user record with OAuth profile data
              if (profile?.name || profile?.picture) {
                try {
                  const updates: string[] = [];
                  const bindings: (string | null)[] = [];
                  
                  if (profile.name && (!user.name || user.name === 'null')) {
                    updates.push('name = ?');
                    bindings.push(profile.name);
                    console.log('👤 Updating user name from OAuth:', profile.name);
                  }
                  
                  if (profile.picture && (!user.image || user.image === 'null')) {
                    updates.push('image = ?');
                    bindings.push(profile.picture);
                    console.log('🖼️ Updating user profile picture from OAuth:', profile.picture);
                  }
                  
                  if (updates.length > 0) {
                    bindings.push(user.email); // Add email for WHERE clause
                    await env.DB.prepare(`
                      UPDATE users 
                      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
                      WHERE email = ?
                    `).bind(...bindings).run();
                    
                    console.log('✅ User profile updated from OAuth data');
                  }
                } catch (updateError) {
                  console.error('🔴 Error updating user profile from OAuth:', updateError);
                  // Don't fail authentication if profile update fails
                }
              }
              
              return true;
            } else {
              console.log('❌ User not authorized - no domain or invitation found:', user.email);
              return false;
            }
          } catch (error) {
            console.error('🔴 Error checking user authorization:', error);
            return false;
          }
        }
        
        return false;
      },
      async jwt({ token, user, account, profile }) {
        // This callback is called whenever a JWT is accessed
        // Ensure profile picture is included in the token
        if (user) {
          token.id = user.id;
          token.image = user.image;
        }
        
        // On initial sign in, capture profile picture from OAuth profile
        if (account && profile && profile.picture) {
          token.image = profile.picture;
          console.log('🖼️ JWT: Captured profile picture from OAuth:', profile.picture);
        }
        
        return token;
      }
    },
    session: {
      strategy: "database",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      updateAge: 24 * 60 * 60, // 24 hours
    },
    pages: {
      signIn: "/auth/signin",
      error: "/auth/error",
    },
    debug: true, // Always enable debug for troubleshooting
    logger: {
      error(error: Error) {
        console.error('🔴 Auth.js ERROR:', error.message, error.stack);
      },
      warn(code: string) {
        console.warn('🟡 Auth.js WARN:', code);
      },
      debug(code: string, metadata?: unknown) {
        console.log('🔵 Auth.js DEBUG:', code, metadata);
      },
    },
    cookies: {
      sessionToken: {
        name: isDev ? "authjs.session-token" : "__Secure-authjs.session-token",
        options: {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          secure: !isDev,
          maxAge: 7 * 24 * 60 * 60, // 7 days
        },
      },
      callbackUrl: {
        name: isDev ? "authjs.callback-url" : "__Secure-authjs.callback-url",
        options: {
          sameSite: "lax",
          path: "/",
          secure: !isDev,
          maxAge: 15 * 60, // 15 minutes
        },
      },
      csrfToken: {
        name: isDev ? "authjs.csrf-token" : "__Host-authjs.csrf-token",
        options: {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          secure: !isDev,
          maxAge: 15 * 60, // 15 minutes
        },
      },
      state: {
        name: isDev ? "authjs.state" : "__Secure-authjs.state",
        options: {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          secure: !isDev,
          maxAge: 15 * 60, // 15 minutes
        },
      },
      pkceCodeVerifier: {
        name: isDev ? "authjs.pkce.code_verifier" : "__Secure-authjs.pkce.code_verifier",
        options: {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          secure: !isDev,
          maxAge: 15 * 60, // 15 minutes
        },
      },
    },
  };
}
