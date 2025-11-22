import initSqlJs from 'sql.js';
import { readFileSync } from 'fs';

(async () => {
  try {
    const SQL = await initSqlJs();
    const buffer = readFileSync('./data/study-planner.db');
    const db = new SQL.Database(buffer);
    
    // List all users with their data
    const usersQuery = db.exec('SELECT id, email, created_at FROM users ORDER BY created_at DESC');
    
    if (usersQuery.length === 0 || usersQuery[0].values.length === 0) {
      console.log('❌ NO USERS found in database');
    } else {
      console.log(`\n${'='.repeat(80)}\n`);
      console.log(`DATABASE SUMMARY - ${usersQuery[0].values.length} user(s) found\n`);
      console.log(`${'='.repeat(80)}\n`);
      
      usersQuery[0].values.forEach((row, index) => {
        const [id, email, createdAt] = row;
        console.log(`\n${index + 1}. 👤 ${email}`);
        console.log(`   Created: ${new Date(createdAt).toISOString()}`);
        
        // Get courses
        const coursesQuery = db.exec(`SELECT name, status, ects, progress FROM courses WHERE user_id = '${id}' ORDER BY created_at DESC LIMIT 5`);
        const coursesCount = db.exec(`SELECT COUNT(*) FROM courses WHERE user_id = '${id}'`)[0].values[0][0];
        console.log(`\n   📚 Courses: ${coursesCount}`);
        if (coursesQuery.length > 0 && coursesQuery[0].values.length > 0) {
          coursesQuery[0].values.forEach(course => {
            const [name, status, ects, progress] = course;
            console.log(`      - ${name} (${ects} ECTS, ${status}, ${progress}% done)`);
          });
          if (coursesCount > 5) {
            console.log(`      ... and ${coursesCount - 5} more`);
          }
        }
        
        // Get sessions
        const sessionsQuery = db.exec(`SELECT date, start_time, end_time FROM scheduled_sessions WHERE user_id = '${id}' ORDER BY date DESC LIMIT 3`);
        const sessionsCount = db.exec(`SELECT COUNT(*) FROM scheduled_sessions WHERE user_id = '${id}'`)[0].values[0][0];
        console.log(`\n   📅 Sessions: ${sessionsCount}`);
        if (sessionsQuery.length > 0 && sessionsQuery[0].values.length > 0) {
          sessionsQuery[0].values.forEach(session => {
            const [date, startTime, endTime] = session;
            console.log(`      - ${date} ${startTime}-${endTime}`);
          });
          if (sessionsCount > 3) {
            console.log(`      ... and ${sessionsCount - 3} more`);
          }
        }
        
        // Check study program
        const programQuery = db.exec(`SELECT total_ects, completed_ects, hours_per_ects FROM study_programs WHERE user_id = '${id}'`);
        if (programQuery.length > 0 && programQuery[0].values.length > 0) {
          const [totalEcts, completedEcts, hoursPerEcts] = programQuery[0].values[0];
          console.log(`\n   🎓 Study Program: ${completedEcts}/${totalEcts} ECTS (${hoursPerEcts} hours/ECTS)`);
        }
        
        // Check Google Calendar
        const tokenQuery = db.exec(`SELECT google_email, last_sync FROM google_calendar_tokens WHERE user_id = '${id}'`);
        if (tokenQuery.length > 0 && tokenQuery[0].values.length > 0) {
          const [googleEmail, lastSync] = tokenQuery[0].values[0];
          console.log(`\n   📅 Google Calendar: ${googleEmail || 'Connected'} (last sync: ${lastSync ? new Date(lastSync).toISOString() : 'Never'})`);
        }
        
        console.log(`\n${'-'.repeat(80)}`);
      });
    }
    
    console.log(`\n${'='.repeat(80)}\n`);
    db.close();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
