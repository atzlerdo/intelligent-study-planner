# Recurring Sessions Sync Fix

## Issue Identified
When creating a recurring session (e.g., weekly for 5 times), the sync process was breaking the recurrence pattern. The session would be created but the recurrence information was not properly preserved during the two-way sync.

## Root Causes Found

### 1. **Hash Calculation Missing Recurrence Field**
**Location**: `src/lib/googleCalendar.ts` - `syncSessionsToGoogleCalendar()` function

**Problem**: When building the canonical string for hash-based change detection, the `recurrence` field was not included:

```typescript
// BEFORE (incorrect)
const canonical = JSON.stringify({
  summary: eventData.summary,
  description: eventData.description || '',
  start: eventData.start.dateTime,
  end: eventData.end.dateTime,
  courseId: session.courseId || ''
  // ❌ Missing: recurrence field
});
```

**Impact**: The sync algorithm would calculate the same hash for a recurring session whether it had recurrence or not. This meant:
- Changes to recurrence patterns weren't detected
- Updates to recurring sessions might be skipped
- The recurrence field could be lost during sync operations

**Fix**:
```typescript
// AFTER (correct)
const canonical = JSON.stringify({
  summary: eventData.summary,
  description: eventData.description || '',
  start: eventData.start.dateTime,
  end: eventData.end.dateTime,
  courseId: session.courseId || '',
  recurrence: eventData.recurrence || null  // ✅ Now included
});
```

### 2. **Recurring Session Count Not Tracked in Sync Stats**
**Location**: `src/lib/googleCalendar.ts` - `syncSessionsToGoogleCalendar()` function

**Problem**: The sync stats weren't counting recurring sessions during the push operation.

**Fix**: Added tracking before creating the event data:
```typescript
// Track recurring sessions
if (session.recurrence) {
  stats.recurring++;
}
```

### 3. **Insufficient Logging for Debugging**
**Problem**: Hard to diagnose what was happening to the recurrence field during sync/merge operations.

**Fixes**:
- Added detailed logging in `sessionToCalendarEvent()` when adding recurrence to events
- Enhanced merge logging to show recurrence fields for local/remote/chosen versions
- Logs now show RRULE, dtstart, until, count, and exdates

## Testing Checklist

After these fixes, please verify:

1. **Create Recurring Session**
   - [ ] Create a new weekly recurring session (e.g., "5 times every Monday")
   - [ ] Check browser console for log: `🔁 Adding recurrence to event for session...`
   - [ ] Verify RRULE is logged with correct COUNT=5

2. **Sync to Google Calendar**
   - [ ] Trigger sync (automatic or manual)
   - [ ] Open Google Calendar and verify the event shows as recurring
   - [ ] Check that all 5 instances are visible in calendar view
   - [ ] Verify event details show recurrence pattern

3. **Sync from Google Calendar**
   - [ ] Close/refresh the app
   - [ ] Import from Google Calendar
   - [ ] Check console logs for: `📥 Imported ... recurring sessions`
   - [ ] Verify the session still has recurrence field with COUNT=5

4. **Edit Recurring Session**
   - [ ] Modify the recurrence pattern (e.g., change to 10 times)
   - [ ] Sync to Google Calendar
   - [ ] Verify hash recalculation detects the change (not skipped)
   - [ ] Check Google Calendar reflects updated pattern

5. **Two-Way Sync Merge**
   - [ ] Check console log: `✏️ Session ... exists in both`
   - [ ] Verify log shows `chosenRecurrence` with proper RRULE
   - [ ] Ensure whichever version is chosen (local/remote) preserves recurrence

## Implementation Details

### Hash-Based Change Detection
The sync uses FNV-1a hashing to avoid unnecessary API calls. The hash is calculated from a canonical representation of the event. By including the `recurrence` field in this canonical form, we ensure that:
- Recurring sessions are properly tracked as different from non-recurring
- Changes to RRULE parameters trigger updates
- The system can distinguish between "unchanged" and "recurrence removed"

### Recurrence Field Structure
```typescript
session.recurrence = {
  rrule: "FREQ=WEEKLY;COUNT=5;BYDAY=MO",  // RFC 5545 format
  dtstart: "2024-01-15",                   // ISO date
  until: undefined,                         // Optional end date
  count: 5,                                 // Number of occurrences
  exdates: []                              // Excluded dates
}
```

### Google Calendar Event Structure
```typescript
event.recurrence = [
  "RRULE:FREQ=WEEKLY;COUNT=5;BYDAY=MO",   // Main rule
  "EXDATE:20240122,20240129"              // Optional exclusions
]
```

## Console Output to Look For

### Success Indicators
```
🔁 Adding recurrence to event for session abc123:
  rrule: "FREQ=WEEKLY;COUNT=5;BYDAY=MO"
  dtstart: "2024-01-15"
  count: 5

✏️ Session abc123 exists in both, using local version
  chosenRecurrence: { rrule: "...", dtstart: "...", count: 5 }

📥 Imported 15 one-time sessions and 1 recurring sessions
```

### Error Indicators
```
❌ Session ... missing recurrence field after merge
⚠️ Hash collision: recurrence changed but hash unchanged
```

## Related Files
- `src/lib/googleCalendar.ts` - Main sync logic (lines ~480-530)
- `src/components/SessionDialog.tsx` - UI for creating recurring sessions
- `src/components/RecurrencePatternPicker.tsx` - Pattern configuration UI
- `src/types/index.ts` - Type definitions for recurrence field

## Next Steps If Still Broken

If recurrence is still breaking after these fixes:

1. **Check localStorage**
   ```javascript
   // In browser console
   localStorage.getItem('googleCalendarEventHash::...')
   localStorage.getItem('googleCalendarRemoteCache::...')
   ```
   Look for sessions with recurrence field

2. **Clear sync state and retry**
   ```javascript
   // In browser console
   localStorage.removeItem('googleCalendarSyncToken::...')
   localStorage.removeItem('googleCalendarEventHash::...')
   // Then trigger sync again
   ```

3. **Check Google Calendar API response**
   - Open Network tab in DevTools
   - Filter for `googleapis.com`
   - Look for POST/PATCH requests to `/events`
   - Verify request body includes `recurrence` array

4. **Verify RRULE format**
   - Check that RRULE follows RFC 5545
   - No timezone info in RRULE itself (dtstart has date only)
   - Semicolon-separated key=value pairs
