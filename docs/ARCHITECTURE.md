# Frontend architecture

The site uses plain browser scripts and no build step. Features are separated by responsibility while existing HTML handlers remain stable.

## Runtime modules

- data/stotras/*.js: immutable bundled prayer datasets.
- data/content-audit.js: source, review date, verification status, and edition scope.
- assets/reader-navigation.js: URL state, reading progress, favorites, section jumps, and Home library navigation.
- assets/reader.js: prayer rendering, read marks, font preference, meanings, Grandham theme, and search inside a prayer.
- assets/tracking.js: local pooja state, calendar, counters, vows, reminders, and file backup.
- assets/app.js: page orchestration, global prayer search, shared dialogs, feedback, analytics, and startup.
- assets/japamala.js: Japamala interaction only.
- assets/cloud.js: optional cloud synchronization.
- assets/admin.js: admin-only content management.
- assets/weekday.js: day suggestions.
- assets/library.js: favorites and shareable reader routes.

## Dependency direction

Data loads first. Reader navigation, reader behavior, and tracking load before app.js. app.js coordinates those services during startup. Optional cloud, admin, weekday, and library features load afterward.

A module owns its own state and behavior. Cross-module calls use the small existing browser-global API because the static site has no bundler and HTML currently uses inline event handlers. New features should be added to the module that owns the behavior rather than expanding app.js.

## Verification

Run:

- node tools/verify.cjs
- node tools/verify-reader-navigation.cjs
- node tools/verify-library.cjs

The primary verifier checks script syntax and asset links, requires app.js to remain below 700 lines, and confirms that reader and tracking responsibilities remain in their dedicated modules.
