const initSqlJs = require('sql.js');
const { readFileSync, writeFileSync } = require('fs');

// Usage: node clear-db-except-test.cjs <email>
const email = process.argv[2] || 'test@test.test';

(async () => {
  try {
    const SQL = await initSqlJs();
    const buffer = readFileSync('./data/study-planner.db');
    const db = new SQL.Database(buffer);

    // Ensure foreign keys for cascading deletes
    db.run('PRAGMA foreign_keys = ON');

    // Find the test user
    const userRes = db.exec(`SELECT id FROM users WHERE email='${email}'`);
    if (!userRes.length || !userRes[0].values.length) {
      console.error(`❌ User not found: ${email}`);
      console.error('   Hint: run reset-password.cjs to create the user first.');
      process.exit(1);
    }
    const testUserId = userRes[0].values[0][0];

    // Delete all other users (CASCADE removes their data)
    const delStmt = `DELETE FROM users WHERE id <> '${testUserId}'`;
    db.run(delStmt);

    // Optionally, ensure study program exists for the test user
    const prog = db.exec(`SELECT user_id FROM study_programs WHERE user_id='${testUserId}'`);
    if (!prog.length || !prog[0].values.length) {
      db.run(`INSERT INTO study_programs (user_id, total_ects, completed_ects, hours_per_ects)
              VALUES ('${testUserId}', 180, 85, 27.5)`);
    }

    const data = db.export();
    writeFileSync('./data/study-planner.db', Buffer.from(data));
    db.close();
    console.log(`✅ Cleared database. Only ${email} remains.`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
