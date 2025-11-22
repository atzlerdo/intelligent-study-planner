# Enhanced Logging Guide

## Overview
Comprehensive logging has been added to track session lifecycle, Google Calendar sync operations, and the merge process. This helps diagnose issues like sessions disappearing, losing their `googleEventId`, or reappearing after deletion.

## What Was Added

### 1. Google Calendar Merge Logging (`src/lib/googleCalendar.ts`)

#### At Sync Start (lines ~1306-1310)
- Shows local sessions BEFORE sync begins
- Separates sessions WITH vs WITHOUT `googleEventId`
- Example:
  ```
  📊 Local sessions (before sync): 5 total, 5 after filtering expanded instances
     Sessions WITH googleEventId: session-123:d9t4co7c..., session-456:oenf0jgv...
     Sessions WITHOUT googleEventId: session-789 (2025-11-22)
  ```

#### During Merge - Session-Level Detail (lines ~1433-1458)
When both local and remote versions exist:
```javascript
✏️ Session {id} exists in both, using {remote|local} version
   remote: { mod: "2025-11-21T15:30:00.000Z", googleEventId: "d9t4co7c..." }
   local: { mod: "2025-11-21T15:25:00.000Z", googleEventId: "none" }
   chosen: { version: "remote", googleEventId: "d9t4co7c..." }
   merged: { googleEventId: "d9t4co7c...", googleCalendarId: "primary" }
```

**Key fields to watch:**
- `chosen.googleEventId` - Which version was picked
- `merged.googleEventId` - Final result (should ALWAYS have a value if from Google)

#### When Preserving Recurrence (lines ~1432-1441)
```javascript
🔒 Session {id} is recurring locally but not in remote - preserving local recurrence data
   local: { googleEventId: "none", recurrence: "FREQ=WEEKLY..." }
   remote: { googleEventId: "d9t4co7c..." }
   merged: { googleEventId: "d9t4co7c...", googleCalendarId: "primary" }
```

#### Only in Google Calendar (lines ~1475-1493)
Shows why a session was added/ignored:
```javascript
➕ Session {id} only in Google Calendar, adding to app
   googleEventId: "1qnl6s86...", date: "2025-11-22", startTime: "14:00", courseId: "course-123"
```

Or:
```javascript
🗑️ Session {id} was deleted locally (in previouslySyncedIds but not in app state), will be removed from Google Calendar
   googleEventId: "1qnl6s86...", date: "2025-11-22", startTime: "14:00", courseId: "course-123"
```

#### Merge Summary (lines ~1509-1517)
```
┌─────────────────────────────────────────────────────────┐
│ MERGED RESULT                                           │
├─────────────────────────────────────────────────────────┤
│ Total sessions: 5
│ Recurring masters: 0
│ Standalone sessions: 5
│ Expanded instances (should be 0): 0
│ Sessions WITH googleEventId: session-123:d9t4co7c..., session-456:oenf0jgv...
│ Sessions WITHOUT googleEventId: session-789 (date:2025-11-22)
└─────────────────────────────────────────────────────────┘
```

### 2. App State Merge Logging (`src/App.tsx`)

#### Merge Analysis (lines ~1459-1475)
Shows which sessions are where:
```javascript
🔍 MERGE ANALYSIS:
  - Sessions ONLY in app (not synced): 
      session-789 (date:2025-11-22, googleEventId:none)
  - Sessions ONLY in Google (not in app): 
      1qnl6s86... (date:2025-11-23, googleEventId:1qnl6s86...)
  - Sessions in BOTH: 
      session-123 (curr.googleEventId:none, sync.googleEventId:d9t4co7c...)
```

#### Conflict Resolution (lines ~1488-1499)
```javascript
✅ Using synced version of session-123
   synced: { mod: "2025-11-21T15:30:00.000Z", googleEventId: "d9t4co7c..." }
   local: { mod: "2025-11-21T15:25:00.000Z", googleEventId: "none" }
```

Or when modified during sync:
```javascript
🔄 Conflict: Session session-123 modified during sync - preserving local changes
   local: { mod: "2025-11-21T15:35:00.000Z", googleEventId: "none" }
   synced: { mod: "2025-11-21T15:30:00.000Z", googleEventId: "d9t4co7c..." }
```

#### Session Not in Sync Result (lines ~1507-1530)
When a session exists locally but not in synced result:
```javascript
🗑️ Removing local session session-456 - was synced to Google (has googleEventId) but deleted from calendar
   googleEventId: "oenf0jgv...", date: "2025-11-22", startTime: "16:00", courseId: "course-123"
```

Or:
```javascript
📍 Preserving local-only session session-789 (never synced to Google)
   date: "2025-11-22", startTime: "17:00", courseId: "course-456"
```

#### Final App State (lines ~1534-1543)
```
┌─────────────────────────────────────────────────────────┐
│ FINAL APP STATE AFTER MERGE                             │
├─────────────────────────────────────────────────────────┤
│ Total sessions: 4
│ Recurring masters: []
│ Expanded instances (should be 0): 0
│ Sessions WITH googleEventId: session-123:d9t4co7c..., session-456:oenf0jgv...
│ Sessions WITHOUT googleEventId: session-789 (date:2025-11-22)
└─────────────────────────────────────────────────────────┘
```

### 3. Session CRUD Logging (`src/App.tsx`)

#### On Save (lines ~1237-1249)
```javascript
💾 Saving Session:
   isEditing: true
   editingSessionId: "session-123"
   editingGoogleEventId: "d9t4co7c..."
   sessionData: {
     date: "2025-11-22", startTime: "14:00", endTime: "15:00",
     course: "course-456", duration: 60,
     googleEventId: "d9t4co7c..."
   }
```

#### On Delete (lines ~1336-1343)
```javascript
🗑️ App: Deleting session session-123
   googleEventId: "d9t4co7c..."
   date: "2025-11-22"
   startTime: "14:00"
   courseId: "course-456"
   hasGoogleEventId: true
```

## How to Use These Logs

### Scenario 1: Session Disappears from App
1. Look for deletion logs: `🗑️ App: Deleting session`
2. Check merge: Was it marked as deleted? `🗑️ Removing local session ... - was synced to Google`
3. Check if it had `googleEventId` - if YES, removal is intentional (deleted from Google)
4. If NO `googleEventId`, should have been preserved: `📍 Preserving local-only session`

### Scenario 2: Session Loses googleEventId
1. Check "Local sessions (before sync)" - did it have `googleEventId`?
2. Look at merge for that session: `✏️ Session {id} exists in both`
3. Check `merged.googleEventId` - should ALWAYS be set if came from Google
4. Check "FINAL APP STATE" - should show in "WITH googleEventId" list

### Scenario 3: Deleted Session Reappears
1. Check if session had `googleEventId` when deleted
2. Look for: `🗑️ Session {id} was deleted locally ... will be removed from Google Calendar`
3. If still reappears, check grace period: `⏳ Session {id} was recently deleted locally, ignoring`
4. Grace period is 5 minutes - session should be removed from Google after that

### Scenario 4: Session Created in Google Doesn't Appear in App
1. Look for: `➕ Session {id} only in Google Calendar, adding to app`
2. Check "FINAL APP STATE" - should be in the list
3. If missing, check if it was filtered: `⏭️ Filtering expanded instance`

## Key Fields to Monitor

### googleEventId
- **Critical for resurrection check** - sessions without this are treated as "never synced"
- Should be populated by merge when session comes from Google
- Pattern: `{random_alphanumeric}` (e.g., `d9t4co7cl3vpcln1j4u7bbv2no`)

### lastModified
- Used for conflict resolution
- Format: Unix timestamp (milliseconds)
- Newer version wins in merge

### Session ID Formats
- **App-generated**: `session-{timestamp}-{random}` (e.g., `session-1763728190269-kpq0woris`)
- **Google-generated**: `{random_alphanumeric}` (e.g., `1qnl6s8612310521dvp1ei6aah`)

## Reading the Logs: Step-by-Step Example

### Example Log Sequence:
```
🔄 TWO-WAY SYNC STARTED
📊 Local sessions (before sync): 3 total, 3 after filtering
   Sessions WITH googleEventId: session-123:d9t4co7c...
   Sessions WITHOUT googleEventId: session-456 (2025-11-22), session-789 (2025-11-23)

✏️ Session session-123 exists in both, using remote version
   merged: { googleEventId: "d9t4co7c...", googleCalendarId: "primary" }

➕ Session 1qnl6s86... only in Google Calendar, adding to app
   googleEventId: "1qnl6s86...", date: "2025-11-24"

┌─────────────────────────────────────────────────────────┐
│ MERGED RESULT                                           │
│ Sessions WITH googleEventId: session-123:d9t4co7c..., 1qnl6s86...:1qnl6s86...
│ Sessions WITHOUT googleEventId: session-456, session-789
└─────────────────────────────────────────────────────────┘

🔍 MERGE ANALYSIS:
  - Sessions ONLY in app: session-456, session-789
  - Sessions ONLY in Google: 1qnl6s86...
  - Sessions in BOTH: session-123

✅ Using synced version of session-123
   synced: { googleEventId: "d9t4co7c..." }

📍 Preserving local-only session session-456
📍 Preserving local-only session session-789

┌─────────────────────────────────────────────────────────┐
│ FINAL APP STATE AFTER MERGE                             │
│ Total sessions: 4
│ Sessions WITH googleEventId: session-123:d9t4co7c..., 1qnl6s86...:1qnl6s86...
│ Sessions WITHOUT googleEventId: session-456, session-789
└─────────────────────────────────────────────────────────┘
```

**What this tells us:**
1. Sync started with 3 local sessions (1 with googleEventId, 2 without)
2. Session-123 existed both locally and in Google - used Google version (has googleEventId)
3. Session 1qnl6s86 was only in Google - imported to app
4. Sessions 456 and 789 are local-only (not yet synced) - preserved for future sync
5. Final state: 4 sessions total, 2 synced to Google, 2 pending sync

## Troubleshooting Checklist

When investigating session issues:

- [ ] Hard refresh browser (Ctrl+Shift+R) to ensure latest code
- [ ] Check "Local sessions (before sync)" - baseline state
- [ ] Check merge logs for specific session ID
- [ ] Verify `googleEventId` preserved through merge
- [ ] Check "FINAL APP STATE" - expected result
- [ ] Look for deletion logs if session missing
- [ ] Verify grace period if recently deleted
- [ ] Check if session filtered as expanded instance

## Performance Notes

- Logs are verbose during sync operations
- Use browser console filters: `TWO-WAY SYNC`, `MERGE ANALYSIS`, `FINAL APP STATE`
- Logs auto-collapse objects - expand to see details
- Consider saving logs to file for detailed analysis (right-click console → Save As...)
