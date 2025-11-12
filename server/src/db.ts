import initSqlJs, { Database } from 'sql.js';
import { join } from 'path';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';

const DB_PATH = process.env.DATABASE_PATH || './data/study-planner.db';

// Ensure data directory exists
const dbDir = join(process.cwd(), 'data');
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

let db: Database;
let isInitialized = false;

// Initialize SQL.js and load database
export async function initDB() {
  if (isInitialized) return db;
  
  const SQL = await initSqlJs();
  
  // Try to load existing database file
  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    console.log('📂 Loaded existing database');
  } else {
    db = new SQL.Database();
    console.log('📝 Created new database');
  }

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');
  isInitialized = true;
  
  return db;
}

// Save database to disk
export function saveDB() {
  if (!db || !isInitialized) return;
  const data = db.export();
  writeFileSync(DB_PATH, data);
}

// Wrapper functions to match better-sqlite3 API
export const dbWrapper = {
  prepare: (sql: string) => ({
    run: (...params: any[]) => {
      if (!isInitialized) throw new Error('Database not initialized');
      db.run(sql, params);
      saveDB();
      return { changes: db.getRowsModified() };
    },
    get: (...params: any[]) => {
      if (!isInitialized) throw new Error('Database not initialized');
      const stmt = db.prepare(sql);
      stmt.bind(params);
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row;
      }
      stmt.free();
      return null;
    },
    all: (...params: any[]) => {
      if (!isInitialized) throw new Error('Database not initialized');
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const results: any[] = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      return results;
    },
  }),
  exec: (sql: string) => {
    if (!isInitialized) throw new Error('Database not initialized');
    db.exec(sql);
    saveDB();
  },
};

export { db };

export async function initializeDatabase() {
  await initDB();
  console.log('🗄️  Initializing database...');

  // Users table
  dbWrapper.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Study program settings (per user)
  dbWrapper.exec(`
    CREATE TABLE IF NOT EXISTS study_programs (
      user_id TEXT PRIMARY KEY,
      total_ects INTEGER NOT NULL DEFAULT 180,
      completed_ects INTEGER NOT NULL DEFAULT 0,
      hours_per_ects REAL NOT NULL DEFAULT 27.5,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Courses table
  dbWrapper.exec(`
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('written-exam', 'project')),
      ects INTEGER NOT NULL,
      estimated_hours INTEGER NOT NULL,
      completed_hours INTEGER NOT NULL DEFAULT 0,
      scheduled_hours INTEGER NOT NULL DEFAULT 0,
      progress INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK(status IN ('planned', 'active', 'completed')),
      estimated_end_date TEXT NOT NULL,
      exam_date TEXT,
      semester INTEGER,
      created_at TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Milestones table
  dbWrapper.exec(`
    CREATE TABLE IF NOT EXISTS milestones (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      title TEXT NOT NULL,
      deadline TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    )
  `);

  // Study blocks table
  dbWrapper.exec(`
    CREATE TABLE IF NOT EXISTS study_blocks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      day_of_week INTEGER NOT NULL CHECK(day_of_week >= 0 AND day_of_week <= 6),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Scheduled sessions table
  dbWrapper.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      course_id TEXT,
      study_block_id TEXT NOT NULL,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_date TEXT,
      end_time TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      completion_percentage INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      last_modified INTEGER,
      google_event_id TEXT,
      google_calendar_id TEXT,
      original_title TEXT,
      original_description TEXT,
      recurring_event_id TEXT,
      is_recurrence_exception INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL
    )
  `);

  // Recurrence patterns table (stores RRULE info for recurring sessions)
  dbWrapper.exec(`
    CREATE TABLE IF NOT EXISTS recurrence_patterns (
      session_id TEXT PRIMARY KEY,
      rrule TEXT NOT NULL,
      dtstart TEXT NOT NULL,
      until TEXT,
      count INTEGER,
      exdates TEXT,
      FOREIGN KEY (session_id) REFERENCES scheduled_sessions(id) ON DELETE CASCADE
    )
  `);

  // Google Calendar tokens table (stores OAuth tokens per user)
  dbWrapper.exec(`
    CREATE TABLE IF NOT EXISTS google_calendar_tokens (
      user_id TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      token_expiry INTEGER,
      calendar_id TEXT,
      google_email TEXT,
      last_sync INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Indexes for common queries
  dbWrapper.exec(`
    CREATE INDEX IF NOT EXISTS idx_courses_user ON courses(user_id);
    CREATE INDEX IF NOT EXISTS idx_courses_status ON courses(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON scheduled_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_date ON scheduled_sessions(date);
    CREATE INDEX IF NOT EXISTS idx_sessions_course ON scheduled_sessions(course_id);
    CREATE INDEX IF NOT EXISTS idx_milestones_course ON milestones(course_id);
    CREATE INDEX IF NOT EXISTS idx_study_blocks_user ON study_blocks(user_id);
  `);

  console.log('✅ Database initialized successfully');
}

// Graceful shutdown
process.on('SIGINT', () => {
  saveDB();
  process.exit(0);
});

process.on('SIGTERM', () => {
  saveDB();
  process.exit(0);
});
