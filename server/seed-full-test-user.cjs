const initSqlJs = require('sql.js');
const { readFileSync, writeFileSync } = require('fs');

// Usage: node seed-full-test-user.cjs <email>
const email = process.argv[2] || 'test@test.test';

function fmtDate(d) { return d.toISOString().slice(0,10); }
function addDays(d, days) { const nd = new Date(d); nd.setDate(nd.getDate()+days); return nd; }

(async () => {
  try {
    const SQL = await initSqlJs();
    const buffer = readFileSync('./data/study-planner.db');
    const db = new SQL.Database(buffer);

    // Resolve user
    const userRes = db.exec(`SELECT id FROM users WHERE email='${email}'`);
    if (!userRes.length || !userRes[0].values.length) {
      throw new Error(`User not found: ${email}`);
    }
    const userId = userRes[0].values[0][0];
    console.log(`👤 Seeding for ${email} (id=${userId})`);

    // Ensure study program
    const progRes = db.exec(`SELECT user_id FROM study_programs WHERE user_id='${userId}'`);
    if (!progRes.length || !progRes[0].values.length) {
      db.run(`INSERT INTO study_programs (user_id, total_ects, completed_ects, hours_per_ects) VALUES ('${userId}', 180, 85, 27.5)`);
    }

    // Study blocks
    const nowMs = Date.now();
    const blockA = `sb-${nowMs}-tue`; // Tuesday 17:00-19:00
    const blockB = `sb-${nowMs}-thu`; // Thursday 18:00-20:00
    const blockC = `sb-${nowMs}-sat`; // Saturday 10:00-12:00
    db.run(`INSERT OR IGNORE INTO study_blocks (id, user_id, day_of_week, start_time, end_time, duration_minutes, is_active)
            VALUES ('${blockA}', '${userId}', 2, '17:00', '19:00', 120, 1)`);
    db.run(`INSERT OR IGNORE INTO study_blocks (id, user_id, day_of_week, start_time, end_time, duration_minutes, is_active)
            VALUES ('${blockB}', '${userId}', 4, '18:00', '20:00', 120, 1)`);
    db.run(`INSERT OR IGNORE INTO study_blocks (id, user_id, day_of_week, start_time, end_time, duration_minutes, is_active)
            VALUES ('${blockC}', '${userId}', 6, '10:00', '12:00', 120, 1)`);

    // Courses set
    const base = Date.now();
    const courseDefs = [
      // Completed (sem 1-3)
      ['DLBCSICS','Introduction to Computer Science',5,'written-exam','completed',1],
      ['DLBCSM1','Mathematics I',5,'written-exam','completed',1],
      ['DLBCSOOPJ','Object-oriented Programming with Java',5,'written-exam','completed',1],
      ['DLBCSIAW','Introduction to Academic Work',5,'written-exam','completed',1],
      ['DLBCSIDM','Intercultural and Ethical Decision-Making',5,'written-exam','completed',2],
      ['DLBCSCAOS','Computer Architecture and Operating Systems',5,'written-exam','completed',2],
      ['DLBCSM2','Mathematics II',5,'written-exam','completed',2],
      ['DLBCSWAD','Web Application Development',5,'written-exam','completed',2],
      ['DLBDSSPDS','Probability and Descriptive Statistics',5,'written-exam','completed',3],
      ['DLBCSCNDS','Computer Networks and Distributed Systems',5,'written-exam','completed',3],
      ['DLBCSL','Algorithms, Data Structures, and Programming Languages',5,'written-exam','completed',3],
      ['DLBCSRE','Requirements Engineering',5,'written-exam','completed',3],

      // Active (sem 4)
      ['DLBCSPSE','Project: Software Engineering',5,'project','active',4],
      ['DLBCSSQA','Software Quality Assurance',5,'written-exam','active',4],
      ['DLBCSTCSML','Theoretical CS & Math Logic',5,'written-exam','active',4],
      ['DLBCSPITSM','Project: IT Service Management',5,'project','active',4],

      // Planned (sem 5-6)
      ['DLBCSML','Machine Learning Basics',5,'written-exam','planned',5],
      ['DLBCSSEC','IT Security',5,'written-exam','planned',5],
      ['DLBCSCLD','Cloud Computing',5,'written-exam','planned',6],
      ['DLBCSMP','Mobile Programming',5,'project','planned',6],
    ];

    const today = new Date();
    const courses = [];
    for (const [code, name, ects, type, status, semester] of courseDefs) {
      const id = `course-${code}`;
      const estimatedEnd = fmtDate(addDays(today, 60));
      const estimatedHours = Math.round(ects * 27.5);
      db.run(`INSERT OR REPLACE INTO courses (id, user_id, name, type, ects, estimated_hours, completed_hours, scheduled_hours, progress, status, estimated_end_date, exam_date, semester, created_at, updated_at)
              VALUES ('${id}', '${userId}', '${name}', '${type}', ${ects}, ${estimatedHours}, ${status==='completed'?estimatedHours:0}, 0, ${status==='completed'?100:0}, '${status}', '${estimatedEnd}', NULL, ${semester}, '${today.toISOString()}', ${Date.now()})`);
      courses.push({ id, status });
    }

    // Sessions: mix of past and future; some unassigned
    const sessDefs = [
      // Past, completed for active courses
      ['session-'+(base+1), courses.find(c=>c.id==='course-DLBCSPSE').id, blockA, fmtDate(addDays(today,-3)), '17:00','19:00',120,1],
      ['session-'+(base+2), courses.find(c=>c.id==='course-DLBCSSQA').id, blockB, fmtDate(addDays(today,-2)), '18:00','19:30',90,1],
      // Upcoming, incomplete for active courses
      ['session-'+(base+3), courses.find(c=>c.id==='course-DLBCSPSE').id, blockA, fmtDate(addDays(today,1)), '17:00','19:00',120,0],
      ['session-'+(base+4), courses.find(c=>c.id==='course-DLBCSSQA').id, blockB, fmtDate(addDays(today,2)), '18:00','20:00',120,0],
      ['session-'+(base+5), courses.find(c=>c.id==='course-DLBCSTCSML').id, blockC, fmtDate(addDays(today,3)), '10:00','12:00',120,0],
      ['session-'+(base+6), courses.find(c=>c.id==='course-DLBCSPITSM').id, blockC, fmtDate(addDays(today,5)), '10:00','12:00',120,0],
      // Unassigned sessions (general study)
      ['session-'+(base+7), null, blockA, fmtDate(addDays(today,1)), '17:00','18:00',60,0],
      ['session-'+(base+8), null, blockB, fmtDate(addDays(today,-1)), '18:00','19:00',60,1],
    ];

    for (const [id, courseId, blockId, date, start, end, minutes, completed] of sessDefs) {
      db.run(`INSERT OR REPLACE INTO scheduled_sessions (
        id, user_id, course_id, study_block_id, date, start_time, end_date, end_time, duration_minutes, completed, completion_percentage, notes, last_modified
      ) VALUES (
        '${id}', '${userId}', ${courseId?`'${courseId}'`:'NULL'}, '${blockId}', '${date}', '${start}', NULL, '${end}', ${minutes}, ${completed}, ${completed?100:0}, NULL, ${Date.now()}
      )`);
    }

    // Recalculate scheduled_hours per active course (incomplete sessions only)
    for (const c of courses.filter(c=>c.status!=='completed')) {
      const res = db.exec(`SELECT SUM(duration_minutes) FROM scheduled_sessions WHERE user_id='${userId}' AND course_id='${c.id}' AND completed=0`);
      const totalMin = res.length && res[0].values.length ? (res[0].values[0][0]||0) : 0;
      const totalHours = totalMin / 60;
      db.run(`UPDATE courses SET scheduled_hours=${totalHours} WHERE id='${c.id}' AND user_id='${userId}'`);
    }

    const data = db.export();
    writeFileSync('./data/study-planner.db', Buffer.from(data));
    db.close();
    console.log('✅ Full dataset seeded for test user');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();