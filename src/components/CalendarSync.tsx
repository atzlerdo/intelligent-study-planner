/**
 * Google Calendar Sync Component (UI)
 * 
 * Provides user interface for connecting and managing Google Calendar integration.
 * Handles OAuth flow, displays connection status, and allows manual sync/disconnect.
 * 
 * Features:
 * - OAuth 2.0 login with @react-oauth/google
 * - Connection status display (connected/disconnected)
 * - Manual sync button for on-demand synchronization
 * - Disconnect button to remove calendar integration
 * - Last sync timestamp display
 * - Token stored in backend database (user-specific)
 * 
 * Note: This component handles UI only. Automatic background sync is handled
 * by GoogleCalendarSyncService.tsx which is always mounted.
 */

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
  sessions: ScheduledSession[];              // All scheduled sessions
  courses: Course[];                         // All courses
  onSessionsImported?: (sessions: ScheduledSession[]) => void;  // Callback when sessions imported
  autoSyncTrigger?: number;                  // Timestamp that triggers auto-sync
  onStateChange?: (state: { isConnected: boolean; isSyncing: boolean }) => void;  // Notify parent for UI indicators
}

export function CalendarSync({ sessions, courses, onSessionsImported, autoSyncTrigger, onStateChange }: CalendarSyncProps) {
  // ============================================================================
  // State Management - Connection status and sync state
  // ============================================================================
  
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [isLoadingToken, setIsLoadingToken] = useState(true);
  const [syncStatus, setSyncStatus] = useState<{
    type: 'success' | 'error' | null;
    message: string;
  }>({ type: null, message: '' });

  // ============================================================================
  // Token Management - Load from backend on mount
  // ============================================================================
  
  /**
   * Load Google Calendar token from backend database
   * Runs once on component mount to restore connection state
   */
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

  /**
   * Notify parent component about connection/sync state changes
   * Used to show sync indicator icon in UI
   */
  useEffect(() => {
    if (onStateChange) {
      onStateChange({ isConnected, isSyncing });
    }
  }, [isConnected, isSyncing, onStateChange]);

  // ============================================================================
  // Auto-Sync Effects (NOTE: These are LEGACY - duplicated in GoogleCalendarSyncService)
  // ============================================================================
  
  /**
   * LEGACY: Auto-sync when autoSyncTrigger changes
   * @deprecated This logic is duplicated in GoogleCalendarSyncService.tsx
   * Kept here for backwards compatibility but should be removed in future refactor
   */
  useEffect(() => {
    if (autoSyncTrigger && isConnected && !isSyncing) {
      handleSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSyncTrigger]);

  /**
   * LEGACY: Periodic sync every 5 minutes
   * @deprecated This logic is duplicated in GoogleCalendarSyncService.tsx
   * Kept here for backwards compatibility but should be removed in future refactor
   */
  useEffect(() => {
    if (!isConnected || isSyncing) return;

    const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        handleSync();
      }
    }, SYNC_INTERVAL);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, isSyncing]);

  /**
   * LEGACY: Sync when user returns to tab
   * @deprecated This logic is duplicated in GoogleCalendarSyncService.tsx
   * Kept here for backwards compatibility but should be removed in future refactor
   */
  useEffect(() => {
    if (!isConnected) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !isSyncing) {
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

  // ============================================================================
  // OAuth Login - Connect to Google Calendar
  // ============================================================================
  
  /**
   * Configure Google OAuth login hook
   * Requests calendar scope and saves token to backend on success
   */
  const login = useGoogleLogin({
    /**
     * Handle successful OAuth login
     * 1. Validate token with Google API
     * 2. Save to backend database
     * 3. Update local state
     * 4. Dispatch event to notify GoogleCalendarSyncService
     */
    onSuccess: async (tokenResponse) => {
      try {
        const token = tokenResponse.access_token;
        
        // Validate token early to provide clearer error messages
        const tokenCheck = await validateAccessToken(token);
        if (!tokenCheck.valid) {
          setSyncStatus({ type: 'error', message: `Invalid access token: ${tokenCheck.error || 'unknown error'}` });
          return;
        }
        
        // Save token to backend (user-specific in database)
        await saveGoogleCalendarToken({
          accessToken: token,
          tokenExpiry: tokenResponse.expires_in ? Date.now() + tokenResponse.expires_in * 1000 : undefined,
        });
        
        // Update local state to show connected status
        setAccessToken(token);
        setIsConnected(true);
        setSyncStatus({
          type: 'success',
          message: 'Successfully connected to Google Calendar',
        });
        
        // Dispatch custom event so GoogleCalendarSyncService can reload token
        window.dispatchEvent(new CustomEvent('googleCalendarTokenChanged'));
      } catch (e) {
        setSyncStatus({ type: 'error', message: e instanceof Error ? e.message : 'Failed to save token' });
      }
    },
    /**
     * Handle OAuth login failure
     * Log error and show user-friendly message
     */
    onError: (err) => {
      const msg = err && typeof err === 'object' ? JSON.stringify(err) : 'Failed to connect to Google Calendar';
      setSyncStatus({
        type: 'error',
        message: msg,
      });
      // eslint-disable-next-line no-console
      console.error('Google login error:', err);
    },
    // Request calendar scope for read/write access
    scope: 'https://www.googleapis.com/auth/calendar',
  });

  // ============================================================================
  // Manual Sync - User-triggered sync via button
  // ============================================================================
  
  /**
   * Manually trigger sync with Google Calendar
   * 
   * Process:
   * 1. Validate access token
   * 2. Perform two-way sync (push app sessions, pull calendar events)
   * 3. Update last sync timestamp
   * 4. Notify parent of imported sessions
   * 
   * Note: This is the same sync logic as in GoogleCalendarSyncService,
   * but triggered manually by user clicking "Sync Now" button.
   */
  const handleSync = async () => {
    // Guard: Must be connected first
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
      // Validate token before syncing (token may have expired)
      const tokenCheck = await validateAccessToken(accessToken);
      if (!tokenCheck.valid) {
        setSyncStatus({ type: 'error', message: `Invalid/expired token: ${tokenCheck.error || 'unknown error'}. Please reconnect.` });
        setIsSyncing(false);
        return;
      }

      // Perform bidirectional sync
      const result = await performTwoWaySync(sessions, courses, accessToken);

      if (result.success) {
        const syncTime = new Date();
        setLastSyncTime(syncTime);
        
        // Update last sync time in backend (non-blocking)
        saveGoogleCalendarToken({
          accessToken: accessToken,
        }).catch(e => console.error('Failed to update last sync time:', e));
        
        setSyncStatus({
          type: 'success',
          message: `Synced ${result.syncedToCalendar} sessions to calendar`,
        });

        // Notify parent component about imported sessions to merge into app state
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

  // ============================================================================
  // Disconnect - Remove Google Calendar integration
  // ============================================================================
  
  /**
   * Disconnect from Google Calendar
   * 
   * Process:
   * 1. Delete token from backend database
   * 2. Clear local state
   * 3. Dispatch event to notify GoogleCalendarSyncService
   * 
   * Note: This does NOT delete events from Google Calendar,
   * only removes the connection.
   */
  const handleDisconnect = async () => {
    try {
      // Delete token from backend database
      await deleteGoogleCalendarToken();
      
      // Clear local state
      setAccessToken(null);
      setIsConnected(false);
      setLastSyncTime(null);
      setSyncStatus({ type: null, message: '' });
      
      // Dispatch event so GoogleCalendarSyncService stops auto-syncing
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
