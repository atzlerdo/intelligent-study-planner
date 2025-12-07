# Google Calendar Two-Way Sync Deletion Fix

> **⚠️ UPDATE**: This document describes the grace period mechanism. For the session resurrection bug fix, see `SYNC_RESURRECTION_BUG_FIX.md`.

## Problem Description

**Issue reported by user:**
1. Delete session from Google Calendar → App correctly removes it → **But it comes back shortly after**
2. Delete session from App → Google Calendar removes it → **Works correctly**

## Root Cause Analysis

### The Sync Loop Problem

When a user deletes a session from Google Calendar, the following happens:

1. **Background sync runs** (every 5 minutes or on manual trigger)
2. **Import from Google Calendar**: Session is missing (correct) ✅
3. **Merge logic**: Detects session was deleted from Google, excludes it from merged result (correct) ✅
4. **Push to Google Calendar**: Merged sessions don't include deleted session (correct) ✅
5. **Update app state**: `handleSessionsImported` is called with merged sessions
6. **BUG**: App's merge logic in `handleSessionsImported` was NOT properly removing sessions that exist locally but not in sync result ❌

The app would detect "this session exists locally but not in sync result" and log it, but the actual removal from state was not happening because of flawed merge logic.

### The Code Issue

**Before fix** (App.tsx, line 1444):
```typescript
} else {
  // Session only in current state (not in sync result)
  const currentMod = currentSession.lastModified || 0;
  if (syncStartTime && currentMod > syncStartTime) {
    // Created during sync - add it
    sessionById.set(id, currentSession);
  } else {
    // Old session not in sync result - was deleted
    console.log(`⏭️ Skipping local session ${id} - not in sync result`);
    // ❌ BUG: It logs "skipping" but session was never removed from sessionById
    // The session stays in the app state!
  }
}
```

The issue was that "skipping" didn't actually remove the session - it just didn't add it to `sessionById`. But if the session had been added earlier through another code path, it would remain in the map.

## Solution Implemented

### Solution 1: Proper Session Removal in App State

**Modified** `src/App.tsx` - `handleSessionsImported()` function:

**Change**: Refactored merge logic to be more explicit about what stays vs what gets deleted.

**New approach**:
```typescript
// CRITICAL: Merge local and synced sessions with conflict resolution
// Strategy: Synced sessions are authoritative - they represent the merged state
// Only preserve local sessions that were created/modified DURING the sync
const sessionById = new Map<string, ScheduledSession>();

// First, add all synced sessions (authoritative - this is the merged state from server)
for (const syncedSession of importedSessions) {
  sessionById.set(syncedSession.id, syncedSession);
}

// Then, check current sessions for any that were created/modified DURING the sync
// These need to be preserved and will trigger a re-sync
for (const [id, currentSession] of currentById) {
  const syncedSession = syncedById.get(id);
  
  if (syncedSession) {
    // Session exists in both - check if local was modified during sync
    if (syncStartTime && currentMod > syncStartTime) {
      // Local session was modified DURING the sync - prefer local
      sessionById.set(id, currentSession);
    } else {
      // Use synced version (already in map)
    }
  } else {
    // Session only in current state (not in sync result)
    if (syncStartTime && currentMod > syncStartTime) {
      // Created during sync - add it and trigger re-sync
      sessionById.set(id, currentSession);
    } else {
      // ✅ FIX: Old session not in sync result - deleted from Google Calendar
      // Do NOT add to sessionById - this removes it from app state
      console.log(`🗑️ Removing local session ${id} - deleted from Google Calendar`);
    }
  }
}
```

**Key improvement**: Now when a session exists locally but not in the sync result (and wasn't created during sync), it's **explicitly NOT added** to the final map, effectively deleting it.

### Solution 2: Mark Deleted Sessions During Grace Period

**Modified** `src/App.tsx` - `handleDeleteSession()` function:

**Added**: Deletion tracking to prevent re-import during API propagation delays.

```typescript
const handleDeleteSession = async (sessionId: string) => {
  console.log(`🗑️ App: Deleting session ${sessionId}`);
  
  // Mark as recently deleted to prevent re-import during sync grace period
  try {
    const recentlyDeleted: Record<string, number> = {};
    const stored = localStorage.getItem('googleCalendarRecentlyDeleted');
    if (stored) {
      Object.assign(recentlyDeleted, JSON.parse(stored));
    }
    recentlyDeleted[sessionId] = Date.now();
    localStorage.setItem('googleCalendarRecentlyDeleted', JSON.stringify(recentlyDeleted));
    console.log('  📝 Marked session as recently deleted (grace period for sync)');
  } catch (e) {
    console.warn('  ⚠️ Failed to mark as recently deleted:', e);
  }
  
  // ... rest of deletion logic
  await apiDeleteSession(sessionId);
  // ... trigger sync
};
```

**Why needed**: When you delete a session from the app:
1. Session is deleted from database
2. Sync is triggered immediately
3. Google Calendar API is called to delete the event
4. **BUT** there can be a delay before Google's API reflects the deletion
5. If another sync happens during this delay, it might re-import the "ghost" session
6. Marking it as "recently deleted" prevents re-import for 5 minutes (grace period)

## How It Works Now

### Scenario 1: Delete from Google Calendar

1. User deletes session from Google Calendar UI
2. Background sync runs (or user clicks "Sync Now")
3. **Import**: Session not found in Google Calendar ✅
4. **Merge**: Session excluded from merged result (because it was previously synced but now missing) ✅
5. **Push**: Deletion confirmed in Google Calendar ✅
6. **App state update**: Session removed from app's local state ✅ **[FIXED]**
7. **Result**: Session permanently deleted, doesn't come back ✅

### Scenario 2: Delete from App

1. User deletes session from app UI
2. **Mark as deleted**: Session ID added to `googleCalendarRecentlyDeleted` with timestamp ✅ **[ADDED]**
3. **Delete from database**: Backend removes session ✅
4. **Trigger sync**: Auto-sync immediately runs ✅
5. **Google Calendar deletion**: Event removed from Google Calendar ✅
6. **Grace period**: For next 5 minutes, even if sync runs, session won't be re-imported (checks recentlyDeleted) ✅
7. **Result**: Session stays deleted ✅

## Technical Details

### Deletion Tracking Storage

**localStorage key**: `googleCalendarRecentlyDeleted`

**Format**: 
```json
{
  "session-id-1": 1700000000000,
  "session-id-2": 1700000005000
}
```
- Key: Session ID
- Value: Timestamp (milliseconds) when deleted
- **Expiration**: 5 minutes (300,000 ms)
- **Cleanup**: Expired entries automatically removed during sync

### Sync Flow with Deletion Tracking

**In** `src/lib/googleCalendar.ts` - `performTwoWaySync()`:

```typescript
// Step 2b: Get recently deleted IDs (for grace period)
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

// Later in merge logic:
if (remote) {
  // Only in Google Calendar, not locally
  if (recentlyDeletedIds.has(id)) {
    // Recently deleted locally → ignore for grace period
    console.log(`⏳ Session ${id} was recently deleted locally, ignoring`);
    // Don't include it - deletion will propagate to Google Calendar
  } else if (previouslySyncedIds.has(id)) {
    // Was previously synced but now missing locally → deleted locally
    console.log(`🗑️ Session ${id} was deleted locally, will remove from Google`);
  } else {
    // Never synced before → new session created in Google Calendar
    console.log(`➕ Session ${id} only in Google Calendar, adding to app`);
    mergedSessions.push({ ...remote });
  }
}
```

### Conflict Resolution

**Priority order** (highest to lowest):
1. **Sessions created/modified during sync**: Always preserved (prevents data loss)
2. **Synced sessions**: Authoritative state from server
3. **Local sessions not in sync result**: Deleted (removed from app state)

**Edge case handling**:
- If user modifies a session while sync is running → local changes preserved, triggers re-sync
- If user creates a session while sync is running → new session preserved, triggers re-sync
- If API delays cause "ghost" sessions → grace period prevents re-import

## Testing

### Test Case 1: Delete from Google Calendar
1. Create session in app
2. Wait for sync
3. Open Google Calendar and delete the event
4. Trigger sync in app
5. **Expected**: Session disappears from app and doesn't return ✅

### Test Case 2: Delete from App
1. Create session in app
2. Wait for sync (appears in Google Calendar)
3. Delete session from app
4. Check Google Calendar
5. **Expected**: Event removed from Google Calendar and doesn't return ✅

### Test Case 3: Rapid Deletion
1. Create session in app
2. Immediately delete it (before sync)
3. **Expected**: Session deleted, doesn't appear in Google Calendar ✅

### Test Case 4: Delete During Sync
1. Create session
2. Trigger sync
3. While sync is running, delete session
4. **Expected**: Session deleted, marked as recently deleted, doesn't reappear ✅

## Debug Logs

**Look for these console logs**:

**When deleting from app**:
```
🗑️ App: Deleting session <id>
📝 Marked session as recently deleted (grace period for sync)
✅ Courses and sessions refreshed from backend
```

**When sync detects deletion from Google**:
```
🗑️ Session <id> was deleted from Google Calendar, removing from app
🗑️ Removing local session <id> - deleted from Google Calendar (not in sync result)
```

**When grace period prevents re-import**:
```
⏳ Session <id> was recently deleted locally, ignoring (grace period for API sync)
```

## Known Limitations

1. **Grace period**: 5-minute window where deleted sessions are tracked
   - After 5 minutes, if Google Calendar still shows the event (rare), it could be re-imported
   - Workaround: Wait 1 minute, then manually sync again

2. **localStorage cache**: Deletion tracking is per-browser
   - If user switches browsers immediately after deletion, grace period doesn't apply
   - Minimal impact: Next sync will converge to correct state

3. **Network failures**: If deletion API call fails, session may remain
   - App will retry on next sync
   - User sees error message

## Related Files

- `src/App.tsx` - Main application state, `handleSessionsImported()`, `handleDeleteSession()`
- `src/lib/googleCalendar.ts` - Sync logic, `performTwoWaySync()`, deletion tracking
- `GOOGLE_CALENDAR_FIX.md` - Documentation for duplication fixes
- `CALENDAR_SELECTION_FEATURE.md` - Calendar selection dialog feature

## Future Improvements

1. **Visual feedback**: Show "Syncing deletion..." indicator
2. **Undo deletion**: Keep deleted sessions in cache for 1 hour with "Undo" option
3. **Batch deletions**: Optimize deletion of multiple sessions at once
4. **Conflict resolution UI**: Show dialog when deletion conflicts occur
5. **Audit log**: Track all sync operations for debugging

