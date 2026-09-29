# DSA Tracker: feedback, notifications and changelog UX patterns (for re-creating in plain HTML)

Everything below comes from reading the source (read-only, nothing was edited). Quoted strings are the exact copy used in the app.

Source files:
- `/Users/LA40057633/Project/l/DSA_Tracker/frontend/src/components/FeedbackButton.tsx`
- `/Users/LA40057633/Project/l/DSA_Tracker/frontend/src/components/Modal.tsx`
- `/Users/LA40057633/Project/l/DSA_Tracker/frontend/src/pages/SettingsFeedback.tsx`
- `/Users/LA40057633/Project/l/DSA_Tracker/frontend/src/pages/Settings.tsx` (`FeedbackShortcut`, around line 1002)
- `/Users/LA40057633/Project/l/DSA_Tracker/frontend/src/pages/admin/Feedback.tsx`
- `/Users/LA40057633/Project/l/DSA_Tracker/frontend/src/components/NotificationBell.tsx`
- `/Users/LA40057633/Project/l/DSA_Tracker/frontend/src/pages/Notifications.tsx`
- `/Users/LA40057633/Project/l/DSA_Tracker/frontend/src/hooks/useNotifications.ts`, `/Users/LA40057633/Project/l/DSA_Tracker/frontend/src/hooks/useFeedback.ts`
- `/Users/LA40057633/Project/l/DSA_Tracker/frontend/src/api/feedback.ts`, `/Users/LA40057633/Project/l/DSA_Tracker/frontend/src/api/notifications.ts`, `/Users/LA40057633/Project/l/DSA_Tracker/frontend/src/api/admin.ts` (lines 313–413)
- `/Users/LA40057633/Project/l/DSA_Tracker/frontend/src/pages/docs/Changelog.tsx`, `/Users/LA40057633/Project/l/DSA_Tracker/frontend/src/content/changelog.ts`
- `/Users/LA40057633/Project/l/DSA_Tracker/frontend/src/lib/formatRelativeTime.ts`
- Backend, checked only for status and limit rules: `/Users/LA40057633/Project/l/DSA_Tracker/backend/app/routers/feedback.py`, `/Users/LA40057633/Project/l/DSA_Tracker/backend/app/routers/admin.py`, `/Users/LA40057633/Project/l/DSA_Tracker/backend/app/routers/telegram_webhook.py`, `/Users/LA40057633/Project/l/DSA_Tracker/backend/app/models/feedback.py`

---

## 1. Where you send feedback from (floating button)

- **What it is:** a round button that floats over every page. It is mounted in `layout/Layout.tsx` and `layout/AdminLayout.tsx`, so it appears on all signed-in pages.
- **Position:** fixed near the bottom-right corner.
  - Mobile: `bottom-20` (80px up, so it sits above the bottom nav) and `right-4`.
  - Desktop (md and up): `bottom-6` and `right-6`.
  - `z-40`.
- **Look:**
  - A 48×48px circle (`w-12 h-12 rounded-full`) filled with the accent gradient (`from-accent to-accent-end`) and white text.
  - It has a coloured shadow (`shadow-lg shadow-accent/30`).
  - On hover it grows to `scale-105` and the shadow deepens to `shadow-accent/50`.
- **Icon:** a speech bubble (lucide `MessageSquare`), 20px.
- **No text label**, only `aria-label="Send us a message"`.
- **Second entry point:** Settings has a shortcut card:
  - Title: **"My messages"**
  - Subtitle: "View bug reports, feature requests, questions, and replies from our team."
  - Chat icon on a gradient tile, with a right arrow that turns accent-coloured on hover.
  - It links to `/settings/feedback`.

## 2. The feedback form (modal)

**How the modal behaves (`Modal.tsx`):**
- Backdrop: `bg-black/70 backdrop-blur-md`, fading in over 180ms (`modalFade`).
- Card: `rounded-2xl`, "pops" in over 220ms with `cubic-bezier(0.22,1,0.36,1)`, and has a **2px gradient hairline across the top**.
- Header holds the title, a one-line description and an X close button.
- Closes on Esc or a backdrop click. Page scroll is locked while it is open.
- Size `md` = `max-w-md`.

**Header copy:**
- Title: **"Send us a message"**
- Description: **"Report a bug, request a feature, or ask a question - we read every one."**

**Fields, in order:**

| Field | Control | Rules | Copy |
|---|---|---|---|
| **Type** | 3-column grid of chips, each with an icon | Default `bug` | **"Bug"** (Bug icon), **"Feature"** (Sparkles icon), **"Question"** (HelpCircle icon). Active chip: `bg-accent/10 border-accent text-accent`. Inactive: canvas background, muted text. |
| **Subject** | Text input | required, `minLength 3`, `maxLength 200` | Placeholder "Short one-liner". Live helper text: "At least 3 characters · {n} / 200" |
| **Details** | Textarea, 5 rows, not resizable | required, `minLength 10`, `maxLength 5000` | Placeholder changes with type. Bug: "What happened? What did you expect?" Feature: "What would you like the app to do?" Question: "What are you trying to figure out?" Helper: "At least 10 characters · {n} / 5000" |
| **Severity** (only shown for bugs) | 4-column segmented buttons | Default `medium` | `low`, `medium`, `high`, `blocker`, capitalised with CSS. Sent as `undefined` for non-bugs. |

**Sent automatically (the user never sees these):** `page_url` (window.location.href), `user_agent`, `app_version`. The admin sees them later as a debug block.

**Validation:**
- The submit button stays disabled until `subject.trim().length >= 3` and `body.trim().length >= 10`.
- The browser's own `required`, `minLength` and `maxLength` also apply.
- Server-side limits:
  - 5 submissions per day per user.
  - Demo accounts have their own cap: "Demo accounts are limited to {N} message submissions per day."
  - The same subject twice within 1 hour is rejected with a 409: **"You've already sent a message with the same subject in the last hour."**
- The error box (red tint, `bg-danger/10 border-danger/30`) shows the server's `detail` text. If there is none, it shows **"Could not send your message. Please try again."**

**Buttons and link:**
- A link above the buttons: **"View my past messages →"**. It goes to `/settings/feedback` and closes the modal.
- "Cancel" is a ghost button.
- **"Send message"** is the gradient primary button. While sending it reads **"Sending…"**.
- While sending, Cancel and the close action are both blocked.

**Confirmation: there is a bug here.**
- The code does render a green success box: **"Thanks - we got it."**
- But `handleSubmit` runs `reset()` (which includes `submit.reset()`) and then `setOpen(false)` straight away, so that message never actually shows. The modal just disappears.
- In the re-creation, show a real thank-you state instead, for example a checkmark and "Thanks - we got it. You'll see our reply under My messages."

**Behind the scenes:** the admin gets a Telegram message for every submission.

## 3. "My messages" page (`/settings/feedback`)

- **Header:**
  - A small back link: "← Back to settings"
  - H1: **"My messages"**
  - Subtitle: **"Every bug report, feature request, and question you've sent us, with any replies from the team."**
- **Loading:** two skeleton cards, each `h-24 rounded-xl`.
- **Error:** "Could not load your messages: {message}", falling back to "Please try again."
- **Empty state:** a centred card with a chat icon and the text **"No messages yet. Click the chat button in the bottom-right of any page to send us your first bug report or feature request."**
- **Sort order:** unanswered first (`answered_at IS NULL`), then newest first.

**Each message is a thread card** (`rounded-xl`, border, `bg-card/60`):
1. **Header row:**
   - A 36px rounded icon tile (accent gradient tint) showing the type icon.
   - The subject in bold, cut off with an ellipsis if too long.
   - The **status pill** on the right.
   - A meta line underneath: `{type} · {severity if present} · {clock icon} {relative time}`.
2. **Original message:** a small uppercase label **"You"**, then the text with line breaks kept (`whitespace-pre-wrap`).
3. **Replies thread**, oldest first:
   - **Team reply:** light accent tint (`bg-accent/5`) with a **2px accent bar on the left**. The label **"DSA Tracker team"** is bold and accent-coloured, followed by "· {time}".
   - **User reply:** plain background, muted label **"You"**.
4. **Reply box** (slightly tinted footer):
   - Collapsed, it is a text link: **"+ Add reply"**.
   - Expanded, it becomes a 3-row textarea that takes focus automatically, with placeholder **"Add more details, follow up, or say thanks…"**.
   - Buttons: "Cancel" and **"Send reply"** (send icon), which reads "Sending…" while posting.
   - Error: server detail, or **"Could not send reply. Please try again."**
   - Limit: 30 replies per day.
   - A user reply does **not** change the thread's status.

**Status pills:** 10px uppercase, letter-spaced, `rounded`, with a border.

| Status value | Label | Colour |
|---|---|---|
| `new` | **"New"** | muted grey (`bg-muted/10 border-muted/30 text-muted`) |
| `in_progress` | **"In progress"** | accent |
| `answered` | **"Answered"** plus a CheckCircle icon | success green |
| `closed` | **"Closed"** | muted grey (same colour as New) |

What each status means (from the backend docstring):
- `new`: just submitted, nothing done
- `in_progress`: admin has started looking
- `answered`: admin has replied
- `closed`: no further action, kept for audit

**Relative time format** (the same everywhere): "just now", then "{n}m ago", "{n}h ago", "{n}d ago" (under 7 days), then `toLocaleDateString()`.

**Gap:** the reply notification links to `/settings/feedback?thread={id}`, but the page ignores `?thread`. It does not scroll to or highlight that thread. Worth doing properly in the re-creation.

## 4. Admin triage (`/admin/feedback`)

**List view:**
- H1: **"Feedback triage"**
- Subtitle: "Every bug report, feature request, and question users have sent. Replies fire the same user email as Telegram replies."
- **Filter bar:**
  - **Status tabs** (segmented control) with default **Open**: **"Open"**, **"Answered"**, **"Closed"**, **"All"**. "Open" means `new` + `in_progress`.
  - **Type dropdown:** "All types", "Bug", "Feature", "Question".
  - **Search box** with a magnifier icon and placeholder **"Search subject..."** (searches the subject only).
  - A count on the right: **"{total} threads"**.
- **Table columns:** type icon · **Subject** (with the type underneath) · **User** (display name, or the part of the email before @, with the email below) · **Severity** ("-" if none) · **Status** (same pills as above) · **Replies** (count) · **Received** (relative time).
  - The whole row is clickable.
  - Page size is 50.
  - Unanswered threads sort first.
- **States:**
  - Loading: 5 skeleton rows.
  - Error: **"Could not load feedback."** with a **"Try again"** button.
  - Empty: **"No feedback matches these filters."**

**Thread detail** (replaces the list; not a separate route):
- Back link: **"← Back to feedback list"**
- **Header:**
  - Type icon tile and subject.
  - Meta line: `type - severity - full locale date-time`.
  - `Name <email>`.
  - A small monospace debug block: `page: …`, `ua: …`, `build: …`.
  - The status pill.
- **Thread:** the original message is labelled **"User"**. Replies are labelled **"You (admin)"** (accent tint and left bar) or **"User"**.
- **Composer:**
  - 4-row textarea with placeholder **"Reply to user. This fires an email to them via Resend."**
  - A status row: **"Status:"** followed by four small pill buttons: **New / In progress / Answered / Closed**. The current one is shown in its colour and disabled.
  - **"Send reply"**, which shows a spinner and "Sending..." while posting.
  - Error: **"Could not send reply."**
- **What an admin reply triggers:**
  - The status is set to `answered` automatically.
  - `answered_at` is stamped on the first reply only.
  - The user gets an email.
  - Gap: replies from the admin panel do **not** create an in-app notification. Only the Telegram reply path does.

## 5. Notification bell

**Location:** the TopBar (`layout/TopBar.tsx`). It is a ghost icon button, `p-2`, with a 20px Bell icon.

**Badge and unread count:**
- The unread count is fetched on its own (`GET /notifications/unread-count`).
- It is checked every **60 seconds**, only while the tab is visible. It is not re-checked when the window regains focus.
- Any mark-read, mark-all or delete action refreshes both the list and the count straight away.
- The badge is a red pill (`bg-danger`, white 10px semibold text) at the top-right corner of the bell (`-top-0.5 -right-0.5`), at least 16px wide and 16px tall, with a border matching the card colour so it stands out.
- It shows the number, or **"9+"** above 9, and is hidden when the count is 0.
- aria-label: **"Notifications ({n} unread)"**, or just "Notifications".

**Dropdown:**
- `w-80`, anchored to the right, `rounded-xl`, `shadow-2xl`, fading in over 150ms.
- Closes on an outside mousedown or Esc.
- **Header:** "Notifications", plus **"Mark all read"** (double-check icon, accent link) when there are unread items.
- **Body:** the latest **6** items, scrolling after `max-h-96`.
  - Loading: "Loading…"
  - Empty: bell icon, **"You're all caught up."** and **"We'll let you know when something happens."**
- **Each row:**
  - A 28px icon tile: accent-tinted if unread, muted if read.
  - The title on one line: **bold if unread**, 75% opacity if read.
  - The body, up to 2 lines.
  - The relative time at 10px.
  - If the row has a `link`, tapping it navigates, marks it read and closes the dropdown.
  - Each row also has "Mark as read" (check) and "Dismiss" (trash) buttons. **These appear only on hover** (`opacity-0 group-hover:opacity-100`), so on phones they are invisible. Make them always visible, or use swipe, in the re-creation.
- **Footer:** **"See all notifications ↗"**, linking to `/notifications`.

**Notification kinds and their icons:**
- `feedback_reply` → MailQuestion
- `backfill_done` → RefreshCcw
- `achievement` → Sparkles
- `friend_invite_accepted` → Users
- `streak_at_risk`, `nudge`, `system` → Bell

**Feedback reply notification copy:**
- Title: **"Reply on: {subject}"**
- Body: the reply text, cut to 240 characters with "…".
- Link: `/settings/feedback?thread={id}`.

**Full page (`/notifications`):**
- Header: bell icon tile, H1 "Notifications", and the subline **"{total} total · {unread} unread"**. When there are none: "Nothing here yet - we'll let you know when something happens."
- A **"Mark all read"** outline button when anything is unread.
- **Filter:** a "Filter:" label, then rounded chips: **All, Replies, Backfill, Achievements, Friends, Nudges, System**. The active chip is `bg-accent/15 border-accent/40`. There is also an **"Unread only"** checkbox.
- The list is the same row design but larger (36px icon tiles, body not cut off), up to 100 items.
- Empty with filters on: **"No notifications match this filter."**
- Data shape: `{ id, kind, title, body|null, link|null, is_read, read_at, created_at }`. The list response is `{ items, total, unread }`.

## 6. Changelog page (`/docs/changelog`)

**What it is:** release notes for the Python client package on PyPI, not a "what's new" page for app users. It is a static TS array copied by hand from `colab_helper/CHANGELOG.md`.

**Entry shape:** only three fields. There is **no title field and no tags field**.
```ts
interface ChangelogEntry { version: string; date: string | null /* YYYY-MM-DD */; changes: string[] }
```

**Layout:**
- Header: package icon tile, H1 "Python client changelog", subtitle "Release notes for the `dsa-tracker` package on PyPI.", and a "View on PyPI ↗" link.
- **Each entry is a card** (`rounded-xl p-5`):
  - Top row: a tag icon and **`v{version}`** in monospace on the left, and the **date** on the right (monospace, tabular digits; left out if null).
  - Below: a bullet list. Each bullet is a small 4px accent dot followed by one full sentence, e.g. "Support address in the package metadata is now …".
- Newest entry first.
- Footer, in muted italics: "Looking for setup guides instead? Browse the integration guides."

**What it does not do:**
- It is not linked to the bell.
- There is no "new" badge and no seen/unseen tracking.
- There is a `system` notification kind that could carry announcements, but nothing creates those notifications yet.

---

## Adapting this for older mobile users (plain HTML)

These are gaps I found, not features the app already has:

1. **Floating button:**
   - Keep the bottom-right placement and the 80px offset above any bottom bar.
   - Make it bigger (56–60px) and add a text label (e.g. a pill reading "సందేశం / Feedback"), since an icon-only chat bubble is easy to miss.
2. **Success state:** fix the invisible-success bug by showing a full thank-you screen before closing.
3. **Modal description:** it is cut to one line (`truncate`), and on a 360px screen most of it is lost. Let it wrap.
4. **Text size:** status pills and labels are 10–11px uppercase. Use at least 14px, sentence case, and pair the colour with an icon or text so it works without colour. New and Closed currently look identical.
5. **Hover-only buttons:** mark-read and dismiss are hover-only. Make them always-visible tap targets of at least 44px.
6. **Changelog → "What's new":**
   - Add the fields the current shape lacks: `title` and `tags` (e.g. New / Improved / Fixed), keeping `date` and optionally `version`.
   - Store a `lastSeenVersion` in localStorage to drive a "new" dot on the bell or header, since this site has no backend unread count.
   - Reuse the card pattern: date on the right and one sentence per bullet.
7. **Thread links:** honour `?thread=` on the "My messages" page (scroll to the thread and highlight it). The source app does not do this.
8. **Copy worth translating into Telugu and reusing:**
   - "Send us a message"
   - "Report a bug, request a feature, or ask a question - we read every one."
   - "Thanks - we got it."
   - "View my past messages →"
   - "My messages"
   - "No messages yet…"
   - "+ Add reply"
   - "Add more details, follow up, or say thanks…"
   - "You're all caught up." / "We'll let you know when something happens."
   - "Mark all read" / "See all notifications"
   - Statuses: New / In progress / Answered / Closed