# Recurring Sessions Implementation

## Overview
Users can now create recurring study sessions with full recurrence pattern configuration. This feature integrates seamlessly with Google Calendar's RRULE specification (RFC 5545).

## User Interface

### Session Dialog Updates
When creating or editing a session, users now see:

1. **Recurrence Toggle** - A switch labeled "Wiederholen" (Repeat) with a ♻️ icon
2. **Recurrence Pattern Picker** - Appears when toggle is enabled with:
   - **Frequency Selector**: Daily, Weekly, Monthly, or Yearly repetition
   - **Interval Input**: Repeat every N days/weeks/months/years
   - **Weekday Picker** (for WEEKLY): Visual button grid (Mo-So) for selecting specific days
   - **Month Day Input** (for MONTHLY): Specify which day of the month (1-31)
   - **End Condition**:
     - Never (infinite repetition)
     - Until date (ends on specific date with calendar picker)
     - After N occurrences (ends after count)

### Validation
The form validates:
- At least one weekday must be selected for WEEKLY frequency
- End date must be after start date
- Pattern must be configured before submission

## Data Structure

### ScheduledSession Type
Recurring sessions now include an optional `recurrence` field:

```typescript
{
  recurrence?: {
    rrule: string;        // "FREQ=WEEKLY;BYDAY=MO,WE,FR"
    dtstart: string;      // "2024-01-15" (ISO date)
    until?: string;       // "2024-06-30" (optional end date)
    count?: number;       // 10 (optional occurrence count)
    exdates?: string[];   // ["2024-02-05"] (excluded dates)
  }
}
```

### RRULE Format
The `rrule` string follows RFC 5545 format:
- `FREQ=DAILY|WEEKLY|MONTHLY|YEARLY`
- `INTERVAL=N` (if > 1)
- `BYDAY=MO,TU,WE,TH,FR,SA,SU` (for WEEKLY)
- `BYMONTHDAY=1-31` (for MONTHLY)
- `UNTIL=YYYYMMDDTHHMMSSZ` (if end date specified)
- `COUNT=N` (if occurrence count specified)

## Storage Architecture

### Master + Exceptions Pattern
Following Google Calendar's architecture:
- **Master Session**: One record with recurrence pattern
- **Exception Instances**: Separate records for modified/cancelled occurrences
  - `recurringEventId`: References master session
  - `isRecurrenceException`: Flag marking as exception

### Benefits
- Compact storage (1 master vs. 100s of expanded instances)
- No sync conflicts when deleting instances
- Mirrors Google Calendar's structure for seamless sync
- Easy to modify entire series or single instances

## Display Logic

### UI Expansion
The `expandSessionInstances()` utility function (in `googleCalendar.ts`) generates individual occurrences for display:
- Takes master session with recurrence pattern
- Uses `rrule` library to generate instances within date range
- Returns array of ScheduledSession instances for rendering

```typescript
// Example: Expand for calendar view
const instances = expandSessionInstances(masterSession, startDate, endDate);
// Returns: [session1, session2, session3, ...]
```

### Where to Use
- `WeekCalendar.tsx` - Show recurring sessions in week view
- `CalendarView.tsx` - Month view rendering
- Session lists and reports

## Google Calendar Sync

### Export (Local → Google)
When syncing to Google Calendar:
1. Master sessions with `recurrence` field → Create recurring event with RRULE
2. Exception instances → Create override events with `recurringEventId`

### Import (Google → Local)
When importing from Google Calendar:
1. Recurring master events → Store as single session with `recurrence` field
2. Exception/override events → Store as separate sessions with `recurringEventId`

### Deletion Handling
- **Delete Master**: Deletes entire series in both systems
- **Delete Instance**: Add to `exdates` array (implementation pending in UI)

## Helper Functions

### RecurrencePatternPicker.tsx Exports
```typescript
// Build RRULE string from pattern object
buildRRuleString(pattern: RecurrencePattern, dtstart: string): string

// Parse RRULE string back to pattern object
parseRRuleString(rrule: string, dtstart: string): RecurrencePattern | null
```

## Implementation Files
- `src/components/RecurrencePatternPicker.tsx` - UI component for pattern configuration
- `src/components/SessionDialog.tsx` - Integrated recurrence toggle and picker
- `src/lib/googleCalendar.ts` - Sync logic and expansion utility
- `src/types/index.ts` - Type definitions for recurrence

## Next Steps (Optional Enhancements)

### UI Improvements
1. **Visual Indicators**: Add ♻️ icon to recurring sessions in calendar views
2. **Human-Readable Summary**: Show "Every Monday and Wednesday" using `rrule.toText()`
3. **Exception Handling**: Add UI to modify/delete single instances
4. **Deletion Dialog**: "Delete this instance" vs "Delete series" confirmation

### Advanced Features
1. **Edit Series**: Modify all future occurrences
2. **Exception Management**: Edit specific occurrences (change time, duration, etc.)
3. **Exclusion Dates UI**: Manually add dates to skip (holidays, etc.)
4. **Preview**: Show upcoming occurrences before saving

### Performance
1. **Lazy Loading**: Only expand instances in visible date range
2. **Caching**: Cache expanded instances with invalidation on pattern change

## Testing Checklist
- [ ] Create daily recurring session
- [ ] Create weekly session with multiple days (Mo, We, Fr)
- [ ] Create monthly session on specific day
- [ ] Set end date (Until)
- [ ] Set occurrence count (After N times)
- [ ] Edit recurring session and verify pattern persists
- [ ] Sync to Google Calendar and verify recurring event created
- [ ] Import recurring event from Google Calendar
- [ ] Check localStorage persistence after page refresh

## Notes
- All dates use local timezone (no UTC conversion) to match user's schedule
- German localization used throughout UI ("Wiederholen", "Woche(n)", etc.)
- Compatible with existing non-recurring sessions (backwards compatible)
- Build successful: 732KB bundle (includes rrule library)
