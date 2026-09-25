# Phase status

## Phase 1 — content corrections and reading controls

Implemented: restored Lalitha's 183 main verses and four dhyana verses; restored Suprabhatam's 29 verses; repaired app syntax; added persistent font sizes, verse navigation, explicit read buttons, keyboard access, source notes and clearer weekday suggestions. See CONTENT-AUDIT.md for unresolved editorial work.

## Phase 2 — favorites and direct links

Implemented: device-local favorites, a home favorites section, stotram URLs using `?stotram=KEY`, browser Back/Forward handling and copy-link controls with a manual-copy fallback. Invalid/hidden keys do not open the reader; cloud-loaded links are retried after content arrives. Favorites do not require sign-in and are not cloud-synced.

## Phase 3 — pending

Resolve flagged source editions and pronunciation differences, visually test on phones with older readers, then review meanings. No blanket authenticity or accessibility certification is claimed.

## Release

Publish through the repository's existing automatic deployment after pushing main. The direct Cloudflare CLI deployment did not run successfully because authentication was unavailable. A successful Git push is not confirmation that the hosting build succeeded.

## Reading layout follow-up

Implemented: one right-side number per verse, individual Ashtottaram names numbered 1-108, and removal of duplicate block/end counters. Grouped verses split for display when their paragraph count matches the labeled range; other ranges retain their source label. Section headings and existing reading progress remain intact.


## Phase 3 ? interface cleanup

Implemented: Grandham reading mode is the default for new visitors while saved preferences are respected; home cards use a compact two-column library on larger screens and one column on phones; mobile header actions retain clear text labels; reading controls, search, navigation, favorites, and sharing are grouped into one panel; reset controls and devotional counters are placed in expandable sections; decorative motion and oversized card icons were reduced.


## Phase 4 ? verified catalog expansion and home clarity

Implemented a first source-reviewed expansion: Mahabharata Shiva Sahasranama (182-verse edition), Ganesha Purana Mahaganapati Sahasranama (216-verse main text), Saraswati Ashtottara (108), Surya Ashtottara (108), Jaya Jagadisha Hare Harathi (refrain plus eight verses), and Ganapati Mangala Harathi (18 verses). Each reader includes its exact source link and edition note. Counts and source order are automated checks; this does not claim that alternate traditional editions are errors.

The home page now starts with four visible actions: Search, Favorites, Sign in & Track, and Japamala. Sign in opens directly at the account controls. Category links remain together below these primary actions.

## Phase 5 — reading continuity

Implemented a compact sticky progress strip with the stotram title, current verse number, total count, and a clearly visible progress line. The reader automatically remembers the last visible verse on this device, the existing Continue button uses that position first, and Home shows one clear recently-read shortcut with the saved verse number. Saved positions are validated against the current text length and the feature degrades safely when browser storage or IntersectionObserver is unavailable.

## Phase 6 — content trust and source status

Completed a line-by-line collation of all 107 main Vishnu Sahasranamam verses against the selected Mahabharata edition, with a Telugu temple text as an independent comparison. Verse 66 was corrected from “విధేయాత్మా” to “అవిధేయాత్మా”; 13 remaining differences are recorded as accepted sandhi, script, or edition variants. The introductory and concluding material remains abbreviated, so the reader identifies this text as partially verified rather than fully verified.

Every reader source panel now shows a visible status badge: verified, main text verified, variant review required, review pending, or locally overridden. This status describes the published edition and does not claim universal authenticity across traditions.


## Phase 7 — Sahasranamam scope audit

Verified every published verse in the selected Shiva and Ganesha Sahasranamam editions against their cited source files after Telugu-script conversion. No verse differences or numbering gaps were found. Corrected the reader descriptions to identify the actual sections: Shiva introduction 1–30, Sahasranama 31–153, phalashruti/transmission 154–182; Ganesha Sahasranama 1–170 and phalashruti/closing 171–216.


## Phase 8 — section navigation

Added large section buttons to long Sahasranamam readers. Shiva readers can jump to the introduction, Sahasranama, or phalashruti; Ganesha readers can jump to the Sahasranama or phalashruti. Invalid section metadata is ignored, buttons use the existing precise verse jump behavior, and the controls collapse to one easy-to-tap column on phones.


## Phase 9 — consistent long-reading navigation

Extended direct section buttons to Vishnu and Lalitha Sahasranamam. Vishnu now separates meditation/introduction, the 107-verse main stotram, and phalashruti/samarpana. Lalitha separates its four meditation verses from the 183-verse main stotram. The section labels describe the selected published scope and use the same accessible mobile controls introduced in Phase 8.
## Phase 10 — more Ashtottarams and shorter Home

Added source-counted Rama and Subrahmanya Ashtottarams, each with 108 individually numbered names. Home content categories can now be opened or minimized by tapping anywhere on the section heading; a small chevron shows the state without adding another button. Only the first category starts open; Ashtottarams, Stotrams, and Harathulu start collapsed, and tapping a category shortcut opens that section before scrolling to it. Generated review screenshots were intentionally skipped to reduce image-generation usage; the behavior and testing steps are documented here.

## Phase 15 — clearer growing library

Implemented compact content counts inside the existing category headings and category selector, without adding another Home button. Home remembers the last opened category on the device, restores it on the next visit, and safely falls back to the first category when the saved value is missing, invalid, or browser storage is unavailable.

## Phase 16 — verified Arunachaleshvara and Aishwarya Lakshmi names

Added two independently source-counted Ashtottarams with 108 names each. The Arunachaleshvara generator explicitly excludes the source's separate opening Ganesha invocation; Aishwarya Lakshmi uses the complete standalone 108-name list. The content-build scripts now share one Namavali conversion and validation module.

## Phase 17 — recent reading history

Expanded the single recent-reading shortcut into a compact list of up to three prayers. Each item keeps its own last valid verse, reopening a prayer moves it to the front without duplicates, existing single-item storage migrates automatically, and invalid or removed content is omitted. The list uses three columns on wider screens and one clear column on phones.

## Phase 18 — semantic, shareable prayer cards

Converted every bundled prayer card from a clickable container into a real link with its reader URL. Normal taps still open the reader without a page reload, while browser link behavior now supports opening in a new tab, copying the destination, and standard keyboard activation. Dynamically managed cards use the same structure, and keyboard focus has a clear visible outline.

## Phase 19 — end-to-end experience and backend cleanup

Consolidated the final presentation into a dedicated design-system stylesheet with a warmer devotional palette, quieter depth, clearer hierarchy, deity accent colors, balanced desktop density, single-column mobile cards, large touch targets, visible keyboard focus, and reduced-motion support. Grandham readers retain the light manuscript surface while controls now use the same visual language. Corrected the English site subtitle and added theme and description metadata.

Split the Cloudflare Worker into routing, OCR, authentication, and HTTP response modules. OCR now accepts only JPEG, PNG, and WebP images, limits file count and encoded payload size, verifies authentication before model usage, and disables response caching. Automated Worker checks now run with the primary verification suite.

## Phase 20 — articulated hand Japamala

Added a fourth **చేతి · Hand** mode while retaining Flow, Pull, and Full. The new lightweight 2D SVG view draws all 108 beads and an articulated hand. On each count, the index finger and thumb close around the focused bead, pull it together, release it, and return. It shares the existing saved total, sound, vibration, reset, and 108-count celebration.

The four choices wrap into a clear two-column selector on small phones, all selectors keep a 44px touch target, and reduced-motion preferences disable the gesture animation without disabling counting. The hand implementation is isolated in its own stylesheet and has a dedicated verification script.

## Phase 21 — lightweight 3D Rudraksha mode

Added **రుద్రాక్ష · 3D** as a fifth choice without removing Flow, Pull, Full, or the articulated 2D Hand. It uses a small dependency-free WebGL renderer rather than the separate 3.3 MB experiment. The renderer procedurally builds a brown five-mukhi Rudraksha mesh with physical grooves, uneven seed texture, central openings, directional light, depth, and rotation. Each count pulls the strand through the focus while reusing the same saved total, sound, vibration, reset, and completion behavior.

The renderer initializes only when selected, stops when hidden, caps phone pixel density, and requests the low-power GPU profile. Horizontal dragging rotates the beads while vertical swipes continue scrolling the page. Keyboard Enter counts, reduced-motion preferences skip the pull animation, and a clear fallback appears when WebGL is unavailable.
