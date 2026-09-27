/* ============================================================
   ADMIN DASHBOARD — the full content-management surface, loaded only
   by admin.html (never shipped to regular visitors). Gated by Firebase
   auth + ADMIN_UID; the real authorization boundary is the Firestore
   security rules, this is just the UI gate.

   This page loads its own copy of the 32 stotra data files (same as
   index.html) so `stotramConfig`/`origins`/`meanings` exist here too —
   it does not load index.html's reader/search/tracking code at all.
============================================================ */
(function () {
  const ADMIN_UID = window.ADMIN_UID;

  /* ---------- tiny shared helpers (duplicated on purpose — this page
     doesn't load app.js/tracking.js, so it keeps its own copies rather
     than reaching across pages for one-line utilities) ---------- */
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }
  function siteConfirm(message, opts) {
    opts = opts || {};
    const okLabel = opts.okLabel || 'సరే / OK';
    const cancelLabel = opts.cancelLabel || 'రద్దు / Cancel';
    return new Promise((resolve) => {
      const ov = document.createElement('div');
      ov.className = 'ad-dialog-overlay';
      ov.innerHTML =
        '<div class="ad-dialog" role="dialog" aria-modal="true">' +
        '<div class="ad-dialog-msg">' + escapeHtml(message) + '</div>' +
        '<div class="ad-dialog-actions">' +
        (opts.hideCancel ? '' : '<button class="ad-btn" data-no>' + escapeHtml(cancelLabel) + '</button>') +
        '<button class="ad-btn ' + (opts.danger ? 'ad-btn-danger' : 'ad-btn-primary') + '" data-yes>' + escapeHtml(okLabel) + '</button>' +
        '</div></div>';
      function finish(v) { ov.remove(); resolve(v); }
      ov.querySelector('[data-no]') && (ov.querySelector('[data-no]').onclick = () => finish(false));
      ov.querySelector('[data-yes]').onclick = () => finish(true);
      ov.addEventListener('click', (e) => { if (e.target === ov) finish(false); });
      document.body.appendChild(ov);
    });
  }
  function siteAlert(message) { return siteConfirm(message, { hideCancel: true }); }

  /* ---------- Firebase init (this page's own, minimal bootstrap) ---------- */
  if (typeof firebase === 'undefined') {
    document.getElementById('signedOutState').innerHTML = '<p class="ad-error">Firebase SDK లోడ్ కాలేదు.</p>';
    return;
  }
  firebase.initializeApp(window.FIREBASE_CONFIG);
  const auth = firebase.auth();
  const db = firebase.firestore();
  const provider = new firebase.auth.GoogleAuthProvider();

  function isAdmin(u) { return !!(u && ADMIN_UID && u.uid === ADMIN_UID); }
  window.adminSignIn = () => auth.signInWithPopup(provider).catch((e) => siteAlert('సైన్ ఇన్ కాలేదు: ' + e.message));
  window.adminSignOut = () => auth.signOut();

  auth.onAuthStateChanged((user) => {
    const signedOut = document.getElementById('signedOutState');
    const dashboard = document.getElementById('dashboard');
    if (isAdmin(user)) {
      signedOut.hidden = true;
      dashboard.hidden = false;
      document.getElementById('adminWho').textContent = user.displayName || user.email || '';
      boot();
    } else {
      dashboard.hidden = true;
      signedOut.hidden = false;
      signedOut.querySelector('.ad-gate-msg').textContent = user
        ? 'ఈ ఖాతాకు నిర్వాహక అనుమతి లేదు. / This account is not an admin.'
        : 'కొనసాగించడానికి సైన్ ఇన్ చేయండి. / Sign in to continue.';
    }
  });

  /* ---------- data foundation: same shape app.js builds on index.html ---------- */
  const stotramConfig = window.STOTRAS_DATA || {};
  const origins = Object.fromEntries(Object.entries(stotramConfig).map(([k, v]) => [k, v.origin || '']));
  const meanings = Object.fromEntries(Object.entries(stotramConfig).map(([k, v]) => [k, v.meanings || {}]));

  const THEMES = {
    vishnu:  { color: '#3070c0', icon: '🔱', label: 'విష్ణు' },
    lalitha: { color: '#c04070', icon: '🪷', label: 'లలిత/దేవి' },
    shiva:   { color: '#5088b0', icon: '🙏', label: 'శివ' },
    venkat:  { color: '#c89838', icon: '⛰️', label: 'వేంకటేశ్వర' },
    ganesha: { color: '#e08040', icon: '🐘', label: 'గణేశ' },
    hanuman: { color: '#d06030', icon: '🦍', label: 'హనుమాన్' },
    lakshmi: { color: '#e0b840', icon: '💎', label: 'లక్ష్మి' },
    saibaba: { color: '#d08040', icon: '🌟', label: 'సాయి' },
    ayyappa: { color: '#4080c8', icon: '🏔️', label: 'అయ్యప్ప' },
    durga:   { color: '#d04050', icon: '🔥', label: 'దుర్గా' },
    govinda: { color: '#4090d0', icon: '🦚', label: 'కృష్ణ/గోవింద' },
    bilva:   { color: '#409848', icon: '🍃', label: 'బిల్వ' },
    harati:  { color: '#ffaa3c', icon: '🪔', label: 'హారతి' },
  };
  const CATEGORIES = [
    { slug: 'sahasranama', label: 'సహస్రనామావళి' },
    { slug: 'ashtottara',  label: 'అష్టోత్తర శతనామావళి' },
    { slug: 'stotras',     label: 'స్తోత్రములు' },
    { slug: 'aratis',      label: 'హారతులు' },
  ];

  const BUILTIN = {};
  Object.keys(stotramConfig).forEach((k) => {
    BUILTIN[k] = {
      cfg: JSON.parse(JSON.stringify(stotramConfig[k])),
      origin: origins[k] || '',
      meanings: JSON.parse(JSON.stringify(meanings[k] || {})),
    };
  });
  const isBuiltin = (k) => Object.prototype.hasOwnProperty.call(BUILTIN, k);

  const cloudDocs = new Map();   // id -> raw Firestore doc, for every stotra in the collection
  let booted = false;

  async function boot() {
    if (booted) return;
    booted = true;
    await loadContent();
    renderContent();
    showTab('content');
  }

  /* ---------- Content tab: list + add/edit/delete/revert ---------- */
  async function loadContent() {
    try {
      const snap = await db.collection('stotras').get();
      cloudDocs.clear();
      snap.forEach((doc) => cloudDocs.set(doc.id, { id: doc.id, ...doc.data() }));
    } catch (e) {
      console.warn('[admin] content load failed', e);
    }
  }

  function statusOf(key) {
    if (isBuiltin(key)) return cloudDocs.has(key) ? 'edited' : 'builtin';
    return 'cloud';
  }
  const STATUS_LABEL = { builtin: 'అంతర్నిర్మిత', edited: 'సవరించబడింది', cloud: 'మీరు చేర్చినది' };

  function renderContent() {
    const rows = [
      ...Object.keys(BUILTIN).filter((k) => !stotramConfig[k] || !stotramConfig[k].hidden),
      ...[...cloudDocs.keys()].filter((k) => !isBuiltin(k)),
    ];
    const box = document.getElementById('contentTable');
    box.innerHTML = rows.map((key) => {
      const cfg = stotramConfig[key] || {};
      const status = statusOf(key);
      return '<div class="ad-row">' +
        '<div class="ad-row-main">' +
          '<span class="ad-row-title">' + escapeHtml(cfg.title || key) + '</span>' +
          '<span class="ad-row-tag ad-tag-' + status + '">' + STATUS_LABEL[status] + '</span>' +
        '</div>' +
        '<div class="ad-row-actions">' +
          '<button class="ad-mini" data-edit="' + key + '">✏️ సవరించు</button>' +
          (status === 'edited' ? '<button class="ad-mini" data-revert="' + key + '">↩︎ తిరిగి మార్చు</button>' : '') +
          (status !== 'builtin' && status !== 'edited' ? '<button class="ad-mini ad-mini-danger" data-del="' + key + '">🗑️ తొలగించు</button>' : '') +
        '</div></div>';
    }).join('') || '<p class="ad-empty">స్తోత్రాలు లేవు.</p>';

    box.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => openEditor(b.dataset.edit));
    box.querySelectorAll('[data-revert]').forEach((b) => b.onclick = () => revertStotram(b.dataset.revert));
    box.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => deleteStotram(b.dataset.del));
  }

  function openEditor(editKey) {
    const panel = document.getElementById('editorPanel');
    document.getElementById('edEditKey').value = editKey || '';
    const catOpts = CATEGORIES.map((c) => '<option value="' + c.slug + '">' + c.label + '</option>').join('')
      + '<option value="__new">＋ కొత్త విభాగం…</option>';
    const themeOpts = Object.keys(THEMES).map((k) => '<option value="' + k + '">' + THEMES[k].label + '</option>').join('');
    document.getElementById('edCat').innerHTML = catOpts;
    document.getElementById('edTheme').innerHTML = themeOpts;

    if (editKey && stotramConfig[editKey]) {
      const c = stotramConfig[editKey];
      const doc = cloudDocs.get(editKey);
      set('edTitle', c.title); set('edSubtitle', c.subtitle || '');
      set('edTheme', (c.theme || '').replace('-theme', ''));
      set('edCat', (doc && doc.category) || c.__cat || 'stotras');
      set('edDesc', (doc && doc.desc) || c.__desc || ''); set('edOrigin', c.origin || '');
      set('edSlokams', (c.data || []).map((s) => s.text).join('\n\n'));
    } else {
      ['edTitle', 'edSubtitle', 'edDesc', 'edOrigin', 'edSlokams', 'edCatNew'].forEach((id) => set(id, ''));
      set('edCat', 'stotras'); set('edTheme', 'vishnu');
    }
    const bi = !!(editKey && isBuiltin(editKey));
    document.getElementById('edCatNew').style.display = 'none';
    document.getElementById('edThemeCatRow').style.display = bi ? 'none' : '';
    document.getElementById('edBuiltinNote').style.display = bi ? '' : 'none';
    document.getElementById('edPub').checked = true;
    document.getElementById('edErr').textContent = '';
    document.getElementById('edOcrReview').innerHTML = '';
    document.getElementById('editorTitle').textContent = editKey ? '✏️ సవరించండి' : '➕ కొత్త స్తోత్రం';
    panel.hidden = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function closeEditor() { document.getElementById('editorPanel').hidden = true; }
  function set(id, v) { const el = document.getElementById(id); if (el) el.value = v; }
  function val(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }

  async function saveEditor() {
    const err = document.getElementById('edErr');
    const title = val('edTitle');
    const data = (val('edSlokams') || '').split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)
      .map((text, i) => ({ number: String(i + 1), text }));
    if (!title) { err.textContent = '⚠️ శీర్షిక అవసరం'; return; }
    if (!data.length) { err.textContent = '⚠️ కనీసం ఒక శ్లోకం అవసరం'; return; }

    const catSel = val('edCat');
    let category, categoryLabel;
    if (catSel === '__new') {
      categoryLabel = val('edCatNew');
      if (!categoryLabel) { err.textContent = '⚠️ కొత్త విభాగం పేరు రాయండి'; return; }
      category = 'cat-' + Math.abs(hashStr(categoryLabel)).toString(36);
    } else {
      category = catSel;
      categoryLabel = (CATEGORIES.find((c) => c.slug === catSel) || {}).label || catSel;
    }
    const theme = val('edTheme');
    const doc = {
      title, subtitle: val('edSubtitle'), theme, category, categoryLabel,
      desc: val('edDesc'), origin: val('edOrigin'),
      icon: (THEMES[theme] || {}).icon || '🕉️',
      data,
      published: document.getElementById('edPub').checked,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    const editKey = val('edEditKey');
    err.textContent = '⏳ సేవ్ అవుతోంది…';
    try {
      if (editKey) await db.collection('stotras').doc(editKey).set(doc, { merge: true });
      else await db.collection('stotras').add(doc);
      await loadContent();
      renderContent();
      closeEditor();
    } catch (e) {
      err.textContent = '❌ సేవ్ కాలేదు: ' + (e && e.message ? e.message : e);
    }
  }
  function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

  async function revertStotram(key) {
    const ok = await siteConfirm('"' + (stotramConfig[key] ? stotramConfig[key].title : key) + '" ను అసలు రూపానికి తిరిగి మార్చాలా?', { okLabel: 'తిరిగి మార్చు', danger: true });
    if (!ok) return;
    try { await db.collection('stotras').doc(key).delete(); await loadContent(); renderContent(); }
    catch (e) { siteAlert('❌ ' + e.message); }
  }
  async function deleteStotram(key) {
    const ok = await siteConfirm('"' + (stotramConfig[key] ? stotramConfig[key].title : key) + '" ను తొలగించాలా?', { okLabel: 'తొలగించు', danger: true });
    if (!ok) return;
    try { await db.collection('stotras').doc(key).delete(); await loadContent(); renderContent(); }
    catch (e) { siteAlert('❌ ' + e.message); }
  }

  /* ---------- OCR ---------- */
  function fileToB64(f) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1]);
      r.onerror = rej;
      r.readAsDataURL(f);
    });
  }
  async function ocrExtract() {
    const status = document.getElementById('edOcrStatus');
    const files = document.getElementById('edImages').files;
    if (!files || !files.length) { status.textContent = '⚠️ ముందు చిత్రం ఎంచుకోండి'; return; }
    status.textContent = '⏳ చిత్రం చదువుతోంది…';
    try {
      const token = await auth.currentUser.getIdToken();
      const images = [];
      for (const f of files) images.push({ mime: f.type || 'image/jpeg', data: await fileToB64(f) });
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ images, doubleCheck: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || ('HTTP ' + res.status));
      const text = (body.text || '').trim();
      if (!text) throw new Error('ఖాళీ ఫలితం — స్పష్టమైన చిత్రం ప్రయత్నించండి');
      const box = document.getElementById('edSlokams');
      box.value = box.value.trim() ? (box.value.trim() + '\n\n' + text) : text;
      showOcrReview(text, body);
    } catch (e) {
      status.textContent = '❌ ' + (e && e.message ? e.message : e);
    }
  }
  function showOcrReview(text, body) {
    const status = document.getElementById('edOcrStatus');
    const rev = document.getElementById('edOcrReview');
    const unsure = Array.isArray(body.uncertain) ? body.uncertain : [];
    const illegible = (text.match(/⟨\?⟩/g) || []).length;
    if (!body.checked) status.textContent = '✅ వచ్చింది — చిత్రంతో సరిచూసుకోండి';
    else if (!unsure.length && !illegible) status.textContent = '✅ రెండు రీడింగ్‌లు ఒకేలా ఉన్నాయి';
    else status.textContent = '⚠️ ' + (unsure.length + illegible) + ' చోట్ల అనుమానం — క్రింద చూడండి';
    if (!unsure.length && !illegible) { rev.innerHTML = ''; return; }
    let html = '<div class="ad-rev-head">🔎 ఇవి సరిచూసుకోండి</div>';
    if (illegible) html += '<div class="ad-rev-item">⟨?⟩ గుర్తులు ' + illegible + ' ఉన్నాయి.</div>';
    unsure.forEach((u) => {
      html += '<div class="ad-rev-item"><b>లైన్ ' + u.line + '</b><div>1: ' + escapeHtml(u.a || '(ఖాళీ)') + '</div><div>2: ' + escapeHtml(u.b || '(ఖాళీ)') + '</div></div>';
    });
    rev.innerHTML = html;
  }

  /* ---------- Export tab ---------- */
  async function exportStotras() {
    try {
      const snap = await db.collection('stotras').get();
      const docs = [];
      snap.forEach((d) => docs.push({ id: d.id, isOverrideOfBuiltin: isBuiltin(d.id), ...d.data() }));
      const out = { exportedAt: new Date().toISOString(), project: 'stotramulu', count: docs.length, stotras: docs };
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'stotramulu-stotras-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      siteAlert('✅ ' + docs.length + ' స్తోత్రాలు ఎగుమతి అయ్యాయి');
    } catch (e) { siteAlert('❌ ' + e.message); }
  }

  /* ---------- Feedback tab ---------- */
  const TYPE_LABEL = { correction: '📖 దిద్దుబాటు', problem: '⚠️ సమస్య', suggestion: '💡 సూచన', other: '🙏 ఇతరం' };
  async function loadFeedback() {
    const box = document.getElementById('feedbackList');
    box.innerHTML = '<p class="ad-empty">⏳ తెస్తోంది…</p>';
    try {
      const snap = await db.collection('feedback').orderBy('createdAt', 'desc').limit(50).get();
      const rows = [];
      snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
      if (!rows.length) { box.innerHTML = '<p class="ad-empty">💬 ఇంకా అభిప్రాయాలు లేవు</p>'; return; }
      box.innerHTML = rows.map((r) => {
        const when = r.createdAt && r.createdAt.toDate ? r.createdAt.toDate().toLocaleString() : '';
        const where = r.stotramTitle || r.screen || '';
        return '<div class="ad-fb-item' + (r.handled ? ' ad-fb-done' : '') + '">' +
          '<div class="ad-fb-top"><span>' + (TYPE_LABEL[r.type] || TYPE_LABEL.other) + '</span><span class="ad-fb-when">' + escapeHtml(when) + '</span></div>' +
          '<div class="ad-fb-msg">' + escapeHtml(r.message || '') + '</div>' +
          '<div class="ad-fb-meta">' + escapeHtml(r.name || 'పేరు లేదు') + (r.contact ? ' · ' + escapeHtml(r.contact) : '') + (where ? ' · ' + escapeHtml(where) : '') + '</div>' +
          '<div class="ad-row-actions">' +
          '<button class="ad-mini" data-fbdone="' + r.id + '">' + (r.handled ? '↩︎ తిరిగి తెరువు' : '✓ పూర్తయింది') + '</button>' +
          '<button class="ad-mini ad-mini-danger" data-fbdel="' + r.id + '">🗑️ తొలగించు</button>' +
          '</div></div>';
      }).join('');
      box.querySelectorAll('[data-fbdone]').forEach((b) => b.onclick = async () => {
        const id = b.dataset.fbdone;
        const row = rows.find((x) => x.id === id);
        await db.collection('feedback').doc(id).update({ handled: !(row && row.handled) });
        loadFeedback();
      });
      box.querySelectorAll('[data-fbdel]').forEach((b) => b.onclick = async () => {
        if (!await siteConfirm('ఈ అభిప్రాయం తొలగించాలా?', { okLabel: 'తొలగించు', danger: true })) return;
        await db.collection('feedback').doc(b.dataset.fbdel).delete();
        loadFeedback();
      });
    } catch (e) {
      box.innerHTML = '<p class="ad-error">❌ ' + escapeHtml(e.message || String(e)) + '</p>';
    }
  }

  /* ---------- Weekday tab ---------- */
  const DAY_TE = ['ఆదివారం', 'సోమవారం', 'మంగళవారం', 'బుధవారం', 'గురువారం', 'శుక్రవారం', 'శనివారం'];
  const DEITY_LABEL = {
    vishnu: 'విష్ణు', lalitha: 'లలిత/దేవి', shiva: 'శివ', venkat: 'వేంకటేశ్వర',
    ganesha: 'గణేశ', hanuman: 'హనుమాన్', lakshmi: 'లక్ష్మి', saibaba: 'సాయి',
    ayyappa: 'అయ్యప్ప', durga: 'దుర్గా', govinda: 'కృష్ణ/గోవింద',
  };
  let WEEK_MAP = null;
  async function loadWeekday() {
    const box = document.getElementById('weekdayEditor');
    box.innerHTML = '<p class="ad-empty">⏳ తెస్తోంది…</p>';
    try {
      const snap = await db.collection('config').doc('weekday').get();
      WEEK_MAP = {};
      for (let i = 0; i < 7; i++) WEEK_MAP[i] = { deities: [], stotras: [] };
      if (snap.exists) {
        const data = snap.data() || {};
        for (let i = 0; i < 7; i++) {
          const row = data[String(i)] || data[i];
          if (row) WEEK_MAP[i] = { deities: row.deities || [], stotras: row.stotras || [] };
        }
      }
      renderWeekday();
    } catch (e) {
      box.innerHTML = '<p class="ad-error">❌ ' + escapeHtml(e.message) + '</p>';
    }
  }
  function renderWeekday() {
    const box = document.getElementById('weekdayEditor');
    const allKeys = Object.keys(stotramConfig).filter((k) => stotramConfig[k] && !stotramConfig[k].hidden);
    const deities = Object.keys(DEITY_LABEL);
    box.innerHTML = DAY_TE.map((name, i) => {
      const row = WEEK_MAP[i];
      return '<details class="ad-wd-day"><summary><b>' + name + '</b> <span>' + ((row.deities.length + row.stotras.length)) + ' ఎంపిక</span></summary>' +
        '<div class="ad-wd-label">దేవతలు</div><div class="ad-wd-chips">' +
        deities.map((d) => '<button class="ad-chip' + (row.deities.includes(d) ? ' ad-chip-on' : '') + '" data-day="' + i + '" data-deity="' + d + '">' + DEITY_LABEL[d] + '</button>').join('') +
        '</div><div class="ad-wd-label">స్తోత్రాలు (ఐచ్ఛికం)</div><div class="ad-wd-chips ad-wd-scroll">' +
        allKeys.map((k) => '<button class="ad-chip' + (row.stotras.includes(k) ? ' ad-chip-on' : '') + '" data-day="' + i + '" data-key="' + k + '">' + escapeHtml(stotramConfig[k].title || k) + '</button>').join('') +
        '</div></details>';
    }).join('');
    box.querySelectorAll('.ad-chip').forEach((b) => {
      b.onclick = () => {
        const day = +b.dataset.day;
        const list = b.dataset.deity ? WEEK_MAP[day].deities : WEEK_MAP[day].stotras;
        const v = b.dataset.deity || b.dataset.key;
        const at = list.indexOf(v);
        if (at >= 0) list.splice(at, 1); else list.push(v);
        b.classList.toggle('ad-chip-on', at < 0);
      };
    });
  }
  async function saveWeekday() {
    const out = {};
    for (let i = 0; i < 7; i++) out[String(i)] = WEEK_MAP[i];
    try {
      await db.collection('config').doc('weekday').set(out);
      siteAlert('✅ వార పూజ క్రమం సేవ్ అయ్యింది');
    } catch (e) { siteAlert('❌ ' + e.message); }
  }

  /* ---------- tabs ---------- */
  function showTab(name) {
    ['content', 'feedback', 'weekday', 'export'].forEach((t) => {
      document.getElementById('tab-' + t).hidden = t !== name;
      document.getElementById('nav-' + t).classList.toggle('ad-nav-active', t === name);
    });
    if (name === 'feedback') loadFeedback();
    if (name === 'weekday') loadWeekday();
  }

  window.showTab = showTab;
  window.openEditor = openEditor;
  window.closeEditor = closeEditor;
  window.saveEditor = saveEditor;
  window.ocrExtract = ocrExtract;
  window.exportStotras = exportStotras;
  window.saveWeekday = saveWeekday;
  window.onEdCatChange = () => {
    document.getElementById('edCatNew').style.display = val('edCat') === '__new' ? '' : 'none';
  };
})();
