/**
 * ============================================================================
 * GOOGLE CALENDAR INTEGRATION
 * ============================================================================
 * 
 * Handles bidirectional synchronization between the study planner and Google Calendar.
 * 
 * ARCHITECTURE:
 * - Creates dedicated "Intelligent Study Planner" calendar in user's Google account
 * - Uses extendedProperties to store app metadata (sessionId, courseId, appSource)
 * - Tracks sync state via localStorage (event hashes, sync tokens, remote cache)
 * - Supports recurring events via RRule (RFC 5545 standard)
 * 
 * SYNC STRATEGY:
 * 1. Push: Convert app sessions → Google Calendar events (create/update/delete)
 * 2. Pull: Import Google Calendar events → app sessions (merge, not replace)
 * 3. Conflict resolution: Google Calendar is source of truth for imported events
 * 
 * SYNC OPTIMIZATION:
 * - Incremental sync using sync tokens (only fetch changes since last sync)
 * - Event hashing to detect changes (skip updates if hash unchanged)
 * - Limited time horizon (30 days past, 180 days future) for faster sync
 * - Remote cache to track Google Calendar state
 * 
 * RECURRING EVENTS:
 * - Parses RRULE from Google Calendar events
 * - Stores as RecurringEventSeries with overrides for exceptions
 * - Handles instance modifications (changed times, canceled occurrences)
 * 
 * TODO: Make localStorage keys user-specific (currently global per browser)
 * This means switching browsers/users on same machine shares cache - security issue.
 * 
 * @see https://developers.google.com/calendar/api/v3/reference
 */

// Note: Blocker functionality has been replaced by unassigned sessions (ScheduledSession with no courseId)
// This stub function is kept for backwards compatibility but is no longer used
/* eslint-disable @typescript-eslint/no-explicit-any */
import { RRule, RRuleSet, rrulestr } from 'rrule';
import type { ScheduledSession, Course, RecurringEventSeries, SyncStats } from '../types';

declare const gapi: any;

/**
 * Google Calendar event structure
 * Extended properties store app-specific metadata for tracking session ownership
 */
interface CalendarEvent {
  id?: string;                    // Google-generated event ID
  summary: string;                // Event title (course name)
  description?: string;           // Event notes
  start: {
    dateTime: string;             // ISO 8601 datetime
    timeZone: string;             // IANA timezone (e.g., "Europe/Berlin")
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  extendedProperties?: {
    private?: {
      sessionId?: string;         // App session ID for bidirectional linking
      courseId?: string;          // Course ID (null for unassigned sessions)
      appSource?: string;         // Always "intelligent-study-planner"
      originalTitle?: string;     // Preserve original event title for non-app events
      originalDescription?: string;
    };
  };
}

// Dedicated calendar name for app events
const STUDY_CALENDAR_NAME = 'Intelligent Study Planner';
let studyCalendarId: string | null = null;

/**
 * Sync time horizon configuration
 * Smaller windows = faster sync but less historical data
 */
const IMPORT_PAST_DAYS = 30;      // Look back 1 month
const IMPORT_FUTURE_DAYS = 180;   // Look ahead 6 months

// ============================================================================
// LOCALSTORAGE CACHE HELPERS
// ============================================================================
// TODO: Make these user-specific by including userId in keys
// Currently these are browser-global, causing cache leakage across users

/**
 * Get value from localStorage with JSON parsing
 * @returns Parsed value or fallback if not found/invalid
 */
function lsGet<T = any>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Set value in localStorage with JSON serialization
 * Silently fails if storage is unavailable
 */
function lsSet(key: string, value: any) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota errors */
  }
}

/**
 * LocalStorage key generators
 * These should include userId to prevent cache sharing across users
 */
function eventHashKey(calendarId: string) {
  return `googleCalendarEventHash::${calendarId}`;
}
function syncTokenKey(calendarId: string) {
  return `googleCalendarSyncToken::${calendarId}`;
}
function remoteCacheKey(calendarId: string) {
  return `googleCalendarRemoteCache::${calendarId}`;
}
function syncStatsKey(calendarId: string) {
  return `googleCalendarSyncStats::${calendarId}`;
}

/**
 * Fast hash function (FNV-1a algorithm)
 * Used to detect event changes without storing full event data
 * 
 * @param s String to hash (usually JSON-serialized event)
 * @returns 8-character hex hash
 */
function hashString(s: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

// Parse recurring event and store as series + overrides
function parseRecurringEvent(event: any): RecurringEventSeries | null {
  if (!event.recurrence || event.recurrence.length === 0) return null;
  
  // Find RRULE in recurrence array (typically first item)
  const rruleLine = event.recurrence.find((line: string) => line.startsWith('RRULE:'));
  if (!rruleLine) return null;
  
  const startDateTime = event.start?.dateTime ? new Date(event.start.dateTime) : null;
  if (!startDateTime) return null;
  
  const endDateTime = event.end?.dateTime ? new Date(event.end.dateTime) : null;
  if (!endDateTime) return null;
  
  const startTime = startDateTime.toTimeString().slice(0, 5);
  const endTime = endDateTime.toTimeString().slice(0, 5);
  const durationMinutes = Math.floor((endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60));
  
  // Extract UNTIL if present in RRULE (for validation/display, rrule library will parse it)
  const untilMatch = rruleLine.match(/UNTIL=([^;]+)/);
  let until: string | undefined = undefined;
  if (untilMatch) {
    try {
      // Handle both date-only (YYYYMMDD) and datetime (YYYYMMDDTHHMMSSZ) formats
      const untilStr = untilMatch[1];
      let untilDate: Date;
      
      if (untilStr.includes('T')) {
        // DateTime format: 20251231T235959Z
        const year = parseInt(untilStr.substring(0, 4));
        const month = parseInt(untilStr.substring(4, 6)) - 1;
        const day = parseInt(untilStr.substring(6, 8));
        untilDate = new Date(Date.UTC(year, month, day));
      } else {
        // Date-only format: 20251231
        const year = parseInt(untilStr.substring(0, 4));
        const month = parseInt(untilStr.substring(4, 6)) - 1;
        const day = parseInt(untilStr.substring(6, 8));
        untilDate = new Date(Date.UTC(year, month, day));
      }
      
      until = untilDate.toISOString().split('T')[0];
    } catch (e) {
      console.warn(`Failed to parse UNTIL date: ${untilMatch[1]}`, e);
    }
  }
  
  // Parse EXDATE lines (excluded dates)
  const exdates: string[] = [];
  event.recurrence
    .filter((line: string) => line.startsWith('EXDATE'))
    .forEach((line: string) => {
      // EXDATE can be in format: EXDATE;TZID=America/New_York:20251224T100000
      // or EXDATE:20251224T100000Z
      const match = line.match(/EXDATE[^:]*:(.+)/);
      if (match) {
        const dates = match[1].split(',');
        dates.forEach((d: string) => {
          try {
            // Parse various date formats
            let exDate: Date;
            if (d.length === 8) {
              // YYYYMMDD format
              const year = parseInt(d.substring(0, 4));
              const month = parseInt(d.substring(4, 6)) - 1;
              const day = parseInt(d.substring(6, 8));
              exDate = new Date(year, month, day);
            } else if (d.includes('T')) {
              // Full datetime format
              exDate = new Date(d.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6'));
            } else {
              exDate = new Date(d);
            }
            exdates.push(exDate.toISOString().split('T')[0]);
          } catch (e) {
            console.warn(`Failed to parse EXDATE: ${d}`, e);
          }
        });
      }
    });
  
  return {
    id: event.id,
    courseId: event.extendedProperties?.private?.courseId,
    rrule: rruleLine.replace('RRULE:', ''),
    startTime,
    endTime,
    durationMinutes,
    dtstart: startDateTime.toISOString().split('T')[0],
    until,
    exdates,
    overrides: {},
    googleCalendarId: event.organizer?.email,
    originalTitle: event.extendedProperties?.private?.originalTitle || event.summary || '',
    originalDescription: event.extendedProperties?.private?.originalDescription || event.description || '',
    lastModified: event.updated ? new Date(event.updated).getTime() : 0,
  };
}

// Check if an event is a recurrence override (has recurringEventId)
function isRecurrenceOverride(event: any): boolean {
  return !!event.recurringEventId;
}

// Small helper to surface detailed HTTP errors from Google APIs with retry logic
async function fetchJson(url: string, options: RequestInit = {}, retries = 3): Promise<any> {
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      
      if (!res.ok) {
        // Determine if error is retryable
        const isRetryable = res.status === 429 || res.status >= 500;
        const isLastAttempt = attempt === retries;
        
        let body: any = undefined;
        try {
          const text = await res.text();
          try { body = JSON.parse(text); } catch { body = text; }
        } catch {
          // ignore
        }
        const details = typeof body === 'string' ? body : JSON.stringify(body);
        
        // If retryable and not last attempt, wait and retry with exponential backoff
        if (isRetryable && !isLastAttempt) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000); // Max 10s
          console.warn(`⚠️ Google API ${res.status}, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${retries + 1})`);
          await delay(backoffMs);
          continue;
        }
        
        throw new Error(`Google API HTTP ${res.status} ${res.statusText} - ${details}`);
      }
      // Some Google APIs (e.g., DELETE) return 204 No Content
      if (res.status === 204) {
        return null;
      }
      
      // In rare cases 200/202 may also return empty body
      const text = await res.text();
      if (!text) {
        return null;
      }
      try {
        return JSON.parse(text);
      } catch {
        // Fallback to raw text if not JSON
        return text;
      }
    } catch (err) {
      // Network errors or other exceptions
      if (attempt === retries) {
        throw err;
      }
      // Retry network errors with backoff
      const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);
      console.warn(`⚠️ Network error, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${retries + 1}):`, err);
      await delay(backoffMs);
    }
  }
  
  throw new Error('Retry logic failed unexpectedly');
}

/** Validate the OAuth access token before making Calendar calls */
export async function validateAccessToken(accessToken: string): Promise<{valid: boolean; error?: string}> {
  try {
    // tokeninfo is public unauthenticated endpoint to validate tokens
    const url = `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`;
    const data = await fetchJson(url);
    // Successful response includes 'aud' and 'scope'
    if (!data || (data as any).error_description) {
      return { valid: false, error: (data as any).error_description || 'Invalid token' };
    }
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : 'Token validation failed' };
  }
}

/**
 * Initialize Google Calendar API
 */
export function initializeGoogleCalendar(apiKey: string): void {
  gapi.load('client', async () => {
    await gapi.client.init({
      apiKey: apiKey,
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'],
    });
  });
}

/**
 * Clear all Google Calendar sync cache and state
 * Use this to force a complete fresh sync
 */
export function clearGoogleCalendarCache(): void {
  const keysToRemove = [
    'googleCalendarSyncedIds',
    'googleCalendarRecentlyDeleted',
    'googleCalendarLastSync'
  ];
  
  // Remove known keys
  keysToRemove.forEach(key => {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.error(`Failed to remove ${key}:`, e);
    }
  });
  
  // Remove all googleCalendar* keys
  try {
    const allKeys = Object.keys(localStorage);
    allKeys.forEach(key => {
      if (key.startsWith('googleCalendar')) {
        localStorage.removeItem(key);
        console.log(`🧹 Cleared: ${key}`);
      }
    });
    console.log('✅ Google Calendar cache cleared');
  } catch (e) {
    console.error('Failed to clear Google Calendar cache:', e);
  }
}

/**
 * Get or create dedicated study calendar
 */
async function getOrCreateStudyCalendar(accessToken: string): Promise<string> {
  if (studyCalendarId) return studyCalendarId;

  try {
    // Check if calendar already exists
    const data = await fetchJson('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const existingCalendar = data.items?.find(
      (cal: any) => cal.summary === STUDY_CALENDAR_NAME
    );

    if (existingCalendar) {
      studyCalendarId = existingCalendar.id;
      return existingCalendar.id;
    }

    // Create new calendar
    const newCalendar = await fetchJson('https://www.googleapis.com/calendar/v3/calendars', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: STUDY_CALENDAR_NAME,
        description: 'Study sessions from Intelligent Study Planner',
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });
    studyCalendarId = newCalendar.id;
    return newCalendar.id;
  } catch (error) {
    console.error('Error getting/creating study calendar:', error);
    throw error;
  }
}

/**
 * List all events within a time window with recurrence expanded
 * - singleEvents=true expands recurring events into instances
 * - orderBy=startTime returns them in chronological order
 * - handles pagination to return complete result set
 */
async function listAllEvents(
  calendarId: string,
  accessToken: string,
  opts?: { timeMin?: string; timeMax?: string; fields?: string; singleEvents?: boolean }
): Promise<any[]> {
  const items: any[] = [];
  let pageToken: string | undefined = undefined;
  const params: Record<string, string> = {
    maxResults: '2500',
  };
  // Only expand recurring events if explicitly requested (for backwards compatibility with sync logic)
  if (opts?.singleEvents !== undefined) {
    params.singleEvents = String(opts.singleEvents);
    if (opts.singleEvents) params.orderBy = 'startTime';
  }
  if (opts?.timeMin) params.timeMin = opts.timeMin;
  if (opts?.timeMax) params.timeMax = opts.timeMax;
  if (opts?.fields) params.fields = opts.fields;

  do {
    const searchParams = new URLSearchParams(params);
    if (pageToken) searchParams.set('pageToken', pageToken);
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId
    )}/events?${searchParams.toString()}`;
    const data = await fetchJson(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (Array.isArray(data.items)) items.push(...data.items);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return items;
}

/**
 * Incremental events fetch using syncToken, returns {items, nextSyncToken}.
 */
async function listEventsIncremental(
  calendarId: string,
  accessToken: string,
  syncToken: string
): Promise<{ items: any[]; nextSyncToken?: string }> {
  const items: any[] = [];
  let pageToken: string | undefined = undefined;
  let nextSyncToken: string | undefined = undefined;
  do {
    const params = new URLSearchParams({
      syncToken,
      maxResults: '2500',
      fields: 'items(id,status,summary,description,start,end,updated,recurrence,recurringEventId,originalStartTime,extendedProperties/private),nextSyncToken,nextPageToken',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`;
    const data = await fetchJson(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (Array.isArray(data.items)) items.push(...data.items);
    nextSyncToken = data.nextSyncToken || nextSyncToken;
    pageToken = data.nextPageToken;
  } while (pageToken);
  return { items, nextSyncToken };
}

/**
 * Convert ScheduledSession to Google Calendar event
 */
function sessionToCalendarEvent(session: ScheduledSession, course: Course | undefined): CalendarEvent & { recurrence?: string[] } {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  // Handle multi-day sessions
  const endDate = session.endDate || session.date;
  
  // Title logic:
  // - Assigned to course: Show course name in both app and Google Calendar
  // - Unassigned: Keep as "📚 Study Session" in both app and Google Calendar (don't overwrite)
  const summary = course ? `📚 ${course.name}` : '📚 Study Session';
  
  // Description logic:
  // - Assigned to course: Use app notes
  // - Unassigned: Keep empty (no description)
  const description = course ? (session.notes || undefined) : undefined;
  
  const event: CalendarEvent & { recurrence?: string[] } = {
    summary,
    description,
    start: {
      dateTime: `${session.date}T${session.startTime}:00`,
      timeZone: timeZone,
    },
    end: {
      dateTime: `${endDate}T${session.endTime}:00`,
      timeZone: timeZone,
    },
    extendedProperties: {
      private: {
        sessionId: session.id,
        courseId: session.courseId,
        appSource: 'intelligent-study-planner',
        // Store original title/description to preserve user's input
        originalTitle: session.originalTitle,
        originalDescription: session.originalDescription,
      },
    },
  };
  
  // Add recurrence pattern if this is a recurring session
  if (session.recurrence) {
    event.recurrence = [`RRULE:${session.recurrence.rrule}`];
    console.log(`🔁 Adding recurrence to event for session ${session.id}:`, {
      rrule: session.recurrence.rrule,
      dtstart: session.recurrence.dtstart,
      until: session.recurrence.until,
      count: session.recurrence.count,
      exdates: session.recurrence.exdates
    });
    
    // Add EXDATE if there are excluded dates
    if (session.recurrence.exdates && session.recurrence.exdates.length > 0) {
      const exdateStr = session.recurrence.exdates
        .map(d => d.replace(/-/g, ''))
        .join(',');
      event.recurrence.push(`EXDATE:${exdateStr}`);
    }
  }
  
  return event;
}

/**
 * Sync sessions to Google Calendar (one-way: app -> calendar)
 */
export async function syncSessionsToGoogleCalendar(
  sessions: ScheduledSession[],
  courses: Course[],
  accessToken: string
): Promise<{ success: boolean; syncedCount: number; stats: SyncStats; error?: string }> {
  const stats: SyncStats = {
    lastSyncTime: Date.now(),
    lastSyncSuccess: false,
    totalSynced: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    deleted: 0,
    recurring: 0,
  };
  
  try {
    const calendarId = await getOrCreateStudyCalendar(accessToken);

  // Get existing events from our calendar within a bounded window
  const now = new Date();
  const timeMin = new Date(now.getTime() - IMPORT_PAST_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(now.getTime() + IMPORT_FUTURE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    // Use singleEvents: false to get recurring masters, not expanded instances
    const existingEvents = await listAllEvents(calendarId, accessToken, { timeMin, timeMax, fields: 'items(id,extendedProperties/private,recurrence),nextPageToken', singleEvents: false });
    
    // Build lookup maps for existing events
    const existingEventsBySessionId = new Map();
    const existingEventsByGoogleId = new Map();
    
    for (const event of existingEvents) {
      const googleId = (event as any).id;
      const sessionId = (event as any).extendedProperties?.private?.sessionId;
      
      // Map by Google event ID (always available)
      existingEventsByGoogleId.set(googleId, event);
      
      // Map by session ID if available (app-created events)
      if (sessionId) {
        existingEventsBySessionId.set(sessionId, event);
      } else {
        // For Google-created events without sessionId property,
        // use Google event ID as the session ID in the map
        // This allows us to find them when session.id === Google event ID
        existingEventsBySessionId.set(googleId, event);
      }
    }

    let syncedCount = 0;

    // Load local hashes to skip unchanged updates
    const hashes: Record<string, string> = lsGet(eventHashKey(calendarId), {});

    // Filter out expanded instances - only sync recurring masters and standalone sessions
    // Expanded instances have recurringEventId but no recurrence property
    const sessionsToSync = sessions.filter(session => {
      const isExpandedInstance = session.recurringEventId && !session.recurrence;
      if (isExpandedInstance) {
        console.log(`⏭️ Skipping sync of expanded instance ${session.id} (master: ${session.recurringEventId})`);
        return false;
      }
      return true;
    });
    
    console.log(`📤 Syncing ${sessionsToSync.length} sessions to Google Calendar (${sessions.length - sessionsToSync.length} expanded instances skipped)`, {
      recurring: sessionsToSync.filter(s => s.recurrence).length,
      standalone: sessionsToSync.filter(s => !s.recurrence).length,
      sessionIds: sessionsToSync.map(s => s.id)
    });

    // Sync each session
    for (const session of sessionsToSync) {
      const course = courses.find((c) => c.id === session.courseId);
      // Allow syncing unassigned sessions (blockers) - they don't need a course
      if (session.courseId && !course) {
        console.warn(`Session ${session.id} references unknown course ${session.courseId}, skipping`);
        continue;
      }

      // Track recurring sessions
      if (session.recurrence) {
        stats.recurring++;
      }

      const eventData = sessionToCalendarEvent(session, course);
      // Build a canonical string for hashing (include recurrence for recurring sessions)
      const canonical = JSON.stringify({
        summary: eventData.summary,
        description: eventData.description || '',
        start: eventData.start.dateTime,
        end: eventData.end.dateTime,
        courseId: session.courseId || '',
        recurrence: eventData.recurrence || null
      });
      const newHash = hashString(canonical);

      // Try to find existing event by sessionId first (for app-created events with sessionId property)
      let existingEvent = existingEventsBySessionId.get(session.id);
      
      // If not found and session has googleEventId, look it up by Google event ID
      // This handles Google-imported sessions where session.id == Google event ID
      if (!existingEvent && session.googleEventId) {
        existingEvent = existingEventsByGoogleId.get(session.googleEventId);
        console.log(`📎 Found existing event by session.googleEventId for session ${session.id}: ${session.googleEventId}`);
      }
      
      // Also try looking up by session.id directly in case it IS a Google event ID
      if (!existingEvent) {
        existingEvent = existingEventsByGoogleId.get(session.id);
        if (existingEvent) {
          console.log(`📎 Found existing event by session.id (Google event ID) for session ${session.id}`);
        }
      }

      // If nothing changed and event exists, skip network call
      if (existingEvent && hashes[session.id] === newHash) {
        stats.skipped++;
        continue;
      }

      try {
        if (existingEvent) {
          // Update existing event using PATCH
          console.log(`✏️ Updating existing event ${(existingEvent as any).id} for session ${session.id} (courseId: ${session.courseId || 'unassigned'})`);
          await fetchJson(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${(existingEvent as any).id}`,
            {
              method: 'PATCH',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(eventData),
            }
          );
          stats.updated++;
        } else {
          // Create new event and capture ID
          console.log(`➕ Creating new event for session ${session.id} (courseId: ${session.courseId || 'unassigned'})`);
          const created = await fetchJson(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(eventData),
            }
          );
          // Keep a back-reference for potential future lookups in this run
          if (created?.id) {
            existingEventsBySessionId.set(session.id, created);
            existingEventsByGoogleId.set(created.id, created);
          }
          stats.created++;
        }
        hashes[session.id] = newHash;
        syncedCount++;
      } catch (error) {
        console.error(`Error syncing session ${session.id}:`, error);
      }
    }

    // Persist hashes
    lsSet(eventHashKey(calendarId), hashes);

    // Delete events that no longer exist in our app
    const currentSessionIds = new Set(sessions.map((s) => s.id));
    
    console.log(`🔍 Checking for events to delete. Current sessions in app: ${Array.from(currentSessionIds).join(', ')}`);
    
  // Check all events in Google Calendar (now only masters, not expanded instances)
    for (const event of existingEvents) {
      const googleEventId = (event as any).id;
      const sessionIdProperty = (event as any).extendedProperties?.private?.sessionId;
      
      // Determine if this event should exist based on our app's sessions
      // Check both the sessionId property (for app-created events) and the Google event ID directly (for Google-imported events)
      let shouldExist = false;
      let matchedBy = '';
      
      if (sessionIdProperty && currentSessionIds.has(sessionIdProperty)) {
        // Event has sessionId property and that session exists in app
        shouldExist = true;
        matchedBy = `sessionId=${sessionIdProperty}`;
      } else if (currentSessionIds.has(googleEventId)) {
        // Session ID matches Google event ID directly (Google-imported event)
        shouldExist = true;
        matchedBy = `googleEventId=${googleEventId}`;
      }
      
      console.log(`  Event ${googleEventId} (sessionId=${sessionIdProperty || 'none'}): ${shouldExist ? 'EXISTS' : 'SHOULD DELETE'} (matched by: ${matchedBy || 'none'})`);

      // If event shouldn't exist, delete it
      if (!shouldExist) {
        try {
          await fetchJson(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${googleEventId}`,
            { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
          console.log(`🗑️ Successfully deleted event ${googleEventId} from Google Calendar`);
          stats.deleted++;
          // Remove any stored hash for the deleted session
          if (sessionIdProperty && hashes[sessionIdProperty]) {
            delete hashes[sessionIdProperty];
          }
          if (hashes[googleEventId]) {
            delete hashes[googleEventId];
          }
        } catch (error) {
          console.error(`❌ Error deleting event ${googleEventId}:`, error);
        }
      }
    }

    // Persist hashes after deletions cleanup
    lsSet(eventHashKey(calendarId), hashes);
    
    stats.totalSynced = syncedCount;
    stats.lastSyncSuccess = true;
    lsSet(syncStatsKey(calendarId), stats);

    return { success: true, syncedCount, stats };
  } catch (error) {
    console.error('Error syncing to Google Calendar:', error);
    stats.lastSyncSuccess = false;
    stats.lastSyncError = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      syncedCount: 0,
      stats,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Import events from Google Calendar back to app (two-way sync)
 */
export async function importEventsFromGoogleCalendar(
  accessToken: string
): Promise<{ success: boolean; events: ScheduledSession[]; error?: string }> {
  try {
    const calendarId = await getOrCreateStudyCalendar(accessToken);

    // Try incremental sync first using syncToken; on failure (HTTP 410) fall back to full window
    let items: any[] = [];
    let nextSyncToken: string | undefined = undefined;
    let didFullFetch = false;
    let fullFetchTimeMin: string | undefined;
    let fullFetchTimeMax: string | undefined;
    const storedToken = lsGet<string | null>(syncTokenKey(calendarId), null);
    if (storedToken) {
      try {
        const inc = await listEventsIncremental(calendarId, accessToken, storedToken);
        items = inc.items;
        nextSyncToken = inc.nextSyncToken;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/HTTP\s+410/.test(msg)) {
          throw e; // real error
        }
        // Token invalid, fall through to full fetch
      }
    }

    if (items.length === 0) {
      const now = new Date();
      const timeMin = new Date(now.getTime() - IMPORT_PAST_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const timeMax = new Date(now.getTime() + IMPORT_FUTURE_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const fields = 'items(id,status,summary,description,start,end,updated,recurrence,recurringEventId,originalStartTime,extendedProperties/private),nextSyncToken,nextPageToken';
      const fullItems = await listAllEvents(calendarId, accessToken, { timeMin, timeMax, fields });
      items = fullItems;
      didFullFetch = true;
      fullFetchTimeMin = timeMin;
      fullFetchTimeMax = timeMax;
      // Retrieve a sync token (light request)
      try {
        const params = new URLSearchParams({
          timeMin,
          timeMax,
          singleEvents: 'false', // Don't expand - we'll handle series ourselves
          maxResults: '1',
        });
        const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`;
        const data = await fetchJson(url, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (data?.nextSyncToken) nextSyncToken = data.nextSyncToken;
      } catch {
        // ignore
      }
    }

    // Load cache and apply delta/refresh
    const cache: Record<string, ScheduledSession> = lsGet(remoteCacheKey(calendarId), {});
    
    // Track exception instances (cancelled or modified recurring instances)
    const exceptionInstances: Record<string, ScheduledSession> = {};

  for (const event of items) {
      // Deletions or cancelled
      if (event.status === 'cancelled') {
        // Get session ID to look up in cache
        const sessionId = event.extendedProperties?.private?.sessionId || event.id;
        if (sessionId && cache[sessionId]) {
          console.log(`🗑️ Removing cancelled session ${sessionId} from cache`);
          delete cache[sessionId];
        }
        continue;
      }
      
      // Check if this is a recurring master event
      if (event.recurrence && !isRecurrenceOverride(event)) {
        const series = parseRecurringEvent(event);
        if (!series) continue;
        
        if (!(event.start?.dateTime && event.end?.dateTime)) continue;
        
        const startDateTime = new Date(event.start.dateTime);
        const endDateTime = new Date(event.end.dateTime);
        const startDate = startDateTime.toISOString().split('T')[0];
        const endDate = endDateTime.toISOString().split('T')[0];
        const startTime = startDateTime.toTimeString().slice(0, 5);
        const endTime = endDateTime.toTimeString().slice(0, 5);
        const durationMinutes = Math.floor((endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60));
        const lastModified = event.updated ? new Date(event.updated).getTime() : 0;
        // Use the Google event ID directly as session ID for imported events
        const sessionId = event.extendedProperties?.private?.sessionId || event.id;
        const courseId = event.extendedProperties?.private?.courseId;
        const originalTitle = event.extendedProperties?.private?.originalTitle || event.summary || '';
        const originalDescription = event.extendedProperties?.private?.originalDescription || event.description || '';
        
        // CRITICAL: Use session ID as cache key to prevent duplicates
        // If we use Google event ID, same session synced multiple times creates multiple cache entries
        cache[sessionId] = {
          id: sessionId,
          courseId,
          studyBlockId: '',
          date: startDate,
          endDate: startDate !== endDate ? endDate : undefined,
          startTime,
          endTime,
          durationMinutes,
          completed: false,
          completionPercentage: 0,
          notes: '',
          lastModified,
          googleEventId: event.id,
          googleCalendarId: calendarId,
          originalTitle,
          originalDescription,
          recurrence: {
            rrule: series.rrule,
            dtstart: series.dtstart,
            until: series.until,
            exdates: series.exdates,
          },
        } as ScheduledSession;
        
        console.log(`📅 Stored recurring session ${sessionId} (Google ID: ${event.id}) with RRULE: ${series.rrule}`);
        continue;
      }
      
      // Skip recurring event instances (not exceptions) - they'll be expanded from master
      // Instances have IDs like "masterid_20251112T140000Z" and recurringEventId set
      // but NO originalStartTime (exceptions have originalStartTime)
      if (event.recurringEventId && !event.originalStartTime) {
        console.log(`⏭️ Skipping recurring instance ${event.id} (will be expanded from master ${event.recurringEventId})`);
        continue;
      }
      
      // Check if this is an override/exception of a recurring event
      if (isRecurrenceOverride(event)) {
        const masterId = event.recurringEventId;
        const originalStart = event.originalStartTime?.dateTime;
        
        if (masterId && originalStart && event.start?.dateTime && event.end?.dateTime) {
          const startDateTime = new Date(event.start.dateTime);
          const endDateTime = new Date(event.end.dateTime);
          const instanceDate = new Date(originalStart).toISOString().split('T')[0];
          const startDate = startDateTime.toISOString().split('T')[0];
          const endDate = endDateTime.toISOString().split('T')[0];
          const startTime = startDateTime.toTimeString().slice(0, 5);
          const endTime = endDateTime.toTimeString().slice(0, 5);
          const durationMinutes = Math.floor((endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60));
          const lastModified = event.updated ? new Date(event.updated).getTime() : 0;
          // Use the Google event ID directly as session ID for imported events
          const sessionId = event.extendedProperties?.private?.sessionId || event.id;
          const courseId = event.extendedProperties?.private?.courseId;
          const originalTitle = event.extendedProperties?.private?.originalTitle || event.summary || '';
          const originalDescription = event.extendedProperties?.private?.originalDescription || event.description || '';
          
          // Store as exception instance
          exceptionInstances[`${masterId}_${instanceDate}`] = {
            id: sessionId,
            courseId,
            studyBlockId: '',
            date: startDate,
            endDate: startDate !== endDate ? endDate : undefined,
            startTime,
            endTime,
            durationMinutes,
            completed: false,
            completionPercentage: 0,
            notes: '',
            lastModified,
            googleEventId: event.id,
            googleCalendarId: calendarId,
            originalTitle,
            originalDescription,
            recurringEventId: masterId,
            isRecurrenceException: true,
          } as ScheduledSession;
        }
        continue;
      }
      
      // Regular one-time event
      if (!(event.start?.dateTime && event.end?.dateTime)) continue; // skip all-day

      const startDateTime = new Date(event.start.dateTime);
      const endDateTime = new Date(event.end.dateTime);

      const startDate = startDateTime.toISOString().split('T')[0];
      const endDate = endDateTime.toISOString().split('T')[0];

      const startTime = startDateTime.toTimeString().slice(0, 5);
      const endTime = endDateTime.toTimeString().slice(0, 5);

      const durationMinutes = Math.floor((endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60));
      const lastModified = event.updated ? new Date(event.updated).getTime() : 0;
      // Use the Google event ID directly as session ID for imported events
      const sessionId = event.extendedProperties?.private?.sessionId || event.id;
      const courseId = event.extendedProperties?.private?.courseId;
      const originalTitle = event.extendedProperties?.private?.originalTitle || event.summary || '';
      const originalDescription = event.extendedProperties?.private?.originalDescription || event.description || '';

      // CRITICAL: Use session ID as cache key to prevent duplicates
      cache[sessionId] = {
        id: sessionId,
        courseId,
        studyBlockId: '',
        date: startDate,
        endDate: startDate !== endDate ? endDate : undefined,
        startTime,
        endTime,
        durationMinutes,
        completed: false,
        completionPercentage: 0,
        notes: '',
        lastModified,
        googleEventId: event.id,
        googleCalendarId: calendarId,
        originalTitle,
        originalDescription,
      } as ScheduledSession;
    }

    // If we performed a full fetch, reconcile cache with fetched items and horizon to avoid resurrecting deleted/old entries
    if (didFullFetch) {
      try {
        // Build set of session IDs from fetched events (not Google event IDs!)
        const fetchedSessionIds = new Set(
          items.map((e: any) => e.extendedProperties?.private?.sessionId || e.id)
        );
        const minDate = fullFetchTimeMin ? new Date(fullFetchTimeMin) : null;
        const maxDate = fullFetchTimeMax ? new Date(fullFetchTimeMax) : null;
        let removed = 0;
        for (const [sessionId, sess] of Object.entries(cache)) {
          const sessDate = new Date((sess as ScheduledSession).date);
          const outsideHorizon = (minDate && sessDate < minDate) || (maxDate && sessDate > maxDate);
          const notFetched = !fetchedSessionIds.has(sessionId);
          // Remove cached entries outside horizon OR not returned by full fetch (considered deleted)
          if (outsideHorizon || notFetched) {
            console.log(`🧹 Removing cached session ${sessionId} - ${outsideHorizon ? 'outside time window' : 'not in Google Calendar'}`);
            delete cache[sessionId];
            removed++;
          }
        }
        if (removed > 0) {
          console.log(`🧹 Purged ${removed} cached sessions after full fetch to prevent stale or deleted items from reappearing.`);
        }
      } catch (e) {
        console.warn('Failed to reconcile cache after full fetch:', e);
      }
    }

    // Combine regular sessions and exception instances
    const allSessions: ScheduledSession[] = [...Object.values(cache), ...Object.values(exceptionInstances)];
    const recurringCount = Object.values(cache).filter(s => s.recurrence).length;

    if (nextSyncToken) lsSet(syncTokenKey(calendarId), nextSyncToken);
    lsSet(remoteCacheKey(calendarId), cache);
    
    // Update last import stats in sync stats
    const currentStats: SyncStats = lsGet(syncStatsKey(calendarId), {
      lastSyncSuccess: true,
      totalSynced: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      deleted: 0,
      recurring: 0,
    });
    currentStats.recurring = recurringCount;
    lsSet(syncStatsKey(calendarId), currentStats);

    console.log(`📥 Imported ${allSessions.length - recurringCount} one-time sessions and ${recurringCount} recurring sessions (with ${Object.keys(exceptionInstances).length} exceptions) from Google Calendar`);
    return { success: true, events: allSessions };
  } catch (error) {
    console.error('Error importing from Google Calendar:', error);
    return {
      success: false,
      events: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get sync statistics from localStorage
 */
export async function getSyncStats(accessToken: string): Promise<SyncStats | null> {
  try {
    const calendarId = await getOrCreateStudyCalendar(accessToken);
    return lsGet<SyncStats | null>(syncStatsKey(calendarId), null);
  } catch {
    return null;
  }
}

/**
 * Expand a recurring session into individual instances for display
 * This is a pure utility function for UI rendering - doesn't affect sync
 */
export function expandSessionInstances(
  session: ScheduledSession,
  startDate: Date,
  endDate: Date
): ScheduledSession[] {
  // If not recurring, return as-is
  if (!session.recurrence) {
    return [session];
  }
  
  const instances: ScheduledSession[] = [];
  
  try {
    const rruleSet = new RRuleSet();
    const dtstart = new Date(session.recurrence.dtstart);
    const rruleString = `DTSTART:${dtstart.toISOString().replace(/[-:]/g, '').split('.')[0]}Z\nRRULE:${session.recurrence.rrule}`;
    
    const rule = rrulestr(rruleString, { forceset: false }) as RRule;
    rruleSet.rrule(rule);
    
    // Add exclusion dates
    if (session.recurrence.exdates) {
      for (const exdateStr of session.recurrence.exdates) {
        const exdate = new Date(exdateStr);
        exdate.setHours(dtstart.getHours(), dtstart.getMinutes(), dtstart.getSeconds(), 0);
        rruleSet.exdate(exdate);
      }
    }
    
    // Generate occurrences
    const occurrences = rruleSet.between(startDate, endDate, true);
    const occurrenceDateSet = new Set(occurrences.map(o => o.toISOString().split('T')[0]));
    
    // Debug logging
    console.log(`🔄 Expanding session ${session.id}:`, {
      dtstart: session.recurrence.dtstart,
      dtstartDayOfWeek: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dtstart.getDay()],
      rrule: session.recurrence.rrule,
      searchRange: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
      occurrencesFound: occurrences.length,
      occurrenceDates: occurrences.map(o => o.toISOString().split('T')[0])
    });
    
    // Create instance for each occurrence
    for (const occurrence of occurrences) {
      const dateStr = occurrence.toISOString().split('T')[0];
      
      instances.push({
        ...session,
        id: `${session.id}_${dateStr}`,
        date: dateStr,
        recurringEventId: session.id,
        recurrence: undefined, // Instances don't have recurrence themselves
      });
    }

    // Always include the master session's original date as the first instance if it falls in range
    // This satisfies UX expectation that the chosen start date shows a session even if RRULE BYDAY would skip it.
    const baseDateStr = session.date; // Original scheduled date
    if (baseDateStr) {
      const baseDateObj = new Date(baseDateStr);
      if (baseDateObj >= startDate && baseDateObj <= endDate && !occurrenceDateSet.has(baseDateStr)) {
        instances.push({
          ...session,
          id: `${session.id}_${baseDateStr}`,
          date: baseDateStr,
          recurringEventId: session.id,
          recurrence: undefined,
        });
        console.log(`🔁 Added base date instance for session ${session.id} on ${baseDateStr} (not part of RRULE occurrences).`);
      }
    }
    
    // Deduplicate by id in case RRULE already produced the base date (aligned day)
    const byId = new Map<string, ScheduledSession>();
    for (const inst of instances) {
      if (!byId.has(inst.id)) byId.set(inst.id, inst);
    }
    return Array.from(byId.values());
    
  } catch (error) {
    console.error(`Error expanding recurring session ${session.id}:`, error);
    return [session]; // Fallback to single instance
  }
}

/**
 * Perform two-way sync: push local changes and pull remote changes
 * Strategy: Google Calendar is the source of truth
 * - Sessions in Google Calendar are kept/updated in the app
 * - Local-only sessions are pushed to Google Calendar (new sessions)
 * - Sessions that were previously in Google but are now missing are deleted from app
 */
export async function performTwoWaySync(
  localSessions: ScheduledSession[],
  courses: Course[],
  accessToken: string
): Promise<{
  success: boolean;
  syncedToCalendar: number;
  importedFromCalendar: any[];
  syncedSessionIds: string[];
  error?: string;
}> {
  try {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔄 TWO-WAY SYNC STARTED');
    console.log('═══════════════════════════════════════════════════════════');
    
    // CRITICAL: Filter out expanded instances from local sessions BEFORE sync
    // Expanded instances are UI-only (generated by WeekCalendar for display)
    // They have recurringEventId but no recurrence field
    const filteredLocalSessions = localSessions.filter(s => {
      if (s.recurringEventId && !s.recurrence) {
        console.log(`⏭️ Filtering expanded instance ${s.id} from local sessions (UI-only)`);
        return false;
      }
      return true;
    });
    
    console.log(`📊 Local sessions: ${localSessions.length} total, ${filteredLocalSessions.length} after filtering expanded instances`);
    
    // Use filtered sessions for the rest of the sync
    const localSessionsForSync = filteredLocalSessions;
    
    // Step 1: Get what's currently in Google Calendar
    console.log('📥 STEP 1: Fetching events from Google Calendar...');
    const importResult = await importEventsFromGoogleCalendar(accessToken);
    if (!importResult.success) {
      console.error('❌ Import from Google Calendar failed:', importResult.error);
      return {
        success: false,
        syncedToCalendar: 0,
        importedFromCalendar: [],
        syncedSessionIds: [],
        error: importResult.error,
      };
    }
    const remoteSessions: ScheduledSession[] = importResult.events;
    console.log(`✅ Imported ${remoteSessions.length} sessions from Google Calendar`);

    // Step 2: Get the list of session IDs that were previously synced to Google
    // This helps us distinguish between "new local session" vs "deleted from Google"
    const previouslySyncedIds = new Set<string>(
      JSON.parse(localStorage.getItem('googleCalendarSyncedIds') || '[]')
    );

    // Step 2b: Get recently deleted IDs (for grace period to prevent re-sync due to API delays)
    const recentlyDeletedIds = new Set<string>();
    try {
      const stored = localStorage.getItem('googleCalendarRecentlyDeleted');
      if (stored) {
        const deletedMap: Record<string, number> = JSON.parse(stored);
        const now = Date.now();
        const FIVE_MINUTES = 5 * 60 * 1000;
        
        // Only keep non-expired deletions
        Object.entries(deletedMap).forEach(([id, timestamp]) => {
          if (now - timestamp <= FIVE_MINUTES) {
            recentlyDeletedIds.add(id);
          }
        });
      }
    } catch (e) {
      console.error('Failed to load recently deleted IDs:', e);
    }

    console.log('\n� STEP 2: Analyzing current state...');
    console.log('┌─────────────────────────────────────────────────────────┐');
    console.log('│ LOCAL STATE (App)                                       │');
    console.log('├─────────────────────────────────────────────────────────┤');
    console.log(`│ Total sessions: ${localSessionsForSync.length}`);
    console.log(`│ Recurring masters: ${localSessionsForSync.filter(s => s.recurrence).length}`);
    console.log(`│ Standalone sessions: ${localSessionsForSync.filter(s => !s.recurrence && !s.recurringEventId).length}`);
    console.log(`│ Expanded instances (should be 0): ${localSessionsForSync.filter(s => s.recurringEventId && !s.recurrence).length}`);
    console.log('│ Session IDs:', localSessionsForSync.map(s => s.id).join(', '));
    console.log('└─────────────────────────────────────────────────────────┘');
    
    console.log('\n┌─────────────────────────────────────────────────────────┐');
    console.log('│ REMOTE STATE (Google Calendar)                          │');
    console.log('├─────────────────────────────────────────────────────────┤');
    console.log(`│ Total sessions: ${remoteSessions.length}`);
    console.log(`│ Recurring masters: ${remoteSessions.filter(s => s.recurrence).length}`);
    console.log(`│ Standalone sessions: ${remoteSessions.filter(s => !s.recurrence && !s.recurringEventId).length}`);
    console.log('│ Session IDs:', remoteSessions.map(s => s.id).join(', '));
    console.log('└─────────────────────────────────────────────────────────┘');
    
    console.log('\n┌─────────────────────────────────────────────────────────┐');
    console.log('│ SYNC TRACKING                                           │');
    console.log('├─────────────────────────────────────────────────────────┤');
    console.log(`│ Previously synced: ${previouslySyncedIds.size}`);
    console.log('│ IDs:', Array.from(previouslySyncedIds).join(', '));
    console.log(`│ Recently deleted: ${recentlyDeletedIds.size}`);
    console.log('│ IDs:', Array.from(recentlyDeletedIds).join(', '));
    console.log('└─────────────────────────────────────────────────────────┘');

    // Step 3: Build the merged result
    console.log('\n🔀 STEP 3: Merging local and remote sessions...');
    const mergedSessions: ScheduledSession[] = [];
    const localById = new Map(localSessionsForSync.map(s => [s.id, s]));
    const remoteById = new Map(remoteSessions.map(s => [s.id, s]));
    const allIds = new Set([...localById.keys(), ...remoteById.keys()]);
    
    console.log(`Processing ${allIds.size} unique session IDs...`);
    
    for (const id of allIds) {
      const local = localById.get(id);
      const remote = remoteById.get(id);
      
      // CRITICAL: Skip expanded instances (UI-only, should never be synced)
      // They have recurringEventId but no recurrence field
      if (local && local.recurringEventId && !local.recurrence) {
        console.log(`⏭️ Skipping expanded instance ${id} (UI-only, generated from master ${local.recurringEventId})`);
        continue;
      }
      if (remote && remote.recurringEventId && !remote.recurrence) {
        console.log(`⏭️ Skipping expanded instance ${id} from remote (should not exist)`);
        continue;
      }
      
      if (remote) {
        // Exists in Google Calendar
        if (local) {
          // Also exists locally: merge carefully to prevent data loss
          const localMod = local.lastModified || 0;
          const remoteMod = remote.lastModified || 0;
          
          // CRITICAL: Preserve recurrence data - never overwrite recurring master with single event
          if (local.recurrence && !remote.recurrence) {
            console.log(`🔒 Session ${id} is recurring locally but not in remote - preserving local recurrence data`);
            mergedSessions.push({ ...local, lastModified: Math.max(localMod, remoteMod) });
          } else if (!local.recurrence && remote.recurrence) {
            console.log(`🔒 Session ${id} is recurring in remote but not locally - using remote recurrence data`);
            mergedSessions.push({ ...remote });
          } else {
            // Both have same recurrence status - prefer newer
            const chosen = remoteMod > localMod ? remote : local;
            console.log(`✏️ Session ${id} exists in both, using ${remoteMod > localMod ? 'remote' : 'local'} version (remote: ${new Date(remoteMod).toISOString()}, local: ${new Date(localMod).toISOString()})`, {
              localRecurrence: local.recurrence?.rrule,
              remoteRecurrence: remote.recurrence?.rrule,
              chosenRecurrence: chosen.recurrence?.rrule
            });
            mergedSessions.push({ ...chosen });
          }
        } else {
          // Only in Google Calendar, not locally
          
          if (recentlyDeletedIds.has(id)) {
            // Recently deleted locally → ignore for grace period (API propagation delay)
            console.log(`⏳ Session ${id} was recently deleted locally, ignoring (grace period for API sync)`);
            // Don't include it - deletion will propagate to Google Calendar
          } else if (previouslySyncedIds.has(id)) {
            // Was previously synced but now missing locally → deleted locally, should be deleted from Google
            console.log(`🗑️ Session ${id} was deleted locally (in previouslySyncedIds but not in app state), will be removed from Google Calendar`);
            // Don't include it in merged sessions - this will trigger deletion in syncSessionsToGoogleCalendar
          } else {
            // Never synced before → new session created in Google Calendar
            console.log(`➕ Session ${id} only in Google Calendar, adding to app`);
            mergedSessions.push({ ...remote });
          }
        }
      } else if (local) {
        // Only exists locally
        if (previouslySyncedIds.has(id)) {
          // Was previously synced but now missing from Google → deleted in Google
          console.log(`🗑️ Session ${id} was deleted from Google Calendar, removing from app`);
          // Don't include it in merged sessions
        } else {
          // Never synced before → new local session, push to Google
          console.log(`🆕 Session ${id} is new local session, will push to Google`);
          mergedSessions.push({ ...local });
        }
      }
    }

    console.log('\n✅ STEP 4: Merge complete!');
    console.log('┌─────────────────────────────────────────────────────────┐');
    console.log('│ MERGED RESULT                                           │');
    console.log('├─────────────────────────────────────────────────────────┤');
    console.log(`│ Total sessions: ${mergedSessions.length}`);
    console.log(`│ Recurring masters: ${mergedSessions.filter(s => s.recurrence).length}`);
    console.log(`│ Standalone sessions: ${mergedSessions.filter(s => !s.recurrence && !s.recurringEventId).length}`);
    console.log(`│ Expanded instances (should be 0): ${mergedSessions.filter(s => s.recurringEventId && !s.recurrence).length}`);
    console.log('│ Session IDs:', mergedSessions.map(s => s.id).join(', '));
    console.log('└─────────────────────────────────────────────────────────┘');

    // Step 5: Push merged sessions to Google Calendar
    console.log('\n📤 STEP 5: Pushing to Google Calendar...');
    const syncResult = await syncSessionsToGoogleCalendar(
      mergedSessions,
      courses,
      accessToken
    );
    if (!syncResult.success) {
      console.error('❌ Push to Google Calendar failed:', syncResult.error);
      return {
        success: false,
        syncedToCalendar: 0,
        importedFromCalendar: mergedSessions,
        syncedSessionIds: [],
        error: syncResult.error,
      };
    }
    
    console.log('✅ Push to Google Calendar complete!');
    console.log(`   Created: ${syncResult.stats.created}`);
    console.log(`   Updated: ${syncResult.stats.updated}`);
    console.log(`   Deleted: ${syncResult.stats.deleted}`);
    console.log(`   Skipped: ${syncResult.stats.skipped}`);

    // Step 6: Track all merged session IDs as "synced" (after successful push)
    console.log('\n📝 STEP 6: Updating sync tracking...');
    const syncedIds = mergedSessions.map(s => s.id);
    
    // Also track which sessions were deleted (for grace period to prevent re-sync)
    // Keep previously synced IDs that are NOT in mergedSessions as "recently deleted"
    const deletedIds = Array.from(previouslySyncedIds).filter(id => !syncedIds.includes(id));
    
    try {
      localStorage.setItem('googleCalendarSyncedIds', JSON.stringify(syncedIds));
      
      // Store deleted IDs with timestamp (expire after 5 minutes to handle API delays)
      if (deletedIds.length > 0) {
        const recentlyDeleted: Record<string, number> = {};
        try {
          const stored = localStorage.getItem('googleCalendarRecentlyDeleted');
          if (stored) {
            Object.assign(recentlyDeleted, JSON.parse(stored));
          }
        } catch {
          // Ignore parse errors
        }
        
        const now = Date.now();
        const FIVE_MINUTES = 5 * 60 * 1000;
        
        // Add new deletions
        deletedIds.forEach(id => {
          recentlyDeleted[id] = now;
        });
        
        // Clean up expired deletions
        Object.keys(recentlyDeleted).forEach(id => {
          if (now - recentlyDeleted[id] > FIVE_MINUTES) {
            delete recentlyDeleted[id];
          }
        });
        
        localStorage.setItem('googleCalendarRecentlyDeleted', JSON.stringify(recentlyDeleted));
      }
    } catch (e) {
      console.error('Failed to persist synced IDs:', e);
    }

    console.log('✅ TWO-WAY SYNC COMPLETED SUCCESSFULLY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');

    return {
      success: true,
      syncedToCalendar: syncResult.syncedCount,
      importedFromCalendar: mergedSessions,
      syncedSessionIds: syncedIds,
      error: undefined,
    };
  } catch (error) {
    console.error('❌ TWO-WAY SYNC FAILED');
    console.error('Error:', error);
    console.error('═══════════════════════════════════════════════════════════');
    console.error('');
    return {
      success: false,
      syncedToCalendar: 0,
      importedFromCalendar: [],
      syncedSessionIds: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
