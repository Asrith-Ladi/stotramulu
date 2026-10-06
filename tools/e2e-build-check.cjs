// End-to-end test of the version check (build-check.js, Phase 29) in headless
// Chrome against the built site (dist/client). /version.json is answered by
// this script, so each case can pretend a newer version is live:
//  - the built pages: every local script stamped, meta id = version.json id;
//  - the same id: no reload; the account sheet shows the build date;
//  - a new id on Home with nothing open: one reload, and never a second one
//    for the same id (the browser may keep serving the old page);
//  - typed text, an open sheet, a reply or report still sending, the reader,
//    the mala: no reload until that is over (then leaving the tab, or going
//    back to Home, reloads);
//  - /version.json failing: nothing happens, no errors.
// Run with: npm run e2e (BROWSER_EXECUTABLE picks another Chrome binary).
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..', 'dist', 'client');
const FAKE = fs.readFileSync(path.join(__dirname, 'fake-firebase.js'));
const ORIGIN = 'http://stotram.local';
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const NEWER = 'abcdef123456';

let stepName = '';
const step = (name) => { stepName = name; console.log('  · ' + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openPage(browser, url, answer) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'te-IN' });
  const page = await context.newPage();
  const state = { answer, hits: 0, loads: 0, errors: [] };
  page.on('pageerror', (e) => state.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource|ERR_FAILED|net::/.test(t)) return;       // aborted analytics, the failing version.json
    state.errors.push('console.error: ' + t);
  });
  page.on('load', () => { state.loads++; });
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === 'www.gstatic.com' && u.pathname.endsWith('/firebase-app-compat.js')) {
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE });
    }
    if (u.hostname === 'www.gstatic.com' && /\/firebase-(auth|firestore)-compat\.js$/.test(u.pathname)) {
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
    }
    if (u.origin !== ORIGIN) return route.abort();
    if (u.pathname === '/version.json' && state.answer !== 'real') {
      state.hits++;
      if (state.answer === 'fail') return route.fulfill({ status: 503, body: '' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ build: state.answer, built: '2026-10-02T09:00:00.000Z' }) });
    }
    if (u.pathname === '/version.json') state.hits++;
    let file = decodeURIComponent(u.pathname); if (file === '/') file = '/index.html';
    const abs = path.join(root, file);
    if (!abs.startsWith(root) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(abs)] || 'application/octet-stream', body: fs.readFileSync(abs) });
  });
  await page.goto(ORIGIN + url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.screen, null, { timeout: 15000 });
  return { context, page, state };
}

// Waits for the check about 4 s after the page opens, then a moment for a reload to start.
async function firstCheck(state, hits = 1) {
  for (let i = 0; i < 100 && state.hits < hits; i++) await sleep(100);
  assert.ok(state.hits >= hits, 'the page asked for /version.json');
  await sleep(600);
}
async function waitForReload(state, loads) {
  for (let i = 0; i < 50 && state.loads < loads; i++) await sleep(100);
  assert.equal(state.loads, loads, 'the page reloaded');
}
const leaveTab = (page) => page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
});

(async () => {
  if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('dist/client/index.html missing; run npm run build first');

  step('the built pages are stamped');
  const version = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));
  assert.match(version.build, /^[0-9a-f]{12}$/);
  for (const name of ['index.html', 'admin.html']) {
    const html = fs.readFileSync(path.join(root, name), 'utf8');
    const local = [...html.matchAll(/<script\b[^>]*\ssrc="(\/(?!\/)[^"]+)"/g)].map((m) => m[1]);
    assert.ok(local.length > 20, name + ' loads its scripts');
    for (const src of local) assert.match(src, /\?v=[0-9a-f]{10}$/, name + ': ' + src + ' is stamped');
  }
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(index.includes('<meta name="stotram-build" content="' + version.build + '" data-built="' + version.built + '">'), 'index.html carries the id in version.json');

  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : { channel: 'chrome' }) });
  try {
    step('the same version: no reload, and the account sheet shows the build date');
    {
      const { context, page, state } = await openPage(browser, '/', 'real');
      await firstCheck(state);
      assert.equal(state.loads, 1, 'no reload');
      const line = await page.evaluate(() => document.querySelector('.account-version small')?.textContent || '');
      assert.match(line, /^వెర్షన్: \d{1,2} \S+ 20\d\d, \d\d:\d\d$/);
      assert.deepEqual(state.errors, []);
      await context.close();
    }

    step('a new version on Home: one reload, and no reload loop');
    {
      const { context, page, state } = await openPage(browser, '/#library', NEWER);
      await firstCheck(state);
      await waitForReload(state, 2);
      assert.equal(await page.evaluate(() => sessionStorage.getItem('stotramReloadedFor')), NEWER);
      assert.ok(page.url().endsWith('/#library'), 'the reader stays on the same panel');
      // The served page is still the old build, so the next check sees the same new id.
      await firstCheck(state, 2);
      await sleep(1000);
      assert.equal(state.loads, 2, 'reloads once per new version, never in a loop');
      assert.deepEqual(state.errors, []);
      await context.close();
    }

    step('typed text waits: no reload until the box is empty and the reader leaves the tab');
    {
      const { context, page, state } = await openPage(browser, '/', NEWER);
      await page.evaluate(() => { openFeedback('problem'); });
      await page.fill('#fbMessage', 'సగం రాసిన సందేశం');
      await page.evaluate(() => closeFeedback());
      await firstCheck(state);
      await leaveTab(page);
      await sleep(500);
      assert.equal(state.loads, 1, 'a half-written message is never thrown away');
      await page.evaluate(() => { document.getElementById('fbMessage').value = ''; });
      await leaveTab(page);
      await waitForReload(state, 2);
      await context.close();
    }

    step('an open sheet waits, then leaving the tab reloads');
    {
      const { context, page, state } = await openPage(browser, '/', NEWER);
      await page.evaluate(() => openAccount());
      await firstCheck(state);
      assert.equal(state.loads, 1, 'no reload under an open sheet');
      await page.evaluate(() => closeAccountOverlay());
      await leaveTab(page);
      await waitForReload(state, 2);
      await context.close();
    }

    step('a reply or report still sending waits');
    {
      const { context, page, state } = await openPage(browser, '/', NEWER);
      assert.deepEqual(await page.evaluate(() => [feedbackBusy(), window.messagesBusy()]), [false, false], 'nothing is busy at rest');
      await page.evaluate(() => { window.__busy = 'messages'; const f = feedbackBusy, m = window.messagesBusy;
        window.feedbackBusy = () => window.__busy === 'feedback' || f(); window.messagesBusy = () => window.__busy === 'messages' || m(); });
      await firstCheck(state);
      await leaveTab(page);
      await sleep(400);
      assert.equal(state.loads, 1, 'no reload while a reply is sending');
      await page.evaluate(() => { window.__busy = 'feedback'; });
      await leaveTab(page);
      await sleep(400);
      assert.equal(state.loads, 1, 'no reload while a report is sending');
      await page.evaluate(() => { window.__busy = ''; });
      await leaveTab(page);
      await waitForReload(state, 2);
      await context.close();
    }

    step('reading a stotram waits; back on Home it reloads');
    {
      const { context, page, state } = await openPage(browser, '/?stotram=vishnu', NEWER);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.screen), 'reader');
      await firstCheck(state);
      await leaveTab(page);
      await sleep(400);
      assert.equal(state.loads, 1, 'never pulls the page away while reading');
      await page.evaluate(() => window.navigateView('home'));
      await waitForReload(state, 2);
      await context.close();
    }

    step('counting the mala waits; back on Home it reloads');
    {
      const { context, page, state } = await openPage(browser, '/', NEWER);
      await page.evaluate(() => openJapamala());
      assert.equal(await page.evaluate(() => document.documentElement.dataset.screen), 'japamala');
      await firstCheck(state);
      await leaveTab(page);
      await sleep(400);
      assert.equal(state.loads, 1, 'never pulls the page away while counting');
      await page.evaluate(() => window.navigateView('home'));
      await waitForReload(state, 2);
      await context.close();
    }

    step('/version.json failing: nothing happens');
    {
      const { context, page, state } = await openPage(browser, '/', 'fail');
      await firstCheck(state);
      await leaveTab(page);
      await sleep(400);
      assert.equal(state.loads, 1);
      assert.deepEqual(state.errors, [], 'no errors');
      await context.close();
    }

    console.log('PASS: version check — every script stamped, meta = version.json; same version: no reload + build date shown; new version: one reload on Home, no loop; waits for typed text, an open sheet, a send in progress, the reader and the mala.');
  } catch (e) {
    console.error('FAILED at step: ' + stepName);
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
