import initSqlJs from 'sql.js';
import { readFileSync } from 'fs';

(async () => {
  try {
    const SQL = await initSqlJs();
    const buffer = readFileSync('./data/study-planner.db');
    const db = new SQL.Database(buffer);
    
    // List all users
    const usersQuery = db.exec('SELECT id, email, created_at FROM users ORDER BY created_at DESC');
    
    if (usersQuery.length === 0 || usersQuery[0].values.length === 0) {
      console.log('❌ NO USERS found in database');
    } else {
      console.log(`✅ Found ${usersQuery[0].values.length} user(s) in database:\n`);
      usersQuery[0].values.forEach((row, index) => {
        const [id, email, createdAt] = row;
        console.log(`${index + 1}. Email: ${email}`);
        console.log(`   ID: ${id}`);
        console.log(`   Created: ${new Date(createdAt).toISOString()}\n`);
      });
    }
    
    db.close();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
