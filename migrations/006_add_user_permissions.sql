-- User permissions and role management system
-- Extends Auth.js users table with role-based access control

-- Add role and permissions columns to existing users table
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'viewer';
ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT '[]'; -- JSON array of permissions
ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN created_at DATETIME;
ALTER TABLE users ADD COLUMN updated_at DATETIME;

-- Authorized domains table - allow entire email domains
CREATE TABLE IF NOT EXISTS authorized_domains (
    id TEXT PRIMARY KEY,
    domain TEXT UNIQUE NOT NULL, -- e.g., 'company.com'
    default_role TEXT DEFAULT 'viewer', -- default role for users from this domain
    default_permissions TEXT DEFAULT '[]', -- JSON array of default permissions
    is_active BOOLEAN DEFAULT true,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User invitations table - for pre-authorized email addresses
CREATE TABLE IF NOT EXISTS user_invitations (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    role TEXT DEFAULT 'viewer',
    permissions TEXT DEFAULT '[]', -- JSON array of permissions
    invited_by TEXT, -- user ID who sent the invitation
    expires_at DATETIME,
    used_at DATETIME,
    is_active BOOLEAN DEFAULT true,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Audit log for user management actions
CREATE TABLE IF NOT EXISTS user_audit_log (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL, -- 'user_created', 'role_changed', 'permissions_updated', etc.
    target_user_id TEXT,
    performed_by TEXT,
    old_values TEXT, -- JSON of old values
    new_values TEXT, -- JSON of new values
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_email_active ON users(email, is_active);
CREATE INDEX IF NOT EXISTS idx_authorized_domains_domain ON authorized_domains(domain);
CREATE INDEX IF NOT EXISTS idx_user_invitations_email ON user_invitations(email);
CREATE INDEX IF NOT EXISTS idx_user_invitations_expires ON user_invitations(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_audit_log_target ON user_audit_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_user_audit_log_performed_by ON user_audit_log(performed_by);
CREATE INDEX IF NOT EXISTS idx_user_audit_log_created_at ON user_audit_log(created_at DESC);
