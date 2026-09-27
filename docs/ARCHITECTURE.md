# Application architecture

The site is a Vite-built, no-framework Telugu devotional reading site, deployed as a Cloudflare Worker. There is no component framework and no JavaScript rewrite of the existing reading/behavior code — see "Why no build-step conversion" below.

## Deployment

Cloudflare Workers is the single deploy target (`wrangler.jsonc`).

- `npm run dev` — Vite dev server + the Worker, via `@cloudflare/vite-plugin`. `/api/ocr` is proxied to the real Worker locally too.
- `npm run build` — outputs `dist/client/` (the static site) and `dist/stotramulu/` (the built Worker + a **regenerated** `wrangler.json` with build-output-relative paths).
- `npm run deploy` — builds, then deploys using the **generated** `dist/stotramulu/wrangler.json` — not the source `wrangler.jsonc` directly. This is `@cloudflare/vite-plugin`'s convention: it recomputes `assets.directory` etc. for you on every build, so the source file stays written in terms of source paths.

## Source layout

```
index.html, admin.html     Vite entries (repo root)
styles/                    CSS Vite/Tailwind actually processes (bundled + minified at build time)
public/                    Vite's publicDir — copied to the build output byte-for-byte, NEVER processed
  assets/*.js                the site's behavior modules (classic <script> tags, not ES modules)
  data/stotras/*.js           the 32 bundled prayer datasets
  data/content-audit.js       source/review metadata for those datasets
src/                       the Cloudflare Worker (untouched by the Vite/Tailwind work — see below)
```

**Why no build-step conversion for `public/assets/*.js`:** these ~15 files rely on shared globals (`stotramConfig`, `origins`, `meanings`, `escapeHtml`, etc. — set by one script, read by later ones, in a specific `<script>` order in `index.html`) rather than ES module imports. Converting them to real modules was explicitly out of scope for the Vite migration: it would touch every file for zero user-visible benefit, and this codebase's actual verification (the `tools/verify-*.cjs` suite) is keyed to this exact behavior. They're copied through unchanged.

## Two CSS systems that coexist — read this before touching site-wide styles

`styles/styles.css`, `styles/reading.css`, and `styles/design-system.css` load in that exact order and **cannot be safely reordered or merged**. A precise per-selector, per-property diff (see the git history around the "premium UI" work) found **126 properties** where `reading.css` and one of the other two files declare a genuinely different value for the same selector — not near-duplicates, real differences in color/spacing/size. The current load order is what makes today's rendering correct; collapsing two of these files into one (one file = one position in the cascade) would silently flip the winner on all of them.

Practically: `styles.css` (an older gold/maroon/cream dark-theme palette, still backing ~168 rules including particles, header chrome, and Japamala) and `design-system.css` (a newer cream/brass "Grandham" palette, added later as an override layer for Home/reader surfaces) are two different design languages layered via cascade order, not a legacy file sitting dead on top of a clean one. Unifying them into one token system is possible but requires resolving those 126 conflicts one at a time with a browser open to verify each — it was deliberately not attempted blind.

`design-system.css` also defines the `--ui-*` custom properties (colors, radius) that `design-system.css`'s own later rules consume — there used to be two separate `:root` blocks silently overriding each other; that's now one block.

`styles/japamala-3d.css` has zero selector overlap with the other three, so its position doesn't matter for correctness.

## Frontend modules

- `public/data/stotras/*.js`: bundled prayer datasets.
- `public/data/content-audit.js`: separate text and meaning sources, review dates, verification statuses, coverage, and edition scope.
- `styles/styles.css`: older gold/maroon/cream theme — see above.
- `styles/reading.css`: reading accessibility and feature layouts.
- `styles/design-system.css`: newer cream/brass "Grandham" tokens and Home/reader surface overrides — see above.
- `styles/japamala-3d.css`: presentation and mobile input behavior for the WebGL Rudraksha view.
- `public/assets/site-config.js`: the single source of truth for `ADMIN_UID` and the Firebase web config — loads first, before anything that reads them.
- `public/assets/reader-navigation.js`: reading progress, recent-reading history, section jumps, and Home category navigation.
- `public/assets/reader.js`: prayer rendering, read marks, font preference, meanings, and in-prayer search. Grandham is the fixed reader presentation defined by the page and styles.
- `public/assets/tracking.js`: local pooja state, calendar, counters, vows, reminders, and file backup.
- `public/assets/app.js`: page orchestration, global prayer search, dialogs, feedback, analytics, and startup.
- `public/assets/japamala.js`: Japamala views, shared counting state, sound, haptics, reset, and completion feedback.
- `public/assets/japamala-3d.js`: dependency-free procedural WebGL Rudraksha mesh and gesture renderer, initialized only when selected.
- `public/assets/library.js`: favorites, semantic prayer-card links, and shareable reader routes.
- `public/assets/experience.js`: bookmarkable Home views (home/library/favorites/practice) via the URL hash.
- `public/assets/cloud.js`: optional cloud synchronization (Google sign-in + Firestore backup of pooja/japa data). Main site only.
- `public/assets/admin.js`: loads published cloud stotras into the main site for every visitor (small, on purpose), plus a discreet link to `/admin.html` shown only when signed in as the admin.
- `public/assets/weekday.js`: renders the "today's suggestions" Home section. Display only — the editor lives in `admin-dashboard.js`.
- `public/icons.svg`: a small line-icon sprite for UI chrome (arrows, close, edit, delete, etc. — not the deity artwork), referenced via cross-document `<use href="/icons.svg#icon-x">`. This is a deliberately different pattern from the deity SVGs below (external file vs. inline `<symbol>`), chosen so both `index.html` and `admin.html` can share one sprite without duplicating ~50 lines of markup per page.
- The deity artwork itself is a large inline `<svg style="display:none">` block of `<symbol>`s at the top of `index.html`, referenced via same-document `<use href="#svg-vishnu">` etc. — unchanged, and NOT merged into `icons.svg` (different purpose: brand artwork vs. UI chrome).

Data loads first. Reader navigation, reader behavior, and tracking load before app.js. Optional cloud and admin modules load afterward.

## Admin dashboard (`admin.html`)

A separate page, not a modal bolted onto the reading site. Loads its own copy of the 32 dataset scripts (so `stotramConfig`/`origins`/`meanings` exist here too) but none of `index.html`'s reader/search/tracking code.

- `public/assets/admin-dashboard.js`: everything — content list/add/edit/delete/revert, OCR-assisted entry, feedback inbox, weekday-map editor, export backup. Gated by Firebase auth + `ADMIN_UID`, but **that check is UI-only**; see "Authorization boundaries" below.
- `styles/admin.css`: Tailwind CSS (including Preflight) is used directly here — safe because this page has no pre-existing rendering to protect, unlike the main site's hand-authored cascade above.
- Built as its own Vite entry (`vite.config.js`'s `environments.client.build.rollupOptions.input`), so it ships its own CSS/behavior bundle — the main site never loads admin code, and vice versa.

## Authorization boundaries

- **`/api/ocr` (Worker, `src/ocr.js`)**: the real check. Verifies the caller's Firebase ID token server-side (`src/auth.js`, via Google's Identity Toolkit), then compares the resulting UID against `ADMIN_UID`. This is enforced regardless of what the client sends.
- **Firestore (`stotras`, `feedback`, `config` collections, used by `admin.html`)**: gated by Firestore security rules. **These rules are console-managed and not version-controlled in this repo** — if you need to know the exact current rules, check the Firebase console, not this codebase.
- **Client-side `ADMIN_UID` checks** (`site-config.js`'s value, read by `admin.js`/`admin-dashboard.js`): control which UI renders (the dashboard link, the dashboard page itself) so a non-admin visitor doesn't see controls that would fail anyway. Not a security boundary on their own — anyone can read this value from the shipped JS.

## Worker modules

- `src/index.js`: HTTP routing and static asset fallback only.
- `src/ocr.js`: authenticated OCR workflow, payload limits, Gemini request, and two-pass comparison.
- `src/auth.js`: Firebase token verification.
- `src/http.js`: JSON response policy.

OCR accepts at most six JPEG, PNG, or WebP images, limits individual and combined encoded payload sizes, verifies the caller before invoking Gemini, supports an optional `ADMIN_UID` runtime override, and marks responses as non-cacheable.

## Verification

Run `node tools/verify.cjs`, `node tools/verify-reader-navigation.cjs`, `node tools/verify-library.cjs`, `node tools/verify-reader-smoke.cjs`, `node tools/verify-worker.cjs`, `node tools/verify-japamala.cjs`, `node tools/verify-reader-theme.cjs`, and `node tools/verify-meanings.cjs` — all file-based/syntax checks, no browser or build step required.

`tools/review-devotional.cjs` is a separate, optional Playwright-driven visual/interaction smoke test (needs Playwright + a browser installed) — not part of the standard check list above.

The primary verifier checks all datasets, source metadata, frontend and Worker syntax, asset links, design-system load order, semantic card structure, reader behavior, and module boundaries.
