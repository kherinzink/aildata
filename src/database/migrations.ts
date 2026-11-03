import { SQLiteDatabase } from 'expo-sqlite';

export async function runMigrations(db: SQLiteDatabase) {
  // Create schema migrations tracking table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      migration_name TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Check if initial migration has run
  const result = await db.getAllAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM schema_migrations WHERE migration_name = '001_initial_setup';"
  );
  const count = result[0]?.count ?? 0;

  if (count === 0) {
    // Initial extensible schema for unstructured or structured data before final table design
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS dynamic_records (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        data_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO schema_migrations (migration_name) VALUES ('001_initial_setup');
    `);
  }
}
