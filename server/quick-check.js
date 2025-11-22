import initSqlJs from 'sql.js';
import { readFileSync } from 'fs';

(async () => {
  const SQL = await initSqlJs();
  const buffer = readFileSync('./data/study-planner.db');
  const db = new SQL.Database(buffer);
  
  const result = db.exec('SELECT email, id FROM users');
  
  if (result.length > 0) {
    console.log('Current users:');
    result[0].values.forEach(([email, id]) => {
      console.log(`  - ${email}`);
    });
  } else {
    console.log('No users found');
  }
  
  db.close();
})();
