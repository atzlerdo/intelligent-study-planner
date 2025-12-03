# Calendar Selection Feature

## Overview
This document explains the calendar selection feature that handles conflicts when multiple "Intelligent Study Planner" calendars exist in the user's Google account.

## Problem Addressed
**Original Issue**: When users deleted calendars from Google and reconnected the app, the cached calendar ID became stale (404 error), causing connection failures.

**User Request**: "User should be asked how to handle a calendar with the same name... if there is one the user should be asked if he wants to merge with the google calendar or if a new one should be created."

## Solution Architecture

### Components Modified

#### 1. **src/lib/googleCalendar.ts**
Added three new exports:

```typescript
// Interface for calendar setup result
export interface CalendarSetupResult {
  calendarId: string;
  isNew: boolean;
  existingCalendars: Array<{
    id: string;
    summary: string;
    description?: string;
  }>;
}

// Find all existing calendars with matching name
export async function findExistingStudyCalendars(accessToken: string): Promise<Array<...>>

// Set the active calendar ID (user's choice)
export function setActiveCalendar(calendarId: string): void
```

**Enhanced `getOrCreateStudyCalendar()`**:
- Added stale cache detection: catches 404 errors and clears invalid cache
- Returns to normal flow if cached ID is invalid
- Logs warnings when cache is stale

#### 2. **src/components/CalendarSelectionDialog.tsx** (NEW)
A new dialog component that presents the user with calendar options:

**Features**:
- Shows all existing calendars with the name "Intelligent Study Planner"
- Displays calendar IDs and descriptions
- Offers "Create new calendar" option
- Uses shadcn/ui RadioGroup for selection
- Styled with Tailwind CSS for consistency

**Props**:
```typescript
interface CalendarSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingCalendars: CalendarOption[];
  onSelect: (calendarId: string | 'create-new') => void;
}
```

#### 3. **src/components/CalendarSync.tsx**
Modified OAuth connection flow:

**Added State**:
```typescript
const [showCalendarDialog, setShowCalendarDialog] = useState(false);
const [pendingToken, setPendingToken] = useState<string | null>(null);
const [existingCalendars, setExistingCalendars] = useState<Array<...>>([]);
```

**New Helper Functions**:
- `completeConnection(token)`: Finalizes the connection after user choice
- `handleCalendarSelection(selection)`: Processes user's calendar choice

**Modified OAuth Flow**:
```typescript
onSuccess: async (tokenResponse) => {
  // 1. Validate token
  const tokenCheck = await validateAccessToken(token);
  
  // 2. Check for existing calendars
  const calendars = await findExistingStudyCalendars(token);
  
  // 3. If calendars exist, show dialog
  if (calendars.length > 0) {
    setExistingCalendars(calendars);
    setPendingToken(token);
    setShowCalendarDialog(true);
    return; // Wait for user choice
  }
  
  // 4. No conflicts, proceed directly
  await completeConnection(token);
}
```

## User Flow

### Scenario 1: No Existing Calendars (Original Behavior)
1. User clicks "Connect Google Calendar"
2. OAuth login succeeds
3. App checks for existing calendars → none found
4. App automatically creates new calendar
5. Connection completes

### Scenario 2: One or More Existing Calendars (NEW)
1. User clicks "Connect Google Calendar"
2. OAuth login succeeds
3. App checks for existing calendars → found 1+
4. **Dialog appears** showing options:
   - Use existing calendar (shows calendar ID)
   - Create new calendar
5. User selects option and clicks "Continue"
6. App processes choice:
   - If "Create new": Clear cached ID, let system create fresh calendar
   - If existing: Set cached ID to user's choice
7. Connection completes

### Scenario 3: Stale Cache Handling
1. App has cached calendar ID from previous session
2. User deleted that calendar from Google
3. App tries to validate cached ID → receives 404
4. Cache is cleared automatically
5. Next connection will check for existing calendars (Scenario 1 or 2)

## Technical Details

### Calendar Detection Logic
```typescript
export async function findExistingStudyCalendars(accessToken: string) {
  const response = await fetchJson<CalendarListResponse>(
    `${CALENDAR_API_BASE_URL}/users/me/calendarList?minAccessRole=owner`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  
  // Filter for calendars with matching name
  return (response.items || [])
    .filter(cal => cal.summary === CALENDAR_NAME)
    .map(cal => ({
      id: cal.id,
      summary: cal.summary,
      description: cal.description,
    }));
}
```

### Cache Management
```typescript
const CALENDAR_ID_STORAGE_KEY = 'googleCalendarStudyCalendarId';

// Get cached ID
function getStudyCalendarId(): string | null {
  return localStorage.getItem(CALENDAR_ID_STORAGE_KEY);
}

// Set active calendar (user's choice or newly created)
export function setActiveCalendar(calendarId: string): void {
  localStorage.setItem(CALENDAR_ID_STORAGE_KEY, calendarId);
  console.log('✅ Set active calendar:', calendarId);
}

// Clear stale cache
function clearStudyCalendarId(): void {
  localStorage.removeItem(CALENDAR_ID_STORAGE_KEY);
}
```

### Error Handling
- **Token validation**: Checks token validity before any API calls
- **404 detection**: Catches stale cache and clears it
- **User cancellation**: Dialog can be closed without making selection
- **Connection failure**: Shows error messages in UI

## Testing Scenarios

### Test 1: First-time Connection
1. Clear localStorage (no cache)
2. Connect to Google Calendar
3. **Expected**: Auto-creates calendar, no dialog

### Test 2: Existing Calendar Detection
1. Manually create calendar named "Intelligent Study Planner" in Google
2. Connect to app
3. **Expected**: Dialog shows with options to use existing or create new

### Test 3: Multiple Calendars
1. Create 2+ calendars named "Intelligent Study Planner"
2. Connect to app
3. **Expected**: Dialog shows all options, plus "Create new"

### Test 4: Stale Cache Recovery
1. Connect to app (creates calendar)
2. Manually delete calendar from Google
3. Disconnect and reconnect
4. **Expected**: 404 caught, cache cleared, dialog shows if other calendars exist

### Test 5: User Creates New
1. Connect when existing calendar present
2. Select "Create new calendar" in dialog
3. **Expected**: New calendar created, cache updated to new ID

### Test 6: User Selects Existing
1. Connect when existing calendar present
2. Select existing calendar in dialog
3. **Expected**: Cache set to selected ID, sync uses that calendar

## Security Considerations

- **User-specific data**: Calendar tokens stored in backend database with `user_id` isolation
- **OAuth scope**: Only requests `calendar` scope (read/write events)
- **Token validation**: All API calls validate token before use
- **No cross-user access**: Each user can only see their own calendars

## Known Limitations

1. **Cache not user-specific**: `localStorage` keys don't include `userId`
   - Workaround: Each browser profile/user has separate storage
   - TODO: Include userId in cache keys for multi-user scenarios

2. **No token refresh**: Access tokens expire after ~1 hour
   - Workaround: User must reconnect when token expires
   - TODO: Implement refresh token flow

3. **Calendar name hardcoded**: Always searches for "Intelligent Study Planner"
   - Future: Allow custom calendar names

## Debugging

### Console Logs
- `📋 Found N existing calendar(s), showing selection dialog`
- `🆕 No existing calendars found, will create new one`
- `🆕 User chose to create new calendar`
- `✅ User selected existing calendar: [ID]`
- `⚠️ Cached calendar no longer exists (404), clearing cache`

### localStorage Inspection
```javascript
// Check cached calendar ID
localStorage.getItem('googleCalendarStudyCalendarId')

// Clear cache manually
localStorage.removeItem('googleCalendarStudyCalendarId')
```

## Related Files

- `src/lib/googleCalendar.ts` - Core calendar API logic
- `src/components/CalendarSync.tsx` - Connection UI and OAuth flow
- `src/components/CalendarSelectionDialog.tsx` - Dialog component
- `src/components/GoogleCalendarSyncService.tsx` - Background sync service
- `GOOGLE_CALENDAR_FIX.md` - Documentation for duplication fixes

## Future Enhancements

1. **Calendar rename detection**: Warn if user renamed the calendar
2. **Conflict resolution**: Show events from both calendars before merging
3. **Multi-calendar support**: Allow syncing to multiple calendars
4. **Calendar preview**: Show calendar color and recent events in dialog
5. **Bulk operations**: "Merge all study calendars" option
6. **Custom naming**: Let users choose calendar name on creation
