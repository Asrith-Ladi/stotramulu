/* ============================================================
   MY MESSAGES (నా సందేశాలు): conversations with the team, and the
   feedback type chips.

   1. Type chips. The four .fb-type-chip buttons in the feedback form work
      as one radio group that drives the visually hidden #fbType select
      (feedback.js reads that select). A delegated click selects a chip.
      Arrow keys, Home and End move the choice, and one roving tabindex
      keeps the group a single Tab stop. window.syncFeedbackChips() redraws
      the chips from #fbType.value; openFeedback(type) calls it.

   2. What was sent. feedback.js calls window.recordSentMessage(payload)
      after queueing a message (or, with attachments, after sending it).
      We keep {fbid, type, message, stotramTitle, at, claimKey?, files?,
      claimed} in localStorage stotramMyMessages (newest first, at most 30).

   3. Claim. A message sent without signing in carries a random claimKey
      (32 hex) on its Firestore doc. When the reader signs in on this
      phone, every local entry with a claimKey that is not claimed yet is
      linked to the account:
        feedback/{fbid}.update({ uid, email, claimProof: claimKey })
      Success → claimed: true. permission-denied / not-found → 'failed'
      (never retried). Anything else (offline, timeout) → tried again at
      the next sign-in. Entries still waiting in feedbackQueue_v1 are
      skipped: they reach the server with the uid anyway. The reader's own
      docs are read first, so an entry already on the account (queued while
      signed out, sent after sign-in) is marked claimed without a write.

   4. The sheet (#messagesOverlay) has two views; only one shows.
      List (#messagesListView): the local copies merged by fbid with the
      signed-in reader's own docs, feedback.where('uid', '==', uid) with no
      orderBy, sorted here by activity (lastAt, else the later of createdAt
      and repliedAt). Each row is article.message-item[data-fbid] holding
      one button.message-open. On the server, status = status, or
      (handled ? 'closed' : 'new') when unset; a local-only row is 'queued'
      while its fbid is in feedbackQueue_v1 and 'sent' after that. If the
      read fails (offline, rules not deployed) the local list still shows.
      Thread (#messagesThread): bubbles in time order. The first message is
      the parent doc, then the legacy reply (reply / repliedAt, written
      before Phase 27), then feedback/{fbid}/messages ordered by createdAt.
      Signed in on one of the reader's server docs: #threadComposer writes
      messages/{mid} and the parent's {lastAt, lastFrom, status, handled}
      in one batch, then uploads the files (StotramFiles.upload).
      While a follow-up is on its way the composer is locked (text
      read-only, attaching and removing off), one per conversation. A
      commit past the 15 s cap is kept, not dropped: Firestore still sends
      it when the phone is back online, so no second copy is built; the
      files follow when it lands, and a new send is allowed only if it was
      refused. If some files did not arrive, the picker keeps them, and
      pressing send again with no text and the same files sends just those
      into the same message.
      Otherwise #threadSignin explains why the conversation can't go on.
      Esc in the thread goes back to the list; Esc on the list closes.

   5. Unread, per conversation. localStorage stotramThreadSeen is
      { fbid: ISO }. A conversation is unread when its team time
      (lastAdminAt, or the legacy repliedAt) is later than its mark; with
      no mark, the old global stotramMessagesSeenAt is the fallback. Marks
      are the newest team time actually shown, so server time is compared
      with server time and a phone clock that is off can't hide a reply,
      and a thread that failed to load is not marked. The unread count sets
      #messagesBadge, the account-row summary and .has-unread on the
      header's .hdr-account.

   Markup emitted: contract.md §4.15 as extended by
   docs/conversations-contract.md §3.4. Exports: window.openMessages(),
   window.closeMessages(), window.recordSentMessage(),
   window.syncFeedbackChips(), and window.feedbackPicker (the feedback
   form's StotramFiles picker; unset when attachments.js is missing).
============================================================ */
(function () {
  'use strict';

  const MINE_KEY = 'stotramMyMessages';
  const SEEN_KEY = 'stotramMessagesSeenAt';     // before Phase 27: one mark for all replies (read-only fallback now)
  const THREAD_SEEN_KEY = 'stotramThreadSeen';  // { fbid: ISO }, one mark per conversation
  const QUEUE_KEY = 'feedbackQueue_v1';         // owned by feedback.js (queueFeedback / flushFeedback)
  const MAX_MINE = 30;
  const MAX_MARKS = 200;
  const FETCH_LIMIT = 100;                      // sanity cap on reads per open
  const THREAD_LIMIT = 200;
  const FETCH_TIMEOUT_MS = 10000;
  const WRITE_TIMEOUT_MS = 15000;
  const REFRESH_GAP_MS = 60000;                 // quiet re-check when the page is shown again: at most once a minute
  const ACCOUNT_GAP_MS = 5000;                  // opening the account sheet (shows the badge): at most every 5 s
  const CLAIM_KEY_RE = /^[0-9a-f]{32,64}$/;

  const TYPES = {
    correction: { icon: 'book',    label: 'స్తోత్రంలో తప్పు' },
    problem:    { icon: 'warning', label: 'సమస్య' },
    suggestion: { icon: 'sparkle', label: 'సూచన' },
    other:      { icon: 'message', label: 'ఇతరం' }
  };
  // Each status pairs its colour (components.css) with its own icon and words.
  const STATUS = {
    new:         { icon: 'check',        label: 'స్వీకరించాం' },
    in_progress: { icon: 'search',       label: 'పరిశీలనలో' },
    answered:    { icon: 'message',      label: 'జవాబు వచ్చింది' },
    closed:      { icon: 'check-circle', label: 'ముగిసింది' },
    queued:      { icon: 'clock',        label: 'పంపుతోంది…' },
    sent:        { icon: 'upload',       label: 'పంపాం' }
  };
  const SERVER_STATUSES = ['new', 'in_progress', 'answered', 'closed'];
  const TE_MONTHS = ['జనవరి', 'ఫిబ్రవరి', 'మార్చి', 'ఏప్రిల్', 'మే', 'జూన్', 'జులై', 'ఆగస్టు', 'సెప్టెంబర్', 'అక్టోబర్', 'నవంబర్', 'డిసెంబర్'];
  const TEAM = 'స్తోత్రములు బృందం';
  const ME = 'మీరు';
  const NEW_REPLY = 'కొత్త జవాబు';
  const COPY = {
    loading: 'మీ సందేశాలు తెస్తున్నాం…',
    loadFailed: 'మిగతా సందేశాలు తేలేకపోయాం. ఇంటర్నెట్ చూసి మళ్ళీ తెరవండి.',
    signedOut: 'మీరు సైన్ ఇన్ చేయకుండా పంపారు. మా జవాబు చూడటానికి, సంభాషణ కొనసాగించడానికి ఈ ఫోన్‌లోనే Google తో సైన్ ఇన్ చేయండి.',
    notInAccount: 'ఈ సంభాషణ ఇంకా మీ ఖాతాలో కనిపించలేదు. కొద్దిసేపటి తర్వాత మళ్ళీ తెరిచి చూడండి.',
    empty: 'దయచేసి మీ జవాబు రాయండి.',
    preparing: 'చిత్రం సిద్ధమవుతోంది… ఒక్క క్షణం.',
    sending: 'పంపుతోంది…',
    stillSending: 'ఇంకా పంపుతోంది… ఇంటర్నెట్ వచ్చాక చేరుతుంది. మళ్ళీ పంపకండి.',
    sent: 'పంపాం',
    failed: 'పంపలేకపోయాం. ఇంటర్నెట్ చూసి మళ్ళీ ప్రయత్నించండి.',
    partial: 'సందేశం చేరింది, కానీ కొన్ని చిత్రాలు పంపలేకపోయాం. మళ్ళీ ప్రయత్నించండి.'
  };

  let server = new Map();       // fbid → reader's server doc (normalised), for serverUid
  let serverUid = null;
  let loading = false;
  let fetchSeq = 0;
  let lastFetchAt = 0;
  let savedOverflow = '';
  let returnTo = null;
  let introDefault = '';
  let introState = '';          // 'in' | 'out': which intro #messagesIntro shows now
  let summaryDefault = '';
  let accountLabel = '';
  let listHtml = '';            // what #messagesList holds, so an unchanged list is not rebuilt
  let listScroll = 0;           // the list's scroll position while a thread shows
  let claiming = null;          // the running claim pass, if any

  // The conversation view
  let threadId = null;          // fbid shown in #messagesThread; null while the list shows
  const threadMsgs = new Map(); // fbid → { list: [message], uid } for the signed-in reader
  let threadLoading = null;     // fbid whose messages are being fetched
  let painted = { fbid: null, server: false, keys: [] };   // bubbles now in #threadBody
  let metaHtml = '';
  let draftFbid = null;         // the conversation the composer's text and files belong to
  let threadPicker = null;
  // fbid → the follow-up on its way: { uid, mid, text, meta, picked, late }.
  // late = past the 15 s cap; Firestore still holds the write (commit).
  const sends = new Map();
  // fbid → { uid, mid, picked }: a follow-up that arrived with some files
  // missing, while the picker still holds exactly those files.
  const pendingFiles = new Map();

  /* ---------- small helpers ---------- */
  const byId = (id) => document.getElementById(id);
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
  // Escaped text with the writer's line breaks kept.
  function multiline(v) { return esc(v).replace(/\r?\n/g, '<br>'); }
  function icon(name) {
    return '<svg class="icon-inline" aria-hidden="true"><use href="/icons.svg#icon-' + name + '"/></svg>';
  }
  function focusQuietly(el) {
    if (!el || typeof el.focus !== 'function') return;
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
  }
  function isShown(el) {
    return !!(el && el !== document.body && document.contains(el) && el.getClientRects().length);
  }
  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  // Timestamp | Date | ISO string | millis → Date, or null.
  function toDate(v) {
    if (!v) return null;
    let d = null;
    if (typeof v.toDate === 'function') { try { d = v.toDate(); } catch (e) { d = null; } }
    else if (typeof v.seconds === 'number') d = new Date(v.seconds * 1000);
    else if (v instanceof Date) d = v;
    else if (typeof v === 'string' || typeof v === 'number') d = new Date(v);
    return d && !isNaN(d.getTime()) ? d : null;
  }
  const msOf = (d) => (d ? d.getTime() : 0);
  function latestOf(list) {
    let best = null;
    list.forEach((d) => { if (d && (!best || d.getTime() > best.getTime())) best = d; });
    return best;
  }
  function withTimeout(start, ms) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout')), ms);
      Promise.resolve().then(start).then(
        (v) => { clearTimeout(t); resolve(v); },
        (e) => { clearTimeout(t); reject(e); }
      );
    });
  }
  // Firestore doc data with pending server times estimated (a fake SDK may ignore the option).
  function docData(doc) {
    let d = null;
    try { d = doc.data({ serverTimestamps: 'estimate' }); } catch (e) { d = null; }
    if (!d) { try { d = doc.data(); } catch (e) { d = null; } }
    return d && typeof d === 'object' ? d : {};
  }
  function errCode(e) { return (e && (e.code || e.message)) || e; }

  // attachments.js (window.StotramFiles); null when it did not load.
  function filesApi() {
    const f = window.StotramFiles;
    return f && typeof f === 'object' ? f : null;
  }
  // [{id, name, type, size}], at most 3, from anything stored or received.
  function cleanFiles(list) {
    if (!Array.isArray(list)) return [];
    return list.filter((f) => f && typeof f === 'object' && typeof f.id === 'string' && f.id)
      .slice(0, 3)
      .map((f) => ({
        id: f.id.slice(0, 80),
        name: String(f.name == null ? '' : f.name).slice(0, 120),
        type: typeof f.type === 'string' ? f.type : '',
        size: typeof f.size === 'number' && isFinite(f.size) ? Math.max(0, Math.round(f.size)) : 0
      }));
  }
  function humanSize(n) {
    const f = filesApi();
    if (f && typeof f.humanSize === 'function') { try { return String(f.humanSize(n)); } catch (e) {} }
    return Math.max(1, Math.round((n || 0) / 1024)) + ' KB';
  }
  function newMessageId() {
    const f = filesApi();
    if (f && typeof f.newMessageId === 'function') { try { return f.newMessageId(); } catch (e) {} }
    const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return 'm-' + Date.now() + '-' + s;
  }

  /* ---------- Telugu dates ---------- */
  function teDate(d) {
    let s = '';
    try { s = d.toLocaleDateString('te-IN', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) {}
    if (!/[\u0C00-\u0C7F]/.test(s)) s = d.getDate() + ' ' + TE_MONTHS[d.getMonth()] + ' ' + d.getFullYear();
    return s.replace(/,\s*(\d{4})$/, ' $1');
  }
  // ఇప్పుడే · 5 నిమిషాల క్రితం · 2 గంటల క్రితం · 3 రోజుల క్రితం · then the date
  function relTime(d) {
    if (!d) return '';
    const min = Math.floor(Math.max(0, Date.now() - d.getTime()) / 60000);
    if (min < 1) return 'ఇప్పుడే';
    if (min < 60) return min + (min === 1 ? ' నిమిషం క్రితం' : ' నిమిషాల క్రితం');
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr + (hr === 1 ? ' గంట క్రితం' : ' గంటల క్రితం');
    const day = Math.floor(hr / 24);
    if (day < 7) return day + (day === 1 ? ' రోజు క్రితం' : ' రోజుల క్రితం');
    return teDate(d);
  }

  /* ============================================================
     1. Feedback type chips (radio group over #fbType)
  ============================================================ */
  function chipList(root) {
    return Array.prototype.slice.call((root || document).querySelectorAll('.fb-type-chip'));
  }

  function syncFeedbackChips() {
    const sel = byId('fbType');
    const value = sel ? sel.value : '';
    const chips = chipList();
    let matched = false;
    chips.forEach((chip) => {
      const on = chip.getAttribute('data-fb-type') === value;
      chip.setAttribute('aria-checked', on ? 'true' : 'false');
      chip.tabIndex = on ? 0 : -1;
      if (on) matched = true;
    });
    if (!matched && chips[0]) chips[0].tabIndex = 0;   // the group must stay reachable by Tab
  }

  function chooseChip(chip, moveFocus) {
    const sel = byId('fbType');
    const value = chip.getAttribute('data-fb-type');
    if (sel && value && sel.value !== value) {
      sel.value = value;
      try { sel.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
    }
    syncFeedbackChips();
    if (moveFocus) focusQuietly(chip);
  }

  /* ============================================================
     2. Local record of what this phone sent
  ============================================================ */
  function readMine() {
    const list = readJson(MINE_KEY);
    if (!Array.isArray(list)) return [];
    return list.filter((m) => m && typeof m === 'object' && m.fbid && typeof m.message === 'string');
  }
  function writeMine(list) {
    try { localStorage.setItem(MINE_KEY, JSON.stringify(list.slice(0, MAX_MINE))); } catch (e) {}
  }
  // Re-read before writing, so a message recorded meanwhile is not lost.
  function patchMine(fbid, patch) {
    const list = readMine();
    const entry = list.find((m) => m.fbid === fbid);
    if (!entry) return;
    Object.assign(entry, patch);
    writeMine(list);
  }
  function queuedIds() {
    const q = readJson(QUEUE_KEY);
    return new Set(Array.isArray(q) ? q.map((p) => p && p.fbid).filter(Boolean) : []);
  }

  function recordSentMessage(payload) {
    if (!payload || typeof payload !== 'object') return;
    if (payload.website) return;             // honeypot tripped: cloud.js drops it, so don't list it
    const message = String(payload.message == null ? '' : payload.message).trim();
    if (!message) return;
    const at = toDate(payload.at) || new Date();
    const entry = {
      fbid: String(payload.fbid || ('local-' + at.getTime())),
      type: hasOwn(TYPES, payload.type) ? payload.type : 'other',
      message: message,
      stotramTitle: String(payload.stotramTitle == null ? '' : payload.stotramTitle),
      at: at.toISOString()
    };
    if (typeof payload.claimKey === 'string' && CLAIM_KEY_RE.test(payload.claimKey)) entry.claimKey = payload.claimKey;
    // Who wrote it: only a message written signed out, or by the account now
    // signing in, may be claimed (a shared phone lists everyone's messages).
    if (typeof payload.byUid === 'string' && payload.byUid) entry.byUid = payload.byUid;
    const attached = cleanFiles(payload.files);
    if (attached.length) entry.files = attached;
    let list = readMine();
    const old = list.find((m) => m.fbid === entry.fbid);
    entry.claimed = old && (old.claimed === true || old.claimed === 'failed') ? old.claimed : false;
    list = list.filter((m) => m.fbid !== entry.fbid);
    list.unshift(entry);
    writeMine(list);
    if (isOpen()) { render(); renderThread(); }
  }

  /* ============================================================
     3. Server copies (signed-in reader only) and the claim
  ============================================================ */
  function cloud() {
    const c = window.StotramCloud;
    return c && c.db ? c : null;
  }
  function currentUser() {
    const c = cloud();
    if (!c) return null;
    try { return c.user || null; } catch (e) { return null; }
  }

  function normServer(id, d) {
    const raw = (d.status !== undefined && d.status !== null) ? d.status : (d.handled ? 'closed' : 'new');
    return {
      fbid: id,
      type: hasOwn(TYPES, d.type) ? d.type : 'other',
      message: typeof d.message === 'string' ? d.message : '',
      stotramTitle: typeof d.stotramTitle === 'string' ? d.stotramTitle : '',
      at: toDate(d.sentAt) || toDate(d.createdAt),
      createdAt: toDate(d.createdAt),
      status: SERVER_STATUSES.indexOf(raw) >= 0 ? raw : 'new',
      reply: typeof d.reply === 'string' ? d.reply.trim() : '',
      repliedAt: toDate(d.repliedAt),
      lastAt: toDate(d.lastAt),
      lastFrom: d.lastFrom === 'admin' || d.lastFrom === 'user' ? d.lastFrom : '',
      lastAdminAt: toDate(d.lastAdminAt),
      files: cleanFiles(d.files),
      claimed: typeof d.claimProof === 'string' && d.claimProof.length > 0
    };
  }

  // Resolves true when fresh server data was stored. Never rejects.
  function fetchServer() {
    const c = cloud();
    const u = currentUser();
    const seq = ++fetchSeq;
    if (!c || !u || !u.uid) {
      server = new Map(); serverUid = null; loading = false;
      return Promise.resolve(false);
    }
    const uid = u.uid;
    if (serverUid !== uid) server = new Map();   // never show another account's replies
    loading = true;
    return withTimeout(() => c.db.collection('feedback').where('uid', '==', uid).limit(FETCH_LIMIT).get(), FETCH_TIMEOUT_MS)
      .then((snap) => {
        if (seq !== fetchSeq) return false;
        if (snap.empty && snap.metadata && snap.metadata.fromCache) return false;   // offline: keep what we had
        const map = new Map();
        snap.forEach((doc) => map.set(doc.id, normServer(doc.id, docData(doc))));
        server = map;
        serverUid = uid;
        lastFetchAt = Date.now();
        return true;
      })
      .catch((e) => {
        // e.g. permission-denied until the new rules are deployed: local list only
        if (seq === fetchSeq) console.warn('[messages] showing messages saved on this phone only:', errCode(e));
        return false;
      })
      .then((ok) => { if (seq === fetchSeq) loading = false; return ok; });
  }

  // Link this phone's signed-out messages to the account that just signed in.
  // Resolves the number claimed. Never rejects.
  function claimLocal(user) {
    if (claiming) return claiming;
    const c = cloud();
    if (!c || !user || !user.uid) return Promise.resolve(0);
    const queued = queuedIds();
    // The reader's own docs, when they were just read for this account.
    const owned = serverUid === user.uid ? server : new Map();
    const todo = [];
    readMine().forEach((m) => {
      if (typeof m.claimKey !== 'string' || !CLAIM_KEY_RE.test(m.claimKey)) return;
      if (m.claimed === true || m.claimed === 'failed' || queued.has(m.fbid) || /^local-/.test(m.fbid)) return;
      if (typeof m.byUid === 'string' && m.byUid && m.byUid !== user.uid) return;   // another account wrote it
      // Already on this account (queued while signed out, sent after sign-in):
      // an update would be refused and mark it 'failed'. Nothing to claim.
      if (owned.has(m.fbid)) { patchMine(m.fbid, { claimed: true }); return; }
      todo.push(m);
    });
    if (!todo.length) return Promise.resolve(0);
    const stillSignedIn = () => { const u = currentUser(); return !!(u && u.uid === user.uid); };
    claiming = (async () => {
      let n = 0;
      for (const m of todo) {
        if (!stillSignedIn()) break;
        try {
          await withTimeout(() => c.db.collection('feedback').doc(m.fbid).update({
            uid: user.uid,
            email: user.email || null,
            claimProof: m.claimKey
          }), FETCH_TIMEOUT_MS);
          patchMine(m.fbid, { claimed: true });
          n++;
        } catch (e) {
          const code = e && e.code;
          // Not ours to claim (already linked, too old, wrong key) or gone: stop trying.
          if (code === 'permission-denied' || code === 'not-found') patchMine(m.fbid, { claimed: 'failed' });
          else console.warn('[messages] claim will be retried at the next sign-in:', errCode(e));
        }
      }
      return n;
    })().catch(() => 0).then((n) => { claiming = null; return n; });
    return claiming;
  }

  // A shared phone keeps everyone's local copies. Show the ones written signed
  // out, and the signed-in account's own; another account's stay hidden until
  // that account signs in here.
  function visibleMine() {
    const u = currentUser();
    const me = u && u.uid ? u.uid : null;
    return readMine().filter((m) => !(typeof m.byUid === 'string' && m.byUid) || m.byUid === me);
  }

  function mergedItems() {
    const queued = queuedIds();
    const out = new Map();
    visibleMine().forEach((m) => {
      out.set(m.fbid, {
        fbid: m.fbid,
        type: hasOwn(TYPES, m.type) ? m.type : 'other',
        message: m.message,
        stotramTitle: m.stotramTitle || '',
        at: toDate(m.at),
        createdAt: null,
        status: queued.has(m.fbid) ? 'queued' : 'sent',
        reply: '',
        repliedAt: null,
        lastAt: null,
        lastFrom: '',
        lastAdminAt: null,
        files: cleanFiles(m.files),
        claimed: m.claimed === true,
        isServer: false
      });
    });
    server.forEach((s, id) => {
      const l = out.get(id);
      out.set(id, Object.assign({}, s, {
        message: s.message || (l ? l.message : ''),
        stotramTitle: s.stotramTitle || (l ? l.stotramTitle : ''),
        at: s.at || (l ? l.at : null),
        isServer: true
      }));
    });
    // Latest activity first, so a fresh reply to an old message comes to the top.
    const items = Array.from(out.values()).filter((m) => m.message || m.reply);
    items.forEach((m) => { m.activity = m.lastAt || latestOf([m.createdAt || m.at, m.repliedAt]); });
    return items.sort((a, b) => msOf(b.activity) - msOf(a.activity));
  }
  function findItem(fbid) {
    return fbid ? (mergedItems().find((m) => m.fbid === fbid) || null) : null;
  }

  /* ============================================================
     4. Unread conversations → badge, header dot, account-row summary
  ============================================================ */
  function readSeenAt() {
    try { return toDate(localStorage.getItem(SEEN_KEY)); } catch (e) { return null; }
  }
  function readMarks() {
    const o = readJson(THREAD_SEEN_KEY);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  }
  function hasTeam(m) {
    return !!(m.reply || m.repliedAt || m.lastAdminAt || m.lastFrom === 'admin');
  }
  function isUnread(m, marks, globalSeen) {
    if (!m.isServer || !hasTeam(m)) return false;
    const mark = hasOwn(marks, m.fbid) ? toDate(marks[m.fbid]) : globalSeen;
    if (!mark) return true;
    const t = m.lastAdminAt || m.repliedAt;
    return !!t && t.getTime() > mark.getTime();
  }
  function unreadCount() {
    const marks = readMarks();
    const globalSeen = readSeenAt();
    return mergedItems().filter((m) => isUnread(m, marks, globalSeen)).length;
  }
  // t = the newest team time now on screen (server time); null → a reply
  // without any time, seen as of now.
  function markThreadSeen(fbid, t) {
    const marks = readMarks();
    const prev = toDate(marks[fbid]);
    const ms = t ? t.getTime() : Date.now();
    if (!prev || ms > prev.getTime()) {
      marks[fbid] = new Date(ms).toISOString();
      const keys = Object.keys(marks);
      if (keys.length > MAX_MARKS) {
        keys.sort((a, b) => msOf(toDate(marks[a])) - msOf(toDate(marks[b])))
          .slice(0, keys.length - MAX_MARKS)
          .forEach((k) => { delete marks[k]; });
      }
      try { localStorage.setItem(THREAD_SEEN_KEY, JSON.stringify(marks)); } catch (e) {}
    }
    updateBadge();
  }

  function updateBadge() {
    const n = unreadCount();
    const words = n === 1 ? 'కొత్త జవాబు' : 'కొత్త జవాబులు';

    const badge = byId('messagesBadge');
    if (badge) {
      const html = n ? esc(n > 9 ? '9+' : String(n)) + '<span class="visually-hidden"> ' + words + '</span>' : '';
      if (badge.innerHTML !== html) badge.innerHTML = html;
      badge.hidden = n === 0;
    }

    const acct = document.querySelector('.hdr-account');
    if (acct) {
      if (!accountLabel) accountLabel = acct.getAttribute('aria-label') || 'నా ఖాతా / Account';
      acct.classList.toggle('has-unread', n > 0);
      acct.setAttribute('aria-label', n ? accountLabel + ' — ' + n + ' ' + words : accountLabel);
    }

    const summary = byId('messagesSummary');
    if (summary) {
      if (!summaryDefault) summaryDefault = summary.textContent;
      summary.textContent = n
        ? (n === 1 ? 'మా జవాబు వచ్చింది — చూడండి' : n + ' జవాబులు వచ్చాయి — చూడండి')
        : summaryDefault;
    }
  }

  /* ============================================================
     5. The sheet: list view
  ============================================================ */
  function overlay() { return byId('messagesOverlay'); }
  function sheetEl() { const o = overlay(); return o ? o.querySelector('.sheet') : null; }
  function isOpen() { const o = overlay(); return !!(o && o.classList.contains('active')); }
  // The attachment viewer (attachments.js) opens above this sheet.
  function shownViewer() {
    return Array.prototype.find.call(document.querySelectorAll('.file-viewer'), isShown) || null;
  }
  function higherLayerOpen() {
    return !!shownViewer() ||
      !!document.querySelector('.sc-overlay:not([data-closing]), #infoOverlay.active, #feedbackOverlay.active, #daySheetOverlay.active');
  }

  function itemHtml(m, unread) {
    const t = TYPES[m.type] || TYPES.other;
    const s = STATUS[m.status] || STATUS.new;
    const meta = [relTime(m.activity), m.stotramTitle].filter(Boolean).join(' · ');
    const preview = String(m.message || m.reply).replace(/\s+/g, ' ').trim();
    return '<article class="message-item" data-fbid="' + esc(m.fbid) + '"' + (unread ? ' data-unread="true"' : '') + '>' +
        '<button type="button" class="message-open">' +
          '<span class="message-top">' +
            '<span class="message-type">' + icon(t.icon) + ' ' + esc(t.label) + '</span>' +
            (unread ? '<span class="message-unread" aria-hidden="true"></span><span class="visually-hidden">' + NEW_REPLY + '</span>' : '') +
            '<span class="status-pill" data-status="' + esc(m.status) + '">' + icon(s.icon) + ' ' + esc(s.label) + '</span>' +
          '</span>' +
          '<span class="message-text">' + esc(preview) + '</span>' +
          (meta ? '<span class="message-meta">' + icon('clock') + '<span>' + esc(meta) + '</span></span>' : '') +
          '<svg class="icon-inline message-chev" aria-hidden="true"><use href="/icons.svg#icon-chevron-right"/></svg>' +
        '</button>' +
      '</article>';
  }

  function emptyHtml() {
    return '<div class="empty-state">' +
        '<span class="empty-state-mark">' + icon('message') + '</span>' +
        '<h3>ఇంకా సందేశాలు లేవు</h3>' +
        '<p>స్తోత్రంలో తప్పు కనిపించినా, ఏదైనా పని చేయకపోయినా కింద ఉన్న బటన్ నొక్కి మాకు తెలియజేయండి. మీరు పంపినవి, మా జవాబులు ఇక్కడ కనిపిస్తాయి.</p>' +
      '</div>';
  }

  function loadingHtml() {
    return '<div class="empty-state" role="status">' +
        '<span class="empty-state-mark">' + icon('clock') + '</span>' +
        '<p>' + COPY.loading + '</p>' +
      '</div>';
  }

  // Signed in: the sheet's own line. Signed out: say that replies need Google
  // sign-in, with a button (on its own line) that opens the account sheet.
  // Rewritten only when the state changes, so a focused button keeps focus.
  function renderIntro() {
    const p = byId('messagesIntro');
    if (!p) return;
    if (!introDefault) introDefault = p.textContent;
    const state = currentUser() ? 'in' : 'out';
    if (state === introState) return;
    introState = state;
    if (state === 'in') { p.textContent = introDefault; return; }
    p.innerHTML =
      'మీరు ఈ ఫోన్ నుంచి పంపినవి ఇక్కడ కనిపిస్తాయి. మా జవాబులు చూడాలంటే Google తో సైన్ ఇన్ చేయండి.<br>' +
      '<button type="button" class="btn btn-quiet messages-signin" onclick="closeMessages(); openAccount()">' +
        icon('user') + 'సైన్ ఇన్ చేయండి</button>';
  }

  function openButton(fbid) {
    const list = byId('messagesList');
    if (!list || !fbid) return null;
    const row = Array.prototype.find.call(list.querySelectorAll('.message-item'), (el) => el.getAttribute('data-fbid') === fbid);
    return row ? row.querySelector('.message-open') : null;
  }

  // Rebuilt only when something changed; a focused row keeps focus.
  function render() {
    renderIntro();
    const list = byId('messagesList');
    if (!list) return;
    const items = mergedItems();
    const busy = loading && !items.length;
    list.setAttribute('aria-busy', busy ? 'true' : 'false');
    const marks = readMarks();
    const globalSeen = readSeenAt();
    const html = items.length
      ? items.map((m) => itemHtml(m, isUnread(m, marks, globalSeen))).join('')
      : (busy ? loadingHtml() : emptyHtml());
    if (html === listHtml) return;
    const active = document.activeElement;
    const row = active && list.contains(active) && active.closest ? active.closest('.message-item') : null;
    const keep = row ? row.getAttribute('data-fbid') : null;
    list.innerHTML = html;
    listHtml = html;
    if (keep) focusQuietly(openButton(keep) || byId('messagesTitle'));
  }

  // Show the list (fbid null) or one conversation. Only one view is visible,
  // so Tab never reaches the hidden one.
  function setView(fbid) {
    threadId = fbid || null;
    const listView = byId('messagesListView');
    const thread = byId('messagesThread');
    if (listView) listView.hidden = !!threadId;
    if (thread) thread.hidden = !threadId;
  }

  function openMessages() {
    const o = overlay();
    if (!o) return;
    const refresh = fetchServer();   // sets `loading` first, so we show "fetching" rather than "empty"
    if (!o.classList.contains('active')) {
      savedOverflow = document.body.style.overflow;
      returnTo = document.activeElement;
      o.classList.add('active');
      document.body.style.overflow = 'hidden';
      setView(null);
      setThreadNote('');
    }
    render();
    updateBadge();
    const sheet = sheetEl();
    if (sheet && !threadId) sheet.scrollTop = 0;
    const title = byId('messagesTitle');
    if (title && !title.hasAttribute('tabindex')) title.setAttribute('tabindex', '-1');
    focusQuietly(title || o.querySelector('.sheet-close'));
    if (typeof gaEvent === 'function') { try { gaEvent('screen_view', { screen_name: 'My messages' }); } catch (e) {} }
    refresh.then(afterRefresh);
  }

  function closeMessages() {
    const o = overlay();
    if (!o || !o.classList.contains('active')) return;
    o.classList.remove('active');
    setView(null);                   // the next open starts from the list
    setThreadNote('');
    document.body.style.overflow = savedOverflow;
    savedOverflow = '';
    const back = returnTo;
    returnTo = null;
    // Opened from the account sheet, whose row is hidden now: fall back to
    // the account button in the header.
    const acct = document.querySelector('.hdr-account');
    focusQuietly(isShown(back) ? back : (isShown(acct) ? acct : null));
  }

  /* ============================================================
     6. The sheet: one conversation
  ============================================================ */
  function setThreadNote(text) {
    const n = byId('threadNote');
    if (n && n.textContent !== text) n.textContent = text;
  }
  function setStatus(text, tone) {
    const p = byId('threadStatus');
    if (!p) return;
    if (p.textContent !== (text || '')) p.textContent = text || '';
    if (tone) p.setAttribute('data-tone', tone);
    else p.removeAttribute('data-tone');
  }

  function normMessage(doc) {
    const d = docData(doc);
    const text = typeof d.text === 'string' ? d.text.trim() : '';
    const attached = cleanFiles(d.files);
    if (!text && !attached.length) return null;
    return { id: String(doc.id), from: d.from === 'admin' ? 'admin' : 'user', text: text, files: attached, createdAt: toDate(d.createdAt) };
  }

  // The first message, the legacy reply, then the follow-ups, in time order
  // (a message whose time is still unknown goes last).
  function threadEntries(item) {
    const entries = [{ key: 'first', from: 'user', text: item.message, files: item.files, at: item.createdAt || item.at }];
    const rest = [];
    if (item.reply) rest.push({ key: 'reply', from: 'admin', text: item.reply, files: [], at: item.repliedAt });
    const cache = item.isServer ? threadMsgs.get(item.fbid) : null;
    if (cache) cache.list.forEach((m) => rest.push({ key: 'm:' + m.id, from: m.from, text: m.text, files: m.files, at: m.createdAt }));
    const when = (e) => (e.at ? e.at.getTime() : Infinity);
    rest.forEach((e, i) => { e.order = i; });
    rest.sort((a, b) => (when(a) - when(b)) || (a.order - b.order));
    return entries.concat(rest);
  }

  function bubbleHtml(e) {
    const mine = e.from !== 'admin';
    return '<div class="bubble ' + (mine ? 'bubble-user' : 'bubble-team') + '">' +
        '<span class="bubble-from">' + (mine ? ME : TEAM) + '</span>' +
        (e.text ? '<p class="bubble-text">' + multiline(e.text) + '</p>' : '') +
        (e.files.length ? '<div class="bubble-files"></div>' : '') +
        (e.at ? '<time class="bubble-time" datetime="' + esc(e.at.toISOString()) + '">' + esc(relTime(e.at)) + '</time>' : '') +
      '</div>';
  }

  // Names only: this phone can't read the files (not signed in, or not yet
  // on the reader's account).
  function staticFilesHtml(list) {
    return '<div class="attach-list">' + list.map((f) => {
      const pdf = f.type === 'application/pdf';
      return '<div class="attach-item" data-kind="' + (pdf ? 'pdf' : 'image') + '">' +
          '<span class="attach-icon" aria-hidden="true">' + (pdf ? icon('file') : icon('image')) + '</span>' +
          '<span class="attach-name">' + esc(f.name || (pdf ? 'PDF' : 'చిత్రం')) + '</span>' +
          (f.size ? '<span class="attach-size">' + esc(humanSize(f.size)) + '</span>' : '') +
        '</div>';
    }).join('') + '</div>';
  }

  function fillFiles(box, item, list) {
    if (!box) return;
    const f = filesApi();
    const c = cloud();
    if (item.isServer && f && typeof f.render === 'function' && c && currentUser()) {
      try { f.render(box, c.db, item.fbid, list); return; } catch (e) { console.warn('[messages] attachments not shown:', errCode(e)); }
    }
    box.innerHTML = staticFilesHtml(list);
  }

  // Appends only the bubbles that are new, so the live log announces just
  // those; anything else (another thread, reordering) repaints the log.
  function paintBubbles(item) {
    const body = byId('threadBody');
    if (!body) return;
    const entries = threadEntries(item);
    const keys = entries.map((e) => e.key);
    const prefix = painted.fbid === item.fbid && painted.server === item.isServer &&
      painted.keys.length <= keys.length && painted.keys.every((k, i) => k === keys[i]);
    if (prefix && painted.keys.length === keys.length) return;
    const start = prefix ? painted.keys.length : 0;
    if (!prefix) {
      const hadFocus = body.contains(document.activeElement);
      body.textContent = '';
      if (hadFocus) focusQuietly(byId('threadTitle'));
    }
    const tpl = document.createElement('div');
    tpl.innerHTML = entries.slice(start).map(bubbleHtml).join('');
    Array.prototype.slice.call(tpl.children).forEach((el, i) => {
      body.appendChild(el);
      const e = entries[start + i];
      if (e.files.length) fillFiles(el.querySelector('.bubble-files'), item, e.files);
    });
    painted = { fbid: item.fbid, server: item.isServer, keys: keys };
  }

  // Composer only on the reader's own server doc while signed in.
  function paintComposer(item) {
    const composer = byId('threadComposer');
    const signin = byId('threadSignin');
    const signedIn = !!currentUser();
    const canReply = signedIn && item.isServer;
    const active = document.activeElement;
    const losing = !!(active && ((canReply && signin && signin.contains(active)) || (!canReply && composer && composer.contains(active))));
    if (composer) composer.hidden = !canReply;
    if (signin) signin.hidden = canReply;
    if (!canReply) {
      const note = byId('threadSigninNote');
      const text = signedIn ? COPY.notInAccount : COPY.signedOut;
      if (note && note.textContent !== text) note.textContent = text;
      const btn = byId('threadSigninBtn');
      if (btn) btn.hidden = signedIn;
    }
    // aria-disabled, not disabled: a disabled button would drop keyboard focus
    // to <body>. sendReply() ignores presses while a reply is on its way.
    const busy = !!activeJob(item.fbid);
    const send = byId('threadSend');
    if (send) send.setAttribute('aria-disabled', busy ? 'true' : 'false');
    lockComposer(busy);
    if (losing) focusQuietly(byId('threadTitle'));
  }

  // The follow-up on its way in this conversation for the signed-in reader, or null.
  function activeJob(fbid) {
    const job = fbid ? sends.get(fbid) : null;
    const u = currentUser();
    return job && u && u.uid === job.uid ? job : null;
  }
  function composerBusy() { return !!activeJob(draftFbid); }

  // While a follow-up is on its way nothing may change what is being sent:
  // the text is read-only (it keeps focus and can still be read), attaching
  // and removing are off. Called again after the picker redraws its list.
  function lockComposer(busy) {
    const ta = byId('threadText');
    if (ta && ta.readOnly !== busy) ta.readOnly = busy;
    const list = byId('threadAttachList');
    const controls = [byId('threadAttachBtn'), byId('threadFiles')]
      .concat(list ? Array.prototype.slice.call(list.querySelectorAll('.attach-remove')) : [])
      .filter(Boolean);
    if (busy && ta && controls.indexOf(document.activeElement) >= 0) focusQuietly(ta);   // don't drop focus to <body>
    controls.forEach((el) => { if (el.disabled !== busy) el.disabled = busy; });
  }
  function samePicked(a, b) {
    return a.length === b.length && a.every((p, i) => p === b[i]);
  }
  function clearPicker() {
    if (threadPicker) { try { threadPicker.clear(); } catch (e) {} }
  }

  function renderThread() {
    if (!threadId) return;
    const item = findItem(threadId);
    if (!item) { showList(null); return; }
    const t = TYPES[item.type] || TYPES.other;
    const s = STATUS[item.status] || STATUS.new;
    const title = byId('threadTitle');
    if (title && title.textContent !== t.label) title.textContent = t.label;
    const meta = byId('threadMeta');
    const html = '<span class="status-pill" data-status="' + esc(item.status) + '">' + icon(s.icon) + ' ' + esc(s.label) + '</span>' +
      (item.stotramTitle ? '<span class="thread-stotram">' + icon('book') + '<span>' + esc(item.stotramTitle) + '</span></span>' : '');
    if (meta && html !== metaHtml) { meta.innerHTML = html; metaHtml = html; }
    paintBubbles(item);
    paintComposer(item);
  }

  function revealLast(selector) {
    const body = byId('threadBody');
    const all = body ? body.querySelectorAll(selector) : [];
    const last = all.length ? all[all.length - 1] : null;
    if (last && typeof last.scrollIntoView === 'function') { try { last.scrollIntoView({ block: 'nearest' }); } catch (e) {} }
  }

  // Fetch feedback/{fbid}/messages. Marks the thread seen only after a fresh
  // server answer is on screen. Never rejects.
  function loadThread(fbid, reveal) {
    const c = cloud();
    const u = currentUser();
    if (!c || !u || !u.uid || threadLoading === fbid) return Promise.resolve(false);
    threadLoading = fbid;
    if (threadId === fbid && !threadMsgs.has(fbid)) setThreadNote(COPY.loading);
    const uid = u.uid;
    return withTimeout(() => c.db.collection('feedback').doc(fbid).collection('messages')
      .orderBy('createdAt').limit(THREAD_LIMIT).get(), FETCH_TIMEOUT_MS)
      .then((snap) => {
        const now = currentUser();
        if (!now || now.uid !== uid) return 'fail';   // signed out or switched while loading
        const fromCache = !!(snap.metadata && snap.metadata.fromCache);
        if (fromCache && snap.empty) return 'fail';     // offline: nothing real to show
        const list = [];
        snap.forEach((doc) => { const m = normMessage(doc); if (m) list.push(m); });
        // Keep a reply this phone just sent that the answer does not include yet.
        const prev = threadMsgs.get(fbid);
        const ids = new Set(list.map((m) => m.id));
        if (prev) prev.list.forEach((m) => { if (m.local && !ids.has(m.id)) list.push(m); });
        threadMsgs.set(fbid, { list: list, uid: uid });
        return fromCache ? 'cache' : 'fresh';
      })
      .catch((e) => { console.warn('[messages] could not load the conversation:', errCode(e)); return 'fail'; })
      .then((state) => {
        if (threadLoading === fbid) threadLoading = null;
        if (!isOpen() || threadId !== fbid) return state !== 'fail';
        setThreadNote(state === 'fresh' ? '' : COPY.loadFailed);
        renderThread();
        const item = findItem(fbid);
        const cache = threadMsgs.get(fbid);
        if (state === 'fresh' && item && cache) {
          const team = cache.list.filter((m) => m.from === 'admin');
          if (hasTeam(item) || team.length) {
            markThreadSeen(fbid, latestOf([item.lastAdminAt, item.reply ? item.repliedAt : null].concat(team.map((m) => m.createdAt))));
          }
          if (reveal) revealLast('.bubble-team');
        }
        return state !== 'fail';
      });
  }

  // Newer activity than the messages we hold → fetch them again.
  function threadStale(item) {
    const cache = threadMsgs.get(item.fbid);
    if (!cache) return true;
    if (!item.lastAt) return false;
    const known = latestOf([item.createdAt].concat(cache.list.map((m) => m.createdAt)));
    return !known || item.lastAt.getTime() > known.getTime();
  }

  function resetComposer(fbid) {
    const text = byId('threadText');
    if (text) { text.value = ''; text.removeAttribute('aria-invalid'); }
    clearPicker();
    pendingFiles.clear();        // their files were in the picker just cleared
    setStatus('');
    draftFbid = fbid;
    // Back on a conversation whose follow-up is still on its way: show what
    // is being sent (renderThread keeps the composer locked).
    const job = activeJob(fbid);
    if (job) {
      if (text) text.value = job.text;
      setStatus(job.late ? COPY.stillSending : COPY.sending);
    }
  }

  function openThread(fbid) {
    const item = findItem(fbid);
    if (!item || !byId('messagesThread')) return;
    const sheet = sheetEl();
    if (!threadId && sheet) listScroll = sheet.scrollTop;
    const wasUnread = isUnread(item, readMarks(), readSeenAt());
    if (draftFbid !== fbid) resetComposer(fbid);
    painted = { fbid: null, server: false, keys: [] };    // repaint: the relative times have moved on
    setView(fbid);
    setThreadNote('');
    renderThread();
    if (sheet) sheet.scrollTop = 0;
    focusQuietly(byId('threadTitle'));
    // A legacy reply is on screen now; newer replies are marked once loaded.
    if (item.isServer && hasTeam(item) && !item.lastAdminAt) markThreadSeen(fbid, item.reply ? item.repliedAt : null);
    if (item.isServer) loadThread(fbid, wasUnread);
    if (typeof gaEvent === 'function') { try { gaEvent('screen_view', { screen_name: 'Message thread' }); } catch (e) {} }
  }

  // Back to the list; focus returns to the row the thread was opened from.
  function showList(fromFbid) {
    const thread = byId('messagesThread');
    const hadFocus = !!(thread && thread.contains(document.activeElement));
    setView(null);
    setThreadNote('');
    render();
    const sheet = sheetEl();
    if (sheet) sheet.scrollTop = listScroll;
    if (hadFocus || fromFbid) focusQuietly(openButton(fromFbid) || byId('messagesTitle'));
  }

  function sendReply(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    const fbid = threadId;
    const item = findItem(fbid);
    const c = cloud();
    const u = currentUser();
    const textEl = byId('threadText');
    if (!item || !item.isServer || !c || !u || !u.uid || !textEl) return;
    // One follow-up at a time per conversation. A slow one is never sent twice.
    const running = activeJob(fbid);
    if (running) { setStatus(running.late ? COPY.stillSending : COPY.sending); return; }
    if (threadPicker && threadPicker.busy()) { setStatus(COPY.preparing); return; }
    const text = textEl.value.trim();
    const picked = threadPicker ? threadPicker.files().slice(0, 3) : [];
    const api = filesApi();

    // Retry: the last follow-up arrived with some files missing and the picker
    // still holds exactly those files → upload them again to the same message.
    const pending = pendingFiles.get(fbid);
    if (pending && pending.uid === u.uid && !text && picked.length && samePicked(picked, pending.picked) && api) {
      const job = { uid: u.uid, mid: pending.mid, text: '', meta: [], picked: picked, late: false };
      sends.set(fbid, job);
      paintComposer(item);
      setStatus(COPY.sending);
      Promise.resolve().then(() => api.upload(c.db, fbid, pending.mid, picked, { from: 'user' }))
        .catch(() => ({ ok: 0, failed: picked.length }))
        .then((res) => {
          if (sends.get(fbid) === job) sends.delete(fbid);
          const failed = res && typeof res.failed === 'number' ? res.failed : picked.length;
          if (!failed) {
            pendingFiles.delete(fbid);
            if (threadPicker && samePicked(threadPicker.files(), picked)) clearPicker();
          }
          settleComposer(fbid, failed ? COPY.partial : COPY.sent, failed ? 'error' : 'ok');
        });
      return;
    }

    if (!text && !picked.length) {
      textEl.setAttribute('aria-invalid', 'true');
      setStatus(COPY.empty, 'error');
      focusQuietly(textEl);
      return;
    }
    textEl.removeAttribute('aria-invalid');
    const FV = c.firebase && c.firebase.firestore && c.firebase.firestore.FieldValue;
    if (!FV || typeof c.db.batch !== 'function') { setStatus(COPY.failed, 'error'); return; }
    const mid = newMessageId();
    let meta = [];
    if (picked.length) {
      try { meta = api ? api.meta(picked, mid) : []; } catch (err) { meta = []; }
      if (!Array.isArray(meta) || meta.length !== picked.length) { setStatus(COPY.failed, 'error'); return; }
    }

    const job = { uid: u.uid, mid: mid, text: text, meta: meta, picked: picked, late: false };
    sends.set(fbid, job);
    pendingFiles.delete(fbid);           // a new message replaces any earlier retry
    paintComposer(item);
    setStatus(COPY.sending);
    const parent = c.db.collection('feedback').doc(fbid);
    let commitP = null;
    withTimeout(() => {
      const batch = c.db.batch();
      batch.set(parent.collection('messages').doc(mid), {
        from: 'user', uid: u.uid, text: text, files: meta, createdAt: FV.serverTimestamp()
      });
      batch.update(parent, { lastAt: FV.serverTimestamp(), lastFrom: 'user', status: 'new', handled: false });
      commitP = batch.commit();
      return commitP;
    }, WRITE_TIMEOUT_MS)
      .catch((err) => {
        // Past the cap Firestore still holds the write and sends it when the
        // connection returns, so keep waiting for it instead of offering a
        // second send that would post the message twice.
        if (commitP && err && err.message === 'timeout') {
          job.late = true;
          if (isOpen() && threadId === fbid) setStatus(COPY.stillSending);
          return commitP;
        }
        throw err;
      })
      .then(() => {
        if (!picked.length || !api) return { ok: 0, failed: 0 };
        // upload() never rejects by contract; count a surprise as all failed.
        return Promise.resolve().then(() => api.upload(c.db, fbid, mid, picked, { from: 'user' }))
          .catch(() => ({ ok: 0, failed: picked.length }));
      })
      .then((res) => {
        if (sends.get(fbid) === job) sends.delete(fbid);
        const failed = res && typeof res.failed === 'number' ? res.failed : 0;
        const now = new Date();
        const srv = server.get(fbid);
        if (srv) { srv.status = 'new'; srv.lastFrom = 'user'; srv.lastAt = now; }
        const cache = threadMsgs.get(fbid) || { list: [], uid: u.uid };
        if (!cache.list.some((m) => m.id === mid)) {
          cache.list.push({ id: mid, from: 'user', text: text, files: cleanFiles(meta), createdAt: now, local: true });
        }
        threadMsgs.set(fbid, cache);
        if (draftFbid === fbid) {
          // Only what was sent is cleared; the composer was locked meanwhile.
          if (textEl.value.trim() === text) textEl.value = '';
          if (failed) pendingFiles.set(fbid, { uid: u.uid, mid: mid, picked: picked });   // "try again" re-sends these
          else if (threadPicker && samePicked(threadPicker.files(), picked)) clearPicker();
        }
        updateBadge();
        if (typeof gaEvent === 'function') { try { gaEvent('message_reply', { files: picked.length }); } catch (err) {} }
        settleComposer(fbid, failed ? COPY.partial : COPY.sent, failed ? 'error' : 'ok', true);
      }, (err) => {
        if (sends.get(fbid) === job) sends.delete(fbid);
        console.warn('[messages] reply not sent:', errCode(err));
        settleComposer(fbid, COPY.failed, 'error', false);   // the text stays in the box
      })
      .catch((err) => { if (sends.get(fbid) === job) sends.delete(fbid); console.warn('[messages] reply:', errCode(err)); });
  }

  // After a follow-up settles: unlock whichever thread is on screen now, and if
  // it is the one that was sent, show the result (and the new bubble).
  function settleComposer(fbid, text, kind, sent) {
    const shown = threadId ? findItem(threadId) : null;
    if (shown && isOpen()) paintComposer(shown);
    if (!isOpen() || threadId !== fbid) return;
    if (sent) { renderThread(); revealLast('.bubble'); }
    setStatus(text, kind);
    if (sent) loadThread(fbid, false);     // server times, and anything that arrived meanwhile
  }

  // After fresh server data: badge, list, and an open thread.
  function afterRefresh() {
    updateBadge();
    if (!isOpen()) return;
    render();
    if (!threadId) return;
    renderThread();
    const item = findItem(threadId);
    if (item && item.isServer && threadStale(item)) loadThread(item.fbid, false);
  }

  // A reader who keeps the site open still sees a new reply: re-check when
  // the page is shown again (at most once a minute) or the account sheet,
  // which shows the badge, opens.
  function refreshQuietly(gap) {
    if (!currentUser() || loading || claiming) return;
    if (Date.now() - lastFetchAt < gap) return;
    fetchServer().then(afterRefresh);
  }

  /* Keep Tab inside the sheet while it is open (aria-modal). Hidden views
     have no client rects, so only the visible view's controls are listed. */
  function trapTab(e, root) {
    const list = Array.prototype.filter.call(
      root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      (el) => el.getClientRects().length > 0
    );
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement;
    if (!root.contains(active)) { e.preventDefault(); focusQuietly(e.shiftKey ? last : first); return; }
    const idx = list.indexOf(active);
    if (e.shiftKey && idx <= 0) { e.preventDefault(); focusQuietly(last); }
    else if (!e.shiftKey && idx === list.length - 1) { e.preventDefault(); focusQuietly(first); }
  }

  /* Sign-in / sign-out: claim, refresh the server copies, the badge and an open sheet. */
  function onAuth(user) {
    if (!user) {
      fetchSeq++;
      server = new Map(); serverUid = null; loading = false;
      threadMsgs.clear(); threadLoading = null;
      updateBadge();
      if (isOpen()) { render(); renderThread(); }
      return;
    }
    if (serverUid && serverUid !== user.uid) {
      server = new Map(); serverUid = null;
      threadMsgs.clear(); threadLoading = null;
    }
    loading = true;
    if (isOpen()) { render(); renderThread(); }
    // Read the account's docs first, so the claim can skip messages that are
    // already on it; read again only if something was linked.
    fetchServer()
      .then(() => { afterRefresh(); return claimLocal(user); })
      .then((n) => (n > 0 ? fetchServer().then(afterRefresh) : null));
  }

  /* ---------- exports ---------- */
  window.openMessages = openMessages;
  window.closeMessages = closeMessages;
  window.recordSentMessage = recordSentMessage;
  window.syncFeedbackChips = syncFeedbackChips;

  if (typeof document === 'undefined' || !document.addEventListener) return;

  /* ---------- attachment pickers (attachments.js) ---------- */
  function makePicker(buttonId, inputId, listId, onChange) {
    const api = filesApi();
    const button = byId(buttonId);
    const input = byId(inputId);
    const list = byId(listId);
    if (!api || typeof api.createPicker !== 'function' || !button || !input || !list) return null;
    try {
      const opts = { button: button, input: input, list: list };
      if (onChange) opts.onChange = onChange;
      return api.createPicker(opts) || null;
    } catch (e) {
      console.warn('[messages] attachments unavailable:', errCode(e));
      return null;
    }
  }
  const feedbackPicker = makePicker('fbAttachBtn', 'fbFiles', 'fbAttachList');
  if (feedbackPicker) window.feedbackPicker = feedbackPicker;
  else { const box = byId('fbAttach'); if (box) box.hidden = true; }
  threadPicker = makePicker('threadAttachBtn', 'threadFiles', 'threadAttachList', () => {
    const busy = composerBusy();
    if (!busy) setStatus('');
    lockComposer(busy);                  // the picker just redrew its remove buttons
    // A changed selection is no longer the "try again" set of the last message.
    const pending = pendingFiles.get(draftFbid);
    if (pending && threadPicker && !samePicked(threadPicker.files(), pending.picked)) pendingFiles.delete(draftFbid);
  });
  if (!threadPicker) { const box = byId('threadAttach'); if (box) box.hidden = true; }

  /* ---------- wiring ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target && e.target.closest ? e.target : null;
    if (!t) return;
    const chip = t.closest('.fb-type-chip');
    if (chip) { chooseChip(chip, false); return; }
    const open = t.closest('#messagesList .message-open');
    if (open) {
      const row = open.closest('.message-item');
      if (row) openThread(row.getAttribute('data-fbid'));
      return;
    }
    if (t.closest('#threadBack')) showList(threadId);
  });

  const composer = byId('threadComposer');
  if (composer) composer.addEventListener('submit', sendReply);
  const threadText = byId('threadText');
  if (threadText) {
    threadText.addEventListener('input', () => {
      if (threadText.hasAttribute('aria-invalid')) threadText.removeAttribute('aria-invalid');
      if (!composerBusy()) setStatus('');
    });
  }

  document.addEventListener('keydown', (e) => {
    const t = e.target;
    const key = e.key;

    // Arrow keys / Home / End inside the chip radio group
    const chip = t && t.closest ? t.closest('.fb-type-chip') : null;
    if (chip && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const chips = chipList(chip.closest('[role="radiogroup"]') || chip.parentNode);
      const i = chips.indexOf(chip);
      let next = -1;
      if (key === 'ArrowRight' || key === 'ArrowDown') next = (i + 1) % chips.length;
      else if (key === 'ArrowLeft' || key === 'ArrowUp') next = (i - 1 + chips.length) % chips.length;
      else if (key === 'Home') next = 0;
      else if (key === 'End') next = chips.length - 1;
      if (next >= 0 && chips[next]) {
        e.preventDefault();
        chooseChip(chips[next], true);
        return;
      }
    }

    const isSpace = key === ' ' || key === 'Spacebar' || e.code === 'Space';
    // japamala.js counts a bead on Space (window listener) while its page is
    // active, even under an open form. Keep Space for typing in the feedback
    // form, for pressing buttons in this sheet and in the attachment viewer.
    if (isSpace && t && t.closest && t.closest('#feedbackOverlay.active, #messagesOverlay.active, .file-viewer')) {
      e.stopPropagation();
      return;
    }

    if (!isOpen()) return;
    if (key === 'Escape' || key === 'Esc') {
      if (e.defaultPrevented) return;          // a layer above already answered it
      const viewer = shownViewer();
      if (viewer) {
        // Close only the viewer, never this sheet under it.
        const close = viewer.querySelector('.file-viewer-close');
        if (close) close.click();
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (higherLayerOpen()) return;
      e.preventDefault();
      e.stopImmediatePropagation();   // only the top sheet reacts
      if (threadId) showList(threadId);
      else closeMessages();
      return;
    }
    // Ctrl/Cmd + Enter sends from the reply box
    if (key === 'Enter' && (e.ctrlKey || e.metaKey) && t && t.id === 'threadText') {
      e.preventDefault();
      sendReply();
      return;
    }
    if (isSpace) { e.stopPropagation(); return; }
    if (key === 'Tab' && !higherLayerOpen()) trapTab(e, overlay());
  }, true);

  const fbType = byId('fbType');
  if (fbType) fbType.addEventListener('change', syncFeedbackChips);
  // Whatever opens the form, the chips show the current #fbType when it appears.
  const fbOverlay = byId('feedbackOverlay');
  const acctOverlay = byId('accountOverlay');
  if (typeof MutationObserver === 'function') {
    if (fbOverlay) {
      new MutationObserver(() => { if (fbOverlay.classList.contains('active')) syncFeedbackChips(); })
        .observe(fbOverlay, { attributes: true, attributeFilter: ['class'] });
    }
    // The account sheet shows the unread badge: keep it current.
    if (acctOverlay) {
      new MutationObserver(() => { if (acctOverlay.classList.contains('active')) refreshQuietly(ACCOUNT_GAP_MS); })
        .observe(acctOverlay, { attributes: true, attributeFilter: ['class'] });
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshQuietly(REFRESH_GAP_MS);
  });
  syncFeedbackChips();

  document.addEventListener('cloud-auth', (e) => onAuth(e && e.detail ? e.detail : null));
  // cloud.js loads earlier; the first auth answer may already have arrived.
  if (currentUser()) onAuth(currentUser());
  else updateBadge();
})();
