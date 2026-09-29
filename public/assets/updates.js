/* ============================================================
   WHAT'S NEW (కొత్తవి): the bell in the header, the home teaser
   and the #updatesOverlay sheet.

   Entries come from two places, merged by id and shown newest first:
     1. window.SITE_UPDATES (public/data/updates.js), bundled with the site;
     2. the Firestore "updates" collection, which the admin dashboard
        writes. It is read once window.StotramCloud is ready. If Firebase
        is blocked or offline, only the bundled list is shown and nothing
        throws.
   A cloud doc with the same id as a bundled entry replaces it. One with
   published:false hides it.

   "Unread" means the newest entry's date is later than localStorage
   stotramUpdatesSeen (YYYY-MM-DD). While something is unread, the red
   dot on the bell and the home teaser are shown. Opening the sheet marks
   everything as seen.

   Markup emitted: contract.md §4.14. Exports: window.openUpdates(),
   window.closeUpdates().
============================================================ */
(function () {
  'use strict';

  const SEEN_KEY = 'stotramUpdatesSeen';
  const CLOUD_LIMIT = 20;            // bounds Firestore reads per visit
  const CLOUD_TIMEOUT_MS = 10000;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const TAGS = {
    new:      { cls: 'tag-new',      icon: 'sparkle',    label: 'కొత్తది' },
    improved: { cls: 'tag-improved', icon: 'chevron-up', label: 'మెరుగుదల' },
    fixed:    { cls: 'tag-fixed',    icon: 'check',      label: 'సరిచేశాం' }
  };
  const TE_MONTHS = ['జనవరి', 'ఫిబ్రవరి', 'మార్చి', 'ఏప్రిల్', 'మే', 'జూన్', 'జులై', 'ఆగస్టు', 'సెప్టెంబర్', 'అక్టోబర్', 'నవంబర్', 'డిసెంబర్'];
  const DEFAULT_BTN_LABEL = "కొత్తవి / What's new";

  let cloudItems = [];          // published entries from Firestore, normalised
  let cloudHidden = new Set();  // ids the admin unpublished (hide the bundled copy too)
  let cloudState = 'idle';      // idle → loading → done (back to idle on failure, so it can retry)
  let baseBtnLabel = DEFAULT_BTN_LABEL;
  let teaserShown = '';         // markup last written into #updatesTeaser ('' = hidden)
  let savedOverflow = '';
  let returnTo = null;

  /* ---------- small helpers ---------- */
  const byId = (id) => document.getElementById(id);
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
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
  function toMillis(v) {
    if (!v) return 0;
    if (typeof v.toMillis === 'function') { try { return v.toMillis(); } catch (e) { return 0; } }
    if (typeof v.seconds === 'number') return v.seconds * 1000;
    const t = new Date(v).getTime();
    return isNaN(t) ? 0 : t;
  }
  function ymdOf(v) {
    if (typeof v === 'string') return v.trim();
    const ms = toMillis(v);       // tolerate a Timestamp/Date written by mistake
    if (!ms) return '';
    const d = new Date(ms);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
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

  /* 'YYYY-MM-DD' → "28 సెప్టెంబర్ 2026". Built as a local date so no time
     zone can shift the day; falls back to our own month names when the
     browser has no Telugu locale data. */
  function formatDate(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    if (!m) return ymd;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    let s = '';
    try { s = d.toLocaleDateString('te-IN', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) {}
    if (!/[\u0C00-\u0C7F]/.test(s)) s = d.getDate() + ' ' + TE_MONTHS[d.getMonth()] + ' ' + d.getFullYear();
    return s.replace(/,\s*(\d{4})$/, ' $1');
  }

  function readSeen() { try { return localStorage.getItem(SEEN_KEY) || ''; } catch (e) { return ''; } }
  function writeSeen(v) { try { localStorage.setItem(SEEN_KEY, v); } catch (e) {} }

  /* ---------- data ---------- */
  function normalize(raw, id) {
    if (!raw || typeof raw !== 'object') return null;
    const date = ymdOf(raw.date);
    const title = String(raw.title == null ? '' : raw.title).trim();
    if (!DATE_RE.test(date) || !title) return null;
    return {
      id: String(id || raw.id || (date + ':' + title)),
      date: date,
      tag: hasOwn(TAGS, raw.tag) ? raw.tag : 'new',
      title: title,
      body: String(raw.body == null ? '' : raw.body).trim(),
      stamp: 0,
      order: 0
    };
  }

  function allItems() {
    const map = new Map();
    const local = Array.isArray(window.SITE_UPDATES) ? window.SITE_UPDATES : [];
    local.forEach((u, i) => {
      const n = normalize(u, u && u.id);
      if (n && !map.has(n.id)) { n.order = i; map.set(n.id, n); }
    });
    cloudHidden.forEach((id) => map.delete(id));
    cloudItems.forEach((n) => map.set(n.id, n));
    // newest date first; on the same day admin entries (stamp > 0) lead,
    // then the bundled file's own order
    return Array.from(map.values()).sort((a, b) =>
      (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) || (b.stamp - a.stamp) || (a.order - b.order));
  }

  function unseen(items) {
    const seen = readSeen();
    return items.filter((u) => u.date > seen);
  }

  function markSeen(items) {
    const newest = items.length ? items[0].date : '';
    if (newest && newest > readSeen()) writeSeen(newest);
    refreshIndicators(items);
  }

  /* ---------- markup (contract §4.14) ---------- */
  function itemHtml(u) {
    const t = TAGS[u.tag] || TAGS.new;
    return '<article class="update-item">' +
        '<div class="update-meta">' +
          '<span class="tag ' + t.cls + '">' + icon(t.icon) + t.label + '</span>' +
          '<time datetime="' + esc(u.date) + '">' + esc(formatDate(u.date)) + '</time>' +
        '</div>' +
        '<h3 class="update-title">' + esc(u.title) + '</h3>' +
        (u.body ? '<p class="update-body">' + esc(u.body) + '</p>' : '') +
      '</article>';
  }

  function emptyHtml() {
    return '<div class="empty-state">' +
        '<span class="empty-state-mark">' + icon('sparkle') + '</span>' +
        '<h3>ఇంకా కొత్తవి ఏమీ లేవు</h3>' +
        '<p>కొత్త సదుపాయం లేదా మార్పు వచ్చినప్పుడు ఇక్కడ కనిపిస్తుంది.</p>' +
      '</div>';
  }

  function teaserHtml(u) {
    return '<button type="button" class="updates-teaser-card" onclick="openUpdates()">' +
        '<span class="medallion" aria-hidden="true">' + icon('sparkle') + '</span>' +
        '<span class="updates-teaser-copy">' +
          '<span class="tag tag-new">కొత్తది</span>' +
          '<b>' + esc(u.title) + '</b>' +
          (u.body ? '<small>' + esc(u.body) + '</small>' : '') +
        '</span>' +
        icon('chevron-right') +
      '</button>';
  }

  /* ---------- the bell dot, its label and the home teaser ---------- */
  function refreshIndicators(items) {
    const fresh = unseen(items || allItems());
    const n = fresh.length;

    const dot = byId('updatesDot');
    if (dot) dot.hidden = n === 0;

    const btn = byId('updatesBtn');
    if (btn) {
      btn.classList.toggle('has-unread', n > 0);
      btn.setAttribute('aria-label', n
        ? 'కొత్తవి — ' + n + ' కొత్త ' + (n === 1 ? 'మార్పు' : 'మార్పులు') + " / What's new (" + n + ' new)'
        : baseBtnLabel);
    }

    const box = byId('updatesTeaser');
    if (!box) return;
    // Compared with what we wrote last, not with box.innerHTML: the browser
    // serialises <use/> differently, so that test would never match and the
    // teaser would be rebuilt (dropping keyboard focus) on every refresh.
    const html = n ? teaserHtml(fresh[0]) : '';
    if (html !== teaserShown) { box.innerHTML = html; teaserShown = html; }
    box.hidden = !n;
  }

  /* ---------- sheet ---------- */
  function overlay() { return byId('updatesOverlay'); }
  function isOpen() { const o = overlay(); return !!(o && o.classList.contains('active')); }
  // Layers that sit above this sheet handle their own Escape first. A confirm
  // dialog that is fading out (data-closing) no longer counts, as in app.js.
  function higherLayerOpen() {
    return !!document.querySelector('.sc-overlay:not([data-closing]), #infoOverlay.active, #feedbackOverlay.active, #daySheetOverlay.active');
  }

  function renderList(items) {
    const list = byId('updatesList');
    if (list) list.innerHTML = items.length ? items.map(itemHtml).join('') : emptyHtml();
  }

  function openUpdates() {
    const o = overlay();
    if (!o) return;
    const items = allItems();
    renderList(items);
    if (!o.classList.contains('active')) {
      savedOverflow = document.body.style.overflow;
      returnTo = document.activeElement;
      o.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
    const sheet = o.querySelector('.sheet');
    if (sheet) sheet.scrollTop = 0;
    markSeen(items);              // clears the dot and hides the teaser
    const title = byId('updatesTitle');
    if (title && !title.hasAttribute('tabindex')) title.setAttribute('tabindex', '-1');
    focusQuietly(title || o.querySelector('.sheet-close'));
    if (typeof gaEvent === 'function') { try { gaEvent('screen_view', { screen_name: 'Updates' }); } catch (e) {} }
    if (cloudState === 'idle') loadCloud();   // retry if the first attempt failed
  }

  function closeUpdates() {
    const o = overlay();
    if (!o || !o.classList.contains('active')) return;
    o.classList.remove('active');
    document.body.style.overflow = savedOverflow;
    savedOverflow = '';
    const back = returnTo;
    returnTo = null;
    // The teaser hides itself on open, and the account row sits in a closed
    // sheet, so fall back to the bell in the header.
    const bell = byId('updatesBtn');
    focusQuietly(isShown(back) ? back : (isShown(bell) ? bell : null));
  }

  /* Keep Tab inside the sheet while it is open (aria-modal). */
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

  /* ---------- Firestore "updates" ---------- */
  function cloud() {
    const c = window.StotramCloud;
    return c && c.db ? c : null;
  }

  function applySnapshot(snap) {
    // Offline, Firestore answers from an empty local cache. Treat that as
    // "not loaded yet" so a later attempt can still fetch the real list.
    if (snap && snap.empty && snap.metadata && snap.metadata.fromCache) throw new Error('offline');
    const items = [];
    const hidden = new Set();
    snap.forEach((doc) => {
      const d = doc.data() || {};
      if (d.published === false) { hidden.add(doc.id); return; }
      const n = normalize(d, doc.id);
      if (!n) return;
      n.stamp = toMillis(d.updatedAt) || 1;
      n.order = -1;
      items.push(n);
    });
    cloudItems = items;
    cloudHidden = hidden;
    const all = allItems();
    if (isOpen()) { renderList(all); markSeen(all); }
    else refreshIndicators(all);
  }

  function loadCloud() {
    const c = cloud();
    if (!c || cloudState !== 'idle') return;
    cloudState = 'loading';
    const col = () => c.db.collection('updates');
    withTimeout(() => col().orderBy('date', 'desc').limit(CLOUD_LIMIT).get(), CLOUD_TIMEOUT_MS)
      .catch((e) => {
        // Rules that only allow reading published docs reject an unfiltered
        // query; ask again for exactly what they allow (sorted here instead).
        if (e && e.code === 'permission-denied') {
          return withTimeout(() => col().where('published', '==', true).limit(CLOUD_LIMIT).get(), CLOUD_TIMEOUT_MS);
        }
        throw e;
      })
      .then((snap) => { applySnapshot(snap); cloudState = 'done'; })
      .catch((e) => {
        cloudState = 'idle';
        console.warn('[updates] showing bundled updates only:', (e && (e.code || e.message)) || e);
      });
  }

  /* ---------- exports + wiring ---------- */
  window.openUpdates = openUpdates;
  window.closeUpdates = closeUpdates;

  if (typeof document === 'undefined' || !document.addEventListener) return;

  const btn = byId('updatesBtn');
  if (btn && btn.getAttribute('aria-label')) baseBtnLabel = btn.getAttribute('aria-label');
  refreshIndicators();

  // cloud.js runs before this file, so it may already be ready.
  if (cloud()) loadCloud();
  else document.addEventListener('cloud-ready', () => loadCloud());
  window.addEventListener('online', () => { if (cloudState === 'idle') loadCloud(); });

  document.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    const key = e.key;
    if (key === 'Escape' || key === 'Esc') {
      if (higherLayerOpen()) return;
      e.preventDefault();
      e.stopImmediatePropagation();   // only the top sheet closes
      closeUpdates();
      return;
    }
    // The bell also works on the Japamala page, whose Space key counts a
    // bead (japamala.js, window listener). Keep Space inside this sheet.
    if (key === ' ' || key === 'Spacebar' || e.code === 'Space') { e.stopPropagation(); return; }
    if (key === 'Tab' && !higherLayerOpen()) trapTab(e, overlay());
  }, true);
})();
