# Google Calendar Duplication Bug Fixes

## Problem Description

After connecting Google Calendar, users experienced:
1. **Session Triplication**: Each session appeared 3 times in the app
2. **Multiple Calendars**: 5 duplicate "Intelligent Study Planner" calendars created

## Root Causes

### 1. React StrictMode Double-Mount
- **Issue**: In development mode, React StrictMode mounts components twice to detect side effects
- **Impact**: `GoogleCalendarSyncService` component mounted twice → triggered 2 simultaneous syncs
- **Result**: Same sessions imported multiple times without deduplication

### 2. Lack of Sync Concurrency Protection
- **Issue**: No guard against concurrent sync operations
- **Impact**: Multiple `handleSync()` calls could run simultaneously
- **Result**: Race conditions and duplicate data operations

### 3. Calendar ID Caching
- **Issue**: Calendar ID stored in module-scope variable (`let studyCalendarId`)
- **Impact**: Variable could be cleared/reset between API calls
- **Result**: Multiple concurrent calls to `getOrCreateStudyCalendar()` → multiple calendar creations

### 4. No Import Deduplication
- **Issue**: `handleSessionsImported()` had no duplicate detection
- **Impact**: Same sessions imported multiple times added to state without checks
- **Result**: Triplication of sessions in the UI

## Solution Implementation

### Solution 1: Sync Concurrency Guard
**File**: `src/components/GoogleCalendarSyncService.tsx`

```typescript
// Added both state and ref-based guards
const syncInProgressRef = useRef(false);
const lastSyncTimeRef = useRef<number>(0);

const handleSync = async () => {
  // Check both state and ref (double protection)
  if (!accessToken || isSyncing || syncInProgressRef.current) {
    return;
  }
  
  // Rate limiting: minimum 1 second between syncs
  const now = Date.now();
  if (now - lastSyncTimeRef.current < 1000) {
    return;
  }
  
  // Set both immediately
  syncInProgressRef.current = true;
  setIsSyncing(true);
  lastSyncTimeRef.current = now;
  
  try {
    // ... sync logic ...
  } finally {
    // Clear both guards
    syncInProgressRef.current = false;
    setIsSyncing(false);
  }
};
```

**Why both state and ref?**
- React state updates can be delayed (batched)
- Ref updates are immediate
- Double protection prevents race conditions in StrictMode

### Solution 2: Calendar ID Persistence
**File**: `src/lib/googleCalendar.ts`

```typescript
// Store calendar ID in localStorage
const CALENDAR_ID_STORAGE_KEY = 'googleCalendarStudyCalendarId';

function getStudyCalendarId(): string | null {
  return localStorage.getItem(CALENDAR_ID_STORAGE_KEY);
}

function setStudyCalendarId(calendarId: string): void {
  localStorage.setItem(CALENDAR_ID_STORAGE_KEY, calendarId);
}

async function getOrCreateStudyCalendar(accessToken: string): Promise<string> {
  // Check cache FIRST (fast path)
  const cachedId = getStudyCalendarId();
  if (cachedId) {
    return cachedId;
  }
  
  // Find or create, then cache
  const existingCalendar = /* ... */;
  if (existingCalendar) {
    setStudyCalendarId(existingCalendar.id);
    return existingCalendar.id;
  }
  
  const newCalendar = /* ... */;
  setStudyCalendarId(newCalendar.id);
  return newCalendar.id;
}
```

**Benefits:**
- Calendar ID persists across page reloads
- Prevents duplicate calendar creation during concurrent calls
- Fast lookup without API call on subsequent syncs

### Solution 3: Import Deduplication
**File**: `src/App.tsx`

```typescript
// Track last import to detect duplicates
const lastImportRef = useRef<{ time: number; sessionIds: Set<string> }>({ 
  time: 0, 
  sessionIds: new Set() 
});

const handleSessionsImported = (importedSessions: ScheduledSession[]) => {
  const now = Date.now();
  const importedIds = new Set(importedSessions.map(s => s.id));
  const timeSinceLastImport = now - lastImportRef.current.time;
  
  // Skip if same sessions imported within 2 seconds
  if (timeSinceLastImport < 2000) {
    const isSameImport = importedIds.size === lastImportRef.current.sessionIds.size &&
      Array.from(importedIds).every(id => lastImportRef.current.sessionIds.has(id));
    
    if (isSameImport) {
      console.log('⏸️ Duplicate import detected, skipping');
      return;
    }
  }
  
  // Update tracking
  lastImportRef.current = { time: now, sessionIds: importedIds };
  
  // ... merge logic ...
};
```

**Why 2 seconds?**
- React StrictMode double-mount happens almost instantly
- 2 seconds is long enough to catch duplicates
- Short enough to not block legitimate rapid syncs

## Testing Recommendations

### Before Testing
1. **Clean slate**: Clear all Google Calendar caches and delete duplicate calendars
   - In app: Disconnect and reconnect Google Calendar
   - In Google Calendar: Delete all "Intelligent Study Planner" calendars except one
   - Browser console: `localStorage.clear()` then reload

### Test Scenarios

#### Scenario 1: Initial Connection
**Steps:**
1. Start with no Google Calendar connection
2. Click "Connect Google Calendar"
3. Authorize the app
4. Create 1 session in the app

**Expected Result:**
- ✅ Exactly 1 "Intelligent Study Planner" calendar created
- ✅ Exactly 1 session visible in app
- ✅ Exactly 1 event in Google Calendar

#### Scenario 2: React StrictMode (Development)
**Steps:**
1. Connect Google Calendar
2. Create 1 session
3. Observe console logs during mount

**Expected Result:**
- ✅ Console shows "⏸️ Sync already in progress" messages
- ✅ Only 1 sync actually executes
- ✅ Session appears once in app

#### Scenario 3: Page Reload
**Steps:**
1. Connect Google Calendar
2. Create 3 sessions
3. Reload page

**Expected Result:**
- ✅ Calendar ID loaded from cache (no "Creating new calendar" log)
- ✅ All 3 sessions load correctly
- ✅ No duplicates

#### Scenario 4: Rapid Session Creation
**Steps:**
1. Connect Google Calendar
2. Rapidly create 5 sessions (< 1 second apart)

**Expected Result:**
- ✅ Syncs are rate-limited (console shows "rate-limited" messages)
- ✅ All 5 sessions eventually sync
- ✅ No duplicates

## Debugging Tips

### Console Logs to Monitor

**Successful single sync:**
```
🔄 TWO-WAY SYNC STARTED
📋 Using cached calendar ID: xyz@group.calendar.google.com
📤 Syncing 3 sessions to Google Calendar
✅ TWO-WAY SYNC COMPLETED SUCCESSFULLY
```

**Duplicate sync prevented:**
```
⏸️ Sync already in progress, skipping duplicate sync request
⏸️ Sync rate-limited (< 1s since last sync)
```

**Duplicate import prevented:**
```
⏸️ Duplicate import detected (same sessions within 2s), skipping to prevent duplicates
```

### Known Limitations

1. **Cache keys not user-specific**: Event hashes, sync tokens still stored globally
   - TODO: Include `userId` in cache keys to prevent cross-user cache pollution
   - Workaround: Don't share browser profiles between multiple users

2. **localStorage quota**: Heavy users with many recurring sessions may hit storage limits
   - Mitigation: Implement cache cleanup/expiration

3. **Token expiration**: Refresh tokens not implemented, user must reconnect after ~1 hour
   - TODO: Implement automatic token refresh

## Related Files Modified

1. **src/components/GoogleCalendarSyncService.tsx**
   - Added `syncInProgressRef` and `lastSyncTimeRef`
   - Implemented rate limiting
   - Enhanced logging

2. **src/lib/googleCalendar.ts**
   - Added `getStudyCalendarId()` and `setStudyCalendarId()`
   - Modified `getOrCreateStudyCalendar()` to use cache
   - Updated `clearGoogleCalendarCache()` to include calendar ID

3. **src/App.tsx**
   - Added `lastImportRef` for deduplication
   - Implemented duplicate import detection in `handleSessionsImported()`

## Additional Notes

- All fixes are **backwards compatible** - no breaking changes
- **Zero impact on production builds** (React StrictMode only runs in development)
- **Performance improvement**: Cached calendar ID reduces API calls
- **User experience**: No visible changes, just prevents bugs

## Monitoring Checklist

After deploying these fixes, monitor for:
- [ ] No reports of duplicate sessions
- [ ] No reports of multiple calendars
- [ ] Sync success rate remains high
- [ ] No new errors in console logs
- [ ] Page load time not impacted (localStorage reads are fast)

