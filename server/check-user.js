import initSqlJs from 'sql.js';
import { readFileSync } from 'fs';

const email = process.argv[2] || 'atzlerdo@gmail.com';

(async () => {
  try {
    const SQL = await initSqlJs();
    const buffer = readFileSync('./data/study-planner.db');
    const db = new SQL.Database(buffer);
    
    // Check if user exists
    const userQuery = db.exec(`SELECT id, email, created_at FROM users WHERE email = '${email}'`);
    
    if (userQuery.length === 0 || userQuery[0].values.length === 0) {
      console.log(`❌ User ${email} NOT FOUND in database`);
    } else {
      console.log(`✅ User ${email} EXISTS in database:`);
      const [id, emailDb, createdAt] = userQuery[0].values[0];
      console.log(`   ID: ${id}`);
      console.log(`   Email: ${emailDb}`);
      console.log(`   Created: ${new Date(createdAt).toISOString()}`);
      
      // Check Google Calendar token
      const tokenQuery = db.exec(`SELECT user_id, calendar_id, google_email, last_sync FROM google_calendar_tokens WHERE user_id = '${id}'`);
      if (tokenQuery.length > 0 && tokenQuery[0].values.length > 0) {
        console.log(`\n📅 Google Calendar Token:`);
        const [userId, calendarId, googleEmail, lastSync] = tokenQuery[0].values[0];
        console.log(`   Calendar ID: ${calendarId || 'NULL'}`);
        console.log(`   Google Email: ${googleEmail || 'NULL'}`);
        console.log(`   Last Sync: ${lastSync ? new Date(lastSync).toISOString() : 'Never'}`);
      } else {
        console.log(`\n❌ No Google Calendar token found for this user`);
      }
      
      // Check courses count
      const coursesQuery = db.exec(`SELECT COUNT(*) FROM courses WHERE user_id = '${id}'`);
      const coursesCount = coursesQuery[0].values[0][0];
      console.log(`\n📚 Courses: ${coursesCount}`);
      
      // Check sessions count
      const sessionsQuery = db.exec(`SELECT COUNT(*) FROM scheduled_sessions WHERE user_id = '${id}'`);
      const sessionsCount = sessionsQuery[0].values[0][0];
      console.log(`📅 Sessions: ${sessionsCount}`);
    }
    
    db.close();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
