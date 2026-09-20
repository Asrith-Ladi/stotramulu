/* ============================================================
   CLOUD SYNC (optional) — Google sign-in + Firestore backup of the
   user's pooja/japa/japamala data. Everything still works offline
   with no login; signing in only keeps counts safe across devices.

   Uses the Firebase "compat" SDK (loaded via <script> in index.html),
   so this is a classic script and can share app.js globals
   (getTrack / setTrack / escapeHtml).

   $0 / no card: Google auth + Firestore free (Spark) tier.
============================================================ */
(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyCDwmjKvg-4XFra1NevTX4wW8BGsUzzQtU",
    authDomain: "stotramulu-eddf4.firebaseapp.com",
    projectId: "stotramulu-eddf4",
    storageBucket: "stotramulu-eddf4.firebasestorage.app",
    messagingSenderId: "692972588346",
    appId: "1:692972588346:web:fd28b65084582ddd011403",
  };

  if (typeof firebase === 'undefined') {
    console.warn('[cloud] Firebase SDK not loaded — cloud sync disabled.');
    return;
  }
  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();
  const provider = new firebase.auth.GoogleAuthProvider();

  let currentUser = null;
  let pushTimer = null;

  /* ---------- sign in / out ---------- */
  function signIn() {
    auth.signInWithPopup(provider).catch((err) => {
      console.warn('[cloud] sign-in failed', err);
      siteAlert('సైన్ ఇన్ కాలేదు / Sign-in failed:\n' + (err && err.message ? err.message : err));
    });
  }
  function signOutUser() { auth.signOut(); }

  auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    updateAuthUI(user);
    if (user) {
      window.__cloudSync = schedulePush;     // saveTrack() will call this
      await pullAndMerge(user);
    } else {
      window.__cloudSync = null;
    }
  });

  /* ---------- pull cloud → merge with local → push ---------- */
  async function pullAndMerge(user) {
    try {
      const ref = db.collection('users').doc(user.uid);
      const snap = await ref.get();
      const cloud = snap.exists ? (snap.data().track || null) : null;
      if (cloud && typeof getTrack === 'function' && typeof setTrack === 'function') {
        setTrack(mergeTrack(getTrack(), cloud));   // never loses data (max-merge)
      }
      await pushNow();
      toast('☁️ సురక్షితం / Synced');
    } catch (e) {
      console.warn('[cloud] pull failed', e);
      toast('⚠️ సింక్ కాలేదు');
    }
  }

  function schedulePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, 1500);       // debounce rapid taps → one write
  }
  async function pushNow() {
    if (!currentUser || typeof getTrack !== 'function') return;
    try {
      await db.collection('users').doc(currentUser.uid).set({
        track: getTrack(),
        email: currentUser.email || null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      console.warn('[cloud] push failed', e);
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
    return { days, mokkulu: Object.values(mk), japamala: { total: jm } };
  }

  /* ---------- UI ---------- */
  function updateAuthUI(user) {
    const box = document.getElementById('cloudAuthBox');
    if (!box) return;
    if (user) {
      const who = (user.displayName || user.email || 'Signed in');
      const safe = (typeof escapeHtml === 'function') ? escapeHtml(who) : who;
      box.innerHTML =
        `<div class="cloud-signed">✓ <b>${safe}</b><div class="cloud-sub">మీ లెక్కలు అన్ని ఫోన్‌లలో సురక్షితం (saved online)</div></div>` +
        `<button class="track-btn" onclick="stotramSignOut()">సైన్ అవుట్ / Sign out</button>`;
    } else {
      box.innerHTML = `<button class="track-btn primary" onclick="stotramSignIn()">🔐 Google తో సైన్ ఇన్ చేయండి</button>`;
    }
  }
  function toast(msg) {
    let t = document.getElementById('cloudToast');
    if (!t) { t = document.createElement('div'); t.id = 'cloudToast'; t.className = 'cloud-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), 2200);
  }

  window.stotramSignIn = signIn;
  window.stotramSignOut = signOutUser;

  /* ---------- feedback → Firestore ---------- */
  // Anyone may submit (signed in or not); only the admin can read it back, which
  // the security rules enforce. Returns a promise so app.js can keep the entry
  // queued and retry it if this fails (offline, etc.).
  window.__cloudFeedback = function (payload) {
    if (payload && payload.website) return Promise.resolve();   // honeypot tripped → drop
    const u = auth.currentUser;
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
    };
    // Write under the client-generated id when we have one, so retrying a
    // message that may already have landed overwrites it instead of duplicating.
    return payload.fbid
      ? db.collection('feedback').doc(payload.fbid).set(doc)
      : db.collection('feedback').add(doc);
  };

  // Anything queued while offline gets sent once Firebase is ready.
  if (typeof flushFeedback === 'function') setTimeout(flushFeedback, 1500);
})();
