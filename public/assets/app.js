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
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = document.getElementById('particles');
    if (!c) return;
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
    closeAllSheets();
    currentType = type;
    syncReaderRoute(type);
    document.getElementById('readerLinkStatus').textContent = '';
    document.getElementById('readerLinkFallback').hidden = true;


    document.getElementById('homePage').style.display = 'none';
    document.getElementById('readerPage').classList.add('active');
    document.getElementById('trackPage').classList.remove('active');
    document.getElementById('japamalaPage')?.classList.remove('active');
    document.getElementById('backBtn').style.display = 'block';
    gaEvent('screen_view', { screen_name: 'Reader: ' + type });
    gaEvent('open_stotram', { stotram: type });


    const ts = document.getElementById('readerTitleSection');
    ts.className = 'reader-title-section ' + cfg.theme;
    document.getElementById('readerTitle').textContent = cfg.title;
    document.getElementById('readerSubtitle').textContent = cfg.subtitle;


    const bg = document.getElementById('readerDeityBg');
    bg.innerHTML = `<svg style="width:100%;height:100%;color:${cfg.svgColor}"><use href="${cfg.svgId}"/></svg>`;


    // The <details> summary already says "ఉద్భవం & ప్రాముఖ్యత", so the block
    // holds only the text; stotras without an origin hide the whole expander.
    const originEl = document.getElementById('originBlock');
    const originText = origins[type];
    document.getElementById('originDetails').hidden = !originText;
    if (originText) {
        originEl.innerHTML = `<div class="origin-text">${escapeHtml(originText)}</div>`;
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
    window.scrollTo({ top: 0, behavior: scrollMotion() });
}


function goHome() {
    if (window.Japamala3D) window.Japamala3D.hide();
    stopReaderPositionTracking();
    closeAllSheets();
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
    window.scrollTo({ top: 0, behavior: scrollMotion() });
}
// A page change (menu, Back button, browser history) closes every open sheet,
// top layer first: each sheet hands back the scroll lock it found when it opened.
// openReader, goHome, openTrack and openJapamala call it.
function closeAllSheets() {
    if (typeof closeInfo === 'function') closeInfo();
    if (typeof closeDay === 'function') closeDay();
    if (typeof closeFeedback === 'function') closeFeedback();
    if (typeof closeMessages === 'function') closeMessages();
    if (typeof closeUpdates === 'function') closeUpdates();
    if (typeof closeAccountOverlay === 'function') closeAccountOverlay();
    if (typeof closeSearch === 'function') closeSearch();
    document.body.style.overflow = '';
}
// 'smooth' unless the phone asks for less motion (reader.js and the
// back-to-top button use it too).
function scrollMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}


// Reader numbering follows verses and individual namavali names.
// Built-ins take their category from the home-page section their card sits
// in; stotras added through the admin panel carry their own.
window.addEventListener('scroll', () => {
    document.getElementById('scrollTopBtn')?.classList.toggle('visible', window.scrollY > 400);
}, { passive: true });


/* ============================================================
   SEARCH + VOICE
   Index is built automatically from stotramConfig, so any new
   stotram added there becomes searchable with no extra work.
============================================================ */
// One deity emoji per stotram, shared by search, Today (weekday.js) and
// Saved (library.js): the admin's icon for cloud stotras, else the one on
// the stotram's library card, else a default for its deity theme.
window.stotramIcon = (function () {
    const byTheme = {
        vishnu:'🔱', lalitha:'🪷', shiva:'🙏', bilva:'🌿', venkat:'⛰️', ganesha:'🐘',
        hanuman:'🚩', lakshmi:'🪙', saibaba:'🕉️', ayyappa:'🛕', durga:'🗡️',
        govinda:'🪈', chalisa:'🚩', manidweepa:'🌺', harati:'🪔'
    };
    return function stotramIcon(type) {
        const cfg = stotramConfig[type] || {};
        if (cfg.__icon) return String(cfg.__icon);
        const mark = /^[\w-]+$/.test(type)
            ? document.querySelector('a.card[data-stotram="' + type + '"] .deity-icon') : null;
        const fromCard = mark ? mark.textContent.trim() : '';
        return fromCard || byTheme[String(cfg.theme || '').replace('-theme', '')] || '🕉️';
    };
})();
function buildSearchIndex() {
    return Object.keys(stotramConfig).filter(type => !stotramConfig[type].hidden).map(type => {
        const cfg = stotramConfig[type];
        return {
            type,
            title: String(cfg.title || ''),
            subtitle: String(cfg.subtitle || ''),
            theme: String(cfg.theme || '').replace(/[^\w-]/g, ''),
            icon: window.stotramIcon(type)
        };
    });
}
let searchIndex = [];
let searchReturnFocus = null;
// Hand focus back to the button that opened an overlay, if it is still on screen.
function returnFocusTo(el) {
    if (!el || el === document.body || !document.contains(el) || !el.getClientRects().length) return;
    try { el.focus({ preventScroll: true }); } catch (e) { /* focus is best-effort */ }
}


function openSearch() {
    // Rebuilt on every open so stotras that arrived from the cloud are included.
    searchIndex = buildSearchIndex();
    const hint = document.getElementById('searchHint');
    if (hint) {
        if (!hint.dataset.defaultText) hint.dataset.defaultText = hint.textContent;
        hint.textContent = hint.dataset.defaultText;
    }
    const overlay = document.getElementById('searchOverlay');
    if (!overlay.classList.contains('active')) searchReturnFocus = document.activeElement;
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    gaEvent('screen_view', { screen_name: 'Search' });
    runSearch('');
    setTimeout(() => document.getElementById('searchInput').focus(), 100);
}
function closeSearch() {
    const overlay = document.getElementById('searchOverlay');
    const wasOpen = overlay.classList.contains('active');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
    document.getElementById('searchInput').value = '';
    if (wasOpen) returnFocusTo(searchReturnFocus);
    searchReturnFocus = null;
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
        results.innerHTML = '<div class="search-empty"><svg class="icon-inline" aria-hidden="true"><use href="/icons.svg#icon-search"/></svg>' +
            '<span>ఏమీ దొరకలేదు. వేరే పేరు ప్రయత్నించండి.</span></div>';
        return;
    }
    // Titles can come from the cloud, so every text is escaped. Keys are
    // plain ids; anything else is passed as an escaped JSON string.
    results.innerHTML = list.map(s => {
        const arg = /^[\w-]+$/.test(s.type) ? "'" + s.type + "'" : escapeHtml(JSON.stringify(s.type));
        return '<button type="button" class="search-result" onclick="pickSearch(' + arg + ')">' +
            '<span class="sr-icon medallion' + (s.theme ? ' ' + s.theme : '') + '" aria-hidden="true">' + escapeHtml(s.icon) + '</span>' +
            '<span class="sr-text"><span class="sr-title">' + escapeHtml(s.title) + '</span>' +
            (s.subtitle ? '<span class="sr-sub">' + escapeHtml(s.subtitle) + '</span>' : '') + '</span>' +
            '<svg class="icon-inline" aria-hidden="true"><use href="/icons.svg#icon-chevron-right"/></svg>' +
            '</button>';
    }).join('');
}
// Enter opens the only match; with several it just closes the phone keyboard.
function onSearchKey(e) {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    const hits = document.querySelectorAll('#searchResults .search-result');
    if (hits.length === 1) hits[0].click();
    else e.target.blur();
}
function pickSearch(type) {
    closeSearch();
    openReader(type);
}


let recognition = null;
function initVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const micBtn = document.getElementById('micBtn');
    if (!SR) {
        micBtn.style.display = 'none';
        // The default hint asks for the mic; without one, typing is the way.
        const hint = document.getElementById('searchHint');
        if (hint) hint.textContent = 'స్తోత్రం పేరు తెలుగులో లేదా ఇంగ్లీషులో టైప్ చేయండి.';
        return;
    }
    recognition = new SR();
    recognition.lang = 'te-IN';            // Telugu; works alongside typed search
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;
    recognition.onresult = (e) => {
        const text = e.results[0][0].transcript;
        const input = document.getElementById('searchInput');
        input.value = text;
        runSearch(text);
        document.getElementById('searchHint').textContent = '"' + text + '" కోసం వెతుకుతోంది…';
    };
    recognition.onend = () => micBtn.classList.remove('listening');
    recognition.onerror = (e) => {
        micBtn.classList.remove('listening');
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed')
            document.getElementById('searchHint').textContent = 'మైక్ అనుమతి ఇవ్వండి, లేదా టైప్ చేయండి.';
    };
}
function startVoice() {
    if (!recognition) return;
    const micBtn = document.getElementById('micBtn');
    try {
        recognition.start();
        micBtn.classList.add('listening');
        document.getElementById('searchHint').textContent = 'వింటున్నాను… ఇప్పుడు చెప్పండి';
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
    siteConfirm.count = (siteConfirm.count || 0) + 1;
    const msgId = 'scMsg' + siteConfirm.count;
    return new Promise((resolve) => {
        const returnTo = document.activeElement;
        const ov = document.createElement('div');
        ov.className = 'sc-overlay';
        // .sc-btn / .primary / .danger stay for older styles; .btn* give the shared look.
        ov.innerHTML =
            '<div class="sc-box" role="dialog" aria-modal="true" aria-labelledby="' + msgId + '" tabindex="-1">' +
            '<div class="sc-msg" id="' + msgId + '">' + escapeHtml(String(message)) + '</div>' +
            '<div class="sc-actions">' +
            (opts.hideCancel ? '' : '<button type="button" class="sc-btn btn btn-quiet" data-no>' + escapeHtml(String(cancelLabel)) + '</button>') +
            '<button type="button" class="sc-btn btn ' + (opts.danger ? 'btn-danger danger' : 'btn-primary primary') + '" data-yes>' + escapeHtml(String(okLabel)) + '</button>' +
            '</div></div>';
        const noBtn = ov.querySelector('[data-no]');
        const yesBtn = ov.querySelector('[data-yes]');


        let done = false;
        function finish(val) {
            if (done) return;
            done = true;
            document.removeEventListener('keydown', onKey);
            ov.dataset.closing = 'true';          // gone in 180ms; no longer "on top"
            ov.classList.remove('show');
            setTimeout(() => ov.remove(), 180);
            returnFocusTo(returnTo);
            resolve(val);
        }
        function onKey(e) {
            // opts.noDismiss: only the buttons answer (both choices must be deliberate).
            if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); if (!opts.noDismiss) finish(false); }
            // Enter answers with the focused button, so Enter on "Cancel" never confirms.
            // A held-down Enter (auto-repeat) never answers, and in a dangerous or
            // no-dismiss question Enter away from the buttons does nothing.
            else if (e.key === 'Enter') {
                e.preventDefault();
                if (e.repeat) return;
                if (e.target === yesBtn) finish(true);
                else if (noBtn && e.target === noBtn) finish(false);
                else if (!(noBtn && (opts.danger || opts.noDismiss))) finish(true);
            }
            else if (e.key === 'Tab') {
                // Keep focus on the dialog's buttons while it is open.
                const buttons = noBtn ? [noBtn, yesBtn] : [yesBtn];
                const at = buttons.indexOf(document.activeElement);
                e.preventDefault();
                buttons[(at + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
            }
        }


        if (noBtn) noBtn.onclick = () => finish(false);
        yesBtn.onclick = () => finish(true);
        ov.addEventListener('click', (e) => { if (e.target === ov && !opts.noDismiss) finish(false); });
        document.addEventListener('keydown', onKey);


        document.body.appendChild(ov);
        requestAnimationFrame(() => ov.classList.add('show'));
        // Destructive questions start on "Cancel", so a stray Enter is harmless.
        (opts.danger && noBtn ? noBtn : yesBtn).focus();
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
    const more = due.length > 1 ? ' (+' + (due.length - 1) + ' మరిన్ని)' : '';
    banner.innerHTML =
        '<span class="rb-icon" aria-hidden="true"><svg class="icon-inline" aria-hidden="true"><use href="/icons.svg#icon-bell"/></svg></span>' +
        '<span class="rb-text">ఈరోజు జ్ఞాపిక: <b>' + escapeHtml(String(due[0].text || '')) + '</b>' + more + '</span>' +
        '<button type="button" class="rb-close" aria-label="మూసివేయి" onclick="this.parentElement.classList.remove(\'show\')">' +
        '<svg class="icon-inline" aria-hidden="true"><use href="/icons.svg#icon-close"/></svg></button>';
    banner.classList.add('show');
    if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification('పూజా జ్ఞాపిక', { body: due[0].text }); } catch (e) {}
    }
}


// Escape closes the overlays. The newer sheets (info, updates, messages)
// close themselves first in the capture phase; the calls here are a fallback.
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' && e.key !== 'Esc') return;
    // siteConfirm answers its own Escape while it is open.
    if (document.querySelector('.sc-overlay:not([data-closing])')) return;
    closeSearch();
    if (typeof closeDay === 'function') closeDay();
    closeFeedback();
    if (typeof closeAccountOverlay === 'function') closeAccountOverlay();
    if (typeof closeUpdates === 'function') closeUpdates();
    if (typeof closeMessages === 'function') closeMessages();
    if (typeof closeInfo === 'function') closeInfo();
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
        siteAlert('బ్యాకప్ తీసుకోవడంలో సమస్య వచ్చింది. దయచేసి మళ్ళీ ప్రయత్నించండి.');
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
            // A backup without a mala count (older files) keeps the current one.
            const jm = data.japamala && Number.isFinite(data.japamala.total) && data.japamala.total >= 0
                ? Math.floor(data.japamala.total) : ((track.japamala && track.japamala.total) || 0);
            setTrack({
                days: data.days && typeof data.days === 'object' ? data.days : {},
                mokkulu: Array.isArray(data.mokkulu) ? data.mokkulu : [],
                reading: data.reading && typeof data.reading === 'object' ? data.reading : {},
                japamala: { total: jm }
            });
            saveTrack();                   // also hands the restored data to cloud sync
            showDueReminders();
            siteAlert('బ్యాకప్ విజయవంతంగా పునరుద్ధరించబడింది.');
        } catch (err) {
            siteAlert('ఇది సరైన బ్యాకప్ ఫైల్ కాదు. దయచేసి "pooja-backup" తో మొదలయ్యే ఫైల్ ఎంచుకోండి.');
        }
        input.value = '';
    };
    reader.readAsText(file);
}


/* ============================================================
   FEEDBACK  (type + name + message; contact optional, voice-fill)
   Submissions go to Firestore, and the admin reads them in the
   dashboard (admin.html). A hidden honeypot field keeps out bots.
   Entries are queued on the device first and retried if the phone is
   offline, so nothing is lost. messages.js keeps a copy for
   "నా సందేశాలు" (recordSentMessage) and drives the type chips.


   The old Google Apps Script / Sheet route has been removed — Firestore
   replaces it. It also exposed a public script URL anyone could POST to.
============================================================ */


let feedbackReturnFocus = null;
let feedbackCloseTimer = null;
let feedbackContext = null;   // the stotram open when the form opened (a report names it)
// openFeedback('correction' | 'problem' | 'suggestion' | 'other') preselects
// that type; with no type, every open starts from the form's default type.
function openFeedback(type) {
    clearTimeout(feedbackCloseTimer);
    resetFeedbackBox();
    const typeEl = document.getElementById('fbType');
    if (typeEl && typeEl.options) {
        const options = Array.from(typeEl.options);
        const given = options.find(o => o.value === type);
        const fallback = options.find(o => o.defaultSelected) || options[0];
        if (given || fallback) typeEl.value = (given || fallback).value;
    }
    window.syncFeedbackChips?.();
    const overlay = document.getElementById('feedbackOverlay');
    if (!overlay.classList.contains('active')) feedbackReturnFocus = document.activeElement;
    feedbackContext = currentType;
    overlay.classList.add('active');
    // The title, not the name box: on phones a focused field pops the keyboard
    // over the type chips before the reader has seen them.
    const title = document.getElementById('fbTitle');
    title.tabIndex = -1;
    try { title.focus({ preventScroll: true }); } catch (e) {}
    document.body.style.overflow = 'hidden';
}
function closeFeedback() {
    clearTimeout(feedbackCloseTimer);
    const overlay = document.getElementById('feedbackOverlay');
    const wasOpen = overlay.classList.contains('active');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
    if (wasOpen) returnFocusTo(feedbackReturnFocus);
    feedbackReturnFocus = null;
}
function resetFeedbackBox() {
    document.getElementById('fbForm').style.display = 'block';
    document.getElementById('fbThanks').style.display = 'none';
    document.getElementById('fbError').textContent = '';
    ['fbName', 'fbNumber', 'fbMessage'].forEach(id => {
        const el = document.getElementById(id);
        el.value = ''; el.classList.remove('invalid'); el.removeAttribute('aria-invalid');
    });
}


// Generic voice-to-field helper (used by each .mic-mini button)
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
        el.classList.remove('invalid'); el.removeAttribute('aria-invalid');
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
    [nameEl, numEl, msgEl].forEach(el => { el.classList.remove('invalid'); el.removeAttribute('aria-invalid'); });


    const name = nameEl.value.trim();
    const contact = numEl.value.trim();          // phone OR email, now optional
    const message = msgEl.value.trim();
    const typeEl = document.getElementById('fbType');
    const type = typeEl ? typeEl.value : 'other';
    const missing = [];


    if (!name) { nameEl.classList.add('invalid'); nameEl.setAttribute('aria-invalid', 'true'); missing.push('పేరు'); }
    if (!message) { msgEl.classList.add('invalid'); msgEl.setAttribute('aria-invalid', 'true'); missing.push('మీ సందేశం'); }


    if (missing.length) {
        errEl.textContent = 'దయచేసి నింపండి: ' + missing.join(', ');
        (name ? msgEl : nameEl).focus();
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
        screen: feedbackContext ? ('reader:' + feedbackContext) : 'home',
        stotram: feedbackContext || '',
        stotramTitle: (feedbackContext && stotramConfig[feedbackContext]) ? stotramConfig[feedbackContext].title : '',
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
    // A copy for "నా సందేశాలు" (messages.js); its failure must not block sending.
    try { window.recordSentMessage?.(payload); } catch (e) { console.warn('[feedback] could not record the message', e); }
    flushFeedback();


    // thank-you (focus moves to it: the submit button it replaces is gone)
    document.getElementById('fbForm').style.display = 'none';
    const thanks = document.getElementById('fbThanks');
    thanks.style.display = 'block';
    thanks.tabIndex = -1;
    try { thanks.focus({ preventScroll: true }); } catch (e) {}
    gaEvent('feedback_submit', { type });
    clearTimeout(feedbackCloseTimer);
    // Long enough for a slow reader; the "సరే" button closes it sooner.
    feedbackCloseTimer = setTimeout(closeFeedback, 8000);
}


/* ---- feedback queue: survives offline, retried on next load ---- */
const FB_QUEUE_KEY = 'feedbackQueue_v1';
function readFbQueue() {
    try {
        const q = JSON.parse(localStorage.getItem(FB_QUEUE_KEY));
        return Array.isArray(q) ? q : [];
    } catch (e) { return []; }
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
    // Keep anything queued while this pass was sending (a second message
    // written during a slow, offline attempt must not be overwritten).
    const attempted = new Set(q.map(item => item && item.fbid));
    const added = readFbQueue().filter(item => !attempted.has(item && item.fbid));
    writeFbQueue(left.concat(added).slice(-30));
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
// Home is what shows until the scripts after the Firebase CDN files run;
// from then on experience.js keeps html[data-screen] in step with the page.
if (!document.documentElement.dataset.screen) document.documentElement.dataset.screen = 'home';
createParticles();
initMeaningsToggle();
initVoice();
showDueReminders();
initHomePradakshina();
