/* ============================================================
   CLOUD STOTRAS — load published stotras from Firestore and render
   them as cards + make them readable/searchable — by merging into the
   same window.STOTRAS_DATA the site already uses. No file/script/card
   edits needed to publish a new one.

   Admin content management (add/edit/delete/OCR/feedback/weekday/export)
   lives on its own page — see admin.html + admin-dashboard.js. This
   file only shows a discreet link to that page when the signed-in user
   is the admin; it ships to every visitor, so it stays small. That
   ADMIN_UID check is a UI convenience only — the real boundary is the
   Firestore security rules (console-managed, not in this repo) plus
   src/ocr.js's server-side check for the OCR endpoint.

   Classic script → shares app.js globals (stotramConfig, origins,
   meanings, buildSearchIndex, searchIndex). Loads after cloud.js and
   takes Firebase from window.StotramCloud; without it (SDK blocked or
   offline) it does nothing.
============================================================ */
(function () {
  'use strict';

  if (typeof stotramConfig === 'undefined' || typeof origins === 'undefined' || typeof meanings === 'undefined') return;

  const ADMIN_UID = window.ADMIN_UID;

  // theme → deity svg + accent + icon (mirrors the built-in cards)
  const THEMES = {
    vishnu:  { svg: '#svg-vishnu',  color: '#3070c0', icon: '🔱', label: 'విష్ణు' },
    lalitha: { svg: '#svg-lalitha', color: '#c04070', icon: '🌺', label: 'లలిత/దేవి' },
    shiva:   { svg: '#svg-shiva',   color: '#5088b0', icon: '🙏', label: 'శివ' },
    venkat:  { svg: '#svg-venkat',  color: '#c89838', icon: '⛰️', label: 'వేంకటేశ్వర' },
    ganesha: { svg: '#svg-ganesha', color: '#e08040', icon: '🐘', label: 'గణేశ' },
    hanuman: { svg: '#svg-hanuman', color: '#d06030', icon: '🚩', label: 'హనుమాన్' },
    lakshmi: { svg: '#svg-lakshmi', color: '#e0b840', icon: '💎', label: 'లక్ష్మి' },
    saibaba: { svg: '#svg-saibaba', color: '#d08040', icon: '🌟', label: 'సాయి' },
    ayyappa: { svg: '#svg-ayyappa', color: '#4080c8', icon: '🏔️', label: 'అయ్యప్ప' },
    durga:   { svg: '#svg-durga',   color: '#d04050', icon: '🔥', label: 'దుర్గా' },
    govinda: { svg: '#svg-krishna', color: '#4090d0', icon: '🦚', label: 'కృష్ణ/గోవింద' },
    bilva:   { svg: '#svg-bilva',   color: '#409848', icon: '🍃', label: 'బిల్వ' },
    harati:  { svg: '#svg-diya',    color: '#ffaa3c', icon: '🪔', label: 'హారతి' },
  };
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
  // Doc ids and category slugs go into attribute selectors; quote-safe them.
  function cssStr(v) {
    const s = String(v == null ? '' : v);
    return (window.CSS && typeof CSS.escape === 'function') ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&');
  }

  let db = null;
  function fs() {
    if (db) return db;
    const c = window.StotramCloud;
    if (c && c.db) db = c.db;
    return db;
  }
  const cloudKeys = new Set();          // stotras that exist ONLY in Firestore
  const overrideKeys = new Set();       // built-in stotras currently overridden

  // Snapshot of the 20 built-in stotras exactly as the .js files defined them.
  // Editing a built-in saves a Firestore doc under the SAME key, which shadows
  // the file; reverting deletes that doc and we restore from this snapshot, so
  // the original text is never lost and the files never need touching.
  const BUILTIN = {};
  Object.keys(stotramConfig).forEach((k) => {
    BUILTIN[k] = {
      cfg: JSON.parse(JSON.stringify(stotramConfig[k])),
      origin: origins[k] || '',
      meanings: JSON.parse(JSON.stringify(meanings[k] || {})),
    };
  });
  const isBuiltin = (k) => hasOwn(BUILTIN, k);

  /* ---------- load + render published cloud stotras (every visitor) ---------- */
  async function loadCloudStotras() {
    const d = fs(); if (!d) return;
    let snap;
    try { snap = await d.collection('stotras').get(); }
    catch (e) { console.warn('[stotras] load failed', e); return; }

    // clear previously rendered cloud cards + their config (handles deletes/edits)
    document.querySelectorAll('.card.cloud-card').forEach((el) => el.remove());
    cloudKeys.forEach((k) => { delete stotramConfig[k]; delete origins[k]; delete meanings[k]; });
    cloudKeys.clear();
    // restore any built-in that was overridden last time, so a deleted override
    // cleanly reverts to the original file text
    overrideKeys.forEach((k) => restoreBuiltin(k));
    overrideKeys.clear();

    const list = [];
    snap.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
    list.sort((a, b) => (a.position || 0) - (b.position || 0));

    list.forEach((s) => {
      if (s.published === false) return;
      const key = s.id;

      // editing one of the 20 built-ins → patch it in place, don't add a card
      if (isBuiltin(key)) {
        applyOverride(key, s);
        overrideKeys.add(key);
        return;
      }

      const th = hasOwn(THEMES, s.theme) ? THEMES[s.theme] : THEMES.vishnu;
      stotramConfig[key] = {
        title: s.title || '', subtitle: s.subtitle || '',
        theme: (s.theme || 'vishnu') + '-theme',
        svgId: th.svg, svgColor: th.color,
        origin: s.origin || '',
        data: Array.isArray(s.data) ? s.data : [],
        __cloud: true, __cat: s.category || 'stotras', __catLabel: s.categoryLabel || '',
        __icon: s.icon || th.icon, __desc: s.desc || '',
      };
      origins[key] = s.origin || '';
      meanings[key] = s.meanings || {};
      cloudKeys.add(key);
      try { renderCard(key); } catch (e) { console.warn('[stotras] card not shown:', key, e); }
    });

    try { searchIndex = buildSearchIndex(); } catch (e) {}
    document.dispatchEvent(new Event('stotras-updated'));
    // newly added stotras may belong to today's worship day
    if (window.__renderToday) { try { window.__renderToday(); } catch (e) {} }
  }

  /* ---------- built-in overrides (edits made from the admin dashboard) ---------- */
  // Apply an admin's edits on top of a built-in: update the config the reader
  // uses, and the text on its existing card. Theme/category stay as the file
  // defined them, so the card keeps its place and artwork.
  function applyOverride(key, s) {
    const cfg = stotramConfig[key];
    if (!cfg) return;
    if (s.title) cfg.title = s.title;
    if (s.subtitle !== undefined) cfg.subtitle = s.subtitle;
    if (Array.isArray(s.data) && s.data.length) {
      cfg.data = s.data;
      // Distinguish remotely edited verse positions from the bundled edition.
      let hash = 2166136261;
      for (const ch of JSON.stringify(s.data)) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
      cfg.readingVersion = 'cloud-' + (hash >>> 0).toString(16);
      meanings[key] = s.meanings || {};
    }
    if (s.origin !== undefined) { cfg.origin = s.origin; origins[key] = s.origin; }
    if (s.meanings) meanings[key] = s.meanings;
    cfg.__edited = true;
    patchCardText(key, s.title || cfg.title, s.subtitle, s.desc);
  }

  function restoreBuiltin(key) {
    const snap = BUILTIN[key];
    if (!snap) return;
    stotramConfig[key] = JSON.parse(JSON.stringify(snap.cfg));
    origins[key] = snap.origin;
    meanings[key] = JSON.parse(JSON.stringify(snap.meanings));
    patchCardText(key, snap.cfg.title, snap.cfg.subtitle, null);
  }

  // Update the title/subtitle/description shown on a built-in's hand-written card.
  function patchCardText(key, title, subtitle, desc) {
    const card = document.querySelector('.card[data-stotram="' + cssStr(key) + '"]');
    if (!card) return;
    const h3 = card.querySelector('h3');
    const sub = card.querySelector('.card-sub');
    const ds = card.querySelector('.card-desc');
    if (h3 && title) h3.textContent = title;
    if (sub && subtitle !== undefined && subtitle !== null) sub.textContent = subtitle;
    if (ds && desc) ds.textContent = desc;
  }

  // Same shape as the static sections in index.html:
  // div.cards-section[data-cat] > .section-divider (h2.section-title + .section-sub) + .cards-grid
  function gridForCategory(slug, label) {
    let sec = document.querySelector('.cards-section[data-cat="' + cssStr(slug) + '"]');
    if (!sec) {
      const home = document.getElementById('homePage');
      sec = document.createElement('div');
      sec.className = 'cards-section';
      sec.dataset.cat = slug;
      sec.innerHTML =
        '<div class="section-divider"><h2 class="section-title">' +
        esc(label || slug) + '</h2><div class="section-sub"></div></div>' +
        '<div class="cards-grid"></div>';
      home.appendChild(sec);
    }
    return sec.querySelector('.cards-grid');
  }

  // Same structure as the static cards in index.html (contract §3 "Card"):
  // a.card.<theme>[href][data-stotram] > .card-bg, svg.card-deity-svg,
  // .card-content > .card-icon-wrap > span.deity-icon, h3, .card-sub, .card-desc,
  // span.card-action ("చదవండి" + arrow icon). The cloud-card class marks it for removal on reload.
  function renderCard(key) {
    const cfg = stotramConfig[key];
    const themeKey = String(cfg.theme || '').replace('-theme', '').replace(/[^\w-]/g, '');
    const grid = gridForCategory(cfg.__cat, cfg.__catLabel);
    const desc = cfg.__desc || (cfg.origin ? (cfg.origin.slice(0, 90) + '…') : '');
    const card = document.createElement('a');
    card.className = 'card cloud-card' + (themeKey ? ' ' + themeKey : '');
    card.href = '?stotram=' + encodeURIComponent(key);
    card.dataset.stotram = key;
    card.innerHTML =
      '<div class="card-bg"></div>' +
      '<svg class="card-deity-svg" style="color:' + esc(cfg.svgColor) + '" aria-hidden="true"><use href="' + esc(cfg.svgId) + '"/></svg>' +
      '<div class="card-content">' +
        '<div class="card-icon-wrap"><span class="deity-icon">' + esc(cfg.__icon || '🕉️') + '</span></div>' +
        '<h3>' + esc(cfg.title) + '</h3>' +
        '<div class="card-sub">' + esc(cfg.subtitle || '') + '</div>' +
        '<div class="card-desc">' + esc(desc) + '</div>' +
        '<span class="card-action" aria-hidden="true">చదవండి <svg class="icon-inline"><use href="/icons.svg#icon-arrow-right"/></svg></span>' +
      '</div>';
    grid.appendChild(card);
  }

  /* ---------- discreet link to the admin dashboard page (contract §4.10) ---------- */
  function isAdmin(u) { return !!(u && ADMIN_UID && u.uid === ADMIN_UID); }

  let adminLinkShown = false;
  function renderAdminLink(u) {
    const box = document.getElementById('adminLinkBox');
    if (!box) return;
    const show = isAdmin(u);
    if (show === adminLinkShown) return;       // auth refreshes often; only redraw on a change
    adminLinkShown = show;
    box.innerHTML = show
      ? '<a class="btn btn-quiet btn-block admin-dash-link" href="/admin.html">' +
          '<svg class="icon-inline" aria-hidden="true"><use href="/icons.svg#icon-sliders"/></svg>' +
          'నిర్వాహక డాష్‌బోర్డ్</a>'
      : '';
  }

  const cloud = window.StotramCloud;
  if (cloud && cloud.auth) {
    try { cloud.auth.onAuthStateChanged(renderAdminLink); } catch (e) { console.warn('[admin] auth watch failed', e); }
  }

  // kick off cloud-content load
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', loadCloudStotras);
  else loadCloudStotras();
})();
