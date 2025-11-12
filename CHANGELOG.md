# Changelog

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

