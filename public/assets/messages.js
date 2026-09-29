/* ============================================================
   MY MESSAGES (నా సందేశాలు) and the feedback type chips.

   1. Type chips. The four .fb-type-chip buttons in the feedback form work
      as one radio group that drives the visually hidden #fbType select
      (app.js reads that select). A delegated click selects a chip. Arrow
      keys, Home and End move the choice, and one roving tabindex keeps
      the group a single Tab stop. window.syncFeedbackChips() redraws the
      chips from #fbType.value; openFeedback(type) calls it.

   2. What was sent. app.js calls window.recordSentMessage(payload) after
      queueing a message. We keep {fbid, type, message, stotramTitle, at}
      in localStorage stotramMyMessages (newest first, at most 30).

   3. The sheet (#messagesOverlay). It lists the local copies, merged by
      fbid with the signed-in reader's own Firestore docs:
        feedback.where('uid', '==', uid)
      There is no orderBy, so sorting happens here. On the server,
      status = status, or (handled ? 'closed' : 'new') when it is unset.
      A local-only message shows 'queued' while its fbid is still in
      feedbackQueue_v1, and 'sent' after that. If the read fails (offline,
      or rules not deployed yet), the local list is shown and nothing
      breaks.

   4. Unseen replies. A reply counts as unseen when its repliedAt is later
      than localStorage stotramMessagesSeenAt. Unseen replies set the
      count in #messagesBadge and add .has-unread to the header's
      .hdr-account. Opening the sheet marks them seen.

   Markup emitted: contract.md §4.15. Exports: window.openMessages(),
   window.closeMessages(), window.recordSentMessage(),
   window.syncFeedbackChips().
============================================================ */
(function () {
  'use strict';

  const MINE_KEY = 'stotramMyMessages';
  const SEEN_KEY = 'stotramMessagesSeenAt';
  const QUEUE_KEY = 'feedbackQueue_v1';      // owned by app.js (queueFeedback / flushFeedback)
  const MAX_MINE = 30;
  const FETCH_LIMIT = 100;                   // sanity cap on reads per open
  const FETCH_TIMEOUT_MS = 10000;

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

  let server = new Map();       // fbid → reader's server doc (normalised), for serverUid
  let serverUid = null;
  let loading = false;
  let fetchSeq = 0;
  let savedOverflow = '';
  let returnTo = null;
  let introDefault = '';
  let introState = '';          // 'in' | 'out': which intro #messagesIntro shows now
  let summaryDefault = '';
  let accountLabel = '';

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
  function withTimeout(start, ms) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout')), ms);
      Promise.resolve().then(start).then(
        (v) => { clearTimeout(t); resolve(v); },
        (e) => { clearTimeout(t); reject(e); }
      );
    });
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
    const list = readMine().filter((m) => m.fbid !== entry.fbid);
    list.unshift(entry);
    writeMine(list);
    if (isOpen()) render();
  }

  /* ============================================================
     3. Server copies (signed-in reader only)
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
      status: SERVER_STATUSES.indexOf(raw) >= 0 ? raw : 'new',
      reply: typeof d.reply === 'string' ? d.reply.trim() : '',
      repliedAt: toDate(d.repliedAt)
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
        snap.forEach((doc) => map.set(doc.id, normServer(doc.id, doc.data() || {})));
        server = map;
        serverUid = uid;
        return true;
      })
      .catch((e) => {
        // e.g. permission-denied until the new rules are deployed: local list only
        if (seq === fetchSeq) console.warn('[messages] showing messages saved on this phone only:', (e && (e.code || e.message)) || e);
        return false;
      })
      .then((ok) => { if (seq === fetchSeq) loading = false; return ok; });
  }

  function mergedItems() {
    const queued = queuedIds();
    const out = new Map();
    readMine().forEach((m) => {
      out.set(m.fbid, {
        fbid: m.fbid,
        type: hasOwn(TYPES, m.type) ? m.type : 'other',
        message: m.message,
        stotramTitle: m.stotramTitle || '',
        at: toDate(m.at),
        status: queued.has(m.fbid) ? 'queued' : 'sent',
        reply: '',
        repliedAt: null
      });
    });
    server.forEach((s, id) => {
      const l = out.get(id);
      out.set(id, {
        fbid: id,
        type: s.type,
        message: s.message || (l ? l.message : ''),
        stotramTitle: s.stotramTitle || (l ? l.stotramTitle : ''),
        at: s.at || (l ? l.at : null),
        status: s.status,
        reply: s.reply,
        repliedAt: s.repliedAt
      });
    });
    // Latest activity first, so a fresh reply to an old message comes to the top.
    const activity = (m) => Math.max(m.at ? m.at.getTime() : 0, m.repliedAt ? m.repliedAt.getTime() : 0);
    return Array.from(out.values())
      .filter((m) => m.message || m.reply)
      .sort((a, b) => activity(b) - activity(a));
  }

  /* ============================================================
     4. Unseen replies → badge, header dot, account-row summary
  ============================================================ */
  function readSeenAt() {
    try { return toDate(localStorage.getItem(SEEN_KEY)); } catch (e) { return null; }
  }
  function unseenReplyCount() {
    const seen = readSeenAt();
    let n = 0;
    server.forEach((s) => {
      if (!s.reply) return;
      if (!seen) n++;
      else if (s.repliedAt && s.repliedAt.getTime() > seen.getTime()) n++;
    });
    return n;
  }
  // Called while the sheet shows the replies we hold. The mark is the newest
  // repliedAt actually shown, which is server time compared with server time.
  // So a phone clock that is off can't hide a reply. A refresh that failed
  // can't mark as seen a reply that was never displayed.
  function markSeen() {
    let latest = 0;
    let replies = 0;
    server.forEach((s) => {
      if (!s.reply) return;
      replies++;
      if (s.repliedAt) latest = Math.max(latest, s.repliedAt.getTime());
    });
    if (replies) {
      const prev = readSeenAt();
      const t = latest || Date.now();          // replies without a time: seen as of now
      if (!prev || t > prev.getTime()) {
        try { localStorage.setItem(SEEN_KEY, new Date(t).toISOString()); } catch (e) {}
      }
    }
    updateBadge();
  }

  function updateBadge() {
    const n = unseenReplyCount();
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
     5. The sheet
  ============================================================ */
  function overlay() { return byId('messagesOverlay'); }
  function isOpen() { const o = overlay(); return !!(o && o.classList.contains('active')); }
  function higherLayerOpen() {
    return !!document.querySelector('.sc-overlay:not([data-closing]), #infoOverlay.active, #feedbackOverlay.active, #daySheetOverlay.active');
  }

  function itemHtml(m) {
    const t = TYPES[m.type] || TYPES.other;
    const s = STATUS[m.status] || STATUS.new;
    const meta = [relTime(m.at), m.stotramTitle].filter(Boolean).join(' · ');
    return '<article class="message-item">' +
        '<div class="message-top">' +
          '<span class="message-type">' + icon(t.icon) + ' ' + esc(t.label) + '</span>' +
          '<span class="status-pill" data-status="' + esc(m.status) + '">' + icon(s.icon) + ' ' + esc(s.label) + '</span>' +
        '</div>' +
        '<p class="message-text">' + multiline(m.message) + '</p>' +
        (meta ? '<div class="message-meta">' + icon('clock') + '<span>' + esc(meta) + '</span></div>' : '') +
        (m.reply
          ? '<div class="message-reply"><b>' + TEAM + '</b><p>' + multiline(m.reply) + '</p>' +
              (m.repliedAt ? '<small>' + esc(relTime(m.repliedAt)) + '</small>' : '') + '</div>'
          : '') +
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
        '<p>మీ సందేశాలు తెస్తున్నాం…</p>' +
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

  function render() {
    renderIntro();
    const list = byId('messagesList');
    if (!list) return;
    const items = mergedItems();
    const busy = loading && !items.length;
    list.setAttribute('aria-busy', busy ? 'true' : 'false');
    list.innerHTML = items.length ? items.map(itemHtml).join('') : (busy ? loadingHtml() : emptyHtml());
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
    }
    render();
    markSeen();
    const sheet = o.querySelector('.sheet');
    if (sheet) sheet.scrollTop = 0;
    const title = byId('messagesTitle');
    if (title && !title.hasAttribute('tabindex')) title.setAttribute('tabindex', '-1');
    focusQuietly(title || o.querySelector('.sheet-close'));
    if (typeof gaEvent === 'function') { try { gaEvent('screen_view', { screen_name: 'My messages' }); } catch (e) {} }
    refresh.then(() => {
      if (isOpen()) { render(); markSeen(); }
      else updateBadge();
    });
  }

  function closeMessages() {
    const o = overlay();
    if (!o || !o.classList.contains('active')) return;
    o.classList.remove('active');
    document.body.style.overflow = savedOverflow;
    savedOverflow = '';
    const back = returnTo;
    returnTo = null;
    // Opened from the account sheet, whose row is hidden now: fall back to
    // the account button in the header.
    const acct = document.querySelector('.hdr-account');
    focusQuietly(isShown(back) ? back : (isShown(acct) ? acct : null));
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

  /* Sign-in / sign-out: refresh the server copies, the badge and an open sheet. */
  function onAuth(user) {
    if (!user) {
      fetchSeq++;
      server = new Map(); serverUid = null; loading = false;
      updateBadge();
      if (isOpen()) render();
      return;
    }
    const refresh = fetchServer();
    if (isOpen()) render();
    refresh.then(() => {
      if (isOpen()) { render(); markSeen(); }
      else updateBadge();
    });
  }

  /* ---------- exports ---------- */
  window.openMessages = openMessages;
  window.closeMessages = closeMessages;
  window.recordSentMessage = recordSentMessage;
  window.syncFeedbackChips = syncFeedbackChips;

  if (typeof document === 'undefined' || !document.addEventListener) return;

  /* ---------- wiring ---------- */
  document.addEventListener('click', (e) => {
    const chip = e.target && e.target.closest ? e.target.closest('.fb-type-chip') : null;
    if (chip) chooseChip(chip, false);
  });

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
    // form and for pressing buttons in this sheet.
    if (isSpace && t && t.closest && t.closest('#feedbackOverlay.active, #messagesOverlay.active')) {
      e.stopPropagation();
      return;
    }

    if (!isOpen()) return;
    if (key === 'Escape' || key === 'Esc') {
      if (higherLayerOpen()) return;
      e.preventDefault();
      e.stopImmediatePropagation();   // only the top sheet closes
      closeMessages();
      return;
    }
    if (isSpace) { e.stopPropagation(); return; }
    if (key === 'Tab' && !higherLayerOpen()) trapTab(e, overlay());
  }, true);

  const fbType = byId('fbType');
  if (fbType) fbType.addEventListener('change', syncFeedbackChips);
  // Whatever opens the form, the chips show the current #fbType when it appears.
  const fbOverlay = byId('feedbackOverlay');
  if (fbOverlay && typeof MutationObserver === 'function') {
    new MutationObserver(() => { if (fbOverlay.classList.contains('active')) syncFeedbackChips(); })
      .observe(fbOverlay, { attributes: true, attributeFilter: ['class'] });
  }
  syncFeedbackChips();

  document.addEventListener('cloud-auth', (e) => onAuth(e && e.detail ? e.detail : null));
  // cloud.js loads earlier; the first auth answer may already have arrived.
  if (currentUser()) onAuth(currentUser());
  else updateBadge();
})();
