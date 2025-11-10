/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ScheduledSession, Course } from '../types';

declare const gapi: any;

// Google Calendar API types
interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  extendedProperties?: {
    private?: {
      sessionId?: string;
      courseId?: string;
      appSource?: string;
    };
  };
}

// Calendar ID for storing study sessions
const STUDY_CALENDAR_NAME = 'Intelligent Study Planner';
let studyCalendarId: string | null = null;

// Small helper to surface detailed HTTP errors from Google APIs
async function fetchJson(url: string, options: RequestInit = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    let body: any = undefined;
    try {
      const text = await res.text();
      try { body = JSON.parse(text); } catch { body = text; }
    } catch {
      // ignore
    }
    const details = typeof body === 'string' ? body : JSON.stringify(body);
    throw new Error(`Google API HTTP ${res.status} ${res.statusText} - ${details}`);
  }
  return res.json();
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
 * Convert ScheduledSession to Google Calendar event
 */
function sessionToCalendarEvent(session: ScheduledSession, course: Course): CalendarEvent {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  // Handle multi-day sessions
  const endDate = session.endDate || session.date;
  
  return {
    summary: `📚 ${course.name}`,
    // Keep the description minimal: only user-provided notes (no extra metadata)
    description: session.notes || undefined,
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
      },
    },
  };
}

/**
 * Sync sessions to Google Calendar (one-way: app -> calendar)
 */
export async function syncSessionsToGoogleCalendar(
  sessions: ScheduledSession[],
  courses: Course[],
  accessToken: string
): Promise<{ success: boolean; syncedCount: number; error?: string }> {
  try {
    const calendarId = await getOrCreateStudyCalendar(accessToken);

    // Get existing events from our calendar
    const existingEventsData = await fetchJson(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?privateExtendedProperty=appSource=intelligent-study-planner`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    const existingEvents = existingEventsData.items || [];
    const existingEventsBySessionId = new Map(
      existingEvents.map((event: any) => [
        event.extendedProperties?.private?.sessionId,
        event,
      ])
    );

    let syncedCount = 0;

    // Sync each session
    for (const session of sessions) {
      const course = courses.find((c) => c.id === session.courseId);
      if (!course) continue;

      const eventData = sessionToCalendarEvent(session, course);
      const existingEvent = existingEventsBySessionId.get(session.id);

      try {
        if (existingEvent) {
          // Update existing event
          await fetchJson(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${(existingEvent as any).id}`,
            {
              method: 'PUT',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(eventData),
            }
          );
        } else {
          // Create new event
          await fetchJson(
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
        }
        syncedCount++;
      } catch (error) {
        console.error(`Error syncing session ${session.id}:`, error);
      }
    }

    // Delete events that no longer exist in our app
    const currentSessionIds = new Set(sessions.map((s) => s.id));
    for (const [sessionId, event] of existingEventsBySessionId.entries()) {
      if (sessionId && !currentSessionIds.has(sessionId as string)) {
        try {
          await fetchJson(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${(event as any).id}`,
            {
              method: 'DELETE',
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            }
          );
        } catch (error) {
          console.error(`Error deleting event for session ${sessionId}:`, error);
        }
      }
    }

    return { success: true, syncedCount };
  } catch (error) {
    console.error('Error syncing to Google Calendar:', error);
    return {
      success: false,
      syncedCount: 0,
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

    // Get all events from our study calendar
    const data = await fetchJson(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?privateExtendedProperty=appSource=intelligent-study-planner`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    const events = data.items || [];


    // Convert calendar events back to ScheduledSessions format, including last updated time
    const importedSessions: ScheduledSession[] = events
  .filter((event: unknown) => (event as { extendedProperties?: { private?: { sessionId?: string } } }).extendedProperties?.private?.sessionId)
  .map((event: { extendedProperties: { private: { sessionId: string; courseId: string } }; start: { dateTime: string }; end: { dateTime: string }; description?: string; updated?: string }): ScheduledSession => {
        const startDateTime = new Date(event.start.dateTime);
        const endDateTime = new Date(event.end.dateTime);

        // Format dates to local YYYY-MM-DD
        const startDate = startDateTime.toISOString().split('T')[0];
        const endDate = endDateTime.toISOString().split('T')[0];

        // Format times to HH:mm
        const startTime = startDateTime.toTimeString().slice(0, 5);
        const endTime = endDateTime.toTimeString().slice(0, 5);

        // Calculate duration
        const durationMinutes = Math.floor(
          (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60)
        );

        // Google Calendar event 'updated' field is RFC3339 timestamp
        const lastModified = event.updated ? new Date(event.updated).getTime() : 0;

        return {
          id: event.extendedProperties.private.sessionId,
          courseId: event.extendedProperties.private.courseId,
          studyBlockId: '', // Will need to be mapped
          date: startDate,
          endDate: startDate !== endDate ? endDate : undefined,
          startTime: startTime,
          endTime: endTime,
          durationMinutes: durationMinutes,
          completed: false,
          completionPercentage: 0,
          notes: event.description || '',
          lastModified,
        };
      });

    console.log(`📥 Imported ${importedSessions.length} sessions from Google Calendar`);
    return { success: true, events: importedSessions };
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
    // Step 1: Get what's currently in Google Calendar
  const importResult = await importEventsFromGoogleCalendar(accessToken);
    if (!importResult.success) {
      return {
        success: false,
        syncedToCalendar: 0,
        importedFromCalendar: [],
        syncedSessionIds: [],
        error: importResult.error,
      };
    }
    const remoteSessions: ScheduledSession[] = importResult.events;

    // Step 2: Get the list of session IDs that were previously synced to Google
    // This helps us distinguish between "new local session" vs "deleted from Google"
    const previouslySyncedIds = new Set<string>(
      JSON.parse(localStorage.getItem('googleCalendarSyncedIds') || '[]')
    );

    console.log('🔄 Two-way sync starting:', {
      localSessions: localSessions.length,
      localSessionIds: localSessions.map(s => s.id),
      remoteSessions: remoteSessions.length,
      remoteSessionIds: remoteSessions.map(s => s.id),
      previouslySyncedCount: previouslySyncedIds.size,
      previouslySyncedIds: Array.from(previouslySyncedIds)
    });

    // Step 3: Build the merged result
    const mergedSessions: ScheduledSession[] = [];
    const localById = new Map(localSessions.map(s => [s.id, s]));
    const remoteById = new Map(remoteSessions.map(s => [s.id, s]));
    const allIds = new Set([...localById.keys(), ...remoteById.keys()]);
    
    for (const id of allIds) {
      const local = localById.get(id);
      const remote = remoteById.get(id);
      
      if (remote) {
        // Exists in Google Calendar
        if (local) {
          // Also exists locally: compare timestamps, prefer newer
          const localMod = local.lastModified || 0;
          const remoteMod = remote.lastModified || 0;
          const chosen = remoteMod > localMod ? remote : local;
          console.log(`✏️ Session ${id} exists in both, using ${remoteMod > localMod ? 'remote' : 'local'} version (remote: ${new Date(remoteMod).toISOString()}, local: ${new Date(localMod).toISOString()})`);
          mergedSessions.push({ ...chosen });
        } else {
          // Only in Google Calendar: add it (created in Google)
          console.log(`➕ Session ${id} only in Google Calendar, adding to app`);
          mergedSessions.push({ ...remote });
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

    console.log('🔄 Merge complete:', {
      mergedSessions: mergedSessions.length,
      willPushToGoogle: mergedSessions.length
    });

    // Step 5: Push merged sessions to Google Calendar
    const syncResult = await syncSessionsToGoogleCalendar(
      mergedSessions,
      courses,
      accessToken
    );
    if (!syncResult.success) {
      return {
        success: false,
        syncedToCalendar: 0,
        importedFromCalendar: mergedSessions,
        syncedSessionIds: [],
        error: syncResult.error,
      };
    }

    // Step 6: Track all merged session IDs as "synced" (after successful push)
    const syncedIds = mergedSessions.map(s => s.id);
    try {
      localStorage.setItem('googleCalendarSyncedIds', JSON.stringify(syncedIds));
    } catch (e) {
      console.error('Failed to persist synced IDs:', e);
    }

    return {
      success: true,
      syncedToCalendar: syncResult.syncedCount,
      importedFromCalendar: mergedSessions,
      syncedSessionIds: syncedIds,
      error: undefined,
    };
  } catch (error) {
    console.error('Error performing two-way sync:', error);
    return {
      success: false,
      syncedToCalendar: 0,
      importedFromCalendar: [],
      syncedSessionIds: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
