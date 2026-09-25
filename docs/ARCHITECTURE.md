# Application architecture

The site uses plain browser modules and Cloudflare Worker modules without a frontend build step.

## Frontend modules

- data/stotras/*.js: bundled prayer datasets.
- data/content-audit.js: source, review date, verification status, and edition scope.
- assets/styles.css: legacy component and feature styles.
- assets/reading.css: reading accessibility and feature layouts.
- assets/design-system.css: final visual tokens and presentation layer shared by Home and Reader.
- assets/japamala-hand.css: isolated responsive styling and articulated finger/bead motion for the fourth Japamala view.
- assets/japamala-3d.css: presentation and mobile input behavior for the fifth WebGL Rudraksha view.
- assets/reader-navigation.js: reading progress, recent-reading history, section jumps, and Home category navigation.
- assets/reader.js: prayer rendering, read marks, font preference, meanings, and in-prayer search. Grandham is the fixed reader presentation defined by the page and styles.
- assets/tracking.js: local pooja state, calendar, counters, vows, reminders, and file backup.
- assets/app.js: page orchestration, global prayer search, dialogs, feedback, analytics, and startup.
- assets/japamala.js: five Japamala views, shared counting state, sound, haptics, reset, and completion feedback.
- assets/japamala-3d.js: dependency-free procedural WebGL Rudraksha mesh and gesture renderer, initialized only when selected.
- assets/library.js: favorites, semantic prayer-card links, and shareable reader routes.
- assets/cloud.js: optional cloud synchronization.
- assets/admin.js: admin-only content management.
- assets/weekday.js: weekday suggestions.

Data loads first. Reader navigation, reader behavior, and tracking load before app.js. Optional cloud and admin modules load afterward. The library module attaches URL behavior after all bundled and cloud cards are available.

## Worker modules

- src/index.js: HTTP routing and static asset fallback only.
- src/ocr.js: authenticated OCR workflow, payload limits, Gemini request, and two-pass comparison.
- src/auth.js: Firebase token verification.
- src/http.js: JSON response policy.

OCR accepts at most six JPEG, PNG, or WebP images, limits individual and combined encoded payload sizes, verifies the caller before invoking Gemini, supports an optional ADMIN_UID runtime override, and marks responses as non-cacheable.

## Verification

Run node tools/verify.cjs, node tools/verify-reader-navigation.cjs, node tools/verify-library.cjs, node tools/verify-reader-smoke.cjs, node tools/verify-worker.cjs, node tools/verify-japamala.cjs, and node tools/verify-reader-theme.cjs.

The primary verifier checks all datasets, source metadata, frontend and Worker syntax, asset links, design-system load order, semantic card structure, reader behavior, and module boundaries.
