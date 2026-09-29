/* ============================================================
   వార పూజ — weekday ordering
   Shows a "ఈ రోజు" (Today) section at the TOP of the home page with
   the stotras that suit today's traditional worship day. Existing
   sections are left untouched below it, so nothing is reshuffled.

   How a stotram qualifies for a day:
     • its deity is listed for that day, OR
     • it is pinned individually for that day.
   Both lists may contain the same item on as many days as you like —
   Hanuman on Tuesday AND Saturday is perfectly fine.

   The map lives in Firestore `config/weekday` (anyone reads, admin
   writes via admin.html's dashboard). If it is missing we fall back to
   DEFAULT_MAP below, so the feature works before the map is ever set.

   Classic script → shares app.js globals (stotramConfig, escapeHtml,
   openReader). Loads after admin.js.
============================================================ */
(function () {
  // 0 = Sunday … 6 = Saturday (matches JS Date.getDay())
  const DAY_TE = ['ఆదివారం', 'సోమవారం', 'మంగళవారం', 'బుధవారం', 'గురువారం', 'శుక్రవారం', 'శనివారం'];
  const DAY_NOTE = [
    'విష్ణు / వేంకటేశ్వర స్తోత్రాలు', 'శివ ఆరాధన', 'హనుమాన్ / దుర్గా ఆరాధన', 'కృష్ణ / విష్ణు ఆరాధన',
    'సాయి / గురు ఆరాధన', 'లక్ష్మీ / దేవి ఆరాధన', 'వేంకటేశ్వర / హనుమాన్ / అయ్యప్ప స్తోత్రాలు',
  ];

  // deity keys come from each stotram's theme, so nothing extra to fill in.
  // A few themes are objects rather than deities — alias them.
  const DEITY_ALIAS = {
    bilva: 'shiva',        // bilva leaf → Shiva
    chalisa: 'hanuman',    // Hanuman Chalisa
    harati: 'saibaba',     // the harati we ship is Sai's
    manidweepa: 'lalitha', // Devi
    krishna: 'govinda',
  };

  const DEFAULT_MAP = {
    0: { deities: ['vishnu', 'venkat'], stotras: [] },              // Sunday
    1: { deities: ['shiva'], stotras: [] },                          // Monday
    2: { deities: ['hanuman', 'durga'], stotras: [] },               // Tuesday
    3: { deities: ['govinda', 'vishnu'], stotras: [] },              // Wednesday
    4: { deities: ['saibaba'], stotras: [] },                        // Thursday
    5: { deities: ['lakshmi', 'lalitha'], stotras: [] },             // Friday
    6: { deities: ['venkat', 'hanuman', 'ayyappa'], stotras: [] },   // Saturday
  };

  let MAP = JSON.parse(JSON.stringify(DEFAULT_MAP));

  function fs() { return window.firebase ? firebase.firestore() : null; }
  function deityOf(key) {
    const cfg = stotramConfig[key];
    if (!cfg) return '';
    const theme = (cfg.theme || '').replace('-theme', '');
    return DEITY_ALIAS[theme] || theme;
  }
  function todayIdx() { return new Date().getDay(); }

  /* ---------- load the map (all users) ---------- */
  async function loadWeekdayMap() {
    const d = fs();
    if (!d) return;
    try {
      const snap = await d.collection('config').doc('weekday').get();
      if (snap.exists) {
        const data = snap.data() || {};
        for (let i = 0; i < 7; i++) {
          const row = data[String(i)] || data[i];
          if (row) {
            MAP[i] = {
              deities: Array.isArray(row.deities) ? row.deities : [],
              stotras: Array.isArray(row.stotras) ? row.stotras : [],
            };
          }
        }
      }
    } catch (e) {
      console.warn('[weekday] load failed, using defaults', e);
    }
    renderToday();
  }

  /* ---------- the "ఈ రోజు" section on the home page ---------- */
  // Keys go into an inline onclick, so only plain ids are allowed (built-ins
  // and Firestore auto-ids always are).
  const SAFE_KEY = /^[A-Za-z0-9_-]+$/;

  function keysForToday() {
    const day = MAP[todayIdx()] || { deities: [], stotras: [] };
    const want = new Set(day.deities || []);
    const pinned = new Set(day.stotras || []);
    return Object.keys(stotramConfig).filter((k) => {
      const cfg = stotramConfig[k];
      if (!cfg || cfg.hidden || !SAFE_KEY.test(k)) return false;
      return pinned.has(k) || want.has(deityOf(k));
    });
  }

  function icon(name) {
    return '<svg class="icon-inline" aria-hidden="true"><use href="/icons.svg#icon-' + name + '"/></svg>';
  }

  // Deity emoji: app.js's shared lookup (admin icon → library card → theme).
  function emojiFor(k) {
    const cfg = stotramConfig[k] || {};
    const found = typeof window.stotramIcon === 'function' ? window.stotramIcon(k) : cfg.__icon;
    return String(found || '🕉️');
  }

  function tileHtml(k) {
    const cfg = stotramConfig[k];
    const theme = String(cfg.theme || '').replace(/[^\w-]/g, '');
    return '<button type="button" class="today-tile" onclick="openReader(\'' + k + '\')">' +
      '<span class="today-ico medallion' + (theme ? ' ' + theme : '') + '" aria-hidden="true">' + escapeHtml(emojiFor(k)) + '</span>' +
      '<span class="today-title">' + escapeHtml(String(cfg.title || k)) + '</span>' +
      icon('chevron-right') +
      '</button>';
  }

  // The last markup written, so repeated renders (Firestore map, cloud
  // stotras, the minute timer) don't rebuild an unchanged section.
  let rendered = { el: null, html: '' };

  function renderToday() {
    const home = document.getElementById('homePage');
    if (!home) return;
    const keys = keysForToday();

    let sec = document.getElementById('todaySection');
    if (!keys.length) { if (sec) sec.remove(); return; }

    if (!sec) {
      sec = document.createElement('div');
      sec.id = 'todaySection';
      sec.className = 'today-section';
      // place it above the first cards section (under the pradakshina counter)
      const first = home.querySelector('.cards-section');
      if (first) home.insertBefore(sec, first); else home.appendChild(sec);
    }

    const i = todayIdx();
    const html =
      '<div class="today-head">' +
        '<span class="today-icon" aria-hidden="true">' + icon('sun') + '</span>' +
        '<h2 class="today-day">ఈ రోజు — ' + DAY_TE[i] + '</h2>' +
        '<span class="today-note">' + DAY_NOTE[i] + '</span>' +
        '<button type="button" class="info-btn" data-info="today" aria-label="వివరణ: ఈ రోజు స్తోత్రాలు">' + icon('info') + '</button>' +
      '</div>' +
      '<p class="weekday-guidance">ఈ రోజు సూచనలు మాత్రమే. మీ సంప్రదాయం ప్రకారం ఏ రోజైనా చదవవచ్చు.</p>' +
      '<div class="today-strip">' + keys.slice(0, 3).map(tileHtml).join('') + '</div>';
    if (rendered.el === sec && rendered.html === html) return;
    sec.innerHTML = html;
    rendered = { el: sec, html };
  }

  // admin.js calls this after cloud stotras load, so newly added ones can
  // appear in today's list too.
  window.__renderToday = renderToday;

  // first paint from defaults, then refine once Firestore answers
  let lastDay = new Date().toDateString();
  function refreshDate() {
    const day = new Date().toDateString();
    if (day !== lastDay) { lastDay = day; renderToday(); }
  }
  document.addEventListener('visibilitychange', refreshDate);
  setInterval(refreshDate, 60000);
  renderToday();
  setTimeout(loadWeekdayMap, 400);
})();
