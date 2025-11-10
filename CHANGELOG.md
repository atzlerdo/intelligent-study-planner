# Changelog

All notable changes to this project will be documented in this file.

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

[Unreleased]: https://github.com/atzlerdo/intelligent-study-planner/compare/v0.2.0...HEAD
[v0.2.0]: https://github.com/atzlerdo/intelligent-study-planner/releases/tag/v0.2.0
\
## [Unreleased]

### Added
- Mobile Google Sync button relocated beneath week calendar (dialog trigger) for clearer access
- Cross-device horizontal swipe/drag week navigation (desktop & mobile)
- Centered month label on mobile header for visual balance
- Week number (KW) column retained with improved layout spacing
- Background sync service (`GoogleCalendarSyncService`) for periodic & visibility-triggered sync
- Reusable `useGoogleCalendarSync` hook abstracting connect/sync/disconnect state
- Consistent UI polish across dialogs, buttons, and select components (styling & layout tweaks)

### Changed
- Navigation arrows hidden on small screens (mobile) to reduce clutter; desktop behavior unchanged
- Refactored Google Calendar import function signature (removed unused courses parameter)
- Improved type safety in calendar sync (explicit `ScheduledSession[]` mapping and listener casts)
- Enforced `prefer-const` in scheduler (minor lint cleanup)

### Fixed
- Resolved malformed JSX in `WeekCalendar` PopoverContent causing prior syntax errors
- Corrected today ring rendering consistency inside mini month popover

### Technical Debt / Follow-ups
- Remaining lint warnings in legacy UI components (fast-refresh-only exports, `@ts-nocheck` in chart) slated for a future cleanup batch
- Consider threshold tuning for horizontal swipe sensitivity

