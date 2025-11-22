import express from 'express';
import { authMiddleware, AuthRequest } from '../auth.js';
import { dbWrapper } from '../db.js';

// Admin utility routes for maintenance tasks.
// CURRENT: Claim all existing courses & sessions so only the requesting user (Dominick) owns them.
// Guarded by: requestor email must equal process.env.ADMIN_EMAIL (configure in .env) OR process.env.ADMIN_EMAIL unset (development fallback).

const router = express.Router();
router.use(authMiddleware);

function isAdmin(req: AuthRequest): boolean {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
  if (!adminEmail) return true; // fallback: if not set, allow any authenticated user (dev convenience)
  return req.user?.email?.toLowerCase() === adminEmail;
}

// POST /api/admin/claim-data
// Reassign all courses & sessions currently belonging to other users to the requesting user.
router.post('/claim-data', (req: AuthRequest, res) => {
  try {
    if (!isAdmin(req)) {
      res.status(403).json({ error: 'Forbidden: admin only' });
      return;
    }
    const targetUserId = req.user!.userId;

    // Count existing items belonging to other users
    const foreignCourses = dbWrapper.prepare('SELECT COUNT(*) as cnt FROM courses WHERE user_id != ?').get(targetUserId) as any;
    const foreignSessions = dbWrapper.prepare('SELECT COUNT(*) as cnt FROM scheduled_sessions WHERE user_id != ?').get(targetUserId) as any;

    // Reassign courses
    const courseUpdate = dbWrapper.prepare('UPDATE courses SET user_id = ? WHERE user_id != ?').run(targetUserId, targetUserId);
    // Reassign sessions
    const sessionUpdate = dbWrapper.prepare('UPDATE scheduled_sessions SET user_id = ? WHERE user_id != ?').run(targetUserId, targetUserId);

    res.json({
      reassignedCourses: courseUpdate.changes,
      reassignedSessions: sessionUpdate.changes,
      previousForeignCourses: foreignCourses?.cnt ?? 0,
      previousForeignSessions: foreignSessions?.cnt ?? 0,
      userId: targetUserId,
      message: 'All courses and sessions now belong to requesting user.'
    });
  } catch (error) {
    console.error('claim-data error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/recalculate-all-courses
// Recalculate scheduledHours for all courses (excludes completed sessions)
router.post('/recalculate-all-courses', (req: AuthRequest, res) => {
  try {
    if (!isAdmin(req)) {
      res.status(403).json({ error: 'Forbidden: admin only' });
      return;
    }
    
    const userId = req.user!.userId;
    
    // Get all courses for this user
    const courses = dbWrapper.prepare(`
      SELECT id, name FROM courses WHERE user_id = ?
    `).all(userId) as Array<{ id: string; name: string }>;
    
    const results = [];
    for (const course of courses) {
      try {
        // Sum up all INCOMPLETE session durations for this course
        const result = dbWrapper.prepare(`
          SELECT SUM(duration_minutes) as total_minutes
          FROM scheduled_sessions
          WHERE course_id = ? AND user_id = ? AND completed = 0
        `).get(course.id, userId) as { total_minutes: number | null };
        
        const totalHours = result.total_minutes ? result.total_minutes / 60 : 0;
        
        // Update the course's scheduled_hours
        dbWrapper.prepare(`
          UPDATE courses
          SET scheduled_hours = ?
          WHERE id = ? AND user_id = ?
        `).run(totalHours, course.id, userId);
        
        results.push({
          courseId: course.id,
          courseName: course.name,
          success: true,
          hours: totalHours
        });
        
        console.log(`✅ Recalculated ${course.name}: ${totalHours} hours`);
      } catch (error) {
        results.push({
          courseId: course.id,
          courseName: course.name,
          success: false,
          error: String(error)
        });
        console.error(`❌ Failed to recalculate ${course.name}:`, error);
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const errorCount = results.filter(r => !r.success).length;
    
    res.json({
      message: 'Recalculation complete',
      total: courses.length,
      successful: successCount,
      errors: errorCount,
      details: results
    });
  } catch (error) {
    console.error('Recalculation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/cleanup-users
// Delete all users and their data EXCEPT the specified protected email
router.post('/cleanup-users', (req: AuthRequest, res) => {
  try {
    if (!isAdmin(req)) {
      res.status(403).json({ error: 'Forbidden: admin only' });
      return;
    }
    
    const protectedEmail = 'atzlerdo@gmail.com';
    
    // Get the protected user's ID
    const protectedUser = dbWrapper.prepare(`
      SELECT id FROM users WHERE LOWER(email) = LOWER(?)
    `).get(protectedEmail) as { id: string } | undefined;
    
    if (!protectedUser) {
      res.status(400).json({ 
        error: 'Protected user not found',
        protectedEmail 
      });
      return;
    }
    
    // Count users to be deleted
    const usersToDelete = dbWrapper.prepare(`
      SELECT COUNT(*) as count FROM users WHERE id != ?
    `).get(protectedUser.id) as { count: number };
    
    // Delete all data for other users (CASCADE will handle related records)
    // The foreign key constraints with ON DELETE CASCADE will automatically delete:
    // - courses, scheduled_sessions, study_blocks, study_programs, google_calendar_tokens, etc.
    const deleteResult = dbWrapper.prepare(`
      DELETE FROM users WHERE id != ?
    `).run(protectedUser.id);
    
    console.log(`🧹 Cleaned up ${deleteResult.changes} users (protected: ${protectedEmail})`);
    
    res.json({
      message: 'Cleanup complete',
      deletedUsers: deleteResult.changes,
      protectedEmail,
      protectedUserId: protectedUser.id
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;