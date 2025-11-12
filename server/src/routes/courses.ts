import express from 'express';
import { z } from 'zod';
import { dbWrapper } from '../db.js';
import { authMiddleware, AuthRequest } from '../auth.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// Base schema for creating/updating core editable fields
const courseSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['written-exam', 'project']),
  ects: z.number().positive(),
  estimatedHours: z.number().positive(),
  estimatedEndDate: z.string(),
  examDate: z.string().optional(),
  semester: z.number().optional(),
});

// Extended migration/update extras (NOT validated via courseSchema to keep backwards compatibility)
// These are optional numeric/status fields we may set during data migration from the legacy client state.
const extraUpdatableFields = [
  'completedHours', // maps to completed_hours
  'scheduledHours', // maps to scheduled_hours
  'progress',       // maps to progress
  'status',         // maps to status (planned|active|completed)
] as const;

// Get all courses for user
router.get('/', (req: AuthRequest, res) => {
  try {
    const courses = dbWrapper.prepare(`
      SELECT * FROM courses WHERE user_id = ? ORDER BY created_at DESC
    `).all(req.user!.userId);

    // Fetch milestones for each course
    const coursesWithMilestones = courses.map((course: any) => {
      const milestones = dbWrapper.prepare('SELECT * FROM milestones WHERE course_id = ?').all(course.id);
      return {
        ...course,
        milestones,
        completed: course.completed === 1,
      };
    });

    res.json(coursesWithMilestones);
  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single course
router.get('/:id', (req: AuthRequest, res) => {
  try {
    const course = dbWrapper.prepare(`
      SELECT * FROM courses WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user!.userId) as any;

    if (!course) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }

    const milestones = dbWrapper.prepare('SELECT * FROM milestones WHERE course_id = ?').all(course.id);

    res.json({ ...course, milestones });
  } catch (error) {
    console.error('Get course error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create course
router.post('/', (req: AuthRequest, res) => {
  try {
    const data = courseSchema.parse(req.body);
    const courseId = `course-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    dbWrapper.prepare(`
      INSERT INTO courses (
        id, user_id, name, type, ects, estimated_hours,
        completed_hours, scheduled_hours, progress, status,
        estimated_end_date, exam_date, semester, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 'planned', ?, ?, ?, ?, ?)
    `).run(
      courseId,
      req.user!.userId,
      data.name,
      data.type,
      data.ects,
      data.estimatedHours,
      data.estimatedEndDate,
      data.examDate || null,
      data.semester || null,
      new Date().toISOString(),
      now
    );

    const course = dbWrapper.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
    res.status(201).json({ ...course, milestones: [] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Create course error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update course
router.put('/:id', (req: AuthRequest, res) => {
  try {
    const course = dbWrapper.prepare(`
      SELECT * FROM courses WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user!.userId);

    if (!course) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }

  const data = courseSchema.partial().parse(req.body);
    const now = Date.now();

    const updates: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.type !== undefined) {
      updates.push('type = ?');
      values.push(data.type);
    }
    if (data.ects !== undefined) {
      updates.push('ects = ?');
      values.push(data.ects);
    }
    if (data.estimatedHours !== undefined) {
      updates.push('estimated_hours = ?');
      values.push(data.estimatedHours);
    }
    if (data.estimatedEndDate !== undefined) {
      updates.push('estimated_end_date = ?');
      values.push(data.estimatedEndDate);
    }
    if (data.examDate !== undefined) {
      updates.push('exam_date = ?');
      values.push(data.examDate);
    }
    if (data.semester !== undefined) {
      updates.push('semester = ?');
      values.push(data.semester);
    }

    // Migration / extended fields (only if explicitly provided)
    // We intentionally do minimal validation here (type/enum) to avoid breaking existing clients.
    extraUpdatableFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        const value = (req.body as any)[field];
        if (field === 'status') {
          if (value !== 'planned' && value !== 'active' && value !== 'completed') {
            return; // skip invalid
          }
          updates.push('status = ?');
          values.push(value);
        } else if (typeof value === 'number' && !Number.isNaN(value)) {
          const dbField = field.replace(/([A-Z])/g, '_$1').toLowerCase(); // camelCase -> snake_case
          updates.push(`${dbField} = ?`);
          values.push(value);
        }
      }
    });

    // Always update timestamp
    updates.push('updated_at = ?');
    values.push(now);

    values.push(req.params.id, req.user!.userId);

    dbWrapper.prepare(`
      UPDATE courses SET ${updates.join(', ')} WHERE id = ? AND user_id = ?
    `).run(...values);

    const updated = dbWrapper.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id) as any;
    const milestones = dbWrapper.prepare('SELECT * FROM milestones WHERE course_id = ?').all(req.params.id);

    res.json({ ...updated, milestones });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Update course error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete course
router.delete('/:id', (req: AuthRequest, res) => {
  try {
    const result = dbWrapper.prepare(`
      DELETE FROM courses WHERE id = ? AND user_id = ?
    `).run(req.params.id, req.user!.userId);

    if (result.changes === 0) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error('Delete course error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
