# Stotramulu `index.html`: component map, JS hooks and redesign inputs

Everything below comes from reading the files. Nothing was edited. Line numbers point to `/Users/LA40057633/Project/l/stotramulu/index.html` unless another file is named. Several home sections don't exist in the HTML file at all. JavaScript builds them when the page loads, so they're listed in the order they end up on the page.

---

## 0. Things that will break if missed (read first)

1. **The test scripts (`npm run verify`) read the CSS files by name.**
   - `tools/verify-reader-theme.cjs:7-8` opens `styles/reading.css` and `styles/design-system.css`. It also requires the literal `.category-filters button[aria-pressed="true"]` and `.home-page input[type="date"] {…color-scheme: light;}`.
   - `tools/verify.cjs:73-76` requires `styles/reading.css` to load before `styles/design-system.css`, and requires `--ui-gold-bright:` and `@media (prefers-reduced-motion: reduce)` in design-system.css.
   - Deleting or renaming those files fails `npm run verify` until the scripts are updated.
2. **Other markup rules enforced by the tests:**
   - Exactly 30 `<a …data-stotram="…">` in the HTML with comments stripped (`verify.cjs:78`). No `<div class="card…">` (`:79`). No `card-btn` (`:77`), no `headerActions` (`:89`).
   - `<body class="grandham">` must appear literally (`verify-reader-theme.cjs:10`).
   - `readerSectionNav` and `sourceStatusBadge` must appear (`verify.cjs:60-61`).
   - The literal sequence `class="jm-mode-btn" data-mode="…"` must appear in the order flow, strand, full, rudraksha3d (`verify-japamala.cjs:5-6`). Adding a class to those buttons breaks the regex.
   - `jmStageStrand`, `jmStageFull` and `jmStageFlow` must exist.
   - Script order: `reader.js` and `tracking.js` before `app.js`, and `japamala-3d.js` before `japamala.js`.
   - `#homePage` must accept an inline `style.display='flex'` (`verify-reader-smoke.cjs:81`).
3. **`experience.js:47` calls `document.querySelector('.primary-link').addEventListener`.** If no `.primary-link` exists, it throws and stops before `render()` (`:61`) and before the skip-link handler (`:62`). The Home / Library / Saved / Practice switching would then never work.
4. **`reader-navigation.js` also needs certain elements to exist:**
   - `.home-primary-actions`, `.practice-details` and `.welcome-section` inside `#homePage` (`:308`, `:356`, `:167`).
   - If `.practice-details` is missing, `home.append(actions, null)` adds a text node reading "null".
5. **`experience.js:11-15` (`organize()`) overwrites `data-panel` on every direct child of `#homePage`**, based only on class. Hand-written `data-panel` values are lost.
   - `.cards-section` or `.library-navigation` → library
   - `.favorites-section` → saved
   - `.home-primary-actions` or `.practice-details` → practice
   - anything else → home
   - A bottom tab bar placed inside `#homePage` would get `data-panel="home"` and disappear on other views.
6. **Text-size buttons are found by their exact attribute text.** `reader.js:149-150` looks for `[onclick="changeFontSize(-2)"]` and `[onclick="changeFontSize(2)"]` to disable them at 18 and 48 px. Keep those strings exactly. Any extra button with the same `onclick` (for example in a sticky toolbar) gets the same disabling for free.
7. **`#readerTitleSection` has its whole className replaced** with `'reader-title-section ' + cfg.theme` (`app.js:57`). Any extra class written in HTML is wiped. The 15 theme classes are: vishnu, lalitha, shiva, ganesha, venkat, hanuman, ayyappa, lakshmi, durga, saibaba, govinda, bilva, chalisa, harati, manidweepa, each with a `-theme` suffix.
8. **The whole Japamala page counts a bead on any tap.** `#japamalaPage` has `onclick="bumpJapa()"` (1152). Every new button placed inside it (ⓘ, tabs, back) must call `event.stopPropagation()`. Put the tab bar outside this element.
9. **The `hidden` attribute needs a global `[hidden]{display:none!important}` rule** (today in design-system.css:23). JS sets `hidden` on:
   - `.cards-section` (category filter)
   - `#meaningToggle` and `#meaningToggleRow`
   - `#readerSectionNav`
   - `.rs-nav`
   - `#readerLinkFallback`
   - `#jmRudrakshaFallback` and the canvas
   - Any new `display:` rule on these classes will override `hidden` unless that rule is kept.
10. **Existing bug, needs a JS decision.**
    - **The collision:** `japamala.js:306` defines a global `bumpJapa()` that replaces `tracking.js:216 bumpJapa(i, delta)`, because japamala.js loads later.
    - **The effect:** the day-sheet japa −/＋ buttons (`tracking.js:170,172`) add to the Japamala total and play the bead click. They never change the day's count.
    - **A second, smaller bug:** the Space key (`japamala.js:481-488`) is captured whenever `#japamalaPage.active` is on. Typing a space in the feedback box opened over the mala counts a bead and swallows the space.

---

## 1. `<head>`, body and background layers

| Item | Details |
|---|---|
| Head | `lang="te"`, theme-color `#664524` (6), fonts Noto Sans Telugu 300–700 and Noto Serif Telugu 400–600 (9), inline GA4 script (11-17). |
| Stylesheets (18-21) | `styles.css`, `reading.css`, `japamala-3d.css` (not in the delete list), `design-system.css`. |
| `<body class="grandham">` (23) | Always set. Old CSS scopes many rules under `body.grandham`. JS adds or removes `show-meanings` on body (`reader.js:156,169`) and sets `body.style.overflow='hidden'` for overlays. |
| `a.skip-link` (24) | `href="#homePage"`, text "ప్రధాన విషయానికి వెళ్ళండి / Skip to content". `experience.js:62-66` intercepts it and focuses whichever page is `.active`. |
| `.bg-pattern` (26), `.bg-mesh` (27), `#particles.particles` (28) | `createParticles()` (`app.js:24-35`) adds 35 `div.particle.big` or `.particle.gold` with inline `left`, `animationDelay` and `animationDuration`. Skipped when reduced motion is on. All three are hidden today (design-system.css:22), so these are wasted DOM nodes. |
| Deity symbol sprite (31-535) | `<svg style="display:none">` holding `<symbol>`s, all drawn with `currentColor`. Ids: `svg-vishnu` (34), `svg-lalitha` (74), `svg-shiva` (113), `svg-bilva` (148), `svg-venkat` (196), `svg-ganesha` (233), `svg-hanuman` (272), `svg-lakshmi` (306), `svg-saibaba` (349), `svg-ayyappa` (380), `svg-durga` (410), `svg-krishna` (459), `svg-diya` (501). Used by cards, the reader background (`app.js:63` via `cfg.svgId`) and cloud cards (`admin.js:23-37`). |
| Icon sprite `/icons.svg` | `icon-arrow-right`, `-close`, `-check`, `-edit`, `-delete`, `-revert`, `-add`, `-search`, `-chevron-up`, `-chevron-down`, `-reset`, `-mic`, `-warning`, `-star`, `-star-filled`. Only arrow-right and close are used on the main site. The rest are ready to replace emoji chrome. |

## 2. Header (538-556)

| Element | ids / classes | Handler | Labels / glyphs / notes |
|---|---|---|---|
| `header.header > .header-content` | | | Sticky in the old CSS (design-system.css:29, z-index 40). |
| Back button (541) | `.header-slot.header-slot-left > button.back-btn#backBtn` (no `type`) | `onclick="goHome()"` | "← వెనుకకు". JS sets `style.display` to `'block'` or `'none'` (app.js:51,101; tracking.js:46; japamala.js:59). CSS must hide it by default. The old CSS hides the empty slot with `:has(.back-btn[style*="none"])` (design-system.css:32). |
| Titles (543-547) | `.header-titles > .header-om` (aria-hidden "ఓం"), `h1`, `.header-sub` | | "శ్రీ దివ్య స్తోత్రములు" / "Sri Divya Stotramulu" |
| Utilities (548) | `.header-utilities` > 2× `button type=button` | `openSearch()`, `openAccount()` | "⌕ <span>వెతకండి</span>" with `aria-label="స్తోత్రాలు వెతకండి / Search"`. "నా ఖాతా <span lang=en>/ Account</span>" has no aria-label. ⌕ (U+2315) may show as an empty box on older Android. |
| Main nav (550-555) | `nav.site-navigation` with `aria-label="ప్రధాన మార్గదర్శి / Main navigation"` | JS click listeners (experience.js:39-46) | 4× `<a href="#…" data-home-target="…">Telugu <small>English</small></a>`. See section 13. `aria-current="page"` is set on the active link (experience.js:21-24). |

## 3. Home: `#homePage` (559) and its panels

`div.home-page#homePage role="main" tabindex="-1"`.

- `data-view` is set to home, library, saved or practice (experience.js:20).
- Visibility is `style.display` `'none'` or `'flex'` (app.js:47,96; tracking.js:43; japamala.js:55), so the page must be laid out as a flex column.
- The hide rules that must be recreated are at design-system.css:213-216: `#homePage[data-view="X"] > [data-panel]:not([data-panel="X"]) {display:none!important}`.

**Order after load.** weekday.js runs while the page parses. Then, on DOMContentLoaded: reader-navigation.js, then library.js, then experience.js.

| # | Element | panel | Built by |
|---|---|---|---|
| 1 | `section.welcome-section` | home | HTML 560 |
| 2 | `section#recentReadingSection` | home | reader-navigation.js:132-169 (only if there is reading history) |
| 3 | `div#todaySection` | home | weekday.js:95-127 (removed if nothing matches today) |
| 4 | `nav#library.library-navigation` | library | reader-navigation.js:309-354 |
| 5-8 | `.cards-section` ×4 (+ cloud-created sections) | library | HTML 617/671/819/910. Cloud sections are added by admin.js:155-169 and moved before favourites (reader-nav:348-349). |
| 9 | `section#favoritesSection` | saved | library.js:63-101 |
| 10 | `section#practice.home-primary-actions` | practice | HTML 589, moved to the end (reader-nav:356) |
| 11 | `details.practice-details` | practice | HTML 596, moved to the end |

### 3.1 Welcome / hero (560-587)

- `section.welcome-section` with `aria-labelledby="welcomeTitle"`. Contains `.welcome-copy`:
  - `span.eyebrow` "నిత్య పారాయణం · A MOMENT OF DEVOTION"
  - `h2#welcomeTitle` "మనసుకు శాంతి.<br>ప్రతి రోజూ భక్తి."
  - `p` with a `<br>`
  - **`a.primary-link href="#library"`** "స్తోత్రాలు చదవండి ↗". This is required; experience.js:47 turns it into `navigate('library')`.
  - `span.hero-note` "తెలుగులో పఠనం · మీ వేగంలో సాధన"
- `.hero-art` (aria-hidden) holds an inline lamp SVG:
  - Gradient ids `lampGlow` and `lampBrass`.
  - `path.diya-flame` is animated by `lampBreath` (design-system.css:61).
  - `span` "శుభం భూయాత్".

### 3.2 Recent reading (JS, `reader-navigation.js:132-169`)

- Structure: `section#recentReadingSection.recent-reading-section`, `aria-labelledby="recentReadingTitle"`.
  - `h2#recentReadingTitle` "ఇటీవల చదివినవి"
  - `div.recent-reading-list` holding up to 3 `button type=button`. Each has a `span` (title) and a `small` "శ్లోకం N / T నుండి కొనసాగించండి". `onclick` calls `openRecentReading(type, index)`.
- Placement: inserted after `.welcome-section`. It re-renders on `storage` and `stotras-updated` events.

### 3.3 Today by weekday (JS, `weekday.js:95-127`)

- Structure: `div#todaySection.today-section`.
  - `.today-head`: `span.today-day` "🌅 ఈ రోజు — <day name>" and `span.today-note` (the deity note).
  - `p.weekday-guidance` "ఈ రోజు సూచనలు మాత్రమే…"
  - `div.today-strip` holding up to 3 `button.today-tile onclick="openReader('KEY')"`. Each has `span.today-ico` (emoji; hidden in the old CSS) and `span.today-title`.
- Refresh: every 60 s and on `visibilitychange`. It also re-renders from Firestore `config/weekday`.

### 3.4 Library navigation (JS, `reader-navigation.js:306-358`)

- Structure: `nav#library.library-navigation`, `aria-label="స్తోత్రాల విభాగాలు / Prayer categories"`.
  - `.library-intro`: `span.eyebrow` "THE SACRED COLLECTION", `h2` "స్తోత్రాల గ్రంథాలయం", `p`.
  - `div.category-filters` holding `button type=button data-category="all|library-section-N" aria-pressed`. Each has the label text and a `span.filter-count` (number of cards). Labels come from each `.section-title`; the first is "అన్నీ".
- Behaviour:
  - Clicking a filter calls `choose(id)`, which sets `hidden` on the non-matching `.cards-section`s.
  - The choice is saved in localStorage `stotramLibraryCategory`.
  - The filters rebuild on `stotras-updated`.

### 3.5 Card sections (617-950)

- **Section wrapper:** `div.cards-section[data-cat]` with `data-cat` = `sahasranama` (617), `ashtottara` (671), `stotras` (819) or `aratis` (910). Keep `data-cat`: `admin.js:156` looks it up to avoid creating duplicate sections. At runtime each section gets `id="library-section-0…3"` (reader-nav:342).
- **Section heading:** `.section-divider > h2.section-title + .section-sub`. `.section-title` is read for the filter labels.
- **Card markup** (keep the class names; `admin.js:144-153` patches `h3`, `.card-sub` and `.card-desc`, and `admin.js:180-189` builds cloud cards the same way):
  ```
  a.card.<theme>[href="?stotram=KEY"][data-stotram=KEY]
    .card-bg
    svg.card-deity-svg[style="color:#…"] > use[href="#svg-…"]
    .card-content > .card-icon-wrap > span.deity-icon(emoji)
                  > h3, .card-sub, .card-desc
                  > span.card-action[aria-hidden] "చదవండి" + svg.icon-inline(icon-arrow-right)
  ```
- **JS hooks on cards:**
  - `library.js:27-37` rewrites `href` and adds a click handler that calls `openReader()`. It also sets `data-reader-link-ready="true"`.
  - Cloud cards also carry `.cloud-card`.
- **Cards, with emoji and inline colour:**
  - **Sahasranama (4):** vishnu 🔱 #3070c0 · lalitha 🪷 #c04070 · shivasahasram 🔱 #5088b0 · ganeshasahasram 🐘 #e08040
  - **Ashtottara (18):** vishnu108 🔱 · lalitha108 🪷 · venkat108 ⛰️ #c89838 · ganesha108 🐘 · shiva108 🙏 · hanuman108 🦍 #d06030 · ayyappa108 🏔️ #4080c8 · lakshmi108 💎 #e0b840 · durga108 🔥 #d04050 · sai108 🌟 #d08040 · saraswati108 📚 #d8b24c (class `lalitha`) · surya108 ☀️ #e69b30 (class `harati`, diya art)
  - **Ashtottara one-line cards (809-814), with no `card-deity-svg`:** rama108 🏹 (`vishnu`) · subrahmanya108 🦚 (`shiva`) · adilakshmi108 🪷 · vijayalakshmi108 🏆 · arunachala108 🔱 (`shiva`) · aishwaryalakshmi108 🪷
  - **Stotras (5):** lingashtakam 🙏 · bilvashtakam 🍃 #409848 · suprabhatam ⛰️ · govinda 🦚 #4090d0 (krishna art) · chalisa 🦍. The two Manidweepa cards (880-905) are commented out, but their data scripts still load (1300-1301, `hidden:true`).
  - **Aratis (3):** saiharati 🪔 #ffaa3c · jagadeeshaharati 🪔 · ganapatiharati 🐘

### 3.6 Favourites (JS, `library.js:63-101`)

- Structure: `section#favoritesSection.favorites-section`, `aria-labelledby="favoritesTitle"`.
  - `h2#favoritesTitle` "మీకు ఇష్టమైన స్తోత్రాలు"
  - Then either `div.today-strip > a.today-tile` (reusing the Today classes), or a `p` hint "స్తోత్రం తెరిచి ☆ నొక్కండి…".
- Storage: localStorage `stotramFavorites`. Favourites are **not** synced to the cloud; `cloud.js` only merges `track`.

### 3.7 My practice (589-593)

- `section.home-primary-actions#practice`, `aria-label="నా సాధన / My practice"`. Contains:
  - `.practice-intro`: eyebrow "A DAILY RITUAL", `h2` "నా సాధన", `p`.
  - `button type=button onclick="openJapamala()"`: `span.practice-symbol` "◉", `span` "జపమాల", `small` "108 నామాల జపం · Japa mala", `span.practice-arrow` "↗".
  - `button type=button onclick="openTrack()"`: "▦", "పూజా ట్రాక్", `small` "రోజువారీ నమోదు · Daily practice", "↗".

### 3.8 Pradakshina counter (596-614)

- `details.home-counter-section.practice-details`.
  - Its `summary` is HTML entities that decode to "ప్రదక్షిణ లెక్క".
- Inside, `.counter-card`:
  - **`.counter-head`:** `span.counter-name` "🕉️ ప్రదక్షిణలు / Pradakshinalu", then `.counter-actions` containing:
    - `input[type=date].counter-date-picker#homeDatePicker onchange="onHomeDateChange(this.value)"`, title "తేదీ ఎంచుకోండి"
    - `button.counter-reset onclick="resetHomePradakshina()"` "↻", aria-label "Reset" (English only)
  - **`.counter-row`:**
    - `button.count-btn onclick="bumpHomePradakshina(-1)"` "−" (U+2212), aria-label "తగ్గించు"
    - `.count-center > .count-display#homePradakshinaCount` and `.count-target` with **inline style** `cursor:default;text-decoration:none;` (609), text "Pradakshina"
    - `button.count-btn onclick="bumpHomePradakshina(1)"` "＋" (U+FF0B), aria-label "పెంచు"

## 4. Reader page: `#readerPage` (954-1041)

`div.reader-page`. The `.active` class shows it (app.js:48).

| Component | ids / classes / attributes | Handlers | Labels, glyphs, notes |
|---|---|---|---|
| Deity background (955) | `#readerDeityBg.reader-deity-bg` | innerHTML is `<svg style="…color:${svgColor}"><use href=svgId>` (app.js:63), cleared by goHome | |
| Title (956-959) | `#readerTitleSection.reader-title-section` (className replaced), `h2#readerTitle`, `p#readerSubtitle` | text from cfg | |
| Tool panel (961-984) | `section.reader-tool-panel.reader-tool-panel-compact` with English aria-label "Reading tools"; `h3` "చదవడానికి"; `.controls` | | |
| Text size (964-969) | `.font-control`: `label` (not linked to any control) "అక్షరాలు:", `button.font-btn` ×2, `span.font-size-display#fontSizeDisplay` aria-live=polite | `changeFontSize(-2)`, `changeFontSize(2)` (exact strings, see 0.6) | "−" and **"+" (ASCII, while other counters use ＋)**. aria-labels "అక్షరాలు చిన్నవి / Smaller text" and "…పెద్దవి / Larger text". Also sets `--reader-font-size` on `:root` and inline font-size on `.slokam-text` and `.slokam-meaning` (reader.js:146-147). Saved in localStorage `readerFontSize` (18–48). |
| In-text search (970-982) | `.reader-search` (container class needed by reader.js:346): `span.rs-icon` "🔎"; `input.rs-input#readerSearchInput` (no label or aria-label; placeholder "పాఠంలో వెతకండి…"); `span.rs-count#readerSearchCount` ("i/n"); `button.rs-mic#readerMicBtn` 🎤 (`.listening`); 2× `button.rs-nav` ↑ ↓ (`hidden` and `disabled` toggled); `button.rs-clear#readerSearchClear` ✕ with **inline `style="display:none"`**, which JS toggles (reader.js:239) | `oninput="onReaderSearchInput(this.value)"`, `onkeydown="onReaderSearchKey(event)"`, `startReaderVoice()`, `prevSearchMatch()`, `nextSearchMatch()`, `clearReaderSearch()` | aria-labels are English only ("Voice", "Previous match", "Next match", "Clear"). Matches are wrapped in `<mark>`, and the current one is `mark.current`. |
| Options panel (986-1029) | `details.reader-options` > `summary` > `span` "⚙ పఠన ఎంపికలు" + `small#readerOptionsSummary` (rewritten to "అర్థం a/t, శ్లోకం, సేవ్, లెక్క") | screenshots.cjs clicks `.reader-options summary` | |
| Meaning toggle (989-994) | `.reader-toggle-row#meaningToggleRow` (`hidden` when there are no meanings) > `div.meaning-toggle#meaningToggle` (`.on`) > `label` + `div.toggle-switch` | `onclick="toggleMeanings()"`. The attribute must stay: reader-nav:360-374 adds `role=button`, `tabindex=0`, keyboard support and mirrors `aria-pressed` only for `[onclick]` elements | Label rewritten to "అర్థం చూపించు (a/t)". Toggles `body.show-meanings`; saved in localStorage `showMeanings`. The row has a stray blank line (993). |
| Verse jump / resume / sections (995-1000) | `nav.reader-navigation` with aria-label "పఠన మార్గదర్శి"; `label for=verseJump` "శ్లోకానికి వెళ్లండి"; `select#verseJump`; `button type=button` "చదవడం కొనసాగించు"; `div.reader-section-navigation#readerSectionNav hidden` (JS adds `span.reader-section-label` "విభాగానికి వెళ్లండి" and section `button type=button`s) | `onchange="jumpToVerse(this.value)"`, `resumeReading()`, section buttons call `jumpToSection(index)` | Options built in reader-nav:263-268. Scroll position is tracked with IntersectionObserver on `.slokam-block`. |
| Library actions (1001-1007) | `.reader-library-actions`: `button#favoriteButton type=button aria-pressed`; `button type=button`; `button.clear-reading-button type=button`; `p#readerLinkStatus role=status aria-live`; `input#readerLinkFallback type=url readonly hidden` | `toggleFavorite()`, `copyReaderLink()`, `resetReading()` | "☆ ఇష్టమైనవాటిలో చేర్చు", which becomes "★ ఇష్టమైన స్తోత్రం" (library.js:49). "లింక్ కాపీ చేయండి". "చదివిన గుర్తులు తొలగించు" (asks for confirmation). |
| Parayana counter (1008-1027) | `section.reader-practice.reader-option-group` (aria-label "పారాయణ లెక్క"), `h4`, `.counter-card.stotram-counter-card`: `span.counter-name` "📖 <span#stotramCounterLabel>" (becomes "<title> — పారాయణం"); `input date#stotramDatePicker`; `button.counter-reset` ↻; 2× `.count-btn` − ＋; `.count-display#stotramParayanaCount`; `.count-target` "Parayana" | `onStotramDateChange(this.value)`, `resetStotramParayana()`, `bumpStotramParayana(-1 / 1)` | Stored in `track.days[date].parayana[type]`. **The Track calendar never shows this**: `dayHasData` and the day sheet ignore `parayana` (tracking.js:80-85, 154-199). |
| Verses (1031) | `#slokamContainer.slokam-container`. For each verse, JS builds `div.slokam-block(.read)#verse-N[data-idx][tabindex=-1]` containing an optional `span.slokam-number` (non-numeric heading), `div.reader-verse-row` > `div.slokam-text` (inline font-size) + `span.reader-verse-number`, `div.slokam-meaning` > `span.meaning-label` "అర్థం", and `button.verse-read-button[aria-pressed]` | the button's `onclick` calls `toggleSlokamRead(idx, block)` | "చదివినట్లు గుర్తించు" or "చదివాను ✓". Empty state: `div.reader-empty-state role=status` (reader.js:63-67). `.slokam-meaning` is hidden unless `body.show-meanings` is set. |
| Origin (1033-1036) | `details.origin-details.reader-after-content` > `summary` "📜 ఉద్భవం & ప్రాముఖ్యత" > `#originBlock.origin-block` (`.visible`) | innerHTML `span.origin-label` + `div.origin-text` (app.js:69) | **The label is repeated inside the block.** When there is no origin text, an empty expandable panel still shows. |
| Source status (1037-1040) | `details.source-details.reader-after-content#sourceDetails` (`open` when `needsReview`) > `summary` > `span#sourceStatusBadge.source-status-badge.{verified,partial,review,pending,override}` + `span` "మూలాలు & పాఠం వివరాలు"; `#sourceContent` holds `p`, `p.source-review-meta`, `a[target=_blank]`, and `section.meaning-review-summary` (`h4` "అర్థాల స్థితి", `p.meaning-coverage`, `p.meaning-review-status.{verified,partial,reference,pending}`) | reader-nav:271-304 | Badge glyphs: ✓ ◐ △ ◇ |
| **Progress bar** | **There isn't one.** No HTML or JS creates it. `.reading-position-bar`, `.reading-progress-copy` and `progress` styles (reading.css:222-259) are unused leftovers. The only progress indicators are `.read` marks, `#verseJump` and recent reading. A progress bar would need new JS; `readSet(type).size / cfg.data.length` or scroll percentage would work. | | |

## 5. Search overlay (1043-1055)

- **Container:** `div.search-overlay#searchOverlay` (`.active`) > `.search-box`.
- **Input row** (`.search-input-wrap`):
  - `input.search-input#searchInput` with `oninput="runSearch(this.value)"`. No label. Placeholder "స్తోత్రం పేరు చెప్పండి లేదా టైప్ చేయండి…".
  - `button.mic-btn#micBtn onclick="startVoice()"` 🎤. It gets `.listening`, and inline `display:none` if the browser has no speech recognition (app.js:186).
  - `button.search-close-btn onclick="closeSearch()"`, title "మూసివేయి", icon `icon-close`. No aria-label.
- **Hint:** `div.search-hint#searchHint` "🎤 బటన్ నొక్కి…". Its text changes to "🎙️ వింటున్నాను…" and "🔎 "…" కోసం వెతుకుతోంది…".
- **Results:** `div.search-results#searchResults` holds `div.search-result onclick="pickSearch('KEY')"` (a div, so it can't be reached by keyboard), each with `span.sr-icon`, `.sr-title` and `.sr-sub`. When nothing matches: `div.search-empty` "😔 ఏమీ దొరకలేదు…".
- **Closing:** Escape closes it (app.js:289-291). Tapping the backdrop does nothing.

## 6. Account overlay (1061-1089)

- **Container:** `div.search-overlay#accountOverlay` (it reuses the search overlay classes) > `.search-box.account-box`.
  - Header: `.account-head` > `h2` "నా ఖాతా / My Account" + `button.search-close-btn onclick="closeAccountOverlay()"`.
- **Sign-in card:** `.track-card` (a class borrowed from the Track page).
  - `.track-card-title` "☁️ అన్ని ఫోన్‌లలో సేవ్ చేయండి".
  - `#cloudAuthBox.cloud-auth`, filled by `cloud.js:117-129`:
    - Signed in: `div.cloud-signed` "✓ <b>name</b>" + `div.cloud-sub`, and `button.track-btn onclick="stotramSignOut()"`.
    - Signed out: `button.track-btn.primary onclick="stotramSignIn()"` "🔐 Google తో సైన్ ఇన్ చేయండి".
    - Stays empty if the Firebase SDK didn't load.
  - `#adminLinkBox`: for the admin only, `a.track-btn.admin-dash-link href=/admin.html` "⚙️ …" (admin.js:198-202).
  - `div.track-empty` with a long **inline style** (1072).
- **Backup card:** `details.track-card.account-advanced`.
  - `summary.track-card-title` "💾 బ్యాకప్ & రీస్టోర్" + `span.account-advanced-hint`.
  - `div.btn-row` with inline `margin-top:12px` (1079):
    - `button.track-btn.primary onclick="exportBackup()"` "📤 బ్యాకప్ తీసుకోండి"
    - `button.track-btn onclick="triggerRestore()"` "📥 తిరిగి పొందండి"
  - `input#restoreFile type=file` with inline `display:none` and `onchange="handleRestoreFile(this)"` (1083).
  - `div.track-empty` with an inline style (1084).

## 7. Track page (1092-1133)

- **Container:** `div.track-page#trackPage` (`.active`).
- **Heading:** `.track-section-head` > `h2` "📿 నా పూజా ట్రాక్" + `p` "My Daily Pooja Tracker".
- **Reminder banner:** `div.reminder-banner#reminderBanner` (`.show`). JS fills it (app.js:280) with `span` 🔔, `span` "ఈరోజు జ్ఞాపిక: <b>…</b>", and `span.rb-close onclick="this.parentElement.classList.remove('show')"` ✕. The close control is a span, not a button.
- **Calendar card** (`.track-card`):
  - `.month-nav`: `button.month-arrow#prevMonthBtn onclick="shiftMonth(-1)"` "‹", `div.month-label#monthLabel`, and `button.month-arrow#nextMonthBtn onclick="shiftMonth(1)"` "›". Neither arrow has an aria-label; `disabled` is toggled.
  - `div.month-strip#monthStrip`: a horizontal strip of 7 months that swipes.
    - **Layout rule:** JS uses `scrollLeft = idx * clientWidth` and `onscroll` rounding (tracking.js:111-118), so each `.month-card` must be exactly 100% of the strip width, with horizontal overflow and scroll snapping.
    - Inside each `.month-card`, `div.cal-grid` holds 7× `div.cal-weekday`, `div.cal-day.empty` spacers, and day cells `div.cal-day(.future|.today|.has-data) onclick="openDay('YYYY-MM-DD')"`. Days with data get `span.dot`. Day cells are divs, so they can't be reached by keyboard.
  - Hint `div.track-empty` with an inline style (1108): "ఒక రోజును నొక్కి…".
- **Mokkulu (vows) card** (`.track-card`):
  - `.track-card-title` "🙏 మొక్కులు (Vows)".
  - `.mokku-form`:
    - `input.mokku-input#mokkuText`
    - `.mokku-row2` > `input.mokku-date#mokkuDate type=date` + `button.mokku-add-btn onclick="addMokku()"` "＋ జోడించండి"
  - `div.mokku-list#mokkuList`: `div.mokku-item(.done)` containing:
    - `div.mokku-check onclick="toggleMokku('id')"` ✔
    - `.mokku-body` > `.mokku-text`, and `.mokku-meta > span.mokku-badge(.due)` "🔔 d Month • ఈరోజు!"
    - `span.mokku-del onclick="deleteMokku('id')"` 🗑️. **Deletes with no confirmation.**
  - Empty state: `div.track-empty`.
- **Privacy note:** `div.track-empty` with an inline style (1129-1132): "📱 …ఇంటర్నెట్‌కు పంపబడదు". This is **wrong once the user signs in**; cloud.js pushes `track` to Firestore.

## 8. Japamala

- **Gradient definitions (1138-1149):** `svg.jm-defs` with an inline 0-size, absolutely positioned style. Ids `gWood1`, `gWood2`, `gWood3`, `gMarker`, `gGuru`, `gGuruTop`, `gGold`, `gFocus`. This SVG must never be `display:none`.
- **Page (1152-1210):** `div.japamala-page#japamalaPage onclick="bumpJapa()"` (`.active`).

| Component | Details |
|---|---|
| Heading | `.jm-head` "📿 జపమాల" |
| Modes | `.jm-modes` > 4× `button.jm-mode-btn data-mode="flow|strand|full|rudraksha3d" onclick="event.stopPropagation(); setJmMode('…')"`. Labels "మాల · Flow", "దండ · Pull", "వలయం · Full", "రుద్రాక్ష · 3D". `.active` is toggled (japamala.js:83-84). The mode is saved in localStorage `jm_mode_v2`. |
| Count | `.jm-count-top` > `span#jmCount` + `span.jm-of` " / 108"; `div.jm-rounds#jmRounds` "పూర్తయిన మాలలు: N" |
| Stage: strand | `div.jm-stage#jmStageStrand` > `svg#jmSvg.jm-svg` (viewBox 0 0 300 520, aria-label) > `line.jm-thread`, `ellipse.jm-focus`, `g#jmBeads`, `g#jmGuru` |
| Stage: full | `div.jm-stage#jmStageFull` with inline `display:none` > `svg#jmSvgFull.jm-svg.jm-svg-full` > `ellipse#jmFullThread.jm-thread`, `g#jmFullBeads`, `g#jmFullGuru` |
| Stage: flow | `div.jm-stage#jmStageFlow` with inline `display:none` > `svg#jmSvgFlow.jm-svg.jm-svg-flow` > `ellipse.jm-thread`, `ellipse.jm-focus`, `g#jmFlowBeads`, `g#jmFlowGuru` |
| Stage: 3D | `div.jm-stage.jm-stage-rudraksha3d#jmStageRudraksha3d` with inline `display:none`. Contains `.jm-rudraksha-aura`; `canvas#jmRudrakshaCanvas.jm-rudraksha-canvas` (720×760, `role=button tabindex=0`, Telugu aria-label; its own pointer handlers call `window.bumpJapa()`); `div.jm-rudraksha-fallback#jmRudrakshaFallback hidden` with **English-only** text (1198-1200); and `div.jm-rudraksha-hint` (English only). |
| Stage switching | `setJmMode` sets `style.display` to `''` or `'none'` (japamala.js:81). Stage CSS must not force `display` with `!important`. |
| Classes JS adds | `g.jm-bead(.cur)`, `circle.jm-fbead(.cur,.pop)`, `g.jm-flowbead(.start,.cur)`, `path.jm-tassel-thread`, `path.jm-tassel-cap`; `.celebrate` on the active SVG or canvas; `div.jm-confetti` ×60 added to `<body>` with inline left, background and animation timing (needs the `jmFall` keyframes). The optional ids `#jmFullCount` and `#jmFlowCount` are not in the HTML. |
| Controls | `.jm-controls` > `button.jm-btn-reset onclick="event.stopPropagation(); resetJapamala()"` "↻" (title "రీసెట్", aria-label "Reset") and `button.jm-btn-count onclick="event.stopPropagation(); bumpJapa()"` **"COUNT"** (English only) |
| Hint | `.jm-hint` "📿 ఎక్కడైనా నొక్కండి · Space · ఒక్కో పూస లాగండి" |

## 9. Feedback overlay (1213-1261)

- **Container:** `div.feedback-overlay#feedbackOverlay` (`.active`) > `.feedback-box` > `#fbForm`. JS toggles `style.display` on `#fbForm`.
- **Header:** `.fb-head` > `h2` "💬 మీ అభిప్రాయం" + `button.search-close-btn onclick="closeFeedback()"`. Below it, `p.fb-sub` "…🙏 (🎤 నొక్కి మాట్లాడవచ్చు)".
- **Type:** `label.fb-label` (no `for`, on every label) "ఏమి చెప్పాలనుకుంటున్నారు?". `select.fb-input#fbType` with values:
  - `correction` 📖
  - `problem` ⚠️
  - `suggestion` 💡 (selected)
  - `other` 🙏
- **Name:** label "పేరు <span.req>*". `.fb-field` > `input.fb-input#fbName` + `button.mic-mini onclick="listenInto('fbName', this, false)"` 🎤.
- **Phone or email:** label "ఫోన్ లేదా ఇమెయిల్ <span.fb-opt>(ఐచ్ఛికం…)". `input#fbNumber autocomplete=tel` + `mic-mini` calling `listenInto('fbNumber', this, false)`.
- **Message:** label "అభిప్రాయం / సందేశం *". `.fb-field.area` > `textarea.fb-textarea#fbMessage` + `mic-mini` calling `listenInto('fbMessage', this, true)`.
- **Errors and anti-spam:**
  - `div.fb-error#fbError`.
  - A hidden anti-spam field `input#fbWebsite`, positioned off-screen with an inline style (1249-1250).
  - `.invalid` is added to fields that fail validation; `.listening` is added to `mic-mini`.
- **Submit:** `button.mokku-add-btn.fb-submit onclick="submitFeedback()"` "పంపండి →". It borrows the mokku button class.
- **Privacy text:** `div.fb-privacy` "🔒 …".
- **Thank-you screen:** `#fbThanks.fb-thanks` with inline `display:none`. Contains `.big` 🙏, `h3` "ధన్యవాదాలు!" and a `p`. The overlay closes itself after 2.2 s.
- **What gets sent automatically:** screen, stotram and stotramTitle, taken from `currentType` (app.js:426-439). `resetFeedbackBox()` does **not** reset `#fbType`. That means a "report a mistake in this stotram" button can call `openFeedback()` and then set `fbType.value='correction'`.
- **Closing:** tapping the backdrop does nothing.

## 10. Day sheet, scroll-to-top, footer

- **Day sheet (1264-1270):** `div.day-sheet-overlay#daySheetOverlay onclick="if(event.target===this)closeDay()"` (`.active`) > `.day-sheet` > `.sheet-handle` (decorative), `.sheet-date#sheetDate`, `#sheetBody`. There is **no close button**, and you can't swipe it closed.
  - `#sheetBody` is filled by `tracking.js:183-198`:
    - A pradakshina `.counter-card`: `counter-reset onclick="resetDayPradakshina()"` and `count-btn onclick="bumpPradakshina(±1)"`.
    - `.track-card-title` with inline `margin-top:20px` "📿 పారాయణం / జపం".
    - One `.counter-card` per japa entry: `counter-reset onclick="resetJapa(i)"`, `span.counter-del onclick="removeJapa(i)"` 🗑️, `count-btn onclick="bumpJapa(i,±1)"` (**broken, see 0.10**), and `div.count-target(.done) onclick="editTarget(i)"` "లక్ష్యం: N (మార్చు)" or "✅ … — పూర్తయింది".
    - `div.chip-row` > `span.add-chip onclick="addJapa('title')"` ×6, plus `span.add-chip onclick="addJapaCustom()"` "＋ వేరే…".
    - `addJapaCustom` and `editTarget` use the browser's native `prompt()`.
- **Scroll to top (1272):** `button.scroll-top-btn#scrollTopBtn onclick="window.scrollTo({top:0,behavior:'smooth'})"` "↑". No `type`, no aria-label. `.visible` is added when scrollY > 400 (app.js:114-116).
- **Footer (1274-1278):** `div.footer` (a div, not `<footer>`) > `button.footer-feedback type=button onclick="openFeedback()"` "మీ సూచనలు / Share feedback ↗", then `div.divider`, then the text "ॐ నమః శివాయ | ॐ నమో నారాయణాయ | ॐ శ్రీ మాత్రే నమః".

## 11. Dialogs, toasts and banners created by JS

| Component | Built by | Hooks |
|---|---|---|
| Confirm / alert dialog | `siteConfirm` / `siteAlert` (app.js:220-269) | `div.sc-overlay(.show)` > `div.sc-box[role=dialog][aria-modal]` > `div.sc-msg`, `div.sc-actions` > `button.sc-btn[data-no]` and `button.sc-btn.primary|.danger[data-yes]`. Messages contain `\n`, so `white-space: pre-line` is needed. Removed after 180 ms. Esc and Enter are handled. |
| Cloud toast | cloud.js:130-137 | `div#cloudToast.cloud-toast(.show)` "☁️ సురక్షితం / Synced" or "⚠️ సింక్ కాలేదు". Sits at the bottom centre, so it will clash with a bottom tab bar. |
| Reminder | app.js:275-285 | `#reminderBanner.show`, plus a browser notification "🙏 పూజా జ్ఞాపిక" |
| Native `prompt()` | tracking.js:213,227 | Unstyled, and inconsistent with siteConfirm. |
| Global keys | app.js:289-291; japamala.js:481-488 | Esc closes search, day sheet, feedback and account. Space counts a bead while the Japamala page is active. |

Scripts load in this order (1282-1334): 32 data files, content-audit, reader-navigation, reader, tracking, app, japamala-3d, japamala, site-config, 3 Firebase files, cloud, admin, weekday, library, experience.

---

## 12. Lists requested

### 12.1 Layout problems in the markup

1. **Inline styles that fight a design system:**
   - 609 (`.count-target` cursor and text-decoration)
   - 1072, 1084, 1108, 1129: `.track-empty` with font-size 13px and **opacity .45–.55**. That is low contrast for older eyes; the old CSS needed `opacity:1!important` (design-system.css:270) to undo it.
   - 1079 (`.btn-row` margin), 1083 (`#restoreFile`; use `hidden`), 1255 (`#fbThanks`), 1249-1250 (the hidden anti-spam field)
   - tracking.js:195 (margin-top)
   - Per-card `style="color:#…"` on 24 `.card-deity-svg`. A CSS variable per theme would be cleaner. These SVGs are also **hidden** by reading.css:125.
   - Per-verse inline font-size (reader.js:55,146)
   - Inline `display` toggles that JS depends on: `#homePage`, `#backBtn`, `#readerSearchClear`, `#micBtn`, the 4 jm stages, `#fbForm` / `#fbThanks`, and `body.overflow`. The new CSS has to work with these.
2. **Borrowed or duplicated wrappers:**
   - The account overlay uses `.search-overlay`/`.search-box`, so search styles leak into it. It also uses `.track-card`/`.track-empty`/`.track-btn`.
   - The feedback submit button uses `.mokku-add-btn`.
   - Favourites use `.today-strip`/`.today-tile`.
   - Every close button is `.search-close-btn`.
   - The Origin label appears twice (summary 1034 and app.js:69), and the panel shows even when empty.
   - The reader has two separate control areas (`.reader-tool-panel` and `details.reader-options`).
   - `.reader-toggle-row` wraps one child.
   - `.header-slot-left` exists only to hide the back button.
   - Six cards (809-814) are one-line and lack `card-deity-svg`, unlike the other 24.
   - The Manidweepa data scripts load although the cards are commented out.
3. **Inconsistent buttons:**
   - `type="button"` is present on 548, 591-592, 998, 1002-1004 and 1275, and missing on about 30 others (541, 602, 606, 611, 966, 968, 978-981, 1015, 1019, 1024, 1049-1050, 1065, 1080-1081, 1103, 1105, 1118, 1155-1158, 1206-1207, 1233/1239/1245, 1251, 1272, and JS-made `.verse-read-button`). There's no `<form>`, so this is harmless, but it's messy.
   - Things you tap that are **not buttons** and can't be reached by keyboard: `div.meaning-toggle` (patched with JS), `div.search-result`, `div.cal-day`, `div.mokku-check`, `span.mokku-del`, `span.counter-del`, `span.add-chip`, `div.count-target` (editTarget), `span.rb-close`.
   - Glyphs are mixed: ASCII "+" (968) vs full-width "＋" (611, 1024, 1118) vs "−" U+2212.
4. **Labels and language:**
   - Missing or unlinked labels: `#readerSearchInput`, `#searchInput`, `#mokkuText`, and all `.fb-label` (no `for`). The `.font-control` label isn't linked to anything.
   - No aria-label on: Account button, close buttons (title only), month arrows, scroll-top.
   - English-only accessible names: "Reset", "Voice", "Previous match", "Clear", "Reading tools".
   - English-only visible text: "COUNT", the 3D fallback and hint, "Pradakshina", "Parayana", and the English capitals eyebrows.
5. **Page structure:**
   - Only `#homePage` has `role=main`, so the reader, track and japamala pages have no main landmark.
   - The footer is a `div`.
   - `#library` and `#practice` are both element ids and route hashes (the browser jumps to the anchor).
   - Fixed-position items: `#scrollTopBtn` (bottom-right), `#cloudToast` (bottom centre), `.day-sheet` (bottom).
   - Overlay stacking: search 500, feedback 550, day sheet 600. Search, account and feedback can't be closed by tapping the backdrop, and the day sheet has no close button.
6. **Content accuracy:**
   - The Track privacy note (1129-1131) is false for signed-in users.
   - The calendar hint (1108) says you can record parayana, but per-stotram parayana counts never appear on the Track page.
   - 🦍 (gorilla) is used for Hanuman (736, 873), which is a poor fit culturally.
   - 🪷 🪔 🪈 🪙 (Unicode 13–14 emoji) and ⌕ may show as empty boxes on older Android phones.

### 12.2 Places for "ⓘ" info buttons (24)

Suggested markup, matching the `[data-info]` selector already used in `tools/screenshots.cjs:45-47`:

```html
<button type="button" class="info-btn" data-info="KEY" aria-label="… గురించి వివరణ">ⓘ</button>
```

Inside `#japamalaPage`, the handler must call `event.stopPropagation()`.

| # | Where (anchor) | `data-info` | Telugu explanation | English gloss |
|---|---|---|---|---|
| 1 | `#todaySection .today-head` (weekday.js:114) | `today` | వారంలో ఈ రోజు సంప్రదాయంగా పూజించే దేవుని స్తోత్రాలు ఇక్కడ కనిపిస్తాయి. ఇవి సూచనలు మాత్రమే — ఏ స్తోత్రమైనా ఏ రోజైనా చదవవచ్చు. | Stotras traditionally recited on this weekday; suggestions only. |
| 2 | `#recentReadingTitle` | `recent` | మీరు చివరిగా చదివిన మూడు స్తోత్రాలు ఇవి. నొక్కితే మీరు ఆపిన శ్లోకం నుంచే మళ్ళీ మొదలవుతుంది. | Last three stotras you read; tap to resume where you stopped. |
| 3 | `#library .category-filters` | `categories` | ఈ బటన్లతో సహస్రనామాలు, అష్టోత్తరాలు, స్తోత్రాలు, హారతులు విడిగా చూడవచ్చు. "అన్నీ" నొక్కితే అన్నీ కనిపిస్తాయి. | Filter the library by category; "All" shows everything. |
| 4 | `#favoritesTitle` | `favorites` | ఏ స్తోత్రంలోనైనా "☆ ఇష్టమైనవాటిలో చేర్చు" నొక్కితే అది ఇక్కడ చేరుతుంది. ఇది ఈ ఫోన్‌లో మాత్రమే సేవ్ అవుతుంది. | Starred stotras appear here; saved on this phone only (not synced). |
| 5 | Header search button (548) | `search` | స్తోత్రం పేరు తెలుగులో లేదా ఇంగ్లీష్‌లో టైప్ చేయండి, లేదా 🎤 నొక్కి పేరు చెప్పండి. | Search by Telugu/English name or by voice. |
| 6 | `#searchHint` / `#micBtn` | `voice` | 🎤 నొక్కి స్తోత్రం పేరు గట్టిగా చెప్పండి. మొదటిసారి ఫోన్ మైక్ అనుమతి అడిగితే "Allow" నొక్కండి. | Speak the name; allow microphone the first time. |
| 7 | Account `.track-card-title` (1069) | `signin` | Google తో సైన్ ఇన్ చేస్తే ప్రదక్షిణలు, జపమాల లెక్క, మొక్కులు, చదివిన గుర్తులు ఆన్‌లైన్‌లో భద్రంగా ఉంటాయి. కొత్త ఫోన్‌లో సైన్ ఇన్ చేస్తే అవే తిరిగి వస్తాయి. | Sign-in keeps counts, vows and read marks safe across phones. |
| 8 | `.account-advanced summary` | `backup` | సైన్ ఇన్ చేయలేని వారికి మాత్రమే. "బ్యాకప్" ఒక ఫైల్‌ను ఫోన్‌లో దాస్తుంది; కొత్త ఫోన్‌లో "తిరిగి పొందండి" నొక్కి ఆ ఫైల్ ఎంచుకోండి. | File backup for those who can't sign in. |
| 9 | Home pradakshina `.counter-name` (599) | `pradakshina` | గుడిలో చేసిన ప్రదక్షిణలను ＋ తో లెక్కించండి. తేదీ మార్చి పాత రోజుల లెక్క కూడా వేయవచ్చు; ↻ నొక్కితే ఆ రోజు లెక్క 0 అవుతుంది. | Count circumambulations; pick a date; ↻ resets that day. |
| 10 | Practice Japamala button (591) / `.jm-head` | `japamala` | ప్రతి నామం చెప్పిన తర్వాత స్క్రీన్ మీద ఎక్కడైనా నొక్కండి — ఒక పూస ముందుకు కదులుతుంది. 108 పూర్తయితే గంట మోగుతుంది. | Tap anywhere per chant; bell at 108. |
| 11 | `.jm-modes` | `jm-modes` | మాల, దండ, వలయం, రుద్రాక్ష — ఇవి మాల కనిపించే విధానాలు మాత్రమే. ఏది ఎంచుకున్నా లెక్క ఒక్కటే. | Four visual styles sharing one count. |
| 12 | `.jm-btn-reset` / `#jmRounds` | `jm-reset` | ↻ నొక్కితే జపమాల లెక్క, పూర్తయిన మాలల సంఖ్య రెండూ 0 అవుతాయి. | Reset clears count and completed malas. |
| 13 | Track calendar `.month-nav` | `calendar` | ఏ రోజునైనా నొక్కి ఆ రోజు ప్రదక్షిణలు, జపాలు నమోదు చేయండి. చుక్క ఉన్న రోజుల్లో మీరు ఏదో నమోదు చేశారని అర్థం. ప్రక్కకు జరిపి పాత నెలలు చూడవచ్చు. | Tap a day to log; dot = logged; swipe for past months. |
| 14 | Mokkulu `.track-card-title` (1113) | `mokku` | మొక్కు అంటే దేవునికి చేసుకున్న ప్రమాణం. ఇక్కడ రాసి తేదీ పెడితే ఆ రోజు గుర్తుచేస్తాం; తీర్చుకున్నాక ఎడమ వైపు గుండ్రం నొక్కండి. | Record vows; optional reminder date; tick when fulfilled. |
| 15 | Day sheet `.chip-row` | `day-japa` | ఆ రోజు చేసిన పారాయణం/జపం పేరు నొక్కి జోడించండి. "లక్ష్యం" నొక్కి ఎన్నిసార్లు చేయాలో (ఉదా: 11) పెట్టుకోవచ్చు. | Add a japa for the day and set a target. |
| 16 | Reader `.font-control` | `font` | − / + నొక్కి అక్షరాల పరిమాణం మార్చండి. మీరు ఎంచుకున్న పరిమాణం అన్ని స్తోత్రాలకూ గుర్తుంటుంది. | Text size; remembered for all stotras. |
| 17 | `.reader-search` | `reader-search` | ఈ స్తోత్రంలో ఒక పదం వెతకండి; దొరికిన చోట్లు గుర్తుగా కనిపిస్తాయి, ↑ ↓ తో మారండి. ఇంగ్లీష్ అక్షరాల్లో (ఉదా: padmanabha) కూడా టైప్ చేయవచ్చు. | Find words in this text; ↑↓ to step; English spelling works. |
| 18 | `#meaningToggle` | `meanings` | ఇది ఆన్ చేస్తే ప్రతి శ్లోకం కింద దాని అర్థం కనిపిస్తుంది. బ్రాకెట్‌లోని సంఖ్య ఎన్ని శ్లోకాలకు అర్థం ఉందో చెబుతుంది. | Shows meanings; the number shows coverage. |
| 19 | `.reader-navigation` (verse jump + resume) | `jump` | జాబితా నుంచి శ్లోకం సంఖ్య ఎంచుకుంటే నేరుగా అక్కడికి వెళ్తుంది. "చదవడం కొనసాగించు" మీరు చివరిగా ఆపిన చోటుకి తీసుకెళ్తుంది. | Jump to a verse; Resume returns to your place. |
| 20 | `#readerSectionNav` label | `sections` | పెద్ద స్తోత్రాల్లోని ముఖ్య భాగాలకు (ఉదా: ధ్యానం, నామావళి) నేరుగా వెళ్ళడానికి ఈ బటన్లు. | Jump to major sections of long texts. |
| 21 | First `.verse-read-button` / `.clear-reading-button` | `read-marks` | శ్లోకం చదివాక "చదివినట్లు గుర్తించు" నొక్కండి — దాని రంగు మారుతుంది. మధ్యలో ఆపినా ఎక్కడ మొదలుపెట్టాలో తెలుస్తుంది. | Mark verses read so you never lose your place. |
| 22 | `.reader-library-actions` | `save-share` | ☆ నొక్కితే ఈ స్తోత్రం "ఇష్టమైనవి" లో చేరుతుంది. "లింక్ కాపీ" తో WhatsApp లో ఇతరులకు పంపవచ్చు. | Favourite, or copy a link to share. |
| 23 | `.stotram-counter-card .counter-name` | `parayana` | ఈ స్తోత్రాన్ని ఈ రోజు ఎన్నిసార్లు పూర్తిగా చదివారో ＋ తో లెక్కించండి. తేదీ వారీగా సేవ్ అవుతుంది. | Count full recitations per date. |
| 24 | `#sourceStatusBadge` | `source` | ఈ పాఠాన్ని ప్రామాణిక గ్రంథాలతో పోల్చి చూశామో లేదో ఈ గుర్తు చెబుతుంది: ✓ పరిశీలించబడింది, ◐ కొంత పరిశీలించబడింది, △ పరిశీలన జరుగుతోంది. | Text-verification status. |

Also worth adding: `#fbType` (`feedback-type`): "స్తోత్రంలో అక్షర తప్పు కనిపిస్తే 'తప్పు / దిద్దుబాటు' ఎంచుకోండి — మీరు ఏ స్తోత్రం చూస్తున్నారో మాకు తెలుస్తుంది." (Choose "correction" for typos; the current stotram is attached automatically.)

### 12.3 What a mobile bottom tab bar can reuse

- **The four links (551-554):**

  | `data-home-target` | View | Rewritten hash | Label |
  |---|---|---|---|
  | `homePage` | `home` | `#home` | ముఖపుట / Home |
  | `library` | `library` | `#library` | స్తోత్రాలు / Library |
  | `favoritesSection` | `saved` | `#saved` | ఇష్టమైనవి / Saved |
  | `practice` | `practice` | `#practice` | నా సాధన / Practice |

  The mapping is `routes` in experience.js:4.
- **No new JS is needed for the links.** experience.js:5 collects every `[data-home-target]` once, on DOMContentLoaded. It rewrites `href` (`:40`), attaches `navigate()` (`:41-45`) and keeps `aria-current="page"` updated (`:21-24`). A tab bar written in the **static HTML** with the same attributes works as-is. If JS adds it later, it won't be picked up.
  - `navigate()` also closes the reader, track or japamala page through `goHome()`, pushes the hash, scrolls to the top and focuses `#homePage`.
- **Actions that could become tabs or a "More" sheet:** `openSearch()`, `openAccount()`, `openJapamala()`, `openTrack()`, `openFeedback()`.
  - `openUpdates()` does not exist yet. `tools/screenshots.cjs:43` already expects it for the planned "updates" screen. A new overlay would also need its close function added to the Esc handler at app.js:290.
- **Where to put it:** directly under `<body>`, outside `#homePage` (see 0.5) and outside `#japamalaPage` (see 0.8), for example after `.footer`.
  - z-index should be below the overlays (under 500) and above the sticky header (40).
  - Add `padding-bottom: calc(tab height + env(safe-area-inset-bottom))` to the body or pages.
  - Move `#scrollTopBtn`, `#cloudToast` and `.jm-controls` up by the tab bar's height.
- **Known gaps:**
  - `aria-current` doesn't change when the reader, track or japamala page opens. The last home tab stays highlighted, because `render()` isn't called from `openReader`, `openTrack` or `openJapamala`. That needs a small JS hook, such as a check for `.active` pages.
  - `#backBtn` is still needed for those pages.
  - The header `nav.site-navigation` could be hidden on mobile once the tab bar exists. Both sets of links stay in sync automatically.