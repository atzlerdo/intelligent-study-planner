import express from 'express';
import { z } from 'zod';
import { dbWrapper } from '../db.js';
import { authMiddleware, AuthRequest } from '../auth.js';

const router = express.Router();
router.use(authMiddleware);

/**
 * Recalculate and update scheduledHours for a course based on all its sessions
 * This should be called after any session create/update/delete operation
 */
function recalculateScheduledHours(courseId: string, userId: string) {
  if (!courseId) return; // Skip if no course assigned
  
  try {
    // Sum up all INCOMPLETE session durations for this course
    // Completed sessions should not count toward "scheduled hours" (they're already in "completed hours")
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
    
    console.log(`✅ Recalculated scheduledHours for course ${courseId}: ${totalHours} hours (incomplete sessions only)`);
  } catch (error) {
    console.error(`❌ Failed to recalculate scheduledHours for course ${courseId}:`, error);
  }
}

const sessionSchema = z.object({
  courseId: z.string().optional(),
  studyBlockId: z.string(),
  date: z.string(),
  startTime: z.string(),
  endDate: z.string().optional(),
  endTime: z.string(),
  durationMinutes: z.number(),
  notes: z.string().optional(),
  googleEventId: z.string().optional(),
  googleCalendarId: z.string().optional(),
});

// Get all sessions for user
router.get('/', (req: AuthRequest, res) => {
  try {
    const sessions = dbWrapper.prepare(`
      SELECT * FROM scheduled_sessions WHERE user_id = ? ORDER BY date DESC
    `).all(req.user!.userId);

    // Add recurrence patterns
    const sessionsWithRecurrence = sessions.map((session: any) => {
      const recurrence = dbWrapper.prepare('SELECT * FROM recurrence_patterns WHERE session_id = ?').get(session.id) as any;
      if (recurrence) {
        return {
          ...session,
          completed: session.completed === 1,
          isRecurrenceException: session.is_recurrence_exception === 1,
          recurrence: {
            rrule: recurrence.rrule,
            dtstart: recurrence.dtstart,
            until: recurrence.until,
            count: recurrence.count,
            exdates: recurrence.exdates ? JSON.parse(recurrence.exdates) : [],
          },
        };
      }
      return {
        ...session,
        completed: session.completed === 1,
        isRecurrenceException: session.is_recurrence_exception === 1,
      };
    });

    res.json(sessionsWithRecurrence);
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create session
router.post('/', (req: AuthRequest, res) => {
  try {
    const data = sessionSchema.parse(req.body);
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    dbWrapper.prepare(`
      INSERT INTO scheduled_sessions (
        id, user_id, course_id, study_block_id, date, start_time,
        end_date, end_time, duration_minutes, completed, completion_percentage,
        notes, last_modified, google_event_id, google_calendar_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)
    `).run(
      sessionId,
      req.user!.userId,
      data.courseId || null,
      data.studyBlockId,
      data.date,
      data.startTime,
      data.endDate || null,
      data.endTime,
      data.durationMinutes,
      data.notes || null,
      now,
      data.googleEventId || null,
      data.googleCalendarId || null
    );

    // Handle recurrence if provided
    if (req.body.recurrence) {
      const { rrule, dtstart, until, count, exdates } = req.body.recurrence;
      dbWrapper.prepare(`
        INSERT INTO recurrence_patterns (session_id, rrule, dtstart, until, count, exdates)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        sessionId,
        rrule,
        dtstart,
        until || null,
        count || null,
        exdates ? JSON.stringify(exdates) : null
      );
    }

    // Recalculate scheduledHours for the course
    if (data.courseId) {
      recalculateScheduledHours(data.courseId, req.user!.userId);
    }

    const session = dbWrapper.prepare('SELECT * FROM scheduled_sessions WHERE id = ?').get(sessionId);
    res.status(201).json(session);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Create session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update session
router.put('/:id', (req: AuthRequest, res) => {
  try {
    const session = dbWrapper.prepare(`
      SELECT * FROM scheduled_sessions WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user!.userId);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const updates: string[] = [];
    const values: any[] = [];

    // Build dynamic update query
    const allowedFields = [
      'courseId', 'studyBlockId', 'date', 'startTime', 'endDate', 'endTime',
      'durationMinutes', 'completed', 'completionPercentage', 'notes',
      'googleEventId', 'googleCalendarId'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        const dbField = field.replace(/([A-Z])/g, '_$1').toLowerCase();
        updates.push(`${dbField} = ?`);
        values.push(req.body[field]);
      }
    });

    updates.push('last_modified = ?');
    values.push(Date.now());

    values.push(req.params.id, req.user!.userId);

    dbWrapper.prepare(`
      UPDATE scheduled_sessions SET ${updates.join(', ')} WHERE id = ? AND user_id = ?
    `).run(...values);

    // Update recurrence if provided
    if (req.body.recurrence) {
      const { rrule, dtstart, until, count, exdates } = req.body.recurrence;
      dbWrapper.prepare(`
        INSERT OR REPLACE INTO recurrence_patterns (session_id, rrule, dtstart, until, count, exdates)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        req.params.id,
        rrule,
        dtstart,
        until || null,
        count || null,
        exdates ? JSON.stringify(exdates) : null
      );
    }

    // Recalculate scheduledHours for old and new course assignments
    const oldCourseId = (session as any).course_id;
    const newCourseId = req.body.courseId;
    
    if (oldCourseId && oldCourseId !== newCourseId) {
      // Session moved away from old course
      recalculateScheduledHours(oldCourseId, req.user!.userId);
    }
    if (newCourseId) {
      // Session assigned to new course
      recalculateScheduledHours(newCourseId, req.user!.userId);
    }

    const updated = dbWrapper.prepare('SELECT * FROM scheduled_sessions WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (error) {
    console.error('Update session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete session
router.delete('/:id', (req: AuthRequest, res) => {
  try {
    // Get session before deleting to recalculate course hours
    const session = dbWrapper.prepare(`
      SELECT * FROM scheduled_sessions WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user!.userId) as any;

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const courseId = session.course_id;

    const result = dbWrapper.prepare(`
      DELETE FROM scheduled_sessions WHERE id = ? AND user_id = ?
    `).run(req.params.id, req.user!.userId);

    if (result.changes === 0) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Recalculate scheduledHours for the course
    if (courseId) {
      recalculateScheduledHours(courseId, req.user!.userId);
    }

    res.status(204).send();
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
