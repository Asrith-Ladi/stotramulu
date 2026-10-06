// Version stamps (tools/vite-version-stamp.mjs, Phase 29), without a full build:
// runs the plugin's generateBundle on a made-up bundle and a temporary public/.
//  - a local <script src> gets ?v=<10 hex of its file's SHA-256>; scripts from
//    other sites, inline scripts, comments and files Vite built are left alone;
//  - the build id goes into the meta tag and /version.json, is the same for the
//    same files, and changes when any public file or page changes;
//  - a script naming a missing file stops the build.
// Also checks that index.html keeps the exact "dev" meta tag the plugin
// replaces, and loads build-check.js last.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const META = '<meta name="stotram-build" content="dev">';

function writeFile(dir, rel, text) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
}

(async () => {
  const { default: versionStamp } = await import('./vite-version-stamp.mjs');
  const BUILT = '2026-10-02T08:30:00.000Z';

  function run(publicDir, pages) {
    const plugin = versionStamp({ now: () => new Date(BUILT) });
    plugin.configResolved({ publicDir });
    const bundle = { 'assets/main-abc.js': { type: 'chunk', fileName: 'assets/main-abc.js' } };
    for (const [fileName, source] of Object.entries(pages)) bundle[fileName] = { type: 'asset', fileName, source };
    const emitted = [];
    const ctx = { error(msg) { throw new Error(msg); }, emitFile(f) { emitted.push(f); } };
    plugin.generateBundle.handler.call(ctx, {}, bundle);
    const out = {};
    for (const name of Object.keys(pages)) out[name] = bundle[name].source;
    const version = emitted.find((f) => f.fileName === 'version.json');
    return { out, version: version ? JSON.parse(version.source) : null, emitted };
  }

  // The plugin only touches production builds of the browser side.
  const plugin = versionStamp();
  assert.equal(plugin.apply, 'build');
  assert.equal(plugin.applyToEnvironment({ name: 'client' }), true);
  assert.equal(plugin.applyToEnvironment({ name: 'stotramulu' }), false, 'not the Worker build');
  assert.equal(plugin.generateBundle.order, 'post', 'runs after Vite has written the pages');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stotram-stamp-'));
  try {
    writeFile(dir, 'assets/app.js', 'app one');
    writeFile(dir, 'data/stotras/vishnu.js', 'vishnu');
    writeFile(dir, 'icons.svg', '<svg/>');
    const page = '<!DOCTYPE html><head>' + META + '</head><body>\n' +
      '<!-- Add a new stotram = add a <script> below. -->\n' +
      '<script src="/data/stotras/vishnu.js"></script>\n' +
      '<script async src="/assets/app.js"></script>\n' +
      '<script src="https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js"></script>\n' +
      '<script src="//cdn.example.com/x.js"></script>\n' +
      '<script>window.x = 1;</script>\n' +
      '<script type="module" crossorigin src="/assets/main-abc.js"></script>\n' +
      '</body>';
    const admin = '<!DOCTYPE html><body><script src="/assets/app.js"></script></body>';

    const a = run(dir, { 'index.html': page, 'admin.html': admin });
    const html = a.out['index.html'];
    assert.ok(html.includes('src="/assets/app.js?v=' + sha('app one').slice(0, 10) + '"'), 'a local script is stamped with its own hash');
    assert.ok(html.includes('src="/data/stotras/vishnu.js?v=' + sha('vishnu').slice(0, 10) + '"'));
    assert.ok(html.includes('<script async src="/assets/app.js?v='), 'attributes before src are kept');
    assert.ok(html.includes('src="https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js"'), 'another site: untouched');
    assert.ok(html.includes('src="//cdn.example.com/x.js"'), 'protocol-relative: untouched');
    assert.ok(html.includes('<script>window.x = 1;</script>'), 'inline script: untouched');
    assert.ok(html.includes('add a <script> below. -->'), 'comment: untouched');
    assert.ok(html.includes('src="/assets/main-abc.js"'), 'a file Vite built keeps its name');
    assert.equal(a.out['admin.html'], '<!DOCTYPE html><body><script src="/assets/app.js?v=' + sha('app one').slice(0, 10) + '"></script></body>', 'a page without the meta tag is only stamped');

    assert.ok(a.version && /^[0-9a-f]{12}$/.test(a.version.build), 'version.json has a 12-digit id');
    assert.equal(a.version.built, BUILT);
    assert.ok(html.includes('<meta name="stotram-build" content="' + a.version.build + '" data-built="' + BUILT + '">'), 'the page carries the same id');
    assert.ok(!html.includes(META), 'the dev placeholder is gone');
    assert.equal(a.emitted.length, 1);

    // The same files → the same id (a docs-only deploy reloads nobody).
    assert.equal(run(dir, { 'index.html': page, 'admin.html': admin }).version.build, a.version.build, 'same files, same id');

    // A file no page loads (the icon sprite) still changes the id, not the stamps.
    writeFile(dir, 'icons.svg', '<svg><symbol id="new"/></svg>');
    const b = run(dir, { 'index.html': page, 'admin.html': admin });
    assert.notEqual(b.version.build, a.version.build, 'a changed icon sprite changes the id');
    assert.equal(b.out['admin.html'], a.out['admin.html'], 'and no script stamp');

    // A changed script changes only its own stamp.
    writeFile(dir, 'assets/app.js', 'app two');
    const c = run(dir, { 'index.html': page, 'admin.html': admin });
    assert.ok(c.out['index.html'].includes('/assets/app.js?v=' + sha('app two').slice(0, 10)));
    assert.ok(c.out['index.html'].includes('/data/stotras/vishnu.js?v=' + sha('vishnu').slice(0, 10)), 'the unchanged file keeps its stamp');
    assert.notEqual(c.version.build, b.version.build);

    // A changed page (same files) changes the id too.
    assert.notEqual(run(dir, { 'index.html': page.replace('<body>', '<body class="x">'), 'admin.html': admin }).version.build, c.version.build);

    // A script naming a file that does not exist stops the build.
    assert.throws(() => run(dir, { 'index.html': page.replace('/assets/app.js', '/assets/gone.js') }), /index\.html loads \/assets\/gone\.js/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // index.html keeps the placeholder the plugin replaces, once, and loads
  // build-check.js after every other site script.
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.equal(index.split(META).length - 1, 1, 'index.html has the build meta tag exactly as the plugin expects');
  const local = [...index.matchAll(/<script\b[^>]*\ssrc="(\/(?!\/)[^"]+)"/g)].map((m) => m[1]);
  assert.equal(local[local.length - 1], '/assets/build-check.js', 'build-check.js is the last site script');

  console.log('PASS: version stamps (local scripts stamped by content, other scripts untouched, same files → same id, any change → new id, missing file stops the build, meta + version.json agree).');
})().catch((e) => { console.error(e); process.exit(1); });
