/* ============================================================
   CLOUD SYNC (optional) — Google sign-in + Firestore backup of the
   user's pooja/japa/japamala data. Everything still works offline
   with no login; signing in only keeps counts safe across devices.

   Uses the Firebase "compat" SDK (loaded via <script> in index.html),
   so this is a classic script and can share the page's globals
   (getTrack / setTrack / siteAlert, and flushFeedback from feedback.js).

   Also the one place the rest of the site gets Firebase from:
     window.StotramCloud = { firebase, auth, db, get user() }
     document 'cloud-ready'  — dispatched once, right after init
     document 'cloud-auth'   — on every auth change, detail: user | null
   Scripts that load later (updates.js, messages.js) check
   window.StotramCloud first, then listen for the events.
   feedback.js sends through window.__cloudFeedback (one message, also
   the offline queue) and window.__cloudSendReport (a first message with
   attachments; needs attachments.js, window.StotramFiles).

   If the SDK is missing (offline, blocked, the e2e run aborts it) this
   file only replaces the "loading" line in #cloudAuthBox and stops; no
   globals are defined and nothing throws.

   $0 / no card: Google auth + Firestore free (Spark) tier.
============================================================ */
(function () {
  'use strict';

  const firebaseConfig = window.FIREBASE_CONFIG;

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
  function authBox() { return document.getElementById('cloudAuthBox'); }
  function showUnavailable() {
    const box = authBox();
    if (box) box.innerHTML = '<p class="cloud-loading">ఇప్పుడు సైన్ ఇన్ అందుబాటులో లేదు. ఇంటర్నెట్ ఉందో చూసి, కాసేపటి తర్వాత పేజీని మళ్ళీ తెరవండి. మీ లెక్కలు ఈ ఫోన్‌లో భద్రంగానే ఉంటాయి.</p>';
  }

  if (typeof firebase === 'undefined' || typeof firebase.auth !== 'function' || typeof firebase.firestore !== 'function') {
    console.warn('[cloud] Firebase SDK not loaded — cloud sync disabled.');
    showUnavailable();
    return;
  }
  let auth, db, provider;
  try {
    if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    provider = new firebase.auth.GoogleAuthProvider();
  } catch (e) {
    console.warn('[cloud] Firebase could not start — cloud sync disabled.', e);
    showUnavailable();
    return;
  }

  let currentUser = null;
  let pushTimer = null;       // a debounced push is waiting (see schedulePush)
  let retryTimer = null;      // a failed first pull will be tried again
  let retryStep = 0;
  let syncing = null;         // the account whose first pull is running now

  /* ---------- sign in / out ---------- */
  function signIn() {
    auth.signInWithPopup(provider).catch((err) => {
      const code = err && err.code;
      // The reader closed the Google window, or tapped twice: nothing went wrong.
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      console.warn('[cloud] sign-in failed', err);
      siteAlert('సైన్ ఇన్ కాలేదు. కాసేపటి తర్వాత మళ్ళీ ప్రయత్నించండి.\nSign-in failed: ' + (err && err.message ? err.message : err));
    });
  }
  // Changes still waiting in the 1.5s push debounce are sent first (at most
  // 4s), so the account really holds everything that was on this phone.
  async function signOutUser() {
    if (pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = null;
      await Promise.race([pushNow(), new Promise((r) => setTimeout(r, 4000))]);
    }
    auth.signOut().catch((e) => console.warn('[cloud] sign-out failed', e));
  }

  // Queued feedback is sent once the sign-in state is known, so a signed-in
  // reader's messages carry their uid and appear under "My messages".
  let feedbackFlushed = false;
  function flushQueuedFeedbackOnce() {
    if (feedbackFlushed || typeof flushFeedback !== 'function') return;
    feedbackFlushed = true;
    setTimeout(flushFeedback, 300);
  }

  auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    updateAuthUI(user);
    announceAuth(user);
    flushQueuedFeedbackOnce();
    clearTimeout(pushTimer);                 // a push queued for the previous account never lands in this one
    pushTimer = null;
    clearTimeout(retryTimer);
    retryStep = 0;
    window.__cloudSync = null;
    if (user) await syncAfterSignIn(user);
  });

  // saveTrack() pushes through __cloudSync only after this account's cloud copy
  // was pulled and merged; pushing first would overwrite what the cloud holds.
  // A failed pull is tried again after 15s, 1 min, then every 5 min, and at
  // once when the phone comes back online or the page is shown again.
  const RETRY_DELAYS = [15000, 60000, 300000];
  async function syncAfterSignIn(user) {
    if (syncing === user) return;            // one first pull (and one question) at a time
    syncing = user;
    clearTimeout(retryTimer);
    let ok = false;
    try { ok = await pullAndMerge(user); } finally { if (syncing === user) syncing = null; }
    if (currentUser !== user) return;
    if (ok) {
      retryStep = 0;
      window.__cloudSync = schedulePush;
      return;
    }
    if (retryStep === 0) toast('సింక్ కాలేదు / Sync failed');
    const delay = RETRY_DELAYS[Math.min(retryStep++, RETRY_DELAYS.length - 1)];
    retryTimer = setTimeout(retrySync, delay);
  }
  function retrySync() {
    if (currentUser && !window.__cloudSync) syncAfterSignIn(currentUser);
  }
  window.addEventListener('online', retrySync);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') retrySync(); });

  // Whose entries are on this phone: the account they last synced to, written
  // only after a successful push. When a different account signs in on a
  // shared phone, it is asked whether to add this phone's entries. If it says
  // no, the phone's copy is set aside (poojaTrackAside_<uid>) rather than
  // dropped, because entries made while signed out never reached any account;
  // they are merged back when that account signs in here again.
  const OWNER_KEY = 'poojaTrackOwner';
  const ASIDE_PREFIX = 'poojaTrackAside_';
  function readOwner() { try { return localStorage.getItem(OWNER_KEY) || ''; } catch (e) { return ''; } }
  function writeOwner(uid) { try { localStorage.setItem(OWNER_KEY, uid); } catch (e) {} }
  function readAside(uid) {
    try { return JSON.parse(localStorage.getItem(ASIDE_PREFIX + uid) || 'null'); } catch (e) { return null; }
  }
  function setAside(uid, t) {
    const prev = readAside(uid);
    try { localStorage.setItem(ASIDE_PREFIX + uid, JSON.stringify(prev ? mergeTrack(prev, t) : t)); } catch (e) {}
  }
  function dropAside(uid) { try { localStorage.removeItem(ASIDE_PREFIX + uid); } catch (e) {} }
  // Real entries only: opening a day creates an empty day object.
  function hasEntries(t) {
    t = t || {};
    const dayHas = (d) => !!d && ((d.pradakshina || 0) > 0 ||
      (d.japa || []).some((j) => j && j.name) ||
      Object.values(d.parayana || {}).some((v) => (v || 0) > 0));
    return Object.values(t.days || {}).some(dayHas) || (t.mokkulu || []).length > 0 ||
      ((t.japamala && t.japamala.total) || 0) > 0 ||
      Object.values(t.reading || {}).some((r) => Array.isArray(r) && r.length > 0);
  }

  function announceAuth(user) {
    try { document.dispatchEvent(new CustomEvent('cloud-auth', { detail: user || null })); } catch (e) {}
  }

  /* ---------- pull cloud → merge with local → push ---------- */
  // Resolves true once this account's data is pulled and merged. The push is
  // not awaited: offline, a Firestore write waits instead of failing.
  async function pullAndMerge(user) {
    try {
      const ref = db.collection('users').doc(user.uid);
      const snap = await ref.get();
      if (currentUser !== user) return false;   // signed out (or switched) while pulling
      const cloud = snap.exists ? (snap.data().track || null) : null;
      const aside = readAside(user.uid);
      if (typeof getTrack === 'function' && typeof setTrack === 'function') {
        const owner = readOwner();
        let add = true;
        if (owner && owner !== user.uid && hasEntries(getTrack())) {
          // No Escape / outside tap here: both buttons are safe, a stray tap must pick neither.
          add = await siteConfirm('ఈ ఫోన్‌లో ఇంతకుముందు సైన్ ఇన్ చేసిన వేరే ఖాతా పూజ వివరాలు ఉన్నాయి. వాటిని ఈ ఖాతాలో కూడా కలపాలా?\n\n"వద్దు" అంటే ఇప్పుడు ఈ ఖాతా వివరాలు మాత్రమే కనిపిస్తాయి. ఆ వివరాలు ఈ ఫోన్‌లోనే పక్కన దాచి ఉంచుతాం; ఆ ఖాతాతో మళ్ళీ సైన్ ఇన్ చేస్తే తిరిగి వస్తాయి.\n\nThis phone has pooja entries from another account. Add them to this account too? "No" shows only this account\'s entries; the others are kept aside on this phone and come back when that account signs in again.',
            { okLabel: 'కలుపు / Add', cancelLabel: 'వద్దు / No', noDismiss: true });
          if (currentUser !== user) return false;   // signed out while the question was open
        }
        if (!add) {
          setAside(owner, getTrack());
          setTrack(cloud || {});
        } else if (cloud) {
          setTrack(mergeTrack(getTrack(), cloud));   // never loses data (max-merge)
        }
        if (aside) setTrack(mergeTrack(getTrack(), aside));   // this account's entries set aside earlier
      }
      pushNow(user).then((ok) => {
        if (ok && aside) dropAside(user.uid);
        toast(ok ? 'భద్రంగా సేవ్ అయింది / Synced' : 'సింక్ కాలేదు / Sync failed');
      });
      return true;
    } catch (e) {
      console.warn('[cloud] pull failed', e);
      return false;
    }
  }

  function schedulePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { pushTimer = null; pushNow(); }, 1500);   // debounce rapid taps → one write
  }
  // Resolves true when the write landed. A push started for one account never
  // writes to another: it is skipped if the signed-in account has changed.
  async function pushNow(user) {
    user = user || currentUser;
    if (!user || user !== currentUser || typeof getTrack !== 'function') return false;
    try {
      await db.collection('users').doc(user.uid).set({
        track: getTrack(),
        email: user.email || null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      if (currentUser === user) writeOwner(user.uid);
      return true;
    } catch (e) {
      console.warn('[cloud] push failed', e);
      return false;
    }
  }

  /* ---------- safe merge (counts only go up; nothing lost) ---------- */
  function mergeDay(a, b) {
    a = a || {}; b = b || {};
    const out = { pradakshina: Math.max(a.pradakshina || 0, b.pradakshina || 0) };
    const japa = {};
    (a.japa || []).forEach((j) => { if (j && j.name) japa[j.name] = { name: j.name, count: j.count || 0, target: j.target || 0 }; });
    (b.japa || []).forEach((j) => {
      if (!j || !j.name) return;
      if (japa[j.name]) { japa[j.name].count = Math.max(japa[j.name].count, j.count || 0); japa[j.name].target = Math.max(japa[j.name].target, j.target || 0); }
      else japa[j.name] = { name: j.name, count: j.count || 0, target: j.target || 0 };
    });
    out.japa = Object.values(japa);
    out.parayana = Object.assign({}, a.parayana || {});
    Object.entries(b.parayana || {}).forEach(([k, v]) => { out.parayana[k] = Math.max(out.parayana[k] || 0, v || 0); });
    return out;
  }
  function mergeTrack(local, cloud) {
    local = local || {}; cloud = cloud || {};
    const days = {};
    const dates = new Set([...Object.keys(local.days || {}), ...Object.keys(cloud.days || {})]);
    dates.forEach((d) => { days[d] = mergeDay((local.days || {})[d], (cloud.days || {})[d]); });
    const mk = {};
    (cloud.mokkulu || []).forEach((m) => { if (m && m.id) mk[m.id] = m; });
    (local.mokkulu || []).forEach((m) => { if (m && m.id) mk[m.id] = m; });   // local wins on conflict
    const jm = Math.max((local.japamala && local.japamala.total) || 0, (cloud.japamala && cloud.japamala.total) || 0);
    // read marks: union per stotram, so progress made on either device is kept
    const reading = {};
    const rKeys = new Set([...Object.keys(local.reading || {}), ...Object.keys(cloud.reading || {})]);
    rKeys.forEach((k) => {
      const set = new Set([...((local.reading || {})[k] || []), ...((cloud.reading || {})[k] || [])]);
      reading[k] = [...set].sort((a, b) => a - b);
    });
    return { days, mokkulu: Object.values(mk), japamala: { total: jm }, reading };
  }

  /* ---------- UI (contract §4.10) ---------- */
  // First letter of the name for the round avatar. Uses whole grapheme
  // clusters, so a Telugu name keeps its vowel sign ("శ్రీ", not "శ").
  function initialOf(name) {
    const s = String(name || '').trim();
    if (!s) return '•';
    let first = '';
    try {
      if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
        const step = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)[Symbol.iterator]().next();
        first = step && step.value ? step.value.segment : '';
      }
    } catch (e) { first = ''; }
    if (!first) first = Array.from(s)[0] || '';
    return first.toLocaleUpperCase();
  }

  function updateAuthUI(user) {
    const box = authBox();
    if (!box) return;
    if (user) {
      const name = String(user.displayName || user.email || 'Google ఖాతా');
      box.innerHTML =
        '<div class="cloud-signed">' +
          '<span class="cloud-avatar" aria-hidden="true">' + esc(initialOf(name)) + '</span>' +
          '<span class="cloud-who"><b>' + esc(name) + '</b><small>మీ లెక్కలు అన్ని ఫోన్‌లలో భద్రంగా ఉన్నాయి</small></span>' +
        '</div>' +
        '<button type="button" class="btn btn-quiet btn-sm cloud-signout" onclick="stotramSignOut()">సైన్ అవుట్</button>';
    } else {
      box.innerHTML =
        '<button type="button" class="btn btn-google" onclick="stotramSignIn()">' +
          '<svg class="icon-inline" aria-hidden="true"><use href="/icons.svg#icon-google"/></svg>' +
          'Google తో సైన్ ఇన్ చేయండి' +
        '</button>';
    }
  }
  function toast(msg) {
    let t = document.getElementById('cloudToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'cloudToast';
      t.className = 'cloud-toast';
      t.setAttribute('role', 'status');
      t.setAttribute('aria-live', 'polite');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), 2200);
  }

  window.stotramSignIn = signIn;
  window.stotramSignOut = signOutUser;

  /* ---------- feedback → Firestore ---------- */
  // The attachment list kept on the parent doc: at most 3 plain
  // {id, name, type, size}, whatever the caller handed over.
  const FILE_TYPES = ['image/webp', 'image/jpeg', 'image/png', 'application/pdf'];
  function cleanFilesMeta(list) {
    if (!Array.isArray(list)) return [];
    return list.slice(0, 3).filter((f) => f && typeof f === 'object').map((f) => {
      const size = Math.round(Number(f.size));
      return {
        id: String(f.id == null ? '' : f.id).slice(0, 64),
        name: String(f.name == null ? '' : f.name).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 120),
        type: FILE_TYPES.indexOf(f.type) >= 0 ? f.type : '',
        size: Number.isFinite(size) ? Math.min(Math.max(size, 0), 800000) : 0,
      };
    });
  }

  // Anyone may submit (signed in or not). A signed-in reader can read their own
  // messages back (messages.js); everything else is admin-only, which the
  // security rules enforce. Returns a promise so feedback.js can keep the entry
  // queued and retry it if this fails (offline, etc.). Payloads queued before
  // attachments existed (no claimKey, no files) are sent the same way.
  // A queued message goes out as the account that wrote it. feedback.js stamps
  // payload.byUid (null when written signed out); entries queued before that
  // stamp existed have no byUid and go out as whoever is signed in, as before.
  //   written signed out            -> no account, with its claim key
  //   author signed in now          -> that account
  //   author signed out since       -> no account, with its claim key (the
  //                                    author's next sign-in here claims it)
  //   another account signed in     -> held (code 'held', stays queued), and
  //                                    after 7 days sent with no account
  const HOLD_MS = 7 * 24 * 60 * 60 * 1000;
  function senderFor(payload) {
    const u = auth.currentUser;
    if (!payload || !Object.prototype.hasOwnProperty.call(payload, 'byUid')) return { user: u };
    const by = typeof payload.byUid === 'string' && payload.byUid ? payload.byUid : null;
    if (!by || !u) return { user: null };
    if (u.uid === by) return { user: u };
    const at = Date.parse(payload.at || '');
    if (isFinite(at) && Date.now() - at < HOLD_MS) return { held: true };
    return { user: null };
  }

  window.__cloudFeedback = function (payload) {
    if (payload && payload.website) return Promise.resolve();   // honeypot tripped → drop
    const sender = senderFor(payload);
    if (sender.held) {
      return Promise.reject(Object.assign(new Error('held for the account that wrote it'), { code: 'held' }));
    }
    const u = sender.user;
    const doc = {
      type: payload.type || 'other',
      name: payload.name || '',
      contact: payload.contact || '',
      message: payload.message || '',
      screen: payload.screen || '',
      stotram: payload.stotram || '',
      stotramTitle: payload.stotramTitle || '',
      lang: payload.lang || '',
      device: payload.device || '',
      sentAt: payload.at || null,                     // when the user pressed send
      uid: u ? u.uid : null,                          // null for anonymous users
      email: u ? (u.email || null) : null,
      handled: false,                                 // admin marks it done
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastAt: firebase.firestore.FieldValue.serverTimestamp(),   // latest activity in the conversation
      lastFrom: 'user',
    };
    // Sent without signing in: the key lets this phone claim the message
    // later (messages.js). The rules accept it only on an anonymous create.
    if (!u && typeof payload.claimKey === 'string' && /^[0-9a-f]{32,64}$/.test(payload.claimKey)) {
      doc.claimKey = payload.claimKey;
    }
    const files = cleanFilesMeta(payload.files);
    if (files.length) doc.files = files;             // declares the files/first-<n> docs that follow
    // Write under the client-generated id when we have one, so retrying a
    // message that may already have landed overwrites it instead of duplicating.
    return payload.fbid
      ? db.collection('feedback').doc(payload.fbid).set(doc)
      : db.collection('feedback').add(doc);
  };

  /* ---------- a first message with attachments ---------- */
  // feedback.js calls this instead of the queue when the reader picked files
  // (they are too big to keep in localStorage). The parent doc goes first and
  // declares the files; then each file becomes feedback/{fbid}/files/first-<n>.
  // Resolves when everything is stored. Otherwise rejects with an Error whose
  // .te is the Telugu line to show and whose .code is
  //   'offline'  nothing confirmed (no signal, or no answer in 15 s): try again;
  //   'failed'   the rules refused the message itself;
  //   'partial'  the message is stored, but some files are not.
  // feedback.js retries with the same fbid, claim key and picked files. A parent
  // that may have landed on an earlier try answers "permission-denied" (it
  // exists, so set() is an update); a parent known to be stored is not sent
  // again. StotramFiles.upload itself skips files an earlier try stored.
  const REPORT_PARENT_MS = 15000;
  const REPORT_TE = {
    offline: "స్క్రీన్‌షాట్‌లు పంపడానికి ఇంటర్నెట్ కావాలి. కనెక్షన్ చూసి మళ్ళీ 'పంపండి' నొక్కండి.",
    failed: 'పంపలేకపోయాం. ఇంటర్నెట్ చూసి మళ్ళీ ప్రయత్నించండి.',
    partial: 'సందేశం చేరింది, కానీ కొన్ని చిత్రాలు పంపలేకపోయాం. మళ్ళీ ప్రయత్నించండి.',
  };
  function reportError(code, cause) {
    const err = new Error(REPORT_TE[code]);
    err.code = code;
    err.te = REPORT_TE[code];
    if (cause) err.cause = cause;
    return err;
  }
  function capped(promise, ms) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout')), ms);
      Promise.resolve(promise).then(
        (v) => { clearTimeout(t); resolve(v); },
        (e) => { clearTimeout(t); reject(e); }
      );
    });
  }
  // fbid -> { parent: '' | 'maybe' | 'stored', anon: was the parent written
  // signed out }; the entry goes once the report is complete (or the page closes).
  const reportTries = new Map();

  window.__cloudSendReport = async function (payload, prepared) {
    if (!payload || typeof payload !== 'object') throw reportError('failed');
    if (payload.website) return;                     // honeypot tripped → drop, like __cloudFeedback
    const Files = window.StotramFiles;
    if (!Files || typeof Files.meta !== 'function' || typeof Files.upload !== 'function') throw reportError('offline');
    if (navigator.onLine === false) throw reportError('offline');   // say so now, not after 15 s
    if (!payload.fbid) payload.fbid = 'fb-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const list = (Array.isArray(prepared) ? prepared : []).filter(Boolean).slice(0, 3);
    payload.files = Files.meta(list, 'first');
    let tries = reportTries.get(payload.fbid);
    if (!tries) {
      tries = { parent: '', anon: false };
      reportTries.set(payload.fbid, tries);
    }

    // 1. The parent doc (the message itself, declaring the files).
    if (tries.parent !== 'stored') {
      const anon = !auth.currentUser;
      try {
        await capped(window.__cloudFeedback(payload), REPORT_PARENT_MS);
        tries.anon = anon;                           // this write created it (a set() on an existing doc is refused)
        tries.parent = 'stored';
      } catch (e) {
        if (e && e.code === 'permission-denied' && tries.parent === 'maybe') {
          tries.parent = 'stored';                   // an earlier try landed after all
        } else if (e && e.code === 'permission-denied') {
          console.warn('[cloud] the message was refused', e);
          throw reportError('failed', e);
        } else {
          if (tries.parent === '') tries.anon = anon;
          tries.parent = 'maybe';                    // may still land (Firestore keeps it pending)
          console.warn('[cloud] the message did not confirm', e);
          throw reportError('offline', e);
        }
      }
    }
    if (!list.length) { reportTries.delete(payload.fbid); return; }

    // 2. The files. A message sent without signing in proves itself with its
    //    claim key; a signed-in reader owns the parent.
    const opts = { from: 'user' };
    if (tries.anon && payload.claimKey) opts.key = payload.claimKey;
    let result = null;
    try {
      result = await Files.upload(db, payload.fbid, 'first', list, opts);
    } catch (e) {
      console.warn('[cloud] attachment upload failed', e);   // upload() should never reject
    }
    const failed = result ? Math.max(0, Math.floor(Number(result.failed)) || 0) : list.length;
    if (failed > 0) throw reportError('partial');
    reportTries.delete(payload.fbid);
  };

  /* ---------- shared handle for the other scripts ---------- */
  window.StotramCloud = Object.freeze({
    firebase: firebase,
    auth: auth,
    db: db,
    get user() { return currentUser; }
  });
  try { document.dispatchEvent(new CustomEvent('cloud-ready', { detail: window.StotramCloud })); } catch (e) {}

  // Fallback if the auth state never resolves (for example a blocked auth endpoint).
  setTimeout(flushQueuedFeedbackOnce, 8000);
})();
