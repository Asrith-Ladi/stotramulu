/* ============================================================
   ADMIN DASHBOARD: the full content-management surface, loaded only
   by admin.html (never shipped to regular visitors). Gated by Firebase
   auth + ADMIN_UID; the real authorization boundary is the Firestore
   security rules (see docs/firestore.rules.proposed), this is just the
   UI gate.

   Tabs:
     స్తోత్రాలు   content list + add / edit / revert / delete + OCR
     అభిప్రాయాలు  feedback triage: status, reply, filters, delete
     కొత్తవి      "What's new" entries (Firestore `updates`)
     వార పూజ     the weekday → deity / stotram map (config/weekday)
     ఎగుమతి      JSON backup of everything the dashboard manages

   This page loads its own copy of the 32 stotra data files (same as
   index.html) so the built-in configs exist here too; it does not load
   index.html's reader/search/tracking code at all. Classic script: one
   IIFE, only the handlers admin.html calls are put on window.
============================================================ */
(function () {
  'use strict';

  const ADMIN_UID = window.ADMIN_UID;
  const $ = (id) => document.getElementById(id);

  /* ============================================================
     Small helpers (own copies: this page doesn't load app.js)
  ============================================================ */
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function icon(name, cls) {
    return '<svg class="icon-inline' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="/icons.svg#icon-' + name + '"/></svg>';
  }
  const MSG_ICON = { error: 'warning', ok: 'check-circle', busy: 'clock', info: 'info-circle' };
  function msgHtml(kind, text) {
    return '<span class="ad-msg" data-kind="' + kind + '">' + icon(MSG_ICON[kind] || 'info-circle') + '<span>' + escapeHtml(text) + '</span></span>';
  }
  // Inline status line next to a form's buttons. No text → the slot collapses.
  function setMsg(slot, kind, text) {
    const el = typeof slot === 'string' ? $(slot) : slot;
    if (el) el.innerHTML = text ? msgHtml(kind, text) : '';
  }
  function set(id, v) { const el = $(id); if (el) el.value = v == null ? '' : v; }
  function val(id) { const el = $(id); return el ? el.value.trim() : ''; }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function reveal(el) { el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }); }

  // Plain-language Firestore errors (the raw message stays in the console).
  function errText(e) {
    const code = e && e.code ? String(e.code).replace(/^firestore\//, '') : '';
    if (code === 'permission-denied') return 'అనుమతి లేదు (Firestore rules) / Permission denied';
    if (code === 'unavailable' || code === 'deadline-exceeded') return 'ఇంటర్నెట్ కనెక్షన్ లేదు, మళ్ళీ ప్రయత్నించండి / Offline, try again';
    if (code === 'not-found') return 'ఈ అంశం ఇప్పుడు లేదు (ఇంకెవరో తొలగించారు) / No longer exists';
    return (e && e.message) ? e.message : String(e);
  }

  /* ---------- dates ---------- */
  // Same spellings as updates.js / messages.js on the site.
  const MONTHS_TE = ['జనవరి', 'ఫిబ్రవరి', 'మార్చి', 'ఏప్రిల్', 'మే', 'జూన్', 'జులై', 'ఆగస్టు', 'సెప్టెంబర్', 'అక్టోబర్', 'నవంబర్', 'డిసెంబర్'];
  const pad2 = (n) => String(n).padStart(2, '0');
  function toDate(v) {
    if (!v) return null;
    if (typeof v.toDate === 'function') return v.toDate();
    if (v instanceof Date) return isNaN(v) ? null : v;
    const d = new Date(v);
    return isNaN(d) ? null : d;
  }
  function fmtDate(d) { return d.getDate() + ' ' + MONTHS_TE[d.getMonth()] + ' ' + d.getFullYear(); }
  function fmtDateTime(d) { return fmtDate(d) + ', ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function relTime(d) {
    const s = Math.round((Date.now() - d.getTime()) / 1000);
    if (s < 60) return 'ఇప్పుడే';
    const m = Math.floor(s / 60);
    if (m < 60) return m + (m === 1 ? ' నిమిషం' : ' నిమిషాల') + ' క్రితం';
    const h = Math.floor(m / 60);
    if (h < 24) return h + (h === 1 ? ' గంట' : ' గంటల') + ' క్రితం';
    const days = Math.floor(h / 24);
    if (days < 7) return days + (days === 1 ? ' రోజు' : ' రోజుల') + ' క్రితం';
    return fmtDate(d);
  }
  const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
  // 'YYYY-MM-DD' → local Date, or null when it isn't a real calendar date.
  function parseYmd(s) {
    if (!YMD_RE.test(String(s || ''))) return null;
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null;
  }
  function todayYmd() { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  // 'YYYY-MM-DD' → "28 సెప్టెంబర్ 2026", exactly as updates.js formatDate()
  // writes it, so the preview shows the date the reader will see.
  function siteDate(ymd) {
    const d = parseYmd(ymd);
    if (!d) return '';
    let s = '';
    try { s = d.toLocaleDateString('te-IN', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { s = ''; }
    if (!/[\u0C00-\u0C7F]/.test(s)) s = fmtDate(d);
    return s.replace(/,\s*(\d{4})$/, ' $1');
  }

  /* ---------- focus: move it somewhere sensible after a panel closes ---------- */
  // The first candidate that is still on the page and visible gets focus.
  // Candidates: elements, selectors, or ids of headings with tabindex="-1".
  // <body> (what activeElement is when nothing had focus) never counts.
  function focusFirst(...cands) {
    for (const c of cands) {
      const el = typeof c === 'string' ? (document.getElementById(c) || document.querySelector(c)) : c;
      if (el && el !== document.body && document.contains(el) && el.getClientRects().length && typeof el.focus === 'function') {
        el.focus();
        return;
      }
    }
  }
  const attrSel = (v) => (window.CSS && typeof CSS.escape === 'function') ? CSS.escape(String(v)) : String(v).replace(/["\\]/g, '\\$&');

  /* ---------- toast (one live region, reused) ---------- */
  let toastTimer = 0;
  let toastClear = 0;
  function toast(text, kind) {
    const t = $('adToast');
    if (!t) return;
    clearTimeout(toastTimer); clearTimeout(toastClear);
    t.classList.remove('show');
    t.dataset.kind = kind === 'error' ? 'error' : 'ok';
    t.innerHTML = icon(kind === 'error' ? 'warning' : 'check-circle') + '<span>' + escapeHtml(text) + '</span>';
    void t.offsetWidth;                       // commit the hidden state so the fade runs
    t.classList.add('show');
    toastTimer = setTimeout(() => {
      t.classList.remove('show');
      toastClear = setTimeout(() => { t.innerHTML = ''; }, 400);
    }, kind === 'error' ? 6000 : 3000);
  }

  /* ---------- confirm / alert dialog (focus-trapped, Esc = cancel) ---------- */
  let dialogSeq = 0;
  function siteConfirm(message, opts) {
    opts = opts || {};
    const okLabel = opts.okLabel || 'సరే / OK';
    const cancelLabel = opts.cancelLabel || 'రద్దు / Cancel';
    const prevFocus = document.activeElement;
    return new Promise((resolve) => {
      const msgId = 'adDialogMsg' + (++dialogSeq);
      const ov = document.createElement('div');
      ov.className = 'ad-dialog-overlay';
      ov.innerHTML =
        '<div class="ad-dialog" role="alertdialog" aria-modal="true" aria-describedby="' + msgId + '">' +
        '<p class="ad-dialog-msg" id="' + msgId + '">' + escapeHtml(message) + '</p>' +
        '<div class="ad-dialog-actions">' +
        (opts.hideCancel ? '' : '<button type="button" class="ad-btn" data-no>' + escapeHtml(cancelLabel) + '</button>') +
        '<button type="button" class="ad-btn ' + (opts.danger ? 'ad-btn-danger' : 'ad-btn-primary') + '" data-yes>' + escapeHtml(okLabel) + '</button>' +
        '</div></div>';
      const prevOverflow = document.body.style.overflow;
      const yes = ov.querySelector('[data-yes]');
      const no = ov.querySelector('[data-no]');
      function finish(v) {
        document.removeEventListener('keydown', onKey, true);
        ov.remove();
        document.body.style.overflow = prevOverflow;
        if (prevFocus && typeof prevFocus.focus === 'function' && document.contains(prevFocus)) prevFocus.focus();
        resolve(v);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); finish(false); return; }
        if (e.key === 'Tab') {
          const btns = [...ov.querySelectorAll('button')];
          const i = btns.indexOf(document.activeElement);
          e.preventDefault();
          const next = e.shiftKey ? (i <= 0 ? btns.length - 1 : i - 1) : (i >= btns.length - 1 ? 0 : i + 1);
          btns[next].focus();
        }
      }
      if (no) no.onclick = () => finish(false);
      yes.onclick = () => finish(true);
      ov.addEventListener('click', (e) => { if (e.target === ov) finish(false); });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(ov);
      document.body.style.overflow = 'hidden';
      (opts.danger && no ? no : yes).focus();   // destructive actions default to "cancel"
    });
  }
  function siteAlert(message) { return siteConfirm(message, { hideCancel: true }); }

  /* ============================================================
     Firebase init + sign-in gate
  ============================================================ */
  if (typeof firebase === 'undefined' || !window.FIREBASE_CONFIG) {
    const m = document.querySelector('#signedOutState .ad-gate-msg');
    if (m) m.textContent = 'Firebase లోడ్ కాలేదు. ఇంటర్నెట్ కనెక్షన్ చూసి పేజీని మళ్ళీ తెరవండి. / Firebase failed to load. Check the connection and reload.';
    return;
  }
  if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
  const auth = firebase.auth();
  const db = firebase.firestore();
  const FieldValue = firebase.firestore.FieldValue;
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  function isAdmin(u) { return !!(u && ADMIN_UID && u.uid === ADMIN_UID); }

  window.adminSignIn = function () {
    auth.signInWithPopup(provider).catch((e) => {
      const code = e && e.code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      if (code === 'auth/popup-blocked') { auth.signInWithRedirect(provider); return; }
      siteAlert('సైన్ ఇన్ కాలేదు / Sign-in failed:\n' + (e && e.message ? e.message : e));
    });
  };
  window.adminSignOut = async function () {
    if (hasUnsaved() && !(await siteConfirm('సేవ్ చేయని మార్పులు పోతాయి. సైన్ అవుట్ చేయాలా?\nUnsaved changes will be lost. Sign out?', { okLabel: 'సైన్ అవుట్', danger: true }))) return;
    auth.signOut();
  };

  // Registered at the very end of this file, once every binding below exists.
  function onAuth(user) {
    const gate = $('signedOutState');
    const dash = $('dashboard');
    if (isAdmin(user)) {
      gate.hidden = true;
      dash.hidden = false;
      $('adminWho').textContent = user.displayName || user.email || '';
      boot();
      return;
    }
    // Signed out (or switched to another account) after the dashboard loaded:
    // reload, so feedback names and contacts don't stay in memory or the DOM.
    if (booted) { location.reload(); return; }
    dash.hidden = true;
    gate.hidden = false;
    gate.querySelector('.ad-gate-msg').textContent = user
      ? 'ఈ ఖాతాకు (' + (user.email || user.uid) + ') నిర్వాహక అనుమతి లేదు. / This account is not an admin.'
      : 'కొనసాగించడానికి నిర్వాహక Google ఖాతాతో సైన్ ఇన్ చేయండి. / Sign in with the admin Google account.';
    $('gateSignIn').hidden = !!user;
    $('gateSignOut').hidden = !user;
  }

  /* ============================================================
     Data foundation: the built-in stotras exactly as the files define them
  ============================================================ */
  const stotramConfig = window.STOTRAS_DATA || {};

  const THEMES = {
    vishnu:  { icon: '🔱', label: 'విష్ణు' },
    lalitha: { icon: '🪷', label: 'లలిత/దేవి' },
    shiva:   { icon: '🙏', label: 'శివ' },
    venkat:  { icon: '⛰️', label: 'వేంకటేశ్వర' },
    ganesha: { icon: '🐘', label: 'గణేశ' },
    hanuman: { icon: '🦍', label: 'హనుమాన్' },
    lakshmi: { icon: '💎', label: 'లక్ష్మి' },
    saibaba: { icon: '🌟', label: 'సాయి' },
    ayyappa: { icon: '🏔️', label: 'అయ్యప్ప' },
    durga:   { icon: '🔥', label: 'దుర్గా' },
    govinda: { icon: '🦚', label: 'కృష్ణ/గోవింద' },
    bilva:   { icon: '🍃', label: 'బిల్వ' },
    harati:  { icon: '🪔', label: 'హారతి' },
  };
  const THEME_ALIAS = { chalisa: 'hanuman', manidweepa: 'lalitha', krishna: 'govinda' };
  const CATEGORIES = [
    { slug: 'sahasranama', label: 'సహస్రనామావళి' },
    { slug: 'ashtottara',  label: 'అష్టోత్తర శతనామావళి' },
    { slug: 'stotras',     label: 'స్తోత్రములు' },
    { slug: 'aratis',      label: 'హారతులు' },
  ];

  const BUILTIN = {};
  Object.keys(stotramConfig).forEach((k) => { BUILTIN[k] = clone(stotramConfig[k]); });
  const isBuiltin = (k) => Object.prototype.hasOwnProperty.call(BUILTIN, k);
  const bareTheme = (t) => String(t || '').replace(/-theme$/, '');

  const cloudDocs = new Map();   // id → raw Firestore doc, for every stotra in the collection
  const content = { loaded: false, error: '' };
  let booted = false;

  const TABS = ['content', 'feedback', 'updates', 'weekday', 'export'];

  async function boot() {
    if (booted) return;
    booted = true;
    wireEvents();
    const fromHash = (location.hash || '').slice(1);
    showTab(TABS.includes(fromHash) ? fromHash : 'content');
    await loadContent();
    renderContent();
    // The weekday chips list cloud stotras too; redraw if it rendered first.
    if (WEEK_MAP && !wdDirty) renderWeekday();
    // Fill the feedback badge in the background even if that tab isn't open.
    if (!fb.loaded && !fb.loading) loadFeedback(false);
  }

  /* ============================================================
     Content tab: list + add / edit / delete / revert
  ============================================================ */
  async function loadContent() {
    try {
      const snap = await db.collection('stotras').get();
      cloudDocs.clear();
      snap.forEach((doc) => cloudDocs.set(doc.id, { id: doc.id, ...doc.data() }));
      content.loaded = true;
      content.error = '';
    } catch (e) {
      console.warn('[admin] content load failed', e);
      content.error = errText(e);
    }
  }

  // What the site actually shows for a key: the file version with any
  // Firestore override applied (same fields admin.js's applyOverride uses),
  // or the Firestore doc alone for stotras that exist only in the cloud.
  function sourceFor(key) {
    const doc = cloudDocs.get(key) || null;
    const base = isBuiltin(key) ? BUILTIN[key] : null;
    const pick = (field, fallback) => (doc && doc[field] !== undefined && doc[field] !== null ? doc[field] : fallback);
    return {
      title: (doc && doc.title) || (base && base.title) || '',
      subtitle: pick('subtitle', (base && base.subtitle) || ''),
      theme: (doc && doc.theme) || (base ? bareTheme(base.theme) : 'vishnu'),
      category: (doc && doc.category) || 'stotras',
      categoryLabel: (doc && doc.categoryLabel) || '',
      desc: (doc && doc.desc) || '',
      origin: pick('origin', (base && base.origin) || ''),
      data: (doc && Array.isArray(doc.data) && doc.data.length) ? doc.data : ((base && base.data) || []),
      published: doc ? doc.published !== false : true,
      icon: (doc && doc.icon) || '',
    };
  }
  function contentStatus(key) {
    if (isBuiltin(key)) return cloudDocs.has(key) ? 'edited' : 'builtin';
    return 'cloud';
  }
  const CONTENT_BADGE = {
    builtin: { icon: 'book', label: 'అంతర్నిర్మిత' },
    edited: { icon: 'edit', label: 'సవరించబడింది' },
    cloud: { icon: 'cloud', label: 'మీరు చేర్చినది' },
  };
  function medalFor(key, src) {
    const t = THEMES[src.theme] || THEMES[THEME_ALIAS[src.theme]];
    return src.icon || (t && t.icon) || '🕉️';
  }
  // Bilingual labels ("తెలుగు · English") may wrap on a phone: the no-break
  // space keeps the dot with the Telugu half, so the English starts line two.
  function badge(kind, iconName, label) {
    return '<span class="ad-badge" data-kind="' + kind + '">' + icon(iconName) + escapeHtml(label).replace(/ · /g, '&nbsp;· ') + '</span>';
  }

  function contentRows() {
    const builtins = Object.keys(BUILTIN).filter((k) => !BUILTIN[k].hidden);
    const cloudOnly = [...cloudDocs.keys()].filter((k) => !isBuiltin(k))
      .sort((a, b) => String(sourceFor(a).title).localeCompare(String(sourceFor(b).title), 'te'));
    return builtins.concat(cloudOnly);
  }

  function renderContent() {
    const box = $('contentTable');
    const summary = $('contentSummary');
    if (!content.loaded && content.error) {
      summary.textContent = '';
      box.innerHTML = emptyHtml('warning', 'స్తోత్రాల జాబితా రాలేదు / Could not load', content.error, true, 'retry-content');
      return;
    }
    const all = contentRows();
    const q = val('contentSearch').toLowerCase();
    const rows = q ? all.filter((k) => {
      const s = sourceFor(k);
      return (s.title + ' ' + s.subtitle + ' ' + k).toLowerCase().includes(q);
    }) : all;

    const edited = all.filter((k) => contentStatus(k) === 'edited').length;
    const added = all.filter((k) => contentStatus(k) === 'cloud').length;
    summary.textContent = all.length + ' స్తోత్రాలు · ' + edited + ' సవరించినవి · ' + added + ' మీరు చేర్చినవి' +
      (q ? ' · వెతుకులాటలో ' + rows.length : '');

    if (!rows.length) {
      box.innerHTML = emptyHtml('search', 'ఏమీ దొరకలేదు / Nothing found', 'వేరే పేరుతో వెతకండి.');
      return;
    }
    box.innerHTML = '<ul class="ad-rows">' + rows.map((key) => {
      const src = sourceFor(key);
      const status = contentStatus(key);
      const b = CONTENT_BADGE[status];
      const k = escapeHtml(key);
      const title = src.title || key;
      const verses = src.data.length;
      return '<li class="ad-row">' +
        '<div class="ad-row-main">' +
          '<span class="ad-medal" aria-hidden="true">' + escapeHtml(medalFor(key, src)) + '</span>' +
          '<div class="ad-row-text">' +
            '<span class="ad-row-title">' + escapeHtml(title) + '</span>' +
            '<span class="ad-row-sub">' + badge(status, b.icon, b.label) +
              (src.published ? '' : badge('draft', 'lock', status === 'edited' ? 'సవరణ ప్రచురించలేదు' : 'ప్రచురించలేదు')) +
              '<span>' + verses + (verses === 1 ? ' శ్లోకం' : ' శ్లోకాలు') + '</span>' +
              (src.subtitle ? '<span lang="en">' + escapeHtml(src.subtitle) + '</span>' : '') +
            '</span>' +
          '</div>' +
        '</div>' +
        '<div class="ad-row-actions">' +
          '<button type="button" class="ad-btn ad-btn-sm" data-edit="' + k + '" aria-label="సవరించు: ' + escapeHtml(title) + '">' + icon('edit') + 'సవరించు</button>' +
          (status === 'edited' ? '<button type="button" class="ad-btn ad-btn-sm" data-revert="' + k + '" aria-label="అసలు రూపానికి మార్చు: ' + escapeHtml(title) + '">' + icon('revert') + 'తిరిగి మార్చు</button>' : '') +
          (status === 'cloud' ? '<button type="button" class="ad-btn ad-btn-sm ad-btn-danger-quiet" data-del="' + k + '" aria-label="తొలగించు: ' + escapeHtml(title) + '">' + icon('delete') + 'తొలగించు</button>' : '') +
        '</div></li>';
    }).join('') + '</ul>';
  }

  function emptyHtml(iconName, title, text, isError, retryAct) {
    return '<div class="ad-empty"' + (isError ? ' data-kind="error" role="alert"' : '') + '>' +
      '<span class="ad-empty-mark">' + icon(iconName) + '</span>' +
      '<h3>' + escapeHtml(title) + '</h3>' +
      (text ? '<p>' + escapeHtml(text) + '</p>' : '') +
      (retryAct ? '<button type="button" class="ad-btn" data-act="' + retryAct + '">' + icon('reset') + 'మళ్ళీ ప్రయత్నించండి / Try again</button>' : '') +
      '</div>';
  }
  function skeletonHtml(n) {
    return '<div class="ad-skel" role="status" aria-label="తెస్తోంది / Loading">' + '<span></span>'.repeat(n || 3) + '</div>';
  }

  /* ---------- editor ---------- */
  let editorBaseline = null;     // { key, data, joined } of what the editor opened with
  let edDirty = false;
  let edReturn = null;           // the button that opened the editor

  function splitVerses(raw) {
    const t = String(raw || '').trim();
    return t ? t.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean) : [];
  }
  function joinVerses(data) { return (data || []).map((s) => String(s && s.text != null ? s.text : '')).join('\n\n').trim(); }
  function sameVerses(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (String(a[i].text).trim() !== String(b[i].text).trim() || String(a[i].number) !== String(b[i].number)) return false;
    }
    return true;
  }
  // The verses to save. Untouched text keeps the original array exactly (some
  // built-in verses contain blank lines, which a re-split would break apart);
  // edited text keeps the original labels when the verse count is unchanged.
  function editorVerses() {
    const raw = $('edSlokams').value.trim();
    const b = editorBaseline;
    if (b && b.data.length && raw === b.joined) return { data: b.data, unchanged: true };
    const texts = splitVerses(raw);
    const keep = !!(b && b.data.length === texts.length);
    return {
      data: texts.map((text, i) => ({
        number: keep && b.data[i] && b.data[i].number != null ? String(b.data[i].number) : String(i + 1),
        text,
      })),
      unchanged: false,
    };
  }
  function updateVerseCount() {
    const v = editorVerses();
    const n = v.data.length;
    const base = (editorBaseline && editorBaseline.data) || [];
    const labelled = base.some((d) => d && d.number != null && !/^\d+$/.test(String(d.number)));
    let t = n + (n === 1 ? ' శ్లోకం' : ' శ్లోకాలు');
    if (!v.unchanged && base.length && n !== base.length && labelled) t += ' · సంఖ్య మారింది: లేబుళ్ళు 1, 2, 3… గా మారతాయి';
    $('edVerseCount').textContent = t;
  }

  async function openEditor(editKey) {
    editKey = typeof editKey === 'string' ? editKey : '';
    const opener = document.activeElement;
    if (!(await confirmDiscard(edDirty && !$('editorPanel').hidden))) return;
    const panel = $('editorPanel');
    if (panel.hidden || !panel.contains(opener)) edReturn = opener;
    const src = editKey ? sourceFor(editKey) : null;

    let catOpts = CATEGORIES.map((c) => '<option value="' + c.slug + '">' + escapeHtml(c.label) + '</option>').join('');
    if (src && src.category && !CATEGORIES.some((c) => c.slug === src.category)) {
      catOpts += '<option value="' + escapeHtml(src.category) + '">' + escapeHtml(src.categoryLabel || src.category) + '</option>';
    }
    catOpts += '<option value="__new">＋ కొత్త విభాగం…</option>';
    $('edCat').innerHTML = catOpts;
    $('edTheme').innerHTML = Object.keys(THEMES).map((k) => '<option value="' + k + '">' + escapeHtml(THEMES[k].label) + '</option>').join('');

    $('edEditKey').value = editKey;
    if (src) {
      set('edTitle', src.title); set('edSubtitle', src.subtitle);
      set('edTheme', THEMES[src.theme] ? src.theme : (THEME_ALIAS[src.theme] || 'vishnu'));
      set('edCat', src.category); set('edDesc', src.desc); set('edOrigin', src.origin);
      set('edSlokams', joinVerses(src.data));
      $('edPub').checked = src.published;
      editorBaseline = { key: editKey, data: src.data, joined: joinVerses(src.data) };
    } else {
      ['edTitle', 'edSubtitle', 'edDesc', 'edOrigin', 'edSlokams', 'edCatNew'].forEach((id) => set(id, ''));
      set('edCat', 'stotras'); set('edTheme', 'vishnu');
      $('edPub').checked = true;
      editorBaseline = null;
    }
    const bi = !!(editKey && isBuiltin(editKey));
    $('edCatNewRow').hidden = true;
    $('edThemeCatRow').hidden = bi;
    $('edBuiltinNote').hidden = !bi;
    setMsg('edErr'); setMsg('edOcrStatus');
    $('edOcrReview').innerHTML = '';
    $('edImages').value = '';
    $('editorTitle').textContent = editKey ? 'సవరించండి: ' + (src.title || editKey) : 'కొత్త స్తోత్రం / New stotram';
    updateVerseCount();
    edDirty = false;
    panel.hidden = false;
    reveal(panel);
    $('edTitle').focus({ preventScroll: true });
  }
  async function closeEditor() {
    if (!(await confirmDiscard(edDirty))) return;
    const key = val('edEditKey');
    hideEditor();
    focusFirst(edReturn, key ? '#contentTable [data-edit="' + attrSel(key) + '"]' : null, 'contentTitle');
  }
  function hideEditor() {
    $('editorPanel').hidden = true;
    edDirty = false;
    editorBaseline = null;
  }

  async function saveEditor() {
    const btn = $('edSaveBtn');
    const title = val('edTitle');
    const verses = editorVerses();
    if (!title) { setMsg('edErr', 'error', 'శీర్షిక అవసరం / Title is required'); $('edTitle').focus(); return; }
    if (!verses.data.length) { setMsg('edErr', 'error', 'కనీసం ఒక శ్లోకం అవసరం / Add at least one verse'); $('edSlokams').focus(); return; }

    const editKey = val('edEditKey');
    const bi = !!(editKey && isBuiltin(editKey));
    const published = $('edPub').checked;
    let doc;
    if (bi) {
      // Built-in override: only the fields admin.js applies. When the verses
      // match the file, drop the stored copy so the bundled text (and its
      // meanings) stay in use.
      doc = {
        title, subtitle: val('edSubtitle'), desc: val('edDesc'), origin: val('edOrigin'),
        data: sameVerses(verses.data, BUILTIN[editKey].data || []) ? FieldValue.delete() : verses.data,
        published,
        updatedAt: FieldValue.serverTimestamp(),
      };
    } else {
      const catSel = val('edCat');
      let category;
      let categoryLabel;
      if (catSel === '__new') {
        categoryLabel = val('edCatNew');
        if (!categoryLabel) { setMsg('edErr', 'error', 'కొత్త విభాగం పేరు రాయండి / Name the new category'); $('edCatNew').focus(); return; }
        category = 'cat-' + Math.abs(hashStr(categoryLabel)).toString(36);
      } else {
        category = catSel;
        const known = CATEGORIES.find((c) => c.slug === catSel);
        const prev = editKey ? sourceFor(editKey) : null;
        categoryLabel = known ? known.label : ((prev && prev.categoryLabel) || catSel);
      }
      const theme = val('edTheme');
      doc = {
        title, subtitle: val('edSubtitle'), theme, category, categoryLabel,
        desc: val('edDesc'), origin: val('edOrigin'),
        icon: (THEMES[theme] || {}).icon || '🕉️',
        data: verses.data,
        published,
        updatedAt: FieldValue.serverTimestamp(),
      };
    }

    btn.disabled = true;
    setMsg('edErr', 'busy', 'సేవ్ అవుతోంది… / Saving…');
    try {
      let savedKey = editKey;
      if (editKey) await db.collection('stotras').doc(editKey).set(doc, { merge: true });
      else savedKey = (await db.collection('stotras').add(doc)).id;
      await loadContent();
      renderContent();
      hideEditor();
      focusFirst('#contentTable [data-edit="' + attrSel(savedKey) + '"]', 'contentTitle');
      toast(published ? 'సేవ్ అయ్యింది — సైట్‌లో కనిపిస్తుంది / Saved and live' : 'సేవ్ అయ్యింది (ప్రచురించలేదు) / Saved as draft');
    } catch (e) {
      setMsg('edErr', 'error', 'సేవ్ కాలేదు: ' + errText(e));
    } finally {
      btn.disabled = false;
    }
  }
  function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

  async function revertStotram(key) {
    const title = sourceFor(key).title || key;
    const ok = await siteConfirm('"' + title + '" ను అసలు రూపానికి తిరిగి మార్చాలా? మీ సవరణ తొలగిపోతుంది.\nRevert to the original text?', { okLabel: 'తిరిగి మార్చు / Revert', danger: true });
    if (!ok) return;
    try {
      await db.collection('stotras').doc(key).delete();
      if (val('edEditKey') === key && !$('editorPanel').hidden) hideEditor();   // it held the old edit
      await loadContent(); renderContent();
      focusFirst('#contentTable [data-edit="' + attrSel(key) + '"]', 'contentTitle');
      toast('అసలు రూపానికి మార్చాం / Reverted');
    } catch (e) { toast('మార్చలేదు: ' + errText(e), 'error'); }
  }
  async function deleteStotram(key) {
    const title = sourceFor(key).title || key;
    const ok = await siteConfirm('"' + title + '" ను శాశ్వతంగా తొలగించాలా?\nDelete this stotram permanently?', { okLabel: 'తొలగించు / Delete', danger: true });
    if (!ok) return;
    try {
      await db.collection('stotras').doc(key).delete();
      if (val('edEditKey') === key && !$('editorPanel').hidden) hideEditor();
      await loadContent(); renderContent();
      focusFirst('contentTitle');
      toast('తొలగించాం / Deleted');
    } catch (e) { toast('తొలగించలేదు: ' + errText(e), 'error'); }
  }

  /* ---------- OCR (image → verses, via the Worker's /api/ocr) ---------- */
  function fileToB64(f) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1]);
      r.onerror = rej;
      r.readAsDataURL(f);
    });
  }
  async function ocrExtract() {
    const files = $('edImages').files;
    const btn = $('edOcrBtn');
    if (!files || !files.length) { setMsg('edOcrStatus', 'error', 'ముందు చిత్రం ఎంచుకోండి / Choose an image first'); $('edImages').focus(); return; }
    setMsg('edOcrStatus', 'busy', 'చిత్రం చదువుతోంది… / Reading the image…');
    btn.disabled = true;
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
      const box = $('edSlokams');
      box.value = box.value.trim() ? (box.value.trim() + '\n\n' + text) : text;
      edDirty = true;
      updateVerseCount();
      showOcrReview(text, body);
    } catch (e) {
      setMsg('edOcrStatus', 'error', (e && e.message) ? e.message : String(e));
    } finally {
      btn.disabled = false;
    }
  }
  function showOcrReview(text, body) {
    const rev = $('edOcrReview');
    const unsure = Array.isArray(body.uncertain) ? body.uncertain : [];
    const illegible = (text.match(/⟨\?⟩/g) || []).length;
    if (!body.checked) setMsg('edOcrStatus', 'ok', 'పాఠం వచ్చింది — చిత్రంతో సరిచూసుకోండి / Check against the image');
    else if (!unsure.length && !illegible) setMsg('edOcrStatus', 'ok', 'రెండు రీడింగ్‌లు ఒకేలా ఉన్నాయి / Both readings agree');
    else setMsg('edOcrStatus', 'info', (unsure.length + illegible) + ' చోట్ల అనుమానం — క్రింద చూడండి');
    if (!unsure.length && !illegible) { rev.innerHTML = ''; return; }
    let html = '<div class="ad-rev"><div class="ad-rev-head">' + icon('search') + 'ఇవి సరిచూసుకోండి / Please check these</div>';
    if (illegible) html += '<div class="ad-rev-item">⟨?⟩ గుర్తులు ' + illegible + ' ఉన్నాయి — చిత్రంతో పోల్చి సరిచేయండి.</div>';
    unsure.forEach((u) => {
      html += '<div class="ad-rev-item"><b>లైన్ ' + escapeHtml(u.line) + '</b><div>1: ' + escapeHtml(u.a || '(ఖాళీ)') + '</div><div>2: ' + escapeHtml(u.b || '(ఖాళీ)') + '</div></div>';
    });
    rev.innerHTML = html + '</div>';
  }

  /* ============================================================
     Feedback triage
  ============================================================ */
  const FB_PAGE = 50;
  const REPLY_MAX = 2000;
  const fb = {
    rows: [], loaded: false, loading: false, error: '', last: null, more: false,
    filter: 'open', type: 'all', q: '',
    drafts: new Map(),   // id → unsent reply text (survives re-renders)
    open: new Set(),     // ids whose reply composer is open
  };
  const FB_TYPES = {
    correction: { icon: 'book', te: 'స్తోత్రంలో తప్పు', en: 'Correction' },
    problem: { icon: 'warning', te: 'సమస్య', en: 'Problem' },
    suggestion: { icon: 'sparkle', te: 'సూచన', en: 'Suggestion' },
    other: { icon: 'message', te: 'ఇతరం', en: 'Other' },
  };
  const FB_STATUS = {
    new: { icon: 'bell', te: 'కొత్తది', en: 'New' },
    in_progress: { icon: 'clock', te: 'పరిశీలనలో', en: 'In progress' },
    answered: { icon: 'check-circle', te: 'జవాబిచ్చాం', en: 'Answered' },
    closed: { icon: 'lock', te: 'మూసివేశాం', en: 'Closed' },
  };
  const STATUS_ORDER = ['new', 'in_progress', 'answered', 'closed'];
  const FB_FILTERS = {
    open: { te: 'తెరిచినవి', en: 'Open', test: (s) => s === 'new' || s === 'in_progress' },
    answered: { te: 'జవాబిచ్చినవి', en: 'Answered', test: (s) => s === 'answered' },
    closed: { te: 'మూసినవి', en: 'Closed', test: (s) => s === 'closed' },
    all: { te: 'అన్నీ', en: 'All', test: () => true },
  };
  const SAFE_KEY = /^[A-Za-z0-9_-]+$/;

  // Older documents only have `handled`; the status field is newer.
  function fbStatus(r) { return FB_STATUS[r.status] ? r.status : (r.handled ? 'closed' : 'new'); }
  function fbType(r) { return FB_TYPES[r.type] ? r.type : 'other'; }
  function fbMatches(r) {
    if (fb.type !== 'all' && fbType(r) !== fb.type) return false;
    if (!fb.q) return true;
    return [r.message, r.name, r.contact, r.email, r.stotramTitle, r.stotram, r.reply]
      .some((v) => v && String(v).toLowerCase().includes(fb.q));
  }

  async function loadFeedback(more) {
    if (fb.loading) return;
    fb.loading = true;
    const moreBtn = $('fbMoreBtn');
    if (!more) {
      fb.rows = []; fb.last = null; fb.more = false;
      $('feedbackList').innerHTML = skeletonHtml(3);
      $('fbMore').hidden = true;
    } else if (moreBtn) moreBtn.disabled = true;
    try {
      let q = db.collection('feedback').orderBy('createdAt', 'desc').limit(FB_PAGE);
      if (more && fb.last) q = q.startAfter(fb.last);
      const snap = await q.get();
      const seen = new Set(fb.rows.map((r) => r.id));
      snap.forEach((d) => { if (!seen.has(d.id)) fb.rows.push({ id: d.id, ...d.data() }); });
      if (snap.docs.length) fb.last = snap.docs[snap.docs.length - 1];
      fb.more = snap.size === FB_PAGE;
      fb.loaded = true;
      fb.error = '';
    } catch (e) {
      console.warn('[admin] feedback load failed', e);
      if (more) toast('పాత సందేశాలు రాలేదు: ' + errText(e), 'error');
      else { fb.loaded = false; fb.error = errText(e); }
    } finally {
      fb.loading = false;
      if (moreBtn) moreBtn.disabled = false;
      renderFeedback();
      updateFbBadge();
    }
  }

  function fbCounts() {
    const c = { open: 0, answered: 0, closed: 0, all: 0 };
    fb.rows.forEach((r) => {
      if (!fbMatches(r)) return;
      const s = fbStatus(r);
      c.all++;
      if (FB_FILTERS.open.test(s)) c.open++;
      else if (s === 'answered') c.answered++;
      else c.closed++;
    });
    return c;
  }
  function renderFbFilters() {
    const c = fbCounts();
    document.querySelectorAll('#fbFilters [data-fbfilter]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.fbfilter === fb.filter));
    });
    document.querySelectorAll('#fbFilters [data-fbcount]').forEach((el) => { el.textContent = c[el.dataset.fbcount]; });
  }
  function updateFbBadge() {
    const badgeEl = $('fbNavBadge');
    if (!badgeEl) return;
    const n = fb.rows.filter((r) => fbStatus(r) === 'new').length;
    badgeEl.hidden = !n;
    badgeEl.innerHTML = n ? (n + (fb.more && n === fb.rows.length ? '+' : '') + '<span class="ad-sr"> కొత్త సందేశాలు / new</span>') : '';
  }

  function renderFeedback() {
    const box = $('feedbackList');
    renderFbFilters();
    const note = $('fbListNote');
    if (!fb.loaded) {
      if (fb.error) box.innerHTML = emptyHtml('warning', 'అభిప్రాయాలు రాలేదు / Could not load feedback', fb.error, true, 'retry-feedback');
      note.textContent = '';
      $('fbMore').hidden = true;
      return;
    }
    const list = fb.rows.filter((r) => fbMatches(r) && FB_FILTERS[fb.filter].test(fbStatus(r)));
    if (!list.length) {
      if (!fb.rows.length) box.innerHTML = emptyHtml('message', 'ఇంకా అభిప్రాయాలు లేవు / No feedback yet', 'చదువరులు సైట్ నుండి పంపిన సందేశాలు ఇక్కడ కనిపిస్తాయి.');
      else if (fb.filter === 'open' && !fb.q && fb.type === 'all') box.innerHTML = emptyHtml('check-circle', 'అన్నీ చూసుకున్నారు / All caught up', 'తెరిచిన సందేశాలు ఏవీ లేవు.');
      else box.innerHTML = emptyHtml('search', 'సరిపడేవి లేవు / Nothing matches', 'ఈ ఎంపికలకు సరిపడే సందేశాలు లేవు. వేరే స్థితి లేదా రకం ఎంచుకోండి.');
    } else {
      box.innerHTML = '<div class="ad-fb-list">' + list.map(fbItemHtml).join('') + '</div>';
    }
    $('fbMore').hidden = !fb.more;
    note.textContent = 'తాజా ' + fb.rows.length + ' సందేశాలు చూపిస్తున్నాం' +
      (fb.more ? ' · పాతవి కోసం "ఇంకా పాతవి చూపించు" నొక్కండి' : ' · అన్నీ వచ్చాయి') + '.';
  }

  function contactHtml(c) {
    if (/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(c)) return '<a href="mailto:' + escapeHtml(c) + '">' + escapeHtml(c) + '</a>';
    const digits = c.replace(/[^\d+]/g, '');
    if (/^[\d\s+().-]+$/.test(c) && digits.replace(/\D/g, '').length >= 7) return '<a href="tel:' + escapeHtml(digits) + '">' + escapeHtml(c) + '</a>';
    return escapeHtml(c);
  }
  function meta(iconName, html) { return '<span class="ad-meta">' + icon(iconName) + '<span>' + html + '</span></span>'; }
  function pill(s) {
    const st = FB_STATUS[s];
    return '<span class="ad-pill" data-status="' + s + '">' + icon(st.icon) + st.te + ' · ' + st.en + '</span>';
  }

  function fbItemHtml(r) {
    const s = fbStatus(r);
    const ty = FB_TYPES[fbType(r)];
    const id = escapeHtml(r.id);
    const created = toDate(r.createdAt) || toDate(r.sentAt);
    const replied = toDate(r.repliedAt);
    const contact = String(r.contact || '').trim();
    const signedIn = !!r.uid;
    const stotramKey = String(r.stotram || '');
    const screen = String(r.screen || '');
    // Older messages (or cloud-only stotras) may lack stotramTitle: use the key's own title.
    const keyTitle = stotramKey ? (((cloudDocs.get(stotramKey) || {}).title) || (isBuiltin(stotramKey) ? BUILTIN[stotramKey].title : '') || '') : '';
    const whereLabel = r.stotramTitle || keyTitle || (screen === 'home' ? 'ముఖపుట / Home' : screen);
    const whereHtml = whereLabel
      ? (stotramKey && SAFE_KEY.test(stotramKey)
        ? '<a href="/?stotram=' + escapeHtml(stotramKey) + '" target="_blank" rel="noopener">' + escapeHtml(whereLabel) + '<span class="ad-sr"> (కొత్త ట్యాబ్‌లో / opens in a new tab)</span></a>'
        : escapeHtml(whereLabel))
      : '';
    const open = fb.open.has(r.id);
    const draft = fb.drafts.has(r.id) ? fb.drafts.get(r.id) : (r.reply || '');

    let h = '<article class="ad-fb-item" data-status="' + s + '" data-id="' + id + '" aria-labelledby="fbh-' + id + '">';
    h += '<div class="ad-fb-top">' +
      '<h3 class="ad-fb-type" id="fbh-' + id + '"><span class="ad-fb-type-ico">' + icon(ty.icon) + '</span>' +
        '<span>' + ty.te + ' <span class="ad-en">· ' + ty.en + '</span></span></h3>' +
      pill(s) + '</div>';
    h += '<p class="ad-fb-msg">' + escapeHtml(r.message || '') + '</p>';

    h += '<div class="ad-fb-meta">' +
      meta('user', escapeHtml(r.name || 'పేరు లేదు / No name')) +
      (contact ? meta('message', contactHtml(contact)) : '') +
      (whereHtml ? meta('book', whereHtml) : '') +
      (created ? meta('clock', '<time datetime="' + created.toISOString() + '" title="' + escapeHtml(fmtDateTime(created)) + '">' + escapeHtml(relTime(created)) + '</time>') : '') +
      (signedIn && r.email && r.email !== contact ? meta('cloud', contactHtml(String(r.email))) : '') +
      (signedIn
        ? badge('signed', 'cloud', 'సైన్ ఇన్ చేసి పంపారు / Signed in')
        : badge('guest', 'user', 'సైన్ ఇన్ లేదు / Guest')) +
      '</div>';

    if (r.reply) {
      h += '<div class="ad-fb-reply"><b>స్తోత్రములు బృందం · మీ జవాబు</b><p>' + escapeHtml(r.reply) + '</p>' +
        (replied ? '<small>' + escapeHtml(fmtDateTime(replied)) + '</small>' : '') + '</div>';
    }

    h += '<div class="ad-fb-controls">' +
      '<div><span class="ad-group-label" id="fbsl-' + id + '">స్థితి మార్చండి / Set status</span>' +
      '<div class="ad-status-set" role="group" aria-labelledby="fbsl-' + id + '">' +
      STATUS_ORDER.map((k) => '<button type="button" class="ad-status-btn" data-act="status" data-status="' + k + '" aria-pressed="' + (k === s) + '">' +
        icon(FB_STATUS[k].icon) + FB_STATUS[k].te + '<span class="ad-en"> · ' + FB_STATUS[k].en + '</span></button>').join('') +
      '</div></div>';

    const guestNote = contact
      ? 'వీరు సైన్ ఇన్ చేయకుండా పంపారు, కాబట్టి జవాబు సైట్‌లో వారికి కనిపించదు. నేరుగా సంప్రదించండి: ' + contact
      : 'వీరు సైన్ ఇన్ చేయకుండా పంపారు, సంప్రదింపు వివరాలూ ఇవ్వలేదు. జవాబు మీ రికార్డు కోసం మాత్రమే ఉంటుంది.';
    h += '<details class="ad-compose"' + (open ? ' open' : '') + '>' +
      '<summary>' + icon('message') + (r.reply ? 'జవాబు మార్చండి / Edit reply' : 'జవాబు రాయండి / Write a reply') + icon('chevron-down', 'ad-chev') + '</summary>' +
      '<div class="ad-compose-body">' +
        (signedIn ? '' : '<p class="ad-hint">' + icon('info-circle') + '<span>' + escapeHtml(guestNote) + '</span></p>') +
        '<div class="ad-label-row"><label class="ad-label" for="fbr-' + id + '">మీ జవాబు / Your reply</label>' +
          '<span class="ad-counter" data-reply-count>' + draft.length + ' / ' + REPLY_MAX + '</span></div>' +
        '<textarea class="ad-in" id="fbr-' + id + '" data-reply rows="4" maxlength="' + REPLY_MAX + '" placeholder="సరళమైన తెలుగులో, మర్యాదగా… / Reply in simple words">' + escapeHtml(draft) + '</textarea>' +
        '<div class="ad-compose-actions">' +
          '<button type="button" class="ad-btn ad-btn-primary" data-act="reply">' + icon('check') + 'జవాబు పంపండి / Send reply</button>' +
          '<span class="ad-msg-slot" data-slot aria-live="polite"></span>' +
        '</div>' +
      '</div></details>';
    h += '</div>';

    h += '<div class="ad-fb-foot">' +
      ((r.device || r.lang)
        ? '<details class="ad-fb-device"><summary>' + icon('info-circle') + 'పరికరం వివరాలు / Device</summary><p>' + escapeHtml([r.lang, r.device].filter(Boolean).join(' · ')) + '</p></details>'
        : '') +
      '<span class="ad-spacer"></span>' +
      '<button type="button" class="ad-btn ad-btn-sm ad-btn-danger-quiet" data-act="delete">' + icon('delete') + 'తొలగించు / Delete</button>' +
      '</div>';
    return h + '</article>';
  }

  function fbNode(id) {
    return [...document.querySelectorAll('#feedbackList .ad-fb-item')].find((n) => n.dataset.id === id) || null;
  }
  function lockItem(node, on) {
    if (!node) return;
    node.setAttribute('aria-busy', String(on));
    node.querySelectorAll('button, textarea').forEach((el) => { el.disabled = on; });
  }
  // Re-draw one item after a write, without re-animating the whole list.
  // If it no longer fits the current filter it leaves, and focus moves on.
  function refreshFbItem(id, focusSel) {
    renderFbFilters();
    updateFbBadge();
    const node = fbNode(id);
    const r = fb.rows.find((x) => x.id === id);
    if (!node) { renderFeedback(); return; }
    if (!r || !fbMatches(r) || !FB_FILTERS[fb.filter].test(fbStatus(r))) {
      const next = node.nextElementSibling || node.previousElementSibling;
      node.remove();
      if (!document.querySelector('#feedbackList .ad-fb-item')) {
        renderFeedback();                   // shows the right empty state
        const active = document.querySelector('#fbFilters [aria-pressed="true"]');
        if (active) active.focus();
        return;
      }
      const target = next && (next.querySelector('.ad-status-btn[aria-pressed="true"]') || next.querySelector('button'));
      if (target) target.focus();
      return;
    }
    const tmp = document.createElement('div');
    tmp.innerHTML = fbItemHtml(r);
    const fresh = tmp.firstElementChild;
    node.replaceWith(fresh);
    const f = focusSel && fresh.querySelector(focusSel);
    if (f) f.focus();
  }

  async function setFbStatus(id, status) {
    const r = fb.rows.find((x) => x.id === id);
    if (!r || !FB_STATUS[status] || fbStatus(r) === status) return;
    const patch = { status, handled: status === 'answered' || status === 'closed' };
    const node = fbNode(id);
    lockItem(node, true);
    try {
      await db.collection('feedback').doc(id).update(patch);
      Object.assign(r, patch);
      const st = FB_STATUS[status];
      const stays = FB_FILTERS[fb.filter].test(status);
      toast('స్థితి: ' + st.te + ' / ' + st.en + (stays ? '' : ' — ఇప్పుడు "' + filterFor(status).te + '" లో ఉంది'));
      refreshFbItem(id, '.ad-status-btn[data-status="' + status + '"]');
    } catch (e) {
      lockItem(node, false);
      toast('స్థితి మారలేదు: ' + errText(e), 'error');
    }
  }
  function filterFor(status) { return status === 'answered' ? FB_FILTERS.answered : status === 'closed' ? FB_FILTERS.closed : FB_FILTERS.open; }

  async function sendFbReply(id) {
    const r = fb.rows.find((x) => x.id === id);
    const node = fbNode(id);
    if (!r || !node) return;
    const ta = node.querySelector('textarea[data-reply]');
    const slot = node.querySelector('[data-slot]');
    const text = ta.value.trim();
    if (!text) { setMsg(slot, 'error', 'జవాబు ఖాళీగా ఉంది / The reply is empty'); ta.focus(); return; }
    if (text.length > REPLY_MAX) { setMsg(slot, 'error', 'జవాబు చాలా పొడవుగా ఉంది (' + REPLY_MAX + ' అక్షరాల లోపు)'); ta.focus(); return; }
    lockItem(node, true);
    setMsg(slot, 'busy', 'పంపుతోంది… / Sending…');
    try {
      await db.collection('feedback').doc(id).update({
        reply: text,
        repliedAt: FieldValue.serverTimestamp(),
        status: 'answered',
        handled: true,
      });
      Object.assign(r, { reply: text, repliedAt: new Date(), status: 'answered', handled: true });
      fb.drafts.delete(id);
      fb.open.delete(id);
      toast(r.uid ? 'జవాబు పంపాం — వారి "నా సందేశాలు" లో కనిపిస్తుంది / Reply sent' : 'జవాబు సేవ్ అయ్యింది (వీరు సైన్ ఇన్ చేయలేదు) / Reply saved');
      refreshFbItem(id, '.ad-compose > summary');
    } catch (e) {
      lockItem(node, false);
      setMsg(slot, 'error', 'జవాబు పంపలేదు: ' + errText(e));
    }
  }

  async function deleteFb(id) {
    const r = fb.rows.find((x) => x.id === id);
    if (!r) return;
    const ok = await siteConfirm('ఈ అభిప్రాయం శాశ్వతంగా తొలగించాలా?\nDelete this message permanently?', { okLabel: 'తొలగించు / Delete', danger: true });
    if (!ok) return;
    const node = fbNode(id);
    lockItem(node, true);
    try {
      await db.collection('feedback').doc(id).delete();
      fb.rows = fb.rows.filter((x) => x.id !== id);
      fb.drafts.delete(id);
      fb.open.delete(id);
      toast('తొలగించాం / Deleted');
      refreshFbItem(id);
    } catch (e) {
      lockItem(node, false);
      toast('తొలగించలేదు: ' + errText(e), 'error');
    }
  }

  /* ============================================================
     What's new (Firestore `updates`)
     updates.js on the site merges these with the bundled
     window.SITE_UPDATES (public/data/updates.js) by id: a doc with a
     bundled entry's id replaces that entry, and one with published:false
     hides it. So "edit" or "hide" on a bundled entry writes a doc under
     the same id, and "revert" deletes that doc. The file never changes.
  ============================================================ */
  const UPD_TAGS = {
    new: { icon: 'sparkle', te: 'కొత్తది' },
    improved: { icon: 'chevron-up', te: 'మెరుగుదల' },
    fixed: { icon: 'check', te: 'సరిచేశాం' },
  };
  const UPD_TITLE_MAX = 80;
  const UPD_BODY_MAX = 400;
  const SITE_UPD_LIMIT = 20;     // updates.js CLOUD_LIMIT: the site reads the newest 20 docs by date
  const upd = { rows: [], loaded: false, loading: false, error: '' };
  let updDirty = false;
  let updReturn = null;          // the button that opened the update editor

  function sortUpdates(list) {
    return list.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) ||
      ((toDate(b.updatedAt) || 0) - (toDate(a.updatedAt) || 0)));
  }
  // The bundled entries the site shows, filtered and keyed exactly as
  // updates.js normalize() does (first copy of a repeated id wins).
  function bundledUpdates() {
    const src = Array.isArray(window.SITE_UPDATES) ? window.SITE_UPDATES : [];
    const seen = new Set();
    const out = [];
    src.forEach((u) => {
      if (!u || typeof u !== 'object') return;
      const date = String(u.date == null ? '' : u.date).trim();
      const title = String(u.title == null ? '' : u.title).trim();
      if (!YMD_RE.test(date) || !title) return;
      const id = String(u.id || (date + ':' + title));
      if (seen.has(id)) return;
      seen.add(id);
      out.push({ id, date, tag: UPD_TAGS[u.tag] ? u.tag : 'new', title, body: String(u.body == null ? '' : u.body).trim() });
    });
    return sortUpdates(out);
  }
  function bundledById(id) { return bundledUpdates().find((u) => u.id === id) || null; }
  // Only plain ids are used as Firestore doc ids.
  const overridable = (u) => SAFE_KEY.test(u.id);

  // Mirrors the site's <article class="update-item"> (contract §4.14).
  function updArticleHtml(u, hTag) {
    const h = hTag || 'h4';
    const key = UPD_TAGS[u.tag] ? u.tag : 'new';
    const tag = UPD_TAGS[key];
    const when = siteDate(u.date);
    return '<article class="ad-upd">' +
      '<div class="ad-upd-meta"><span class="ad-tag ad-tag-' + key + '">' + icon(tag.icon) + tag.te + '</span>' +
        (when ? '<time datetime="' + escapeHtml(u.date) + '">' + escapeHtml(when) + '</time>' : '<span>తేదీ లేదు / No date</span>') + '</div>' +
      '<' + h + ' class="ad-upd-title">' + escapeHtml(u.title || '') + '</' + h + '>' +
      '<p class="ad-upd-body">' + escapeHtml(u.body || '') + '</p>' +
      '</article>';
  }

  async function loadUpdates() {
    if (upd.loading) return;
    upd.loading = true;
    $('updatesList').innerHTML = skeletonHtml(2);
    // Their state (replaced / hidden) is about to be re-read.
    $('bundledUpdatesList').querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try {
      const snap = await db.collection('updates').get();
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      upd.rows = sortUpdates(list);
      upd.loaded = true;
      upd.error = '';
    } catch (e) {
      console.warn('[admin] updates load failed', e);
      upd.loaded = false;
      upd.error = errText(e);
    } finally {
      upd.loading = false;
      renderUpdates();
    }
  }

  function renderUpdates() {
    const box = $('updatesList');
    const bundledIds = new Set(bundledUpdates().map((u) => u.id));
    if (!upd.loaded && upd.error) {
      box.innerHTML = emptyHtml('warning', 'మార్పుల జాబితా రాలేదు / Could not load updates', upd.error, true, 'retry-updates');
    } else if (!upd.rows.length) {
      box.innerHTML = emptyHtml('sparkle', 'ఇంకా ఏమీ చేర్చలేదు / Nothing added yet', '"కొత్త మార్పు" నొక్కి మొదటిది రాయండి. అది సైట్‌లో "కొత్తవి" లో కనిపిస్తుంది.');
    } else {
      box.innerHTML = upd.rows.map((u) => {
        const pub = u.published !== false;
        const replaces = bundledIds.has(u.id);
        const id = escapeHtml(u.id);
        const title = escapeHtml(u.title || '');
        const state = replaces
          ? (pub ? badge('edited', 'edit', 'అంతర్నిర్మితానికి బదులు · Replaces bundled') : badge('draft', 'lock', 'అంతర్నిర్మితాన్ని దాస్తోంది · Hides bundled'))
          : (pub ? badge('published', 'check-circle', 'ప్రచురించబడింది · Live') : badge('draft', 'lock', 'చిత్తు ప్రతి · Draft'));
        return '<div class="ad-upd-row" data-published="' + pub + '">' + updArticleHtml(u) +
          '<div class="ad-upd-actions">' + state +
            '<span class="ad-spacer"></span>' +
            '<button type="button" class="ad-btn ad-btn-sm" data-act="edit" data-id="' + id + '" aria-label="సవరించు: ' + title + '">' + icon('edit') + 'సవరించు</button>' +
            (replaces
              ? '<button type="button" class="ad-btn ad-btn-sm" data-act="delete" data-id="' + id + '" aria-label="ఫైల్‌లోని అసలుకు తిరిగి మార్చు: ' + title + '">' + icon('revert') + 'తిరిగి మార్చు</button>'
              : '<button type="button" class="ad-btn ad-btn-sm ad-btn-danger-quiet" data-act="delete" data-id="' + id + '" aria-label="తొలగించు: ' + title + '">' + icon('delete') + 'తొలగించు</button>') +
          '</div></div>';
      }).join('') +
      (upd.rows.length > SITE_UPD_LIMIT
        ? '<p class="ad-hint">' + icon('info-circle') + '<span>సైట్ తేదీ ప్రకారం తాజా ' + SITE_UPD_LIMIT + ' మాత్రమే చదువుతుంది (దాచినవీ కలిపి). ఇక్కడ ' + upd.rows.length + ' ఉన్నాయి, కాబట్టి పాతవి సైట్‌లో కనిపించవు; అవసరం లేనివి తొలగించండి. / The site reads only the newest ' + SITE_UPD_LIMIT + '.</span></p>'
        : '');
    }
    renderBundledUpdates();
  }

  function renderBundledUpdates() {
    const box = $('bundledUpdatesList');
    const list = bundledUpdates();
    if (!list.length) { box.innerHTML = '<p class="ad-list-note">updates.js లో మార్పులు లేవు. / No bundled entries.</p>'; return; }
    const known = upd.loaded;      // until Firestore answers, we can't tell what is replaced or hidden
    box.innerHTML = list.map((u) => {
      const ov = known ? upd.rows.find((r) => r.id === u.id) : null;
      const id = escapeHtml(u.id);
      const title = escapeHtml(u.title);
      let state;
      let actions = '';
      if (!ov) {
        state = badge('bundled', 'book', 'ఫైల్‌లో ఉంది · Bundled');
        if (known && overridable(u)) {
          actions =
            '<button type="button" class="ad-btn ad-btn-sm" data-act="override" data-id="' + id + '" aria-label="ప్రతి చేసి సవరించు: ' + title + '">' + icon('edit') + 'సవరించు</button>' +
            '<button type="button" class="ad-btn ad-btn-sm" data-act="hide" data-id="' + id + '" aria-label="సైట్‌లో దాచు: ' + title + '">' + icon('lock') + 'సైట్‌లో దాచు</button>';
        }
      } else if (ov.published === false) {
        state = badge('draft', 'lock', 'సైట్‌లో దాచారు · Hidden');
        actions = '<button type="button" class="ad-btn ad-btn-sm" data-act="restore" data-id="' + id + '" aria-label="మళ్ళీ చూపించు: ' + title + '">' + icon('revert') + 'మళ్ళీ చూపించు</button>';
      } else {
        state = badge('edited', 'edit', 'డాష్‌బోర్డ్ ప్రతి కనిపిస్తోంది · Replaced');
        actions = '<button type="button" class="ad-btn ad-btn-sm" data-act="restore" data-id="' + id + '" aria-label="ఫైల్‌లోని అసలుకు తిరిగి మార్చు: ' + title + '">' + icon('revert') + 'తిరిగి మార్చు</button>';
      }
      return '<div class="ad-upd-row" data-published="' + !ov + '">' + updArticleHtml(u) +
        '<div class="ad-upd-actions">' + state + (actions ? '<span class="ad-spacer"></span>' + actions : '') + '</div></div>';
    }).join('');
  }

  function checkedTag() {
    const el = document.querySelector('input[name="updTag"]:checked');
    return el && UPD_TAGS[el.value] ? el.value : 'new';
  }
  function updatePreview() {
    const title = $('updTitle').value;
    const body = $('updBody').value;
    $('updTitleCount').textContent = title.length + ' / ' + UPD_TITLE_MAX;
    $('updBodyCount').textContent = body.length + ' / ' + UPD_BODY_MAX;
    $('updPreview').innerHTML = updArticleHtml({ date: $('updDate').value, tag: checkedTag(), title: title.trim(), body: body.trim() }, 'h3');
  }

  // id: a Firestore doc to edit; fromBundled: copy the bundled entry with
  // that id into a new doc of the same id (which then replaces it on the site).
  async function openUpdateEditor(id, fromBundled) {
    id = typeof id === 'string' ? id : '';
    const opener = document.activeElement;
    if (!(await confirmDiscard(updDirty && !$('updEditor').hidden))) return;
    const panel = $('updEditor');
    const bundled = id ? bundledById(id) : null;
    const u = id ? (fromBundled === true ? bundled : upd.rows.find((x) => x.id === id)) : null;
    if (id && !u) { toast('ఈ మార్పు ఇప్పుడు లేదు / No longer exists', 'error'); return; }
    if (panel.hidden || !panel.contains(opener)) updReturn = opener;
    $('updEditId').value = u ? u.id : '';
    set('updDate', u && parseYmd(u.date) ? u.date : todayYmd());
    const tag = u && UPD_TAGS[u.tag] ? u.tag : 'new';
    document.querySelectorAll('input[name="updTag"]').forEach((r) => { r.checked = r.value === tag; });
    set('updTitle', u ? u.title : '');
    set('updBody', u ? u.body : '');
    $('updPub').checked = u ? u.published !== false : true;
    $('updEditorTitle').textContent = !u ? 'కొత్త మార్పు / New update'
      : bundled ? 'అంతర్నిర్మిత మార్పు సవరించండి / Edit bundled entry'
      : 'మార్పు సవరించండి / Edit update';
    $('updOverrideNote').hidden = !bundled;
    setMsg('updMsg');
    updatePreview();
    updDirty = false;
    panel.hidden = false;
    reveal(panel);
    $('updTitle').focus({ preventScroll: true });
  }
  function hideUpdateEditor() {
    $('updEditor').hidden = true;
    updDirty = false;
  }
  async function closeUpdateEditor() {
    if (!(await confirmDiscard(updDirty))) return;
    const id = val('updEditId');
    hideUpdateEditor();
    focusFirst(updReturn, id ? '#updatesList [data-act="edit"][data-id="' + attrSel(id) + '"]' : null, 'updatesTitle');
  }

  async function saveUpdate() {
    const date = val('updDate');
    const title = val('updTitle');
    const body = val('updBody');
    const tag = checkedTag();
    if (!parseYmd(date)) { setMsg('updMsg', 'error', 'సరైన తేదీ ఎంచుకోండి / Pick a valid date'); $('updDate').focus(); return; }
    if (!title) { setMsg('updMsg', 'error', 'శీర్షిక అవసరం / Title is required'); $('updTitle').focus(); return; }
    if (title.length > UPD_TITLE_MAX) { setMsg('updMsg', 'error', 'శీర్షిక ' + UPD_TITLE_MAX + ' అక్షరాల లోపు ఉండాలి'); $('updTitle').focus(); return; }
    if (!body) { setMsg('updMsg', 'error', 'వివరణ అవసరం / Body is required'); $('updBody').focus(); return; }
    if (body.length > UPD_BODY_MAX) { setMsg('updMsg', 'error', 'వివరణ ' + UPD_BODY_MAX + ' అక్షరాల లోపు ఉండాలి'); $('updBody').focus(); return; }

    const published = $('updPub').checked;
    const doc = { date, tag, title, body, published, updatedAt: FieldValue.serverTimestamp() };
    const id = val('updEditId');
    const btn = $('updSaveBtn');
    btn.disabled = true;
    setMsg('updMsg', 'busy', 'సేవ్ అవుతోంది… / Saving…');
    try {
      let savedId = id;
      if (id) await db.collection('updates').doc(id).set(doc);
      else savedId = (await db.collection('updates').add(doc)).id;
      hideUpdateEditor();
      await loadUpdates();
      focusFirst('#updatesList [data-act="edit"][data-id="' + attrSel(savedId) + '"]', 'updatesTitle');
      toast(published ? 'ప్రచురించాం — సైట్‌లో "కొత్తవి" లో కనిపిస్తుంది / Published' : 'చిత్తు ప్రతిగా సేవ్ అయ్యింది / Saved as draft');
    } catch (e) {
      setMsg('updMsg', 'error', 'సేవ్ కాలేదు: ' + errText(e));
    } finally {
      btn.disabled = false;
    }
  }

  // Deletes a doc. For a doc that shadows a bundled entry this is "revert"
  // (or "show again" when it was hiding it): the file's entry comes back.
  async function deleteUpdate(id) {
    const u = upd.rows.find((x) => x.id === id);
    if (!u) return;
    const b = bundledById(id);
    const hiding = u.published === false;
    let ok;
    if (!b) {
      ok = await siteConfirm('"' + (u.title || id) + '" ను తొలగించాలా? సైట్‌లో ఇక కనిపించదు.\nDelete this update?', { okLabel: 'తొలగించు / Delete', danger: true });
    } else if (hiding) {
      ok = await siteConfirm('"' + b.title + '" మళ్ళీ సైట్‌లో కనిపించాలా? ఫైల్‌లోని అసలు పాఠం వస్తుంది.\nShow the bundled entry again?', { okLabel: 'చూపించు / Show' });
    } else {
      ok = await siteConfirm('మీ ప్రతి తొలగిపోయి, ఫైల్‌లోని అసలు "' + b.title + '" సైట్‌లో కనిపిస్తుంది. కొనసాగించాలా?\nDiscard your copy and show the bundled entry?', { okLabel: 'తిరిగి మార్చు / Revert', danger: true });
    }
    if (!ok) return;
    try {
      await db.collection('updates').doc(id).delete();
      if ($('updEditId').value === id && !$('updEditor').hidden) hideUpdateEditor();
      await loadUpdates();
      focusFirst(b ? '#bundledUpdatesList [data-act="override"][data-id="' + attrSel(id) + '"]' : null, 'updatesTitle');
      toast(b ? 'ఫైల్‌లోని అసలు మార్పు మళ్ళీ కనిపిస్తుంది / Bundled entry restored' : 'తొలగించాం / Deleted');
    } catch (e) { toast((b ? 'మార్చలేదు: ' : 'తొలగించలేదు: ') + errText(e), 'error'); }
  }

  // Hide a bundled entry: a published:false doc under its id.
  async function hideBundled(id) {
    const b = bundledById(id);
    if (!b || !overridable(b) || upd.rows.some((r) => r.id === id)) return;
    const ok = await siteConfirm('"' + b.title + '" ను సైట్‌లో దాచాలా? ఫైల్ మారదు; "మళ్ళీ చూపించు" తో ఎప్పుడైనా తిరిగి వస్తుంది.\nHide this bundled entry on the site?', { okLabel: 'దాచు / Hide' });
    if (!ok) return;
    $('bundledUpdatesList').querySelectorAll('button').forEach((x) => { x.disabled = true; });
    try {
      await db.collection('updates').doc(id).set({
        date: b.date, tag: b.tag, title: b.title, body: b.body,
        published: false,
        updatedAt: FieldValue.serverTimestamp(),
      });
      await loadUpdates();
      focusFirst('#bundledUpdatesList [data-act="restore"][data-id="' + attrSel(id) + '"]', 'updatesTitle');
      toast('సైట్‌లో దాచాం / Hidden on the site');
    } catch (e) {
      renderBundledUpdates();
      toast('దాచలేదు: ' + errText(e), 'error');
    }
  }

  /* ============================================================
     Weekday order (config/weekday)
  ============================================================ */
  const DAY_TE = ['ఆదివారం', 'సోమవారం', 'మంగళవారం', 'బుధవారం', 'గురువారం', 'శుక్రవారం', 'శనివారం'];
  const DEITY_LABEL = {
    vishnu: 'విష్ణు', lalitha: 'లలిత/దేవి', shiva: 'శివ', venkat: 'వేంకటేశ్వర',
    ganesha: 'గణేశ', hanuman: 'హనుమాన్', lakshmi: 'లక్ష్మి', saibaba: 'సాయి',
    ayyappa: 'అయ్యప్ప', durga: 'దుర్గా', govinda: 'కృష్ణ/గోవింద',
  };
  // Keep these two in sync with public/assets/weekday.js: the site uses the
  // same defaults until a map is saved, and the same theme → deity aliases.
  const DEFAULT_WEEK = {
    0: { deities: ['vishnu', 'venkat'], stotras: [] },
    1: { deities: ['shiva'], stotras: [] },
    2: { deities: ['hanuman', 'durga'], stotras: [] },
    3: { deities: ['govinda', 'vishnu'], stotras: [] },
    4: { deities: ['saibaba'], stotras: [] },
    5: { deities: ['lakshmi', 'lalitha'], stotras: [] },
    6: { deities: ['venkat', 'hanuman', 'ayyappa'], stotras: [] },
  };
  const DEITY_ALIAS = { bilva: 'shiva', chalisa: 'hanuman', harati: 'saibaba', manidweepa: 'lalitha', krishna: 'govinda' };
  const TODAY_MAX = 3;       // weekday.js shows the first three matches

  let WEEK_MAP = null;
  let wdDirty = false;
  let wdFromDefaults = false;
  let wdLoading = false;

  // Every stotram the site can list on a day, in the site's order: the
  // built-ins first (file order), then published cloud-only stotras.
  function weekdayEntries() {
    const out = Object.keys(BUILTIN).filter((k) => !BUILTIN[k].hidden)
      .map((k) => ({ key: k, title: BUILTIN[k].title || k, theme: bareTheme(BUILTIN[k].theme) }));
    [...cloudDocs.keys()].filter((k) => !isBuiltin(k) && cloudDocs.get(k).published !== false).forEach((k) => {
      const d = cloudDocs.get(k);
      out.push({ key: k, title: d.title || k, theme: bareTheme(d.theme || 'vishnu') });
    });
    return out.filter((e) => SAFE_KEY.test(e.key));
  }
  function homePicks(i) {
    const row = WEEK_MAP[i];
    const want = new Set(row.deities);
    const pinned = new Set(row.stotras);
    return weekdayEntries().filter((e) => pinned.has(e.key) || want.has(DEITY_ALIAS[e.theme] || e.theme)).slice(0, TODAY_MAX);
  }

  async function loadWeekday() {
    if (wdLoading) return;
    wdLoading = true;
    const box = $('weekdayEditor');
    box.innerHTML = skeletonHtml(2);
    try {
      const snap = await db.collection('config').doc('weekday').get();
      // A day missing from the saved map falls back to the default, as on the site.
      WEEK_MAP = clone(DEFAULT_WEEK);
      wdFromDefaults = !snap.exists;
      if (snap.exists) {
        const data = snap.data() || {};
        for (let i = 0; i < 7; i++) {
          const row = data[String(i)] || data[i];
          if (row) {
            WEEK_MAP[i] = {
              deities: Array.isArray(row.deities) ? row.deities.slice() : [],
              stotras: Array.isArray(row.stotras) ? row.stotras.slice() : [],
            };
          }
        }
      }
      wdDirty = false;
      renderWeekday();
    } catch (e) {
      WEEK_MAP = null;
      box.innerHTML = emptyHtml('warning', 'వార పూజ క్రమం రాలేదు / Could not load', errText(e), true, 'retry-weekday');
    } finally {
      wdLoading = false;
      syncWdDirty();
    }
  }

  function wdPreviewHtml(i) {
    const picks = homePicks(i);
    return icon('home') + '<span>' + (picks.length
      ? 'ముఖపుటలో కనిపించేవి: ' + picks.map((e) => escapeHtml(e.title)).join(' · ')
      : 'ఏవీ ఎంచుకోలేదు — ఆ రోజు "ఈ రోజు" విభాగం కనిపించదు.') + '</span>';
  }
  function wdCountHtml(i) {
    const n = WEEK_MAP[i].deities.length + WEEK_MAP[i].stotras.length;
    return n + '<span class="ad-sr"> ఎంపికలు / selected</span>';
  }

  function renderWeekday() {
    const box = $('weekdayEditor');
    $('wdNote').innerHTML = wdFromDefaults
      ? '<div class="ad-callout ad-callout-spaced">' + icon('info-circle') + '<span>ఈ క్రమం ఇంకా సేవ్ చేయలేదు. సైట్ ఇప్పుడు క్రింద చూపిన ప్రామాణిక క్రమం వాడుతోంది; మార్చి "సేవ్" నొక్కితే మీ క్రమం వస్తుంది.</span></div>'
      : '';
    const entries = weekdayEntries();
    const deities = Object.keys(DEITY_LABEL);
    const today = new Date().getDay();
    box.innerHTML = DAY_TE.map((name, i) => {
      const row = WEEK_MAP[i];
      return '<details class="ad-wd-day"' + (i === today ? ' open' : '') + '>' +
        '<summary><span class="ad-wd-name">' + name + '</span>' +
          (i === today ? badge('today', 'sun', 'ఈ రోజు') : '') +
          '<span class="ad-count" data-wdcount="' + i + '">' + wdCountHtml(i) + '</span>' +
          icon('chevron-down', 'ad-chev') + '</summary>' +
        '<div class="ad-wd-body">' +
          '<p class="ad-hint ad-wd-preview" data-wdprev="' + i + '">' + wdPreviewHtml(i) + '</p>' +
          '<div class="ad-wd-label" id="wdd-' + i + '">దేవతలు / Deities</div>' +
          '<div class="ad-wd-chips" role="group" aria-labelledby="wdd-' + i + '">' +
            deities.map((d) => '<button type="button" class="ad-chip" aria-pressed="' + row.deities.includes(d) + '" data-day="' + i + '" data-deity="' + d + '">' +
              icon('check', 'ad-chip-check') + DEITY_LABEL[d] + '</button>').join('') +
          '</div>' +
          '<div class="ad-wd-label" id="wds-' + i + '">స్తోత్రాలు (ఐచ్ఛికం) / Pin stotras</div>' +
          '<div class="ad-wd-chips ad-wd-scroll" role="group" aria-labelledby="wds-' + i + '">' +
            entries.map((e) => '<button type="button" class="ad-chip" aria-pressed="' + row.stotras.includes(e.key) + '" data-day="' + i + '" data-key="' + escapeHtml(e.key) + '">' +
              icon('check', 'ad-chip-check') + escapeHtml(e.title) + '</button>').join('') +
          '</div>' +
        '</div></details>';
    }).join('');
  }

  function toggleWdChip(b) {
    const day = +b.dataset.day;
    if (!WEEK_MAP || !WEEK_MAP[day]) return;
    const list = b.dataset.deity ? WEEK_MAP[day].deities : WEEK_MAP[day].stotras;
    const v = b.dataset.deity || b.dataset.key;
    const at = list.indexOf(v);
    if (at >= 0) list.splice(at, 1); else list.push(v);
    b.setAttribute('aria-pressed', String(at < 0));
    const count = document.querySelector('[data-wdcount="' + day + '"]');
    if (count) count.innerHTML = wdCountHtml(day);
    const prev = document.querySelector('[data-wdprev="' + day + '"]');
    if (prev) prev.innerHTML = wdPreviewHtml(day);
    wdDirty = true;
    syncWdDirty();
  }
  function syncWdDirty() {
    $('wdDirty').hidden = !wdDirty;
    $('wdSaveBtn').disabled = !WEEK_MAP;
  }

  async function saveWeekday() {
    if (!WEEK_MAP) return;
    const out = {};
    for (let i = 0; i < 7; i++) out[String(i)] = { deities: WEEK_MAP[i].deities.slice(), stotras: WEEK_MAP[i].stotras.slice() };
    const btn = $('wdSaveBtn');
    btn.disabled = true;
    try {
      await db.collection('config').doc('weekday').set(out);
      wdDirty = false;
      if (wdFromDefaults) { wdFromDefaults = false; $('wdNote').innerHTML = ''; }
      toast('వార పూజ క్రమం సేవ్ అయ్యింది / Weekday order saved');
    } catch (e) {
      toast('సేవ్ కాలేదు: ' + errText(e), 'error');
    } finally {
      syncWdDirty();
    }
  }

  /* ============================================================
     Export (JSON backup)
  ============================================================ */
  async function exportStotras() {
    const btn = $('exportBtn');
    btn.disabled = true;
    setMsg('exportMsg', 'busy', 'సిద్ధం చేస్తోంది… / Preparing…');
    try {
      const [st, up, wd] = await Promise.all([
        db.collection('stotras').get(),
        db.collection('updates').get().catch(() => null),
        db.collection('config').doc('weekday').get().catch(() => null),
      ]);
      const stotras = [];
      st.forEach((d) => stotras.push({ id: d.id, isOverrideOfBuiltin: isBuiltin(d.id), ...d.data() }));
      const updates = [];
      if (up) up.forEach((d) => updates.push({ id: d.id, ...d.data() }));
      const out = {
        exportedAt: new Date().toISOString(),
        project: 'stotramulu',
        count: stotras.length,
        stotras,
        updates,
        weekday: wd && wd.exists ? wd.data() : null,
      };
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'stotramulu-backup-' + todayYmd() + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const partial = (!up ? ' · కొత్తవి రాలేదు' : '') + (!wd ? ' · వార పూజ రాలేదు' : '');
      setMsg('exportMsg', partial ? 'info' : 'ok', stotras.length + ' స్తోత్రాలు, ' + updates.length + ' మార్పులు ఎగుమతి అయ్యాయి' + partial);
    } catch (e) {
      setMsg('exportMsg', 'error', 'ఎగుమతి కాలేదు: ' + errText(e));
    } finally {
      btn.disabled = false;
    }
  }

  /* ============================================================
     Tabs, unsaved-change guards, event wiring
  ============================================================ */
  function showTab(name) {
    if (!TABS.includes(name)) name = 'content';
    TABS.forEach((t) => {
      $('tab-' + t).hidden = t !== name;
      const nav = $('nav-' + t);
      if (t === name) nav.setAttribute('aria-current', 'page'); else nav.removeAttribute('aria-current');
    });
    if (name === 'feedback' && !fb.loaded && !fb.loading) loadFeedback(false);
    if (name === 'updates' && !upd.loaded && !upd.loading) loadUpdates();
    if (name === 'weekday' && !WEEK_MAP && !wdLoading) loadWeekday();
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
  }

  // A reply typed but not sent (and different from the one already saved).
  function hasUnsentReply() {
    for (const [id, text] of fb.drafts) {
      const t = String(text || '').trim();
      const r = fb.rows.find((x) => x.id === id);
      if (t && r && t !== String(r.reply || '').trim()) return true;
    }
    return false;
  }
  function hasUnsaved() {
    return wdDirty || (edDirty && !$('editorPanel').hidden) || (updDirty && !$('updEditor').hidden) || hasUnsentReply();
  }
  async function confirmDiscard(dirty) {
    if (!dirty) return true;
    return siteConfirm('సేవ్ చేయని మార్పులు పోతాయి. కొనసాగించాలా?\nUnsaved changes will be lost. Continue?', { okLabel: 'కొనసాగించు / Discard', danger: true });
  }

  let wired = false;
  function wireEvents() {
    if (wired) return;
    wired = true;

    // content list
    $('contentTable').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.edit) openEditor(b.dataset.edit);
      else if (b.dataset.revert) revertStotram(b.dataset.revert);
      else if (b.dataset.del) deleteStotram(b.dataset.del);
      else if (b.dataset.act === 'retry-content') loadContent().then(renderContent);
    });
    let contentTimer = 0;
    $('contentSearch').addEventListener('input', () => { clearTimeout(contentTimer); contentTimer = setTimeout(renderContent, 120); });
    $('editorPanel').addEventListener('input', (e) => {
      if (e.target.id === 'edImages') return;
      edDirty = true;
      if (e.target.id === 'edSlokams') updateVerseCount();
    });

    // feedback
    $('fbFilters').addEventListener('click', (e) => {
      const b = e.target.closest('[data-fbfilter]');
      if (!b || b.dataset.fbfilter === fb.filter) return;
      fb.filter = b.dataset.fbfilter;
      renderFeedback();
    });
    let fbTimer = 0;
    $('fbSearch').addEventListener('input', () => {
      clearTimeout(fbTimer);
      fbTimer = setTimeout(() => { fb.q = val('fbSearch').toLowerCase(); renderFeedback(); }, 150);
    });
    $('fbTypeFilter').addEventListener('change', () => { fb.type = $('fbTypeFilter').value; renderFeedback(); });
    const list = $('feedbackList');
    list.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b || b.disabled) return;
      if (b.dataset.act === 'retry-feedback') { loadFeedback(false); return; }
      const item = b.closest('.ad-fb-item');
      if (!item) return;
      const id = item.dataset.id;
      if (b.dataset.act === 'status') setFbStatus(id, b.dataset.status);
      else if (b.dataset.act === 'reply') sendFbReply(id);
      else if (b.dataset.act === 'delete') deleteFb(id);
    });
    list.addEventListener('input', (e) => {
      const ta = e.target.closest('textarea[data-reply]');
      if (!ta) return;
      const item = ta.closest('.ad-fb-item');
      fb.drafts.set(item.dataset.id, ta.value);
      const c = item.querySelector('[data-reply-count]');
      if (c) c.textContent = ta.value.length + ' / ' + REPLY_MAX;
      const slot = item.querySelector('[data-slot]');
      if (slot && slot.firstChild) setMsg(slot);
    });
    // `toggle` doesn't bubble; listen in the capture phase.
    list.addEventListener('toggle', (e) => {
      const d = e.target;
      if (!d.matches || !d.matches('details.ad-compose')) return;
      const id = d.closest('.ad-fb-item').dataset.id;
      if (d.open) {
        fb.open.add(id);
        // only when the reader opened it (not when a re-render restores it)
        if (d.contains(document.activeElement)) { const ta = d.querySelector('textarea'); if (ta) ta.focus(); }
      } else fb.open.delete(id);
    }, true);

    // updates
    $('updEditor').addEventListener('input', () => { updDirty = true; updatePreview(); });
    $('updEditor').addEventListener('change', () => { updatePreview(); });
    $('updatesList').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b || b.disabled) return;
      if (b.dataset.act === 'retry-updates') loadUpdates();
      else if (b.dataset.act === 'edit') openUpdateEditor(b.dataset.id);
      else if (b.dataset.act === 'delete') deleteUpdate(b.dataset.id);
    });
    $('bundledUpdatesList').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b || b.disabled) return;
      if (b.dataset.act === 'override') openUpdateEditor(b.dataset.id, true);
      else if (b.dataset.act === 'hide') hideBundled(b.dataset.id);
      else if (b.dataset.act === 'restore') deleteUpdate(b.dataset.id);
    });

    // weekday
    $('weekdayEditor').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.classList.contains('ad-chip')) toggleWdChip(b);
      else if (b.dataset.act === 'retry-weekday') loadWeekday();
    });

    window.addEventListener('hashchange', () => {
      const t = (location.hash || '').slice(1);
      if (TABS.includes(t)) showTab(t);
    });
    window.addEventListener('beforeunload', (e) => {
      if (!hasUnsaved()) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  /* ---------- handlers admin.html calls ---------- */
  window.showTab = showTab;
  window.openEditor = () => openEditor();
  window.closeEditor = closeEditor;
  window.saveEditor = saveEditor;
  window.ocrExtract = ocrExtract;
  window.exportStotras = exportStotras;
  window.saveWeekday = saveWeekday;
  window.onEdCatChange = () => {
    const isNew = val('edCat') === '__new';
    $('edCatNewRow').hidden = !isNew;
    if (isNew) $('edCatNew').focus();
  };
  window.reloadFeedback = () => loadFeedback(false);
  window.loadMoreFeedback = () => loadFeedback(true);
  window.openUpdateEditor = () => openUpdateEditor();
  window.closeUpdateEditor = closeUpdateEditor;
  window.saveUpdate = saveUpdate;
  window.reloadUpdates = () => loadUpdates();

  auth.onAuthStateChanged(onAuth);
})();
