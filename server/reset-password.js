// Reset a user's password in the SQLite (sql.js) database
// Usage (PowerShell):
//   node reset-password.js atzlerdo@gmail.com "NewStrongPassword123!"

const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
const { join } = require('path');
const bcrypt = require('bcryptjs');
const initSqlJs = require('sql.js');

async function main() {
  const [email, newPassword] = process.argv.slice(2);
  if (!email || !newPassword) {
    console.error('Usage: node reset-password.js <email> <newPassword>');
    process.exit(1);
  }

  const DB_PATH = process.env.DATABASE_PATH || join(process.cwd(), 'data', 'study-planner.db');
  const dataDir = join(process.cwd(), 'data');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  const SQL = await initSqlJs();
  let db;
  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    console.log('📂 Loaded existing database');
  } else {
    db = new SQL.Database();
    console.log('📝 Created new database');
  }

  db.run('PRAGMA foreign_keys = ON');

  // Ensure users table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Check user exists
  const stmt = db.prepare('SELECT id, email FROM users WHERE email = ? LIMIT 1');
  stmt.bind([email]);
  let user = null;
  if (stmt.step()) user = stmt.getAsObject();
  stmt.free();

  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(2);
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  const now = Date.now();
  db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE email = ?', [hash, now, email]);

  const exported = db.export();
  writeFileSync(DB_PATH, exported);
  console.log(`✅ Password reset for ${email}`);
}

main().catch(err => {
  console.error('Reset failed:', err);
  process.exit(99);
});
