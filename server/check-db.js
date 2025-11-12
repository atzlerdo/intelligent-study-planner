import initSqlJs from 'sql.js';
import { readFileSync } from 'fs';

async function checkDatabase() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(readFileSync('./data/study-planner.db'));
  
  console.log('\n=== DATABASE VERIFICATION ===\n');
  
  const tables = ['users', 'courses', 'scheduled_sessions', 'study_blocks', 'milestones', 'study_programs', 'google_calendar_tokens'];
  
  tables.forEach(table => {
    try {
      const result = db.exec(`SELECT COUNT(*) as count FROM ${table}`);
      const count = result[0]?.values[0][0] || 0;
      console.log(`${table}: ${count} rows`);
      
      // Show sample data if exists
      if (count > 0 && count < 10) {
        const data = db.exec(`SELECT * FROM ${table} LIMIT 3`);
        if (data[0]) {
          console.log(`  Sample: ${JSON.stringify(data[0].values[0])}`);
        }
      }
    } catch (e) {
      console.log(`${table}: ERROR - ${e.message}`);
    }
  });
  
  console.log('\n=== END ===\n');
}

checkDatabase().catch(console.error);
