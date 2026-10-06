# Stotramulu — what we built, and how to run it

This guide is for the owner of the site (and anyone who helps run it later). It records everything that was done in the September–October 2026 overhaul, in plain words, and then explains how to do the everyday jobs. The developer-level details live in [ARCHITECTURE.md](ARCHITECTURE.md), the phase log in [PHASES.md](PHASES.md) (Phases 25–27), and the exact screen and data contracts in [redesign-research/contract.md](redesign-research/contract.md) and [conversations-contract.md](conversations-contract.md).

---

## Part 1 — What we did

### 1. A proper build and a clean deploy (Phase 25)
The site was a folder of files copied to the host. It now has a real build step (Vite) and deploys as one Cloudflare Workers project. The reading site is still plain HTML and JavaScript, so nothing about how a prayer is read changed underneath; the build only bundles the styles and fonts and copies everything else as it is.

- Cloudflare builds the site from GitHub with the build command `npm install && npm run build` and the deploy command `npx wrangler deploy -c dist/stotramulu/wrangler.json`.
- The Telugu fonts are now part of the site itself, instead of being loaded from Google Fonts. Pages look the same on every phone, and work even when Google Fonts is slow.
- Old duplicate copies and abandoned experiments were removed, and the Firebase settings that had been copied into three files now live in one, `public/assets/site-config.js`.

### 2. A real admin dashboard (Phase 25)
The floating "+" button and pop-up on the reading site were replaced by a separate page, **`/admin.html`**. Ordinary readers no longer download any admin code. The dashboard has tabs for stotras (add, edit, delete, undo edits to built-in ones, add from a photo with OCR), reader messages, "What's new" entries, the weekday list, and a backup export.

### 3. A complete new look: "Kanchi silk" (Phase 26)
The first pass had only tidied the code, and you rightly asked for the interface itself to be redesigned. So the whole look was rebuilt from scratch:

- **Colours** taken from a Kanchipuram silk saree: peacock teal, zari gold, a touch of kumkum red, on ivory paper.
- **Phones first.** Four big tabs at the bottom of the screen (ముఖపుట, స్తోత్రాలు, ఇష్టమైనవి, నా సాధన). On a computer they move into the header; on a phone held sideways they become a slim row under the header.
- **Large, clear text and buttons** for older readers: body text 17–18 px, nothing smaller than 14 px, every button at least 44 px tall.
- **Calm motion** that switches off completely for people who ask their phone for reduced motion.
- **ⓘ buttons** beside each feature that explain it in simple Telugu.
- **What's new.** A bell in the header shows new features and fixes, with a red dot until they have been read. You add entries from the dashboard.
- **An account hub.** The account button now opens one place for signing in, sending a message, "నా సందేశాలు", What's new and backups.
- Several old bugs were fixed along the way. For example, the day-sheet japa buttons had been broken by a name clash, and the Space key could count a bead while you were typing.

### 4. Accessibility and safety reviews (Phase 26)
Independent reviews checked the new interface for older readers, keyboard and screen-reader use, and security, and every confirmed problem was fixed. Among them:
- a stronger focus ring (the old gold one was too faint to see);
- keyboard focus kept inside open sheets;
- dangerous questions such as "reset to 0" start on "Cancel";
- the reader toolbar scrolls away on short phones so more of the prayer is visible;
- short weekday names on very small phones;
- restoring a backup no longer loses the Japamala count;
- text that comes from the cloud is always made safe before it is shown.

### 5. Cloud backup that is safe on shared phones (Phase 26)
Many families share one phone. Before this work, if one person signed out and another signed in, the first person's counts could quietly merge into the second person's account. Now:
- a different account must answer a clear question before anything is merged;
- saying "no" keeps the first person's entries aside on the phone, and they return when that person signs in again;
- signing out first sends any change that had not been saved to the cloud yet;
- a failed sync is retried automatically.

### 6. Security check of the admin UID and the keys
You asked whether the admin UID in the code was a leak. It is not. The UID is a name tag, not a password: every protected action checks the sign-in that Google itself confirms, so knowing the UID gives nobody any power. A UID also cannot be "regenerated". A security review with a red-team attempt confirmed this.
- The **Gemini key** (for OCR) has never been in the code or its history. It lives only as a Cloudflare Secret.
- The review did find something unrelated and serious: a Microsoft Edge browser profile containing personal data had ended up inside the project's git storage on the Windows machine. It was never on GitHub. It was permanently removed from the Mac copy; the Windows and Google Drive copies were left for you to clean (see Part 4).

### 7. Firestore rules (Phases 26–27)
The Firestore rules are the real lock on the data. They now:
- let anyone read stotras, the weekday list and What's new, but only the admin change them;
- let each reader read and write only their own backup;
- let anyone start a conversation (with strict checks on every field);
- let each reader read only their own conversations;
- let only the admin write status changes and team replies;
- cover the conversation, claim and attachment rules described below.

The rules file is [firestore.rules.proposed](firestore.rules.proposed). It is checked by `npm run rules:check` (195 checks) and ends with the tests to run on the live site.

### 8. Conversations, attachments and "let them know" buttons (Phase 27)
- **Conversations.** A report is now a conversation. The reader and the team can keep writing back and forth until the problem is solved. "నా సందేశాలు" shows each report as a chat: the reader's messages ("మీరు") on one side, the team's ("స్తోత్రములు బృందం") on the other, with unread replies marked. Replies written before this change still appear.
- **Signing in.** The first message can be sent without signing in. To continue the conversation the reader signs in with Google. A message sent without signing in carries a secret key that only that phone holds, so when the reader signs in on the same phone, the message joins their account automatically.
- **Attachments.** Readers and the team can attach up to 3 screenshots or small PDFs to a message. Pictures are shrunk on the phone before they are sent (to at most 800 KB, with hidden location data removed). Only that reader and the team can open them, and a picture opens full screen. They are stored inside the conversation in Firestore; Firebase Storage was not used, because it needs the paid plan.
- **Letting a reader know you replied.** There is no email or SMS service, so there is nothing to set up and nothing to pay. In the dashboard, the **"తెలియజేయండి / Let them know"** buttons open *your own* Email, WhatsApp or SMS app with the reader's address or number and a ready-made message. For readers who were not signed in, that message includes your reply, because they cannot see it on the site. No DLT registration is needed, because the message comes from your own phone.
- **Safe on bad connections and shared phones.**
  - a slow message is never posted twice;
  - failed attachments can be retried without a duplicate;
  - a message waiting to be sent always goes out as the account that wrote it;
  - another person's messages are never linked to, or shown to, someone else on a shared phone.

### 9. Tests that protect all of this
Everything above is covered by checks you can run on your computer (see "Checking the site before a deploy" in Part 2). The browser tests drive the real pages in Chrome. Because the real Firebase cannot be reached from the test machine, the conversation tests use `tools/fake-firebase.js`, a stand-in that also mirrors the most important rules.

### 10. Verse names in the editor (Phase 28)
In the dashboard's editor you can now name a verse by writing the name in square brackets on its first line, for example `[పల్లవి]`, `[చరణం 1]` or `[ఫలశ్రుతి]`. The other verses are numbered 1, 2, 3 in order. A line with only `~` keeps a blank line inside one verse. Opening an existing stotram shows its names and two-part verses the same way. This also fixed an older problem: adding or removing a verse used to turn names like ధ్యానం or "31-40" into plain numbers, and editing any of 19 built-in stotras split their two-part verses apart. All 32 built-in stotras are now checked to open and save unchanged. How to use it is in Part 2, "Adding a stotram".

### 11. No old pages after a deploy (Phase 29)
After the Phase 27 deploy, a phone briefly showed buttons that did nothing until the page was refreshed. The likely cause: the site was already open on that phone, or Android brought it back from memory, so it was still running the code from before the deploy. Readers do not know they should refresh, so the site now does it for them, carefully:
- **The page notices a new version.** Every build gets an id, which is written into the page and into a small file, `/version.json`. When a reader comes back to the site's tab (and once just after it opens), the page compares the two, at most once every 5 minutes. If they differ, a newer version is live.
- **It reloads only when nothing would be lost.** That means on the Home screen, with no sheet or dialog open, nothing typed in a box, and no message or screenshot still sending. While someone is reading a stotram, counting the mala or on Track, it waits until they are back on Home, or until they leave the tab. It reloads at most once for each new version, so it can never get stuck reloading.
- **Every script has a version stamp.** Each script address now ends with a short code made from the file's contents, like `feedback.js?v=3fa2c1d0`. A phone then never mixes an old copy of one file with new copies of the others, and files that did not change stay in the phone's cache.
- **You can see which version a phone runs.** At the very bottom of the account sheet (the person icon), under the site's name, it says for example "వెర్షన్: 6 అక్టోబర్ 2026, 11:52". That is the date and time the version was built.

Pages that were already open before this deploy do not have the check yet. It protects every deploy after this one.

---

## Part 2 — How to do things

### Deploying a change
1. Copy the project to your GitHub repository, leaving out `node_modules/`, `dist/`, `.wrangler/`, `docs/ui-reviews/current/` and `package-lock.json`.
2. Push. Cloudflare builds and deploys on its own.
3. Open the site on your phone, tap the person icon, and scroll to the bottom of the sheet. The "వెర్షన్" line should show the date and time of this deploy. If it still shows an older time, close the tab and open the site again.

If a change also touches the Firestore rules, **paste the rules first and deploy second** (next section).

### Changing the Firestore rules
1. Open the Firebase console → project `stotramulu-eddf4` → Firestore Database → **Rules**.
2. Copy the rules that are live now into a text file, so you can put them back if anything misbehaves.
3. Paste the **whole** of `docs/firestore.rules.proposed`. The pasted text must include the line `rules_version = '2';`; without it, Firebase rejects the rules with a "version 1" error.
4. Press **Publish**.
5. Run the checks at the bottom of the rules file. The most important one: send a test message from the live site and confirm it appears in the dashboard. A message the rules refuse is dropped without any error, so this test is the only way to be sure.

### Answering a reader
1. Open `/admin.html` and sign in with the admin Google account.
2. Go to **అభిప్రాయాలు / Feedback**. The **మీ జవాబు కోసం / Waiting** filter shows every conversation where the reader wrote last; the red number on the tab counts them.
3. Open **సంభాషణ / Conversation**, read the thread, write your reply, and attach a picture or PDF if it helps. Then press **జవాబు పంపండి / Send reply**.
4. Use the status buttons (New, In progress, Answered, Closed) to keep track.
5. If the reader left a phone number or email, or signed in with Google, press a **Let them know** button. It opens your WhatsApp, SMS or email with the message ready; press send there.
6. **Delete** removes the whole conversation with all its messages and attachments.

### Adding a stotram (or a song, a slokam, anything new)
You can already add new content **and new kinds of content** without touching code. A new kind of content is simply a new category, and the site gives each category its own section.

1. In the dashboard open **స్తోత్రాలు**, and add a new one.
2. Fill in the title, subtitle, a short description, the origin note if any, and choose a theme (the theme picks the deity artwork and colour).
3. **Category:**
   - pick an existing one (సహస్రనామావళి, అష్టోత్తర శతనామావళి, స్తోత్రములు, హారతులు);
   - **or** choose **"＋ కొత్త విభాగం…"** and type a new name, for example **భక్తి పాటలు** for songs or **శ్లోకాలు** for single slokams. The first stotram you save with that name creates the category.
4. Paste the text with **one blank line between verses**. Each block becomes one verse card. You can also attach a photo of the page and let OCR fill the text in; then proofread it against the photo, because it is scripture.
   - **Naming a verse.** To give a verse a name instead of a number (పల్లవి, చరణం 1, ధ్యానం, ఫలశ్రుతి, 31-40…), start it with the name in square brackets on a line of its own. The other verses are numbered 1, 2, 3… in order. For example:
     ```
     [పల్లవి]
     శ్రీ రామ జయ రామ జయ జయ రామ

     మొదటి చరణం…

     రెండో చరణం…
     ```
     This saves as **పల్లవి, 1, 2**. The counter above the box confirms it, for example "3 శ్లోకాలు · 1 లేబుల్ (పల్లవి)", so a mistyped label shows at once.
   - **A blank line inside one verse.** A blank line always starts the next verse. If one verse needs two parts with a gap between them, put a line with only `~` where the gap goes:
     ```
     [సమర్పణం]
     మొదటి భాగం
     ~
     రెండో భాగం
     ```
   - **Editing an existing stotram** shows its names and two-part verses this same way, so you can fix a word, add a verse or remove one, and every label stays as it was. This was checked for all 32 built-in stotras.
5. Save with **ప్రచురించు / Publish** ticked (leave it unticked to keep a draft).

What readers then see: a new section under **స్తోత్రాలు** with that name, a new filter chip ("భక్తి పాటలు 1") next to the built-in ones, and the new item in search. This was checked in the browser for this guide: a test "భక్తి పాటలు" category appeared as its own section and chip, and the song opened in the reader with its పల్లవి label.

One limit is worth knowing for songs: **audio.** Songs cannot carry sound recordings. Firestore records hold at most about 1 MB, and storing audio properly needs a paid storage service. A link to a YouTube recording would be the free option (it is on the [Later list](LATER.md)).

### Adding a "What's new" entry
In the dashboard open **కొత్తవి**, add an entry (date, tag: new / improved / fixed, title, short text), and publish it. It appears under the bell with a red dot for everyone who has not read it yet.

### Checking the site before a deploy
Run these on your Mac, in the project folder:
```
npm run verify
npm run rules:check
npm run e2e
npm run shots
```
- `verify` checks the data, the scripts and the styles.
- `rules:check` tests the Firestore rules.
- `e2e` walks the whole site, the conversation features and the version check, in Chrome.
- `shots` saves screenshots of every screen to `docs/ui-reviews/current/`, so you can look them over.

---

## Part 3 — What it costs

Everything runs on free plans, with no card on file.
- **Cloudflare Workers** hosts the site and the OCR worker.
- **Firebase (Spark plan)** provides Google sign-in and the Firestore database. Its free limits are about 1 GiB of stored data, 50,000 reads and 20,000 writes a day. A screenshot takes about 100–300 KB, so roughly 3,000–4,000 screenshots fit, and a conversation message costs one write.
- **Gemini** is used only for OCR, through the key stored in Cloudflare.
- **Reply notices** go through your own WhatsApp, SMS or email apps, at no cost.

Ideas that were looked at and **not** used, because they need a card or cost money: Firebase Storage, phone-number (OTP) sign-in, automatic SMS or WhatsApp messages (these also need DLT or Meta business registration), and Firebase's own email add-on. Automatic email through Resend would be free (about 3,000 emails a month) and can be added later if replies become frequent.

---

## Part 4 — What is still open

**Yours to do**
1. **Run the live-site tests** at the bottom of `docs/firestore.rules.proposed`. Especially:
   - send a message with a screenshot while signed out;
   - sign in on the same phone and check it appears in "నా సందేశాలు";
   - reply from the dashboard with a picture;
   - try a Let them know button.
2. **Clean up the old browser profile on Windows.**
   1. Pause Google Drive sync.
   2. Delete `G:\My Drive\testing_git\stotramulu\.edge-review-correction` and `.edge-review-correction2`.
   3. In that project folder run `git reflog expire --expire=now --expire-unreachable=now --all`, then `git gc --prune=now`.
   4. Resume sync, then empty the Google Drive Trash.
   5. Delete any zip or copy you used to move the project.
3. **Turn on 2-step verification** for the admin Google account. That account is the real key to the dashboard.
4. In the Google Cloud console, **confirm the old Firebase project `stotram-b713f` is deleted**. Its old web key is in the public git history.

**Postponed, and ideas for later**

Everything postponed or suggested is kept in one list, **[LATER.md](LATER.md)**, to pick up once the live-site testing of the current version is complete. Each item there says what it is, why it would help, what it costs, and what to watch out for.

---

## Troubleshooting

**"Error saving rules … version [1]" in the Firebase console.** The paste is missing the line `rules_version = '2';`. Add it as the first line, or copy the file again starting at that line.

**A message sent from the site does not appear in the dashboard.** The rules are probably still the old ones, or were pasted incompletely. Check the Rules tab, paste the whole file again and publish, then send another test message.

**"My messages" shows only this phone's messages and no replies.** The reader is not signed in, or the new rules are not published yet. Signing in on the same phone links messages that were sent without signing in.

**A reader says the reply never arrived.** Readers who were not signed in cannot see replies on the site. Use the Let them know buttons, which include your reply in the message.

**The site still looks old after a deploy.** Check the "వెర్షన్" line at the bottom of the account sheet. Cloudflare takes a minute or two to build after you push, so an older time right after pushing is normal. If it is still old after that, close the tab and open the site again. A page reloads itself only when it is safe (see Part 1, section 11), so someone in the middle of reading keeps the old version until they go back to Home.

**A button does nothing right after a deploy.** That page is most likely still running the old version. Going back to Home, or leaving the tab and coming back, lets it reload itself; refreshing the page works too.

**OCR says "GEMINI_API_KEY secret is not set".** In Cloudflare, open Workers & Pages → stotramulu → Settings → Variables and Secrets, and add `GEMINI_API_KEY` as a **Secret**, not as a plain variable.
