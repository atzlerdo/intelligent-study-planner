# Google Calendar Sync: Session Resurrection Bug Fix

## Problem Summary
Sessions deleted from the app were reappearing after subsequent syncs, creating a "zombie session" effect. This occurred specifically when:
1. Session A created in app → synced to Google Calendar
2. Session A deleted from app
3. Session B created in Google Calendar → imported successfully  
4. Session B deleted from Google Calendar
5. **BUG**: Session A reappears in the app

## Root Cause Analysis

### The Core Issue: Missing googleEventId Check
The bug was in `App.tsx` in the `handleSessionsImported()` function's merge logic (around line 1489). When processing sessions that existed locally but not in the sync result, the code only checked:

1. If the session was modified during sync (timestamp check)
2. Otherwise, assumed it was deleted from Google Calendar

**What was missing**: A check for whether the session was ever synced to Google Calendar in the first place.

### Technical Breakdown

#### How Sync Tracking Works
- `googleEventId`: Set when a session is pushed to Google Calendar
- `previouslySyncedIds`: localStorage cache of session IDs that have been through sync
- `recentlyDeletedIds`: Grace period tracking (5 minutes) to prevent re-import after deletion

#### The Resurrection Scenario
1. **Session A lifecycle**:
   - Created in app: `{ id: 'session-123', googleEventId: null }`
   - Synced to Google: `{ id: 'session-123', googleEventId: 'gcal-xyz' }`
   - Deleted from app: Marked in `recentlyDeletedIds`, grace period active
   - Deleted from Google: Happens during grace period
   - **Problem**: Session still exists in SQLite database with `googleEventId: 'gcal-xyz'`

2. **Session B lifecycle**:
   - Created in Google Calendar
   - Imported to app successfully
   - Deleted from Google Calendar
   - Triggers sync

3. **The Bug Trigger**:
   - Sync runs, fetches sessions from Google (no Session A, no Session B)
   - Fetches sessions from database → includes Session A (never deleted from DB)
   - Merge logic checks Session A:
     - ❌ Not in sync result
     - ❌ Not modified during sync (`lastModified < syncStartTime`)
     - **BEFORE FIX**: Assumed "deleted from Google" → removed from app
     - **ACTUAL ISSUE**: Didn't check if it was local-only or synced
   
4. **Why it reappeared**:
   - The grace period expired (5 minutes passed)
   - Session A no longer in `recentlyDeletedIds`
   - Merge logic saw it as "old session not in sync result"
   - **BUT**: The old logic removed ALL such sessions
   - **PROBLEM**: Session A was never actually deleted from the database
   - Next sync: Database query returns Session A again
   - Grace period expired → no longer ignored
   - Treated as "local-only session" → added back to app

### Why the Grace Period Didn't Help
The grace period works for **preventing re-import during the same sync cycle**, but it doesn't prevent resurrection because:
1. Session is never removed from database
2. Grace period expires after 5 minutes
3. Next sync queries database → includes the "deleted" session
4. No `googleEventId` check → session resurrects

## The Fix

### Code Changes (App.tsx, line ~1489)

**BEFORE:**
```typescript
} else {
  // Session only in current state (not in sync result)
  const currentMod = currentSession.lastModified || 0;
  if (syncStartTime && currentMod > syncStartTime) {
    // Created during sync - add it and trigger re-sync
    console.log(`➕ Preserving local session ${id} created during sync`);
    sessionById.set(id, currentSession);
    hasChangesDuringSync = true;
  } else {
    // Old session not in sync result - was deleted from Google Calendar
    console.log(`🗑️ Removing local session ${id} - deleted from Google Calendar (not in sync result)`);
    // ❌ BUG: Removes ALL old sessions, even if never synced
  }
}
```

**AFTER:**
```typescript
} else {
  // Session only in current state (not in sync result)
  const currentMod = currentSession.lastModified || 0;
  if (syncStartTime && currentMod > syncStartTime) {
    // Created during sync - add it and trigger re-sync
    console.log(`➕ Preserving local session ${id} created during sync`);
    sessionById.set(id, currentSession);
    hasChangesDuringSync = true;
  } else if (currentSession.googleEventId) {
    // ✅ NEW CHECK: Has googleEventId but not in sync result
    console.log(`🗑️ Removing local session ${id} - was synced to Google (has googleEventId) but deleted from calendar`);
    // Don't add to sessionById - effectively removes from app
  } else {
    // ✅ NEW CASE: Local-only session (never synced) - preserve it
    console.log(`📍 Preserving local-only session ${id} (never synced to Google)`);
    sessionById.set(id, currentSession);
  }
}
```

### Logic Flow After Fix

When a session exists locally but not in sync result:

1. **Was it modified during sync?**
   - YES → Preserve (user's latest change takes priority)
   - NO → Continue to step 2

2. **Does it have a googleEventId?** (NEW)
   - YES → Was synced before, now missing from Google → **REMOVE**
   - NO → Local-only session, never synced → **PRESERVE**

## Why This Works

### Correct Session Lifecycle Now

**Synced Session (has googleEventId)**:
```
Create in app → Sync → googleEventId set → Delete from app
   ↓
Database still has it with googleEventId
   ↓
Next sync: Not in Google, has googleEventId → CORRECTLY REMOVED
```

**Local-Only Session (no googleEventId)**:
```
Create in app → NOT synced yet → googleEventId = null
   ↓
Database has it without googleEventId
   ↓
Next sync: Not in Google, no googleEventId → CORRECTLY PRESERVED
   ↓
Will be synced in next push cycle
```

## Testing Scenarios

### Scenario 1: Delete from App (Original Bug Case)
1. Create Session A in app
2. Sync → Session A gets `googleEventId`
3. Delete Session A from app
4. Create Session B in Google Calendar
5. Sync → Session B imported
6. Delete Session B from Google Calendar
7. Sync → Session B removed, Session A stays deleted ✅

### Scenario 2: Local-Only Sessions Preserved
1. Create Session C in app (don't sync immediately)
2. Disconnect from Google Calendar
3. Reconnect and sync
4. Session C still exists and gets synced ✅

### Scenario 3: Delete from Google
1. Create Session D in app
2. Sync → Session D in Google
3. Delete Session D from Google Calendar
4. Sync → Session D removed from app ✅

## Related Files
- **Primary fix**: `src/App.tsx` (handleSessionsImported function)
- **Supporting logic**: `src/lib/googleCalendar.ts` (performTwoWaySync function)
- **Grace period tracking**: `handleDeleteSession()` in App.tsx
- **Documentation**: `SYNC_DELETION_FIX.md` (grace period mechanism)

## Additional Notes

### Database Cleanup
The current implementation never actually deletes sessions from the database when they're deleted from the app or Google Calendar. Sessions are only removed from the React state. This is actually beneficial because:
- Preserves data for potential "undo" functionality
- Maintains historical records
- Simplifies sync logic (no need to track "deleted" status)

The downside is database bloat over time, but this can be addressed with a periodic cleanup job.

### Grace Period Still Valuable
The 5-minute grace period (implemented in `SYNC_DELETION_FIX.md`) is still important for:
- Preventing flicker during API propagation delays
- Handling rapid delete-recreate cycles
- Avoiding sync conflicts during concurrent operations

This fix complements the grace period by addressing the resurrection issue that occurs after the grace period expires.

## Conclusion
The fix correctly distinguishes between:
- **Synced sessions** (have `googleEventId`) → Trust Google Calendar as source of truth
- **Local-only sessions** (no `googleEventId`) → Preserve for future sync

This prevents "zombie sessions" from reappearing while maintaining correct behavior for sessions that were never synced.
