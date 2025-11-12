import { useEffect, useState, useRef } from 'react';
import { performTwoWaySync, validateAccessToken } from '../lib/googleCalendar';
import type { ScheduledSession, Course } from '../types';
import { getGoogleCalendarToken, deleteGoogleCalendarToken, updateLastSync } from '../lib/api';

interface GoogleCalendarSyncServiceProps {
  sessions: ScheduledSession[];
  courses: Course[];
  onSessionsImported?: (sessions: ScheduledSession[]) => void;
  autoSyncTrigger?: number;
  onStateChange?: (state: { isConnected: boolean; isSyncing: boolean }) => void;
}

/**
 * Background service that handles automatic Google Calendar syncing
 * This component is always mounted and handles sync even when the dialog is closed
 */
export function GoogleCalendarSyncService({
  sessions,
  courses,
  onSessionsImported,
  autoSyncTrigger,
  onStateChange,
}: GoogleCalendarSyncServiceProps) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const isConnected = !!accessToken;

  // Load token from backend on mount
  useEffect(() => {
    const loadToken = async () => {
      try {
        const tokenData = await getGoogleCalendarToken();
        if (tokenData) {
          setAccessToken(tokenData.accessToken);
        }
      } catch (error) {
        // Silently handle 404 (no token) to avoid console spam
        if (error instanceof Error && !error.message.includes('404')) {
          console.error('Failed to load Google Calendar token:', error);
        }
      }
    };
    loadToken();

    // Listen for custom event when token is connected/disconnected
    const handleTokenChange = () => {
      loadToken();
    };
    window.addEventListener('googleCalendarTokenChanged', handleTokenChange);
    
    return () => {
      window.removeEventListener('googleCalendarTokenChanged', handleTokenChange);
    };
  }, []);

  // Notify parent about state changes
  useEffect(() => {
    if (onStateChange) {
      onStateChange({ isConnected, isSyncing });
    }
  }, [isConnected, isSyncing, onStateChange]);

  const handleSync = async () => {
    if (!accessToken || isSyncing) return;

    setIsSyncing(true);
    try {
      const tokenCheck = await validateAccessToken(accessToken);
      if (!tokenCheck.valid) {
        console.error('Token invalid, disconnecting from backend');
        await deleteGoogleCalendarToken();
        setAccessToken(null);
        setIsSyncing(false);
        return;
      }

      const result = await performTwoWaySync(sessions, courses, accessToken);

      if (result.success) {
        try {
          await updateLastSync();
        } catch (e) {
          console.error('Failed to update last sync time:', e);
        }

        if (result.importedFromCalendar.length > 0 && onSessionsImported) {
          // Pass only sessions to keep prop signature (syncStartTime used internally if needed)
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

  // Auto-sync when autoSyncTrigger changes (session added/edited/deleted)
  // Use a ref to prevent rapid re-syncs within 2 seconds
  const lastSyncTriggerRef = useRef<number>(0);
  
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

  // Periodic sync every 5-10 minutes when connected and tab is visible
  useEffect(() => {
    if (!isConnected || isSyncing) return;

    // Configurable sync interval (default 5 minutes, can be adjusted)
    const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes for better performance
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        console.log('🔄 Periodic auto-sync (5 min interval)');
        handleSync();
      }
    }, SYNC_INTERVAL);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, isSyncing]);

  // Sync when user returns to the tab
  useEffect(() => {
    if (!isConnected) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !isSyncing) {
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

  // This component renders nothing - it's just a background service
  return null;
}
