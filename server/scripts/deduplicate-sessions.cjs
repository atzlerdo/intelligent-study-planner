#!/usr/bin/env node
/*
Deduplicate scheduled sessions in the database.
- Groups by (user_id, course_id, date, startTime, endTime, duration_minutes)
- Keeps the record with the highest lastModified (or highest id if null)
- Deletes other duplicates in each group
Usage:
  node ./scripts/deduplicate-sessions.cjs [email]
If email is provided, restricts to that user's sessions.
Requires env `DATABASE_PATH` to point to the sqlite database file.
*/

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

async function main() {
  const emailFilter = process.argv[2] || null;
  const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '..', 'data', 'study-planner.db');
  if (!fs.existsSync(dbPath)) {
    console.error(`❌ Database file not found at ${dbPath}. Set DATABASE_PATH.`);
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(dbPath);
  const SQL = await initSqlJs();
  const db = new SQL.Database(fileBuffer);

  const getUsers = () => {
    if (emailFilter) {
      const stmt = db.prepare('SELECT id, email FROM users WHERE email = ?');
      const rows = [];
      stmt.bind([emailFilter]);
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    } else {
      const stmt = db.prepare('SELECT id, email FROM users');
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    }
  };

  const users = getUsers();
  if (users.length === 0) {
    console.log('No users found for filter.');
    return;
  }

  let totalDeleted = 0;

  for (const user of users) {
    console.log(`\n🔎 Checking sessions for user ${user.email} (${user.id})`);
    const stmt = db.prepare(`
      SELECT id, user_id, course_id, date, start_time, end_time, duration_minutes, last_modified
      FROM scheduled_sessions WHERE user_id = ?
      ORDER BY date ASC, start_time ASC
    `);
    const sessions = [];
    stmt.bind([user.id]);
    while (stmt.step()) sessions.push(stmt.getAsObject());
    stmt.free();

    // Group by key
    const groups = new Map();
    for (const s of sessions) {
      const key = [
        s.user_id,
        s.course_id || 'NULL',
        s.date,
        s.start_time,
        s.end_time || 'NULL',
        s.duration_minutes
      ].join('|');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }

    let deletedForUser = 0;

    for (const [key, group] of groups.entries()) {
      if (group.length <= 1) continue;
      // Choose the record to keep: highest lastModified; tie-breaker by highest id
      group.sort((a, b) => {
        const lmA = a.last_modified || 0;
        const lmB = b.last_modified || 0;
        if (lmA !== lmB) return lmB - lmA;
        // ids are strings; sort descending lexicographically as tie-breaker
        return String(b.id).localeCompare(String(a.id));
      });
      const keep = group[0];
      const toDelete = group.slice(1);

      if (toDelete.length > 0) {
        console.log(`  Group ${key} has ${group.length} dupes → keeping ${keep.id}, deleting ${toDelete.length}`);
      }

      for (const del of toDelete) {
        const delStmt = db.prepare('DELETE FROM scheduled_sessions WHERE id = ? AND user_id = ?');
        delStmt.bind([del.id, user.id]);
        delStmt.step();
        delStmt.free();
        deletedForUser++;
        totalDeleted++;
      }
    }

    console.log(`✅ User ${user.email}: deleted ${deletedForUser} duplicates`);
  }

  // Persist DB
  const out = Buffer.from(db.export());
  fs.writeFileSync(dbPath, out);
  console.log(`\n🎉 Done. Total duplicates deleted: ${totalDeleted}`);
}

main().catch(err => {
  console.error('Error during deduplication:', err);
  process.exit(1);
});
