/* ============================================================
   FEEDBACK  (type + name + message; contact optional, voice-fill,
   up to 3 screenshots / PDFs)
   Moved out of app.js. The names stay top-level globals because the
   inline handlers in index.html and other scripts call them
   (openFeedback, closeFeedback, listenInto, submitFeedback, and
   flushFeedback from cloud.js). index.html loads this file right after
   japamala.js, so the app.js globals it uses (stotramConfig,
   currentType, returnFocusTo, siteAlert, gaEvent) already exist.

   Submissions go to Firestore, and the admin reads them in the
   dashboard (admin.html). A hidden honeypot field keeps out bots.
   A message without attachments is queued on the device first and
   retried if the phone is offline, so nothing is lost. Each message
   remembers the account signed in when it was written (payload.byUid)
   and carries a random claim key; cloud.js uses them so a queued message
   never goes out under another account's name. A message with
   attachments is too big for that queue: it goes straight to the cloud
   (cloud.js window.__cloudSendReport) and the form stays filled in
   until it has arrived. messages.js keeps a copy for "నా సందేశాలు"
   (recordSentMessage), drives the type chips and creates
   window.feedbackPicker (attachments.js StotramFiles.createPicker).

   The old Google Apps Script / Sheet route has been removed — Firestore
   replaces it. It also exposed a public script URL anyone could POST to.
============================================================ */
'use strict';

let feedbackReturnFocus = null;
let feedbackCloseTimer = null;
let feedbackContext = null;   // the stotram open when the form opened (a report names it)
// The report with attachments that is on its way ({ payload }), or null.
// resetFeedbackBox lets go of it: it still finishes, but no longer changes the form.
let feedbackSending = null;
// After a report with attachments failed: what was tried ({ fbid, claimKey,
// type, name, contact, message, files }). The next tap reuses its id and key
// only when nothing changed (the same words and the same picked files),
// because that message may already have arrived (cloud.js then sends only
// what is missing instead of a second copy). Any edit makes a new message.
let feedbackRetry = null;
const FB_COPY = Object.freeze({
    sending: 'పంపుతోంది…',
    preparing: 'చిత్రం సిద్ధమవుతోంది… ఒక్క క్షణం.',
    offline: "స్క్రీన్‌షాట్‌లు పంపడానికి ఇంటర్నెట్ కావాలి. కనెక్షన్ చూసి మళ్ళీ 'పంపండి' నొక్కండి."
});

// True while reloading the page would lose something: a report with
// attachments still on its way, or screenshots picked for one. build-check.js
// asks this before it reloads a page that is older than the live site.
function feedbackBusy() {
    if (feedbackSending) return true;
    const picker = window.feedbackPicker || null;
    if (!picker) return false;
    try {
        return !!((typeof picker.busy === 'function' && picker.busy()) ||
            (typeof picker.count === 'function' && picker.count() > 0));
    } catch (e) { return true; }
}


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
    showFeedbackNote('');
    ['fbName', 'fbNumber', 'fbMessage'].forEach(id => {
        const el = document.getElementById(id);
        el.value = ''; el.classList.remove('invalid'); el.removeAttribute('aria-invalid');
    });
    // A report still on its way finishes by itself but no longer drives this form.
    feedbackSending = null;
    feedbackRetry = null;
    setFeedbackBusy(false);
    // The picked screenshots / PDFs go too (messages.js creates the picker).
    try {
        if (window.feedbackPicker && typeof window.feedbackPicker.clear === 'function') window.feedbackPicker.clear();
    } catch (e) { console.warn('[feedback] could not clear the attachments', e); }
}
// The form's one line of feedback. A "please wait" line (preparing, sending)
// goes to #fbStatus (role="status", calm look); a real error goes to #fbError
// (role="alert"). Writing one empties the other; .fb-error:empty hides both
// when empty. Without #fbStatus the wait line falls back to #fbError, marked
// data-state="busy" so it still does not look like an error.
function showFeedbackNote(text, busy) {
    const errEl = document.getElementById('fbError');
    const statusEl = document.getElementById('fbStatus');
    const wait = !!(busy && text);
    if (statusEl) statusEl.textContent = wait ? text : '';
    if (!errEl) return;
    errEl.textContent = (wait && statusEl) ? '' : (text || '');
    if (wait && !statusEl) errEl.setAttribute('data-state', 'busy');
    else errEl.removeAttribute('data-state');
}
// While a report with attachments is on its way the whole form is locked, so
// nothing typed or picked meanwhile is lost when the thank-you replaces the
// form: the three fields turn read-only (focus stays where it is) and the
// send, type, voice and attachment buttons and the file input are disabled.
// Both ways a send ends unlock it: submitFeedback when the answer comes, and
// resetFeedbackBox when the form is opened afresh meanwhile.
function setFeedbackBusy(on) {
    const lock = !!on;
    ['fbName', 'fbNumber', 'fbMessage'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.readOnly = lock;
    });
    ['fbAttachBtn', 'fbFiles'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = lock;
    });
    document.querySelectorAll('#fbForm .mic-mini, #fbForm .fb-type-chip, #fbAttachList .attach-remove')
        .forEach(b => { b.disabled = lock; });
    const btn = document.querySelector('#fbForm .fb-submit');
    if (!btn) return null;
    btn.disabled = lock;
    if (lock) btn.setAttribute('aria-busy', 'true');
    else btn.removeAttribute('aria-busy');
    return btn;
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
        if (!el || el.readOnly) return;           // the form is locked while a report is sent
        if (inputId === 'fbNumber') t = t.replace(/[^\d+]/g, '');   // keep digits for phone
        el.value = (append && el.value) ? (el.value + ' ' + t) : t;
        el.classList.remove('invalid'); el.removeAttribute('aria-invalid');
    };
    rec.onend = () => btn && btn.classList.remove('listening');
    rec.onerror = () => btn && btn.classList.remove('listening');
    try { rec.start(); btn && btn.classList.add('listening'); } catch (e) {}
}


// Without attachments the thank-you shows at once (the queue sends it). With
// attachments this waits for the cloud, so it is async; nobody uses its result.
async function submitFeedback() {
    if (feedbackSending) return;                 // a report with attachments is still on its way
    const nameEl = document.getElementById('fbName');
    const numEl = document.getElementById('fbNumber');
    const msgEl = document.getElementById('fbMessage');
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
        showFeedbackNote('దయచేసి నింపండి: ' + missing.join(', '));
        (name ? msgEl : nameEl).focus();
        return;
    }
    // A picked screenshot is shrunk on the phone first; wait until that is done.
    const picker = window.feedbackPicker || null;
    if (picker && typeof picker.busy === 'function' && picker.busy()) {
        showFeedbackNote(FB_COPY.preparing, true);
        return;
    }
    const withFiles = !!(picker && typeof picker.count === 'function' && picker.count() > 0);
    const files = withFiles ? picker.files() : [];
    showFeedbackNote('');
    // A retry is the same message only when the reader changed nothing: the
    // same words and the same picked files, in the same order. Anything else
    // (an edit, a file added or removed, no files left) is a new message with
    // a fresh id and key; reusing the old id would be refused as a duplicate
    // (and silently dropped) or send only the files, never the edit.
    const tried = feedbackRetry;
    const unchanged = !!tried && tried.type === type && tried.name === name &&
        tried.contact === contact && tried.message === message &&
        Array.isArray(tried.files) && files.length > 0 && files.length === tried.files.length &&
        files.every((f, i) => f === tried.files[i]);
    if (!unchanged) feedbackRetry = null;


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
    // Who wrote it (null when signed out). A queued message can go out much
    // later: cloud.js holds it back while another account is signed in on
    // this phone, so it never lands in someone else's "నా సందేశాలు".
    const cloudUser = window.StotramCloud ? window.StotramCloud.user : null;
    payload.byUid = (cloudUser && cloudUser.uid) || null;
    // A random claim key goes with every message. cloud.js stores it only on a
    // message that goes out without an account (written signed out, or held
    // for an account that has signed out since); this phone shows it later to
    // link that message to the account (messages.js).
    if (window.StotramFiles && typeof window.StotramFiles.newClaimKey === 'function') {
        try { payload.claimKey = window.StotramFiles.newClaimKey(); } catch (e) { /* sent without a key */ }
    }
    // Trying again, unchanged, after a report with attachments failed: the same id and key.
    if (feedbackRetry) {
        payload.fbid = feedbackRetry.fbid;
        if (feedbackRetry.claimKey) payload.claimKey = feedbackRetry.claimKey;
        else delete payload.claimKey;
    }


    if (!withFiles) {
        feedbackRetry = null;
        // Queue it on this device first, then try to send. If the phone is offline
        // or Firestore hiccups, the entry stays queued and is retried on the next
        // visit — so a message is never silently lost. (This replaces the old
        // Google-Sheet copy, which is no longer used.)
        queueFeedback(payload);
        // A copy for "నా సందేశాలు" (messages.js); its failure must not block sending.
        try { window.recordSentMessage?.(payload); } catch (e) { console.warn('[feedback] could not record the message', e); }
        flushFeedback();
        showThanks();
        return;
    }


    // With screenshots / PDFs: straight to the cloud; the form stays until they arrive.
    if (typeof window.__cloudSendReport !== 'function') {
        showFeedbackNote(FB_COPY.offline);
        return;
    }
    const attempt = { payload };
    feedbackSending = attempt;
    const btn = setFeedbackBusy(true);
    showFeedbackNote(FB_COPY.sending, true);
    let failure = null;
    try {
        await window.__cloudSendReport(payload, files);
    } catch (e) {
        failure = e || new Error('send failed');
    }
    const current = feedbackSending === attempt;
    if (current) feedbackSending = null;
    // The message reached the team (maybe without some files): keep the copy for
    // "నా సందేశాలు" with its claim key, even if the form was opened afresh meanwhile.
    if (!failure || failure.code === 'partial') {
        if (!Array.isArray(payload.files) && window.StotramFiles && typeof window.StotramFiles.meta === 'function') {
            try { payload.files = window.StotramFiles.meta(files, 'first'); } catch (e) {}
        }
        try { window.recordSentMessage?.(payload); } catch (e) { console.warn('[feedback] could not record the message', e); }
    }
    if (!current) return;                        // the form was opened afresh meanwhile
    setFeedbackBusy(false);
    if (failure) {
        feedbackRetry = {
            fbid: payload.fbid, claimKey: payload.claimKey || '',
            type, name, contact, message, files: files.slice()
        };
        showFeedbackNote(typeof failure.te === 'string' && failure.te ? failure.te : FB_COPY.offline);
        // A button that was disabled can lose focus; hand it back for the next tap.
        const active = document.activeElement;
        if (btn && overlayIsOpen() && (!active || active === document.body)) {
            try { btn.focus({ preventScroll: true }); } catch (e) {}
        }
        return;
    }
    feedbackRetry = null;
    showFeedbackNote('');
    try { picker.clear(); } catch (e) { console.warn('[feedback] could not clear the attachments', e); }
    showThanks();


    function overlayIsOpen() {
        const overlay = document.getElementById('feedbackOverlay');
        return !!(overlay && overlay.classList.contains('active'));
    }
    // thank-you (focus moves to it: the submit button it replaces is gone)
    function showThanks() {
        document.getElementById('fbForm').style.display = 'none';
        const thanks = document.getElementById('fbThanks');
        thanks.style.display = 'block';
        gaEvent('feedback_submit', { type });
        clearTimeout(feedbackCloseTimer);
        // A report with attachments can arrive after the reader closed the form:
        // then no focus move and no timer (closing it again would unlock the page).
        if (!overlayIsOpen()) return;
        thanks.tabIndex = -1;
        try { thanks.focus({ preventScroll: true }); } catch (e) {}
        // Long enough for a slow reader; the "సరే" button closes it sooner.
        feedbackCloseTimer = setTimeout(closeFeedback, 8000);
    }
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
            // else (offline, timeout, network) stays queued for the next visit,
            // and so does a message cloud.js holds back for the account that
            // wrote it (code 'held': another account is signed in right now).
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
