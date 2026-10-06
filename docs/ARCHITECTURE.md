# Application architecture

The site is a Vite-built Telugu devotional reading site with no component framework, deployed as a Cloudflare Worker. The page is plain HTML (`index.html`), one stylesheet entry (`styles/app.css`) and a set of classic `<script>` files that share one global scope. See "Why no build-step conversion" below for why the scripts stay that way.

## Deployment

Cloudflare Workers is the single deploy target (`wrangler.jsonc`).

- `npm run dev` — Vite dev server + the Worker, via `@cloudflare/vite-plugin`. `/api/ocr` is proxied to the real Worker locally too.
- `npm run build` — outputs `dist/client/` (the static site) and `dist/stotramulu/` (the built Worker + a **regenerated** `wrangler.json` with build-output-relative paths).
- `npm run deploy` — builds, then deploys using the **generated** `dist/stotramulu/wrangler.json` — not the source `wrangler.jsonc` directly. This is `@cloudflare/vite-plugin`'s convention: it recomputes `assets.directory` etc. for you on every build, so the source file stays written in terms of source paths.
- **Version stamps (Phase 29).** `tools/vite-version-stamp.mjs`, a plugin in `vite.config.js` that runs on the client build only, adds `?v=<first 10 hex of the file's SHA-256>` to every local `<script src>` in both pages, so a changed file gets a new address and an unchanged one keeps its cached copy (Cloudflare ignores the query). It also computes a build id from the stamped pages and every file in `public/` (the same files give the same id), writes it, with the build time, into `<meta name="stotram-build" content="dev">` in `index.html`, and emits `/version.json` (`{build, built}`); `build-check.js` compares the two. The build stops if a page loads a script that is neither in `public/` nor built by Vite. Keep the meta tag exactly as written: `tools/verify-build-stamp.cjs` checks that the plugin can find it. Cloudflare serves every static file with `Cache-Control: public, max-age=0, must-revalidate`, so browsers already re-check each file on every load; the stamps cover proxies and browsers that do not, and open pages are handled by `build-check.js`.

## Source layout

```
index.html, admin.html     Vite entries (repo root)
styles/                    CSS Vite actually processes (bundled + minified at build time)
  app.css                    the ONLY stylesheet index.html links; it @imports everything else in order
  admin.css                  admin.html's own stylesheet (Tailwind v4)
public/                    Vite's publicDir — copied to the build output byte-for-byte, NEVER processed
  assets/*.js                the site's behavior modules (classic <script> tags, not ES modules)
  data/stotras/*.js          the 32 bundled prayer datasets
  data/content-audit.js      source/review metadata for those datasets
  data/updates.js            the bundled "What's new" entries
  icons.svg                  the UI line-icon sprite
src/                       the Cloudflare Worker (untouched by the Vite work — see below)
tools/                     verification scripts, the UI contract checker, screenshot and e2e runners
docs/redesign-research/    the redesign contract (contract.md) and the research behind it
```

**Why no build-step conversion for `public/assets/*.js`:** these files rely on shared globals (`stotramConfig`, `origins`, `meanings`, `escapeHtml`, etc. — set by one script, read by later ones, in a specific `<script>` order in `index.html`) rather than ES module imports. Converting them to real modules was explicitly out of scope for the Vite migration: it would touch every file for zero user-visible benefit, and this codebase's actual verification (the `tools/verify-*.cjs` suite) is keyed to this exact behavior. They're copied through unchanged.

## Stylesheets

`index.html` links exactly one stylesheet, `/styles/app.css`. That file contains nothing but `@import` lines, and Vite inlines them into a single bundle in exactly that order, so the import order **is** the cascade order. `app.css` does not import Tailwind; the main site's CSS is hand-written. (Only `admin.css` uses Tailwind — see "Admin dashboard".)

| # | File | Role |
|---|---|---|
| 1 | `@fontsource-variable/noto-sans-telugu`, `…/noto-serif-telugu` | The self-hosted fonts (see "Self-hosted fonts"). |
| 2 | `tokens.css` | Design tokens as custom properties on `:root`, plus the per-deity accent classes. It selects nothing else. |
| 3 | `base.css` | Reset, typography, the visible `:focus-visible` ring, `.icon-inline` / `.nav-icon`, and utilities (`.visually-hidden`, `.eyebrow`, `.muted`). No layout, and never `overflow` on `html` or `body`. |
| 4 | `components.css` | Shared components that page files compose instead of restyling: `.btn*`, `.track-btn`, `.icon-btn`, `.info-btn` (the ⓘ button), `.chip`, `.add-chip`, `.medallion`, `.status-pill`, `.tag`, the form fields, the counter family (`.counter-*`, `.count-*`), `.empty-state` and `.surface`. |
| 5 | `layout.css` | The shell: sticky header, the phone/tablet bottom tab bar (the same `nav.site-navigation` moves into the header row at 1024px and up), page containers, footer, scroll-to-top, skip link. |
| 6 | `home.css` | Home: the hero, today's suggestions, recent reading, the updates teaser, favourites. |
| 7 | `library.css` | The library intro, category filter chips and the prayer cards. |
| 8 | `reader.css` | The reader: title, sticky tool panel, reading options, verse cards, after-content blocks. |
| 9 | `practice.css` | "My practice" launchers, the pradakshina counter, and the Pooja Track page (calendar, vows, day sheet content). |
| 10 | `japamala.css` | The Japamala page and its three SVG views (visuals only). |
| 11 | `japamala-3d.css` | The WebGL Rudraksha stage. Its rendering-critical sizes and positions are marked `KEEP`. |
| 12 | `overlays.css` | Search, the account hub and the other bottom sheets, the ⓘ info sheet, feedback, the day-sheet container, the confirm dialog and the toast. |
| 13 | `behavior.css` | The reserved behaviour layer. It **must stay last** (next section). |

Each page file owns the visuals of its own area and nothing else. The exact markup, class names and state hooks every file styles are frozen in `docs/redesign-research/contract.md` (§3 static markup, §4 JS-generated markup, §7 visual specification); read it before changing CSS or markup.

### behavior.css — the reserved layer

`behavior.css` holds every rule the site needs to *work*, as opposed to how it looks: which page and which Home panel is visible (`[hidden] { display: none !important; }` and the four `#homePage[data-view] > [data-panel]` rules), overlay stacking and the `.active` / `.show` / `.visible` / `.on` state classes, the Japamala SVG rendering, the month-swipe geometry the calendar script measures, the card link's absolutely positioned layers, the reduced-motion switch and the print stylesheet. Because it loads last, nothing can override it by accident.

Two rules keep it that way; `tools/check-ui-contract.cjs` enforces both:

1. **Reserved properties** (contract §0.4). A page file must not declare a property that `behavior.css` already declares for the same selector (the same last compound selector). For example: no `display` on `.reader-page`, no `position` on `.card`, no `transform` on `.reader-deity-bg`. The `::before` / `::after` pseudo-elements of those selectors are free to use.
2. **Containing-block ban** (contract §0.5). `.header`, `.reader-page`, `.day-sheet-overlay`, `.japamala-page`, `.jm-stage*` and `#homePage` never get `transform`, `filter`, `backdrop-filter`, `perspective`, `contain`, `will-change` or `container-type`: any of those would trap the fixed tab bar, the fixed deity art or the overlays inside the element, and would distort the WebGL canvas. The Japamala stages also never get `display` (JS writes it inline), `animation` or `transition`. `html` and `body` never get `overflow`: the sheets lock scrolling by setting `body.style.overflow` inline, which only reaches the viewport while `html` stays `overflow: visible`, and the sticky header needs it too.

Motion follows from this: pages and Home panels only fade (opacity), and `behavior.css` already does that. Entrances that move use `transform` only on elements outside the ban list (cards, sheets, dialog boxes). The reduced-motion switch turns off every animation and transition, so the base state of every element is its visible final state, and keyframes animate *from* hidden *to* that base.

### Design tokens (`tokens.css`)

The look is "Kanchi silk", the colours of a Kanchipuram pattu saree:

- **Peacock teal** `--peacock-950…50` for the chrome, the hero and primary actions (`--peacock-800` is the primary button colour).
- **Zari gold** `--zari-800…100` for ornament, borders and highlights. `--zari-700` / `--zari-800` are the text-safe golds.
- **Kumkum** `--kumkum-*` for tiny signals only (the "new" dot, errors), and **leaf** `--leaf-*` for success / answered / verified.
- **Surfaces and ink:** `--ivory` (page), `--paper` / `--paper-leaf` (surfaces and verse cards), `--sand` (sunken fields), `--ink`, `--ink-2`, `--ink-3`, `--reading-ink` (verses), `--line`, `--line-2`.
- **Semantic roles** (`--c-bg`, `--c-surface`, `--c-text`, `--c-primary`, `--c-accent-text`, `--focus-ring`, …) point at the palette, so a role can change without touching every rule.
- **Type:** `--font-ui` (Noto Sans Telugu Variable) and `--font-serif` (Noto Serif Telugu Variable); the scale `--fs-xs` 14px (the smallest text anywhere) up to `--fs-3xl` 30px, and `--fs-display` for the hero; `--reader-font-size` (default 24px; `reader.js` sets 18–48px and remembers it).
- **Space, shape, depth, motion:** `--sp-1…9` (4px base), radii `--r-xs…xl` and `--r-pill`, soft teal-tinted shadows `--shadow-xs…lg` and `--shadow-primary`, durations `--dur-1…4` with `--ease-out`.
- **Layout:** `--content-max`, `--reader-max`, `--gutter`, `--header-h`, `--tabbar-h` (0 on desktop), the safe-area insets and `--tap` (48px, the primary touch target). Breakpoints are 600px (tablet: two-column grids) and 1024px (desktop: the tabs move into the header, three-column grids).
- **Stacking ladder:** `--z-bg` < `--z-page` < `--z-header` < `--z-tabbar` < `--z-float` < `--z-overlay` < `--z-sheet` < `--z-feedback` < `--z-daysheet` < `--z-confetti` < `--z-info` < `--z-toast` < `--z-dialog` < `--z-viewer` < `--z-skip`. The ⓘ sheet opens above any other sheet; the full-screen picture viewer (`--z-viewer`, 960) opens from any sheet and nothing opens on top of it.
- **Per-deity accents:** each card's bare theme class (`.vishnu`) and the reader title's `-theme` class (`.vishnu-theme`) set `--deity` and `--deity-soft`, which the card wash, the medallions and the title underline read.
- `--gold-light` / `--gold` remain as aliases for older rules in `japamala-3d.css`.

Only `tokens.css` holds raw hex colours. The exceptions are SVG data URIs, the Japamala bead rules and the black-on-white print rules in `behavior.css`. The key contrast pairs are computed from these values by `tools/verify-reader-theme.cjs`, so a token change that breaks AA/AAA fails the tests.

### Self-hosted fonts

The two Noto Telugu variable fonts come from the `@fontsource-variable/noto-sans-telugu` and `@fontsource-variable/noto-serif-telugu` npm packages, imported at the top of `app.css` (and `admin.css`). Vite resolves them from `node_modules` and copies the `.woff2` files into the build with hashed names, so the site makes no request to Google Fonts. Each package splits the font by `unicode-range` (Telugu, Latin, Latin Extended), so a browser downloads only the files the page actually uses, and `font-display: swap` shows the fallback font until they arrive. The fallbacks are listed in `--font-ui` / `--font-serif`. The contract checker fails on any other webfont name in the site CSS.

### Icons (`public/icons.svg`)

UI chrome icons (arrows, close, search, bell, info, calendar, the mala, …) live in one SVG sprite of `<symbol id="icon-x">` elements, referenced across documents with `<svg class="icon-inline" aria-hidden="true"><use href="/icons.svg#icon-x"/></svg>`. They draw in `currentColor`, so they take the text colour of their button. `index.html` and `admin.html` share the sprite, and the scripts build the same markup through small `icon('x')` helpers (the contract writes it as `ICON(x)`). `tools/verify.cjs` checks every fragment `index.html` references; the contract checker also checks the scripts and the CSS.

The deity artwork is different on purpose: it is a large inline `<svg style="display:none">` block of `<symbol>`s at the top of `index.html`, referenced with same-document `<use href="#svg-vishnu">` etc. It is brand artwork rather than UI chrome, so it is not merged into `icons.svg`.

### Legacy stylesheets

`styles/styles.css`, `styles/reading.css` and `styles/design-system.css` are the stylesheets from before the redesign. Nothing links or imports them any more; they stay in the repository only as read-only reference and are deleted in Phase 3. Never import them. The contract checker ignores them, and `tools/verify.cjs` fails if `app.css` imports one.

## Frontend modules

The scripts are classic scripts, not modules, and they share one global scope. That has three consequences for anyone adding code: a file must be valid in strict mode with no `import` / `export`; new code goes inside an IIFE and exports explicitly with `window.x = …`; and no two scripts may declare the same top-level name (the contract checker lists collisions). Any user- or data-derived string is escaped (the global `escapeHtml` from `tracking.js`) before it goes into `innerHTML`.

`index.html` loads them in this order: the data files, then `reader-navigation.js`, `reader.js`, `tracking.js`, `app.js`, `japamala-3d.js`, `japamala.js`, `feedback.js`, then `site-config.js`, the Firebase compat SDK, `attachments.js`, `cloud.js`, `admin.js`, `weekday.js`, `library.js`, `experience.js`, and finally `help.js`, `updates.js`, `messages.js` and `build-check.js` (last).

- `public/data/stotras/*.js`: bundled prayer datasets.
- `public/data/content-audit.js`: separate text and meaning sources, review dates, verification statuses, coverage, and edition scope.
- `public/data/updates.js`: `window.SITE_UPDATES`, the bundled "What's new" entries (`{id, date, tag, title, body}`, newest first).
- `public/assets/site-config.js`: the single source of truth for `ADMIN_UID` and the Firebase web config — loads first, before anything that reads them.
- `public/assets/reader-navigation.js`: reading progress, recent-reading history, section jumps, meaning coverage, and the Library navigation with its category filters.
- `public/assets/reader.js`: prayer rendering, read marks, font size (`--reader-font-size`), meanings, and in-prayer search. Grandham is the fixed reader presentation defined by the page and styles.
- `public/assets/tracking.js`: local pooja state, calendar, counters, vows, reminders, file backup, and the in-app `sitePrompt()` dialog.
- `public/assets/app.js`: page orchestration, global prayer search, `siteConfirm` / `siteAlert` dialogs, analytics, and startup.
- `public/assets/feedback.js`: the "tell us" form (moved out of `app.js` in Phase 27): `openFeedback`, `submitFeedback`, voice input, and the offline queue (`feedbackQueue_v1`, `flushFeedback`). A text-only message is queued first and retried until it lands; a message with attachments goes straight to the cloud (`__cloudSendReport`) and the form stays filled in until it has arrived. Every message carries `byUid` (the account that wrote it) and a random claim key; see "Conversations" below.
- `public/assets/attachments.js`: `window.StotramFiles`, shared by the site and the dashboard: shrinking pictures on the phone (long side 1600 px, WebP or JPEG, at most 800,000 bytes, no hidden location data), checking PDFs, the attach picker, uploading and loading attachment documents, thumbnails, the picture viewer, and the notify links (`notifyLinks`, `phoneDigits`).
- `public/assets/japamala.js`: Japamala views, shared counting state, sound, haptics, reset, and completion feedback.
- `public/assets/japamala-3d.js`: dependency-free procedural WebGL Rudraksha mesh and gesture renderer, initialized only when selected.
- `public/assets/library.js`: favourites, semantic prayer-card links, and shareable reader routes.
- `public/assets/experience.js`: the bookmarkable Home views (home / library / saved / practice) via the URL hash and `navigateView(view)`. It also keeps `html[data-screen]` (home, reader, track or japamala) and `aria-current` on the four menu links in step with the page that is showing; `layout.css` reads `data-screen` for the back button and the tab bar.
- `public/assets/cloud.js`: optional cloud synchronization (Google sign-in + Firestore backup of pooja/japa data). It is also the one place the other scripts get Firebase from: `window.StotramCloud = {firebase, auth, db, get user()}`, a `cloud-ready` event once, and a `cloud-auth` event on every sign-in change. If the SDK is blocked or offline it stops quietly.
- `public/assets/admin.js`: loads published cloud stotras into the main site for every visitor (small, on purpose), plus a discreet link to `/admin.html` shown only when signed in as the admin.
- `public/assets/weekday.js`: renders the "today's suggestions" Home section. Display only — the editor lives in `admin-dashboard.js`.
- `public/assets/help.js`, `updates.js`, `messages.js`: see the next section.
- `public/assets/build-check.js` (Phase 29): reloads a page left open across a deploy. About 4 s after the page opens, and on every return to the tab (at most every 5 minutes), it fetches `/version.json` with `cache: 'no-store'`; if its `build` differs from the page's `<meta name="stotram-build">`, it reloads, but only when `html[data-screen]` is `home`, no sheet, dialog or picture is open, no text box holds text, and nothing is sending (`feedbackBusy()` from `feedback.js`, `window.messagesBusy()` from `messages.js`). Otherwise it waits for the screen to return to `home` or for the tab to be hidden. `sessionStorage.stotramReloadedFor` limits it to one reload per new id in a tab, so a browser that keeps serving the old page cannot loop. It also adds the build time ("వెర్షన్: …") under `.account-version` in the account sheet. A dev-server page carries `content="dev"` and never checks.

### Help (ⓘ), What's new, My messages

- **`help.js`** holds the `HELP` dictionary: a short, plain-Telugu explanation for every feature (a title, one to three short paragraphs, and one English gloss line). Any element with `data-info="KEY"` opens the ⓘ sheet (`#infoOverlay`) with that entry. One capture-phase click listener serves every ⓘ on the page, including the ones other scripts build later, and stops the click there; that is also what keeps the Japamala page's own tap-to-count handler from counting a bead when its ⓘ is tapped. The keys must match every `data-info` in the markup exactly (contract §6); the contract checker compares them. Exports `showInfo(key, trigger)`, `closeInfo()` and `HELP_KEYS`.
- **`updates.js`** runs the bell in the header, the Home teaser and the `#updatesOverlay` sheet. It merges the bundled `SITE_UPDATES` with the Firestore `updates` collection (which the admin dashboard writes) by id, newest first. "Unread" means the newest entry's date is later than `localStorage.stotramUpdatesSeen`; while something is unread, the kumkum dot on the bell and the teaser are shown, and opening the sheet marks everything seen. If Firestore is unavailable, only the bundled list is shown. Exports `openUpdates()` / `closeUpdates()`.
- **`messages.js`** turns the four feedback type chips into one radio group that drives the hidden `#fbType` select, keeps a local copy of every message the reader sends (`recordSentMessage(payload)` → `localStorage.stotramMyMessages`, newest first, at most 30, with its claim key and author), and shows "నా సందేశాలు" in the `#messagesOverlay` sheet: a list of conversations (merged with the signed-in reader's own Firestore `feedback` documents), and a chat view per conversation with the composer, attachments and a way back. It links messages sent without signing in to the account on sign-in (the claim), tracks unread replies per conversation (`stotramThreadSeen`), sets the count in `#messagesBadge` and `.has-unread` on the header's account button, and creates the feedback form's attach picker (`window.feedbackPicker`). Exports `openMessages()`, `closeMessages()`, `recordSentMessage()` and `syncFeedbackChips()`.

### Conversations and attachments (Phase 27)
The interface between the scripts is frozen in `docs/conversations-contract.md`. In short:
- **Data.** A report is a conversation: `feedback/{fbid}` holds the first message (plus `lastAt`, `lastFrom`, `lastAdminAt`, an optional `claimKey` and the first message's `files` list). Follow-ups from either side are `feedback/{fbid}/messages/{mid}` (never edited). Each attachment is its own document `feedback/{fbid}/files/{mid}-{n}`, written once, at most 3 per message, the bytes stored as a Firestore Blob (at most 800,000 bytes). Firebase Storage is not used because it needs the paid plan. Replies written before Phase 27 (`reply` / `repliedAt` on the parent) are still shown as the first team message.
- **Who can do what.** A first message may be sent without signing in; continuing a conversation needs Google sign-in. A message sent without signing in carries a random `claimKey`, kept on that phone. When someone signs in on the same phone, `messages.js` proves the key and the message joins their account (within 30 days). A phone that sent a message without signing in may upload its attachments only within 15 minutes and only with that key. A message written by one account is never claimed by, sent as, or listed for another account on a shared phone: a queued message goes out as its author, is held while another account is signed in (at most 7 days, then it goes out with no account and its claim key), and other accounts' local copies are hidden from the list.
- **Sending safely.** A follow-up that takes longer than 15 seconds is kept, not dropped: Firestore still sends it, and the composer stays locked with "ఇంకా పంపుతోంది… మళ్ళీ పంపకండి" so it is never posted twice. Attachments that fail can be retried without a duplicate message. A report retried unchanged reuses its id and claim key; any edit makes a new message.
- **Telling a reader you replied.** There is no email or SMS service. The dashboard's "తెలియజేయండి / Let them know" buttons open your own email, WhatsApp or SMS app with the reader's address or number and a ready-made message (with the reply text for readers who were not signed in, a pointer to "నా సందేశాలు" for those who were). Nothing to set up, no cost, and no DLT registration, because the message is sent from your own phone.

Every sheet behaves the same way: it saves and restores `document.body.style.overflow` to lock scrolling while open, moves focus into the sheet and back to the button that opened it, closes on a backdrop tap, and closes on Escape (only the top sheet; its capture-phase key listener stops the event).

The site's `localStorage` keys are `readerFontSize`, `showMeanings`, `stotramFavorites`, `stotramReaderPositions`, `stotramLibraryCategory`, `poojaTrack_v1`, `jm_mode_v2`, `feedbackQueue_v1`, `stotramUpdatesSeen`, `stotramMyMessages`, `stotramMessagesSeenAt` (read only now: the fallback for conversations without their own mark), `stotramThreadSeen` (per-conversation "seen up to" times), `poojaTrackOwner` and `poojaTrackAside_<uid>`. The only `sessionStorage` key is `stotramReloadedFor` (`build-check.js`). `poojaTrackOwner` is the uid the pooja data on this device last synced to; `cloud.js` writes it only after a successful push. When a different account signs in on the same phone, it must answer a question (Escape and a tap outside do nothing) before this phone's entries are added to it. Answering no copies the phone's entries into `poojaTrackAside_<previous uid>` and shows only the new account's data; the set-aside entries are merged back, and the key removed after a successful push, when that account signs in on this phone again. This matters because entries made while signed out never reached any account. Local changes are pushed only after the account's cloud copy has been pulled and merged, a failed pull is retried (15 s, 1 min, then every 5 min, and at once when the phone comes back online or the page is shown again), and signing out first sends any change still waiting in the 1.5 s push debounce.

## Admin dashboard (`admin.html`)

A separate page, not a modal bolted onto the reading site. Loads its own copy of the 32 dataset scripts (so `stotramConfig`/`origins`/`meanings` exist here too) but none of `index.html`'s reader/search/tracking code.

- `public/assets/admin-dashboard.js`: everything — content list/add/edit/delete/revert, OCR-assisted entry, verse names in the editor (`[పల్లవి]` on a verse's first line labels it, a `~` line is a blank line inside a verse; `parseVerses` / `joinVerses`, checked by `tools/verify-verse-labels.cjs`), the conversations inbox (threads, replies with pictures or PDFs, the waiting filter, the Email / WhatsApp / SMS notify buttons, delete with all messages and files), weekday-map editor, "What's new" entries, export backup. Gated by Firebase auth + `ADMIN_UID`, but **that check is UI-only**; see "Authorization boundaries" below.
- `styles/admin.css`: Tailwind CSS v4 (including Preflight), scanning only the admin sources so the reading site's markup never leaks utilities into this bundle. Its palette mirrors `styles/tokens.css` and it imports the same self-hosted fonts; when a token changes there, change it here too. Tailwind is safe here because this page has no hand-authored cascade to protect.
- Built as its own Vite entry (`vite.config.js`'s `environments.client.build.rollupOptions.input`), so it ships its own CSS/behavior bundle — the main site never loads admin code, and vice versa.

## Authorization boundaries

- **`/api/ocr` (Worker, `src/ocr.js`)**: the real check. Verifies the caller's Firebase ID token server-side (`src/auth.js`, via Google's Identity Toolkit), then compares the resulting UID against `ADMIN_UID`. This is enforced regardless of what the client sends.
- **Firestore** (`stotras`, `feedback`, `config`, `updates` and `users` collections): gated by Firestore security rules. **The live rules are console-managed and not deployed from this repo** — if you need to know the exact current rules, check the Firebase console, not this codebase. `docs/firestore.rules.proposed` is the version-controlled rules file (public read and admin-only write on `updates`; readers read back their own conversations; only the admin writes status and team messages; the claim, follow-up, message and attachment rules of Phase 27); it takes effect only when someone pastes it into the console. **Deploy order: paste the rules first, then deploy the site.** The new rules still accept everything the previous site writes, but the previous rules refuse the new site's messages, and a refused message is dropped from the offline queue without a trace. The rules are checked with a small stand-alone rules evaluator, `npm run rules:check` (`tools/rules-check/`, 195 checks; run it after every rules change); the bottom of the file lists the Rules Playground checks and the live-site tests to run after publishing.
- **Storage flooding.** Anyone may start a conversation, and a phone that is not signed in may attach up to 3 files of 800,000 bytes within 15 minutes. Rules cannot rate-limit, so a script could fill the free plan's 1 GiB of stored data. When that happens Firestore refuses new writes everywhere (including `users/` sync) until data is deleted; clean up from the dashboard (Delete removes a conversation with all its messages and files). Firebase App Check (below) is the remedy if it ever happens; turn it on in monitor mode first.
- **Feedback flooding (optional hardening).** Anyone can create a `feedback` document; that is the point of the form. The honeypot field stops simple bots, and the rules cap field sizes. A determined script could still fill the inbox. If that ever happens, turn on **Firebase App Check** with reCAPTCHA v3: register the site in the Firebase console (App Check → Apps → reCAPTCHA v3), add the site key to `site-config.js`, initialise `firebase.appCheck().activate(siteKey, true)` in `cloud.js` after `initializeApp`, and switch Firestore to *enforced* only after the console shows that real traffic carries valid tokens. It was not turned on in the redesign because it needs a reCAPTCHA key from the owner and can block older browsers if enforced too early.
- **Client-side `ADMIN_UID` checks** (`site-config.js`'s value, read by `admin.js`/`admin-dashboard.js`): control which UI renders (the dashboard link, the dashboard page itself) so a non-admin visitor doesn't see controls that would fail anyway. Not a security boundary on their own — anyone can read this value from the shipped JS.

## Worker modules

- `src/index.js`: HTTP routing and static asset fallback only.
- `src/ocr.js`: authenticated OCR workflow, payload limits, Gemini request, and two-pass comparison.
- `src/auth.js`: Firebase token verification.
- `src/http.js`: JSON response policy.

OCR accepts at most six JPEG, PNG, or WebP images, limits individual and combined encoded payload sizes, verifies the caller before invoking Gemini, supports an optional `ADMIN_UID` runtime override, and marks responses as non-cacheable.

## Verification

**`npm run verify`** runs `tools/verify.cjs`, which also runs `verify-reader-smoke`, `verify-worker`, `verify-japamala`, `verify-reader-theme`, `verify-meanings`, `verify-library` and `verify-reader-navigation`. All of them are file-based checks: no browser, no build and no `npm install` needed.

- `verify.cjs` checks every dataset and its source metadata, verse sequences and name counts, frontend and inline-script syntax, script load order, the semantic card links, the reader's font-size limits and storage failures, and the stylesheet architecture: `index.html` links only `/styles/app.css`; `app.css` imports `tokens.css`, `base.css` and `components.css` first, every page file, and `behavior.css` last, and none of the legacy files; `tokens.css` defines the core tokens; `behavior.css` keeps `[hidden]`, the four Home panel rules and the reduced-motion switch. It also follows every `@import` and local `url()` from `app.css` and checks the icon sprite and deity-symbol references.
- `verify-reader-theme.cjs` checks the fixed Grandham reader, the selected category chip and the date-input rule, and computes the key contrast ratios (ink on ivory, reading ink on paper, white on peacock, gold text, the selected chip) from `tokens.css` and `library.css`.

**`node tools/check-ui-contract.cjs`** checks the redesign contract (`docs/redesign-research/contract.md`). It parses the CSS with `postcss` (a devDependency, so run `npm install` once) and reads `index.html` and the scripts as text; it needs no browser and no build. It prints a report grouped by check and exits with code 1 when anything is wrong (code 2 if `postcss` is not installed):

- (a) no page file re-declares a property `behavior.css` reserves. That covers the same last compound selector and also a more specific one for the same element (`a.card` or `.card.shiva` against `.card`, which would outrank `behavior.css` despite the load order), or one that reaches the same `index.html` element through another id or class (`#readerPage` for `.reader-page`); (b) the containing-block ban; (c) no `overflow` on `html` / `body` in any shipped stylesheet;
- (d) the `index.html` structure the e2e test relies on (one link per menu target, header button order, the practice launchers, one reader-options summary, the font buttons, the mala mode order, Japamala buttons that stop propagation, no ⓘ inside a `<summary>`, unique ids) and that every inline `on…` handler, in the page and in the markup the scripts build, calls a function some script defines;
- (e) the `data-info` keys ⇄ the `HELP` dictionary ⇄ contract §6; (f) top-level name collisions between the classic scripts of one page; (g) only self-hosted or system fonts; (h) every class used in the markup or the scripts has a selector (except the JS-only hooks listed, with the reason for each, at the top of the file); (i) every icon reference exists in the sprite; (j) no text under 14px.

It also reports any stylesheet in `styles/` that no page loads, and any script that neither page loads. Use `--all` to print every line, `--only=a,d` to run some checks, `--json` for a machine-readable report, and `--root=DIR` to check another copy of the repository. Run it before committing CSS or markup changes. It is not part of `npm run verify`.

**`npm run shots`** builds the site, then renders `dist/client` in the locally installed Google Chrome (through `playwright-core`; files are served from disk by request interception, so no server is started). It visits every scene (Home, Library, Saved, Practice, the reader in several states, the Japamala views including 3D, Track and the day sheet, search, the account hub, feedback, What's new, My messages, the ⓘ sheet, the confirm dialog, a scroll-lock probe, a motion pass, the conversation screens (`convo-*`, `admin-convo`, shown with seeded data through `tools/fake-firebase.js`), and the design preview `docs/redesign-preview.html`) at phone (390×844), small phone (320×640) and desktop (1280×860) sizes, plus a phone held sideways (844×390, captured one screen tall so the short-screen layout stays active), with a realistic returning reader seeded into `localStorage`. It writes the screenshots and `report.json` (JS errors, sideways overflow and layout probes) to `docs/ui-reviews/current/`. `npm run shots -- home reader` renders only the scenes whose names contain those words.

**`npm run e2e`** builds the site, then runs three browser tests. `tools/e2e-build-check.cjs` checks that every local script in the built pages is stamped and that the page's id matches `version.json`, then answers `/version.json` itself to drive `build-check.js` through each case: the same id (no reload; the build date shows in the account sheet), a new id on Home (one reload, and no second one for the same id), and the cases that must wait (typed text, an open sheet, a reply or report still sending, the reader, the mala) until it is safe, plus a failing `/version.json`. `tools/e2e-conversations.cjs` drives the conversations feature on `index.html` and `admin.html` (at 1280 and 390 px) against `tools/fake-firebase.js`, an in-memory stand-in for the Firebase SDK with a small mirror of the most important rules, served in place of Google's SDK files: attachment limits and shrinking, sending without signing in and the claim on sign-in, unread replies, follow-ups (locked while sending, never sent twice on a slow network), refused / offline / partly uploaded reports retried without duplicates, the account-safe queue, and the dashboard's list order, waiting filter and badge, thread, picture viewer, reply with a picture, notify links, mail-link safety, 200-message cap and delete cascade. `tools/review-devotional.cjs` is an end-to-end interaction test of `dist/client` in the local Chrome, served the same way. It walks the whole site as a reader would (menu, category filters, a prayer, the reading options, the Japamala views including the 3D one and a lost WebGL context, Track, the account hub, search, feedback), asserts the strict locators listed in contract §8, requires zero JS errors, and checks that nothing scrolls sideways at 320, 390 and 768px. It saves screenshots to `docs/ui-reviews/devotional/`. Set `BROWSER_EXECUTABLE` to use a different Chrome binary, or `PLAYWRIGHT_MODULE` to use a full Playwright install.
