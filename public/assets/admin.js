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
  const ADMIN_UID = "0d3PPSYaFncy1tY2oUGtBMGMFwu2";

  // 🌐 Image→text OCR endpoint. This is a Cloudflare **Pages Function** that
  //    ships with the site (see functions/api/ocr.js), so it's same-origin —
  //    no separate Worker, no CORS. Just set the GEMINI_API_KEY secret on the
  //    Pages project. (Locally via python http.server there is no function, so
  //    OCR only works on the deployed site.)
  const OCR_ENDPOINT = "/api/ocr";

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
  const isBuiltin = (k) => Object.prototype.hasOwnProperty.call(BUILTIN, k);

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
    // newly added stotras may belong to today's worship day
    if (window.__renderToday) { try { window.__renderToday(); } catch (e) {} }
  }

  /* ---------- built-in overrides (edit the original 20 from the UI) ---------- */
  // Apply an admin's edits on top of a built-in: update the config the reader
  // uses, and the text on its existing card. Theme/category stay as the file
  // defined them, so the card keeps its place and artwork.
  function applyOverride(key, s) {
    const cfg = stotramConfig[key];
    if (!cfg) return;
    if (s.title) cfg.title = s.title;
    if (s.subtitle !== undefined) cfg.subtitle = s.subtitle;
    if (Array.isArray(s.data) && s.data.length) cfg.data = s.data;
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
    const card = document.querySelector('.card[onclick*="openReader(\'' + key + '\')"]');
    if (!card) return;
    const h3 = card.querySelector('h3');
    const sub = card.querySelector('.card-sub');
    const ds = card.querySelector('.card-desc');
    if (h3 && title) h3.textContent = title;
    if (sub && subtitle !== undefined && subtitle !== null) sub.textContent = subtitle;
    if (ds && desc) ds.textContent = desc;
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
      // existing stotras first, so edit/delete is visible without scrolling
      '<div class="ad-existing" id="adExisting"></div>' +
      '<div class="ad-builtin-note" id="adBuiltinNote" style="display:none"></div>' +
      '<label class="ad-label">శీర్షిక / Title *</label><input class="ad-in" id="adTitle" placeholder="ఉదా: శ్రీ సుబ్రహ్మణ్య అష్టోత్తరం">' +
      '<label class="ad-label">Subtitle (English)</label><input class="ad-in" id="adSubtitle" placeholder="Sri Subrahmanya Ashtottaram">' +
      '<div class="ad-row"><div><label class="ad-label">థీమ్ / Theme</label><select class="ad-in" id="adTheme">' + opts + '</select></div>' +
      '<div><label class="ad-label">విభాగం / Category</label><select class="ad-in" id="adCat" onchange="adminCatChange()">' + cats + '</select></div></div>' +
      '<input class="ad-in" id="adCatNew" placeholder="కొత్త విభాగం పేరు" style="display:none">' +
      '<label class="ad-label">సంక్షిప్త వివరణ / Short description</label><input class="ad-in" id="adDesc" placeholder="కార్డుపై కనిపించే చిన్న వాక్యం">' +
      '<label class="ad-label">ఉద్భవం / Origin (ఐచ్ఛికం)</label><textarea class="ad-in ad-area" id="adOrigin" rows="2"></textarea>' +
      '<label class="ad-label">శ్లోకాలు / Slokams * <span class="ad-hint">— ఒక్కో శ్లోకం మధ్య ఖాళీ లైన్ వదలండి (blank line between verses)</span></label>' +
      '<div class="ad-ocr"><input type="file" id="adImages" accept="image/*" multiple>' +
      '<button type="button" class="track-btn ad-ocr-btn" onclick="ocrExtract()">🖼️ చిత్రం నుండి తీసుకోండి</button>' +
      '<span class="ad-ocr-status" id="adOcrStatus"></span></div>' +
      '<div class="ad-ocr-review" id="adOcrReview" style="display:none"></div>' +
      '<textarea class="ad-in ad-area" id="adSlokams" rows="8" placeholder="మొదటి శ్లోకం…\n\nరెండవ శ్లోకం…"></textarea>' +
      '<label class="ad-check"><input type="checkbox" id="adPub" checked> ప్రచురించు (Publish — అందరికీ కనిపిస్తుంది)</label>' +
      '<div class="ad-err" id="adErr"></div>' +
      '<div class="ad-actions"><button class="track-btn" onclick="closeAdmin()">రద్దు</button><button class="track-btn primary" onclick="saveStotram()">సేవ్ చేయండి</button></div>' +
      '<div class="ad-tools">' +
      '<button class="track-btn" onclick="showFeedback()">💬 అభిప్రాయాలు</button>' +
      '<button class="track-btn" onclick="closeAdmin(); openWeekdayEditor()">🗓️ వార పూజ</button>' +
      '<button class="track-btn" onclick="exportStotras()">⬇️ ఎగుమతి (Backup)</button>' +
      '</div>' +
      '<div class="ad-fb" id="adFeedback" style="display:none"></div>' +
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
    // editing a built-in: theme/category come from the file and are ignored, so
    // hide them and say what will change
    const bi = !!(editKey && isBuiltin(editKey));
    const themeRow = document.querySelector('#adminOverlay .ad-row');
    if (themeRow) themeRow.style.display = bi ? 'none' : '';
    const catNew = document.getElementById('adCatNew');
    if (bi && catNew) catNew.style.display = 'none';
    const note = document.getElementById('adBuiltinNote');
    if (note) {
      note.style.display = bi ? '' : 'none';
      note.textContent = bi
        ? 'ℹ️ ఇది అంతర్నిర్మిత స్తోత్రం. శీర్షిక, ఉపశీర్షిక, ఉద్భవం, శ్లోకాలు మాత్రమే మారుతాయి — కార్డు స్థానం/థీమ్ అలాగే ఉంటాయి. ఎప్పుడైనా ↩︎ తో అసలు రూపానికి తిరిగి మార్చవచ్చు.'
        : '';
    }
    const head = document.querySelector('#adminOverlay .admin-head h2');
    if (head) head.textContent = editKey ? '✏️ స్తోత్రం సవరించండి' : '➕ కొత్త స్తోత్రం';
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
    if (!box) return;

    const row = (k, buttons) =>
      '<div class="ad-ex-item"><span class="ad-ex-name">' + escapeHtml(stotramConfig[k].title || k) +
      (overrideKeys.has(k) ? ' <em class="ad-ex-tag">సవరించబడింది</em>' : '') +
      '</span><span class="ad-ex-btns">' + buttons + '</span></div>';

    const mine = [...cloudKeys];
    const builtin = Object.keys(BUILTIN).filter((k) => !stotramConfig[k] || !stotramConfig[k].hidden);

    let html = '';
    if (mine.length) {
      html += '<div class="ad-existing-title">మీరు చేర్చినవి (' + mine.length + ')</div>' +
        mine.map((k) => row(k,
          '<button class="ad-mini" data-edit="' + k + '" title="సవరించు">✏️</button>' +
          '<button class="ad-mini" data-del="' + k + '" title="తొలగించు">🗑️</button>')).join('');
    }
    // every built-in is editable too — fixes typos without touching any file
    html += '<div class="ad-existing-title">అంతర్నిర్మిత స్తోత్రాలు (' + builtin.length + ')' +
      '<span class="ad-hint"> — ఇవి కూడా సవరించవచ్చు</span></div>' +
      '<div class="ad-ex-scroll">' +
      builtin.map((k) => row(k,
        '<button class="ad-mini" data-edit="' + k + '" title="సవరించు">✏️</button>' +
        (overrideKeys.has(k)
          ? '<button class="ad-mini" data-revert="' + k + '" title="అసలు రూపానికి తిరిగి">↩︎</button>'
          : ''))).join('') +
      '</div>';

    box.innerHTML = html;
    box.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => openAdmin(b.getAttribute('data-edit')));
    box.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => deleteStotram(b.getAttribute('data-del')));
    box.querySelectorAll('[data-revert]').forEach((b) => b.onclick = () => revertStotram(b.getAttribute('data-revert')));
  }

  // Undo an edit to a built-in: delete the override doc and the original file
  // text comes back.
  async function revertStotram(key) {
    const ok = await siteConfirm(
      'ఈ స్తోత్రాన్ని అసలు రూపానికి తిరిగి మార్చాలా?\n\n' + (stotramConfig[key] ? stotramConfig[key].title : key) +
      '\n\nRevert to the original built-in text? Your edits will be removed.',
      { okLabel: 'తిరిగి మార్చు / Revert', danger: true }
    );
    if (!ok) return;
    try {
      await fs().collection('stotras').doc(key).delete();
      await loadCloudStotras();
      renderExistingList();
    } catch (e) {
      siteAlert('❌ మార్చలేకపోయాం: ' + (e && e.message ? e.message : e));
    }
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
    const title = (stotramConfig[key] && stotramConfig[key].title) || '';
    const ok = await siteConfirm(
      'ఈ స్తోత్రం తొలగించాలా?' + (title ? '\n\n' + title : '') + '\n\nDelete this stotram?',
      { okLabel: 'తొలగించు / Delete', danger: true }
    );
    if (!ok) return;
    try { await fs().collection('stotras').doc(key).delete(); await loadCloudStotras(); renderExistingList(); }
    catch (e) { siteAlert('❌ తొలగించలేకపోయాం: ' + (e && e.message ? e.message : e)); }
  }

  function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return h; }

  /* ---------- image → text OCR (via Cloudflare Worker) ---------- */
  function fileToB64(f) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1]);   // strip the data: prefix
      r.onerror = rej;
      r.readAsDataURL(f);
    });
  }
  async function ocrExtract() {
    const status = document.getElementById('adOcrStatus');
    const files = document.getElementById('adImages').files;
    if (!OCR_ENDPOINT || OCR_ENDPOINT.indexOf('REPLACE') >= 0) { status.textContent = '⚙️ OCR ఇంకా సెటప్ కాలేదు'; return; }
    if (!files || !files.length) { status.textContent = '⚠️ ముందు చిత్రం ఎంచుకోండి'; return; }
    const user = window.firebase && firebase.auth().currentUser;
    if (!user) { status.textContent = '⚠️ సైన్ ఇన్ అవ్వండి'; return; }
    status.textContent = '⏳ చిత్రం చదువుతోంది…';
    try {
      const token = await user.getIdToken();
      const images = [];
      for (const f of files) images.push({ mime: f.type || 'image/jpeg', data: await fileToB64(f) });
      const res = await fetch(OCR_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ images, doubleCheck: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || ('HTTP ' + res.status));
      const text = (body.text || '').trim();
      if (!text) throw new Error('ఖాళీ ఫలితం — స్పష్టమైన చిత్రం ప్రయత్నించండి');
      const box = document.getElementById('adSlokams');
      box.value = box.value.trim() ? (box.value.trim() + '\n\n' + text) : text;
      showOcrReview(text, body);
    } catch (e) {
      console.warn('[ocr] failed', e);
      status.textContent = '❌ ' + (e && e.message ? e.message : e);
      const rev = document.getElementById('adOcrReview');
      if (rev) rev.style.display = 'none';
    }
  }

  // Tell the admin exactly what to verify: any line where the two readings of
  // the image disagreed, plus any ⟨?⟩ the model marked as illegible.
  function showOcrReview(text, body) {
    const status = document.getElementById('adOcrStatus');
    const rev = document.getElementById('adOcrReview');
    const unsure = Array.isArray(body.uncertain) ? body.uncertain : [];
    const illegible = (text.match(/⟨\?⟩/g) || []).length;

    if (!body.checked) status.textContent = '✅ వచ్చింది — చిత్రంతో సరిచూసుకోండి';
    else if (!unsure.length && !illegible) status.textContent = '✅ రెండు రీడింగ్‌లు ఒకేలా ఉన్నాయి — ఒకసారి చూసుకోండి';
    else status.textContent = '⚠️ ' + (unsure.length + illegible) + ' చోట్ల అనుమానం — క్రింద చూడండి';

    if (!rev) return;
    if (!unsure.length && !illegible) { rev.style.display = 'none'; rev.innerHTML = ''; return; }

    let html = '<div class="ad-rev-head">🔎 ఇవి తప్పకుండా సరిచూసుకోండి</div>';
    if (illegible) {
      html += '<div class="ad-rev-item"><b>⟨?⟩</b> గుర్తులు ' + illegible +
        ' ఉన్నాయి — అక్కడ అక్షరం స్పష్టంగా కనిపించలేదు. చిత్రం చూసి సరిచేయండి.</div>';
    }
    unsure.forEach((u) => {
      html += '<div class="ad-rev-item"><span class="ad-rev-line">లైన్ ' + u.line + '</span>' +
        '<div class="ad-rev-a">1: ' + escapeHtml(u.a || '(ఖాళీ)') + '</div>' +
        '<div class="ad-rev-b">2: ' + escapeHtml(u.b || '(ఖాళీ)') + '</div></div>';
    });
    html += '<div class="ad-rev-foot">పెట్టిన వచనం మొదటి రీడింగ్. తేడా ఉన్న చోట చిత్రం చూసి సరైనది ఉంచండి.</div>';
    rev.innerHTML = html;
    rev.style.display = '';
  }

  // expose for inline handlers
  window.openAdmin = openAdmin;
  window.closeAdmin = closeAdmin;
  window.adminCatChange = adminCatChange;
  window.saveStotram = saveStotram;
  window.ocrExtract = ocrExtract;

  /* ---------- admin-only: export everything you have added ---------- */
  // Your added stotras and your edits to the built-ins live only in Firestore.
  // This writes them to a file you can keep in the repo or Drive as a backup.
  async function exportStotras() {
    if (!isAdmin(firebase.auth().currentUser)) return;    // admin only
    try {
      const snap = await fs().collection('stotras').get();
      const docs = [];
      snap.forEach((d) => docs.push({ id: d.id, isOverrideOfBuiltin: isBuiltin(d.id), ...d.data() }));
      const out = {
        exportedAt: new Date().toISOString(),
        project: 'stotramulu',
        count: docs.length,
        stotras: docs,
      };
      downloadFile('stotramulu-stotras-' + new Date().toISOString().slice(0, 10) + '.json',
        JSON.stringify(out, null, 2));
      siteAlert('✅ ' + docs.length + ' స్తోత్రాలు ఎగుమతి అయ్యాయి (Downloads లో చూడండి)');
    } catch (e) {
      siteAlert('❌ ఎగుమతి కాలేదు: ' + (e && e.message ? e.message : e));
    }
  }

  function downloadFile(filename, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  /* ---------- admin-only: read the feedback people sent ---------- */
  async function showFeedback() {
    if (!isAdmin(firebase.auth().currentUser)) return;    // admin only
    const box = document.getElementById('adFeedback');
    if (!box) return;
    box.style.display = '';
    box.innerHTML = '<div class="ad-fb-head">⏳ తెస్తోంది…</div>';
    try {
      const snap = await fs().collection('feedback').orderBy('createdAt', 'desc').limit(50).get();
      const rows = [];
      snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
      if (!rows.length) { box.innerHTML = '<div class="ad-fb-head">💬 ఇంకా అభిప్రాయాలు లేవు</div>'; return; }

      const TYPE = {
        correction: '📖 దిద్దుబాటు', problem: '⚠️ సమస్య',
        suggestion: '💡 సూచన', other: '🙏 ఇతరం',
      };
      box.innerHTML = '<div class="ad-fb-head">💬 అభిప్రాయాలు (' + rows.length + ')</div>' +
        rows.map((r) => {
          const when = r.createdAt && r.createdAt.toDate ? r.createdAt.toDate().toLocaleString() : '';
          const where = r.stotramTitle ? r.stotramTitle : (r.screen || '');
          return '<div class="ad-fb-item' + (r.handled ? ' done' : '') + '">' +
            '<div class="ad-fb-top"><span class="ad-fb-type">' + (TYPE[r.type] || TYPE.other) + '</span>' +
            '<span class="ad-fb-when">' + escapeHtml(when) + '</span></div>' +
            '<div class="ad-fb-msg">' + escapeHtml(r.message || '') + '</div>' +
            '<div class="ad-fb-meta">' + escapeHtml(r.name || 'పేరు లేదు') +
            (r.contact ? ' · ' + escapeHtml(r.contact) : '') +
            (where ? ' · ' + escapeHtml(where) : '') + '</div>' +
            '<div class="ad-fb-btns">' +
            '<button class="ad-mini" data-fbdone="' + r.id + '" title="పూర్తయింది">' + (r.handled ? '↩︎' : '✓') + '</button>' +
            '<button class="ad-mini" data-fbdel="' + r.id + '" title="తొలగించు">🗑️</button>' +
            '</div></div>';
        }).join('');

      box.querySelectorAll('[data-fbdone]').forEach((b) => b.onclick = async () => {
        const id = b.getAttribute('data-fbdone');
        const row = rows.find((x) => x.id === id);
        try { await fs().collection('feedback').doc(id).update({ handled: !(row && row.handled) }); showFeedback(); }
        catch (e) { siteAlert('❌ ' + e.message); }
      });
      box.querySelectorAll('[data-fbdel]').forEach((b) => b.onclick = async () => {
        if (!await siteConfirm('ఈ అభిప్రాయం తొలగించాలా?\n\nDelete this feedback?',
          { okLabel: 'తొలగించు / Delete', danger: true })) return;
        try { await fs().collection('feedback').doc(b.getAttribute('data-fbdel')).delete(); showFeedback(); }
        catch (e) { siteAlert('❌ ' + e.message); }
      });
    } catch (e) {
      box.innerHTML = '<div class="ad-fb-head">❌ తేలేకపోయాం: ' + escapeHtml(e.message || String(e)) + '</div>';
    }
  }

  window.exportStotras = exportStotras;
  window.showFeedback = showFeedback;

  // kick off Phase 2 load
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', loadCloudStotras);
  else loadCloudStotras();
})();
