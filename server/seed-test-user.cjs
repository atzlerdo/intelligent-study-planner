const initSqlJs = require('sql.js');
const { readFileSync, writeFileSync } = require('fs');

// Usage: node seed-test-user.cjs <email>
const email = process.argv[2] || 'test@test.test';

(async () => {
  try {
    const SQL = await initSqlJs();
    const buffer = readFileSync('./data/study-planner.db');
    const db = new SQL.Database(buffer);

    // Get or create user
    const userRes = db.exec(`SELECT id FROM users WHERE email = '${email}'`);
    let userId;
    if (userRes.length === 0 || userRes[0].values.length === 0) {
      userId = `${Date.now()}`;
      const now = Date.now();
      db.run(`INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES ('${userId}', '${email}', '', ${now}, ${now})`);
      console.log(`👤 Created user: ${email}`);
    } else {
      userId = userRes[0].values[0][0];
      console.log(`👤 Using existing user: ${email} (id=${userId})`);
    }

    // Study program
    const progRes = db.exec(`SELECT user_id FROM study_programs WHERE user_id='${userId}'`);
    if (progRes.length === 0 || progRes[0].values.length === 0) {
      db.run(`INSERT INTO study_programs (user_id, total_ects, completed_ects, hours_per_ects) VALUES ('${userId}', 180, 85, 27.5)`);
      console.log('🎓 Inserted study program 85/180 ECTS');
    } else {
      console.log('🎓 Study program already exists');
    }

    const nowIso = new Date().toISOString();
    const today = new Date();
    const fmtDate = (d) => d.toISOString().slice(0,10);

    // Default study block
    const blockId = `blk-${Date.now()}`;
    db.run(`INSERT INTO study_blocks (id, user_id, day_of_week, start_time, end_time, duration_minutes, is_active)
         VALUES ('${blockId}', '${userId}', 2, '18:00', '20:00', 120, 1)`);

    // Courses (3 sample courses)
    const courses = [
      { id: `c-${Date.now()}-1`, name: 'Web Application Development', type: 'written-exam', ects: 5, status: 'active' },
      { id: `c-${Date.now()}-2`, name: 'Database Modeling and Systems', type: 'written-exam', ects: 5, status: 'active' },
      { id: `c-${Date.now()}-3`, name: 'Project: Software Engineering', type: 'project', ects: 5, status: 'planned' },
    ];

    courses.forEach((c, idx) => {
            const estEnd = new Date(); estEnd.setMonth(estEnd.getMonth() + 2);
            const estimatedHours = Math.round(c.ects * 27.5);
            db.run(`INSERT INTO courses (id, user_id, name, type, ects, estimated_hours, completed_hours, scheduled_hours, progress, status, estimated_end_date, created_at, updated_at)
              VALUES ('${c.id}', '${userId}', '${c.name}', '${c.type}', ${c.ects}, ${estimatedHours}, 0, 0, 0, '${c.status}', '${fmtDate(estEnd)}', '${nowIso}', ${Date.now()})`);
    });

    // Sessions tied to the first two courses
    const s1Date = fmtDate(new Date(today.getFullYear(), today.getMonth(), today.getDate()+1));
    const s2Date = fmtDate(new Date(today.getFullYear(), today.getMonth(), today.getDate()+3));
    const sessions = [
      { id: `s-${Date.now()}-1`, courseId: courses[0].id, date: s1Date, start: '18:00', end: '20:00' },
      { id: `s-${Date.now()}-2`, courseId: courses[1].id, date: s2Date, start: '18:00', end: '20:00' },
    ];

    sessions.forEach(s => {
      db.run(`INSERT INTO scheduled_sessions (id, user_id, course_id, study_block_id, date, start_time, end_date, end_time, duration_minutes, completed, completion_percentage, notes, last_modified)
              VALUES ('${s.id}', '${userId}', '${s.courseId}', '${blockId}', '${s.date}', '${s.start}', NULL, '${s.end}', 120, 0, 0, NULL, ${Date.now()})`);
    });

    const newData = db.export();
    writeFileSync('./data/study-planner.db', Buffer.from(newData));
    db.close();

    console.log('✅ Seeded courses and sessions for test user');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
