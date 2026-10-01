// End-to-end test of conversations, attachments and the admin notify buttons
// (Phase 27), in headless Chrome against the built site (dist/client). The
// Firebase SDK is replaced by tools/fake-firebase.js (served for the gstatic
// firebase-app-compat.js URL; the auth / firestore bundles get an empty script),
// so the real cloud.js, feedback.js, messages.js, attachments.js and
// admin-dashboard.js run against an in-memory Firestore with a rules mirror.
// Run with: npm run e2e (BROWSER_EXECUTABLE picks another Chrome binary).
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..', 'dist', 'client');
const FAKE = fs.readFileSync(path.join(__dirname, 'fake-firebase.js'));
const ORIGIN = 'http://stotram.local';
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const ADMIN = (fs.readFileSync(path.join(root, 'assets', 'site-config.js'), 'utf8').match(/ADMIN_UID\s*=\s*"([^"]+)"/) || [])[1];
const T = 15000;

function serve(route) {
  const url = new URL(route.request().url());
  if (url.hostname === 'www.gstatic.com' && url.pathname.endsWith('/firebase-app-compat.js')) {
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE });
  }
  if (url.hostname === 'www.gstatic.com' && /\/firebase-(auth|firestore)-compat\.js$/.test(url.pathname)) {
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
  }
  if (url.origin !== ORIGIN) return route.abort();
  let file = decodeURIComponent(url.pathname); if (file === '/') file = '/index.html';
  const abs = path.join(root, file);
  if (!abs.startsWith(root) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) return route.fulfill({ status: 404, body: '' });
  return route.fulfill({ status: 200, contentType: TYPES[path.extname(abs)] || 'application/octet-stream', body: fs.readFileSync(abs) });
}

let stepName = '';
const step = (name) => { stepName = name; console.log('  · ' + name); };

async function openPage(browser, url, viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce', locale: 'te-IN' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource|ERR_FAILED|net::/.test(t)) return;       // aborted analytics etc.
    errors.push('console.error: ' + t);
  });
  await page.route('**/*', serve);
  await page.goto(ORIGIN + url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__fb && window.StotramFiles, null, { timeout: T });
  return { context, page, errors };
}
const fbj = (page, fn, arg) => page.evaluate(fn, arg);

// Test files, drawn in the page so they are real images.
async function pngBuffer(page, w, h, noise) {
  const b64 = await page.evaluate(([w, h, noise]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#0d3b3a'); g.addColorStop(1, '#c39a3d');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = '#fff'; x.font = '64px sans-serif'; x.fillText('Test screenshot', 40, 120);
    if (noise) {
      const d = x.getImageData(0, 0, w, h);
      for (let i = 0; i < d.data.length; i += 4) { const n = (Math.random() * 255) | 0; d.data[i] = n; d.data[i + 1] = (n * 7) & 255; d.data[i + 2] = (n * 13) & 255; }
      x.putImageData(d, 0, 0);
    }
    return c.toDataURL('image/png').split(',')[1];
  }, [w, h, noise]);
  return Buffer.from(b64, 'base64');
}
const PDF_SMALL = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
const PDF_BIG = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(900000, 32), Buffer.from('\n%%EOF\n')]);
const PDF_FAKE = Buffer.from('this is not a pdf at all');
const file = (name, mimeType, buffer) => ({ name, mimeType, buffer });

async function waitAttach(page, listSel, n) {
  await page.waitForFunction(([sel, n]) => {
    const l = document.querySelector(sel);
    return l && !l.querySelector('.attach-loading') && l.querySelectorAll('.attach-item').length === n;
  }, [listSel, n], { timeout: T });
}
async function lastMine(page) { return fbj(page, () => (JSON.parse(localStorage.getItem('stotramMyMessages') || '[]'))[0] || null); }
async function fillFeedback(page, message) {
  await page.evaluate(() => openFeedback());
  await page.locator('#feedbackOverlay.active').waitFor({ timeout: T });
  await page.locator('#fbName').fill('పరీక్ష');
  await page.locator('#fbMessage').fill(message);
}
const nowTs = (msAgo) => ({ __ts: Date.now() - (msAgo || 0) });
const MIN = 60e3, DAY = 864e5;
const mid = (n) => 'm-' + (1790000000000 + n) + '-' + ('abc' + n).slice(-6).padStart(6, 'x');

/* ============================================================ reader */
async function readerTests(browser) {
  const { context, page, errors } = await openPage(browser, '/', { width: 390, height: 844 });
  const img1 = await pngBuffer(page, 1200, 2400, false);
  const img2 = await pngBuffer(page, 2000, 1500, true);       // noisy: forces the shrink loop
  const img3 = await pngBuffer(page, 800, 600, false);

  step('reader: picker limits (count, size, type) and remove');
  await fillFeedback(page, 'మొదటి సందేశం — స్క్రీన్‌షాట్‌లతో');
  await page.locator('#fbFiles').setInputFiles([file('shot1.png', 'image/png', img1), file('shot2.png', 'image/png', img2), file('info.pdf', 'application/pdf', PDF_SMALL)]);
  await waitAttach(page, '#fbAttachList', 3);
  await page.locator('#fbFiles').setInputFiles([file('shot3.png', 'image/png', img3)]);
  await page.waitForFunction(() => /3 కంటే ఎక్కువ/.test(document.querySelector('#fbAttachList').textContent), null, { timeout: T });
  assert.equal(await page.locator('#fbAttachList .attach-item').count(), 3, 'a 4th file is refused');
  await page.locator('#fbAttachList .attach-item[data-kind="pdf"] .attach-remove').click();
  await waitAttach(page, '#fbAttachList', 2);
  await page.locator('#fbFiles').setInputFiles([file('big.pdf', 'application/pdf', PDF_BIG)]);
  await page.waitForFunction(() => /చాలా పెద్దది/.test(document.querySelector('#fbAttachList').textContent), null, { timeout: T });
  await page.locator('#fbFiles').setInputFiles([file('fake.pdf', 'application/pdf', PDF_FAKE)]);
  await page.waitForFunction(() => /చిత్రం లేదా PDF మాత్రమే/.test(document.querySelector('#fbAttachList').textContent), null, { timeout: T });
  assert.equal(await page.locator('#fbAttachList .attach-item').count(), 2, 'refused files are not added');
  await page.locator('#fbFiles').setInputFiles([file('info.pdf', 'application/pdf', PDF_SMALL)]);
  await waitAttach(page, '#fbAttachList', 3);

  step('reader: anonymous send with 2 images + 1 PDF');
  await page.locator('.fb-submit').click();
  await page.locator('#fbThanks').waitFor({ state: 'visible', timeout: T });
  const sent = await lastMine(page);
  assert.ok(sent && sent.fbid, 'the phone keeps a copy');
  assert.match(sent.claimKey || '', /^[0-9a-f]{32}$/, 'a claim key is kept on the phone');
  const parent = await fbj(page, (id) => window.__fb.get('feedback/' + id), sent.fbid);
  assert.ok(parent, 'the conversation was stored');
  assert.equal(parent.uid, null);
  assert.equal(parent.claimKey, sent.claimKey, 'the stored claim key matches');
  assert.equal(parent.lastFrom, 'user');
  assert.ok(parent.lastAt, 'lastAt set');
  assert.equal(parent.files.length, 3, 'the files are declared on the parent');
  const files = await fbj(page, (id) => window.__fb.dump('feedback/' + id + '/files/'), sent.fbid);
  const fileList = Object.values(files);
  assert.equal(fileList.length, 3, 'three file docs');
  fileList.forEach((f) => {
    assert.ok(f.data.__bytes > 0 && f.data.__bytes <= 800000, 'file size within 800000: ' + f.data.__bytes);
    assert.equal(f.size, f.data.__bytes);
    assert.equal(f.key, sent.claimKey, 'anonymous uploads carry the key');
  });
  const imgs = fileList.filter((f) => f.type !== 'application/pdf');
  assert.equal(imgs.length, 2);
  imgs.forEach((f) => assert.ok(f.type === 'image/webp' || f.type === 'image/jpeg', 'images are re-encoded: ' + f.type));

  step('reader: not-signed-in thread view');
  await page.evaluate(() => closeFeedback());
  await page.evaluate(() => openMessages());
  await page.locator('#messagesOverlay.active').waitFor({ timeout: T });
  await page.locator('#messagesList .message-item[data-fbid="' + sent.fbid + '"] .message-open').click();
  await page.locator('#messagesThread').waitFor({ state: 'visible', timeout: T });
  assert.ok(await page.locator('#threadSignin').isVisible(), 'sign-in note shown');
  assert.match(await page.locator('#threadSigninNote').textContent(), /సైన్ ఇన్ చేయకుండా పంపారు/);
  assert.equal(await page.locator('#threadComposer').isVisible(), false, 'no composer before sign-in');
  await page.keyboard.press('Escape');
  await page.locator('#messagesListView').waitFor({ state: 'visible', timeout: T });
  assert.equal(await page.locator('#messagesThread').isVisible(), false, 'Esc goes back to the list');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#messagesOverlay.active'), null, { timeout: T });

  step('reader: text-only anonymous send goes through the queue');
  await fillFeedback(page, 'రెండో సందేశం — పదాలు మాత్రమే');
  await page.locator('.fb-submit').click();
  await page.locator('#fbThanks').waitFor({ state: 'visible', timeout: T });
  const textOnly = await lastMine(page);
  await page.waitForFunction((id) => !!window.__fb.get('feedback/' + id), textOnly.fbid, { timeout: T });
  const textDoc = await fbj(page, (id) => window.__fb.get('feedback/' + id), textOnly.fbid);
  assert.equal(textDoc.claimKey, textOnly.claimKey);
  assert.equal(textDoc.files, undefined, 'no files list on a text-only message');
  await page.evaluate(() => closeFeedback());

  step('reader: sign in → both messages are claimed');
  await page.evaluate(() => window.__fb.signIn('reader-1', { email: 'reader1@example.com', displayName: 'Reader One' }));
  await page.waitForFunction(([a, b]) => {
    const x = window.__fb.get('feedback/' + a); const y = window.__fb.get('feedback/' + b);
    return x && y && x.uid === 'reader-1' && y.uid === 'reader-1';
  }, [sent.fbid, textOnly.fbid], { timeout: T });
  const claimed = await fbj(page, (id) => window.__fb.get('feedback/' + id), sent.fbid);
  assert.equal(claimed.claimProof, sent.claimKey, 'the claim proves the key');
  assert.equal(claimed.email, 'reader1@example.com');

  step('reader: thumbnails load after sign-in');
  await page.evaluate(() => openMessages());
  await page.locator('#messagesList .message-item[data-fbid="' + sent.fbid + '"] .message-open').click();
  await page.locator('#threadComposer').waitFor({ state: 'visible', timeout: T });
  await page.waitForFunction(() => {
    const imgs = document.querySelectorAll('#threadBody .bubble-files img.attach-thumb');
    return imgs.length === 2 && Array.prototype.every.call(imgs, (i) => /^blob:/.test(i.src) && i.complete && i.naturalWidth > 0);
  }, null, { timeout: T });
  await page.locator('#threadBack').click();
  await page.evaluate(() => closeMessages());

  step('reader: a team reply shows as unread, then clears');
  await page.evaluate(([fbid, admin, m]) => {
    window.__fb.seed('feedback/' + fbid + '/messages/' + m, { from: 'admin', uid: admin, text: 'మీ సందేశం చూశాం. సరిచేశాం.', files: [], createdAt: { __ts: Date.now() } });
    const p = window.__fb.get('feedback/' + fbid);
    const keep = {};
    Object.keys(p).forEach((k) => { keep[k] = /At$/.test(k) && typeof p[k] === 'string' ? { __ts: p[k] } : p[k]; });
    window.__fb.seed('feedback/' + fbid, Object.assign(keep, { status: 'answered', handled: true, lastFrom: 'admin', lastAt: { __ts: Date.now() }, lastAdminAt: { __ts: Date.now() } }));
    // A legacy conversation (reply stored on the parent, before Phase 27).
    window.__fb.seed('feedback/legacy-r1', { type: 'problem', name: 'R', contact: '', message: 'పాత సమస్య', screen: 'home', stotram: '', stotramTitle: '', lang: 'te', device: 'x',
      sentAt: new Date(Date.now() - 5 * 864e5).toISOString(), uid: 'reader-1', email: 'reader1@example.com', handled: true, status: 'answered',
      reply: 'పాత జవాబు', repliedAt: { __ts: Date.now() - 4 * 864e5 }, createdAt: { __ts: Date.now() - 5 * 864e5 } });
  }, [sent.fbid, ADMIN, mid(1)]);
  await page.evaluate(() => openMessages());
  await page.waitForFunction((id) => {
    const row = document.querySelector('#messagesList .message-item[data-fbid="' + id + '"]');
    return row && row.querySelector('.message-unread');
  }, sent.fbid, { timeout: T });
  await page.locator('#messagesList .message-item[data-fbid="' + sent.fbid + '"] .message-open').click();
  await page.waitForFunction(() => document.querySelectorAll('#threadBody .bubble').length >= 2, null, { timeout: T });
  const order = await page.$$eval('#threadBody .bubble', (els) => els.map((e) => e.className.includes('bubble-team') ? 'team' : 'user'));
  assert.deepEqual(order, ['user', 'team'], 'first message, then the team reply');
  await page.locator('#threadBack').click();
  await page.waitForFunction((id) => {
    const row = document.querySelector('#messagesList .message-item[data-fbid="' + id + '"]');
    return row && !row.querySelector('.message-unread');
  }, sent.fbid, { timeout: T });
  await page.locator('#messagesList .message-item[data-fbid="legacy-r1"] .message-open').click();
  await page.waitForFunction(() => /పాత జవాబు/.test((document.querySelector('#threadBody .bubble-team') || {}).textContent || ''), null, { timeout: T });
  await page.locator('#threadBack').click();

  step('reader: follow-up with text + image; composer locked while sending');
  await page.locator('#messagesList .message-item[data-fbid="' + sent.fbid + '"] .message-open').click();
  await page.locator('#threadComposer').waitFor({ state: 'visible', timeout: T });
  await page.locator('#threadText').fill('ఇంకో ప్రశ్న: ఈ పేజీ కూడా చూడండి');
  await page.locator('#threadFiles').setInputFiles([file('more.png', 'image/png', img3)]);
  await waitAttach(page, '#threadAttachList', 1);
  await page.evaluate(() => window.__fb.holdNext('^feedback/[^/]+/messages/', 'set'));
  await page.locator('#threadSend').click();
  await page.waitForFunction(() => window.__fb.heldCount() === 1, null, { timeout: T });
  assert.equal(await page.locator('#threadText').evaluate((e) => e.readOnly), true, 'text locked while sending');
  assert.equal(await page.locator('#threadAttachBtn').isDisabled(), true, 'attach locked while sending');
  await page.evaluate(() => window.__fb.releaseHeld());
  await page.waitForFunction(() => document.querySelector('#threadStatus').textContent.trim() === 'పంపాం', null, { timeout: T });
  const msgs = await fbj(page, (id) => window.__fb.dump('feedback/' + id + '/messages/'), sent.fbid);
  const mine = Object.entries(msgs).filter(([, m]) => m.from === 'user');
  assert.equal(mine.length, 1, 'one follow-up stored');
  const [mPath, m] = mine[0];
  assert.equal(m.uid, 'reader-1');
  assert.equal(m.files.length, 1);
  const mId = mPath.split('/').pop();
  await page.waitForFunction(([id, mId]) => !!window.__fb.get('feedback/' + id + '/files/' + mId + '-0'), [sent.fbid, mId], { timeout: T });
  const after = await fbj(page, (id) => window.__fb.get('feedback/' + id), sent.fbid);
  assert.equal(after.lastFrom, 'user'); assert.equal(after.status, 'new'); assert.equal(after.handled, false);
  assert.equal(await page.locator('#threadText').evaluate((e) => e.readOnly), false, 'composer unlocked after sending');
  assert.equal(await page.locator('#threadText').inputValue(), '', 'sent text cleared');

  step('reader: a slow follow-up is never sent twice');
  await page.locator('#threadText').fill('నెమ్మదిగా వెళ్ళే సందేశం');
  await page.evaluate(() => window.__fb.holdNext('^feedback/[^/]+/messages/', 'set'));
  await page.locator('#threadSend').click();
  await page.waitForFunction(() => /ఇంకా పంపుతోంది/.test(document.querySelector('#threadStatus').textContent), null, { timeout: 25000 });
  // The button is aria-disabled now; press it anyway, as an impatient reader would.
  assert.equal(await page.locator('#threadSend').getAttribute('aria-disabled'), 'true');
  await page.locator('#threadSend').evaluate((b) => b.click());
  await page.waitForTimeout(300);
  assert.equal(await fbj(page, () => window.__fb.heldCount()), 1, 'no second batch while the first is pending');
  await page.evaluate(() => window.__fb.releaseHeld());
  await page.waitForFunction(() => document.querySelector('#threadStatus').textContent.trim() === 'పంపాం', null, { timeout: T });
  const slow = await fbj(page, (id) => Object.values(window.__fb.dump('feedback/' + id + '/messages/')).filter((m) => m.text === 'నెమ్మదిగా వెళ్ళే సందేశం').length, sent.fbid);
  assert.equal(slow, 1, 'the slow follow-up is stored once');
  await page.evaluate(() => closeMessages());

  step('reader: rules refusal, offline and partial upload on a new report');
  await page.evaluate(() => window.__fb.signOut());
  await fillFeedback(page, 'విఫల ప్రయత్నాల పరీక్ష');
  await page.locator('#fbFiles').setInputFiles([file('a.png', 'image/png', img1), file('b.png', 'image/png', img3)]);
  await waitAttach(page, '#fbAttachList', 2);
  await page.evaluate(() => window.__fb.failNext('^feedback/[^/]+$', 'permission-denied', 'set'));
  await page.locator('.fb-submit').click();
  await page.waitForFunction(() => /పంపలేకపోయాం/.test(document.querySelector('#fbError').textContent), null, { timeout: T });
  assert.ok(await page.locator('#fbForm').isVisible(), 'the form stays after a refusal');
  await context.setOffline(true);
  await page.locator('.fb-submit').click();
  await page.waitForFunction(() => /ఇంటర్నెట్ కావాలి/.test(document.querySelector('#fbError').textContent), null, { timeout: T });
  await context.setOffline(false);
  await page.evaluate(() => window.__fb.failNext('/files/first-1$', 'unavailable', 'set'));
  await page.locator('.fb-submit').click();
  await page.waitForFunction(() => /కొన్ని చిత్రాలు పంపలేకపోయాం/.test(document.querySelector('#fbError').textContent), null, { timeout: T });
  await page.locator('.fb-submit').click();                    // unchanged retry: only the missing file
  await page.locator('#fbThanks').waitFor({ state: 'visible', timeout: T });
  const tries = await fbj(page, () => Object.entries(window.__fb.dump('feedback/')).filter(([p, d]) => p.split('/').length === 2 && d.message === 'విఫల ప్రయత్నాల పరీక్ష'));
  assert.equal(tries.length, 1, 'retries never duplicate the conversation');
  const triedId = tries[0][0].split('/')[1];
  assert.deepEqual(await fbj(page, (id) => window.__fb.paths('feedback/' + id + '/files/').map((p) => p.split('/').pop()), triedId), ['first-0', 'first-1']);
  await page.evaluate(() => closeFeedback());

  step('reader: a queued message never goes out under another account');
  await page.evaluate(() => window.__fb.signIn('reader-1', { email: 'reader1@example.com' }));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__fb.failNext('^feedback/[^/]+$', 'unavailable', 'set'));
  await fillFeedback(page, 'ఖాతా మారినప్పుడు');
  await page.locator('.fb-submit').click();
  await page.locator('#fbThanks').waitFor({ state: 'visible', timeout: T });
  const queued = await lastMine(page);
  await page.waitForFunction((id) => (JSON.parse(localStorage.getItem('feedbackQueue_v1') || '[]')).some((p) => p.fbid === id), queued.fbid, { timeout: T });
  await page.evaluate(() => closeFeedback());
  await page.evaluate(() => window.__fb.signIn('reader-2', { email: 'reader2@example.com' }));
  await page.evaluate(() => flushFeedback());
  await page.waitForTimeout(500);
  assert.equal(await fbj(page, (id) => window.__fb.get('feedback/' + id), queued.fbid), null, 'held while another account is signed in');
  assert.ok(await fbj(page, (id) => (JSON.parse(localStorage.getItem('feedbackQueue_v1') || '[]')).some((p) => p.fbid === id), queued.fbid), 'still queued');
  await page.evaluate(() => openMessages());
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#messagesList .message-item[data-fbid="' + queued.fbid + '"]').count(), 0, "another account's copy is hidden");
  await page.evaluate(() => closeMessages());
  await page.evaluate(() => window.__fb.signIn('reader-1', { email: 'reader1@example.com' }));
  await page.evaluate(() => flushFeedback());
  await page.waitForFunction((id) => { const d = window.__fb.get('feedback/' + id); return d && d.uid === 'reader-1'; }, queued.fbid, { timeout: T });

  assert.deepEqual(errors, [], 'no page errors (reader)');
  await context.close();
}

/* ============================================================ admin */
async function adminTests(browser, viewport) {
  const { context, page, errors } = await openPage(browser, '/admin.html', viewport);
  const png = await pngBuffer(page, 640, 480, false);
  await page.evaluate(([admin, pngB64, pdfB64]) => {
    const fb = window.__fb;
    const now = Date.now();
    const base = (extra) => Object.assign({ type: 'problem', name: 'రవి', contact: '', message: 'సందేశం', screen: 'home', stotram: '', stotramTitle: '', lang: 'te', device: 'x', sentAt: new Date(now).toISOString(), uid: null, email: null, handled: false }, extra);
    fb.seed('feedback/legacy1', base({ message: 'పాత సందేశం', uid: 'reader-9', email: 'r9@example.com', status: 'answered', handled: true, reply: 'పాత జవాబు', repliedAt: { __ts: now - 2 * 864e5 }, createdAt: { __ts: now - 3 * 864e5 } }));
    fb.seed('feedback/anon1', base({ message: 'ఫోన్ నంబర్‌తో అతిథి', name: 'రవి', contact: '98765 43210', claimKey: '0123456789abcdef0123456789abcdef', createdAt: { __ts: now - 3600e3 }, lastAt: { __ts: now - 3600e3 }, lastFrom: 'user',
      files: [{ id: 'first-0', name: 'shot.png', type: 'image/png', size: atob(pngB64).length }, { id: 'first-1', name: 'info.pdf', type: 'application/pdf', size: atob(pdfB64).length }] }));
    fb.seed('feedback/anon1/files/first-0', { mid: 'first', n: 0, name: 'shot.png', type: 'image/png', size: atob(pngB64).length, data: { __b64: pngB64 }, from: 'user', createdAt: { __ts: now - 3600e3 } });
    fb.seed('feedback/anon1/files/first-1', { mid: 'first', n: 1, name: 'info.pdf', type: 'application/pdf', size: atob(pdfB64).length, data: { __b64: pdfB64 }, from: 'user', createdAt: { __ts: now - 3600e3 } });
    fb.seed('feedback/anon2', base({ message: 'చిరునామా పరీక్ష', contact: 'victim@x.com?bcc=attacker%40evil.com&body=hi', createdAt: { __ts: now - 2 * 3600e3 }, lastAt: { __ts: now - 2 * 3600e3 }, lastFrom: 'user' }));
    fb.seed('feedback/signed1', base({ message: 'సైన్ ఇన్ చేసిన చదువరి', uid: 'reader-1', email: 'reader1@example.com', status: 'answered', createdAt: { __ts: now - 2 * 864e5 }, lastAt: { __ts: now - 600e3 }, lastFrom: 'user' }));
    fb.seed('feedback/signed1/messages/m-1790000000001-aaaaaa', { from: 'admin', uid: admin, text: 'జవాబు 1', files: [], createdAt: { __ts: now - 864e5 } });
    fb.seed('feedback/signed1/messages/m-1790000000002-bbbbbb', { from: 'user', uid: 'reader-1', text: 'ఇంకా సందేహం', files: [], createdAt: { __ts: now - 600e3 } });
    fb.seed('feedback/big1', base({ message: 'చాలా సందేశాలు', uid: 'reader-3', email: 'r3@example.com', createdAt: { __ts: now - 10 * 864e5 }, lastAt: { __ts: now - 5 * 864e5 }, lastFrom: 'user' }));
    for (let i = 0; i < 205; i++) {
      fb.seed('feedback/big1/messages/m-' + (1780000000000 + i) + '-' + String(i).padStart(6, '0').replace(/[0-9]/g, (d) => 'abcdefghij'[d]), { from: 'user', uid: 'reader-3', text: 'సందేశం #' + i, files: [], createdAt: { __ts: now - 9 * 864e5 + i * 1000 } });
    }
    fb.signIn(admin, { email: 'admin@example.com', displayName: 'Admin' });
  }, [ADMIN, png.toString('base64'), PDF_SMALL.toString('base64')]);
  await page.waitForFunction(() => document.querySelectorAll('#feedbackList .ad-fb-item').length > 0 || /feedback/.test(location.hash), null, { timeout: T });
  await page.evaluate(() => { if (typeof showTab === 'function') showTab('feedback'); });

  step('admin (' + viewport.width + 'px): list order, filters and the waiting badge');
  await page.locator('#fbFilters [data-fbfilter="all"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#feedbackList .ad-fb-item').length === 5, null, { timeout: T });
  const ids = await page.$$eval('#feedbackList .ad-fb-item', (els) => els.map((e) => e.dataset.id));
  assert.deepEqual(ids, ['signed1', 'anon1', 'anon2', 'legacy1', 'big1'], 'latest activity first: ' + ids.join(','));
  await page.locator('#fbFilters [data-fbfilter="waiting"]').click();
  const waiting = await page.$$eval('#feedbackList .ad-fb-item', (els) => els.map((e) => e.dataset.id).sort());
  assert.deepEqual(waiting, ['anon1', 'anon2', 'big1', 'signed1'], 'waiting = the reader wrote last and not closed');
  assert.match(await page.locator('#fbNavBadge').textContent(), /^4/, 'nav badge counts waiting conversations');
  await page.locator('#fbFilters [data-fbfilter="all"]').click();

  const card = (id) => page.locator('#feedbackList .ad-fb-item[data-id="' + id + '"]');
  step('admin: open a conversation; thumbnail viewer; PDF chip');
  await card('anon1').locator('details.ad-convo > summary').click();
  await page.waitForFunction(() => {
    const c = document.querySelector('#feedbackList .ad-fb-item[data-id="anon1"]');
    const img = c && c.querySelector('.ad-thread img.attach-thumb');
    return img && /^blob:/.test(img.src) && img.complete && img.naturalWidth > 0;
  }, null, { timeout: T });
  assert.equal(await card('anon1').locator('.ad-thread .attach-item[data-kind="pdf"]').count(), 1, 'PDF chip shown');
  const thumbBtn = card('anon1').locator('.ad-thread .attach-item[data-kind="image"] button').first();
  await thumbBtn.click();
  await page.locator('.file-viewer:not([hidden])').waitFor({ timeout: T });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => { const v = document.querySelector('.file-viewer'); return !v || v.hidden; }, null, { timeout: T });
  assert.ok(await thumbBtn.evaluate((b) => b === document.activeElement), 'focus returns to the thumbnail');

  step('admin: reply with text + image');
  await card('anon1').locator('textarea[data-reply]').fill('మీ స్క్రీన్‌షాట్ చూశాం. సరిచేశాం.');
  await card('anon1').locator('input.ad-file-input').setInputFiles([file('fix.png', 'image/png', png)]);
  await waitAttach(page, '#feedbackList .ad-fb-item[data-id="anon1"] [data-attach-list]', 1);
  await card('anon1').locator('[data-act="reply"]').click();
  await page.waitForFunction(() => {
    const msgs = Object.entries(window.__fb.dump('feedback/anon1/messages/')).filter(([, m]) => m.from === 'admin');
    if (msgs.length !== 1) return false;
    return !!window.__fb.get('feedback/anon1/files/' + msgs[0][0].split('/').pop() + '-0');
  }, null, { timeout: T });
  const p1 = await fbj(page, () => window.__fb.get('feedback/anon1'));
  assert.equal(p1.status, 'answered'); assert.equal(p1.handled, true); assert.equal(p1.lastFrom, 'admin'); assert.ok(p1.lastAdminAt);
  assert.equal(p1.reply, undefined, 'the legacy reply field is not written any more');

  step('admin: notify links');
  await page.waitForFunction(() => document.querySelector('#feedbackList .ad-fb-item[data-id="anon1"] a[data-notify="whatsapp"]'), null, { timeout: T });
  const wa = await card('anon1').locator('a[data-notify="whatsapp"]').getAttribute('href');
  const sms = await card('anon1').locator('a[data-notify="sms"]').getAttribute('href');
  assert.ok(wa.startsWith('https://wa.me/919876543210?text='), wa);
  assert.ok(sms.startsWith('sms:+919876543210?&body='), sms);
  assert.match(decodeURIComponent(wa.split('?text=')[1]), /సరిచేశాం/, 'a guest notice carries the reply text');
  assert.equal(await card('anon1').locator('a[data-notify="email"]').count(), 0, 'no email link for a phone-only guest');
  await card('signed1').locator('details.ad-convo > summary').click();
  await page.waitForFunction(() => document.querySelectorAll('#feedbackList .ad-fb-item[data-id="signed1"] .ad-thread li.bubble').length === 3, null, { timeout: T });
  const sOrder = await card('signed1').locator('.ad-thread li.bubble').evaluateAll((els) => els.map((e) => e.classList.contains('bubble-team') ? 'team' : 'user'));
  assert.deepEqual(sOrder, ['user', 'team', 'user']);
  const mail = await card('signed1').locator('a[data-notify="email"]').getAttribute('href');
  assert.ok(mail.startsWith('mailto:reader1@example.com?subject='), mail);
  const mailBody = decodeURIComponent(mail.split('body=')[1]);
  assert.match(mailBody, /నా సందేశాలు/, 'a signed-in notice points to My messages');
  assert.doesNotMatch(mailBody, /జవాబు 1/, 'a signed-in notice does not carry the reply text');
  const contactHref = await card('anon2').locator('.ad-fb-meta a[href^="mailto:"]').first().getAttribute('href');
  assert.ok(!/\?bcc=|&body=/.test(contactHref), 'a typed contact cannot add mail headers: ' + contactHref);

  step('admin: the 200-message cap shows the newest and a hint');
  await card('big1').locator('details.ad-convo > summary').click();
  await page.waitForFunction(() => document.querySelectorAll('#feedbackList .ad-fb-item[data-id="big1"] .ad-thread li.bubble').length >= 200, null, { timeout: T });
  const bigText = await card('big1').locator('.ad-thread').textContent();
  assert.match(bigText, /సందేశం #204/, 'newest shown');
  assert.doesNotMatch(bigText, /సందేశం #4(?!\d)/, 'oldest left out');
  assert.match(bigText, /తాజా 200/, 'the hint says only the newest 200 are shown');

  step('admin: delete removes every message and file, then the conversation');
  await card('anon1').locator('[data-act="delete"]').click();
  await page.locator('.ad-dialog [data-yes]').click();
  await page.waitForFunction(() => window.__fb.paths('feedback/anon1').length === 0, null, { timeout: T });
  await page.waitForFunction(() => !document.querySelector('#feedbackList .ad-fb-item[data-id="anon1"]'), null, { timeout: T });

  assert.deepEqual(errors, [], 'no page errors (admin ' + viewport.width + 'px)');
  await context.close();
}

(async () => {
  if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('dist/client/index.html missing; run npm run build first');
  assert.ok(ADMIN, 'ADMIN_UID found in site-config.js');
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : { channel: 'chrome' }) });
  try {
    await readerTests(browser);
    await adminTests(browser, { width: 1280, height: 900 });
    await adminTests(browser, { width: 390, height: 844 });
    console.log('PASS: conversations — attachments (limits, shrink, PDF checks), anonymous send + claim on sign-in, unread replies, legacy replies, follow-ups (locked composer, no double send on a slow network), refusal/offline/partial retries without duplicates, account-safe queue; admin list order, waiting filter + badge, thread, viewer, reply with picture, notify links, mail-header safety, 200-message cap, delete cascade.');
  } catch (e) {
    console.error('FAILED at step: ' + stepName);
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
