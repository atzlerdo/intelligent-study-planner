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
