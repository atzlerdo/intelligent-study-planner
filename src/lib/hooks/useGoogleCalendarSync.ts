import { useState, useEffect, useCallback } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { performTwoWaySync, validateAccessToken } from '../../lib/googleCalendar';
import type { ScheduledSession, Course } from '../../types';

interface UseGoogleCalendarSyncOptions {
  sessions: ScheduledSession[];
  courses: Course[];
  onSessionsImported?: (sessions: ScheduledSession[]) => void;
  autoSyncTrigger?: number;
  autoIntervalMs?: number; // default 3 minutes
}

export function useGoogleCalendarSync({ sessions, courses, onSessionsImported, autoSyncTrigger, autoIntervalMs = 3 * 60 * 1000 }: UseGoogleCalendarSyncOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [syncStatus, setSyncStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const token = tokenResponse.access_token;
        const tokenCheck = await validateAccessToken(token);
        if (!tokenCheck.valid) {
          setSyncStatus({ type: 'error', message: `Invalid access token: ${tokenCheck.error || 'unknown error'}` });
          return;
        }
        setAccessToken(token);
        setIsConnected(true);
        setSyncStatus({ type: 'success', message: 'Successfully connected to Google Calendar' });
      } catch (e) {
        setSyncStatus({ type: 'error', message: e instanceof Error ? e.message : 'Failed to validate token' });
      }
    },
    onError: (err) => {
      const msg = err && typeof err === 'object' ? JSON.stringify(err) : 'Failed to connect to Google Calendar';
      setSyncStatus({ type: 'error', message: msg });
      // eslint-disable-next-line no-console
      console.error('Google login error:', err);
    },
    scope: 'https://www.googleapis.com/auth/calendar',
  });

  const handleDisconnect = useCallback(() => {
    setAccessToken(null);
    setIsConnected(false);
    setLastSyncTime(null);
    setSyncStatus({ type: null, message: '' });
  }, []);

  const handleSync = useCallback(async () => {
    if (!accessToken) {
      setSyncStatus({ type: 'error', message: 'Please connect to Google Calendar first' });
      return;
    }
    setIsSyncing(true);
    setSyncStatus({ type: null, message: '' });
    try {
      const tokenCheck = await validateAccessToken(accessToken);
      if (!tokenCheck.valid) {
        setSyncStatus({ type: 'error', message: `Invalid/expired token: ${tokenCheck.error || 'unknown error'}. Please reconnect.` });
        setIsSyncing(false);
        return;
      }
      const result = await performTwoWaySync(sessions, courses, accessToken);
      if (result.success) {
        setLastSyncTime(new Date());
        setSyncStatus({ type: 'success', message: `Synced ${result.syncedToCalendar} sessions to calendar` });
        if (result.importedFromCalendar.length > 0 && onSessionsImported) {
          onSessionsImported(result.importedFromCalendar);
        }
      } else {
        setSyncStatus({ type: 'error', message: `Sync failed: ${result.error || 'Unknown error'}` });
      }
    } catch (error) {
      setSyncStatus({ type: 'error', message: `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}` });
      // eslint-disable-next-line no-console
      console.error('Sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [accessToken, courses, onSessionsImported, sessions]);

  // Auto-sync on trigger (e.g. session add/edit/delete)
  useEffect(() => {
    if (autoSyncTrigger && isConnected && !isSyncing) {
      handleSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSyncTrigger]);

  // Interval sync
  useEffect(() => {
    if (!isConnected || isSyncing) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') handleSync();
    }, autoIntervalMs);
    return () => clearInterval(interval);
  }, [autoIntervalMs, handleSync, isConnected, isSyncing]);

  // Visibility sync
  useEffect(() => {
    if (!isConnected) return;
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !isSyncing) {
        setTimeout(() => { if (!isSyncing) handleSync(); }, 1000);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [handleSync, isConnected, isSyncing]);

  return { isConnected, isSyncing, lastSyncTime, syncStatus, login, handleSync, handleDisconnect };
}
