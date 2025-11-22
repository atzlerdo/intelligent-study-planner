import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync } from 'fs';

const PROTECTED_EMAIL = 'atzlerdo@gmail.com';

(async () => {
  try {
    const SQL = await initSqlJs();
    const buffer = readFileSync('./data/study-planner.db');
    const db = new SQL.Database(buffer);
    
    // Enable foreign keys to ensure CASCADE deletes work
    db.run('PRAGMA foreign_keys = ON');
    
    // Find protected user
    const protectedUserQuery = db.exec(`SELECT id, email FROM users WHERE email = '${PROTECTED_EMAIL}'`);
    if (protectedUserQuery.length === 0 || protectedUserQuery[0].values.length === 0) {
      console.log(`❌ Protected user ${PROTECTED_EMAIL} not found!`);
      process.exit(1);
    }
    
    const protectedUserId = protectedUserQuery[0].values[0][0];
    console.log(`✅ Protected user found: ${PROTECTED_EMAIL} (ID: ${protectedUserId})\n`);
    
    // List users to be deleted
    const usersToDeleteQuery = db.exec(`SELECT id, email FROM users WHERE email != '${PROTECTED_EMAIL}'`);
    
    if (usersToDeleteQuery.length === 0 || usersToDeleteQuery[0].values.length === 0) {
      console.log('✅ No test users to delete. Database is clean.');
      db.close();
      process.exit(0);
    }
    
    console.log(`🗑️  Users to be deleted:\n`);
    usersToDeleteQuery[0].values.forEach((row, index) => {
      const [id, email] = row;
      console.log(`${index + 1}. ${email} (ID: ${id})`);
    });
    
    console.log(`\n⚠️  This will delete ${usersToDeleteQuery[0].values.length} user(s) and all their data (courses, sessions, etc.)\n`);
    
    // Delete users (CASCADE will automatically delete related records)
    const deleteStmt = db.prepare(`DELETE FROM users WHERE email != ?`);
    deleteStmt.run([PROTECTED_EMAIL]);
    deleteStmt.free();
    
    // Save database
    const data = db.export();
    writeFileSync('./data/study-planner.db', data);
    
    console.log(`✅ Successfully deleted test users!`);
    console.log(`✅ Database saved\n`);
    
    // Verify deletion
    const remainingUsers = db.exec('SELECT id, email FROM users');
    console.log(`📊 Remaining users in database:`);
    remainingUsers[0].values.forEach((row) => {
      const [id, email] = row;
      console.log(`   - ${email} (ID: ${id})`);
    });
    
    db.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
