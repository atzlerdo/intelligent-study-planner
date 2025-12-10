# Changelog

## v0.6.11 - 2025-12-10

- Fix: Resolve Vite/Babel build failure by removing a duplicate `recalcStudyProgramFromCourses` declaration in `src/App.tsx` that caused "Identifier has already been declared" errors. Keeps the functional `setStudyProgram(prev => ...)` implementation to avoid effect dependency loops and unauthorized pre-auth updates.
- Fix: Normalize course progress bar math in `src/components/courses/CoursesView.tsx` to prevent NaN/overflow when `estimatedHours` is zero or when `completedHours + scheduledHours` exceeds `estimatedHours`. Segments (completed/scheduled/remaining) are clamped and percentages are bounded to sum to ≤ 100%.
- Behavior: Validate and align the active course list rule so a course appears as active only if it has at least one session (future planned, past planned, or past attended). Newly created courses without sessions no longer show up in the active list.
- DevX: Keep lint clean; ensure effects/persistence run only after authentication; no unauthorized PUTs during login.
- Data: Include `server/data/study-planner.db` with seed test data for quick local verification. Test user documented in README (email/password) remains applicable.


## [v0.6.10] - 2025-12-07

### Compact Overview
- Fix: Restored missing app state in `App.tsx` (`currentView`, `autoSyncTrigger`, dialog booleans) and re-added `generateMockSessions` import to resolve build errors.
- Fix: Prevented accidental session creation during drag by switching day-grid interactions to pointer events in `WeekCalendar.tsx` and aligning with session drag handlers.
- UX: After creating a course from `SessionDialog`, the dialog reopens with previous date/time and the new course preselected.
- Behavior: Courses only auto-activate from `planned` → `active` when a past session exists; future-only sessions no longer activate courses.
- Stability: Removed stray top-level `await`, fixed `SessionDialog` initialization effect dependencies, and verified TypeScript/Vite production build.
- Visibility: Dashboard filtering includes planned courses to ensure assigned sessions remain visible.

## [v0.6.9] - 2024-11-24
  - Past sessions showed in yellow "planned hours" bar instead of being excluded
## [v0.6.10] - 2025-12-08
- Calendar (mobile): Default to 4-day view with a user-toggle to restore 7 days; preference persisted in localStorage (`calendar.mobileDaysPerView`).
- Calendar (week view): Overlapping sessions now render side-by-side using a sweep-line layout per day.
- Scripts: Added `server/scripts/deduplicate-sessions.cjs` to safely remove duplicate scheduled sessions per user (keeps latest by `last_modified`).
- Backend/scripts alignment: Standardized all maintenance scripts to respect `DATABASE_PATH` for consistent DB targeting.
- Password reset script: Cleaned duplicate code in `reset-password.cjs`; unified env-aware behavior and fixed Windows buffer write.
- Documentation: README updated with explicit test user, DB alignment instructions, and safety notes about secrets.
- **Fix**: Changed ALL scheduledHours calculations to compare session **end time** (date + time) with current timestamp
## v0.6.11 – Mobile Logout, Menu Consistency, Calendar Removal

### Changes
- Mobile burger menu updated to include all relevant web menu items.
- Added explicit Logout action in the mobile burger menu, wired to authentication state.
- Strengthened mobile logout handling to reliably show the authentication screen by resetting `authChecked` and closing residual dialogs.
- Removed Calendar view from application routing and mobile menu (feature not in use).
- Added bottom-right add-course button in Courses view, matching burger menu style and size.

### Security and Secrets
- No secrets are committed to the repository. Only demo credentials are referenced for testing:
  - Email: `test@test.test`
  - Password: `testtest`
- Authentication tokens are stored in `localStorage` and cleared on logout.
- Google Calendar cache keys are purged on logout to prevent cross-user leakage.

### Documentation
- Converted notes to documentation-style formatting across README and related guides.
- Removed decorative icons/emoji from documentation for a professional tone.
- **Technical Details**:
  - **OLD**: `session.date < today` → Only excluded sessions from previous days
  - **NEW**: `new Date(session.date + 'T' + session.endTime) <= now` → Excludes any session that has ended
  - Applied to all three calculation points:
    1. Initial app load (lines 862-875)
    2. Session create/edit/delete (lines 1625-1638)
    3. Attendance tracking (lines 1107-1120)
    4. Course auto-activation check (lines 1673-1681)
- **Why it matters**: Users often create past sessions to log study time retroactively. These should NEVER appear in "planned hours" (yellow bar), only in "completed hours" (green bar) after marking attended.

## [v0.6.8] - 2024-11-24

### Fixed - scheduledHours Jump When Marking Past Sessions Complete
- **Problem**: When marking a past session as attended, scheduledHours jumped to incorrect value (e.g., 23h instead of staying at current value)
- **Root cause**: `handleSessionFeedback` was refreshing courses from backend but NOT recalculating `scheduledHours` from session data
- **Impact**: Progress bars showed wrong "planned hours" after attendance tracking, confusing users
- **Fix**: Added same scheduledHours recalculation logic used in `handleSaveSession` to `handleSessionFeedback`
- **Technical Details**:
  - After updating session attendance (line 1100), courses are refreshed from backend
  - **NEW**: Calculate `scheduledHours` from future sessions (date >= today) before updating state
  - Ensures consistency: scheduled hours always accurate after ANY session operation
  - Same calculation pattern: initial load, session create/edit, attendance tracking
- **Log output**: Shows if scheduledHours corrected: `"📊 Attendance update - Course [name]: scheduledHours [old]h → [new]h"`

## [v0.6.7] - 2024-11-24

### Fixed - Progress Bars Incorrect on Initial App Load
- **Problem**: When the app loaded, progress bars showed incorrect values until first session was created/edited
- **Root cause**: Backend returned courses with potentially stale `scheduledHours` values. The app was recalculating `completedHours` on load (to fix attendance tracking bugs) but NOT recalculating `scheduledHours`
- **Impact**: Users saw wrong progress bars on page load, creating confusion and lack of trust
- **Fix**: Added `scheduledHours` recalculation during initial app load (same logic used after session changes)
- **Technical Details**:
  - On initial load (line 850), after fetching courses and sessions:
    1. Recalculate `completedHours` from attended sessions (existing fix)
    2. **NEW**: Recalculate `scheduledHours` from future sessions (date >= today)
    3. Update course state with both corrected values
  - Same calculation logic as used in `handleSaveSession` (lines 1570-1584)
  - Ensures consistency: progress bars accurate immediately on app load
- **Log output**: Shows which courses had scheduledHours corrected: `"📊 Initial load - Course [name]: scheduledHours [old]h → [new]h"`

## [v0.6.6] - 2024-11-24

### Fixed - Unassigned Future Sessions Not Counted in Overall Progress
- **Problem**: Unassigned sessions (blockers/planned time) in the future were not counted in the overall progress bar's "scheduled hours" segment
- **Impact**: Progress bar showed less scheduled time than reality, making it look like less study time was planned
- **Root cause**: `course.scheduledHours` only tracks sessions assigned to courses. Unassigned future sessions were excluded from overall totals.
- **Fix**: Dashboard now adds unassigned future session hours to the total scheduled hours calculation
- **Technical Details**:
  - **Overall progress bar**: Counts both assigned sessions (from `course.scheduledHours`) AND unassigned future sessions
  - **Per-course progress bars**: Still only count sessions assigned to that specific course (correct behavior)
  - **Calculation**:
    ```typescript
    // Course scheduled hours (assigned sessions only)
    const scheduledHoursFromCourses = activeCourses.reduce((sum, c) => sum + c.scheduledHours, 0);
    
    // Add unassigned future sessions (blockers/planned time)
    const unassignedFutureHours = scheduledSessions
      .filter(s => !s.courseId && !s.completed && s.date >= today)
      .reduce((sum, s) => sum + (s.durationMinutes / 60), 0);
    
    const scheduledHours = scheduledHoursFromCourses + unassignedFutureHours;
    ```
- **Why this matters**: Users create unassigned "blocker" sessions to reserve study time before deciding which course to work on. These should count toward total planned study hours.

## [v0.6.5] - 2024-11-24

### Fixed - Progress Bar Jumping Issue
- **Problem**: When creating/deleting sessions, the progress bar would jump between different values (e.g., 21h → 5h → 21h)
- **Root cause**: `Dashboard.tsx` was calculating `scheduledHours` from sessions independently, while `App.tsx` was also calculating and storing it in `course.scheduledHours`. These calculations ran at different times, causing race conditions and inconsistent UI updates.
- **Impact**: 
  - Progress bar showed incorrect values during session operations
  - Created visual confusion and lack of trust in the data
  - Yellow "planned" segment flickered between different sizes
- **Fix**: Changed Dashboard to use `course.scheduledHours` as single source of truth instead of recalculating from sessions
- **Technical Details**:
  - **Old behavior** (WRONG):
    ```typescript
    // Dashboard.tsx lines 51-53
    const scheduledHours = scheduledSessions
      .filter(s => !s.completed && s.date >= today)
      .reduce((sum, s) => sum + (s.durationMinutes / 60), 0);
    ```
  - **New behavior** (CORRECT):
    ```typescript
    // Dashboard.tsx lines 49-52
    const scheduledHours = activeCourses.reduce((sum, c) => sum + c.scheduledHours, 0);
    ```
  - `course.scheduledHours` is updated atomically with session changes in App.tsx (lines 1571-1580)
  - This ensures UI consistency across all components
- **Side effect fixed**: Overall progress bar now stable, per-course progress bars also fixed

## [v0.6.4] - 2024-11-24

### Fixed - Unassigned Session Workflow (courseId Persistence & Color Logic)
- **🔴 CRITICAL UPDATE**: Fixed unassigned sessions not showing as green after marking attended and assigning to course
- **Discovery**: After marking unassigned session (courseId: null) as attended AND assigning it to a course:
  1. Backend correctly saved courseId and completed flag ✅
  2. BUT merge logic overwrote incoming courseId with stale local courseId: null ❌
  3. Session appeared to "disappear" or stay gray even though marked attended
- **Root causes**:
  1. **courseId persistence bug**: Same merge issue as v0.6.3 but for `courseId` field instead of `completed`
  2. **Color logic order bug**: `getSessionColor()` checked `if (!courseId)` BEFORE checking `if (completed)`, so unassigned sessions returned gray immediately
- **Impact**: 
  - Unassigned sessions marked attended never turned green
  - Assigning courseId to unassigned session didn't persist in UI
  - Sessions with courseId assigned from creation worked perfectly (see v0.6.2+v0.6.3)
  - Retroactive time tracking workflow completely broken
- **Symptoms**:
  - User clicks unassigned past session (gray block)
  - Marks attended, assigns to course, saves
  - Evaluation button disappears ✅
  - Course hours update correctly ✅
  - BUT session still gray (or appears to vanish if in course-filtered view)
  - Logs showed: "🎯 WILL USE courseId: course-xxx" but UI still had courseId: null
- **Fix #1**: Added `courseId: incoming.courseId` to both merge paths in `mergeSessionsPreserveGoogle` (same locations as v0.6.3 fix)
- **Fix #2**: Reordered `getSessionColor()` to check `completed` BEFORE checking `courseId` so unassigned sessions can show as green

### Technical Details
- **Fix location #1**: `src/App.tsx` lines 110-137 (Google-linked sessions merge)
- **Fix location #2**: `src/App.tsx` lines 144-165 (fresher local sessions merge)
- **Fix location #3**: `src/components/WeekCalendar.tsx` lines 375-391 (color logic reordering)
- **Old merge behavior** (WRONG):
  ```typescript
  return {
    ...incoming,
    ...local,  // ❌ Overwrites courseId from backend
    completed: incoming.completed,
    completionPercentage: incoming.completionPercentage,
    // ... more fields
  };
  ```
- **New merge behavior** (CORRECT):
  ```typescript
  return {
    ...incoming,
    ...local,
    // Backend is source of truth for attendance AND course assignments
    completed: incoming.completed,
    completionPercentage: incoming.completionPercentage,
    courseId: incoming.courseId,  // ✅ Preserve from backend
    // ... more fields
  };
  ```
- **Old color logic** (WRONG):
  ```typescript
  if (!session.courseId) {
    return 'gray';  // ❌ Returns BEFORE checking completed
  }
  if (session.completed) {
    return 'green';  // Never reached for unassigned
  }
  ```
- **New color logic** (CORRECT):
  ```typescript
  if (session.completed) {
    return 'green';  // ✅ Check completed FIRST
  }
  if (!session.courseId) {
    return 'gray';  // Only for unassigned pending sessions
  }
  ```
- **Enhanced logging**: Added courseId tracking to merge logs (🚨 LOCAL courseId, ✅ INCOMING courseId, 🎯 WILL USE courseId)

### Complete Workflow Now Working
1. Create unassigned session (blocker) in past → gray
2. Mark attended → SessionAttendanceDialog appears
3. Click "Yes, I attended" → SessionFeedbackDialog appears
4. Select course, enter hours/progress → Save
5. Backend saves courseId + completed + completionPercentage ✅
6. Merge preserves ALL three fields from backend ✅
7. Color logic checks completed first → session turns green ✅
8. Session visible in course-filtered views ✅

## [v0.6.3] - 2024-11-24

### Fixed - Critical Session Merge Bug (Attendance Data Loss) - PART 2
- **🔴 CRITICAL UPDATE**: Fixed SECOND location where merge logic was overwriting attendance data
- **Discovery**: After initial fix to `handleGoogleCalendarSync`, attendance data was STILL being lost in `mergeSessionsPreserveGoogle` helper function
- **Root cause**: Two places in merge logic were spreading `...local` over `...incoming`, which overwrote backend `completed: true` with stale local `completed: false`:
  1. When `isProtected || local.googleEventId` (lines 110-128)
  2. When `localLast > incomingLast` (lines 135-151)
- **Evidence**: Log showed session clicked with `completed: false` AFTER marking attended, progress bar increased but session stayed yellow
- **Impact**: 
  - Users saw sessions as "not attended" even after marking them
  - Clicking the same session again opened attendance dialog
  - Combined with v0.6.2 idempotency fix, prevented duplicate hour counting BUT didn't fix UI
- **Symptoms**:
  - Green "completed" sessions appeared as yellow "pending evaluation"
  - Past sessions could be marked attended repeatedly
  - Progress bar "verbracht" (completed hours) increased correctly but session color wrong
- **Fix**: Changed `mergeSessionsPreserveGoogle` to explicitly preserve `completed` and `completionPercentage` from incoming (backend) data after spreading `...local`
- **Side effect fixed**: Sessions now turn green immediately after marking attended (no longer require page reload)

### Technical Details
- **Fix location #1**: `src/App.tsx` lines 110-128 in `mergeSessionsPreserveGoogle` (Google-linked sessions)
- **Fix location #2**: `src/App.tsx` lines 135-151 in `mergeSessionsPreserveGoogle` (fresher local sessions)
- **Old behavior** (WRONG):
  ```typescript
  return {
    ...incoming,
    ...local,  // ❌ Overwrites ALL fields including completed
    date: local.date,
    startTime: local.startTime,
    // ... more fields
  };
  ```
- **New behavior** (CORRECT):
  ```typescript
  return {
    ...incoming,
    ...local,
    // CRITICAL FIX: Backend is source of truth for attendance tracking
    completed: incoming.completed,  // ✅ Preserve from backend
    completionPercentage: incoming.completionPercentage,
    date: local.date,
    startTime: local.startTime,
    // ... more fields
  };
  ```
- **Why this happened**: Merge logic was designed to preserve local changes during Google Calendar sync (date/time changes from drag-and-drop), but `completed`/`completionPercentage` are NOT Google Calendar fields - they're database-only fields that should ALWAYS come from backend

### Combined Fix with v0.6.2
Together with v0.6.2's idempotency fix, this resolves the complete attendance tracking bug:
1. **v0.6.2**: Prevents adding hours if session already marked completed
2. **v0.6.3**: Ensures `completed` flag persists correctly so v0.6.2's check works
3. **v0.6.3 Part 2**: Fixes ALL merge locations that were overwriting attendance data

## [v0.6.2] - 2024-11-24

### Fixed - Critical Attendance Tracking Idempotency Bug
- **🔴 CRITICAL: Attendance marking is now idempotent**: Fixed bug where marking the same past session as attended multiple times kept incrementing course `completedHours` each time
- **Root cause**: `handleSessionFeedback` always added session hours to course completion without checking if session was already marked completed
- **Impact**: Users could artificially inflate completion hours by repeatedly marking same session attended
- **Detection**: Integrity check on app load detected `completedHours` mismatches (DB said 4 hours, but no sessions marked completed), auto-corrected to 0
- **Fix**: Added check for `feedbackSession.completed` before incrementing hours. If already completed, `hoursToAdd = 0` (idempotent behavior)
- **Enhanced logging**: Attendance updates now log `wasAlreadyCompleted` flag and idempotency status

### Technical Details
- **Fix location**: `src/App.tsx` lines 1023-1043 in `handleSessionFeedback`
- **Logic**: 
  ```typescript
  const wasAlreadyCompleted = feedbackSession.completed;
  const hoursToAdd = wasAlreadyCompleted ? 0 : feedback.completedHours;
  const newCompletedHours = targetCourse.completedHours + hoursToAdd;
  ```
- **Behavior**: Marking attended once adds hours, marking again updates progress % but doesn't re-add hours

### Example Log Evidence
Before fix:
```
📈 Updating course completedHours: {old: 7, added: 3, new: 10}   // First marking
📈 Updating course completedHours: {old: 10, added: 3, new: 13}  // Second marking (BUG!)
```
After fix:
```
📈 Updating course completedHours: {old: 7, added: 3, new: 10, idempotent: '➕ Adding hours for first-time completion'}
📈 Updating course completedHours: {old: 10, added: 0, new: 10, wasAlreadyCompleted: true, idempotent: '✅ No duplicate hours added'}
```

## [v0.6.1] - 2024-11-24

### Fixed - Critical Database Persistence Bug
- **Session position persistence**: Moving sessions now persists correctly across server restarts (was reverting to "original positions" from weeks ago)

  - Backend raw response (snake_case detection)
  - API client mapping results (camelCase conversion verification)

### Technical Details
- **Root cause**: Two-way sync was updating `mergedSessions` array in React state with `googleEventId` from Google Calendar, but never calling `apiUpdateSession` to persist to database
- **Fix location 1**: `server/src/routes/sessions.ts` lines 61-95 - Explicit field mapping from database columns to camelCase
- **Fix location 2**: `src/App.tsx` lines 1947-1980 - Added Promise.all batch update to save all synced sessions to database
- **Database impact**: After first sync post-update, all `google_event_id` columns will be populated (were previously `null`)

### Breaking Changes
None - all changes are backwards compatible. Existing sessions will get `googleEventId` populated on first sync after update.

### Migration Notes
- On first sync after update, all sessions will be saved to database with their `googleEventId`
- Users may see sessions at "old positions" on first load (from database), then correct positions after first sync
- No manual migration required - happens automatically on first Google Calendar sync

### Documentation
- Added `CRITICAL_FIX_DATABASE_PERSISTENCE.md` with detailed root cause analysis, testing instructions, and troubleshooting guide
- Added `FIX_SUMMARY.md` (previous attempt documentation, superseded by v0.6.1 fix)

## [v0.6.0] - 2024-11-22

### Fixed - Progress Calculation & Course Lifecycle
- **Course progress bar accuracy**: `scheduledHours` now only counts FUTURE incomplete sessions (was incorrectly including all past sessions)
- **Course activation logic**: Courses only activate from "planned" to "active" status when they have at least ONE PAST attended session (prevents premature activation from future-only sessions)
- **Course auto-deactivation**: Courses automatically return to "planned" status when all their sessions are deleted
- **Dashboard visibility**: Active courses without any sessions no longer appear on dashboard
- **Data integrity check**: On page load, app now recalculates `completedHours` from actual attended sessions in database and corrects any mismatches (fixes legacy data inconsistencies)

### Fixed - Google Calendar Sync
- **Session resurrection bug**: Sessions deleted from app no longer reappear after sync (added `googleEventId` check to distinguish synced vs local-only sessions)
- **Duplicate event creation**: Fixed race condition in promise cache that caused events to be synced twice to Google Calendar (switched from IIFE to deferred promise pattern)
- **Duplicate calendar creation**: Fixed React StrictMode double-mount causing multiple "Intelligent Study Planner" calendars (added singleton pattern with promise cache)
- **Session deletion sync**: Sessions deleted from Google Calendar now correctly update progress bar (added scheduledHours recalculation after deletion)
- **Cache corruption handling**: Filter out invalid IDs (googleEventIds) from session tracking cache to prevent false deletion detection
- **Calendar cache clearing**: Disconnect button now clears cached calendar ID from localStorage (prevents reuse of deleted calendars on reconnect)

### Added
- **Calendar selection dialog**: When multiple calendars with same name exist, user can choose which to use or create new one
- **Grace period tracking**: 5-minute grace period prevents re-importing recently deleted sessions during API propagation delays
- **Detailed logging system**: Comprehensive console logging for debugging sync operations, merge logic, and session lifecycle (can be removed for production)

### Changed
- **Course lifecycle states**: More accurate transitions between "planned" → "active" → "completed" based on actual session attendance
- **Merge logic**: Improved session merge to properly handle sessions that exist locally but not in sync result
- **Promise caching**: Both calendar creation and session sync now use module-level promise cache to prevent concurrent duplicates

### Technical Improvements
- **Deferred promise pattern**: Replaced IIFE with deferred promises to eliminate race conditions in cache  
- **Singleton patterns**: Added module-level caches for `getOrCreateStudyCalendar()` and `syncSessionsToGoogleCalendar()`
- **Cache validation**: Added filters to ensure cache only contains valid session IDs (format: `session-*`)
- **Error handling**: Improved 404 handling for missing sessions and deleted calendars

### Documentation
- Added comprehensive inline comments explaining WHY code exists (not just WHAT it does)
- All critical functions now have JSDoc-style documentation
- New documentation files:
  - `CALENDAR_DUPLICATE_FIX_20251122.md` - Calendar duplication fix
  - `CALENDAR_CACHE_CLEARING_FIX_20251122.md` - Cache clearing on disconnect  
  - `SESSION_DUPLICATE_SYNC_FIX_20251122.md` - Session sync duplication fix
  - `PROMISE_CACHE_RACE_CONDITION_FIX_20251122.md` - Race condition fix
  - `SYNC_DELETION_FIX_20251122.md` - Deletion sync improvements
  - `SYNC_RESURRECTION_BUG_FIX.md` - Session resurrection fix
  - `DATA_INTEGRITY_FIX_20251122.md` - Data integrity check

### Breaking Changes
None - all changes are backwards compatible

### Known Limitations
- localStorage cache keys not yet user-specific (TODO: include userId in cache keys)
- No refresh token handling (tokens expire after ~1 hour)
- Verbose logging should be removed/reduced for production deployment

## [v0.5.0] - 2025-11-12

### Security & Architecture
- **🔒 User-specific Google Calendar tokens**: Google Calendar OAuth tokens now stored per-user in database backend instead of shared browser localStorage
- **Backend token storage**: New `google_calendar_tokens` table with user_id foreign key constraint enforces one-to-one user-to-Google-account mapping
- **API authentication**: All Google Calendar token operations require JWT authentication via middleware
- **Logout cleanup**: Automatic clearing of Google Calendar cache keys on logout prevents data leakage between users

### Added
- **Backend API endpoints**: 
  - `GET /api/google-calendar/token` - Retrieve user's Google Calendar token
  - `POST /api/google-calendar/token` - Save/update user's token with Zod validation
  - `DELETE /api/google-calendar/token` - Disconnect and remove token
  - `PATCH /api/google-calendar/token/last-sync` - Update sync timestamp
- **Database table**: `google_calendar_tokens` with fields: user_id, access_token, refresh_token, token_expiry, calendar_id, google_email, last_sync, timestamps
- **Frontend API client**: New functions in `api.ts` for token management (getGoogleCalendarToken, saveGoogleCalendarToken, deleteGoogleCalendarToken, updateLastSync)
- **Event-driven sync**: Custom `googleCalendarTokenChanged` event for efficient component communication
- **Smart polling**: GoogleCalendarSyncService only polls backend when already connected (no more API spam when disconnected)

### Changed
- **CalendarSync component**: Migrated from localStorage to backend API for all token operations
- **GoogleCalendarSyncService**: Replaced continuous 5-second polling with event-driven token updates
- **Token loading**: Services now load tokens from backend on mount with proper 404 error handling
- **Sync timestamp**: Last sync time now stored in database via API instead of localStorage

### Fixed
- **Console error for new users**: Added null check for `studyProgram` before accessing `completedECTS` property
- **Recurring session duplication**: Changed `singleEvents: false` in Google Calendar API calls to prevent duplicate event instances
- **Unnecessary API calls**: Eliminated continuous token polling when user not connected to Google Calendar
- **Error logging spam**: API 404 responses (no token found) now handled silently instead of console errors

### Removed
- **Registration UI cleanup**: Removed unnecessary "Abbrechen" (Cancel) button and verbose description text from RegisterInline component

### Technical Details
- **Migration path**: Automatic migration of hardcoded legacy courses/sessions for admin user on first login
- **Database persistence**: SQLite with sql.js for browser-compatible storage
- **Token security**: Tokens isolated by user_id with CASCADE deletion on user removal
- **Cache isolation**: Google Calendar cache keys cleared on logout to prevent cross-user data access

### Breaking Changes
- Google Calendar connections established before this version will need to be reconnected due to migration from localStorage to backend storage

## [v0.4.0] - 2025-11-11

### Added
- **Recurring sessions support**: Create, edit, and sync recurring study sessions with full RRULE pattern configuration (daily, weekly, monthly, yearly, interval, end date/count, weekday/monthday selection)
- **RecurrencePatternPicker UI**: Visual recurrence pattern picker integrated into session dialog
- **Google Calendar sync for recurring events**: Recurring sessions are exported/imported as RRULE-based events; exceptions/overrides supported
- **Master + exceptions model**: Efficient storage and sync of recurring sessions using master/instance pattern (mirrors Google Calendar)
- **Session expansion utility**: `expandSessionInstances()` generates visible occurrences for calendar views
- **New files**: `RecurrencePatternPicker.tsx`, `RECURRING_SESSIONS.md`, `SYNC_FIX_RECURRING.md`
- **Sync stats display**: Track and display recurring session sync stats

### Changed
- **Sync logic overhaul**: All sync/merge logic now preserves recurrence fields, deduplicates by session ID, and handles exceptions
- **Hashing and merge**: Recurrence field included in hash-based change detection and merge logic
- **Improved logging**: Detailed logs for recurrence handling, merge decisions, and sync operations

### Fixed
- **Recurrence loss on sync**: Recurrence field now preserved during all sync/merge operations (see `SYNC_FIX_RECURRING.md`)
- **Bug: Recurring session count in stats**: Recurring sessions now counted in sync stats
- **UI validation**: Recurrence pattern picker validates required fields (e.g., at least one weekday for weekly)

### Documentation
- See `RECURRING_SESSIONS.md` for full technical and UI details
- See `SYNC_FIX_RECURRING.md` for bugfix and testing checklist

### Technical Debt / Follow-ups
- Exception/instance editing UI (delete/modify single occurrence)
- Human-readable recurrence summaries in calendar views
- Lazy loading/caching of expanded instances for performance

All notable changes to this project will be documented in this file.

## [v0.3.0] - 2025-11-10

### Added
- **Two-way sync for unassigned sessions**: Google Calendar blockers (manually created events) now sync to app as unassigned sessions that can be assigned to courses
- **Grace period for deletion tracking**: 5-minute grace period prevents re-importing recently deleted sessions
- **Error boundary component**: Global error handling with fallback UI for better stability
- **Dialog close cooldown**: 300ms cooldown prevents accidental week navigation when closing session dialogs
- Mobile Google Sync button relocated beneath week calendar (dialog trigger) for clearer access
- Cross-device horizontal swipe/drag week navigation (desktop & mobile)
- Centered month label on mobile header for visual balance
- Week number (KW) column retained with improved layout spacing
- Background sync service (`GoogleCalendarSyncService`) for periodic & visibility-triggered sync
- Reusable `useGoogleCalendarSync` hook abstracting connect/sync/disconnect state
- Consistent UI polish across dialogs, buttons, and select components (styling & layout tweaks)

### Changed
- **Increased dialog sizes**: All dialogs upgraded to `max-w-2xl` or `max-w-3xl` for better content visibility
- **Session title for unassigned**: Changed from "🚫 Blocker" to "📚 Study Session" for unassigned sessions
- **Default course selection**: New sessions default to unassigned instead of auto-selecting first course
- **Button alignment**: Delete and Save buttons now align on right side in SessionDialog
- **Removed delete confirmation**: Sessions can be deleted without confirmation dialog for faster workflow
- **Enhanced deletion logic**: Improved Google Calendar deletion to handle both `session-*` and `gcal-*` ID patterns
- **Week navigation thresholds**: Requires velocity > 50px/s OR distance > 100px to prevent accidental navigation
- Navigation arrows hidden on small screens (mobile) to reduce clutter; desktop behavior unchanged
- Refactored Google Calendar import function signature (removed unused courses parameter)
- Improved type safety in calendar sync (explicit `ScheduledSession[]` mapping and listener casts)
- Enforced `prefer-const` in scheduler (minor lint cleanup)

### Fixed
- **Session visibility during editing**: Removed filter that caused sessions to disappear when editing
- **Google Calendar sync for unassigned sessions**: Modified `sessionToCalendarEvent` to handle undefined courses
- **Dual event tracking**: Added tracking by both `sessionId` property and `gcal-*` ID for proper deletion
- **Deletion persistence**: Sessions deleted in app now properly removed from Google Calendar with grace period tracking
- Resolved malformed JSX in `WeekCalendar` PopoverContent causing prior syntax errors
- Corrected today ring rendering consistency inside mini month popover

### Technical Debt / Follow-ups
- Remaining lint warnings in legacy UI components (fast-refresh-only exports, `@ts-nocheck` in chart) slated for a future cleanup batch
- Consider threshold tuning for horizontal swipe sensitivity

## [v0.2.0] - 2025-11-09

### Added
- Two-way Google Calendar sync with lastModified merge logic
- Automatic sync triggers (on local changes, every 3 minutes, on tab visibility)
- Dedicated calendar isolation using extendedProperties
- Setup and troubleshooting docs: CALENDAR_SETUP.md, CALENDAR_INTEGRATION.md, CALENDAR_FIX_400.md

### Fixed
- TypeScript build errors by installing missing UI deps and adjusting imports

### Notes
- Charts typings temporarily disabled with `// @ts-nocheck` in `chart.tsx` pending refinement

[Unreleased]: https://github.com/atzlerdo/intelligent-study-planner/compare/v0.5.0...HEAD
[v0.5.0]: https://github.com/atzlerdo/intelligent-study-planner/releases/tag/v0.5.0
[v0.4.0]: https://github.com/atzlerdo/intelligent-study-planner/releases/tag/v0.4.0
[v0.3.0]: https://github.com/atzlerdo/intelligent-study-planner/releases/tag/v0.3.0
[v0.2.0]: https://github.com/atzlerdo/intelligent-study-planner/releases/tag/v0.2.0

