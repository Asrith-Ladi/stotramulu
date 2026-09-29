# Verification constraints for the CSS rewrite and index.html restructure (stotramulu)

## 0. Baseline and scope

- **What `npm run verify` runs:** it runs `tools/verify.cjs` only (`package.json` "verify"). That script also runs these through `execFileSync` (`verify.cjs:65-69`): `verify-reader-smoke`, `verify-worker`, `verify-japamala`, `verify-reader-theme` and `verify-meanings`.
  - `verify-library.cjs` and `verify-reader-navigation.cjs` are **not** run by `npm run verify`. You have to run them yourself.
  - `review-devotional.cjs` is a manual Playwright check.
- **Results I got on 2026-09-28:** `verify.cjs`, `verify-library.cjs` and `verify-reader-navigation.cjs` all **PASS**.
- **`review-devotional.cjs` could not be run.** The sandbox refused to let it open its local server (`listen EPERM`). Everything below about it comes from reading the code. From that reading, it has two failures that already exist today:
  1. **Wrong folder served.** `review-devotional.cjs:7-10` serves files from the current directory with no fallback to `public/`. `/assets/*.js` and `/data/*.js` would return 404 when run from the repo root (there is no root `assets/` folder), so `.category-filters` never appears and line 21 times out. It only works when run with the current directory set to `dist/client` after `npm run build`. That is also the only way Vite/Tailwind-processed CSS would get applied.
  2. **Account overlay blocks a click.** At `:96-98` the Account overlay is open (`#accountOverlay.search-overlay.active`: fixed, inset 0, z-index 500, `styles.css:752-757`). The next click on `[data-home-target="library"]` hits the overlay instead, because the header is only at z-index 40. There is no Escape key press in between, so the click will likely time out.
- **`node --check` treats every `public/assets/*.js` as an ES module (strict mode).** This is because `package.json` has `"type":"module"`; I confirmed it with a quick test. But the browser loads these files as classic `<script src>`. So new JS files must be valid in strict mode and must **not** use `import`/`export`.

## 1. tools/verify.cjs

| file:line | Assertion (exact) | What it protects | Effect of the CSS rewrite |
|---|---|---|---|
| 60 | `/readerSectionNav/` appears in raw index.html | the section-jump container | Breaks only if the markup id is renamed |
| 61 | `/sourceStatusBadge/` appears in raw index.html | the source status badge | Same |
| 62-64 | `node --check` passes on every `public/assets/*.js` (strict ESM parse) | syntax of the behaviour scripts | Any new asset JS must pass |
| 70 | index.html is read with `<!--…-->` comments removed for the checks at 71-91 | — | — |
| 71 | index of `assets/reader.js` < index of `assets/app.js` | script order | Keep the order |
| 72 | index of `assets/tracking.js` < index of `assets/app.js` | script order | Keep the order |
| 73 | index of `styles/reading.css` < index of `styles/design-system.css` | "final design system load order" | **BREAKS when both files are deleted** (-1 < -1 is false). It also breaks if design-system.css is missing, or loaded before reading.css. It still passes if only reading.css is gone. |
| 74 | `readFileSync('styles/design-system.css')` | — | **BREAKS when the file is deleted** (ENOENT) |
| 75 | design-system.css matches `/--ui-gold-bright:/` | the token exists | New file needs this token, or update the test |
| 76 | design-system.css matches `/@media \(prefers-reduced-motion: reduce\)/` (one space after the colon) | the reduced-motion kill-switch | Same |
| 77 | `card-btn` does not appear in index.html + `public/assets/admin.js` | nested card buttons stay removed | Don't use `card-btn` as a class name |
| 78 | exactly **30** matches of `/<a[^>]+data-stotram="[^"]+"/g` in comment-stripped HTML | all bundled prayer cards are real links | Breaks on: any extra static `<a … data-stotram>`; any tag starting with `a` (e.g. `<aside data-stotram>`); cards rendered by JS; un-commenting the 2 Manidweepa cards (raw count is 32) |
| 79 | no match for `/<div[^>]+class="card(?: \|")/` | no clickable-div cards | e.g. `<div class="card update-card">` fails; `card-content` is fine |
| 80 | every non-empty inline `<script>` parses with `new vm.Script` (classic script) | inline JS syntax | Inline JSON-LD, `importmap`, `type="module"` with `import`, or HTML templates in `<script>` all FAIL |
| 81-84 | every `(src\|href)="/(assets\|data\|styles)/…"` exists. `styles/…` is checked at the **repo root**; `assets/` and `data/` are checked under `public/`. Query strings and hashes are stripped. | no broken local links | New CSS must live in the root `styles/` folder (not `public/styles`). New fonts/images under `/assets/` must exist in `public/assets/`. `/icons.svg` is not checked. |
| 88 | `app.js` has fewer than 700 lines (currently 525) | app.js stays small | Put new features in new files |
| 89 / 90 | reader.js contains `function renderSlokams`; tracking.js contains `function openTrack` | — | JS only |
| 91 | `headerActions` does not appear in app.js + japamala.js + index.html | removed header code stays deleted | Don't name a new header container `headerActions` |
| 92-106 | Runs app.js from `let currentFontSize` up to `function createParticles`, and reader.js from `function changeFontSize` up to `function toggleMeanings` and from `function readingKey` up to `function readSet`. Needs id `fontSizeDisplay`. The mock `querySelectorAll` returns the smaller button when the selector contains `-2` and the larger button when it contains `(2)`. Checks the 18–48 range, the `readerFontSize` storage key, and survival when storage throws. | font-size limits and disabled buttons | The markup must keep `onclick="changeFontSize(-2)"` and `onclick="changeFontSize(2)"` exactly: `reader.js:149-150` finds the buttons by those attributes. |
| 107-108 | reader.js slice from `function countTextLines` to `function labelHighestNumber` | line counting | JS only |

## 2. tools/verify-reader-theme.cjs

| line | Assertion | Effect |
|---|---|---|
| 7 | `readFileSync('styles/reading.css')` (the content is never checked) | **BREAKS when the file is deleted** |
| 8 | `readFileSync('styles/design-system.css')` | **BREAKS when the file is deleted** |
| 10 | index.html matches `/<body class="grandham">/` exactly | The body tag must stay exactly `<body class="grandham">` in the source. No extra classes and no extra attributes. Theme switching has to go on `<html>` or be added by JS at runtime. |
| 11 | html must not match `grandhamToggle\|toggleGrandham` (raw HTML, comments included) | — |
| 12 | reader + app + html must not contain `localStorage.getItem('grandham')`, `initGrandham` or `toggleGrandham` | — |
| 13 | html must not contain `గ్రంథ రూపం, శ్లోకం` | text constraint |
| 15 | design-system.css contains `.category-filters button[aria-pressed="true"]` | selected state of the category filter |
| 16 | design-system.css matches `/\.home-page input\[type="date"\]\s*\{[^}]*color-scheme:\s*light;/` | The selector must stand on its own, directly followed by `{`. A selector list with a comma does not match. `color-scheme: light;` must be inside that same block, with the `;`. |
| 27-28 | Contrast checks on **hard-coded** colours (#634b2e on #f5efdf ≥4.5; #fff9e9 on #664524 ≥7) | These never read the CSS, so they always pass. Update them to the new palette so they mean something. |

## 3. tools/verify-japamala.cjs (reads raw HTML, comments included)

| line | Assertion |
|---|---|
| 5-6 | Matches of `/class="jm-mode-btn" data-mode="([^"]+)"/g` must equal `['flow','strand','full','rudraksha3d']` in that order. The class value must be exactly `jm-mode-btn` with no extra classes, followed by one space and then `data-mode`. |
| 7 | html contains `id="jmStageStrand"`, `id="jmStageFull"` and `id="jmStageFlow"` |
| 8 | html must not match `japamala-hand\|jmStageHand` |
| 9-10 | japamala.js has no `jmHand` and contains `includes(mode) ? mode : 'flow'` |
| 12-13 | japamala-3d.js shader precision: exactly 2 of each line |
| 14 | index of `assets/japamala-3d.js` < index of `assets/japamala.js` |

## 4. JS/data-only scripts (the CSS rewrite doesn't touch them; they only pin ids and JS text)

- **verify-reader-smoke.cjs**
  - Slices app.js from `function openReader(type)` to `function goHome()` to `window.addEventListener('scroll'` (:38-39), and reader.js from `function renderSlokams(data, type)` to `/* ====…` (:86).
  - Checks that `homePage.style.display` is `'none'` after opening a prayer (:75) and `'flex'` after going home (:81), that `#readerPage` gets `.active` (:76/:82), and that `.reader-empty-state` is used (:97).
  - **Knock-on effect for the CSS:** `goHome()` sets `display:flex` inline on `#homePage` (`app.js:96`). So the new `.home-page` must be designed as a flex column; a grid layout would be overwritten. The old rule is `styles.css:152-155`.
- **verify-meanings.cjs**
  - Slices reader-navigation.js from `function readerMeaningCoverage` to `function setupReaderNavigation` (:39).
  - Needs ids `meaningToggle` (with a `<label>` child: `reader-navigation.js:186`), `meaningToggleRow` and `readerOptionsSummary`.
  - Checks the JS text `అర్థం చూపించు (8/9)` and `శ్లోకం, సేవ్, లెక్క` (:55,:60), and that `appendMeaningReview(content, type, audit)` is present (:61).
- **verify-library.cjs** (not run by `npm run verify`)
  - Needs ids `favoriteButton` (`aria-pressed`), `favoritesSection`, `readerLinkStatus` and `readerLinkFallback`.
  - Favorites structure: `children[1].children[0]` is the first link, i.e. the h2 comes first, then the list (:12).
  - Storage-failure text `సేవ్ కాలేదు` (:17); `stotras-updated` and `popstate` events.
- **verify-reader-navigation.cjs** (not run by `npm run verify`): `verseJump`, the `verse-N` ids, the `stotramReaderPositions` and `stotramLibraryCategory` storage keys, and the `library-section-N` id format.
- **verify-worker.cjs:** only checks `src/`. Not affected.

## 5. tools/review-devotional.cjs (Playwright). A locator marked "strict" must match exactly one element when clicked.

| line | Selector / assertion | Requirement |
|---|---|---|
| 16 | viewport 1440×1050, `reducedMotion:'reduce'` | The reduced-motion kill-switch must stop infinite transform animations on anything clickable, otherwise Playwright's "stable" check times out |
| 17, 136 | `errors` must be `[]` | No uncaught JS errors. See §7 for the DOM hooks JS needs. |
| 19 | firebase, gtag and firestore requests are aborted | cloud.js turns itself off |
| 21 | `.category-filters button` attached | Created by JS (`reader-navigation.js:309-357`). Needs `#homePage`, `.home-primary-actions` and at least one `.cards-section` |
| 22 | `.cards-section:visible` == 0 on Home | Needs the data-view/data-panel CSS rule (§6) |
| 25, 45, 98 | `[data-home-target="library"]` (strict) | Exactly one per target; must be visible and clickable from the reader, track and japamala pages |
| 27-31 | each category button i≥1 leaves exactly one `.cards-section:visible` | Needs `[hidden]{display:none!important}`; each section needs a `.section-title` |
| 33 | `a.card:visible` == 30 in "all" | No extra visible `a.card` in the library view |
| 34 | `a.card[data-stotram="vishnu"]` | — |
| 35 | `#readerPage.active` visible | `.reader-page.active` must display |
| 36 | URL contains `stotram=vishnu` | JS |
| 37 | `.font-btn` `.last()` | The **larger** font button must be the last `.font-btn` in the DOM |
| 38, 42 | `.reader-options summary` (strict) | Exactly one `<summary>` inside `.reader-options`. **No nested `<details>` used as info toggles inside it.** |
| 39-40 | `#favoriteButton` click; `aria-pressed="true"` | Must be visible once the options panel is open |
| 41 | `#verseJump` selectOption('2') | Must be a visible, enabled `<select>` inside `.reader-options` |
| 46 | `#homePage` visible | — |
| 48 | `#practice button` `.first()` | The Japamala launcher must be the first button inside `#practice` |
| 49 | `#japamalaPage.active` visible | — |
| 50 | `.jm-mode-btn` count == 4 | — |
| 52, 58 | `[data-mode="flow\|strand\|full\|rudraksha3d"]` (strict) | No other element may have a `data-mode` attribute |
| 53, 62 | `.jm-btn-count` (strict) | Exactly one |
| 55 | `#jmCount` text == '3' | Mode buttons and COUNT must call `event.stopPropagation()`, because `#japamalaPage` has `onclick="bumpJapa()"` |
| 57 | `setJmMode('hand')` makes flow `.active` | JS |
| 60 | `#jmRudrakshaFallback` not visible | WebGL renders |
| 63-70 | canvas click gives 5; drag from (+100,+100) to (+180,+110) keeps 5; Enter gives 6 | `#jmRudrakshaCanvas` must be at least about 181×111 px, not covered by anything, and focusable |
| 71-79 | lose/restore WebGL context: fallback shows then hides; count kept | Uses the `hidden` attribute plus `japamala-3d.css:92` |
| 80-82 | `.jm-btn-reset` (strict) → `.sc-overlay [data-yes]` → overlay removed; `#jmCount` '0' | `.sc-overlay` must sit on top so its button can be clicked |
| 87-88 | `[data-home-target="favoritesSection"]` from the mala page → `#favoritesSection` visible | **The header must not be covered by the japamala page** (e.g. by a full-screen fixed layer) |
| 90 | practice view: 0 `.cards-section:visible` | — |
| 91-92 | `#practice button` `.nth(1)` = Track → `#trackPage.active` | The second button in `#practice` must be the Track launcher |
| 93-94 | `#prevMonthBtn`, `#nextMonthBtn` | Visible and enabled |
| 96 / 104 | `.header-utilities button` `.nth(1)` = Account, `.first()` = Search | **Don't put new buttons (updates / info) ahead of these two** |
| 97 | `#cloudAuthBox` attached | — |
| 100, 103 | after reload and after goBack, `#homePage` has `data-view="library"` | Hash routing (`experience.js`) |
| 105-106 | `#searchInput` fill; `.search-result` visible | `.search-overlay.active` must display |
| 109-110 | `.footer-feedback` (strict) → `#feedbackOverlay.active` visible | — |
| 108, 112 | Escape closes the overlays (`app.js:290`) | — |
| 115 | `[data-home-target="homePage"]` clickable at 320, 390 and 768 px | **No hamburger menu that hides the nav on mobile** |
| 118-119 | nothing in `#homePage *, .header *` extends past `innerWidth+1`. Only `.hero-art` and its children, and `position:absolute` elements, are skipped. | **No horizontal-scroll rows** (chip rows, "updates" carousels). Clipping is ignored: anything scrolled off-screen counts. Hidden popovers must use `display:none`, not opacity or an off-screen transform. |
| 122-123 | the set of `#homePage > [data-panel]:visible` values is exactly `['library']`, `['saved']` or `['practice']` | See §6. New direct children of `#homePage` automatically become the `home` panel (`experience.js:11-15`) |
| 124-125 | the same overflow check on `#homePage *` in each view, **with no exemption for absolute elements** | Absolutely positioned info tooltips must not stick out past the right edge |
| 129-135 | injects a `div.cards-section` containing `.section-divider>h2.section-title` and an empty `.cards-grid`, fires `stotras-updated`, then `getByRole('button',{name:'New collection'})` → one visible section | Filters must stay real `<button>` elements. A section with an empty grid must still take up space; don't hide it with `:has(:empty)`. |

## 6. CSS rules the tests depend on that live in the files being deleted (they must be rebuilt)

**These visibility rules are required:**

| Rule | Where it is now | Needed by |
|---|---|---|
| `[hidden]{display:none!important}` | design-system.css:23 | Category filtering, `#readerSectionNav`, `#meaningToggleRow`/`#meaningToggle`, `.rs-nav`, `#readerLinkFallback`, and the 3D canvas when WebGL is lost (`japamala-3d.css` sets `display:block` on the canvas) |
| `#homePage[data-view="X"] > [data-panel]:not([data-panel="X"]){display:none!important}` for X = home, library, saved, practice | design-system.css:213-216 | review 22, 90, 122 |
| `.reader-page{display:none}` + `.active{display:block}` | styles.css:339-343 | — |
| `.track-page` + `.active` | styles.css:826-827 | — |
| `.japamala-page` + `.active` | styles.css:851-852 | — |
| `.search-overlay` (fixed, inset 0) + `.active` | styles.css:752-757 | Also used by `#accountOverlay` |
| `.feedback-overlay` + `.active` | styles.css:1385-1390 | — |
| `.sc-overlay` + `.show` (starts at opacity 0) | styles.css:1327-1342 | — |
| `.day-sheet-overlay` + `.active`, and `.day-sheet` transform | styles.css:1094-1104 | — |

**These are behaviour hooks:**

| Rule | Where it is now |
|---|---|
| `.scroll-top-btn` + `.visible` | styles.css:675-694 |
| `.origin-block` + `.visible` | styles.css:590-604 |
| `.slokam-meaning` hidden by default + `body.show-meanings .slokam-meaning{display:block}` | styles.css:549-563, 580 |
| `.reminder-banner` + `.show` | styles.css:816-822 |
| `.meaning-toggle.on .toggle-switch` | styles.css:464-469 |
| `#readerLinkStatus:empty{display:none}` | reading.css:80 |
| `.month-strip{display:flex;overflow-x:auto;scroll-snap-type:x mandatory}` and `.month-card{flex:0 0 100%}` | styles.css:1076-1078 (`tracking.js:112-131` works out the month from scrollLeft / clientWidth) |
| sticky `.header` stacked above the pages and below the overlays | design-system.css:29 |
| back-button slot hidden through `:has(.back-btn[style*="none"])` | design-system.css:32 (the button is shown/hidden by JS through inline style) |
| `.category-filters{flex-wrap:wrap}` | design-system.css:80 |
| mobile `.hero-art` as `position:absolute` | design-system.css:151 |
| `.skip-link` placed off-screen | design-system.css:27-28 |
| `.home-page` as a flex column | styles.css:152-155 |
| the reduced-motion kill-switch | design-system.css:180-183 |

**Token needed by the file that stays:** `japamala-3d.css:79,88` uses `var(--gold-light)`, which is only defined at `styles.css:3`.

**Classes and attributes JS toggles, which the new CSS must style:**
- `.active`: pages, overlays, `.jm-mode-btn`
- `.show`, `.visible`, `.on`
- `body.show-meanings`, `.slokam-block.read`, `.listening`, `mark.current`
- `.cur`, `.pop`, `.celebrate`, `.jm-confetti`
- `.invalid`, `.done`, `.due`
- `.cal-day.today`, `.future`, `.has-data`, `.empty`
- `[aria-pressed="true"]`, `[aria-current]`
- `.source-status-badge.{verified,partial,review,pending,override}` and `.meaning-review-status.*`
- `#homePage[data-view]` and `[data-panel]`

## 7. DOM hooks JS needs (if one is missing → uncaught error → review:136 fails, or the feature breaks)

**Checked every time the page loads:**
- `#particles` (`app.js:26`). Playwright won't catch this one, because reduced motion skips the code.
- `#micBtn` (`app.js:185`)
- `#reminderBanner` (`app.js:278`)
- `#homePage`
- `.home-primary-actions` and `.practice-details` (`reader-navigation.js:308,356`). If `.practice-details` is missing, a literal "null" text node gets appended.
- `.primary-link` (`experience.js:47`). If it is missing, routing never starts.
- `.skip-link` (`experience.js:62`)
- `.welcome-section` (`reader-navigation.js:167`, once reading history exists)
- `#scrollTopBtn` (`app.js:115`, on every scroll)

**Used when the user moves around the site:**
- Reader: `readerLinkStatus`, `readerLinkFallback`, `readerPage`, `trackPage`, `backBtn`, `readerTitleSection`, `readerTitle`, `readerSubtitle`, `readerDeityBg`, `originBlock`, `slokamContainer`, `fontSizeDisplay`, `verseJump`, `readerSectionNav`, `sourceStatusBadge`, `sourceContent`, `sourceDetails`, `meaningToggle` (with a `<label>`)
- Home, search and account: `searchOverlay`, `daySheetOverlay`, `searchInput`, `searchResults`, `searchHint`, `accountOverlay`
- Track: `monthStrip`, `monthLabel`, `prevMonthBtn`, `nextMonthBtn`, `mokkuText`, `mokkuDate`, `mokkuList`, `sheetDate`, `sheetBody`, `restoreFile`
- Japamala: `japamalaPage`, `jmBeads`, `jmGuru`, `jmFullBeads`, `jmFullGuru`, `jmFlowBeads`, `jmFlowGuru`, `jmCount`, `jmRounds`, `jmRudrakshaCanvas`, `jmRudrakshaFallback`; also `jmStageRudraksha3d` and `jmSvg`/`jmSvgFull`/`jmSvgFlow`, which the code checks for before using
- Feedback: `feedbackOverlay`, `fbForm`, `fbThanks`, `fbError`, `fbName`, `fbNumber`, `fbMessage`, `fbWebsite`, `fbType`

**Other markup contracts:**
- `data-cat` values (`sahasranama`, `ashtottara`, `stotras`, `aratis`) on the static `.cards-section` elements. `admin.js:156` uses them to put cloud cards into the existing section; without them it creates a duplicate section.
- `.cards-grid`, `h3`, `.card-sub` and `.card-desc` inside cards (`admin.js:147-168`).
- `.card-bg` and `.card-deity-svg` markup inside each card.
- The inline `onclick` handler names must still exist as global functions.
- `event.stopPropagation()` on every button inside `#japamalaPage`.

## 8. Two ways to handle the CSS file names

- **Option A: keep the tested paths.** Name the new files `styles/reading.css` and `styles/design-system.css`, and link reading.css before design-system.css. The new design-system.css must contain:
  - `--ui-gold-bright:`
  - `@media (prefers-reduced-motion: reduce)`
  - `.category-filters button[aria-pressed="true"]`
  - `.home-page input[type="date"] { color-scheme: light; }`
- **Option B: change the tests to the new names.** Edit `verify.cjs:73-76` and `verify-reader-theme.cjs:7-8,15-16`, and update the contrast colours at `verify-reader-theme.cjs:27-28` to the new palette.
- **Either way,** `docs/ARCHITECTURE.md:29-44` describes the three-file cascade and needs updating. `styles/japamala-3d.css` stays; it only needs `--gold-light` defined or restyled.

## 9. Checklist: must survive in the new markup

**Page and head**
- [ ] `<body class="grandham">`, written exactly like that
- [ ] Script order: `reader-navigation → reader → tracking → app → japamala-3d → japamala`, then `site-config → firebase → cloud → admin → weekday → library → experience`. At minimum, reader.js and tracking.js before app.js, and japamala-3d.js before japamala.js.
- [ ] CSS links point to existing files in the root `/styles/` folder (reading.css before design-system.css, or the tests updated)
- [ ] Inline `<script>` blocks contain only classic JS (no JSON-LD, no importmap)

**Header and navigation**
- [ ] `header.header` containing:
  - `#backBtn.back-btn` (visibility set by inline style)
  - `.header-utilities` with exactly Search first and Account second
  - exactly **one** each of `[data-home-target="homePage"|"library"|"favoritesSection"|"practice"]`, visible and clickable at 320, 390, 768 and 1440 px
- [ ] `.skip-link`, `.primary-link`
- [ ] Names that must not appear: `headerActions`, `card-btn`, `grandhamToggle`, `toggleGrandham`, `japamala-hand`, `jmStageHand`, `గ్రంథ రూపం, శ్లోకం`

**Home and library**
- [ ] `#homePage.home-page` (a flex column). Its direct children:
  - `.welcome-section`
  - `section#practice.home-primary-actions` with 2 buttons: Japamala first, Track second
  - `details.practice-details`
  - 4 × `.cards-section[data-cat]`, each with `.section-divider > .section-title` + `.cards-grid`
- [ ] Exactly **30** `<a class="card …" href="?stotram=KEY" data-stotram="KEY">`, and no other `<a…data-stotram>` or `<div class="card…">`
- [ ] Counters: `#homeDatePicker`, `#homePradakshinaCount`

**Reader**
- [ ] `#readerPage.reader-page` containing:
  - `#readerDeityBg`, `#readerTitleSection`, `#readerTitle`, `#readerSubtitle`
  - two `.font-btn` with `onclick="changeFontSize(-2)"` and `onclick="changeFontSize(2)"`, the larger one **last**
  - `#fontSizeDisplay`
  - `.reader-search` with `#readerSearchInput`, `#readerSearchCount`, `#readerMicBtn`, `.rs-nav` ×2 and `#readerSearchClear`
  - a single `details.reader-options` with exactly **one** `summary`, containing `#readerOptionsSummary`
- [ ] Inside `.reader-options`:
  - `#meaningToggleRow` > `#meaningToggle.meaning-toggle` > `label` + `.toggle-switch`
  - `select#verseJump`
  - `#readerSectionNav` (starts `hidden`)
  - `#favoriteButton` with `aria-pressed`
  - `#readerLinkStatus`, and `#readerLinkFallback` (starts `hidden`)
  - `#stotramCounterLabel`, `#stotramDatePicker`, `#stotramParayanaCount`
- [ ] After the content: `#slokamContainer`, `#originBlock`, `#sourceDetails`, `#sourceStatusBadge`, `#sourceContent`

**Overlays**
- [ ] `#searchOverlay` with `#searchInput`, `#micBtn`, `#searchHint`, `#searchResults`
- [ ] `#accountOverlay` with `#cloudAuthBox`, `#adminLinkBox`, `#restoreFile`

**Track**
- [ ] `#trackPage.track-page` containing `#reminderBanner`, `#prevMonthBtn`, `#monthLabel`, `#nextMonthBtn`, `#monthStrip`, `#mokkuText`, `#mokkuDate`, `#mokkuList`

**Japamala**
- [ ] `svg.jm-defs` with its gradients, outside any `display:none` stage
- [ ] `#japamalaPage.japamala-page` (keeps its `onclick`) containing:
  - 4 × `class="jm-mode-btn" data-mode="…"` in the order flow, strand, full, rudraksha3d
  - `#jmCount`, `#jmRounds`
  - `#jmStageStrand` (`#jmSvg`, `#jmBeads`, `#jmGuru`), `#jmStageFull` (`#jmSvgFull`, `#jmFullBeads`, `#jmFullGuru`), `#jmStageFlow` (`#jmSvgFlow`, `#jmFlowBeads`, `#jmFlowGuru`)
  - `#jmStageRudraksha3d` with a focusable `#jmRudrakshaCanvas` and `#jmRudrakshaFallback` (starts `hidden`)
  - exactly one `.jm-btn-reset` and one `.jm-btn-count`, both calling `stopPropagation`
- [ ] No other element with `data-mode`

**Feedback, day sheet and footer**
- [ ] `#feedbackOverlay` containing `#fbForm`, `#fbType`, `#fbName`, `#fbNumber`, `#fbMessage`, `#fbError`, `#fbWebsite` (the honeypot) and `#fbThanks`
- [ ] `#daySheetOverlay`, `#sheetDate`, `#sheetBody`
- [ ] `#scrollTopBtn`, `#particles`
- [ ] Exactly one `.footer-feedback`

**CSS**
- [ ] The global `[hidden]{display:none!important}`
- [ ] The data-view/data-panel hiding rules
- [ ] The display rules for `.active` / `.show` / `.visible`
- [ ] A header that is never covered by a page
- [ ] No horizontal overflow or scroll rows inside `#homePage` and `.header`
- [ ] A reduced-motion kill-switch
- [ ] `--gold-light`, or a restyled `.jm-rudraksha-hint` and `.jm-rudraksha-fallback`

**Before relying on the Playwright check:** make it run from `dist/client` after `npm run build`, or serve `public/` as a fallback (`:7-10`). Also add an Escape key press after `:97`, or it will likely keep failing at `:98` whatever the redesign does.