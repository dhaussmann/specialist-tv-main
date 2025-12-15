# First Admin Setup Guide

This guide explains how to create the first admin user for your Specialist TV application.

## Prerequisites

- Wrangler CLI installed (`npm install -g wrangler`)
- Database migrations applied (migration `006_add_user_permissions.sql`)
- Google OAuth configured in your environment

## Method 1: Using the Setup Script (Easiest)

1. **Make the script executable:**
   ```bash
   chmod +x scripts/create-first-admin.sh
   ```

2. **Run the script with your email:**
   ```bash
   ./scripts/create-first-admin.sh your-email@example.com
   ```

3. **Sign in:**
   - Go to your application's sign-in page
   - Click "Sign in with Google"
   - Use the email address you specified
   - You'll automatically have admin access

## Method 2: Manual D1 Command

If you prefer to run the command directly:

```bash
wrangler d1 execute DB --remote --command "
INSERT INTO user_invitations (
  id,
  email,
  role,
  permissions,
  invited_by,
  expires_at,
  is_active,
  created_at
) VALUES (
  'admin-' || hex(randomblob(8)),
  'your-email@example.com',
  'admin',
  '[\"videos.view\",\"videos.create\",\"videos.edit\",\"videos.delete\",\"users.view\",\"users.create\",\"users.edit\",\"users.delete\",\"admin.access\",\"creator.access\"]',
  'system',
  datetime('now', '+30 days'),
  1,
  CURRENT_TIMESTAMP
);
"
```

**Replace `your-email@example.com` with your actual email address.**

## Method 3: Using SQL File

1. **Edit the SQL file:**
   ```bash
   nano scripts/create-first-admin.sql
   ```
   
2. **Change the email address** on line 13 to your email

3. **Execute the SQL file:**
   ```bash
   wrangler d1 execute DB --remote --file=scripts/create-first-admin.sql
   ```

## Method 4: Authorize Your Email Domain

If you want all users from your company domain to have access:

```bash
wrangler d1 execute DB --remote --command "
INSERT INTO authorized_domains (
  id,
  domain,
  default_role,
  default_permissions,
  is_active,
  created_at,
  updated_at
) VALUES (
  'domain-' || hex(randomblob(8)),
  'your-company.com',
  'admin',
  '[\"videos.view\",\"videos.create\",\"videos.edit\",\"videos.delete\",\"users.view\",\"users.create\",\"users.edit\",\"users.delete\",\"admin.access\",\"creator.access\"]',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
"
```

**Replace `your-company.com` with your email domain** (e.g., if your email is `john@acme.com`, use `acme.com`).

## Verification

After creating the invitation or domain authorization:

1. **Check the invitation:**
   ```bash
   wrangler d1 execute DB --remote --command "
   SELECT email, role, expires_at, is_active 
   FROM user_invitations 
   WHERE email = 'your-email@example.com';
   "
   ```

2. **Or check authorized domains:**
   ```bash
   wrangler d1 execute DB --remote --command "
   SELECT domain, default_role, is_active 
   FROM authorized_domains;
   "
   ```

## After First Sign-In

Once you've signed in as admin, you can:

1. **Access the admin panel** at `/admin` or `/creator`
2. **Invite other users** through the UI
3. **Manage user roles and permissions**
4. **Add authorized domains** for automatic access

## User Roles

- **Admin**: Full access to everything (videos, users, settings)
- **Creator**: Can create, edit, and delete videos
- **Viewer**: Can only view videos

## Permissions

Admin role includes all permissions:
- `videos.view` - View videos
- `videos.create` - Create new videos
- `videos.edit` - Edit existing videos
- `videos.delete` - Delete videos
- `users.view` - View user list
- `users.create` - Create/invite users
- `users.edit` - Edit user roles and permissions
- `users.delete` - Delete users
- `admin.access` - Access admin panel
- `creator.access` - Access creator panel

## Troubleshooting

### "User not authorized" error

- Verify the invitation exists in the database
- Check that `is_active = 1` (true)
- Ensure `expires_at` is in the future
- Confirm you're using the exact email address

### Database connection issues

```bash
# Test database connection
wrangler d1 execute DB --remote --command "SELECT 1;"

# List all tables
wrangler d1 execute DB --remote --command "
SELECT name FROM sqlite_master WHERE type='table';
"
```

### Check if migrations are applied

```bash
wrangler d1 execute DB --remote --command "
SELECT name FROM sqlite_master 
WHERE type='table' AND name IN ('user_invitations', 'authorized_domains', 'user_audit_log');
"
```

If tables don't exist, apply migrations:
```bash
wrangler d1 migrations apply DB --remote
```

## Security Notes

- Invitations expire after 30 days by default
- Once used, invitations are marked with `used_at` timestamp
- All admin actions are logged in `user_audit_log` table
- Users can be deactivated without deleting their data

## Support

For issues or questions, check:
- Auth.js logs in the browser console
- Worker logs: `wrangler tail`
- Database state: Query the tables directly with `wrangler d1 execute`
