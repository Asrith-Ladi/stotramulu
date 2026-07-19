/* ============================================================
   ADMIN + CLOUD STOTRAS
   Phase 2 (everyone): load published stotras from Firestore and render
   them as cards + make them readable/searchable — by merging into the
   same window.STOTRAS_DATA the site already uses. No file/script/card edits.
   Phase 3 (admin only): a hidden panel to add / edit / delete a stotram,
   saved to Firestore. Gated to ADMIN_UID.

   Classic script → shares app.js globals (stotramConfig, origins, meanings,
   buildSearchIndex, openReader, searchIndex, escapeHtml). Loads after cloud.js.
============================================================ */
(function () {
  // 🔑 PASTE YOUR FIREBASE UID HERE (Firebase console → Authentication → Users → your row → copy "User UID")
  const ADMIN_UID = "REPLACE_WITH_YOUR_UID";

  // theme → deity svg + accent + icon (mirrors the built-in cards)
  const THEMES = {
    vishnu:  { svg: '#svg-vishnu',  color: '#3070c0', icon: '🔱', label: 'విష్ణు' },
    lalitha: { svg: '#svg-lalitha', color: '#c04070', icon: '🪷', label: 'లలిత/దేవి' },
    shiva:   { svg: '#svg-shiva',   color: '#5088b0', icon: '🙏', label: 'శివ' },
    venkat:  { svg: '#svg-venkat',  color: '#c89838', icon: '⛰️', label: 'వేంకటేశ్వర' },
    ganesha: { svg: '#svg-ganesha', color: '#e08040', icon: '🐘', label: 'గణేశ' },
    hanuman: { svg: '#svg-hanuman', color: '#d06030', icon: '🦍', label: 'హనుమాన్' },
    lakshmi: { svg: '#svg-lakshmi', color: '#e0b840', icon: '💎', label: 'లక్ష్మి' },
    saibaba: { svg: '#svg-saibaba', color: '#d08040', icon: '🌟', label: 'సాయి' },
    ayyappa: { svg: '#svg-ayyappa', color: '#4080c8', icon: '🏔️', label: 'అయ్యప్ప' },
    durga:   { svg: '#svg-durga',   color: '#d04050', icon: '🔥', label: 'దుర్గా' },
    govinda: { svg: '#svg-krishna', color: '#4090d0', icon: '🦚', label: 'కృష్ణ/గోవింద' },
    bilva:   { svg: '#svg-bilva',   color: '#409848', icon: '🍃', label: 'బిల్వ' },
    harati:  { svg: '#svg-diya',    color: '#ffaa3c', icon: '🪔', label: 'హారతి' },
  };
  const CATEGORIES = [
    { slug: 'sahasranama', label: 'సహస్రనామావళి' },
    { slug: 'ashtottara',  label: 'అష్టోత్తర శతనామావళి' },
    { slug: 'stotras',     label: 'స్తోత్రములు' },
    { slug: 'aratis',      label: 'హారతులు' },
  ];

  let db = null;
  function fs() { if (!db && window.firebase) db = firebase.firestore(); return db; }
  const cloudKeys = new Set();

  /* ---------- Phase 2: load + render published cloud stotras ---------- */
  async function loadCloudStotras() {
    const d = fs(); if (!d) return;
    let snap;
    try { snap = await d.collection('stotras').get(); }
    catch (e) { console.warn('[stotras] load failed', e); return; }

    // clear previously rendered cloud cards + their config (handles deletes/edits)
    document.querySelectorAll('.card.cloud-card').forEach((el) => el.remove());
    cloudKeys.forEach((k) => { delete stotramConfig[k]; delete origins[k]; delete meanings[k]; });
    cloudKeys.clear();

    const list = [];
    snap.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
    list.sort((a, b) => (a.position || 0) - (b.position || 0));

    list.forEach((s) => {
      if (s.published === false) return;
      const key = s.id;
      const th = THEMES[s.theme] || THEMES.vishnu;
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
      renderCard(key);
    });

    try { searchIndex = buildSearchIndex(); } catch (e) {}
  }

  function gridForCategory(slug, label) {
    let sec = document.querySelector('.cards-section[data-cat="' + slug + '"]');
    if (!sec) {
      const home = document.getElementById('homePage');
      sec = document.createElement('div');
      sec.className = 'cards-section';
      sec.dataset.cat = slug;
      sec.innerHTML =
        '<div class="section-divider"><h2 class="section-title">' +
        escapeHtml(label || slug) + '</h2><div class="section-sub"></div></div>' +
        '<div class="cards-grid"></div>';
      home.appendChild(sec);
    }
    return sec.querySelector('.cards-grid');
  }

  function renderCard(key) {
    const cfg = stotramConfig[key];
    const themeKey = (cfg.theme || '').replace('-theme', '');
    const grid = gridForCategory(cfg.__cat, cfg.__catLabel);
    const desc = cfg.__desc || (cfg.origin ? (cfg.origin.slice(0, 90) + '…') : '');
    const div = document.createElement('div');
    div.className = 'card cloud-card ' + themeKey;
    div.setAttribute('onclick', "openReader('" + key + "')");
    div.innerHTML =
      '<div class="card-bg"></div>' +
      '<svg class="card-deity-svg" style="color:' + cfg.svgColor + '"><use href="' + cfg.svgId + '"/></svg>' +
      '<div class="card-content">' +
        '<div class="card-icon-wrap"><span class="deity-icon">' + (cfg.__icon || '🕉️') + '</span></div>' +
        '<h3>' + escapeHtml(cfg.title) + '</h3>' +
        '<div class="card-sub">' + escapeHtml(cfg.subtitle || '') + '</div>' +
        '<div class="card-desc">' + escapeHtml(desc) + '</div>' +
        '<button class="card-btn">చదవండి →</button>' +
      '</div>';
    grid.appendChild(div);
  }

  /* ---------- Phase 3: admin gate + panel ---------- */
  function isAdmin(u) { return u && ADMIN_UID && u.uid === ADMIN_UID; }

  if (window.firebase) {
    firebase.auth().onAuthStateChanged((u) => {
      const fab = document.getElementById('adminFab');
      if (isAdmin(u)) { if (!fab) injectFab(); }
      else if (fab) fab.remove();
    });
  }

  function injectFab() {
    const b = document.createElement('button');
    b.id = 'adminFab'; b.className = 'admin-fab';
    b.title = 'కొత్త స్తోత్రం చేర్చండి'; b.textContent = '＋';
    b.onclick = function () { openAdmin(); };
    document.body.appendChild(b);
  }

  function ensureModal() {
    if (document.getElementById('adminOverlay')) return;
    const opts = Object.keys(THEMES).map((k) => '<option value="' + k + '">' + THEMES[k].label + '</option>').join('');
    const cats = CATEGORIES.map((c) => '<option value="' + c.slug + '">' + c.label + '</option>').join('')
      + '<option value="__new">＋ కొత్త విభాగం…</option>';
    const ov = document.createElement('div');
    ov.id = 'adminOverlay'; ov.className = 'admin-overlay';
    ov.innerHTML =
      '<div class="admin-box">' +
      '<div class="admin-head"><h2>➕ స్తోత్రం</h2><button class="search-close-btn" onclick="closeAdmin()">✕</button></div>' +
      '<input type="hidden" id="adEditKey">' +
      '<label class="ad-label">శీర్షిక / Title *</label><input class="ad-in" id="adTitle" placeholder="ఉదా: శ్రీ సుబ్రహ్మణ్య అష్టోత్తరం">' +
      '<label class="ad-label">Subtitle (English)</label><input class="ad-in" id="adSubtitle" placeholder="Sri Subrahmanya Ashtottaram">' +
      '<div class="ad-row"><div><label class="ad-label">థీమ్ / Theme</label><select class="ad-in" id="adTheme">' + opts + '</select></div>' +
      '<div><label class="ad-label">విభాగం / Category</label><select class="ad-in" id="adCat" onchange="adminCatChange()">' + cats + '</select></div></div>' +
      '<input class="ad-in" id="adCatNew" placeholder="కొత్త విభాగం పేరు" style="display:none">' +
      '<label class="ad-label">సంక్షిప్త వివరణ / Short description</label><input class="ad-in" id="adDesc" placeholder="కార్డుపై కనిపించే చిన్న వాక్యం">' +
      '<label class="ad-label">ఉద్భవం / Origin (ఐచ్ఛికం)</label><textarea class="ad-in ad-area" id="adOrigin" rows="2"></textarea>' +
      '<label class="ad-label">శ్లోకాలు / Slokams * <span class="ad-hint">— ఒక్కో శ్లోకం మధ్య ఖాళీ లైన్ వదలండి (blank line between verses)</span></label>' +
      '<textarea class="ad-in ad-area" id="adSlokams" rows="8" placeholder="మొదటి శ్లోకం…\n\nరెండవ శ్లోకం…"></textarea>' +
      '<label class="ad-check"><input type="checkbox" id="adPub" checked> ప్రచురించు (Publish — అందరికీ కనిపిస్తుంది)</label>' +
      '<div class="ad-err" id="adErr"></div>' +
      '<div class="ad-actions"><button class="track-btn" onclick="closeAdmin()">రద్దు</button><button class="track-btn primary" onclick="saveStotram()">సేవ్ చేయండి</button></div>' +
      '<div class="ad-existing" id="adExisting"></div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', (e) => { if (e.target === ov) closeAdmin(); });
  }

  function openAdmin(editKey) {
    ensureModal();
    document.getElementById('adEditKey').value = editKey || '';
    // fill or clear the form
    if (editKey && stotramConfig[editKey]) {
      const c = stotramConfig[editKey];
      set('adTitle', c.title); set('adSubtitle', c.subtitle || '');
      set('adTheme', (c.theme || '').replace('-theme', ''));
      set('adCat', c.__cat || 'stotras'); adminCatChange();
      set('adDesc', c.__desc || ''); set('adOrigin', c.origin || '');
      set('adSlokams', textFromSlokams(c.data));
      document.getElementById('adPub').checked = true;
    } else {
      ['adTitle', 'adSubtitle', 'adDesc', 'adOrigin', 'adSlokams', 'adCatNew'].forEach((id) => set(id, ''));
      document.getElementById('adPub').checked = true;
      set('adCat', 'stotras'); adminCatChange();
    }
    document.getElementById('adErr').textContent = '';
    renderExistingList();
    document.getElementById('adminOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  function closeAdmin() {
    const ov = document.getElementById('adminOverlay');
    if (ov) ov.classList.remove('active');
    document.body.style.overflow = '';
  }
  function adminCatChange() {
    const sel = document.getElementById('adCat');
    document.getElementById('adCatNew').style.display = (sel.value === '__new') ? '' : 'none';
  }

  function renderExistingList() {
    const box = document.getElementById('adExisting');
    const keys = [...cloudKeys];
    if (!keys.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="ad-existing-title">మీరు చేర్చిన స్తోత్రాలు</div>' +
      keys.map((k) => '<div class="ad-ex-item"><span>' + escapeHtml(stotramConfig[k].title) + '</span>' +
        '<span><button class="ad-mini" data-edit="' + k + '">✏️</button>' +
        '<button class="ad-mini" data-del="' + k + '">🗑️</button></span></div>').join('');
    box.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => openAdmin(b.getAttribute('data-edit')));
    box.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => deleteStotram(b.getAttribute('data-del')));
  }

  function slokamsFromText(t) {
    return (t || '').split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)
      .map((text, i) => ({ number: String(i + 1), text }));
  }
  function textFromSlokams(arr) { return (arr || []).map((s) => s.text).join('\n\n'); }
  function set(id, v) { const el = document.getElementById(id); if (el) el.value = v; }
  function val(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }

  async function saveStotram() {
    const err = document.getElementById('adErr');
    const title = val('adTitle');
    const data = slokamsFromText(val('adSlokams'));
    if (!title) { err.textContent = '⚠️ శీర్షిక అవసరం'; return; }
    if (!data.length) { err.textContent = '⚠️ కనీసం ఒక శ్లోకం అవసరం'; return; }

    const catSel = document.getElementById('adCat').value;
    let category, categoryLabel;
    if (catSel === '__new') {
      categoryLabel = val('adCatNew');
      if (!categoryLabel) { err.textContent = '⚠️ కొత్త విభాగం పేరు రాయండి'; return; }
      category = 'cat-' + Math.abs(hashStr(categoryLabel)).toString(36);
    } else {
      category = catSel;
      categoryLabel = (CATEGORIES.find((c) => c.slug === catSel) || {}).label || catSel;
    }
    const theme = document.getElementById('adTheme').value;
    const doc = {
      title, subtitle: val('adSubtitle'), theme,
      category, categoryLabel,
      desc: val('adDesc'), origin: val('adOrigin'),
      icon: (THEMES[theme] || {}).icon || '🕉️',
      data,
      published: document.getElementById('adPub').checked,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    const d = fs();
    const editKey = val('adEditKey');
    err.textContent = '⏳ సేవ్ అవుతోంది…';
    try {
      if (editKey) await d.collection('stotras').doc(editKey).set(doc, { merge: true });
      else await d.collection('stotras').add(doc);
      await loadCloudStotras();
      closeAdmin();
    } catch (e) {
      console.warn('[stotras] save failed', e);
      err.textContent = '❌ సేవ్ కాలేదు: ' + (e && e.message ? e.message : e);
    }
  }

  async function deleteStotram(key) {
    if (!confirm('ఈ స్తోత్రం తొలగించాలా? / Delete this stotram?')) return;
    try { await fs().collection('stotras').doc(key).delete(); await loadCloudStotras(); renderExistingList(); }
    catch (e) { alert('❌ తొలగించలేకపోయాం: ' + (e && e.message ? e.message : e)); }
  }

  function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return h; }

  // expose for inline handlers
  window.openAdmin = openAdmin;
  window.closeAdmin = closeAdmin;
  window.adminCatChange = adminCatChange;
  window.saveStotram = saveStotram;

  // kick off Phase 2 load
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', loadCloudStotras);
  else loadCloudStotras();
})();
