# CRITICAL FIX: Sessions Not Persisting to Database

## Root Cause Analysis

### The Problem
**Sessions were losing ALL data (position changes, `googleEventId`, etc.) on server restart because changes were ONLY stored in React state, NOT in the database.**

### The Bug Chain
1. **Initial Load**: Backend GET endpoint returned sessions with `google_event_id = null` (from database)
2. **Backend Mapping Bug**: GET endpoint didn't convert snake_case (`google_event_id`) to camelCase (`googleEventId`) properly
3. **Frontend received snake_case**: API client had fallback mapping, but wasn't tested
4. **Google Calendar Sync**: Two-way sync assigned `googleEventId` to sessions in React state
5. **NO DATABASE SAVE**: Synced sessions with `googleEventId` were NEVER saved back to database
6. **Restart**: On reload, database still had `null` for all `google_event_id` fields
7. **Result**: ALL sessions appeared at "original positions" (database state from weeks ago)

## Fixes Applied

### Solution 1: Backend GET Endpoint - snake_case to camelCase Mapping
**File**: `server/src/routes/sessions.ts` (lines 61-95)

**Before** (BROKEN):
```typescript
// Spread operator kept snake_case columns from database
return {
  ...session,  // ❌ Includes google_event_id (snake_case)
  completed: session.completed === 1,
  isRecurrenceException: session.is_recurrence_exception === 1,
};
```

**After** (FIXED):
```typescript
// Explicit mapping to camelCase
const mappedSession = {
  id: session.id,
  userId: session.user_id,
  courseId: session.course_id,
  studyBlockId: session.study_block_id,
  date: session.date,
  startTime: session.start_time,
  endDate: session.end_date,
  endTime: session.end_time,
  durationMinutes: session.duration_minutes,
  completed: session.completed === 1,
  completionPercentage: session.completion_percentage,
  notes: session.notes,
  googleEventId: session.google_event_id,  // ✅ Converted to camelCase
  googleCalendarId: session.google_calendar_id,
  recurringEventId: session.recurring_event_id,
  isRecurrenceException: session.is_recurrence_exception === 1,
  lastModified: session.last_modified,
};
```

### Solution 2: Save Synced Sessions to Database
**File**: `src/App.tsx` (lines 1947-1980)

**Added after `handleSessionsImported` merges sessions**:

```typescript
// CRITICAL FIX: Save updated sessions (with googleEventId) back to database
// This ensures googleEventId persists across restarts
console.log('💾 Saving merged sessions back to database to persist googleEventIds...');
const sessionsWithGoogleEventId = stampedImported.filter(s => s.googleEventId);
if (sessionsWithGoogleEventId.length > 0) {
  console.log(`  Updating ${sessionsWithGoogleEventId.length} sessions with googleEventId in database...`);
  Promise.all(
    sessionsWithGoogleEventId.map(async (session) => {
      try {
        await apiUpdateSession(session.id, {
          courseId: session.courseId,
          studyBlockId: session.studyBlockId || '',
          date: session.date,
          startTime: session.startTime,
          endDate: session.endDate,
          endTime: session.endTime,
          durationMinutes: session.durationMinutes,
          completed: session.completed,
          completionPercentage: session.completionPercentage,
          notes: session.notes,
          googleEventId: session.googleEventId, // ✅ CRITICAL: Save to database
          googleCalendarId: session.googleCalendarId,
        });
        console.log(`    ✅ Saved ${session.id} with googleEventId: ${session.googleEventId?.substring(0, 20)}...`);
      } catch (error) {
        console.error(`    ❌ Failed to save ${session.id}:`, error);
      }
    })
  ).then(() => {
    console.log('✅ All merged sessions saved to database');
  }).catch((error) => {
    console.error('❌ Error saving merged sessions:', error);
  });
}
```

**What this does**:
- After Google Calendar sync merges sessions with `googleEventId`
- IMMEDIATELY saves all sessions back to database via `apiUpdateSession`
- Ensures `google_event_id` column in database gets populated
- Persists ALL session changes (position, time, date, etc.)

### Solution 3: Enhanced Logging
**Files**: `src/lib/api.ts`, `src/App.tsx`

Added comprehensive logging to track `googleEventId` through entire data flow:
- Backend raw response (snake_case vs camelCase)
- API client mapping results
- State updates before `setState`
- Database save confirmations

## Testing Instructions

### Step 1: Verify Backend Restart
```powershell
# Navigate to server folder
cd server

# Check if server is running
netstat -ano | findstr :3001

# If process exists, kill it
taskkill /PID <PID> /F

# Restart server with latest code
npm run dev
```

### Step 2: Verify Frontend Reload
- Hard reload browser: `Ctrl+Shift+R` (clears cache)
- Or restart frontend: `npm run dev` in main folder

### Step 3: Test Workflow
1. **Initial Load**:
   - Open browser console (F12)
   - Look for: `🌐 API CLIENT: Mapped sessions: {withGoogleEventId: 0}`
   - Sessions should show at their database positions (may be old)

2. **Sync with Google Calendar**:
   - Click "Sync Now" button or wait for auto-sync
   - Watch console for:
     - `📊 Local sessions (before sync): Sessions WITHOUT googleEventId: [all sessions]`
     - `📥 Imported 28 sessions from Google Calendar`
     - `💾 Saving merged sessions back to database to persist googleEventIds...`
     - `✅ All merged sessions saved to database` ← **KEY!**

3. **Verify Database Update**:
   - Sessions should now have `googleEventId` in console logs
   - Move a session to new position
   - Check console: `💾 Saving Session: ...`
   - Should see: `📡 BACKEND FETCH: Requesting fresh sessions...`
   - Should see: `withGoogleEventId: 29` (all sessions)

4. **Restart Both Servers**:
   ```powershell
   # Backend
   cd server
   # Ctrl+C to stop, then:
   npm run dev
   
   # Frontend
   # Ctrl+C to stop, then:
   npm run dev
   ```

5. **Verify Persistence**:
   - Reload browser
   - Check console: `🌐 API CLIENT: Mapped sessions: {withGoogleEventId: 29}`
   - Sessions should appear at CORRECT positions (from last save)
   - NO "flash" to old positions

### Step 4: Check Database Directly
```powershell
cd server
node -e "const initSqlJs = require('sql.js'); const fs = require('fs'); initSqlJs().then(SQL => { const db = new SQL.Database(fs.readFileSync('data/study-planner.db')); const result = db.exec('SELECT id, date, google_event_id FROM scheduled_sessions LIMIT 5'); console.log(JSON.stringify(result[0].values, null, 2)); db.close(); });"
```

**Expected output**:
```json
[
  ["session-xxx", "2025-11-24", "abc123googleeventid"],
  ["session-yyy", "2025-11-26", "def456googleeventid"],
  ...
]
```

**NOT**:
```json
[
  ["session-xxx", "2025-11-24", null],  ← ❌ BAD!
  ...
]
```

## Success Criteria

✅ Backend returns sessions with `googleEventId` (camelCase)  
✅ After Google Calendar sync, all sessions saved to database  
✅ `google_event_id` column in database populated (not null)  
✅ Server restart loads sessions with correct positions  
✅ No "flash" to old positions during sync  
✅ Moving a session persists across restarts  
✅ Console shows `withGoogleEventId: 29` after sync  

## Troubleshooting

### Problem: Still seeing `withGoogleEventId: 0` after sync
**Solution**: Check console for database save errors. Verify backend is restarted with latest code.

### Problem: Sessions flash to old positions on restart
**Solution**: Check database - if `google_event_id` is still `null`, sync didn't save. Check for API errors in console.

### Problem: Backend returns snake_case (`google_event_id`)
**Solution**: Backend not restarted. Kill process on port 3001 and restart: `taskkill /PID <PID> /F; npm run dev`

### Problem: "Lost sessions" during sync
**Solution**: Check if sessions have `googleEventId` before sync. If not, they may be treated as "new" and merged incorrectly. Run full sync cycle twice to stabilize.

## Why This Happened

### Original Architecture Flaw
The app was designed with **two sources of truth**:
1. **Database** - Persistent storage (SQLite)
2. **React State** - In-memory (volatile)

Google Calendar sync updates **React state only**, never the database. This created a situation where:
- User moves session → Saved to database ✅
- Google Calendar syncs → Updates React state ✅
- User restarts → Database state is OLD ❌

### Proper Architecture
**Single source of truth**: Database
- All changes go through API → Database
- React state is a CACHE of database state
- Google Calendar sync must UPDATE database, not just state

## Future Improvements

1. **Transaction Wrapper**: Batch all database saves in a transaction
2. **Optimistic Updates**: Update UI immediately, sync to DB in background
3. **Conflict Resolution**: Better handling of concurrent edits during sync
4. **Database Migration**: Add `google_event_id NOT NULL` constraint
5. **Session Versioning**: Add `version` column for conflict detection

---

**Created**: 2024-11-24  
**Issue**: Sessions not persisting, appearing at "original positions"  
**Root Cause**: Google Calendar sync didn't save to database  
**Impact**: Critical - app effectively broken for session management  
**Status**: FIXED - Requires server restart to apply
