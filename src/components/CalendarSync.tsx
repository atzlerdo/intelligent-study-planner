import { useState, useEffect } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Calendar, CheckCircle, XCircle, RefreshCw, LogIn } from 'lucide-react';
import { performTwoWaySync, validateAccessToken } from '../lib/googleCalendar';
import type { ScheduledSession, Course } from '../types';
import { SyncStatsDisplay } from './SyncStatsDisplay';
import { getGoogleCalendarToken, saveGoogleCalendarToken, deleteGoogleCalendarToken } from '../lib/api';

interface CalendarSyncProps {
  sessions: ScheduledSession[];
  courses: Course[];
  onSessionsImported?: (sessions: ScheduledSession[]) => void;
  autoSyncTrigger?: number; // Timestamp to trigger auto-sync
  onStateChange?: (state: { isConnected: boolean; isSyncing: boolean }) => void; // notify parent for icon indicator
}

export function CalendarSync({ sessions, courses, onSessionsImported, autoSyncTrigger, onStateChange }: CalendarSyncProps) {
  // Token and sync state now loaded from backend
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [isLoadingToken, setIsLoadingToken] = useState(true);
  const [syncStatus, setSyncStatus] = useState<{
    type: 'success' | 'error' | null;
    message: string;
  }>({ type: null, message: '' });

  // Load token from backend on mount
  useEffect(() => {
    const loadToken = async () => {
      try {
        const tokenData = await getGoogleCalendarToken();
        if (tokenData) {
          setAccessToken(tokenData.accessToken);
          setIsConnected(true);
          if (tokenData.lastSync) {
            setLastSyncTime(new Date(tokenData.lastSync));
          }
        }
      } catch (error) {
        console.error('Failed to load Google Calendar token:', error);
      } finally {
        setIsLoadingToken(false);
      }
    };
    loadToken();
  }, []);

  // Notify parent about state changes for icon indicator
  useEffect(() => {
    if (onStateChange) {
      onStateChange({ isConnected, isSyncing });
    }
  }, [isConnected, isSyncing, onStateChange]);

  // Auto-sync when autoSyncTrigger changes (session added/edited/deleted)
  useEffect(() => {
    if (autoSyncTrigger && isConnected && !isSyncing) {
      handleSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSyncTrigger]);

  // Periodic sync every 5 minutes when connected and tab is visible
  useEffect(() => {
    if (!isConnected || isSyncing) return;

    const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes for better performance
    const intervalId = setInterval(() => {
      // Only sync if tab is visible
      if (document.visibilityState === 'visible') {
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
        // Add small delay to avoid immediate sync on tab switch
        setTimeout(() => {
          if (!isSyncing) {
            handleSync();
          }
        }, 1000);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, isSyncing]);

  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const token = tokenResponse.access_token;
        // Validate token early to provide clearer errors
        const tokenCheck = await validateAccessToken(token);
        if (!tokenCheck.valid) {
          setSyncStatus({ type: 'error', message: `Invalid access token: ${tokenCheck.error || 'unknown error'}` });
          return;
        }
        
        // Save token to backend
        await saveGoogleCalendarToken({
          accessToken: token,
          tokenExpiry: tokenResponse.expires_in ? Date.now() + tokenResponse.expires_in * 1000 : undefined,
        });
        
        setAccessToken(token);
        setIsConnected(true);
        setSyncStatus({
          type: 'success',
          message: 'Successfully connected to Google Calendar',
        });
        
        // Notify other components that token has changed
        window.dispatchEvent(new CustomEvent('googleCalendarTokenChanged'));
      } catch (e) {
        setSyncStatus({ type: 'error', message: e instanceof Error ? e.message : 'Failed to save token' });
      }
    },
    onError: (err) => {
      // Surface more details if available
      const msg = err && typeof err === 'object' ? JSON.stringify(err) : 'Failed to connect to Google Calendar';
      setSyncStatus({
        type: 'error',
        message: msg,
      });
      // eslint-disable-next-line no-console
      console.error('Google login error:', err);
    },
    scope: 'https://www.googleapis.com/auth/calendar',
  });

  const handleSync = async () => {
    if (!accessToken) {
      setSyncStatus({
        type: 'error',
        message: 'Please connect to Google Calendar first',
      });
      return;
    }

    setIsSyncing(true);
    setSyncStatus({ type: null, message: '' });

    try {
      // Validate token again before syncing
      const tokenCheck = await validateAccessToken(accessToken);
      if (!tokenCheck.valid) {
        setSyncStatus({ type: 'error', message: `Invalid/expired token: ${tokenCheck.error || 'unknown error'}. Please reconnect.` });
        setIsSyncing(false);
        return;
      }

      const result = await performTwoWaySync(sessions, courses, accessToken);

      if (result.success) {
        const syncTime = new Date();
        setLastSyncTime(syncTime);
        // Save last sync time to backend (don't await to avoid blocking UI)
        saveGoogleCalendarToken({
          accessToken: accessToken,
        }).catch(e => console.error('Failed to update last sync time:', e));
        
        setSyncStatus({
          type: 'success',
          message: `Synced ${result.syncedToCalendar} sessions to calendar`,
        });

        // If there are imported sessions, notify parent component
        if (onSessionsImported) {
          onSessionsImported(result.importedFromCalendar);
        }
      } else {
        setSyncStatus({
          type: 'error',
          message: `Sync failed: ${result.error || 'Unknown error'}`,
        });
      }
    } catch (error) {
      setSyncStatus({
        type: 'error',
        message: `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
      // eslint-disable-next-line no-console
      console.error('Sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      // Delete token from backend
      await deleteGoogleCalendarToken();
      
      setAccessToken(null);
      setIsConnected(false);
      setLastSyncTime(null);
      setSyncStatus({ type: null, message: '' });
      
      // Notify other components that token has been removed
      window.dispatchEvent(new CustomEvent('googleCalendarTokenChanged'));
    } catch (e) {
      console.error('Failed to disconnect:', e);
      setSyncStatus({ type: 'error', message: 'Failed to disconnect from Google Calendar' });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Google Calendar Sync
        </CardTitle>
        <CardDescription>
          Two-way synchronization with your Google Calendar
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Show loading state while fetching token */}
        {isLoadingToken ? (
          <div className="text-center text-gray-500 py-4">Loading connection status...</div>
        ) : (
          <>
        {/* Connection Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Status:</span>
            {isConnected ? (
              <Badge variant="default" className="bg-green-500">
                <CheckCircle className="w-3 h-3 mr-1" />
                Connected
              </Badge>
            ) : (
              <Badge variant="secondary">
                <XCircle className="w-3 h-3 mr-1" />
                Not Connected
              </Badge>
            )}
          </div>
          {isConnected && lastSyncTime && (
            <span className="text-xs text-gray-500">
              Last synced: {lastSyncTime.toLocaleTimeString()}
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          {!isConnected ? (
            <Button onClick={() => login()} className="w-full bg-gray-900 text-white hover:bg-gray-800 font-semibold shadow-md">
              <LogIn className="w-4 h-4 mr-2" />
              Connect Google Calendar
            </Button>
          ) : (
            <>
              <Button
                onClick={handleSync}
                disabled={isSyncing}
                className="flex-1 bg-gray-900 text-white hover:bg-gray-800 font-semibold shadow-md disabled:bg-gray-400"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </Button>
              <Button
                onClick={handleDisconnect}
                variant="outline"
                className="flex-1"
              >
                Disconnect
              </Button>
            </>
          )}
        </div>

        {/* Status Messages */}
        {syncStatus.type && (
          <div
            className={`p-3 rounded-lg text-sm ${
              syncStatus.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {syncStatus.message}
          </div>
        )}

        {/* Sync Statistics */}
        {isConnected && <SyncStatsDisplay accessToken={accessToken} isSyncing={isSyncing} />}
        </>
        )}
      </CardContent>
    </Card>
  );
}
