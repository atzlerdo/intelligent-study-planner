/**
 * ============================================================================
 * DATABASE CONFIGURATION - SQLite via sql.js
 * ============================================================================
 * 
 * Backend database for storing all user data (courses, sessions, tokens, etc.)
 * 
 * TECHNOLOGY:
 * - sql.js: SQLite compiled to WebAssembly (runs in Node.js)
 * - File-based persistence: data/study-planner.db
 * - Synchronous API: all operations are blocking (no async/await needed)
 * 
 * ARCHITECTURE:
 * - Single database file per deployment
 * - User isolation via user_id foreign keys
 * - Foreign key constraints enabled (CASCADE deletes)
 * - Automatic save to disk after every write operation
 * 
 * TABLES:
 * - users: Authentication (email, password_hash, JWT)
 * - courses: Course data (name, ECTS, status, progress)
 * - sessions: Scheduled study sessions (date, time, completion)
 * - study_blocks: Recurring weekly time slots
 * - study_programs: Degree configuration (total ECTS, hours per ECTS)
 * - google_calendar_tokens: OAuth tokens for Google Calendar sync
 * 
 * API WRAPPER:
 * - dbWrapper.prepare(sql).run(...params) - Execute with params
 * - dbWrapper.prepare(sql).get(...params) - Fetch single row
 * - dbWrapper.prepare(sql).all(...params) - Fetch all rows
 * - dbWrapper.exec(sql) - Execute raw SQL (for schema changes)
 * 
 * PERSISTENCE:
 * - Every write calls saveDB() to persist changes immediately
 * - In-memory database exported as Buffer and written to file
 * - No transaction batching (trade-off for simplicity)
 */

import initSqlJs, { Database } from 'sql.js';
import { join } from 'path';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';

// Database file location (configurable via environment variable)
const DB_PATH = process.env.DATABASE_PATH || './data/study-planner.db';

// Ensure data directory exists at startup
const dbDir = join(process.cwd(), 'data');
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

let db: Database;
let isInitialized = false;

/**
 * Initialize sql.js and load database
 * 
 * Process:
 * 1. Initialize sql.js WebAssembly module
 * 2. Load existing database file if exists, otherwise create new
 * 3. Enable foreign key constraints (CASCADE deletes)
 * 
 * @returns Database instance
 */
export async function initDB() {
  if (isInitialized) return db;
  
  const SQL = await initSqlJs();
  
  // Load existing database from file or create new one
  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    console.log('📂 Loaded existing database');
  } else {
    db = new SQL.Database();
    console.log('📝 Created new database');
  }

  // Enable foreign key enforcement (required for CASCADE deletes)
  db.run('PRAGMA foreign_keys = ON');
  isInitialized = true;
  
  return db;
}

/**
 * Persist in-memory database to disk
 * Called after every write operation to ensure data durability
 */
export function saveDB() {
  if (!db || !isInitialized) return;
  const data = db.export();
  writeFileSync(DB_PATH, data);
}

/**
 * Database wrapper to match better-sqlite3 API
 * 
 * Provides familiar prepare().run/get/all() interface
 * All write operations automatically save to disk
 */
export const dbWrapper = {
  /**
   * Prepare SQL statement with parameter binding
   * 
   * @param sql SQL query with ? placeholders
   * @returns Object with run/get/all methods
   */
  prepare: (sql: string) => ({
    /**
     * Execute statement with parameters (INSERT, UPDATE, DELETE)
     * @returns Object with changes count
     */
    run: (...params: any[]) => {
      if (!isInitialized) throw new Error('Database not initialized');
      db.run(sql, params);
      saveDB();  // Persist changes immediately
      return { changes: db.getRowsModified() };
    },
    /**
     * Fetch single row (SELECT ... LIMIT 1)
     * @returns Row object or null if not found
     */
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
    /**
     * Fetch all matching rows (SELECT)
     * @returns Array of row objects
     */
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
  /**
   * Execute raw SQL (for schema changes, multiple statements)
   * Used primarily for table creation
   */
  exec: (sql: string) => {
    if (!isInitialized) throw new Error('Database not initialized');
    db.exec(sql);
    saveDB();
  },
};

export { db };

/**
 * ============================================================================
 * DATABASE SCHEMA INITIALIZATION
 * ============================================================================
 * 
 * Creates all tables if they don't exist
 * Called once at server startup
 */
export async function initializeDatabase() {
  await initDB();
  console.log('🗄️  Initializing database...');

  /**
   * USERS TABLE
   * Stores authentication credentials and user profile
   * 
   * Fields:
   * - id: UUID primary key
   * - email: Unique login identifier
   * - password_hash: bcrypt hashed password
   * - name: Display name
   * - created_at, updated_at: Unix timestamps (milliseconds)
   */
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

  /**
   * STUDY_PROGRAMS TABLE
   * Stores degree configuration per user
   * 
   * Fields:
   * - user_id: Foreign key to users (CASCADE delete)
   * - total_ects: Total ECTS for degree (180 for Bachelor)
   * - completed_ects: ECTS earned so far
   * - hours_per_ects: Workload per ECTS (27.5 German standard)
   */
  dbWrapper.exec(`
    CREATE TABLE IF NOT EXISTS study_programs (
      user_id TEXT PRIMARY KEY,
      total_ects INTEGER NOT NULL DEFAULT 180,
      completed_ects INTEGER NOT NULL DEFAULT 0,
      hours_per_ects REAL NOT NULL DEFAULT 27.5,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  /**
   * COURSES TABLE
   * Stores course information and progress
   * 
   * Fields:
   * - id: UUID primary key
   * - user_id: Foreign key to users (CASCADE delete)
   * - name: Course title
   * - type: 'written-exam' or 'project'
   * - ects: Credit points
   * - estimated_hours: Total workload (ects × hours_per_ects)
   * - completed_hours: Hours worked so far
   * - scheduled_hours: Hours scheduled in sessions
   * - progress: Percentage (0-100)
   * - status: 'planned' → 'active' → 'completed'
   * - estimated_end_date: Projected completion (YYYY-MM-DD)
   * - exam_date: Optional exam date
   * - semester: 1-6 for Bachelor program structure
   */
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

  /**
   * MILESTONES TABLE
   * Optional sub-tasks within courses
   * 
   * Fields:
   * - id: UUID primary key
   * - course_id: Foreign key to courses (CASCADE delete)
   * - title: Milestone description
   * - deadline: Target date (YYYY-MM-DD)
   * - completed: Boolean (0 or 1)
   */
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

  /**
   * STUDY_BLOCKS TABLE
   * Recurring weekly time slots for scheduling
   * 
   * Fields:
   * - id: UUID primary key
   * - user_id: Foreign key to users (CASCADE delete)
   * - day_of_week: 0=Sunday, 1=Monday, ..., 6=Saturday
   * - start_time: HH:mm format (e.g., "14:00")
   * - end_time: HH:mm format
   * - duration_minutes: Calculated from start/end time
   * - is_active: Boolean (0=disabled, 1=active)
   */
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

  /**
   * SCHEDULED_SESSIONS TABLE
   * Individual study sessions (manually created or auto-scheduled)
   * 
   * Fields:
   * - id: UUID primary key
   * - user_id: Foreign key to users (CASCADE delete)
   * - course_id: Foreign key to courses (NULL for unassigned/break sessions)
   * - study_block_id: Foreign key to study_blocks
   * - date: Start date (YYYY-MM-DD)
   * - start_time: HH:mm format
   * - end_date: Optional end date for multi-day sessions
   * - end_time: HH:mm format
   * - duration_minutes: Calculated duration
   * - completed: Boolean (0=not attended, 1=attended)
   * - completion_percentage: Self-assessed progress (0-100)
   * - notes: User notes for the session
   * - last_modified: Unix timestamp of last edit
   * - google_event_id: Google Calendar event ID (for sync)
   * - google_calendar_id: Which Google Calendar owns this
   * - original_title: Preserve original event title from imports
   * - original_description: Preserve original event description
   * - recurring_event_id: Links to parent recurring event
   * - is_recurrence_exception: Boolean (modified instance of recurring event)
   */
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

  /**
   * RECURRENCE_PATTERNS TABLE
   * Stores recurring event rules (RFC 5545 RRULE format)
   * 
   * Fields:
   * - session_id: Foreign key to scheduled_sessions
   * - rrule: RRULE string (e.g., "FREQ=WEEKLY;BYDAY=MO,WE,FR")
   * - dtstart: Start date for recurrence
   * - until: Optional end date
   * - count: Optional max occurrences
   * - exdates: Excluded dates (exceptions)
   */
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

  /**
   * GOOGLE_CALENDAR_TOKENS TABLE
   * OAuth tokens for Google Calendar integration (one per user)
   * 
   * Fields:
   * - user_id: Primary key and foreign key to users (CASCADE delete)
   * - access_token: OAuth 2.0 access token
   * - refresh_token: For token renewal
   * - token_expiry: Unix timestamp when token expires
   * - calendar_id: Google Calendar ID for "Intelligent Study Planner" calendar
   * - google_email: User's Google account email
   * - last_sync: Unix timestamp of last successful sync
   * - created_at, updated_at: Audit timestamps
   */
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
