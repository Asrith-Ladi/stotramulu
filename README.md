# Stotramulu

Telugu devotional reading site, with a Cloudflare worker in `src/` and static assets built by Vite from `public/`, `styles/`, `index.html`, and `admin.html`.

Deployed as a single Cloudflare Workers project (see `wrangler.jsonc` and `docs/ARCHITECTURE.md`). No other hosting target.

- `npm install` once, then `npm run dev` for a local dev server (Worker included — `/api/ocr` works locally too)
- `npm run build` to produce a production build in `dist/`
- `npm run deploy` to build and deploy (uses the build's generated Worker config, not `wrangler.jsonc` directly — see `docs/ARCHITECTURE.md`)
- `/admin.html` is the content-management dashboard (Google sign-in, admin-only)

- **[Owner's guide: what we built and how to run the site](docs/OWNER-GUIDE.md)** — start here
- [The "later" list: postponed work and ideas](docs/LATER.md)
- [Application architecture](docs/ARCHITECTURE.md)
- [Phase log](docs/PHASES.md)
- [Firestore rules](docs/firestore.rules.proposed) — paste into the Firebase console *before* deploying a change that needs them
- [Content audit and source considerations](docs/CONTENT-AUDIT.md)
- [Implemented UI/UX improvements and next steps](docs/UX-PLAN.md)
- Run all checks: `npm run verify`, `npm run rules:check`, `npm run e2e` (browser tests), `npm run shots` (screenshots)
- Inventory: `node tools/audit-stotras.cjs`

The September 2026 audit restores Lalitha's main 183-verse text and Suprabhatam's 29 verses. Other editions are explicitly flagged where source review is unresolved. Meaning review and hands-on Android/iPhone visual QA remain pending; automated responsive and interaction checks pass. See the reports for the precise scope.
