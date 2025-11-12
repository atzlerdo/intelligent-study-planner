import express from 'express';
import { z } from 'zod';
import { dbWrapper } from '../db.js';
import { authMiddleware, AuthRequest } from '../auth.js';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

const tokenSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  tokenExpiry: z.number().optional(),
  calendarId: z.string().optional(),
  googleEmail: z.string().optional(),
});

// Get user's Google Calendar token
router.get('/token', (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    
    const token = dbWrapper.prepare(`
      SELECT access_token, refresh_token, token_expiry, calendar_id, google_email, last_sync
      FROM google_calendar_tokens
      WHERE user_id = ?
    `).get(userId) as any;

    if (!token) {
      res.status(404).json({ error: 'No token found' });
      return;
    }

    res.json({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      tokenExpiry: token.token_expiry,
      calendarId: token.calendar_id,
      googleEmail: token.google_email,
      lastSync: token.last_sync,
    });
  } catch (error) {
    console.error('Get token error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Save/update user's Google Calendar token
router.post('/token', (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const data = tokenSchema.parse(req.body);
    
    const now = Date.now();
    const existing = dbWrapper.prepare('SELECT user_id FROM google_calendar_tokens WHERE user_id = ?').get(userId);

    if (existing) {
      // Update existing token
      dbWrapper.prepare(`
        UPDATE google_calendar_tokens
        SET access_token = ?, refresh_token = ?, token_expiry = ?, calendar_id = ?, google_email = ?, updated_at = ?
        WHERE user_id = ?
      `).run(
        data.accessToken,
        data.refreshToken || null,
        data.tokenExpiry || null,
        data.calendarId || null,
        data.googleEmail || null,
        now,
        userId
      );
    } else {
      // Insert new token
      dbWrapper.prepare(`
        INSERT INTO google_calendar_tokens (user_id, access_token, refresh_token, token_expiry, calendar_id, google_email, last_sync, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        data.accessToken,
        data.refreshToken || null,
        data.tokenExpiry || null,
        data.calendarId || null,
        data.googleEmail || null,
        null,
        now,
        now
      );
    }

    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Save token error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete user's Google Calendar token (disconnect)
router.delete('/token', (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    
    dbWrapper.prepare('DELETE FROM google_calendar_tokens WHERE user_id = ?').run(userId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete token error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update last sync timestamp
router.patch('/token/last-sync', (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const now = Date.now();
    
    dbWrapper.prepare(`
      UPDATE google_calendar_tokens
      SET last_sync = ?, updated_at = ?
      WHERE user_id = ?
    `).run(now, now, userId);
    
    res.json({ success: true, lastSync: now });
  } catch (error) {
    console.error('Update last sync error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
