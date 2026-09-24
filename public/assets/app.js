// ============ STOTRAM DATA ============
// Per-stotram data lives in data/stotras/<key>.js — each file registers
// itself onto window.STOTRAS_DATA. Add a new stotram by creating a file
// there and adding its <script> tag in index.html.
const stotramConfig = window.STOTRAS_DATA || {};
const origins = Object.fromEntries(
    Object.entries(stotramConfig).map(([k, v]) => [k, v.origin || ''])
);
const meanings = Object.fromEntries(
    Object.entries(stotramConfig).map(([k, v]) => [k, v.meanings || {}])
);


// ============ APP ============
let currentFontSize = 24;
try {
    const saved = Number(localStorage.getItem('readerFontSize'));
    if (Number.isFinite(saved) && saved >= 18 && saved <= 48) currentFontSize = saved;
} catch (e) { /* Reading works when storage is unavailable. */ }
let currentType = null;



function createParticles() {
    const c = document.getElementById('particles');
    for (let i = 0; i < 35; i++) {
        const p = document.createElement('div');
        p.className = 'particle ' + (Math.random() > 0.7 ? 'big' : 'gold');
        p.style.left = Math.random() * 100 + '%';
        p.style.animationDelay = Math.random() * 10 + 's';
        p.style.animationDuration = (7 + Math.random() * 8) + 's';
        c.appendChild(p);
    }
}


function openReader(type) {
    const cfg = stotramConfig[type];
    if (!cfg) return;
    currentType = type;
    syncReaderRoute(type);
    document.getElementById('readerLinkStatus').textContent = '';
    document.getElementById('readerLinkFallback').hidden = true;


    document.getElementById('homePage').style.display = 'none';
    document.getElementById('readerPage').classList.add('active');
    document.getElementById('backBtn').style.display = 'block';
    gaEvent('screen_view', { screen_name: 'Reader: ' + type });
    gaEvent('open_stotram', { stotram: type });


    const ts = document.getElementById('readerTitleSection');
    ts.className = 'reader-title-section ' + cfg.theme;
    document.getElementById('readerTitle').textContent = cfg.title;
    document.getElementById('readerSubtitle').textContent = cfg.subtitle;


    const bg = document.getElementById('readerDeityBg');
    bg.innerHTML = `<svg style="width:100%;height:100%;color:${cfg.svgColor}"><use href="${cfg.svgId}"/></svg>`;


    const originEl = document.getElementById('originBlock');
    const originText = origins[type];
    if (originText) {
        originEl.innerHTML = `<span class="origin-label">📜 ఉద్భవం &amp; ప్రాముఖ్యత</span><div class="origin-text">${originText}</div>`;
        originEl.classList.add('visible');
    } else {
        originEl.classList.remove('visible');
        originEl.innerHTML = '';
    }


    renderSlokams(cfg.data, type);
    changeFontSize(0);
    setupReaderNavigation(type);
    initStotramCounter(type, cfg.title);
    clearReaderSearch();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}


function goHome() {
    stopReaderPositionTracking();
    // close any open overlays/sheets and release scroll lock
    document.getElementById('searchOverlay').classList.remove('active');
    document.getElementById('daySheetOverlay').classList.remove('active');
    document.body.style.overflow = '';
    activeDay = null;


    document.getElementById('homePage').style.display = 'flex';
    document.getElementById('readerPage').classList.remove('active');
    document.getElementById('trackPage').classList.remove('active');
    const jmPage = document.getElementById('japamalaPage');
    if (jmPage) jmPage.classList.remove('active');
    document.getElementById('backBtn').style.display = 'none';
    document.getElementById('readerDeityBg').innerHTML = '';
    currentType = null;
    syncReaderRoute(null);
    renderHomePradakshina();
    gaEvent('screen_view', { screen_name: 'Home' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
}


// Reader numbering follows verses and individual namavali names.
// Built-ins take their category from the home-page section their card sits
// in; stotras added through the admin panel carry their own.
window.addEventListener('scroll', () => {
    document.getElementById('scrollTopBtn').classList.toggle('visible', window.scrollY > 400);
});


/* ============================================================
   SEARCH + VOICE
   Index is built automatically from stotramConfig, so any new
   stotram added there becomes searchable with no extra work.
============================================================ */
function buildSearchIndex() {
    const icons = {
        vishnu:'🔱', lalitha:'🪷', shiva:'🙏', bilva:'🌿', venkat:'⛰️', ganesha:'🐘',
        hanuman:'🚩', lakshmi:'🪙', saibaba:'🕉️', ayyappa:'🛕', durga:'🗡️',
        govinda:'🪈', chalisa:'🚩', manidweepa:'🌺', harati:'🪔'
    };
    return Object.keys(stotramConfig).filter(type => !stotramConfig[type].hidden).map(type => {
        const cfg = stotramConfig[type];
        const themeKey = (cfg.theme || '').replace('-theme', '');
        return { type, title: cfg.title, subtitle: cfg.subtitle || '', icon: icons[themeKey] || '🕉️' };
    });
}
let searchIndex = [];


function openSearch() {
    if (!searchIndex.length) searchIndex = buildSearchIndex();
    document.getElementById('searchOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
    gaEvent('screen_view', { screen_name: 'Search' });
    runSearch('');
    setTimeout(() => document.getElementById('searchInput').focus(), 100);
}
function closeSearch() {
    document.getElementById('searchOverlay').classList.remove('active');
    document.body.style.overflow = '';
    document.getElementById('searchInput').value = '';
}
function runSearch(q) {
    const results = document.getElementById('searchResults');
    const query = (q || '').trim().toLowerCase();
    let list = searchIndex;
    if (query) {
        list = searchIndex.filter(s =>
            s.title.toLowerCase().includes(query) ||
            s.subtitle.toLowerCase().includes(query)
        );
    }
    if (!list.length) {
        results.innerHTML = '<div class="search-empty">😔 ఏమీ దొరకలేదు. వేరే పేరు ప్రయత్నించండి.</div>';
        return;
    }
    results.innerHTML = list.map(s =>
        `<div class="search-result" onclick="pickSearch('${s.type}')">
            <span class="sr-icon">${s.icon}</span>
            <div>
                <div class="sr-title">${s.title}</div>
                <div class="sr-sub">${s.subtitle}</div>
            </div>
        </div>`
    ).join('');
}
function pickSearch(type) {
    closeSearch();
    openReader(type);
}


let recognition = null;
function initVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const micBtn = document.getElementById('micBtn');
    if (!SR) { micBtn.style.display = 'none'; return; }
    recognition = new SR();
    recognition.lang = 'te-IN';            // Telugu; works alongside typed search
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;
    recognition.onresult = (e) => {
        const text = e.results[0][0].transcript;
        const input = document.getElementById('searchInput');
        input.value = text;
        runSearch(text);
        document.getElementById('searchHint').textContent = '🔎 "' + text + '" కోసం వెతుకుతోంది…';
    };
    recognition.onend = () => micBtn.classList.remove('listening');
    recognition.onerror = (e) => {
        micBtn.classList.remove('listening');
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed')
            document.getElementById('searchHint').textContent = '🎤 మైక్ అనుమతి ఇవ్వండి, లేదా టైప్ చేయండి.';
    };
}
function startVoice() {
    if (!recognition) return;
    const micBtn = document.getElementById('micBtn');
    try {
        recognition.start();
        micBtn.classList.add('listening');
        document.getElementById('searchHint').textContent = '🎙️ వింటున్నాను… ఇప్పుడు చెప్పండి';
    } catch (e) { /* already started */ }
}


/* ============================================================
   POOJA TRACK : calendar + pradakshina/japa counters + mokkulu
   All data stored locally on the device (localStorage).
============================================================ */
function siteConfirm(message, opts) {
    opts = opts || {};
    const okLabel = opts.okLabel || 'సరే / OK';
    const cancelLabel = opts.cancelLabel || 'రద్దు / Cancel';
    return new Promise((resolve) => {
        const ov = document.createElement('div');
        ov.className = 'sc-overlay';
        ov.innerHTML =
            '<div class="sc-box" role="dialog" aria-modal="true">' +
            '<div class="sc-msg">' + escapeHtml(String(message)) + '</div>' +
            '<div class="sc-actions">' +
            (opts.hideCancel ? '' : '<button class="sc-btn" data-no>' + escapeHtml(cancelLabel) + '</button>') +
            '<button class="sc-btn ' + (opts.danger ? 'danger' : 'primary') + '" data-yes>' + escapeHtml(okLabel) + '</button>' +
            '</div></div>';


        let done = false;
        function finish(val) {
            if (done) return;
            done = true;
            document.removeEventListener('keydown', onKey);
            ov.classList.remove('show');
            setTimeout(() => ov.remove(), 180);
            resolve(val);
        }
        function onKey(e) {
            if (e.key === 'Escape') { e.preventDefault(); finish(false); }
            else if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        }


        ov.querySelector('[data-no]') && (ov.querySelector('[data-no]').onclick = () => finish(false));
        ov.querySelector('[data-yes]').onclick = () => finish(true);
        ov.addEventListener('click', (e) => { if (e.target === ov) finish(false); });
        document.addEventListener('keydown', onKey);


        document.body.appendChild(ov);
        requestAnimationFrame(() => ov.classList.add('show'));
        ov.querySelector('[data-yes]').focus();
    });
}


// Single-button message box (replaces alert()). Returns a Promise so callers
// can await it, but ignoring the result is fine too.
function siteAlert(message, opts) {
    opts = opts || {};
    return siteConfirm(message, { okLabel: opts.okLabel || 'సరే / OK', hideCancel: true });
}
function requestNotifyPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}
function showDueReminders() {
    const today = todayStr();
    const due = track.mokkulu.filter(m => !m.done && m.reminderDate && m.reminderDate <= today);
    const banner = document.getElementById('reminderBanner');
    if (!due.length) { banner.classList.remove('show'); return; }
    banner.innerHTML = `<span>🔔</span><span>ఈరోజు జ్ఞాపిక: <b>${escapeHtml(due[0].text)}</b>${due.length > 1 ? ' (+' + (due.length-1) + ' మరిన్ని)' : ''}</span><span class="rb-close" onclick="this.parentElement.classList.remove('show')">✕</span>`;
    banner.classList.add('show');
    if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification('🙏 పూజా జ్ఞాపిక', { body: due[0].text }); } catch (e) {}
    }
}


// close search with Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeSearch(); closeDay(); closeFeedback(); }
});


/* ============================================================
   BACKUP / RESTORE  (Option A — a file on the user's own device)
   Export writes a .json the browser downloads; restore reads it
   back. Nothing is uploaded anywhere.
============================================================ */
function exportBackup() {
    try {
        const data = JSON.stringify(track, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'pooja-backup-' + todayStr() + '.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        gaEvent('backup_export');
    } catch (e) {
        siteAlert('❌ బ్యాకప్ తీసుకోవడంలో సమస్య వచ్చింది.');
    }
}
function triggerRestore() {
    document.getElementById('restoreFile').click();
}
function handleRestoreFile(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data || typeof data !== 'object' || (!('days' in data) && !('mokkulu' in data))) throw new Error('bad');
            if (!await siteConfirm('ప్రస్తుత సమాచారం స్థానంలో బ్యాకప్ సమాచారం పెట్టాలా?\n\nReplace current data with this backup?',
                { okLabel: 'పునరుద్ధరించు / Restore', danger: true })) { input.value = ''; return; }
            track = { days: data.days || {}, mokkulu: Array.isArray(data.mokkulu) ? data.mokkulu : [], reading: data.reading || {} };
            saveTrack();
            buildMonths(); renderMonths(); renderMokkulu(); showDueReminders();
            siteAlert('✅ బ్యాకప్ విజయవంతంగా పునరుద్ధరించబడింది.');
        } catch (err) {
            siteAlert('❌ ఇది సరైన బ్యాకప్ ఫైల్ కాదు.');
        }
        input.value = '';
    };
    reader.readAsText(file);
}


/* ============================================================
   FEEDBACK  (type + name + message; contact optional, voice-fill)
   Submissions go to Firestore, and the admin reads them inside the
   app (＋ → 💬 అభిప్రాయాలు). A hidden honeypot field keeps out bots.
   Entries are queued on the device first and retried if the phone is
   offline, so nothing is lost.


   The old Google Apps Script / Sheet route has been removed — Firestore
   replaces it. It also exposed a public script URL anyone could POST to.
============================================================ */


function openFeedback() {
    resetFeedbackBox();
    document.getElementById('feedbackOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}
function closeFeedback() {
    document.getElementById('feedbackOverlay').classList.remove('active');
    document.body.style.overflow = '';
}
function resetFeedbackBox() {
    document.getElementById('fbForm').style.display = 'block';
    document.getElementById('fbThanks').style.display = 'none';
    document.getElementById('fbError').textContent = '';
    ['fbName', 'fbNumber', 'fbMessage'].forEach(id => {
        const el = document.getElementById(id);
        el.value = ''; el.classList.remove('invalid');
    });
}


// Generic voice-to-field helper (used by each 🎤 button)
function listenInto(inputId, btn, append) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { siteAlert('ఈ బ్రౌజర్‌లో వాయిస్ సదుపాయం లేదు. దయచేసి టైప్ చేయండి.'); return; }
    const rec = new SR();
    rec.lang = 'te-IN';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
        let t = e.results[0][0].transcript;
        const el = document.getElementById(inputId);
        if (inputId === 'fbNumber') t = t.replace(/[^\d+]/g, '');   // keep digits for phone
        el.value = (append && el.value) ? (el.value + ' ' + t) : t;
        el.classList.remove('invalid');
    };
    rec.onend = () => btn && btn.classList.remove('listening');
    rec.onerror = () => btn && btn.classList.remove('listening');
    try { rec.start(); btn && btn.classList.add('listening'); } catch (e) {}
}


function submitFeedback() {
    const nameEl = document.getElementById('fbName');
    const numEl = document.getElementById('fbNumber');
    const msgEl = document.getElementById('fbMessage');
    const errEl = document.getElementById('fbError');
    [nameEl, numEl, msgEl].forEach(el => el.classList.remove('invalid'));


    const name = nameEl.value.trim();
    const contact = numEl.value.trim();          // phone OR email, now optional
    const message = msgEl.value.trim();
    const typeEl = document.getElementById('fbType');
    const type = typeEl ? typeEl.value : 'other';
    const missing = [];


    if (!name) { nameEl.classList.add('invalid'); missing.push('పేరు'); }
    if (!message) { msgEl.classList.add('invalid'); missing.push('అభిప్రాయం'); }


    if (missing.length) {
        errEl.textContent = '⚠️ దయచేసి నింపండి: ' + missing.join(', ');
        return;
    }
    errEl.textContent = '';


    // Context captured automatically so a report is actionable — without this a
    // "there is a mistake" message gives no clue where to look.
    const payload = {
        // stable id so a retry overwrites the same document instead of creating
        // a duplicate (a timed-out attempt may actually have succeeded)
        fbid: 'fb-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        type, name, contact,
        message,
        screen: currentType ? ('reader:' + currentType) : 'home',
        stotram: currentType || '',
        stotramTitle: (currentType && stotramConfig[currentType]) ? stotramConfig[currentType].title : '',
        lang: navigator.language || '',
        device: (navigator.userAgent || '').slice(0, 180),
        website: document.getElementById('fbWebsite').value,   // honeypot (must stay empty)
        at: new Date().toISOString()
    };


    // Queue it on this device first, then try to send. If the phone is offline
    // or Firestore hiccups, the entry stays queued and is retried on the next
    // visit — so a message is never silently lost. (This replaces the old
    // Google-Sheet copy, which is no longer used.)
    queueFeedback(payload);
    flushFeedback();


    // thank-you
    document.getElementById('fbForm').style.display = 'none';
    document.getElementById('fbThanks').style.display = 'block';
    gaEvent('feedback_submit', { type });
    setTimeout(closeFeedback, 2200);
}


/* ---- feedback queue: survives offline, retried on next load ---- */
const FB_QUEUE_KEY = 'feedbackQueue_v1';
function readFbQueue() {
    try { return JSON.parse(localStorage.getItem(FB_QUEUE_KEY)) || []; } catch (e) { return []; }
}
function writeFbQueue(q) {
    try { localStorage.setItem(FB_QUEUE_KEY, JSON.stringify(q)); } catch (e) {}
}
function queueFeedback(payload) {
    const q = readFbQueue();
    q.push(payload);
    writeFbQueue(q.slice(-30));            // keep the queue small
}
async function flushFeedback() {
    if (!window.__cloudFeedback) return;   // cloud not ready yet; retried later
    let q = readFbQueue();
    if (!q.length) return;
    const left = [];
    for (const item of q) {
        try {
            // Firestore does NOT reject while offline — it just keeps the write
            // pending forever, which would hang this loop. So cap each attempt;
            // anything that doesn't confirm in time stays queued for next time.
            await withTimeout(window.__cloudFeedback(item), 8000);
        } catch (e) {
            // "permission-denied" here almost always means the document already
            // exists — i.e. an earlier attempt DID land and only the confirmation
            // was lost. Retrying forever would never clear, so drop it. Anything
            // else (offline, timeout, network) stays queued for the next visit.
            if (e && e.code === 'permission-denied') continue;
            left.push(item);
        }
    }
    writeFbQueue(left);
}
function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), ms);
        Promise.resolve(promise).then(
            (v) => { clearTimeout(t); resolve(v); },
            (e) => { clearTimeout(t); reject(e); }
        );
    });
}


/* ============================================================
   ANALYTICS (GA4) — anonymous usage. Single-page app, so we
   fire a screen_view as the user moves between views, plus a
   few key action events. Named gaEvent to avoid clashing with
   the `track` pooja-data variable.
============================================================ */
function gaEvent(name, params) {
    try { if (window.gtag) gtag('event', name, params || {}); } catch (e) {}
}


/* ============================================================
   HOME + STOTRAM COUNTERS (pradakshina + per-stotram parayana)
   Both reuse the same track.days[date] storage as the Track page.
   Per-stotram parayana counts live in track.days[date].parayana[type].
============================================================ */
createParticles();
initMeaningsToggle();
initGrandham();
initVoice();
showDueReminders();
initHomePradakshina();
