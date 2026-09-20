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
   writes). If it is missing we fall back to DEFAULT_MAP below, so the
   feature works before you ever open the editor.

   Classic script → shares app.js globals (stotramConfig, escapeHtml,
   openReader, siteAlert). Loads after admin.js.
============================================================ */
(function () {
  const ADMIN_UID = "0d3PPSYaFncy1tY2oUGtBMGMFwu2";

  // 0 = Sunday … 6 = Saturday (matches JS Date.getDay())
  const DAY_TE = ['ఆదివారం', 'సోమవారం', 'మంగళవారం', 'బుధవారం', 'గురువారం', 'శుక్రవారం', 'శనివారం'];
  const DAY_NOTE = [
    'సూర్య / విష్ణు ఆరాధన', 'శివ ఆరాధన', 'హనుమాన్ / దుర్గా ఆరాధన', 'కృష్ణ / విష్ణు ఆరాధన',
    'సాయి / గురు ఆరాధన', 'లక్ష్మీ / దేవి ఆరాధన', 'వేంకటేశ్వర / శని ఆరాధన',
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
  const DEITY_LABEL = {
    vishnu: 'విష్ణు', lalitha: 'లలిత/దేవి', shiva: 'శివ', venkat: 'వేంకటేశ్వర',
    ganesha: 'గణేశ', hanuman: 'హనుమాన్', lakshmi: 'లక్ష్మి', saibaba: 'సాయి',
    ayyappa: 'అయ్యప్ప', durga: 'దుర్గా', govinda: 'కృష్ణ/గోవింద',
  };

  // Traditional default — editable in the admin panel.
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
  let loaded = false;

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
    loaded = true;
    renderToday();
  }

  /* ---------- the "ఈ రోజు" section on the home page ---------- */
  function keysForToday() {
    const day = MAP[todayIdx()] || { deities: [], stotras: [] };
    const want = new Set(day.deities || []);
    const pinned = new Set(day.stotras || []);
    return Object.keys(stotramConfig).filter((k) => {
      const cfg = stotramConfig[k];
      if (!cfg || cfg.hidden) return false;
      return pinned.has(k) || want.has(deityOf(k));
    });
  }

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
    sec.innerHTML =
      '<div class="today-head"><span class="today-day">🌅 ఈ రోజు — ' + DAY_TE[i] + '</span>' +
      '<span class="today-note">' + DAY_NOTE[i] + '</span></div>' +
      '<div class="today-strip">' +
      keys.map((k) => {
        const cfg = stotramConfig[k];
        const icon = cfg.__icon || '🕉️';
        return '<button class="today-tile" onclick="openReader(\'' + k + '\')">' +
          '<span class="today-ico">' + icon + '</span>' +
          '<span class="today-title">' + escapeHtml(cfg.title || k) + '</span>' +
          '</button>';
      }).join('') +
      '</div>';
  }

  /* ---------- admin editor ---------- */
  function openWeekdayEditor() {
    if (!window.firebase || !firebase.auth().currentUser ||
        firebase.auth().currentUser.uid !== ADMIN_UID) return;

    let ov = document.getElementById('wdOverlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'wdOverlay'; ov.className = 'admin-overlay';
      document.body.appendChild(ov);
      ov.addEventListener('click', (e) => { if (e.target === ov) closeWeekdayEditor(); });
    }

    const allKeys = Object.keys(stotramConfig).filter((k) => stotramConfig[k] && !stotramConfig[k].hidden);
    const deities = Object.keys(DEITY_LABEL);

    ov.innerHTML = '<div class="admin-box">' +
      '<div class="admin-head"><h2>🗓️ వార పూజ</h2>' +
      '<button class="search-close-btn" onclick="closeWeekdayEditor()">✕</button></div>' +
      '<div class="ad-builtin-note">ఏ రోజు ఏ దేవత స్తోత్రాలు ముందు చూపించాలో ఎంచుకోండి. ' +
      'ఒకే దేవతను/స్తోత్రాన్ని ఎన్ని రోజులకైనా ఎంచుకోవచ్చు.</div>' +
      DAY_TE.map((name, i) => {
        const row = MAP[i] || { deities: [], stotras: [] };
        return '<details class="wd-day"' + (i === todayIdx() ? ' open' : '') + '>' +
          '<summary><b>' + name + '</b> <span class="wd-count">' +
          ((row.deities || []).length + (row.stotras || []).length) + ' ఎంపిక</span></summary>' +
          '<div class="wd-label">దేవతలు</div><div class="wd-chips">' +
          deities.map((d) => '<button class="wd-chip' + ((row.deities || []).includes(d) ? ' on' : '') +
            '" data-day="' + i + '" data-deity="' + d + '">' + DEITY_LABEL[d] + '</button>').join('') +
          '</div>' +
          '<div class="wd-label">ఈ స్తోత్రాలను కూడా (ఐచ్ఛికం)</div><div class="wd-chips wd-scroll">' +
          allKeys.map((k) => '<button class="wd-chip' + ((row.stotras || []).includes(k) ? ' on' : '') +
            '" data-day="' + i + '" data-key="' + k + '">' +
            escapeHtml(stotramConfig[k].title || k) + '</button>').join('') +
          '</div></details>';
      }).join('') +
      '<div class="ad-err" id="wdErr"></div>' +
      '<div class="ad-actions"><button class="track-btn" onclick="closeWeekdayEditor()">రద్దు</button>' +
      '<button class="track-btn primary" onclick="saveWeekdayMap()">సేవ్ చేయండి</button></div>' +
      '</div>';

    // toggling never removes an item from other days — each day is independent
    ov.querySelectorAll('.wd-chip').forEach((b) => {
      b.onclick = () => {
        const day = +b.getAttribute('data-day');
        const deity = b.getAttribute('data-deity');
        const key = b.getAttribute('data-key');
        const list = deity ? (MAP[day].deities ||= []) : (MAP[day].stotras ||= []);
        const val = deity || key;
        const at = list.indexOf(val);
        if (at >= 0) list.splice(at, 1); else list.push(val);
        b.classList.toggle('on', at < 0);
        const cnt = b.closest('details').querySelector('.wd-count');
        if (cnt) cnt.textContent = ((MAP[day].deities || []).length + (MAP[day].stotras || []).length) + ' ఎంపిక';
      };
    });

    ov.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeWeekdayEditor() {
    const ov = document.getElementById('wdOverlay');
    if (ov) ov.classList.remove('active');
    document.body.style.overflow = '';
  }

  async function saveWeekdayMap() {
    const err = document.getElementById('wdErr');
    if (err) err.textContent = '⏳ సేవ్ అవుతోంది…';
    const out = {};
    for (let i = 0; i < 7; i++) {
      out[String(i)] = {
        deities: (MAP[i] && MAP[i].deities) || [],
        stotras: (MAP[i] && MAP[i].stotras) || [],
      };
    }
    try {
      await fs().collection('config').doc('weekday').set(out);
      closeWeekdayEditor();
      renderToday();
      siteAlert('✅ వార పూజ క్రమం సేవ్ అయ్యింది');
    } catch (e) {
      if (err) err.textContent = '❌ సేవ్ కాలేదు: ' + (e && e.message ? e.message : e);
    }
  }

  // admin.js calls this after cloud stotras load, so newly added ones can
  // appear in today's list too.
  window.__renderToday = renderToday;
  window.openWeekdayEditor = openWeekdayEditor;
  window.closeWeekdayEditor = closeWeekdayEditor;
  window.saveWeekdayMap = saveWeekdayMap;

  // first paint from defaults, then refine once Firestore answers
  renderToday();
  setTimeout(loadWeekdayMap, 400);
})();
