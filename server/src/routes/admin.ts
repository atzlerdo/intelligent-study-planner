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

export default router;