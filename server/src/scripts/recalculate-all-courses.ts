/**
 * Migration script to recalculate scheduledHours for all courses
 * This should be run once after the fix to exclude completed sessions from scheduled hours
 */

import { dbWrapper } from '../db.js';

function recalculateScheduledHours(courseId: string, userId: string) {
  try {
    // Sum up all INCOMPLETE session durations for this course
    const result = dbWrapper.prepare(`
      SELECT SUM(duration_minutes) as total_minutes
      FROM scheduled_sessions
      WHERE course_id = ? AND user_id = ? AND completed = 0
    `).get(courseId, userId) as { total_minutes: number | null };
    
    const totalHours = result.total_minutes ? result.total_minutes / 60 : 0;
    
    // Update the course's scheduled_hours
    dbWrapper.prepare(`
      UPDATE courses
      SET scheduled_hours = ?
      WHERE id = ? AND user_id = ?
    `).run(totalHours, courseId, userId);
    
    console.log(`✅ Recalculated course ${courseId}: ${totalHours} hours (incomplete sessions only)`);
    return totalHours;
  } catch (error) {
    console.error(`❌ Failed to recalculate course ${courseId}:`, error);
    return null;
  }
}

function main() {
  console.log('Starting course scheduledHours recalculation...\n');
  
  // Get all courses with their user IDs
  const courses = dbWrapper.prepare(`
    SELECT id, user_id, name FROM courses
  `).all() as Array<{ id: string; user_id: string; name: string }>;
  
  console.log(`Found ${courses.length} courses to recalculate\n`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const course of courses) {
    console.log(`Processing: ${course.name} (${course.id})`);
    const result = recalculateScheduledHours(course.id, course.user_id);
    if (result !== null) {
      successCount++;
    } else {
      errorCount++;
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`✅ Successfully recalculated: ${successCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log(`\nDone! All course scheduledHours have been updated.`);
}

// Run the migration
main();
