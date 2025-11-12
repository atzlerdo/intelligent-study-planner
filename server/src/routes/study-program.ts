import express from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../auth.js';
import { dbWrapper } from '../db.js';

const router = express.Router();
router.use(authMiddleware);

// GET current user's study program
router.get('/', (req: AuthRequest, res) => {
  try {
    const row = dbWrapper
      .prepare('SELECT total_ects, completed_ects, hours_per_ects FROM study_programs WHERE user_id = ?')
      .get(req.user!.userId) as any;

    if (!row) {
      // Initialize if missing (safety)
      dbWrapper
        .prepare('INSERT INTO study_programs (user_id, total_ects, completed_ects, hours_per_ects) VALUES (?, 180, 0, 27.5)')
        .run(req.user!.userId);
      return res.json({ totalECTS: 180, completedECTS: 0, hoursPerECTS: 27.5 });
    }

    res.json({
      totalECTS: row.total_ects,
      completedECTS: row.completed_ects,
      hoursPerECTS: row.hours_per_ects,
    });
  } catch (error) {
    console.error('Study program GET error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const updateSchema = z.object({
  totalECTS: z.number().int().positive().optional(),
  completedECTS: z.number().int().min(0).optional(),
  hoursPerECTS: z.number().min(1).max(100).optional(),
});

// PUT update current user's study program
router.put('/', (req: AuthRequest, res) => {
  try {
    const data = updateSchema.parse(req.body);
    const updates: string[] = [];
    const values: any[] = [];

    if (data.totalECTS !== undefined) {
      updates.push('total_ects = ?');
      values.push(data.totalECTS);
    }
    if (data.completedECTS !== undefined) {
      updates.push('completed_ects = ?');
      values.push(data.completedECTS);
    }
    if (data.hoursPerECTS !== undefined) {
      updates.push('hours_per_ects = ?');
      values.push(data.hoursPerECTS);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.user!.userId);
    dbWrapper
      .prepare(`UPDATE study_programs SET ${updates.join(', ')} WHERE user_id = ?`)
      .run(...values);

    const row = dbWrapper
      .prepare('SELECT total_ects, completed_ects, hours_per_ects FROM study_programs WHERE user_id = ?')
      .get(req.user!.userId) as any;

    res.json({ totalECTS: row.total_ects, completedECTS: row.completed_ects, hoursPerECTS: row.hours_per_ects });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    console.error('Study program PUT error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
