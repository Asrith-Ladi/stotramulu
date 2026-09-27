# Devotional experience redesign

The home page now uses ivory, temple green, brass accents, and Telugu-first typography. A restrained animated diya establishes the devotional setting. Main navigation leads to Home, Library, Saved, and Practice from reading and practice screens.

The hidden actions disclosure and duplicate category dropdown/accordions were removed. One visible filter controls library categories and refreshes when cloud content changes. Daily suggestions are limited to three; every prayer remains in the library. Saved prayers and practice tools follow the collection. Existing prayer texts, saved progress, favorites, account, feedback, and counters are retained.

Reading uses a quieter paper surface with legible controls. Keyboard focus, a skip link, responsive layouts, and reduced-motion support are included.

## Validation

- `node tools/verify.cjs`
- `node tools/verify-library.cjs`
- `node tools/verify-reader-navigation.cjs`
- `node tools/review-devotional.cjs` — requires Playwright and Microsoft Edge. Set `PLAYWRIGHT_MODULE` to a locally installed Playwright module if needed; `BROWSER_EXECUTABLE` may override the browser executable.

Browser checks cover all bundled cards and category filters, reader URLs, return navigation, practice-to-saved navigation, cloud-added categories, uncaught JavaScript errors, and horizontal overflow at 320, 390, and 768 pixels. Screenshots include a 1440-pixel desktop layout. External Firebase and analytics scripts are blocked in this local UI check; authenticated cloud operations and real-device touch behavior were not tested. No public deployment was performed.
