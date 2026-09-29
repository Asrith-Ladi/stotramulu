# Redesign contract (frozen for Phase 2)

Every Phase 2 agent reads this file in full before editing anything. It is the single source of truth for markup, class names, JS APIs, tokens and the visual specification.

## 0. Ground rules for every agent

1. **Only edit the files your role owns** (§1). If you need a markup change in a file you don't own, don't make it. Record it under "Requests for the integrator" in your final report.
2. **Design tokens live in `styles/tokens.css`.** Use `var(--…)` everywhere. No raw hex colours except inside tokens.css, SVG data URIs, and the Japamala bead rules.
3. **Shared components live in `styles/components.css`.** `.btn*`, `.track-btn`, `.icon-btn`, `.info-btn`, `.chip`, `.add-chip`, `.medallion`, `.status-pill`, `.tag`, `.field-input`, the counter family (`.counter-*`, `.count-*`), `.empty-state` and `.surface`. Compose them; don't restyle them in page files. If one is missing a variant you need, request it.
4. **`styles/behavior.css` is reserved.** It loads last. A page file must **not** re-declare any property that behavior.css already declares for the same selector (same last compound). For example, don't set `display` on `.reader-page`, `position` on `.card`, or `transform` on `.reader-deity-bg`. Pseudo-elements (`::before` / `::after`) of reserved selectors are yours to use.
5. **Containing-block ban** (these would trap fixed descendants or distort the WebGL canvas):
   - `.header`, `.reader-page`, `.day-sheet-overlay`, `.japamala-page`, `.jm-stage*` and `#homePage` must never get `transform`, `filter`, `backdrop-filter`, `perspective`, `contain`, `will-change` or `container-type`.
   - `.jm-stage*` must never get `animation` or `transition`.
   - `html` and `body` must never get `overflow`.
6. **Motion:**
   - Entrances may use transform only on elements that are not in the ban list, such as cards, sheets and dialog boxes.
   - Pages and panels fade (opacity) only; behavior.css already does this.
   - Durations and easing come from tokens: `--dur-*` and `--ease-out`.
   - The reduced-motion switch in behavior.css turns off every animation and transition, so the base state of everything **must be the visible final state**. Keyframes animate *from* a hidden state *to* the base.
7. **Accessibility for older readers:**
   - Every tap target is at least 44px; primary ones 48px or more.
   - Text is never under 14px, and never uppercase or letter-spaced Telugu.
   - Contrast is AA or better; tokens are pre-checked.
   - Focus stays visible (base.css provides `:focus-visible`).
   - Colour is never the only signal: pair it with an icon or text.
8. **Old CSS** (`styles/styles.css`, `reading.css`, `design-system.css`) is unlinked and read-only reference. It gets deleted in Phase 3. Never import it.
9. **JS:**
   - Classic scripts only. They must be valid in strict mode, with **no `import`/`export`**.
   - New code goes in an IIFE with explicit `window.x = …` exports.
   - No new top-level `const`/`let`/`function` names that collide with another script. All classic scripts share one global scope.
   - Escape any user- or data-derived string before putting it in `innerHTML`. Use the global `escapeHtml` from tracking.js, or build nodes with `textContent`.
10. When done, run `node --check` on every JS file you touched. Report what you changed and any requests.

## 1. File ownership (Phase 2)

| Agent | Owns exactly |
|---|---|
| CSS-1 Shell & overlays | `styles/layout.css`, `styles/overlays.css` |
| CSS-2 Home & library | `styles/home.css`, `styles/library.css` |
| CSS-3 Reader | `styles/reader.css` |
| CSS-4 Practice & japamala | `styles/practice.css`, `styles/japamala.css`, `styles/japamala-3d.css` |
| JS-1 Core | `public/assets/app.js`, `reader.js`, `reader-navigation.js`, `library.js`, `weekday.js`, `experience.js` |
| JS-2 Practice | `public/assets/tracking.js`, `japamala.js` |
| JS-3 Features | `public/assets/help.js`, `updates.js`, `messages.js`, `public/data/updates.js`, `public/assets/cloud.js`, `public/assets/admin.js` |
| JS-4 Admin | `admin.html`, `public/assets/admin-dashboard.js`, `styles/admin.css`, `docs/firestore.rules.proposed` (new) |
| Tools | `tools/verify.cjs`, `tools/verify-reader-theme.cjs`, `tools/check-ui-contract.cjs` (new), `docs/ARCHITECTURE.md`, `package.json` (devDependencies only: add `postcss`) |

Frozen, owned by nobody in Phase 2:
- `index.html`
- `styles/tokens.css`, `base.css`, `components.css`, `behavior.css`, `app.css`
- `public/icons.svg`
- `public/assets/japamala-3d.js`, `site-config.js`, `admin-dashboard.js` (JS-4 only)
- `src/*`

## 2. Design direction: "Kanchi silk"

The colours of a Kanchipuram pattu saree:
- **Chrome and primary actions:** deep peacock teal (`--peacock-900…600`).
- **Ornaments, borders and highlights:** zari gold (`--zari-*`). Use `--zari-700` / `--zari-800` for gold *text*.
- **Tiny signals only:** kumkum red (`--kumkum-700`), for example the "new" dot.
- **Page and reading surfaces:** ivory `--ivory` for the page, paper `--paper` / `--paper-leaf` for surfaces and verse cards.
- **Text:** ink `--ink`, `--ink-2`, `--ink-3`.

**Type:**
- Headings and verses: `--font-serif` (Noto Serif Telugu Variable).
- UI: `--font-ui` (Noto Sans Telugu Variable).
- Scale: `--fs-xs` 14, `--fs-sm` 15, `--fs-md` 17 (body), `--fs-lg` 19, `--fs-xl` 22, `--fs-2xl` 26, `--fs-3xl` 30.
- Verses use `--reader-font-size` (default 24px, range 18–48, set by JS).

**Shape and depth:**
- Radii: `--r-sm` 12, `--r` 16, `--r-lg` 22, `--r-xl` 28.
- Shadows are teal-tinted and soft (`--shadow-xs|sm|` default `|lg|primary`).
- Surfaces use a 1px `--line` border plus `--shadow-sm`.

**Visual reference:** `docs/redesign-preview.html`. It shows phone mockups of home, library, reader, practice with the ⓘ sheet open, japamala, the account hub and what's new. Match its look; class names there are illustrative only. Use the real names from index.html and §4.

**Breakpoints:**

| Name | Width | Layout |
|---|---|---|
| phone | < 600px | tab bar |
| tablet | 600–1023px | tab bar, 2-column grids |
| desktop | ≥ 1024px | tabs move into the header row, 3-column grids |

Also check 320px wide: it must not scroll sideways.

## 3. Static markup (index.html, frozen). Key regions and hooks

Read `index.html` itself. These are the regions:

### Header: `header.header`
- **`.header-content`** holds three things:
  - `.header-slot-left` (`display: contents` in behavior) with `button#backBtn.back-btn`, which contains an svg and `span.back-label`. JS writes inline `display: block` or `none` on the button.
  - `.header-titles` with `.header-om` (the ఓం mark), `h1` and `.header-sub`.
  - `.header-utilities` holding, **in this DOM order**, `button.hdr-btn.hdr-search`, `button.hdr-btn.hdr-account` and `button#updatesBtn.hdr-btn.hdr-updates`. The last one contains `span#updatesDot.hdr-dot[hidden]`. Each button is an svg `.icon-inline` plus `span.hdr-label`. Use CSS `order` to show the bell first; never change the DOM order.
- **`nav.site-navigation`** holds 4× `a[data-home-target] > svg.nav-icon + span.nav-label + small(English)`. The targets are homePage, library, favoritesSection and practice. experience.js sets `aria-current="page"` on the current one.

### Home: `#homePage.home-page`
It's a flex column (behavior). Its direct children, in DOM order after the JS runs:

| # | Child | Panel |
|---|---|---|
| 1 | `section.welcome-section` (hero) | home |
| 2 | `#recentReadingSection` (JS, only if there is reading history) | home |
| 3 | `section#updatesTeaser.updates-teaser[hidden]` (JS fills it) | home; put it last with `order: 1` |
| 4 | `#todaySection` (JS, weekday.js) | home |
| 5 | `nav#library.library-navigation` (JS) | library |
| 6 | 4× `div.cards-section[data-cat]` | library |
| 7 | `#favoritesSection` (JS) | saved |
| 8 | `section#practice.home-primary-actions` | practice |
| 9 | `details.practice-details[open]` | practice |

The hero (`.welcome-section`) contains:
- `.welcome-copy`, holding `span.eyebrow`, `h2#welcomeTitle`, `p`, and `.welcome-actions`. The actions are `a.primary-link` (required by experience.js) and `button.hero-help[data-info="welcome"]`. Then `span.hero-note`.
- `.hero-art`, an inline lamp SVG plus a `span`.

Practice and cards:
- **`#practice`** holds:
  - `.practice-intro` (eyebrow, `h2#practiceTitle`, `p`)
  - 2× `button.practice-tile` (Japamala first, Track second), each with `span.practice-symbol` (svg), `span.practice-copy` (`span.practice-title` + `small`) and `svg.practice-arrow`
  - `button.info-btn.practice-info[data-info="practice"]`
- **`details.practice-details`**: a `summary` (`span.summary-title` + `svg.summary-chevron`), then `.counter-card` (see the counters in components.css).
- **Card:**
  ```
  a.card.<theme>[href][data-stotram]
    .card-bg
    svg.card-deity-svg[style=color] (missing on 6 cards)
    .card-content
      .card-icon-wrap > span.deity-icon (emoji)
      h3
      .card-sub
      .card-desc
      span.card-action ("చదవండి" + svg arrow)
  ```
  behavior.css positions `.card-bg`, `.card-deity-svg` (120px) and `.card-content`.
- Card section: `.cards-section > .section-divider (h2.section-title + .section-sub) + .cards-grid`.

### Reader: `#readerPage.reader-page`
- `#readerDeityBg.reader-deity-bg` (fixed art; set `opacity` only).
- `#readerTitleSection.reader-title-section`. JS replaces its className with `reader-title-section <theme>-theme`, so use `::before` / `::after` for ornament. It contains `h2#readerTitle` and `p#readerSubtitle`.
- **`section.reader-tool-panel` > `.controls`:**
  - `.font-control` holding `span.font-label#fontControlLabel`, `button.font-btn` "అ−", `span#fontSizeDisplay` and `button.font-btn` "అ+". The larger button must stay the **last** `.font-btn`.
  - `.reader-search` holding `svg.rs-icon`, `input.rs-input#readerSearchInput`, `span.rs-count`, `button.rs-mic#readerMicBtn` (`.listening`), 2× `button.rs-nav` (`[hidden]`, `:disabled`) and `button.rs-clear#readerSearchClear` (inline `display` written by JS).
  - `button.info-btn.reader-tools-info[data-info="reader-tools"]`.
  - Make this panel **sticky** below the header (`top: var(--header-h)`), and set `--reader-tools-h` on `html[data-screen="reader"]` to the panel's height (84px; 142px when it wraps to two rows; 0 where it scrolls away), so html's scroll-padding keeps jump targets and keyboard focus clear of it. On short (max-height 700px) or narrow (under 360px) phones the panel scrolls away, except while search results are being stepped through.
- **`details.reader-options`** has exactly ONE `summary`: `svg.summary-icon` + `span.summary-title` + `small#readerOptionsSummary` + `svg.summary-chevron`. Inside `.reader-options-content` are these `.reader-option-group`s:
  - `.reader-option-meanings > #meaningToggleRow.reader-toggle-row` holding `#meaningToggle.meaning-toggle` (`label` + `.toggle-switch`; `.on` state) and an `.info-btn[data-info="meanings"]`.
  - `nav.reader-navigation` holding `.reader-option-head` (`label[for=verseJump]` + ⓘ jump), then `.reader-jump-row` (`select#verseJump` + `button.btn.resume-btn`), then `#readerSectionNav.reader-section-navigation[hidden]`. JS fills the section nav with `span.reader-section-label` and `button`s.
  - `.reader-library-actions` holding `.reader-option-head` (`span.reader-option-title` + ⓘ save-share), then `.reader-action-row` (`button#favoriteButton.btn.favorite-btn[aria-pressed]`, a copy-link `.btn`, and `button.btn.clear-reading-button`), then `p#readerLinkStatus` and `input#readerLinkFallback[hidden]`.
  - `section.reader-practice` holding a `.counter-card.stotram-counter-card` with an ⓘ parayana inside `.counter-head`.
  - Toggle geometry: `.toggle-switch` is 52×30; its `::after` knob is 24×24. behavior sets knob position, `top: 3px; left: 3px`, and `.on` translate 22px.
- `#slokamContainer.slokam-container`. JS fills it with verse blocks (§4.7).
- `div.reader-report.reader-after-content > button.btn.reader-report-btn` ("report a mistake").
- `details#originDetails.origin-details.reader-after-content` holding a summary (icon + title + chevron) and `#originBlock.origin-block` (`.visible`). It contains `.origin-text`.
- `details#sourceDetails.source-details.reader-after-content` holding a summary (`span#sourceStatusBadge.source-status-badge.<state>` + `span.summary-title` + chevron), then `.source-help` (text + ⓘ source), then `#sourceContent`. JS fills that with `p`, `p.source-review-meta`, `a`, and `section.meaning-review-summary` (`h4`, `p.meaning-coverage`, `p.meaning-review-status.<state>`).

### Overlays

All backdrops are `rgb(8 29 28 / .55)`.

**`#searchOverlay.search-overlay`**
- Container: `.search-box` > `.search-input-wrap`.
- The input wrap holds `svg.search-lead`, `input.search-input#searchInput`, `button.mic-btn#micBtn` and `button.sheet-close.search-close-btn`.
- Below the wrap: `#searchHint.search-hint` (sits on the dark backdrop, so it needs light text) and `#searchResults.search-results`.

**`.sheet-overlay`**
- It shows as flex when `.active`. On phones the sheet anchors to the bottom; at 768px and up it's centred.
- Each holds a `.sheet` > `.sheet-grab` + `.sheet-head` + content. The sheet head is an optional `span.sheet-head-icon`, an `h2`, and `button.sheet-close`. Add `.sheet-sub` for a subtitle line.
- There are four of them:

| Overlay | Sheet class | Content |
|---|---|---|
| `#accountOverlay.account-overlay` | `.account-sheet` | `section.account-signin` (see below); `nav.account-menu` of `button.account-row`s; `details.account-advanced`; `p.account-version` |
| `#updatesOverlay.updates-overlay` | `.updates-sheet` | `.sheet-sub`, `#updatesList.updates-list` |
| `#messagesOverlay.messages-overlay` | `.messages-sheet` | `p#messagesIntro.sheet-sub`, `#messagesList.messages-list`, then a `.btn-primary.btn-block` |
| `#infoOverlay.info-overlay` | `.info-sheet` | `h2#infoTitle`, `#infoBody.info-body`, `p#infoGloss.info-gloss`, `button.info-done` |

- **`section.account-signin`**:
  - `.account-signin-head`: `span.account-signin-icon`, `h3`, and an ⓘ with `data-info="signin"`.
  - `p.account-note`.
  - `#cloudAuthBox.cloud-auth` (starts as `p.cloud-loading`; see §4.10).
  - `#adminLinkBox`.
- **`button.account-row`** holds `span.account-row-icon` (`.account-row-icon-muted` is the grey variant), `span.account-row-copy` (`b` + `small`), an optional `span.account-row-badge#messagesBadge[hidden]`, and `svg.account-row-chev`.
- **`details.account-advanced`**:
  - Its `summary` is laid out like an account row, with a chevron.
  - `.account-advanced-body` holds `.btn-row` (2× `.track-btn`), `input#restoreFile[hidden]` and `p.account-note`.

**`#feedbackOverlay.feedback-overlay`** holds `.feedback-box`, which holds `#fbForm` and `#fbThanks`. JS switches between them with inline `display`.
- **`#fbForm`**, from top to bottom:
  - `.fb-head` (sheet-head-icon, `h2#fbTitle`, `.sheet-close`) and `p.fb-sub`.
  - `fieldset.fb-types` containing `legend.fb-label`, then `.fb-type-chips` holding 4× `button.fb-type-chip[data-fb-type][role=radio][aria-checked]` (each an svg + span), then `select#fbType.visually-hidden`.
  - Fields: `label.fb-label` + `.fb-field` (`input.fb-input` + `button.mic-mini`), three times. The message field is `.fb-field.area` with a `textarea.fb-textarea`.
  - `#fbError.fb-error`, then `input#fbWebsite` (the honeypot, hidden by behavior), then `button.fb-submit.btn-primary.btn-block`, then `p.fb-privacy` (svg + span).
- **`#fbThanks.fb-thanks`**: `.fb-thanks-mark` (svg check), `h3`, `p` and a `button.btn.btn-primary` "సరే" that calls `closeFeedback()`.

**`#daySheetOverlay.day-sheet-overlay`** holds `.day-sheet` > `.sheet-handle`, `.day-sheet-head` (`#sheetDate.sheet-date` + `.sheet-close`) and `#sheetBody` (see §4.9).

### Track: `#trackPage.track-page`
- `.track-section-head`: eyebrow, `h2#trackTitle`, `p`.
- `#reminderBanner.reminder-banner` (`.show`; see §4.11).
- `section.track-card.track-calendar`:
  - `.track-card-head` (`h3.track-card-title` + ⓘ calendar)
  - `.month-nav` (`button.month-arrow#prevMonthBtn`, `#monthLabel.month-label`, `button.month-arrow#nextMonthBtn`)
  - `#monthStrip.month-strip`
  - `p.track-hint`
- `section.track-card.track-mokkulu`:
  - `.track-card-head` (with ⓘ mokku)
  - `.mokku-form`, containing `input.mokku-input#mokkuText` and a `.mokku-row2`. The row holds `label.mokku-date-label` (`span` + `input.mokku-date#mokkuDate`) and `button.mokku-add-btn.btn.btn-primary`.
  - `#mokkuList.mokku-list`
- `p.track-privacy#trackPrivacy` (svg + span).

### Japamala: `#japamalaPage.japamala-page`
The whole page has `onclick=bumpJapa`.
- `.jm-head` (`h2.jm-title#jmTitle` + ⓘ japamala).
- `.jm-modes` containing 4× `button.jm-mode-btn[data-mode]` (`.active`).
- `.jm-count-top` (`#jmCount` + `span.jm-of`) and `#jmRounds.jm-rounds`.
- 4× `.jm-stage`:
  - **Never** set `display` / `animation` / `transform` on these. JS writes inline `display`.
  - The 3D stage `#jmStageRudraksha3d.jm-stage-rudraksha3d` holds `.jm-rudraksha-aura`, `canvas.jm-rudraksha-canvas`, `.jm-rudraksha-fallback[hidden]` and `.jm-rudraksha-hint`.
- `.jm-controls`: `button.jm-btn-reset` (svg), `button.jm-btn-count` (`span.jm-btn-count-label` "జపం" + `small`) and `span.jm-controls-spacer`.
- `p.jm-hint`.

### Floating and footer
- `button#scrollTopBtn.scroll-top-btn` (`.visible`; svg).
- `footer.footer` holding `button.footer-feedback` (svg + text) and `p.footer-mantra`.
- `#cloudToast.cloud-toast` (created by JS, `.show`).
- `.sc-overlay` > `.sc-box[role=dialog]` holding `.sc-msg` and `.sc-actions`. The actions are `button.sc-btn[data-no]` and `button.sc-btn.(primary|danger)[data-yes]`; JS-1 also adds `btn btn-quiet` / `btn btn-primary` / `btn btn-danger` to them.

### The ⓘ button (everywhere)
```html
<button type="button" class="info-btn" data-info="KEY" aria-label="వివరణ: …"><svg class="icon-inline" aria-hidden="true"><use href="/icons.svg#icon-info"/></svg></button>
```
Never put one inside a `<summary>`, inside `#meaningToggle`, or inside containers that JS empties.

### State hooks
- Classes:
  - `.active` on pages, overlays and `.jm-mode-btn`
  - `.show` on `.sc-overlay`, `.cloud-toast` and `.reminder-banner`
  - `.visible` on `.scroll-top-btn` and `.origin-block`
  - `.on` on `.meaning-toggle`
  - `body.show-meanings`
  - `.slokam-block.read`
  - `.listening` on mic buttons
  - `mark` / `mark.current`
  - `.cur`, `.pop`, `.celebrate` and `.jm-confetti` in Japamala
  - `.invalid` on form fields
  - `.done` on `.mokku-item` and `.count-target`
  - `.due` on `.mokku-badge`
  - `.cal-day.today|.future|.has-data|.empty`
  - `.has-unread` on `#updatesBtn` and `.hdr-account`
- Attributes: `[aria-pressed]`, `[aria-current]`, `[aria-checked]`, `[hidden]`, `html[data-screen="home|reader|track|japamala"]` (set by JS-1), `#homePage[data-view]`, `[data-panel]`, `.source-status-badge.<verified|partial|review|pending|override>`, `.meaning-review-status.<verified|partial|reference|pending>`, `.status-pill[data-status]`.

## 4. JS-generated markup (the JS agent must emit exactly this; CSS agents style exactly this)

`ICON(x)` means `<svg class="icon-inline" aria-hidden="true"><use href="/icons.svg#icon-x"/></svg>`.

1. **Today** (weekday.js, JS-1):
   ```html
   <div id="todaySection" class="today-section">
     <div class="today-head">
       <span class="today-icon" aria-hidden="true">ICON(sun)</span>
       <h2 class="today-day">ఈ రోజు — సోమవారం</h2>
       <span class="today-note">శివ ఆరాధన</span>
       <button class="info-btn" data-info="today" …>
     </div>
     <p class="weekday-guidance">…</p>
     <div class="today-strip">
       <button type="button" class="today-tile" onclick="openReader('KEY')"><span class="today-ico medallion THEME" aria-hidden="true">EMOJI</span><span class="today-title">TITLE</span>ICON(chevron-right)</button>
       …
     </div>
   </div>
   ```
   - THEME is the stotram's `cfg.theme`, e.g. `shiva-theme`, which gives the medallion its deity tint.
   - `.today-strip` is a **wrapping grid, not a horizontal scroller**.
2. **Recent** (reader-navigation.js, JS-1):
   ```html
   <section id="recentReadingSection" class="recent-reading-section" aria-labelledby="recentReadingTitle">
     <div class="section-head"><h2 id="recentReadingTitle">ఇటీవల చదివినవి</h2><button class="info-btn" data-info="recent" …></div>
     <div class="recent-reading-list">
       <button type="button" onclick="openRecentReading('KEY', N)"><span class="recent-title">TITLE</span><small>శ్లోకం n / T నుండి కొనసాగించండి</small><span class="recent-progress" style="--p:0.42" aria-hidden="true"></span></button>
       …
     </div>
   </section>
   ```
3. **Library nav** (reader-navigation.js, JS-1):
   ```html
   <nav id="library" class="library-navigation" aria-label="…">
     <div class="library-intro">
       <span class="eyebrow">పవిత్ర సంకలనం</span>
       <div class="section-head"><h2>స్తోత్రాల గ్రంథాలయం</h2><button class="info-btn" data-info="categories" …></div>
       <p>…</p>
     </div>
     <div class="category-filters">
       <button type="button" data-category="all" aria-pressed="true">అన్నీ <span class="filter-count">30</span></button>
       …
     </div>
   </nav>
   ```
   Filters wrap; no horizontal scroll.
4. **Favourites** (library.js, JS-1):
   - The section is `<section id="favoritesSection" class="favorites-section" aria-labelledby="favoritesTitle">`. Its first child is `<div class="section-head"><h2 id="favoritesTitle">మీకు ఇష్టమైన స్తోత్రాలు</h2>ⓘ(data-info="favorites")</div>`.
   - **Second child, when there are favourites:** `<div class="today-strip favorites-grid">` containing `<a class="today-tile" href="?stotram=KEY"><span class="today-ico medallion THEME">EMOJI</span><span class="today-title">TITLE</span>ICON(chevron-right)</a>…`.
   - **Second child, when empty:**
     ```html
     <div class="empty-state favorites-empty">
       <span class="empty-state-mark">ICON(star)</span>
       <h3>ఇంకా ఇష్టమైనవి లేవు</h3>
       <p>ఏ స్తోత్రం తెరిచినా "ఇష్టమైనవాటిలో చేర్చు" నొక్కండి — అది ఇక్కడ కనిపిస్తుంది.</p>
       <a class="btn btn-primary" href="#library" onclick="event.preventDefault(); navigateView('library')">స్తోత్రాలు చూడండి</a>
     </div>
     ```
   - `tools/verify-library.cjs` must still pass. It reads `favoritesSection.children[1].children[0]` as the first favourite link, and its sandbox elements lack `append`, `classList` and `querySelector`. Read the test before changing how the section is built.
5. **`#favoriteButton` text** (library.js): `ఇష్టమైనవాటిలో చేర్చు` when not pressed, `ఇష్టమైనవాటిలో ఉంది` when pressed. There's no ☆/★ glyph; CSS draws the star from `[aria-pressed]`.
6. **Search results** (app.js, JS-1): `<button type="button" class="search-result" onclick="pickSearch('KEY')"><span class="sr-icon medallion THEME" aria-hidden="true">EMOJI</span><span class="sr-text"><span class="sr-title">TITLE</span><span class="sr-sub">SUB</span></span>ICON(chevron-right)</button>`, with the title and subtitle escaped. When nothing matches: `<div class="search-empty">ICON(search)<span>ఏమీ దొరకలేదు. వేరే పేరు ప్రయత్నించండి.</span></div>`. The `#searchHint` strings have no emoji.
7. **Verses** (reader.js, JS-1): the same shape as today, but with **no inline font-size** anywhere (CSS uses `--reader-font-size`).
   ```html
   <div class="slokam-block (read)" id="verse-N" data-idx tabindex="-1">
     <span class="slokam-number">ధ్యానం</span>   <!-- optional heading label -->
     <div class="reader-verse-row"><div class="slokam-text">…</div><span class="reader-verse-number">N</span></div> <!-- 1..n rows -->
     <div class="slokam-meaning"><span class="meaning-label">అర్థం</span>…</div>
     <button type="button" class="verse-read-button" aria-pressed="false|true">చదివినట్లు గుర్తించు | చదివాను</button> <!-- no ✓ glyph; CSS draws the icon -->
   </div>
   ```
   The empty state is `div.reader-empty-state`.
8. **Origin** (app.js): `#originBlock.innerHTML = '<div class="origin-text">…</div>'`, without the repeated label. `#originDetails.hidden = !originText`.
9. **Day sheet** (tracking.js, JS-2):
   - **Pradakshina counter:**
     ```html
     <div class="counter-card">
       <div class="counter-head"><span class="counter-name">ప్రదక్షిణలు</span><div class="counter-actions"><button class="counter-reset" onclick="resetDayPradakshina()" aria-label="…">ICON(reset)</button></div></div>
       <div class="counter-row"><button class="count-btn" onclick="bumpPradakshina(-1)">ICON(minus)</button><div class="count-center"><div class="count-display">N</div><div class="count-target">ప్రదక్షిణలు</div></div><button class="count-btn count-btn-plus" onclick="bumpPradakshina(1)">ICON(add)</button></div>
     </div>
     ```
   - **Section title:** `<h3 class="day-section-title">పారాయణం / జపం ⓘ(data-info="day-japa")</h3>`.
   - **Each japa row:**
     - `.counter-card` > `.counter-head`, holding `span.counter-name` (escaped name) and `.counter-actions`. The actions are `button.counter-reset` → `resetJapa(i)` and `button.counter-del` → `removeJapa(i)` (ICON(delete)).
     - Then `.counter-row`: `button.count-btn` → `bumpDayJapa(i,-1)`, then `.count-center` (the display plus `button.count-target(.done)` → `editTarget(i)`, reading "లక్ష్యం: N (మార్చు)" or "పూర్తయింది · లక్ష్యం N"), then `button.count-btn.count-btn-plus` → `bumpDayJapa(i,1)`.
   - **Add chips:** `<div class="chip-row"><button type="button" class="add-chip" …>ICON(add)TITLE</button>… <button class="add-chip" onclick="addJapaCustom()">ICON(add)వేరే…</button></div>`.
   - **Empty:** `<p class="track-empty">…</p>`.
   - All buttons get `type="button"` and Telugu aria-labels.
10. **Cloud auth box** (cloud.js, JS-3):
    - Signed out: `<button type="button" class="btn btn-google" onclick="stotramSignIn()"><svg class="icon-inline" aria-hidden="true"><use href="/icons.svg#icon-google"/></svg>Google తో సైన్ ఇన్ చేయండి</button>`.
    - Signed in: `<div class="cloud-signed"><span class="cloud-avatar" aria-hidden="true">INITIAL</span><span class="cloud-who"><b>NAME</b><small>మీ లెక్కలు అన్ని ఫోన్‌లలో భద్రంగా ఉన్నాయి</small></span></div><button type="button" class="btn btn-quiet btn-sm cloud-signout" onclick="stotramSignOut()">సైన్ అవుట్</button>`.
    - Toast text has no emoji.
    - Admin link (admin.js): `<a class="btn btn-quiet btn-block admin-dash-link" href="/admin.html">ICON(sliders)నిర్వాహక డాష్‌బోర్డ్</a>`.
11. **Reminder banner** (app.js, JS-1): `<span class="rb-icon" aria-hidden="true">ICON(bell)</span><span class="rb-text">ఈరోజు జ్ఞాపిక: <b>…</b> (+N మరిన్ని)</span><button type="button" class="rb-close" aria-label="మూసివేయి" onclick="this.parentElement.classList.remove('show')">ICON(close)</button>`.
12. **Calendar** (tracking.js, JS-2):
    - Each month card is `div.month-card > div.cal-grid` holding 7× `span.cal-weekday` (each with `span.wk-long` and `span.wk-short`; the short form shows under 360px), then spacer cells `span.cal-day.empty[aria-hidden]`.
    - Each day cell is `button.cal-day(.today|.has-data)[type=button]`, with `onclick="openDay('YYYY-MM-DD')"`, an aria-label that includes the date and whether it has data, `span.cal-num` and `span.dot` (only when it has data).
    - Future days are `button.cal-day.future[disabled]`.
    - The month geometry rules in behavior.css must keep working.
13. **Mokku item** (tracking.js, JS-2):
    ```html
    <div class="mokku-item (done)">
      <button type="button" class="mokku-check" aria-pressed="…" aria-label="తీర్చుకున్నాను" onclick="toggleMokku('id')">ICON(check)</button>
      <div class="mokku-body">
        <div class="mokku-text">…</div>
        <div class="mokku-meta"><span class="mokku-badge (due)">ICON(bell) date • ఈరోజు!</span></div>  <!-- only when a reminder is set -->
      </div>
      <button type="button" class="mokku-del" aria-label="మొక్కు తొలగించు" onclick="deleteMokku('id')">ICON(delete)</button>  <!-- deleteMokku now asks siteConfirm -->
    </div>
    ```
    Empty: `<p class="track-empty">…</p>`.
14. **What's new list** (updates.js, JS-3): `<article class="update-item"><div class="update-meta"><span class="tag tag-new|tag-improved|tag-fixed">ICON(sparkle|chevron-up|check)కొత్తది|మెరుగుదల|సరిచేశాం</span><time datetime="…">28 సెప్టెంబర్ 2026</time></div><h3 class="update-title">…</h3><p class="update-body">…</p></article>`.
    - **Teaser** (inside `#updatesTeaser`, shown only while an update is unseen): `<button type="button" class="updates-teaser-card" onclick="openUpdates()"><span class="medallion">ICON(sparkle)</span><span class="updates-teaser-copy"><span class="tag tag-new">కొత్తది</span><b>TITLE</b><small>BODY</small></span>ICON(chevron-right)</button>`.
15. **My messages** (messages.js, JS-3):
    ```html
    <article class="message-item">
      <div class="message-top">
        <span class="message-type">ICON(book|warning|sparkle|message) TYPE</span>
        <span class="status-pill" data-status="new|in_progress|answered|closed|queued|sent">ICON(...) LABEL</span>
      </div>
      <p class="message-text">…</p>
      <div class="message-meta">ICON(clock)<span>3 రోజుల క్రితం · శ్రీ లింగాష్టకం</span></div>
      <div class="message-reply"><b>స్తోత్రములు బృందం</b><p>…</p><small>DATE</small></div>  <!-- only when answered -->
    </article>
    ```
    - Empty list: `div.empty-state` (ICON(message), "ఇంకా సందేశాలు లేవు", text).
16. **Info sheet** (help.js, JS-3): fills `#infoTitle`, `#infoBody` (one or more `<p>`) and `#infoGloss`.

## 5. JS API contract (globals)

**Existing, keep:**
- Every inline handler named in index.html.
- `openReader`, `goHome`, `siteConfirm`, `siteAlert`, `escapeHtml`, `gaEvent`, `flushFeedback`, `openAccount`, `closeAccountOverlay`, `openTrack`, `openJapamala`, `setJmMode`, `bumpJapa` (japamala.js). Also `toggleMeanings`, `changeFontSize`, `jumpToVerse`, `resumeReading`, `toggleFavorite`, `copyReaderLink`, `resetReading`, and the rest.

**Changed:**

| Function | Change | Owner |
|---|---|---|
| `openFeedback(type?)` | if `type` is given, set `#fbType.value = type`, then `window.syncFeedbackChips?.()` | app.js |
| `submitFeedback` | after queueing, calls `window.recordSentMessage?.(payload)` | app.js |
| `bumpDayJapa(i, delta)` | the renamed day-sheet japa function (was tracking.js `bumpJapa(i,d)`, which clashed) | tracking.js |
| `sitePrompt(message, {value, okLabel, inputmode})` | new; returns `Promise<string\|null>`; replaces native `prompt()` in `addJapaCustom` / `editTarget`; reuse the `.sc-*` dialog markup with an added `input.field-input` | tracking.js |

**New:**

| Function / value | Owner | Notes |
|---|---|---|
| `navigateView(view)` | experience.js | `view` ∈ home, library, saved, practice |
| `document.documentElement.dataset.screen` | experience.js, MutationObserver | "home", "reader", "track" or "japamala"; watches the `.active` classes on pages, and `#homePage` style display |
| `aria-current` sync | experience.js | while the reader is open, the "library" tab gets aria-current; for track or japamala, the "practice" tab |
| `showInfo(key, trigger?)` / `closeInfo()` | help.js | plus a capture-phase document click listener on `[data-info]` that does preventDefault + stopPropagation |
| `openUpdates()` / `closeUpdates()` | updates.js | |
| `openMessages()` / `closeMessages()` / `recordSentMessage(payload)` / `syncFeedbackChips()` | messages.js | |
| `window.StotramCloud = { firebase, auth, db, get user() }` | cloud.js | also `document.dispatchEvent(new CustomEvent('cloud-ready'))` once, and `'cloud-auth'` (`detail: user or null`) on every auth change |

All new sheets:
- Save and restore the previous `document.body.style.overflow` (lock while open).
- Move focus into the sheet on open and back to the trigger on close.
- Close on backdrop click; the inline onclick on the overlay calls `close*()`.
- Close on Escape, top sheet only: a capture-phase keydown listener calls `stopImmediatePropagation` when it handles the key.
- app.js's Escape handler also calls `closeUpdates` / `closeMessages` / `closeInfo`, guarded by `typeof`.

**localStorage keys:**
- Existing: `readerFontSize`, `showMeanings`, `stotramFavorites`, `stotramReaderPositions`, `stotramLibraryCategory`, `poojaTrack_v1`, `jm_mode_v2`, `feedbackQueue_v1`.
- New: `stotramUpdatesSeen` (newest seen `YYYY-MM-DD`), `stotramMyMessages` (JSON array of `{fbid, type, message, stotramTitle, at}`, newest first, capped at 30), `stotramMessagesSeenAt` (ISO date).

**Firestore:**

| Collection | Shape | Access |
|---|---|---|
| `updates/{id}` | `{date:'YYYY-MM-DD', tag, title, body, published:boolean, updatedAt}` | public read; admin write |
| `feedback/{fbid}` | as today, plus optional `status` (new, in_progress, answered, closed), `reply` (string) and `repliedAt` (Timestamp) | a user reads their own with `where('uid','==',uid)` and **no** orderBy (sort in the browser); status falls back to `status ?? (handled ? 'closed' : 'new')` |

## 6. HELP keys (help.js dictionary ⇄ every `data-info` in HTML and JS, exact match)

The keys are: `welcome`, `today`, `recent`, `categories`, `favorites`, `practice`, `pradakshina`, `reader-tools`, `meanings`, `jump`, `save-share`, `parayana`, `source`, `signin`, `calendar`, `mokku`, `day-japa`, `japamala`.

Each entry is `{ title, body (Telugu, 1–3 short sentences; an array of paragraphs is allowed), gloss (one short English line) }`. Copy starting points are in `docs/redesign-research/htmlMap.md` §12.2. Four keys have no starting point there:
- `welcome`: how to use the site. The 4 menu buttons (ముఖపుట, స్తోత్రాలు, ఇష్టమైనవి, నా సాధన), search, and "tap ⓘ anywhere".
- `practice`: Japamala and Pooja Track, in brief.
- `reader-tools`: text size ± (remembered) and in-text search with ↑↓.
- `day-japa`: add a japa for that day, and tap "లక్ష్యం" to set a target.

## 7. Visual specification per area (from the preview; exact values are guidance, tokens are law)

**Shell (CSS-1, layout.css):**
- **Header:**
  - Solid `var(--ivory)`, 1px line bottom, height `--header-h`.
  - `.header-content` is a flex row, `max-width: var(--content-max)`, `margin: auto`, `padding: 0 var(--gutter)`, gap 8.
  - Brand: `.header-om` is a 40px peacock-gradient circle with zari-300 serif text. The h1 is serif, 18px on phones and 21px on desktop, peacock-900, and ellipses at one line. Hide `.header-sub` below 1024px.
  - Buttons:
    - Phones: `.hdr-btn` are 44px round icon buttons with `.hdr-label` hidden.
    - 1024px and up: the same, still icon-only.
    - 1280px and up: pill buttons with the label.
    - `.hdr-updates { order: -1 }`.
    - `.hdr-dot` is a 9px kumkum dot with a 2px ivory ring at the icon's top-right.
  - When `html[data-screen]` isn't "home", show `#backBtn` (a pill with chevron and label, peacock-800). Below 600px, also hide `.header-titles`.
  - Desktop (1024px and up): `.header-content` becomes `display: contents` and `.header` a single grid row: `back | titles | nav (centre) | utilities`, padded to the content width.
- **Tab bar (below 1024px):**
  - `.site-navigation` is `position: fixed` at the bottom, `z-index: var(--z-tabbar)`, height `calc(var(--tabbar-h) + var(--safe-bottom))`, `padding-bottom: var(--safe-bottom)`.
  - Paper background, 1px line top, a soft upward shadow, a 4-column grid.
  - Links: icon over label (14px), `small` hidden. A 58×32 pill sits behind the icon (`a::before`); it's zari-100 when `[aria-current]`. The current label is peacock-900 at 650 weight; the rest are ink-3. Pressing scales it.
  - Body gets `padding-bottom: calc(var(--tabbar-h) + var(--safe-bottom))`.
  - Hide the bar, and remove the padding, when `html[data-screen="japamala"]` or `@media (max-height: 520px)`.
- **Tabs on desktop:** inline flex items, full header height, an icon of 20px and a 16px label with `small` hidden, and a zari-500 3px underline on `[aria-current]`.
- **Pages:**
  - `#homePage`, `.track-page`, `.japamala-page`, `.reader-page`: `width: 100%`, centred with `margin-inline: auto`, and `padding: var(--sp-5) max(var(--gutter), var(--safe-left)) var(--sp-8)`.
  - Max widths: home `--content-max`; reader `calc(var(--reader-max) + 2*var(--gutter))`; track 760px; japamala 600px.
  - `#homePage { gap: var(--sp-6) }`.
- **Footer:** centred, a line on top, `button.footer-feedback` as a quiet pill, the mantra in serif 15px zari-700.
- **Scroll-top:** a 48px paper circle with a shadow.
- **Skip link:** peacock pill.

**Overlays (CSS-1, overlays.css):**
- Backdrops as in §3.
- **Sheets:**
  - `max-width: 560px`, `width: 100%`, radius 26/26/0/0 on phones and 24 all round at 768px and up.
  - `padding: 10px 18px calc(24px + var(--safe-bottom))`, `max-height: 92dvh`, `overflow-y: auto`.
  - Entrance `sheet-up`: translateY(28px) to 0, with opacity, over `--dur-3`.
  - The grab handle hides at 768px and up. The sheet head is a flex row; `.sheet-close` is a 44px sand circle.
- **Search:** see §3. The input row is an 18px-radius paper field with a `:focus-within` ring. Results are paper rows, 64px or taller, with a medallion, a serif title and a muted subtitle. The hint text sits on the dark backdrop in ivory.
- **Account hub:**
  - `.account-signin` is a peacock-50 card.
  - Account rows are 64px or taller, with a 42px rounded icon tile, a 16.5px/650 label and a 14px muted line.
  - The badge is a kumkum pill.
  - `details.account-advanced` summary rotates its chevron when open.
- **Updates:** see §4.14. Messages: see §4.15. Reply bubble: peacock-50 with a 3px peacock-600 left bar.
- **Info sheet:** body 17.5px at line-height 1.8; gloss 15px ink-3.
- **Feedback:**
  - A centred card, max 560px wide.
  - `.fb-type-chips` is a 2-column grid of 56px chips. The checked chip is peacock-800 with white text.
  - `.fb-field` is relative. `.mic-mini` is a 44px circle inside the right edge of the input; the input gets `padding-right: 56px`.
  - Thank-you: a 72px leaf circle with a check.
- **Day-sheet container:** paper, `max-width: 640px`, a top-rounded sheet with the sheet-up entrance.
- **Confirm dialog:** `.sc-box` paper, radius 22, lg shadow, a 150ms pop-in; `.sc-msg` 17px; actions right-aligned; `.sc-btn` looks like `.btn`.
- **Toast:** a peacock-900 pill with white 15px/600 text.

**Home and library (CSS-2):**
- **Hero:**
  - Peacock gradient: `radial-gradient(120% 90% at 92% 8%, rgb(226 198 124/.22), transparent 55%), linear-gradient(150deg, var(--peacock-900), var(--peacock-700))`.
  - Radius 26, shadow, `overflow: hidden`, `position: relative`.
  - A zari **temple-border strip** along the bottom edge: `::after`, 12px of repeating gold triangles.
  - Text: eyebrow zari-300; h2 serif `--fs-display` in ivory; `p` in `#d5e5df`.
  - `a.primary-link` looks like `.btn-gold`, 50px tall. `.hero-help` is a light outline pill.
  - The lamp art sits on the right on desktop (a 1.2fr / 1fr grid). On phones it's absolutely positioned at the top-right, about 130px wide, `pointer-events: none`, behind the copy.
- **Recent / Today / Favourites:** surface cards, padding 18.
  - Section heads are serif 20px with an ⓘ.
  - Tiles: a 1-column grid on phones and 3 columns from 600px. Each is 60px or taller, ivory, bordered, with a medallion, a 16.5px/650 title and a chevron.
  - The recent progress bar is 4px, filled `calc(var(--p) * 100%)` in peacock-600.
- **Updates teaser:** `order: 1`, a zari-100 to paper gradient, a medallion.
- **Library:**
  - Intro: eyebrow, h2 serif 28 with an ⓘ, a muted `p`.
  - Filter chips: 46px pills that wrap. The count badge is 14px/700. `[aria-pressed="true"]` is peacock-800 with white text and a zari-300 count. Write the selector `.category-filters button[aria-pressed="true"]` exactly like that; a test greps for it.
- **Section headings:** `.section-title` serif 21; `.section-sub` 14px ink-3.
- **Cards:**
  - `.cards-grid` is 1 column on phones, 2 from 600px, 3 from 1024px, gap 14.
  - `.card`: paper, radius 20, 1px line, sm shadow, no underline.
  - The deity wash is `.card-bg { background: linear-gradient(135deg, var(--deity-soft), transparent 55%) }`.
  - `.card-deity-svg` is a watermark: `right: -16px; bottom: -16px; opacity: .08`.
  - `.card-content` is a grid `52px 1fr`: `.card-icon-wrap` is a 52px medallion spanning the h3 and sub rows; `.card-desc` and `.card-action` span full width. The desc is 2-line clamped. The action has a dashed top line, peacock-700 text and an arrow that nudges on hover.
  - Hover lifts it `translateY(-2px)` with a stronger shadow; `:active` scales .99.
  - Staggered `card-in`: opacity, translateY 10px to 0, `--dur-4`, delays of 40ms per `nth-child` up to 12.
- **Saved empty state:** `.empty-state` inside the favourites card.

**Reader (CSS-3):**
- **Title:**
  - Centred, with a zari ornament via `::before`: an SVG data-URI of a lotus or diamond with lines.
  - The h2 is serif `clamp(24px, 6vw, 34px)` in peacock-900; the subtitle is 14.5px ink-3.
  - A thin `--deity` accent underline via `::after`.
- **Tool panel:** sticky (see §3).
  - `.controls` is a paper bar: radius 18, 1px line, sm shadow, padding 8, a flex row with gap 8.
  - The font group is a sand pill holding 44px `.font-btn`s. Hide `.font-label` below 400px.
  - The search field is a sand pill that becomes white with a ring on `:focus-within`.
- **Options:**
  - A surface details block with a 56px summary and rotating chevron. Groups are separated by a 1px line.
  - The toggle switch is line-2, and peacock-700 when `.on`, with a white knob.
  - `#favoriteButton[aria-pressed="true"]` is zari-100 with a zari-300 border and zari-800 text. Its star comes from `::before` with a CSS mask (a data-URI SVG): outline when off, filled when on.
- **Verses:**
  - `.slokam-container` is a grid, gap 14.
  - `.slokam-block`: `--paper-leaf`, a 1px `#ebe3cf` border, radius 20, padding 22/18/16 (30/34/22 on desktop), centred, xs shadow.
  - `.slokam-text`: serif 500, line-height 1.95, reading-ink.
  - `.reader-verse-number`: a small zari-700 numeral at the row end.
  - `.slokam-number`: a 14.5px/600 zari-700 label.
  - `.slokam-meaning`: a dashed top line, `font-size: max(15px, calc(var(--reader-font-size) * .68))`, line-height 1.75, ink-2, left-aligned. `.meaning-label` is 14px/700 zari-700.
  - `.verse-read-button`: a 44px pill with an outline-circle icon. When `[aria-pressed="true"]` it's peacock-800 with white text and a check icon.
  - `.slokam-block.read`: a peacock-50 background, a peacock-200 border, and a 4px peacock-600 left bar (`::before`).
  - Search marks: `mark` zari-200; `mark.current` peacock-800 with white text and a zari ring.
- **After content:** surface details blocks; badges `.source-status-badge.*` and `.meaning-review-status.*` as 14px pills (verified leaf, partial zari, review kumkum, pending sand, override or reference peacock). The report button is centred.
- **Print:** handled in behavior.css. Add only typography niceties if needed.

**Practice and Japamala (CSS-4):**
- **`#practice`:**
  - A grid: the intro at the top, with `.practice-info` placed at the intro row's right edge through grid areas.
  - Tiles are 84px or taller paper cards, radius 20, with a 56px medallion icon, an 18px/650 title, a 14.5px muted `small`, and a chevron. They're 1 column on phones and 2 from 600px.
- **`details.practice-details`:** a surface with a serif 19px summary and rotating chevron; the counter-card inside has no border or shadow.
- **Track:**
  - Head: eyebrow, h2 serif 28, muted `p`.
  - Banner: `.show`, zari-100, flex row with a 40px close.
  - `.track-card` surfaces, padding 16, with `.track-card-head` flex rows.
  - `.month-arrow` is a 44px sand circle; `.month-label` serif 19. Card padding and borders must never change the month-strip geometry.
  - `.cal-grid` gap 6.
  - `.cal-weekday` 14px/600 ink-3.
  - `.cal-day`: `aspect-ratio: 1`, at least 44px, radius 12, paper with a line border, 16px/600.
    - `.today`: 2px peacock-700 border on peacock-50.
    - `.has-data`: zari-100 with a zari-200 border.
    - `.dot`: a 6px peacock-600 dot, centred at the bottom.
    - `.future`: opacity .35.
    - `.empty`: invisible.
  - The mokku form is a grid; `.mokku-row2` stacks below 420px.
  - `.mokku-item` is an ivory row with a 40px check circle (peacock-700 when done), a line-through when done, the `.due` badge in kumkum-100/kumkum-800, and a 40px delete button.
  - Day-sheet content: `.day-section-title` serif 18 with an ⓘ; `.chip-row`.
- **Japamala:**
  - `.jm-head`: centred, serif 26 plus the ⓘ.
  - `.jm-modes`: a segmented control. Sand track, padding 4, radius 16. `.jm-mode-btn` is flex:1, 44px tall; `.active` is paper with an sm shadow and peacock-900 text.
  - Count: `#jmCount` serif 64px peacock-900 tabular; `.jm-of` 22px ink-3.
  - `.jm-stage` visuals only (background, border, radius, margin): a radial ivory-to-sand background, radius 26. **No display, animation, transform or transition.**
  - `.jm-controls`: a 3-column grid (`1fr auto 1fr`).
    - `.jm-btn-reset` is a 52px paper circle.
    - `.jm-btn-count` is 104px: a radial peacock-600 to peacock-900 gradient, a zari ring (`box-shadow: 0 0 0 5px var(--zari-100), 0 0 0 7px var(--zari-500), 0 14px 26px rgb(8 45 44/.3)`), a white 19px/700 label, and a 14px zari-200 `small`. It scales .94 on `:active`.
  - `japamala-3d.css`: restyle its colours to tokens (paper or ivory stage, zari thread, ink-3 hint, a paper fallback). Keep every rule the research lists as rendering-critical: sizes, aspect-ratio, positions, `[hidden]`, the celebrate keyframes and touch-action.

## 8. Tests the agents must keep green

- `node tools/verify.cjs`. Tools updates it for the new CSS paths; it also runs verify-reader-smoke, verify-worker, verify-japamala, verify-reader-theme and verify-meanings.
- `node tools/verify-library.cjs` and `node tools/verify-reader-navigation.cjs`.
- The e2e locators are listed in `docs/redesign-research/constraints.md` §5. In short:
  - exactly one of each `[data-home-target]`
  - `.header-utilities button` first is Search, second is Account
  - `#practice button` first is Japamala, second is Track
  - one `.reader-options summary`
  - the last `.font-btn` is the larger one
  - 4× `.jm-mode-btn` with data-mode in order
  - one `.jm-btn-count` and one `.jm-btn-reset`
  - one `.footer-feedback`
  - no sideways overflow at 320, 390 or 768px, including absolutely positioned elements
