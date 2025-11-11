import { useEffect, useState } from 'react';
import { getSyncStats } from '../lib/googleCalendar';
import type { SyncStats } from '../types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { AlertCircle, CheckCircle2, Clock, TrendingUp, Trash2, SkipForward, RefreshCw } from 'lucide-react';

interface SyncStatsDisplayProps {
  accessToken: string | null;
  isSyncing?: boolean;
}

export function SyncStatsDisplay({ accessToken, isSyncing }: SyncStatsDisplayProps) {
  const [stats, setStats] = useState<SyncStats | null>(null);

  useEffect(() => {
    if (!accessToken) {
      setStats(null);
      return;
    }

    const loadStats = async () => {
      const syncStats = await getSyncStats(accessToken);
      setStats(syncStats);
    };

    loadStats();

    // Refresh stats every 5 seconds to catch updates from background sync
    const interval = setInterval(loadStats, 5000);
    return () => clearInterval(interval);
  }, [accessToken]);

  if (!accessToken || !stats) return null;

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium">Sync Status</CardTitle>
            <CardDescription className="text-xs">
              Last sync: {formatTime(stats.lastSyncTime)}
            </CardDescription>
          </div>
          <div>
            {isSyncing ? (
              <Badge variant="secondary" className="gap-1">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Syncing...
              </Badge>
            ) : stats.lastSyncSuccess ? (
              <Badge variant="default" className="gap-1 bg-green-500 hover:bg-green-600">
                <CheckCircle2 className="h-3 w-3" />
                Connected
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <AlertCircle className="h-3 w-3" />
                Error
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-muted-foreground">Created:</span>
            <span className="font-medium">{stats.created}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-yellow-500" />
            <span className="text-muted-foreground">Updated:</span>
            <span className="font-medium">{stats.updated}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <SkipForward className="h-3.5 w-3.5 text-gray-500" />
            <span className="text-muted-foreground">Skipped:</span>
            <span className="font-medium">{stats.skipped}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Trash2 className="h-3.5 w-3.5 text-red-500" />
            <span className="text-muted-foreground">Deleted:</span>
            <span className="font-medium">{stats.deleted}</span>
          </div>
        </div>
        
        {stats.recurring > 0 && (
          <div className="pt-2 border-t border-border/50">
            <div className="flex items-center gap-1.5 text-xs">
              <RefreshCw className="h-3.5 w-3.5 text-purple-500" />
              <span className="text-muted-foreground">Recurring series:</span>
              <span className="font-medium">{stats.recurring}</span>
            </div>
          </div>
        )}

        {!stats.lastSyncSuccess && stats.lastSyncError && (
          <div className="pt-2 border-t border-border/50">
            <p className="text-xs text-destructive">{stats.lastSyncError}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
