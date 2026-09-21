# UI/UX plan — reading for older users

## Implemented in this change

| Priority | Problem | Implementation |
| --- | --- | --- |
| P0 | Reader fails to initialize | Repaired malformed JavaScript strings/selectors. |
| P0 | Large text requires repeated adjustment | Default 24 px; saved 18–48 px size; meanings scale with verses; font buttons have accessible labels and disabled end states. Browser zoom remains enabled. |
| P0 | Scrolling accidentally marks a verse | Dedicated read/unread buttons with announced pressed state; tapping the text no longer changes progress. |
| P0 | Long texts are hard to navigate | Individual Lalitha verses, verse selector, resume at the first unread entry, focus moved to the destination. |
| P0 | Readers cannot judge completeness | Source/review panel in every reader; explicit missing-section scope; cloud overrides are identified separately. |
| P1 | Finding stotrams takes too much scrolling | Visible home search and category links, more compact mobile cards, weekday suggestions wrap instead of hiding horizontally. |
| P1 | Small controls and low contrast | At least 48 px primary reader controls, visible keyboard focus, stronger card descriptions, keyboard activation of existing cards/toggles. |
| P1 | Decorative movement distracts | Respect reduced-motion preferences; disable decorative animation and smooth verse scrolling for those readers. |
| P1 | “Today” becomes stale in an open tab | Refresh after the local date changes and when returning to the tab. |

## Proposed next work, in order

1. **Test with 3–5 older Telugu readers.** Ask each person to find a stotram, enlarge it, leave and resume, and switch to another text. Record wrong taps, time to first verse and whether the controls need explanation.
2. **Persistent reading toolbar after visual QA.** A compact Home / Text size / Verse toolbar can help on long readings. Test mobile browser chrome, landscape, the virtual keyboard and focus visibility before making it sticky.
3. **Bookmarks and shareable stotram links.** Give each stotram its own stable URL, preserve browser Back behavior, and provide a short Telugu explanation of saving the site to the phone's home screen. Current changes do not implement a PWA or offline caching.
4. **Favorites and a calm light theme.** Show favorites under today's suggestions; keep cream, dark ink and one gold accent as a second theme. Verify contrast in both themes and test Telugu glyph readability with users.
5. **Offline reading.** Cache a versioned, reviewed content set with an update notice. Avoid silently keeping known-incomplete old texts. Check cache size and connectivity failures before claiming offline support.
6. **Meanings later.** Review verse-to-meaning alignment, cite translator/edition, distinguish literal meanings from devotional explanations, and allow independent collapse without losing the reading position.

## Acceptance targets

- No horizontal reading scroll or clipped Telugu at 320 CSS px. W3C [Reflow](https://www.w3.org/WAI/WCAG21/Understanding/reflow.html).
- Text can be increased to 200% without losing content or controls. W3C [Resize Text](https://www.w3.org/WAI/WCAG21/Understanding/resize-text).
- Every reading action works with keyboard and visible focus; controls have meaningful Telugu labels.
- A reader can reach search or a category without traversing every decorative card.
- Page titles, source edition, review status and excluded sections are explicit.
- Stored font preference and progress work without sign-in; unavailable storage does not block reading.

The code implements the first table. Visual acceptance remains pending because browser startup was unavailable in this environment.
