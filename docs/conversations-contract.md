# Conversations, attachments and notify buttons — build contract

Frozen interface for Phase 27. Every builder reads this first. When code and this file disagree, this file wins; if something here is impossible, say so in your report instead of silently diverging.

Owner decisions (2026-09-30):
- The first message may be sent without signing in. Continuing a conversation needs Google sign-in.
- A message sent without signing in is **claimed** (linked to the account) when the reader later signs in on the same phone.
- Attachments: up to **3 per message**. Images are re-encoded on the phone (long side ≤ 1600 px, WebP, JPEG fallback) and must end up ≤ 800,000 bytes. PDFs are accepted as-is up to 800,000 bytes ("750 KB" in the copy). Nothing else is accepted. Stored in Firestore (no Firebase Storage: it needs the paid plan).
- No email/SMS service. Admin gets one-tap **Email / WhatsApp / SMS** buttons that open the admin's own apps with a prefilled message.
- $0, no card. No Cloud Functions.

Decisions made during the build (they override the sections below where they differ):
- SMS links use `sms:+<digits>?&body=` (with the '+', read as an international number by every messaging app).
- Rules: a message id must match `^m-[0-9]{10,16}-[a-z0-9]{4,10}$`; every entry of a `files` list is checked (keys id/name/type/size, name ≤ 120, id ≤ 80, one of the four types, integer size ≤ 800000); a file's `n` must be an integer; a file of a follow-up must have the same `from` as its message.
- Shared phones: every queued message carries `byUid` (the account that wrote it, or null). cloud.js sends it as that account; while another account is signed in it is held (error code 'held', kept in the queue) for up to 7 days, then sent with no account and its claim key. messages.js never claims, and never lists, another account's local copies.
- A follow-up whose commit passes the 15 s cap is kept (Firestore still sends it); the composer stays locked with the "still sending" line, so it is never posted twice. Failed attachments of a follow-up are retried to the same message.
- The admin reply limit stays 2000 characters; the dashboard's nav badge counts the conversations waiting for the team.
- Tests: tools/fake-firebase.js + tools/e2e-conversations.cjs (one file for both pages), run by `npm run e2e`.

Project rules that still apply: classic (non-module) scripts sharing globals; strict mode; no `import`/`export`; most files use **CRLF** line endings (keep them); escape every piece of user or cloud text before it reaches `innerHTML`; `app.js` must stay under 700 lines; `node tools/check-ui-contract.cjs` must pass (every class used in markup needs a CSS selector; reserved selectors and the containing-block ban in `docs/redesign-research/contract.md` still hold); Telugu-first copy for older readers, tap targets ≥ 44 px, text ≥ 14 px.

---

## 1. Data model (Firestore)

### 1.1 `feedback/{fbid}` — the conversation (existing doc, extended)
Existing fields stay as they are: `type, name, contact, message, screen, stotram, stotramTitle, lang, device, sentAt, uid, email, handled, createdAt`, plus admin-written `status`, legacy `reply`, legacy `repliedAt`.

New fields:

| field | written by | value |
|---|---|---|
| `lastAt` | create (user), follow-up (owner), reply (admin) | `serverTimestamp()` |
| `lastFrom` | same | `'user'` or `'admin'` |
| `lastAdminAt` | reply (admin) | `serverTimestamp()` |
| `claimKey` | create, **only when not signed in** | 32 lowercase hex chars |
| `files` | create, only when the first message has attachments | list (≤ 3) of `{id, name, type, size}` |
| `claimProof` | claim (reader, on sign-in) | must equal `claimKey` |

- The first message of the conversation **is the parent doc** (`message` + `files`). No migration.
- Legacy `reply`/`repliedAt` (written before Phase 27) is shown as a team message at `repliedAt`. New replies never write `reply`.
- Activity time of a conversation = `lastAt` if present, else max(`createdAt`, `repliedAt`).

### 1.2 `feedback/{fbid}/messages/{mid}` — follow-up messages (append-only)
```
{ from: 'user' | 'admin', uid: <sender uid>, text: string (0–5000),
  files: [{id, name, type, size}] (0–3, optional), createdAt: serverTimestamp() }
```
- `text` may be empty only when `files` has at least one entry.
- `mid` = `StotramFiles.newMessageId()` = `'m-' + Date.now() + '-' + 6 chars [a-z0-9]`.
- Never updated. Only the admin deletes (when deleting the conversation).

### 1.3 `feedback/{fbid}/files/{fileId}` — one attachment (create-only)
```
{ mid: 'first' | <message id>, n: 0|1|2, name: string (≤120), type: 'image/webp'|'image/jpeg'|'image/png'|'application/pdf',
  size: int (== data length), data: Bytes (≤ 800000), from: 'user'|'admin',
  createdAt: serverTimestamp(), key?: <parent claimKey, only for a not-signed-in first message> }
```
- `fileId` = `mid + '-' + n` (so `first-0`, `m-1790000000000-a1b2c3-2`).
- The file must be **declared** first: `n` < length of the `files` list on the parent (`mid == 'first'`) or on the message doc. So every message can carry at most 3 files, and each file id can be written once.
- `data` uses `firebase.firestore.Blob` (compat SDK: `firebase.firestore.Blob.fromUint8Array(u8)`, `blob.toUint8Array()`).

### 1.4 Rules (docs/firestore.rules.proposed) — required behaviour
- **Backwards compatible**: the currently deployed site writes the 14 old feedback fields only; that must keep passing. New fields are optional.
- `feedback` create: old checks + `lastAt == request.time` (if present), `lastFrom == 'user'` (if present), `claimKey` only when `uid == null` and a 32–64 char hex string, `files` a list of ≤ 3.
- `feedback` read: admin, or signed-in owner (`resource.data.uid == request.auth.uid`) — unchanged.
- `feedback` update, one of:
  - **admin triage/reply**: changed keys ⊆ `status, handled, reply, repliedAt, lastAt, lastFrom, lastAdminAt` with type/value checks (status list, `lastFrom in ['user','admin']`, timestamps are timestamps; `repliedAt`/`lastAdminAt` == request.time when changed).
  - **owner follow-up**: signed-in owner; changed keys ⊆ `lastAt, lastFrom, status, handled`; `lastAt == request.time`, `lastFrom == 'user'`, `status == 'new'`, `handled == false`.
  - **claim**: signed in; `resource.data.uid == null`; stored `claimKey` is a string ≥ 32; changed keys ⊆ `uid, email, claimProof`; new `uid == request.auth.uid`; `claimProof == resource.data.claimKey`; `email` null or the caller's token email; doc `createdAt` within 30 days.
- `feedback` delete: admin.
- `messages` read/list: admin, or owner of the parent (`get(parent).data.uid == request.auth.uid`). create: valid shape + `createdAt == request.time` + (admin with `from == 'admin'`, `uid == auth.uid`) or (parent owner with `from == 'user'`, `uid == auth.uid`). update: never. delete: admin.
- `files` read: admin or parent owner. create: valid shape (keys, `mid` pattern `^(first|m-[0-9]{10,16}-[a-z0-9]{4,10})$`, `n in [0,1,2]`, `fileId == mid + '-' + string(n)`, type list, `data is bytes`, `data.size() <= 800000`, `size == data.size()`, `createdAt == request.time`), declared (see 1.3), and one of: admin (`from == 'admin'`); parent owner (`from == 'user'`); **not-signed-in first message** (`from == 'user'`, `mid == 'first'`, parent `uid == null`, `key == parent.claimKey`, parent `createdAt > request.time - 15 min`). update: never. delete: admin.
- Keep the file's existing structure, comments and the Playground checklist style (only tests that can run in the Playground; say what must be tested on the live site).

### 1.5 Deploy order (goes in the docs)
Paste the new rules **first**, then deploy the site. New rules accept the old site's writes; old rules reject the new site's.

---

## 2. Shared helper: `public/assets/attachments.js` → `window.StotramFiles`

Classic IIFE, strict mode, no DOM work at load. Loaded on **both** pages (index.html and admin.html) after the Firebase SDK and before any script that uses it. Exports:

```
StotramFiles.LIMITS = { maxFiles: 3, maxBytes: 800000, maxSide: 1600,
                        imageTypes: ['image/webp','image/jpeg','image/png'], pdfType: 'application/pdf' }
StotramFiles.prepare(file) -> Promise<Prepared>
    Prepared = { name, type, size, bytes: Uint8Array, url: <object URL for preview> }
    Images: decode (createImageBitmap, <img> fallback), draw to canvas at long side ≤ maxSide,
    toBlob('image/webp', 0.82); if the browser returns another type use 'image/jpeg' 0.82;
    step quality / size down until ≤ maxBytes. The output never keeps EXIF. SVG/HEIC-that-can't-decode → reject.
    PDF: accept only if file.type or name says PDF AND the first bytes are "%PDF-", size ≤ maxBytes.
    Rejects with an Error that has .code ('type' | 'size' | 'decode' | 'count') and .te (Telugu message, §6).
    name: basename, control chars removed, ≤ 120 chars; images get the new extension (.webp/.jpg).
StotramFiles.newMessageId() -> 'm-<ms>-<6 [a-z0-9]>'
StotramFiles.newClaimKey()  -> 32 lowercase hex (crypto.getRandomValues)
StotramFiles.fileId(mid, n) -> mid + '-' + n
StotramFiles.meta(prepared[], mid) -> [{id, name, type, size}]
StotramFiles.upload(db, fbid, mid, prepared[], { from, key }) -> Promise<{ ok: number, failed: number }>
    Sequential set() of feedback/{fbid}/files/{mid-n} with the §1.3 shape (key only when given),
    each capped at 20 s. Never rejects.
StotramFiles.load(db, fbid, fileId) -> Promise<{ url, type, name }>   (cached; object URL)
StotramFiles.render(container, db, fbid, files[]) -> void
    Emits the thumbnail/chip markup of §5 into container; images load lazily
    (IntersectionObserver, immediate fallback); tap/Enter opens the viewer; a failed load shows
    .attach-error with "చూపించలేకపోయాం".
StotramFiles.openViewer({ url, type, name }) -> void
    Images: a full-screen dialog (creates `div.file-viewer` once, appended to <body>), focus moves
    to its close button, Escape / close button / backdrop close it, focus returns. PDFs: window.open(url, '_blank', 'noopener').
StotramFiles.createPicker({ button, input, list, onChange }) -> Picker
    Picker = { files(): Prepared[], count(): number, clear(): void, busy(): boolean }
    button click → input.click(); input change → prepare each (in order) up to maxFiles; renders
    the picked list into `list` (thumbnail or PDF chip, name, size, remove button); errors are
    shown in the list as .attach-error (role="alert"); onChange(picker) after each change.
StotramFiles.humanSize(bytes) -> '240 KB'
StotramFiles.phoneDigits(text) -> international digits or '' (10-digit Indian mobile 6–9xxxxxxxxx → '91' + it; '+91…'/'0…' handled)
StotramFiles.notifyLinks({ name, email, phone, reply, signedIn, siteUrl }) -> [{ kind: 'email'|'whatsapp'|'sms', href, label }]
    Only kinds with a usable address. Message text in §6. email → mailto:?subject=&body=, whatsapp → https://wa.me/<digits>?text=, sms → sms:+<digits>?&body=
```
Security: only `blob:` object URLs from bytes we created or fetched; never set `innerHTML` with file names unescaped; no SVG.

## 3. Reader side (index.html, messages.js, feedback.js, cloud.js)

### 3.1 Script order (index.html)
`… app.js, japamala-3d.js, japamala.js, feedback.js, … site-config.js, firebase-*-compat.js, attachments.js, cloud.js, admin.js, weekday.js, library.js, experience.js, help.js, updates.js, messages.js`
(`feedback.js` right after `japamala.js`; `attachments.js` right before `cloud.js`.)

### 3.2 `public/assets/feedback.js` (new; moved out of app.js)
The whole FEEDBACK block of app.js moves here unchanged in behaviour and names: `openFeedback, closeFeedback, resetFeedbackBox, listenInto, submitFeedback, FB_QUEUE_KEY, readFbQueue, writeFbQueue, queueFeedback, flushFeedback, withTimeout`, the `feedbackReturnFocus / feedbackCloseTimer / feedbackContext` state. They stay top-level globals (other scripts call them). app.js keeps everything else. Changes:
- `resetFeedbackBox()` also calls `window.feedbackPicker && window.feedbackPicker.clear()`.
- `submitFeedback()`:
  - payload gains `claimKey: StotramFiles.newClaimKey()` when nobody is signed in (`!(window.StotramCloud && StotramCloud.user)`); guard for StotramFiles missing.
  - **No attachments** → exactly today's path (queue → recordSentMessage → flush → thank-you).
  - **With attachments** (`window.feedbackPicker.count() > 0`): if `window.__cloudSendReport` is missing → error (§6 offline text) and stop. Else disable the send button, show "పంపుతోంది…" in `#fbError` (not as an error), `await __cloudSendReport(payload, feedbackPicker.files())`; on success recordSentMessage(payload incl. `files` meta), picker.clear(), thank-you; on failure show the returned Telugu error, re-enable, keep the form.
  - If the picker is still preparing (`busy()`), ask to wait ("చిత్రం సిద్ధమవుతోంది…").

### 3.3 `public/assets/cloud.js`
- `__cloudFeedback(payload)`: the doc also gets `lastAt: serverTimestamp()`, `lastFrom: 'user'`; `claimKey` only when not signed in and `payload.claimKey` is 32–64 hex; `files` only when `payload.files` is an array (≤ 3, each `{id,name,type,size}` cleaned).
- New `window.__cloudSendReport(payload, prepared)` → Promise<void> (rejects with `Error` whose `.te` is Telugu):
  1. `payload.files = StotramFiles.meta(prepared, 'first')`;
  2. write the parent with `__cloudFeedback(payload)` under a 15 s timeout (a `permission-denied` here means the doc already exists from an earlier try → continue);
  3. `StotramFiles.upload(db, payload.fbid, 'first', prepared, { from: 'user', key: signedIn ? undefined : payload.claimKey })`;
  4. any failed file → reject with the §6 "some files didn't send" text.

### 3.4 `public/assets/messages.js`
- `recordSentMessage(payload)` also keeps `claimKey` (if any), `files` meta (if any) and `claimed: false`.
- **Claim on sign-in** (`cloud-auth` with a user): for each local entry with a `claimKey` and `claimed !== true` → `db.collection('feedback').doc(fbid).update({ uid, email: user.email || null, claimProof: claimKey })`; success → `claimed: true`; `permission-denied`/`not-found` → `claimed: 'failed'` (stop retrying); other errors → retry next sign-in. Then refetch.
- Server normalisation adds `lastAt, lastFrom, lastAdminAt, files, claimed`.
- **Unread**: per conversation. `localStorage.stotramThreadSeen = { fbid: ISO }`. A conversation is unread when (`lastAdminAt` or legacy `repliedAt`) is later than its entry (fallback: the old global `stotramMessagesSeenAt`). Badge / header dot / summary count unread conversations. Opening a thread marks it seen.
- **List view** (`#messagesListView` wraps `#messagesIntro` + `#messagesList` + the "new message" button): each item is `article.message-item[data-fbid]` containing `button.message-open` (the whole row is the tap target) with type, status pill, first-message text (clamped to 3 lines), relative time, and a `.message-unread` dot + visually hidden "కొత్త జవాబు" when unread.
- **Thread view** (`#messagesThread`, `hidden` until opened; the list view gets `hidden` while it shows):
  - `button#threadBack` "అన్ని సందేశాలు" (chevron-left) — back to the list, focus returns to that item's `.message-open`.
  - `h3#threadTitle` (type label) + status pill + stotram name.
  - `div#threadBody` (`role="log"`, `aria-live="polite"`): bubbles in time order — the parent's first message, legacy reply, then `messages` ordered by `createdAt`. `div.bubble.bubble-user` (right, "మీరు") / `div.bubble.bubble-team` (left, "స్తోత్రములు బృందం"), each with `.bubble-text` (escaped, line breaks kept), `.bubble-files` (StotramFiles.render) and `.bubble-time`.
  - Composer `form#threadComposer` (only when signed in **and** the conversation is the reader's server doc): `label` + `textarea#threadText` (maxlength 5000), `button#threadAttachBtn` + `input#threadFiles[type=file][accept="image/*,application/pdf"][multiple][hidden]` + `div#threadAttachList`, `button#threadSend` "పంపండి", `p#threadStatus` (`role="status"`). Send: `mid = newMessageId()`; batch: create `messages/{mid}` `{from:'user', uid, text, files: meta(picked, mid), createdAt}` + update parent `{lastAt, lastFrom:'user', status:'new', handled:false}`; commit (15 s cap) → upload files (`from:'user'`) → re-render thread; errors in `#threadStatus`, text kept.
  - Not signed in, or a local-only entry: `div#threadSignin` with the §6 note and a sign-in button (`closeMessages(); openAccount()`).
  - Esc in thread view: goes back to the list (not close); Esc on the list closes the sheet (existing).
- **Feedback form picker**: on load, `window.feedbackPicker = StotramFiles.createPicker({ button: #fbAttachBtn, input: #fbFiles, list: #fbAttachList })` if StotramFiles exists; if not, hide `#fbAttach`.

### 3.5 index.html markup additions
- Feedback form, after the message field and before `#fbError`: `div.fb-attach#fbAttach` with `button#fbAttachBtn.btn.btn-quiet` (icon-attach + "స్క్రీన్‌షాట్ / PDF జోడించండి"), `input#fbFiles` (as above, hidden), `p.fb-attach-hint`, `div#fbAttachList.attach-list`.
- Privacy line gains: "జోడించిన చిత్రాలు మీకు, మా బృందానికి మాత్రమే కనిపిస్తాయి."
- Messages sheet: wrap the existing intro + list + new-message button in `div#messagesListView`; add the `#messagesThread` block of §3.4 after it. Keep `#messagesList`, `#messagesIntro`, `#messagesTitle` ids.
- New sprite symbols in `public/icons.svg`: `icon-attach`, `icon-send`, `icon-image`, `icon-file`, `icon-mail`, `icon-phone` (24×24, stroke = currentColor, stroke-width 1.8, round caps, like the others).

### 3.6 Styles
- Site: `styles/overlays.css` (bubbles, thread header, composer, attach UI, file viewer look). Positioning / z-index of `.file-viewer` goes in `styles/behavior.css` (new rules only): `position: fixed; inset: 0; z-index: var(--z-viewer)`, with a new token `--z-viewer: 960;` added to the stacking ladder in `styles/tokens.css` (above `--z-dialog` 950, below `--z-skip` 1000) — the viewer opens from any sheet and nothing opens on top of it.
- Admin: `styles/admin.css` styles the same `.attach-*` / `.file-viewer` classes in the dashboard look.

## 4. Admin side (admin.html, admin-dashboard.js, admin.css)
- admin.html: `<script src="/assets/attachments.js"></script>` after the Firebase SDK, before admin-dashboard.js.
- **List**: load = merge of `orderBy('createdAt','desc').limit(50)` and `orderBy('lastAt','desc').limit(50)` (the second may fail on old data → ignore), dedupe by id, sort by activity desc. "Load older" continues the createdAt query.
- New filter `waiting` ("మీ జవాబు కోసం / Waiting"): `lastFrom == 'user'` (or no `lastFrom` and no reply) and status ≠ closed. Keep the others. Default filter stays `open`.
- Card: as today, plus a latest-activity line; the reply `<details>` becomes **"సంభాషణ / Conversation"**: opening it loads `messages` (ordered by createdAt) and renders the same bubble order as the reader (§3.4), attachments via `StotramFiles.render`, then the composer: existing `textarea[data-reply]`, `button[data-act="attach"]` + hidden `input.ad-file-input[type=file]` + `div[data-attach-list]`, `button[data-act="reply"]`.
- **Send reply**: `mid = newMessageId()`; batch: create `messages/{mid}` `{from:'admin', uid: admin uid, text, files: meta, createdAt}` + update parent `{status:'answered', handled:true, lastAt, lastFrom:'admin', lastAdminAt}`; then upload files (`from:'admin'`). Toast as today. Legacy `reply` is never written again.
- **Notify buttons** (in the open conversation, after the composer): `div.ad-notify` with the label "తెలియజేయండి / Let them know" and one `a[data-notify="email|whatsapp|sms"]` per link from `StotramFiles.notifyLinks({ name, email: r.email || contact-if-email, phone: phoneDigits(contact), reply: latest team text, signedIn: !!r.uid, siteUrl: location.origin + '/' })`, `target="_blank" rel="noopener"` for http links. None → a hint that no contact was left.
- **Delete** conversation: delete every `files` doc and `messages` doc (admin can list both), then the parent; progress/toast; partial failure → error toast, keep the card.
- Search (`fb.q`) also matches loaded thread text.

## 5. Markup emitted by attachments.js (styled on both pages)
```
div.attach-list > div.attach-item[data-kind="image|pdf"]
    > (img.attach-thumb | span.attach-pdf > svg) , span.attach-name , span.attach-size , button.attach-remove (picker only, aria-label "తొలగించు <name>")
div.attach-error[role="alert"]
div.attach-loading
div.file-viewer[role="dialog"][aria-modal="true"][aria-label=<name>] > img.file-viewer-img + button.file-viewer-close (aria-label "మూసివేయి / Close")
```
Thumbnails are `button`s (or wrap in one) so they are keyboard-reachable; ≥ 64 px.

## 6. Copy (Telugu first)
- Attach button: "స్క్రీన్‌షాట్ / PDF జోడించండి"
- Hint: "3 వరకు. చిత్రాలు ఆటోమేటిక్‌గా చిన్నవి అవుతాయి. PDF 750 KB లోపు ఉండాలి."
- Errors: type "చిత్రం లేదా PDF మాత్రమే జోడించవచ్చు." · size "ఈ PDF చాలా పెద్దది. 750 KB లోపు ఉన్నది ఎంచుకోండి." · count "3 కంటే ఎక్కువ జోడించలేం." · decode "ఈ చిత్రం తెరవలేకపోయాం. వేరే స్క్రీన్‌షాట్ ప్రయత్నించండి." · offline "స్క్రీన్‌షాట్‌లు పంపడానికి ఇంటర్నెట్ కావాలి. కనెక్షన్ చూసి మళ్ళీ 'పంపండి' నొక్కండి." · partial "సందేశం చేరింది, కానీ కొన్ని చిత్రాలు పంపలేకపోయాం. మళ్ళీ ప్రయత్నించండి." · preparing "చిత్రం సిద్ధమవుతోంది… ఒక్క క్షణం."
- Thread: back "అన్ని సందేశాలు" · me "మీరు" · team "స్తోత్రములు బృందం" · composer label "మీ జవాబు రాయండి" · placeholder "ఇక్కడ రాయండి…" · send "పంపండి" · sending "పంపుతోంది…" · sent "పంపాం" · failed "పంపలేకపోయాం. ఇంటర్నెట్ చూసి మళ్ళీ ప్రయత్నించండి."
- Not signed in: "మీరు సైన్ ఇన్ చేయకుండా పంపారు. మా జవాబు చూడటానికి, సంభాషణ కొనసాగించడానికి ఈ ఫోన్‌లోనే Google తో సైన్ ఇన్ చేయండి."
- Notify message (signed in): "నమస్కారం {name}, స్తోత్రములు సైట్‌లో మీరు పంపిన సందేశానికి జవాబు ఇచ్చాం. {siteUrl} తెరిచి, 'నా ఖాతా' → 'నా సందేశాలు' లో చూడండి. — స్తోత్రములు బృందం"
- Notify message (not signed in): "నమస్కారం {name}, స్తోత్రములు సైట్‌లో మీరు పంపిన సందేశానికి మా జవాబు: {reply} — మరిన్ని వివరాలకు {siteUrl} లో Google తో సైన్ ఇన్ చేసి 'నా సందేశాలు' చూడండి. — స్తోత్రములు బృందం"
- Email subject: "స్తోత్రములు — మీ సందేశానికి జవాబు"
- Empty `{name}`: the message starts "నమస్కారం," with no name.

## 7. Tests (tools/)
- `tools/fake-firebase.js`: in-memory fake of the compat SDK used by `index.html`/`admin.html` (auth: `onAuthStateChanged`, `currentUser`, `signInWithPopup`, `signOut`, `getIdToken`; firestore: nested collection/doc paths, `get/set/add/update/delete`, `where('f','==',v)`, `orderBy`, `limit`, `startAfter`, `batch()`, `FieldValue.serverTimestamp()` → a Timestamp-like with `toDate()`/`seconds`, `Blob.fromUint8Array/toUint8Array`), controlled through `window.__fb` (sign in as a uid, dump docs, make the next write fail with a code).
- `tools/e2e-conversations.cjs` (headless browser, same request-interception setup as `tools/review-devotional.cjs`, serving the fake in place of the gstatic SDK): anonymous send with an image → parent has `claimKey` + `files`, a `files/first-0` Blob ≤ 800000 of an image type; PDF over the limit and a fake PDF are rejected; 4th file rejected; sign in → claim update carries `claimProof`; admin reply (written into the fake) → unread badge; thread shows bubbles in order and clears unread; reader follow-up writes the message + parent update; admin page: conversation renders, reply batch + upload, notify hrefs, delete cascades.
- `package.json`: `"e2e": "vite build && node tools/review-devotional.cjs && node tools/e2e-conversations.cjs"`.
- Keep `node tools/verify.cjs` and `node tools/check-ui-contract.cjs` green.
