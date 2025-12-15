import { nanoid } from 'nanoid';

export interface User {
  id: string;
  name: string | null;
  email: string | null;
  emailVerified: number | null;
  image: string | null;
  role: 'admin' | 'creator' | 'viewer';
  permissions: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthorizedDomain {
  id: string;
  domain: string;
  default_role: 'admin' | 'creator' | 'viewer';
  default_permissions: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserInvitation {
  id: string;
  email: string;
  role: 'admin' | 'creator' | 'viewer';
  permissions: string[];
  invited_by: string | null;
  expires_at: string | null;
  used_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  target_user_id: string | null;
  target_user_name: string | null;
  target_user_email: string | null;
  performed_by: string | null;
  performed_by_name: string | null;
  performed_by_email: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export const AVAILABLE_PERMISSIONS = [
  'videos.view',
  'videos.create',
  'videos.edit',
  'videos.delete',
  'users.view',
  'users.create',
  'users.edit',
  'users.delete',
  'admin.access',
  'creator.access',
] as const;

export type Permission = typeof AVAILABLE_PERMISSIONS[number];

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin: [
    'videos.view',
    'videos.create',
    'videos.edit',
    'videos.delete',
    'users.view',
    'users.create',
    'users.edit',
    'users.delete',
    'admin.access',
    'creator.access',
  ],
  creator: [
    'videos.view',
    'videos.create',
    'videos.edit',
    'videos.delete',
    'creator.access',
  ],
  viewer: [
    'videos.view',
  ],
};

export class UserManager {
  constructor(private env: CloudflareEnv) {}

  // User Management
  async getAllUsers(): Promise<User[]> {
    const result = await this.env.DB.prepare(`
      SELECT 
        id, name, email, emailVerified, image, role, permissions, 
        is_active, created_at, updated_at
      FROM users 
      ORDER BY created_at DESC
    `).all();

    return result.results.map(user => ({
      ...user,
      permissions: JSON.parse(user.permissions as string || '[]'),
    })) as User[];
  }

  async getUserById(id: string): Promise<User | null> {
    const result = await this.env.DB.prepare(`
      SELECT 
        id, name, email, emailVerified, image, role, permissions, 
        is_active, created_at, updated_at
      FROM users 
      WHERE id = ?
    `).bind(id).first();

    if (!result) return null;

    return {
      ...result,
      permissions: JSON.parse(result.permissions as string || '[]'),
    } as User;
  }

  async updateUserRole(
    userId: string, 
    newRole: 'admin' | 'creator' | 'viewer',
    performedBy: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    const oldUser = await this.getUserById(userId);
    if (!oldUser) throw new Error('User not found');

    const newPermissions = ROLE_PERMISSIONS[newRole] || [];
    
    await this.env.DB.prepare(`
      UPDATE users 
      SET role = ?, permissions = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(newRole, JSON.stringify(newPermissions), userId).run();

    // Log the action
    await this.logAuditAction(
      'role_changed',
      userId,
      performedBy,
      { role: oldUser.role, permissions: oldUser.permissions },
      { role: newRole, permissions: newPermissions },
      ipAddress,
      userAgent
    );
  }

  async updateUserPermissions(
    userId: string,
    permissions: string[],
    performedBy: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    const oldUser = await this.getUserById(userId);
    if (!oldUser) throw new Error('User not found');

    await this.env.DB.prepare(`
      UPDATE users 
      SET permissions = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(JSON.stringify(permissions), userId).run();

    // Log the action
    await this.logAuditAction(
      'permissions_updated',
      userId,
      performedBy,
      { permissions: oldUser.permissions },
      { permissions },
      ipAddress,
      userAgent
    );
  }

  async deactivateUser(
    userId: string,
    performedBy: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    const oldUser = await this.getUserById(userId);
    if (!oldUser) throw new Error('User not found');

    await this.env.DB.prepare(`
      UPDATE users 
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(userId).run();

    // Log the action
    await this.logAuditAction(
      'user_deactivated',
      userId,
      performedBy,
      { is_active: oldUser.is_active },
      { is_active: false },
      ipAddress,
      userAgent
    );
  }

  async activateUser(
    userId: string,
    performedBy: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    const oldUser = await this.getUserById(userId);
    if (!oldUser) throw new Error('User not found');

    await this.env.DB.prepare(`
      UPDATE users 
      SET is_active = true, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(userId).run();

    // Log the action
    await this.logAuditAction(
      'user_activated',
      userId,
      performedBy,
      { is_active: oldUser.is_active },
      { is_active: true },
      ipAddress,
      userAgent
    );
  }

  async deleteUser(
    userId: string,
    performedBy: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    const oldUser = await this.getUserById(userId);
    if (!oldUser) throw new Error('User not found');

    // Log the action BEFORE deleting the user to avoid foreign key constraint issues
    await this.logAuditAction(
      'user_deleted',
      userId,
      performedBy,
      { 
        email: oldUser.email,
        name: oldUser.name,
        role: oldUser.role,
        permissions: oldUser.permissions,
        is_active: oldUser.is_active
      },
      null,
      ipAddress,
      userAgent
    );

    // Then delete user and related data
    await this.env.DB.batch([
      // Delete user sessions
      this.env.DB.prepare(`DELETE FROM sessions WHERE userId = ?`).bind(userId),
      // Delete user accounts
      this.env.DB.prepare(`DELETE FROM accounts WHERE userId = ?`).bind(userId),
      // Delete invitations sent by this user
      this.env.DB.prepare(`DELETE FROM user_invitations WHERE invited_by = ?`).bind(userId),
      // Delete invitations for this user's email
      this.env.DB.prepare(`DELETE FROM user_invitations WHERE email = ?`).bind(oldUser.email),
      // Delete the user record
      this.env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(userId)
    ]);
  }

  // User Authorization Check
  async checkUserAuthorization(email: string): Promise<boolean> {
    const domain = email.split('@')[1];
    if (!domain) return false;

    // Check if domain is authorized
    const domainResult = await this.env.DB.prepare(`
      SELECT default_role, default_permissions 
      FROM authorized_domains 
      WHERE domain = ? AND is_active = true
    `).bind(domain).first();

    if (domainResult) {
      // User is from authorized domain, ensure they have a user record
      await this.ensureUserFromDomain(email, domainResult.default_role as string, JSON.parse((domainResult.default_permissions as string) || '[]'));
      return true;
    }

    // Check if user has a valid invitation
    const invitationResult = await this.env.DB.prepare(`
      SELECT role, permissions, expires_at 
      FROM user_invitations 
      WHERE email = ? AND is_active = true AND expires_at > CURRENT_TIMESTAMP
    `).bind(email).first();

    if (invitationResult) {
      // User has valid invitation, create user record and deactivate invitation
      await this.ensureUserFromInvitation(email, invitationResult.role as string, JSON.parse((invitationResult.permissions as string) || '[]'));
      
      // Deactivate the invitation
      await this.env.DB.prepare(`
        UPDATE user_invitations 
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE email = ?
      `).bind(email).run();
      
      return true;
    }

    return false;
  }

  private async ensureUserFromDomain(email: string, role: string, permissions: string[]): Promise<void> {
    // Check if user already exists
    const existingUser = await this.env.DB.prepare(`
      SELECT id FROM users WHERE email = ?
    `).bind(email).first();

    if (!existingUser) {
      // Create new user with domain defaults
      const userId = nanoid();
      await this.env.DB.prepare(`
        INSERT INTO users (id, email, role, permissions, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(userId, email, role, JSON.stringify(permissions)).run();

      // Log the action
      await this.logAuditAction(
        'user_created_from_domain',
        userId,
        'system',
        null,
        { email, role, permissions },
        undefined,
        'domain_authorization'
      );
    }
  }

  private async ensureUserFromInvitation(email: string, role: string, permissions: string[]): Promise<void> {
    // Check if user already exists
    const existingUser = await this.env.DB.prepare(`
      SELECT id FROM users WHERE email = ?
    `).bind(email).first();

    if (!existingUser) {
      // Create new user from invitation
      const userId = nanoid();
      await this.env.DB.prepare(`
        INSERT INTO users (id, email, role, permissions, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(userId, email, role, JSON.stringify(permissions)).run();

      // Log the action
      await this.logAuditAction(
        'user_created_from_invitation',
        userId,
        'system',
        null,
        { email, role, permissions },
        undefined,
        'invitation_acceptance'
      );
    }
  }

  // Domain Management
  async getAllAuthorizedDomains(): Promise<AuthorizedDomain[]> {
    const result = await this.env.DB.prepare(`
      SELECT 
        id, domain, default_role, default_permissions, is_active, 
        created_at, updated_at
      FROM authorized_domains 
      ORDER BY domain ASC
    `).all();

    return result.results.map(domain => ({
      ...domain,
      default_permissions: JSON.parse(domain.default_permissions as string || '[]'),
    })) as AuthorizedDomain[];
  }

  async addAuthorizedDomain(
    domain: string,
    defaultRole: 'admin' | 'creator' | 'viewer' = 'viewer',
    defaultPermissions: string[] = [],
    performedBy: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<string> {
    const id = nanoid();
    
    await this.env.DB.prepare(`
      INSERT INTO authorized_domains 
      (id, domain, default_role, default_permissions, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(id, domain, defaultRole, JSON.stringify(defaultPermissions)).run();

    // Log the action
    await this.logAuditAction(
      'domain_added',
      null,
      performedBy,
      null,
      { domain, default_role: defaultRole, default_permissions: defaultPermissions },
      ipAddress,
      userAgent
    );

    return id;
  }

  async removeAuthorizedDomain(
    domainId: string,
    performedBy: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    const domain = await this.env.DB.prepare(`
      SELECT domain FROM authorized_domains WHERE id = ?
    `).bind(domainId).first();

    if (!domain) throw new Error('Domain not found');

    await this.env.DB.prepare(`
      DELETE FROM authorized_domains WHERE id = ?
    `).bind(domainId).run();

    // Log the action
    await this.logAuditAction(
      'domain_removed',
      null,
      performedBy,
      { domain: domain.domain },
      null,
      ipAddress,
      userAgent
    );
  }

  // User Authorization Check
  async isUserAuthorized(email: string): Promise<{
    authorized: boolean;
    role?: 'admin' | 'creator' | 'viewer';
    permissions?: string[];
    source: 'existing_user' | 'domain' | 'invitation' | 'none';
  }> {
    // IMPORTANT: Check for pending invitation FIRST before checking existing user
    // This handles the case where Auth.js D1 adapter creates user with default values
    // before the signIn callback runs
    const invitation = await this.env.DB.prepare(`
      SELECT role, permissions FROM user_invitations 
      WHERE email = ? AND is_active = true 
      AND (expires_at IS NULL OR expires_at > datetime('now'))
      AND used_at IS NULL
    `).bind(email).first();

    if (invitation) {
      const role = invitation.role as 'admin' | 'creator' | 'viewer';
      const permissions = JSON.parse(invitation.permissions as string || '[]');
      
      // Update existing user record with invitation role/permissions if user exists
      // (Auth.js D1 adapter may have created user with default values)
      await this.env.DB.prepare(`
        UPDATE users 
        SET role = ?, permissions = ?, is_active = true, updated_at = CURRENT_TIMESTAMP
        WHERE email = ?
      `).bind(role, JSON.stringify(permissions), email).run();
      
      console.log('📧 Updated user with invitation role:', email, role);
      
      return {
        authorized: true,
        role,
        permissions,
        source: 'invitation',
      };
    }

    // Check if user already exists (and has proper role set)
    const existingUser = await this.env.DB.prepare(`
      SELECT role, permissions, is_active FROM users WHERE email = ?
    `).bind(email).first();

    if (existingUser) {
      // If user exists but has default 'viewer' role with empty permissions,
      // check domain authorization to potentially upgrade
      const hasDefaultRole = existingUser.role === 'viewer' && 
        (existingUser.permissions === '[]' || existingUser.permissions === null);
      
      if (hasDefaultRole) {
        // Check domain authorization for potential upgrade
        const emailDomain = email.split('@')[1];
        if (emailDomain) {
          const authorizedDomain = await this.env.DB.prepare(`
            SELECT default_role, default_permissions FROM authorized_domains 
            WHERE domain = ? AND is_active = true
          `).bind(emailDomain).first();

          if (authorizedDomain) {
            const role = authorizedDomain.default_role as 'admin' | 'creator' | 'viewer';
            const permissions = JSON.parse(authorizedDomain.default_permissions as string || '[]');
            
            // Update user with domain role
            await this.env.DB.prepare(`
              UPDATE users 
              SET role = ?, permissions = ?, updated_at = CURRENT_TIMESTAMP
              WHERE email = ?
            `).bind(role, JSON.stringify(permissions), email).run();
            
            console.log('🌐 Updated user with domain role:', email, role);
            
            return {
              authorized: true,
              role,
              permissions,
              source: 'domain',
            };
          }
        }
      }
      
      return {
        authorized: existingUser.is_active as boolean,
        role: existingUser.role as 'admin' | 'creator' | 'viewer',
        permissions: JSON.parse(existingUser.permissions as string || '[]'),
        source: 'existing_user',
      };
    }

    // Check domain authorization for new users
    const emailDomain = email.split('@')[1];
    if (emailDomain) {
      const authorizedDomain = await this.env.DB.prepare(`
        SELECT default_role, default_permissions FROM authorized_domains 
        WHERE domain = ? AND is_active = true
      `).bind(emailDomain).first();

      if (authorizedDomain) {
        return {
          authorized: true,
          role: authorizedDomain.default_role as 'admin' | 'creator' | 'viewer',
          permissions: JSON.parse(authorizedDomain.default_permissions as string || '[]'),
          source: 'domain',
        };
      }
    }

    return { authorized: false, source: 'none' };
  }

  // Invitation Management
  async createInvitation(
    email: string,
    role: 'admin' | 'creator' | 'viewer',
    permissions: string[],
    invitedBy: string,
    expiresInDays?: number,
    ipAddress?: string,
    userAgent?: string
  ): Promise<string> {
    // Check if there's already an active invitation for this email
    const existingInvitation = await this.env.DB.prepare(`
      SELECT id, is_active FROM user_invitations 
      WHERE email = ? AND is_active = true
    `).bind(email).first();

    if (existingInvitation) {
      throw new Error(`An active invitation already exists for ${email}. Please cancel the existing invitation first or wait for it to expire.`);
    }

    // Also check if user already exists
    const existingUser = await this.env.DB.prepare(`
      SELECT id FROM users WHERE email = ?
    `).bind(email).first();

    if (existingUser) {
      throw new Error(`User with email ${email} already exists in the system.`);
    }

    const id = nanoid();
    const expiresAt = expiresInDays 
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    await this.env.DB.prepare(`
      INSERT INTO user_invitations 
      (id, email, role, permissions, invited_by, expires_at, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, true, CURRENT_TIMESTAMP)
    `).bind(id, email, role, JSON.stringify(permissions), invitedBy, expiresAt).run();

    // Log the action
    await this.logAuditAction(
      'invitation_created',
      null,
      invitedBy,
      null,
      { email, role, permissions, expires_at: expiresAt },
      ipAddress,
      userAgent
    );

    return id;
  }

  async markInvitationUsed(email: string): Promise<void> {
    await this.env.DB.prepare(`
      UPDATE user_invitations 
      SET used_at = CURRENT_TIMESTAMP
      WHERE email = ? AND used_at IS NULL
    `).bind(email).run();
  }

  async getAllInvitations(): Promise<UserInvitation[]> {
    const result = await this.env.DB.prepare(`
      SELECT 
        id, email, role, permissions, invited_by, expires_at, used_at, is_active, created_at
      FROM user_invitations 
      WHERE is_active = true
      ORDER BY created_at DESC
    `).all();

    return result.results.map(invitation => ({
      ...invitation,
      permissions: JSON.parse(invitation.permissions as string || '[]'),
    })) as UserInvitation[];
  }

  async cancelInvitation(
    invitationId: string,
    performedBy: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    const invitation = await this.env.DB.prepare(`
      SELECT email, role, permissions FROM user_invitations WHERE id = ?
    `).bind(invitationId).first();

    if (!invitation) throw new Error('Invitation not found');

    await this.env.DB.prepare(`
      UPDATE user_invitations 
      SET is_active = false
      WHERE id = ?
    `).bind(invitationId).run();

    // Log the action
    await this.logAuditAction(
      'invitation_cancelled',
      null,
      performedBy,
      { 
        email: invitation.email,
        role: invitation.role,
        permissions: JSON.parse(invitation.permissions as string || '[]')
      },
      null,
      ipAddress,
      userAgent
    );
  }

  // Audit Logging
  private async logAuditAction(
    action: string,
    targetUserId: string | null,
    performedBy: string,
    oldValues: Record<string, unknown> | null,
    newValues: Record<string, unknown> | null,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    const id = nanoid();
    
    await this.env.DB.prepare(`
      INSERT INTO user_audit_log 
      (id, action, target_user_id, performed_by, old_values, new_values, ip_address, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      id,
      action,
      targetUserId,
      performedBy,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      ipAddress || null,
      userAgent || null
    ).run();
  }

  async getAuditLog(limit: number = 100): Promise<AuditLogEntry[]> {
    const result = await this.env.DB.prepare(`
      SELECT 
        al.id, al.action, al.target_user_id, al.performed_by, 
        al.old_values, al.new_values, al.ip_address, al.user_agent, al.created_at,
        u1.name as target_user_name, u1.email as target_user_email,
        u2.name as performed_by_name, u2.email as performed_by_email
      FROM user_audit_log al
      LEFT JOIN users u1 ON al.target_user_id = u1.id
      LEFT JOIN users u2 ON al.performed_by = u2.id
      ORDER BY al.created_at DESC
      LIMIT ?
    `).bind(limit).all();

    return result.results.map(entry => ({
      id: entry.id as string,
      action: entry.action as string,
      target_user_id: entry.target_user_id as string | null,
      target_user_name: entry.target_user_name as string | null,
      target_user_email: entry.target_user_email as string | null,
      performed_by: entry.performed_by as string | null,
      performed_by_name: entry.performed_by_name as string | null,
      performed_by_email: entry.performed_by_email as string | null,
      old_values: entry.old_values ? JSON.parse(entry.old_values as string) : null,
      new_values: entry.new_values ? JSON.parse(entry.new_values as string) : null,
      ip_address: entry.ip_address as string | null,
      user_agent: entry.user_agent as string | null,
      created_at: entry.created_at as string,
    })) as AuditLogEntry[];
  }

  // Permission Checking
  hasPermission(user: User, permission: Permission): boolean {
    return user.permissions.includes(permission) || user.role === 'admin';
  }

  hasAnyPermission(user: User, permissions: Permission[]): boolean {
    return permissions.some(permission => this.hasPermission(user, permission));
  }

  hasAllPermissions(user: User, permissions: Permission[]): boolean {
    return permissions.every(permission => this.hasPermission(user, permission));
  }
}
