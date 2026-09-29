// Renders the built site (dist/client) in the locally installed Google Chrome and
// writes screenshots plus a report (JS errors, overflow, layout probes) to
// docs/ui-reviews/current/. Files are served straight from disk through request
// interception, so no local server is started.
//
//   npm run shots                  every scene
//   npm run shots -- home reader   only scenes whose name contains one of the words
const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', 'dist', 'client');
const OUT = path.resolve(__dirname, '..', 'docs', 'ui-reviews', 'current');
const PREVIEW = path.resolve(__dirname, '..', 'docs', 'redesign-preview.html');
const ORIGIN = 'http://stotram.local';
const TYPES = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png',
};
// Playwright only reads the size from `viewport`; top-level width/height are ignored.
const VIEWPORTS = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  small: { viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  // A phone held sideways: the tabs move into a second header row.
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

// A realistic returning reader: history, favourites, a logged day, a vow due today,
// two sent reports, and an older "updates seen" marker so the new-updates dot shows.
function seededStorage() {
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  const now = today.getTime();
  return {
    stotramReaderPositions: JSON.stringify({
      positions: { vishnu: 42, lalitha: 12, lingashtakam: 3 },
      recent: { type: 'vishnu', index: 42, updatedAt: now },
      history: [
        { type: 'vishnu', index: 42, updatedAt: now },
        { type: 'lalitha', index: 12, updatedAt: now - 3600e3 },
        { type: 'lingashtakam', index: 3, updatedAt: now - 7200e3 },
      ],
    }),
    stotramFavorites: JSON.stringify(['vishnu', 'hanuman108', 'saiharati']),
    poojaTrack_v1: JSON.stringify({
      days: {
        [ymd(today)]: { pradakshina: 11, japa: [{ name: 'శ్రీ విష్ణు సహస్రనామం', count: 1, target: 3 }], parayana: { vishnu: 1 } },
        [ymd(yesterday)]: { pradakshina: 21, japa: [], parayana: {} },
      },
      mokkulu: [
        { id: 'm1', text: 'తిరుమల 11 ప్రదక్షిణలు', reminderDate: ymd(today), done: false },
        { id: 'm2', text: 'శ్రావణ శుక్రవారం లక్ష్మీ పూజ', reminderDate: '', done: true },
      ],
      reading: { vishnu: [0, 1, 2] },
      japamala: { total: 243 },
    }),
    stotramUpdatesSeen: '2026-01-01',
    stotramMyMessages: JSON.stringify([
      { fbid: 'fb-seed-1', type: 'correction', message: 'లింగాష్టకం 3వ శ్లోకంలో అక్షర తప్పు ఉంది.', stotramTitle: 'శ్రీ లింగాష్టకం', at: new Date(now - 86400e3 * 3).toISOString() },
      { fbid: 'fb-seed-2', type: 'suggestion', message: 'జపమాలలో ధ్వని తగ్గించే ఎంపిక కావాలి.', stotramTitle: '', at: new Date(now - 86400e3).toISOString() },
    ]),
  };
}

const call = (fn, ...args) => (page) => page.evaluate(([f, a]) => {
  if (typeof window[f] !== 'function') return false;
  window[f](...a);
  return true;
}, [fn, args]);
const clickFirstVisible = (selector) => async (page) => {
  const target = page.locator(selector + ':visible').first();
  if (!(await target.count())) return false;
  await target.click();
  return true;
};

const PH = ['phone'], PD = ['phone', 'desktop'], ALL = ['phone', 'small', 'desktop'];
const SCENES = [
  { name: 'home', url: '/#home', views: ALL, maxScreens: 3 },
  { name: 'home-seeded', url: '/#home', views: PD, seed: true, maxScreens: 3 },
  // One screen only: a taller capture window would leave the short-screen layout.
  { name: 'home-landscape', url: '/#home', views: ['landscape'], seed: true },
  { name: 'reader-landscape', url: '/?stotram=vishnu', views: ['landscape'] },
  { name: 'library', url: '/#library', views: PD, maxScreens: 3 },
  { name: 'library-category', url: '/#library', views: PH, run: clickFirstVisible('.category-filters button:nth-child(3)'), maxScreens: 2 },
  { name: 'saved-empty', url: '/#saved', views: PH },
  { name: 'saved', url: '/#saved', views: PD, seed: true },
  { name: 'practice', url: '/#practice', views: PD, seed: true, maxScreens: 2 },
  { name: 'reader', url: '/?stotram=vishnu', views: ALL, maxScreens: 2 },
  { name: 'reader-48px', url: '/?stotram=lingashtakam', views: ['small'], storage: { readerFontSize: '48' }, maxScreens: 2 },
  { name: 'reader-options', url: '/?stotram=vishnu', views: PH, run: clickFirstVisible('.reader-options summary'), maxScreens: 2 },
  { name: 'reader-search', url: '/?stotram=vishnu', views: PH, run: async (page) => {
      const input = page.locator('#readerSearchInput');
      if (!(await input.count())) return false;
      await input.fill('విష్ణు');
      return true;
    }, maxScreens: 2 },
  { name: 'reader-meanings', url: '/?stotram=lalitha', views: PH, storage: { showMeanings: '1' }, maxScreens: 2 },
  { name: 'reader-namavali', url: '/?stotram=shiva108', views: PH, maxScreens: 2 },
  { name: 'japamala-flow', url: '/', views: PD, storage: { jm_mode_v2: 'flow' }, seed: true, run: call('openJapamala'), maxScreens: 2 },
  { name: 'japamala-full', url: '/', views: PH, storage: { jm_mode_v2: 'full' }, run: call('openJapamala'), maxScreens: 2 },
  { name: 'japamala-3d', url: '/', views: PH, storage: { jm_mode_v2: 'rudraksha3d' }, run: call('openJapamala'), maxScreens: 2, probe: 'canvas' },
  { name: 'japamala-info', url: '/', views: PH, run: async (page) => {
      await call('openJapamala')(page);
      await page.waitForTimeout(300);
      const before = await page.locator('#jmCount').textContent().catch(() => null);
      const clicked = await clickFirstVisible('#japamalaPage [data-info]')(page);
      await page.waitForTimeout(300);
      const after = await page.locator('#jmCount').textContent().catch(() => null);
      page.__probe = { jmCountBefore: before, jmCountAfter: after, infoButtonFound: clicked };
      return clicked;
    } },
  { name: 'track', url: '/', views: ALL, seed: true, run: call('openTrack'), maxScreens: 2, probe: 'months' },
  { name: 'track-day', url: '/', views: PH, seed: true, run: async (page) => {
      await call('openTrack')(page);
      return page.evaluate(() => typeof openDay === 'function' && typeof todayStr === 'function' ? (openDay(todayStr()), true) : false);
    } },
  { name: 'search', url: '/', views: PD, run: async (page) => {
      if (!(await call('openSearch')(page))) return false;
      await page.locator('#searchInput').fill('లలిత');
      return true;
    } },
  { name: 'account', url: '/', views: PD, seed: true, run: call('openAccount') },
  { name: 'feedback', url: '/', views: PH, run: call('openFeedback') },
  { name: 'updates', url: '/', views: PD, run: call('openUpdates') },
  { name: 'messages', url: '/', views: PH, seed: true, run: call('openMessages') },
  { name: 'info', url: '/#home', views: PD, run: clickFirstVisible('[data-info]') },
  { name: 'confirm', url: '/', views: PH, run: (page) => page.evaluate(() => {
      if (typeof siteConfirm !== 'function') return false;
      siteConfirm('జపమాల లెక్క 0కి తిరిగి సెట్ చేయాలా?\n\nReset japamala to 0?', { okLabel: 'రీసెట్ / Reset', danger: true });
      return true;
    }) },
  { name: 'scroll-lock', url: '/#library', views: PH, run: async (page) => {
      if (!(await call('openSearch')(page))) return false;
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(300);
      page.__probe = { scrollYWhileOverlayOpen: await page.evaluate(() => scrollY) };
      return true;
    } },
  { name: 'motion', url: '/#home', views: PH, motion: true, settle: 1500 },
  { name: 'preview', url: '/__preview.html', views: ['desktop'], maxScreens: 4 },
];

function serve(route) {
  const url = new URL(route.request().url());
  if (url.origin !== ORIGIN) {
    if (/googletagmanager|google-analytics/.test(url.hostname)) return route.abort();
    return route.continue();
  }
  if (url.pathname === '/__preview.html') {
    return fs.existsSync(PREVIEW)
      ? route.fulfill({ status: 200, contentType: 'text/html', body: fs.readFileSync(PREVIEW) })
      : route.fulfill({ status: 404, body: '' });
  }
  let file = decodeURIComponent(url.pathname);
  if (file === '/' || file === '') file = '/index.html';
  const abs = path.join(ROOT, file);
  if (!abs.startsWith(ROOT) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    return route.fulfill({ status: 404, body: '' });
  }
  return route.fulfill({ status: 200, contentType: TYPES[path.extname(abs)] || 'application/octet-stream', body: fs.readFileSync(abs) });
}

async function probePage(page, width, kind) {
  return page.evaluate(([vw, kind]) => {
    const describe = (el) => (el.id ? '#' + el.id : el.tagName.toLowerCase()) +
      (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '');
    const overflow = [...document.querySelectorAll('body *')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.right > vw + 1 || r.left < -1);
      })
      .filter((el) => !el.closest('[aria-hidden="true"]'))
      .slice(0, 15)
      .map((el) => { const r = el.getBoundingClientRect(); return `${describe(el)} [${Math.round(r.left)}..${Math.round(r.right)}]`; });
    const fonts = [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family))];
    const out = { innerWidth, scrollWidth: document.documentElement.scrollWidth, docHeight: document.documentElement.scrollHeight, overflow, fontsLoaded: fonts };
    if (kind === 'canvas') {
      const c = document.getElementById('jmRudrakshaCanvas');
      if (c) { const r = c.getBoundingClientRect(); out.canvas = { cssWidth: Math.round(r.width), cssHeight: Math.round(r.height), bufferWidth: c.width, bufferHeight: c.height, hidden: c.hidden }; }
      const fb = document.getElementById('jmRudrakshaFallback');
      out.fallbackVisible = !!fb && !fb.hidden && fb.getBoundingClientRect().height > 0;
    }
    if (kind === 'months') {
      const strip = document.getElementById('monthStrip');
      const card = strip && strip.querySelector('.month-card');
      if (strip && card) out.monthStrip = { clientWidth: strip.clientWidth, cardWidth: card.offsetWidth, scrollLeft: Math.round(strip.scrollLeft), index: Math.round(strip.scrollLeft / Math.max(1, strip.clientWidth)), label: (document.getElementById('monthLabel') || {}).textContent };
    }
    return out;
  }, [width, kind || '']);
}

(async () => {
  if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
    console.error('dist/client/index.html not found. Run `npm run build` first (`npm run shots` does this for you).');
    process.exit(1);
  }
  const only = process.argv.slice(2).map((s) => s.toLowerCase());
  const scenes = only.length ? SCENES.filter((s) => only.some((o) => s.name.includes(o))) : SCENES;
  fs.mkdirSync(OUT, { recursive: true });
  if (!only.length) for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT, f));

  const browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : { channel: 'chrome' }),
  });
  const report = [];
  try {
    for (const scene of scenes) {
      for (const tag of scene.views || PD) {
        const vp = VIEWPORTS[tag];
        const file = `${scene.name}-${tag}.png`;
        const entry = { scene: scene.name, viewport: tag, file, ran: false, errors: [] };
        const context = await browser.newContext({ ...vp, reducedMotion: scene.motion ? 'no-preference' : 'reduce', locale: 'te-IN' });
        try {
          const storage = { ...(scene.seed ? seededStorage() : {}), ...(scene.storage || {}) };
          if (Object.keys(storage).length) {
            await context.addInitScript((items) => {
              if (sessionStorage.getItem('__seeded')) return;
              for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v);
              sessionStorage.setItem('__seeded', '1');
            }, storage);
          }
          const page = await context.newPage();
          page.on('pageerror', (e) => entry.errors.push('pageerror: ' + e.message));
          page.on('console', (m) => {
            if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) entry.errors.push('console: ' + m.text());
          });
          await page.route('**/*', serve);
          await page.goto(ORIGIN + scene.url, { waitUntil: 'load' });
          await page.evaluate(() => document.fonts && document.fonts.ready);
          await page.waitForTimeout(500);
          entry.ran = scene.run ? (await scene.run(page)) !== false : true;
          await page.waitForTimeout(scene.settle || 700);
          if (scene.probe === 'months') {
            const prev = page.locator('#prevMonthBtn');
            if (await prev.count()) { await prev.click(); await page.waitForTimeout(700); }
          }
          entry.probe = { ...(await probePage(page, vp.viewport.width, scene.probe)), ...(page.__probe || {}) };
          // Grow the window to the capture height instead of using fullPage: a fullPage
          // capture resets nested horizontal scrollers (the calendar strip) and pins the
          // tab bar mid-image. A tall viewport renders exactly like a long phone screen.
          const height = Math.min(entry.probe.docHeight, vp.viewport.height * (scene.maxScreens || 1));
          if (height > vp.viewport.height) {
            await page.setViewportSize({ width: vp.viewport.width, height });
            await page.waitForTimeout(400);
          }
          await page.screenshot({ path: path.join(OUT, file) });
        } catch (e) {
          entry.errors.push('harness: ' + e.message.split('\n')[0]);
        } finally {
          await context.close();
        }
        report.push(entry);
        const flags = [entry.errors.length && `${entry.errors.length} errors`, entry.probe && entry.probe.overflow.length && `overflow ${entry.probe.overflow.length}`].filter(Boolean).join(', ');
        console.log(`${entry.ran ? '✓' : '·'} ${file}${flags ? '  (' + flags + ')' : ''}`);
      }
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\nSaved ${report.length} screenshots + report.json to ${path.relative(process.cwd(), OUT)}/`);
})().catch((e) => { console.error(e); process.exit(1); });
