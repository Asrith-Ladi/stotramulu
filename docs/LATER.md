# Stotramulu — the "later" list

Everything that was postponed or suggested during the 2026 overhaul is kept here, to pick up **after the live-site testing of the current version is complete**. Each item says what it is, why it would help, what it costs, and what to watch out for. Nothing here is urgent. Items marked "recommended" are the ones worth doing first.

When you are ready to work on one, ask for it by its number (for example "do LATER 1").

---

## A. Safety and security

### 1. Harden the OCR worker (recommended)
**What.** Four extra safety steps for `/api/ocr`, the Cloudflare Worker that reads stotram photos with Gemini:
- tie its sign-in check to this Firebase project;
- send the Gemini key in a request header rather than in the web address;
- store the admin UID and the Gemini model name in the Worker's settings, so a deploy cannot silently reset them;
- add tests that prove an outsider is refused.

**Why.** The worker is not open to misuse today: it already refuses anyone who is not signed in as the admin. These steps remove the remaining "what if" cases. For example, if a different Firebase key were ever configured, sign-ins from another project could be accepted. Also, a plain dashboard variable (such as `GEMINI_MODEL`) is wiped by the next deploy, and the code then quietly falls back to its built-in value.

**Cost / effort.** Free; a small change in `src/` plus tests.

### 2. Restrict the Firebase web key
**What.** In the Google Cloud console (project `stotramulu-eddf4` → APIs & Services → Credentials), limit the browser key to the three Firebase services the site uses (Identity Toolkit, Token Service, Cloud Firestore), and to the site's web addresses.

**Why.** The key is meant to be public. Restricting it stops anyone from using it with other Google services enabled in the project.

**Watch out.** The OCR worker also uses this key from Cloudflare, which sends no website address. Restrict by **API** first. Add the **website** restriction only after item 1 (the worker can then check sign-ins without the key), or OCR sign-in stops working.

**Cost / effort.** Free; a few minutes in the console.

### 3. `.gitignore` guard for browser profiles
**What.** Add `.edge-review-*/`, `.chrome-profile*/` and `*-user-data/` to `.gitignore`.

**Why.** A test browser's profile once ended up inside the project folder, with personal data in it. This makes git refuse to pick one up again.

**Cost / effort.** Free; one minute.

### 4. Firebase App Check (only if needed)
**What.** Makes Firebase accept requests only from your real site, using Google's reCAPTCHA in the background.

**Why.** Anyone can start a conversation and attach files. That is the point of the form, but a script could fill the free 1 GiB of storage. App Check is the remedy **if that ever happens**.

**Watch out.** Turn it on in **monitor** mode first. Enforcing it too early can block older phones from the whole site.

**Cost / effort.** Free; needs a reCAPTCHA key and a small code change (steps in [ARCHITECTURE.md](ARCHITECTURE.md), "Authorization boundaries").

### 5. Confirm the old Firebase project is gone
**What.** Check in the Google Cloud console that the old project `stotram-b713f` is deleted, or at least shut down.

**Why.** Its old web key is in the public git history.

**Cost / effort.** Free; a minute.

### 5a. Never mix old and new script files after a deploy — done (Phase 29)
Every script now carries a version stamp, and a page left open across a deploy reloads itself when nothing would be lost. See the [owner's guide](OWNER-GUIDE.md), Part 1, section 11.

### 5b. Let phones keep unchanged files (faster opening)
**What.** Tell browsers they may keep the stamped script files (and the fonts and styles, whose names already change with their contents) for a year, without asking the server again. This is done with a `_headers` file in `public/`.

**Why.** Today a phone asks the server about every one of the page's roughly 50 files each time the site opens, even when nothing changed. The answers are tiny, but on a slow connection the round trips add up. Since the version stamps (5a), a changed file always gets a new address, so keeping files longer is safe.

**Watch out.** It must cover only files whose address changes when their contents change. The icon sprite (`icons.svg`) and `/version.json` must keep being checked every time, or icons and the version check would go stale.

**Cost / effort.** Free; a small file plus a test.

---

## B. For readers

### 6. A recording link for songs and stotrams
**What.** An optional "listen" link on a stotram, for example to a YouTube recording, entered in the dashboard.

**Why.** Songs and bhajans are easier to learn by ear. Storing audio files ourselves would need a paid storage service, but a link costs nothing.

**Cost / effort.** Free; a small change in the editor and the reader.

### 7. Automatic email when you reply
**What.** When you reply in the dashboard, the reader gets a short email automatically, instead of you pressing the "Let them know" button.

**Why.** Saves a tap per reply when replies become frequent.

**Cost / effort.** Free through Resend (about 3,000 emails a month, the service already used for DSA Tracker). It needs the sending domain verified in Resend, a Resend key stored as a Cloudflare Secret, and a small Worker endpoint. Automatic SMS or WhatsApp is **not** free: it needs DLT or Meta business registration and is charged per message.

### 8. Push notifications
**What.** A phone notification when a reply arrives.

**Watch out.** The notifications themselves are free (Firebase Cloud Messaging). But on iPhones they only work after the site is added to the Home Screen, and the permission pop-up confuses many older readers. Worth it only if many readers ask.

### 9. Pārāyaṇa counts on the calendar
**What.** Show on the Track calendar how many times each stotram was read on a day.

**Why.** It was left out of the redesign to keep the calendar simple. Readers already record the counts; this would only display them.

**Cost / effort.** Free; a medium change in the Track page.

### 10. Android Back button closes the picture viewer
**What.** Today, pressing the phone's Back button while a picture is open in the full-screen viewer leaves the page instead of closing the picture.

**Cost / effort.** Free; a small polish.

---

## C. For you in the dashboard

### 11. Longer replies
**What.** Replies are limited to 2,000 characters, while readers may write 5,000. Raise yours to match if you ever need it.

### 12. Try a different OCR model
**What.** Compare Gemini models on your own photos for Telugu accuracy. The model name is a Worker setting (`GEMINI_MODEL`). Store it as described in item 1, so a deploy does not reset it.

---

## D. Content and checking

### 13. Meaning review
**What.** The meanings shown under some stotrams are marked "reference-added, review pending". A scholar's review would let them be marked verified. This is listed in [CONTENT-AUDIT.md](CONTENT-AUDIT.md).

### 14. A check on real phones
**What.** Open the site on one older Android phone and one iPhone, and go through reading, Japamala, Track, sending a message with a screenshot, and replying. The automatic tests run in desktop Chrome, sized like a phone; a real device can still surprise.

---

## E. Looked at and not recommended

- **Phone-number (OTP) sign-in.** It needs the paid Firebase plan and a card on file, and every OTP text is charged. Bots can trigger thousands of paid texts. Delivery in India is unreliable. Recycled numbers can let a stranger into an old account. Google sign-in covers your readers for free.
- **Firebase Storage for attachments.** It needs the paid plan. Attachments are kept in Firestore instead, within the free limits.
- **Automatic SMS or WhatsApp messages.** Paid per message, plus registration (DLT or Meta business). The "Let them know" buttons do the same job from your own phone for free.
