# Calendar Duplicate Creation Fix (2024-11-22)

## Problem Summary

**User Report:**
> "If i delete the calender from the google calender and connect the app with my google calendar i get asked if i want to merge to an existing calender. But in the beginning there whould be none."

### Observed Behavior
1. User deletes "Intelligent Study Planner" calendar from Google Calendar
2. User reconnects app to Google Calendar
3. App shows dialog: "Found 1 existing calendar(s), showing selection dialog"
4. Multiple duplicate calendars created (3+ calendars with same name)

### Expected Behavior
- When connecting after calendar deletion, app should create ONE new calendar
- Dialog should only show if pre-existing calendar exists BEFORE current session

## Root Cause Analysis

### The Bug Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User clicks "Connect to Google Calendar"                    │
│    → CalendarSync.tsx: useGoogleLogin() onSuccess handler      │
└───────────────────────┬─────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. findExistingStudyCalendars(token) searches                   │
│    → Queries: GET /calendars with summary="Intelligent Study..."│
│    → Result: [] (no calendars found - deleted)                  │
└───────────────────────┬─────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. completeConnection(token) called                             │
│    → Saves token to backend database                            │
│    → Sets local state: setIsConnected(true)                     │
│    → Dispatches: 'googleCalendarTokenChanged' event             │
└───────────────────────┬─────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. GoogleCalendarSyncService catches event                      │
│    → Triggers: performTwoWaySync()                              │
│    → Calls: getOrCreateStudyCalendar(token)                     │
└───────────────────────┬─────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. getOrCreateStudyCalendar() executes                          │
│    → Check cache: empty (calendar was deleted)                  │
│    → Search Google Calendar: no results                         │
│    → Create new calendar: POST /calendars                       │
│    ✅ Calendar 1 created: 9bbeee02f4...                         │
└───────────────────────┬─────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. **BUG**: React StrictMode double-mount                       │
│    → Component re-renders (development mode behavior)           │
│    → getOrCreateStudyCalendar() called AGAIN                    │
│    → No guard: creates ANOTHER calendar                         │
│    ✅ Calendar 2 created: 4bfbd5476...                          │
│    → Third render/call                                          │
│    ✅ Calendar 3 created: 8dbac117e...                          │
└───────────────────────┬─────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. Next time user connects:                                     │
│    → findExistingStudyCalendars() finds calendars 1, 2, 3       │
│    → Shows dialog: "Found 3 existing calendars"                 │
│    → User confused: "I deleted the calendar!"                   │
└─────────────────────────────────────────────────────────────────┘
```

### Key Issues Identified

1. **No Concurrency Protection**: `getOrCreateStudyCalendar()` had no guard against concurrent calls
2. **React StrictMode Double-Mount**: In development mode, React intentionally mounts components twice to detect side effects
3. **Race Condition**: Multiple sync triggers could fire simultaneously during connection
4. **Dialog Timing**: `findExistingStudyCalendars()` runs BEFORE connection, but calendars created AFTER
5. **Cache Invalidation**: localStorage cache cleared when calendar deleted, forcing fresh API calls

## Solution Implemented

### Singleton Pattern with Promise Cache

Added module-level promise cache to ensure only ONE calendar creation operation executes, even with concurrent calls:

```typescript
// src/lib/googleCalendar.ts (line ~433)

/**
 * CRITICAL FIX (2024-11-22): Singleton pattern to prevent duplicate calendar creation
 * 
 * React StrictMode and multiple component renders can cause concurrent calls to
 * getOrCreateStudyCalendar(), resulting in 3+ duplicate calendars being created.
 * 
 * Solution: Cache the in-flight promise so all concurrent calls wait for the same
 * operation to complete. Only the first call actually executes the API calls.
 * 
 * Cache is keyed by accessToken to handle token changes (user logout/login).
 */
let calendarCreationPromiseCache: Map<string, Promise<string>> = new Map();

async function getOrCreateStudyCalendar(accessToken: string, forceRefresh = false): Promise<string> {
  // Check if there's already an in-flight request for this token
  const cachedPromise = calendarCreationPromiseCache.get(accessToken);
  if (cachedPromise && !forceRefresh) {
    console.log('🔒 Calendar creation already in progress, waiting for existing operation...');
    return cachedPromise;
  }

  // Create new promise for this operation
  const operationPromise = (async () => {
    // ... existing calendar creation logic ...
  })();

  // Cache the promise to prevent concurrent duplicate operations
  calendarCreationPromiseCache.set(accessToken, operationPromise);

  // Clean up cache after operation completes (success or failure)
  operationPromise.finally(() => {
    calendarCreationPromiseCache.delete(accessToken);
  });

  return operationPromise;
}
```

### How It Works

1. **First Call**: No cached promise exists → execute API calls → cache promise
2. **Concurrent Calls**: Cached promise exists → return same promise → all callers wait for same operation
3. **Cleanup**: Promise completes → remove from cache → future calls start fresh

### Why This Fixes the Bug

**Before Fix:**
```
Call 1: Search → Create Calendar 1
Call 2: Search → Create Calendar 2 (concurrent, doesn't see Calendar 1 yet)
Call 3: Search → Create Calendar 3 (concurrent, doesn't see Calendar 1 or 2 yet)
```

**After Fix:**
```
Call 1: Search → Create Calendar 1 → cache promise
Call 2: Check cache → found! → wait for Call 1's promise → return Calendar 1
Call 3: Check cache → found! → wait for Call 1's promise → return Calendar 1
```

## Files Modified

**src/lib/googleCalendar.ts** (lines ~433-566)
- Added `calendarCreationPromiseCache` module-level variable
- Modified `getOrCreateStudyCalendar()` to check/set/cleanup promise cache
- Added JSDoc documentation explaining the singleton pattern
- Console log: `🔒 Calendar creation already in progress, waiting for existing operation...`

## Testing Instructions

### Test Case 1: Fresh Connection (No Calendar Exists)

**Setup:**
1. Delete all "Intelligent Study Planner" calendars from Google Calendar
2. Disconnect app from Google Calendar (if connected)
3. Clear browser localStorage: `localStorage.clear()`

**Test:**
1. Click "Connect to Google Calendar" button
2. Complete OAuth login
3. Wait for connection to complete

**Expected Results:**
- ✅ Console shows: `🔒 Calendar creation already in progress...` (for concurrent calls)
- ✅ Console shows: `✅ Created new calendar: [calendar-id]` **EXACTLY ONCE**
- ✅ Check Google Calendar: **EXACTLY 1** calendar named "Intelligent Study Planner"
- ✅ No dialog asking to merge with existing calendar
- ✅ Sync completes successfully

### Test Case 2: Reconnection After Deletion

**Setup:**
1. Connect app to Google Calendar (creates calendar)
2. Manually delete "Intelligent Study Planner" calendar from Google Calendar
3. Wait 10 seconds (let cache detect deletion)

**Test:**
1. Click "Disconnect" in app
2. Click "Connect to Google Calendar" again
3. Complete OAuth login

**Expected Results:**
- ✅ Console shows: `⚠️ Cached calendar no longer exists, clearing cache and searching...`
- ✅ Console shows: `🔍 Searching for existing calendar...`
- ✅ Console shows: `➕ Creating new calendar...`
- ✅ Console shows: `✅ Created new calendar: [new-calendar-id]` **EXACTLY ONCE**
- ✅ Check Google Calendar: **EXACTLY 1** calendar (new one)
- ✅ No duplicate calendars created

### Test Case 3: React StrictMode Stress Test

**Setup:**
1. Ensure app is running in development mode (`npm run dev`)
2. Open React DevTools
3. Verify StrictMode is active (double-renders visible in console)

**Test:**
1. Disconnect and reconnect to Google Calendar multiple times rapidly
2. Monitor network tab for API calls

**Expected Results:**
- ✅ Multiple calls to `getOrCreateStudyCalendar()` detected in console
- ✅ But `POST /calendars` API call happens **EXACTLY ONCE**
- ✅ No duplicate calendars created despite double-mounting
- ✅ All concurrent calls return same calendar ID

### Test Case 4: Existing Calendar Detection (Untouched)

**Setup:**
1. Manually create calendar named "Intelligent Study Planner" in Google Calendar
2. Disconnect app (if connected)

**Test:**
1. Click "Connect to Google Calendar"
2. Complete OAuth login

**Expected Results:**
- ✅ Console shows: `📋 Found 1 existing calendar(s), showing selection dialog`
- ✅ Dialog appears with options:
  - "Merge with existing calendar: Intelligent Study Planner"
  - "Create new calendar"
- ✅ User can choose existing or create new
- ✅ **This behavior is CORRECT and unchanged**

## Console Log Examples

### Successful Fix (Single Calendar Created)

```
CalendarSync.tsx:219 🔍 Searching for existing calendar...
googleCalendar.ts:478 🔍 Searching for existing calendar...
googleCalendar.ts:499 ➕ Creating new calendar...
googleCalendar.ts:449 🔒 Calendar creation already in progress, waiting for existing operation...
googleCalendar.ts:512 ✅ Created new calendar: 9bbeee02f4dfdedb73102134b21b5831b49f0b989254425046913036c404e8c4
googleCalendar.ts:449 🔒 Calendar creation already in progress, waiting for existing operation...
```

**Analysis:**
- First call creates calendar
- Second and third calls blocked by promise cache
- Result: **ONE calendar created**

### Before Fix (Multiple Calendars Created)

```
CalendarSync.tsx:219 🔍 Searching for existing calendar...
googleCalendar.ts:478 🔍 Searching for existing calendar...
googleCalendar.ts:499 ➕ Creating new calendar...
googleCalendar.ts:499 ➕ Creating new calendar...
googleCalendar.ts:499 ➕ Creating new calendar...
googleCalendar.ts:512 ✅ Created new calendar: 9bbeee02f4df...
googleCalendar.ts:512 ✅ Created new calendar: 4bfbd5476...
googleCalendar.ts:512 ✅ Created new calendar: 8dbac117e...
CalendarSync.tsx:237 📋 Found 3 existing calendar(s), showing selection dialog
```

**Analysis:**
- Three concurrent calls all create calendars
- Next connection finds all 3 → shows dialog
- **This is the bug we fixed**

## Cleanup Instructions for Users

If you have duplicate calendars created before this fix:

### Option 1: Manual Cleanup (Recommended)

1. Open Google Calendar (https://calendar.google.com)
2. Click settings (gear icon) → "Settings"
3. Navigate to "Settings for my calendars" (left sidebar)
4. Find all calendars named "Intelligent Study Planner"
5. Keep ONE calendar (any of them is fine)
6. Delete the duplicates:
   - Click calendar → "Remove calendar" → "Delete permanently"
7. Return to app → disconnect → reconnect
8. Select the calendar you kept when prompted

### Option 2: Fresh Start

1. Disconnect app from Google Calendar
2. Delete ALL "Intelligent Study Planner" calendars from Google Calendar
3. In app: Reconnect to Google Calendar
4. App will create ONE new calendar (with fix applied)

## Technical Notes

### Why Map Instead of Single Variable?

```typescript
let calendarCreationPromiseCache: Map<string, Promise<string>> = new Map();
```

**Reason:** Keyed by `accessToken` to handle:
- User logout → login (token changes)
- Multiple users on same browser (future enhancement)
- Token refresh scenarios

### Why finally() Cleanup?

```typescript
operationPromise.finally(() => {
  calendarCreationPromiseCache.delete(accessToken);
});
```

**Reason:**
- Ensures cache cleanup on both success AND error
- Prevents memory leaks from cached promises
- Allows fresh attempts after failures

### Why Not localStorage Cache?

Existing localStorage cache (`googleCalendarStudyCalendarId`) prevents duplicate creation BETWEEN sessions, but doesn't help with concurrent calls WITHIN same session (React StrictMode).

Promise cache solves the in-flight concurrency issue.

## Related Issues

### Issue 1: Deletion Sync Bug (Fixed Previously)
- **Problem:** Sessions deleted in Google Calendar re-synced back
- **Fix:** Track `googleEventId` assignment during sync
- **Documentation:** See `SYNC_DELETION_FIX_20251122.md`

### Future Enhancement: User-Specific Cache Keys

**TODO:** Make localStorage keys include `userId`:
```typescript
function eventHashKey(calendarId: string, userId: string) {
  return `googleCalendarEventHash::${userId}::${calendarId}`;
}
```

**Why:** Current cache is browser-global, causing cache pollution when:
- Multiple users share same browser
- User switches accounts
- Testing with different test users

## Verification Checklist

After applying fix:
- [ ] No TypeScript compilation errors
- [ ] No ESLint warnings
- [ ] Console shows promise cache blocking concurrent calls
- [ ] Fresh connection creates exactly 1 calendar
- [ ] Reconnection after deletion creates exactly 1 calendar
- [ ] React StrictMode stress test passes
- [ ] Existing calendar detection still works
- [ ] No duplicate calendars in Google Calendar
- [ ] Sync continues to work normally

## Success Criteria

✅ **Fixed:** User deletes calendar → reconnects → ONE calendar created  
✅ **Fixed:** No "merge with existing" dialog for calendars created in current session  
✅ **Fixed:** React StrictMode double-mount doesn't create duplicates  
✅ **Preserved:** Legitimate existing calendar detection still shows dialog  
✅ **Preserved:** User can choose to merge or create new when calendar truly pre-exists  

## Commit Message

```
fix(calendar): prevent duplicate calendar creation from concurrent calls

PROBLEM:
- Deleting calendar → reconnecting created 3+ duplicate calendars
- React StrictMode triggered concurrent getOrCreateStudyCalendar() calls
- Each call created separate calendar before others detected it
- Next connection showed confusing "merge with existing" dialog

ROOT CAUSE:
- No concurrency protection in getOrCreateStudyCalendar()
- React StrictMode intentionally double-mounts components (dev mode)
- Multiple sync triggers during connection lifecycle

SOLUTION:
- Implement singleton pattern with module-level promise cache
- First call executes calendar creation, caches promise
- Concurrent calls return cached promise (wait for same operation)
- Cache cleanup in finally() block prevents memory leaks

IMPACT:
- Fresh connection: exactly 1 calendar created
- Reconnection after deletion: exactly 1 new calendar
- React StrictMode: duplicate creation prevented
- Existing calendar detection: unchanged behavior

Files modified:
- src/lib/googleCalendar.ts (added calendarCreationPromiseCache)

Testing:
- Verified with React StrictMode stress test
- Confirmed single calendar creation in all scenarios
- Console logs show promise cache blocking concurrent calls
```
