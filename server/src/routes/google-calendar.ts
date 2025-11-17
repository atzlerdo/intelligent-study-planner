/**
 * ============================================================================
 * GOOGLE CALENDAR TOKEN API ROUTES
 * ============================================================================
 * 
 * Backend routes for managing user-specific Google Calendar OAuth tokens.
 * All routes require JWT authentication (user must be logged in).
 * 
 * Database Table: google_calendar_tokens
 * - user_id (PK, FK to users.id)
 * - access_token (OAuth access token)
 * - refresh_token (for token renewal)
 * - token_expiry (timestamp when token expires)
 * - calendar_id (Google Calendar ID for "Intelligent Study Planner" calendar)
 * - google_email (User's Google account email)
 * - last_sync (timestamp of last successful sync)
 * 
 * Security:
 * - Tokens stored per user (isolated by user_id)
 * - JWT auth required for all operations
 * - 404 response if user hasn't connected (prevents info leak)
 * 
 * Routes:
 * - GET /api/google-calendar/token - Retrieve user's token
 * - POST /api/google-calendar/token - Save/update token (upsert)
 * - DELETE /api/google-calendar/token - Remove token (disconnect)
 * - PATCH /api/google-calendar/token/last-sync - Update sync timestamp
 */

import express from 'express';
import { z } from 'zod';
import { dbWrapper } from '../db.js';
import { authMiddleware, AuthRequest } from '../auth.js';

const router = express.Router();

// All routes require authentication (JWT token in Authorization header)
router.use(authMiddleware);

/**
 * Zod schema for validating Google Calendar token data
 * Only accessToken is required; other fields are optional
 */
const tokenSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  tokenExpiry: z.number().optional(),
  calendarId: z.string().optional(),
  googleEmail: z.string().optional(),
});

/**
 * GET /api/google-calendar/token
 * Retrieve current user's Google Calendar token
 * 
 * @returns 200 with token data if exists
 * @returns 404 if user hasn't connected Google Calendar
 */
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

    // Return token data with camelCase field names
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

/**
 * POST /api/google-calendar/token
 * Save or update current user's Google Calendar token (upsert operation)
 * 
 * If token exists for user, updates it. Otherwise creates new record.
 * 
 * @body tokenSchema - Token data (accessToken required, others optional)
 * @returns 200 with success message
 */
router.post('/token', (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const data = tokenSchema.parse(req.body);
    
    const now = Date.now();
    const existing = dbWrapper.prepare('SELECT user_id FROM google_calendar_tokens WHERE user_id = ?').get(userId);

    if (existing) {
      // Update existing token (user reconnecting or refreshing token)
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

/**
 * DELETE /api/google-calendar/token
 * Disconnect Google Calendar for current user
 * 
 * Deletes token from database. Does NOT delete events from Google Calendar,
 * only removes the connection.
 * 
 * @returns 200 with success message
 */
router.delete('/token', (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    
    // Delete token record (CASCADE will not affect calendar events)
    dbWrapper.prepare('DELETE FROM google_calendar_tokens WHERE user_id = ?').run(userId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete token error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/google-calendar/token/last-sync
 * Update last sync timestamp after successful sync
 * 
 * Called by GoogleCalendarSyncService after each sync to track sync history.
 * Used to show "last synced X minutes ago" in UI.
 * 
 * @returns 200 with updated lastSync timestamp
 */
router.patch('/token/last-sync', (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const now = Date.now();
    
    // Update last_sync and updated_at timestamps
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
