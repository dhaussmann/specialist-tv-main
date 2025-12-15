
export interface Migration {
  id: string;
  name: string;
  sql: string;
  applied_at?: string;
}

export class MigrationManager {
  constructor(private env: CloudflareEnv) {}

  /**
   * Initialize the migrations table
   */
  async initializeMigrationsTable(): Promise<void> {
    await this.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS migrations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  }

  /**
   * Get list of applied migrations
   */
  async getAppliedMigrations(): Promise<string[]> {
    await this.initializeMigrationsTable();
    
    const result = await this.env.DB.prepare(`
      SELECT id FROM migrations ORDER BY applied_at ASC
    `).all();

    return result.results.map(row => (row as { id: string }).id);
  }

  /**
   * Apply a single migration
   */
  async applyMigration(migration: Migration): Promise<void> {
    console.log(`Applying migration: ${migration.id} - ${migration.name}`);
    
    try {
      // Execute the migration SQL
      await this.env.DB.exec(migration.sql);
      
      // Record that this migration was applied
      await this.env.DB.prepare(`
        INSERT INTO migrations (id, name) VALUES (?, ?)
      `).bind(migration.id, migration.name).run();
      
      console.log(`Migration ${migration.id} applied successfully`);
    } catch (error) {
      console.error(`Failed to apply migration ${migration.id}:`, error);
      throw error;
    }
  }

  /**
   * Check if a migration has been applied
   */
  async isMigrationApplied(migrationId: string): Promise<boolean> {
    await this.initializeMigrationsTable();
    
    const result = await this.env.DB.prepare(`
      SELECT id FROM migrations WHERE id = ?
    `).bind(migrationId).first();

    return !!result;
  }

  /**
   * Run all pending migrations
   */
  async runPendingMigrations(): Promise<void> {
    const appliedMigrations = await this.getAppliedMigrations();
    
    // Define available migrations
    const availableMigrations: Migration[] = [
      {
        id: '001_add_video_logs',
        name: 'Add video_logs table for tracking processing events',
        sql: `
          -- Video logs table - for tracking processing events and debugging
          CREATE TABLE IF NOT EXISTS video_logs (
              id TEXT PRIMARY KEY,
              video_id TEXT NOT NULL,
              level TEXT NOT NULL, -- info, warning, error, debug
              event_type TEXT NOT NULL, -- upload, transcription, tagging, chapters, webhook, etc.
              message TEXT NOT NULL,
              details TEXT, -- JSON string with additional context
              duration_ms INTEGER, -- processing time in milliseconds
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
          );

          -- Indexes for better performance
          CREATE INDEX IF NOT EXISTS idx_video_logs_video_id ON video_logs(video_id);
          CREATE INDEX IF NOT EXISTS idx_video_logs_created_at ON video_logs(created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_video_logs_level ON video_logs(level);
          CREATE INDEX IF NOT EXISTS idx_video_logs_event_type ON video_logs(event_type);
        `
      },
      {
        id: '006_add_authjs_tables',
        name: 'Add Auth.js required tables for session management',
        sql: `
          -- Auth.js required tables for session management
          -- Based on @auth/d1-adapter migrations

          CREATE TABLE IF NOT EXISTS "accounts" (
              "id" text NOT NULL,
              "userId" text NOT NULL DEFAULT NULL,
              "type" text NOT NULL DEFAULT NULL,
              "provider" text NOT NULL DEFAULT NULL,
              "providerAccountId" text NOT NULL DEFAULT NULL,
              "refresh_token" text DEFAULT NULL,
              "access_token" text DEFAULT NULL,
              "expires_at" number DEFAULT NULL,
              "token_type" text DEFAULT NULL,
              "scope" text DEFAULT NULL,
              "id_token" text DEFAULT NULL,
              "session_state" text DEFAULT NULL,
              "oauth_token_secret" text DEFAULT NULL,
              "oauth_token" text DEFAULT NULL,
              PRIMARY KEY (id)
          );

          CREATE TABLE IF NOT EXISTS "sessions" (
              "id" text NOT NULL,
              "sessionToken" text NOT NULL,
              "userId" text NOT NULL DEFAULT NULL,
              "expires" datetime NOT NULL DEFAULT NULL, 
              PRIMARY KEY (sessionToken)
          );

          CREATE TABLE IF NOT EXISTS "users" (
              "id" text NOT NULL DEFAULT '',
              "name" text DEFAULT NULL,
              "email" text DEFAULT NULL,
              "emailVerified" datetime DEFAULT NULL,
              "image" text DEFAULT NULL, 
              PRIMARY KEY (id)
          );

          CREATE TABLE IF NOT EXISTS "verification_tokens" (
              "identifier" text NOT NULL,
              "token" text NOT NULL DEFAULT NULL,
              "expires" datetime NOT NULL DEFAULT NULL, 
              PRIMARY KEY (token)
          );

          -- Indexes for better performance
          CREATE INDEX IF NOT EXISTS idx_accounts_userId ON accounts(userId);
          CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions(userId);
          CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);
          CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        `
      }
    ];

    // Apply pending migrations
    for (const migration of availableMigrations) {
      if (!appliedMigrations.includes(migration.id)) {
        await this.applyMigration(migration);
      } else {
        console.log(`Migration ${migration.id} already applied, skipping`);
      }
    }
  }

  /**
   * Get migration status
   */
  async getMigrationStatus(): Promise<{ applied: string[]; pending: string[] }> {
    const appliedMigrations = await this.getAppliedMigrations();
    const allMigrations = ['001_add_video_logs', '006_add_authjs_tables']; // Add new migration IDs here
    
    const pending = allMigrations.filter(id => !appliedMigrations.includes(id));
    
    return {
      applied: appliedMigrations,
      pending
    };
  }
}
