/**
 * Google Calendar Sync Service
 * 
 * Background service component that handles automatic synchronization between
 * the app and Google Calendar. Runs independently of the CalendarSync UI dialog.
 * 
 * Features:
 * - Loads Google Calendar OAuth token from backend on mount
 * - Listens for token changes (connect/disconnect events)
 * - Triggers automatic sync on session changes
 * - Performs periodic sync every 5 minutes when connected
 * - Syncs when user returns to tab after being away
 * - Validates token before each sync
 * - Updates last sync timestamp in backend after successful sync
 */

import { useEffect, useState, useRef } from 'react';
import { performTwoWaySync, validateAccessToken } from '../lib/googleCalendar';
import type { ScheduledSession, Course } from '../types';
import { getGoogleCalendarToken, deleteGoogleCalendarToken, updateLastSync } from '../lib/api';

interface GoogleCalendarSyncServiceProps {
  sessions: ScheduledSession[];              // All scheduled sessions from app
  courses: Course[];                         // All courses from app
  onSessionsImported?: (sessions: ScheduledSession[]) => void;  // Callback when sessions imported from Google Calendar
  autoSyncTrigger?: number;                  // Timestamp that changes to trigger auto-sync
  onStateChange?: (state: { isConnected: boolean; isSyncing: boolean }) => void;  // Notify parent about sync state
}

/**
 * Background service that handles automatic Google Calendar syncing
 * This component renders nothing (returns null) but handles sync logic
 */
export function GoogleCalendarSyncService({
  sessions,
  courses,
  onSessionsImported,
  autoSyncTrigger,
  onStateChange,
}: GoogleCalendarSyncServiceProps) {
  // State management
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const isConnected = !!accessToken;

  // ============================================================================
  // Token Management - Load token from backend and listen for changes
  // ============================================================================
  useEffect(() => {
    /**
     * Load Google Calendar token from backend database
     * Called on mount and when token changes (connect/disconnect)
     */
    const loadToken = async () => {
      try {
        const tokenData = await getGoogleCalendarToken();
        if (tokenData) {
          setAccessToken(tokenData.accessToken);
        }
      } catch (error) {
        // Silently handle 404 (no token) to avoid console spam when user hasn't connected
        if (error instanceof Error && !error.message.includes('404')) {
          console.error('Failed to load Google Calendar token:', error);
        }
      }
    };
    loadToken();

    // Listen for custom event dispatched by CalendarSync component
    // when user connects or disconnects Google Calendar
    const handleTokenChange = () => {
      loadToken();
    };
    window.addEventListener('googleCalendarTokenChanged', handleTokenChange);
    
    return () => {
      window.removeEventListener('googleCalendarTokenChanged', handleTokenChange);
    };
  }, []);

  // Notify parent component about connection and sync state changes
  useEffect(() => {
    if (onStateChange) {
      onStateChange({ isConnected, isSyncing });
    }
  }, [isConnected, isSyncing, onStateChange]);

  // ============================================================================
  // Sync Logic - Perform two-way sync with Google Calendar
  // ============================================================================
  
  /**
   * Perform bidirectional sync with Google Calendar
   * 
   * Process:
   * 1. Validate access token (refresh if needed)
   * 2. Push app sessions to Google Calendar
   * 3. Pull calendar events and convert to sessions
   * 4. Update last sync timestamp in backend
   * 5. Notify parent of imported sessions
   * 
   * If token is invalid, disconnects from backend and clears local state
   */
  const handleSync = async () => {
    // Skip if no token or already syncing
    if (!accessToken || isSyncing) return;

    setIsSyncing(true);
    try {
      // Validate token before sync (refreshes token if expired)
      const tokenCheck = await validateAccessToken(accessToken);
      if (!tokenCheck.valid) {
        console.error('Token invalid, disconnecting from backend');
        await deleteGoogleCalendarToken();
        setAccessToken(null);
        setIsSyncing(false);
        return;
      }

      // Perform two-way sync: app → Google Calendar and Google Calendar → app
      const result = await performTwoWaySync(sessions, courses, accessToken);

      if (result.success) {
        // Update last sync timestamp in backend database
        try {
          await updateLastSync();
        } catch (e) {
          console.error('Failed to update last sync time:', e);
        }

        // If sessions were imported from Google Calendar, notify parent to merge them
        if (result.importedFromCalendar.length > 0 && onSessionsImported) {
          onSessionsImported(result.importedFromCalendar);
        }
      } else {
        console.error('Sync failed:', result.error);
      }
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  // ============================================================================
  // Auto-Sync Triggers - When to automatically sync
  // ============================================================================
  
  /**
   * Debounce protection: Prevent rapid re-syncs within 2 seconds
   * This prevents infinite loops when imported sessions trigger another sync
   */
  const lastSyncTriggerRef = useRef<number>(0);
  
  /**
   * Auto-sync when sessions change (add/edit/delete)
   * 
   * The autoSyncTrigger prop is a timestamp that changes whenever the user
   * modifies sessions. We debounce to prevent sync loops.
   */
  useEffect(() => {
    if (autoSyncTrigger && isConnected && !isSyncing) {
      const now = Date.now();
      const timeSinceLastTrigger = now - lastSyncTriggerRef.current;
      
      // Debounce: only sync if at least 2 seconds passed since last auto-sync trigger
      if (timeSinceLastTrigger < 2000) {
        console.log('⏸️ Auto-sync debounced (triggered too soon after previous sync)');
        return;
      }
      
      console.log('🔄 Auto-sync triggered by session change');
      lastSyncTriggerRef.current = now;
      handleSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSyncTrigger]);

  /**
   * Periodic sync every 5 minutes
   * 
   * Runs background sync when:
   * - User is connected to Google Calendar
   * - Tab is visible (respects document.visibilityState)
   * - Not already syncing
   * 
   * This ensures changes made in Google Calendar web/mobile app
   * are periodically pulled into the study planner.
   */
  useEffect(() => {
    if (!isConnected || isSyncing) return;

    // Sync every 5 minutes (300,000 ms)
    const SYNC_INTERVAL = 5 * 60 * 1000;
    const intervalId = setInterval(() => {
      // Only sync if user is currently viewing the app
      if (document.visibilityState === 'visible') {
        console.log('🔄 Periodic auto-sync (5 min interval)');
        handleSync();
      }
    }, SYNC_INTERVAL);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, isSyncing]);

  /**
   * Sync when user returns to the app tab
   * 
   * Listens to document.visibilityState changes. When the user switches
   * back to this tab after being away, triggers a sync after 1 second delay.
   * 
   * Use case: User made changes in Google Calendar mobile app, then returns
   * to the study planner in their browser - changes are automatically pulled.
   */
  useEffect(() => {
    if (!isConnected) return;

    const handleVisibilityChange = () => {
      // Only sync when tab becomes visible (not when it becomes hidden)
      if (document.visibilityState === 'visible' && !isSyncing) {
        // 1 second delay to avoid sync spam if user rapidly switches tabs
        setTimeout(() => {
          if (!isSyncing) {
            console.log('🔄 Auto-sync on tab return');
            handleSync();
          }
        }, 1000);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, isSyncing]);

  // This component renders nothing - it's a pure logic/service component
  return null;
}
