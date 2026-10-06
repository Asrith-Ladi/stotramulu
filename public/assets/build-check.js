/* ============================================================
   BUILD CHECK: reloads a page that was left open across a deploy.

   A page that stays open on a phone (or that Android restores from
   memory) keeps running the code it first loaded, even after a new
   version of the site is live. Old code talking to new Firestore rules
   can fail quietly: a message that never sends, a conversation that does
   not open. A refresh fixes it, but readers do not know to refresh.

   Every build writes its id into <meta name="stotram-build"> and the same
   id into /version.json (tools/vite-version-stamp.mjs). This script asks
   for /version.json, never from the cache:
     - about 4 seconds after the page opens (a page the browser served
       from its cache can be old), and
     - each time the reader comes back to this tab,
   at most once every 5 minutes. A different id means a different version
   is live, and the page reloads, but only when nothing would be lost:
     - on Home (never while reading, counting the mala or on Track),
     - with no sheet, dialog or picture open,
     - with nothing typed in a box,
     - with nothing still sending (feedbackBusy, window.messagesBusy).
   Otherwise it waits and tries again when the reader comes back to Home,
   or leaves the tab. It reloads at most once per new id in a tab
   (sessionStorage stotramReloadedFor), so a browser that keeps serving
   the old page can never cause a reload loop. A page from the dev server
   says "dev" and never checks.

   Also adds the build's date and time under the account sheet's footer,
   so you can see which version a phone is running.
============================================================ */
(function () {
  'use strict';

  const ID_RE = /^[0-9a-f]{8,64}$/;
  const FIRST_MS = 4000;
  const GAP_MS = 5 * 60 * 1000;
  const RELOADED_KEY = 'stotramReloadedFor';
  const TE_MONTHS = ['జనవరి', 'ఫిబ్రవరి', 'మార్చి', 'ఏప్రిల్', 'మే', 'జూన్', 'జులై', 'ఆగస్టు', 'సెప్టెంబర్', 'అక్టోబర్', 'నవంబర్', 'డిసెంబర్'];
  const OPEN_LAYERS = '.sheet-overlay.active, .search-overlay.active, .feedback-overlay.active, .day-sheet-overlay.active, .sc-overlay';
  const TEXT_FIELDS = 'textarea, input[type="text"], input[type="email"], input[type="tel"], input[type="search"], input:not([type])';

  const meta = document.querySelector('meta[name="stotram-build"]');
  const mine = meta ? meta.getAttribute('content') || '' : '';
  if (!ID_RE.test(mine)) return;

  showVersion(meta.getAttribute('data-built'));

  let lastCheck = 0;
  let checking = false;
  let live = '';          // the id of a different version seen on the server

  function check() {
    if (live) { reloadIfSafe(); return; }
    if (checking || document.visibilityState === 'hidden') return;
    if (lastCheck && Date.now() - lastCheck < GAP_MS) return;
    if (navigator.onLine === false || typeof fetch !== 'function') return;
    checking = true;
    lastCheck = Date.now();
    fetch('/version.json?t=' + Date.now(), { cache: 'no-store', credentials: 'omit' })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        const id = v && typeof v.build === 'string' ? v.build : '';
        if (ID_RE.test(id) && id !== mine) {
          live = id;
          reloadIfSafe();
        }
      })
      .catch(() => { /* offline or blocked: try again next time */ })
      .then(() => { checking = false; });
  }

  function safeNow() {
    if ((document.documentElement.dataset.screen || 'home') !== 'home') return false;
    if (document.body.style.overflow === 'hidden') return false;   // a sheet, dialog or picture is open
    if (document.querySelector(OPEN_LAYERS)) return false;
    const fields = document.querySelectorAll(TEXT_FIELDS);
    for (let i = 0; i < fields.length; i++) {
      if (!fields[i].readOnly && String(fields[i].value || '').trim() !== '') return false;
    }
    try {
      if (typeof feedbackBusy === 'function' && feedbackBusy()) return false;
      if (typeof window.messagesBusy === 'function' && window.messagesBusy()) return false;
    } catch (e) { return false; }
    return true;
  }

  function reloadIfSafe() {
    if (!live || !safeNow()) return;
    try {
      if (sessionStorage.getItem(RELOADED_KEY) === live) return;   // reloaded for it once already
      sessionStorage.setItem(RELOADED_KEY, live);
    } catch (e) { return; }   // cannot remember the reload, so do not risk a loop
    location.reload();
  }

  function showVersion(built) {
    const box = document.querySelector('.account-version');
    const d = built ? new Date(built) : null;
    if (!box || !d || isNaN(d.getTime())) return;
    const two = (n) => (n < 10 ? '0' : '') + n;
    const small = document.createElement('small');
    small.textContent = 'వెర్షన్: ' + d.getDate() + ' ' + TE_MONTHS[d.getMonth()] + ' ' + d.getFullYear() +
      ', ' + two(d.getHours()) + ':' + two(d.getMinutes());
    box.appendChild(document.createElement('br'));
    box.appendChild(small);
  }

  setTimeout(check, FIRST_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
    else reloadIfSafe();            // leaving the tab: the reader returns to the new version
  });
  window.addEventListener('pageshow', (e) => { if (e.persisted) check(); });
  // Back on Home from the reader, the mala or Track: a waiting reload can go now.
  new MutationObserver(() => { if (live) reloadIfSafe(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-screen'] });
})();
