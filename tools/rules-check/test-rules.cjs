'use strict';
// Checks docs/firestore.rules.proposed with ./rules.cjs, a small stand-alone
// evaluator of the Firestore rules language (not Google's engine, so the live
// site tests at the bottom of the rules file are still needed after publishing).
// Run with: npm run rules:check
const fs = require('fs');
const path = require('path');
const { lex, Parser, evaluate, TS } = require('./rules.cjs');

const FILE = process.env.RULES || path.resolve(__dirname, '..', '..', 'docs', 'firestore.rules.proposed');
const raw = fs.readFileSync(FILE, 'utf8');
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL  ' + msg); } else console.log('ok    ' + msg); };

// ---------- textual checks ----------
const lines = raw.split('\n');
const iv = lines.findIndex((l) => l.startsWith("rules_version = '2';"));
ok(iv >= 0 && lines[iv + 1].startsWith('service cloud.firestore {'), "rules_version = '2'; is directly above service cloud.firestore");
ok(!raw.includes('\r'), 'LF line endings kept (the file had no CRLF)');
ok(!/[^\x00-\x7F]/.test(raw), 'ASCII only');
const codeOnly = raw.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
ok(!/(&&|\|\|)\s*[;)\]}]/.test(codeOnly), 'no && / || right before ; ) ] }');
ok(!/[([{,]\s*(&&|\|\|)/.test(codeOnly), 'no && / || right after ( [ { ,');
ok(!/\?/.test(codeOnly.replace(/'[^']*'/g, "''")), 'no ternary operator used');

// ---------- parse ----------
const rules = new Parser(lex(raw)).file();
ok(rules.ver === '2' && rules.name === 'cloud.firestore', 'parsed: version 2, service cloud.firestore');

// ---------- static scope check ----------
const BUILTIN_FN = new Set(['get', 'exists', 'getAfter', 'existsAfter', 'string', 'int', 'float', 'debug']);
const GLOBAL_VARS = new Set(['request', 'resource', 'duration', 'math', 'timestamp', 'latlng', 'hashing']);
let staticErrs = [];
let letCounts = [];
function walkExpr(e, vars, fns, where) {
  if (!e || typeof e !== 'object') return;
  if (e.k === 'var' && !vars.has(e.n) && !GLOBAL_VARS.has(e.n)) staticErrs.push(where + ': unbound ' + e.n);
  if (e.k === 'call' && !fns.has(e.n) && !BUILTIN_FN.has(e.n)) staticErrs.push(where + ': unknown function ' + e.n);
  for (const k of Object.keys(e)) {
    const v = e[k];
    if (Array.isArray(v)) v.forEach((x) => { if (x && x.expr) walkExpr(x.expr, vars, fns, where); else walkExpr(x, vars, fns, where); });
    else if (v && typeof v === 'object' && v.k) walkExpr(v, vars, fns, where);
  }
}
function walkBlock(items, vars, fnsOuter) {
  const fns = new Set(fnsOuter);
  items.filter((i) => i.kind === 'function').forEach((f) => fns.add(f.name));
  for (const it of items) {
    if (it.kind === 'function') {
      const v = new Set([...vars, ...it.params]);
      letCounts.push([it.name, it.lets.length, it.params.length]);
      for (const l of it.lets) { walkExpr(l.e, v, fns, 'fn ' + it.name); v.add(l.n); }
      walkExpr(it.ret, v, fns, 'fn ' + it.name);
    } else if (it.kind === 'allow') walkExpr(it.cond, vars, fns, 'allow line ' + it.line);
    else if (it.kind === 'match') {
      const v = new Set(vars); it.path.forEach((s) => { if (s.wild) v.add(s.wild); });
      walkBlock(it.body, v, fns);
    }
  }
}
walkBlock(rules.body, new Set(), new Set());
ok(staticErrs.length === 0, 'every variable and function is in scope' + (staticErrs.length ? ' -> ' + staticErrs.join('; ') : ''));
ok(letCounts.every(([, l, p]) => l <= 10 && p <= 7), 'every function: <= 10 let bindings, <= 7 params');

// ---------- scenarios ----------
const ADMIN = '0d3PPSYaFncy1tY2oUGtBMGMFwu2';
const NOW = Date.UTC(2026, 8, 30, 12, 0, 0);
const MIN = 60e3, DAY = 864e5;
const ts = (ms) => TS(ms);
const U_A = { uid: 'userA', token: { email: 'a@example.com' } };
const U_B = { uid: 'userB', token: { email: 'b@example.com' } };
const U_ADMIN = { uid: ADMIN, token: { email: 'admin@example.com' } };
const KEY = '0123456789abcdef0123456789abcdef';
const MID = 'm-1790000000000-a1b2c3';
const MID2 = 'm-1790000000001-zz99yy';
const bytes = (n) => new Uint8Array(n);
const meta = (mid, n) => Array.from({ length: n }, (_, i) => ({ id: mid + '-' + i, name: 'shot' + i + '.webp', type: 'image/webp', size: 1000 }));

// 14-field doc exactly as the live cloud.js builds it
function oldDoc(uid, email, extra) {
  return Object.assign({ type: 'problem', name: 'Ravi', contact: '9876543210', message: 'The page is slow', screen: 'reader', stotram: 'vishnu', stotramTitle: 'Vishnu Sahasranamam', lang: 'te', device: 'Android Chrome', sentAt: '2026-09-30T11:59:59.000Z', uid: uid, email: email, handled: false, createdAt: ts(NOW) }, extra || {});
}
function run(desc, expect, req, maxGets) {
  const r = evaluate(rules, req.db || {}, { method: req.method, path: req.path, auth: req.auth || null, data: req.data, now: req.now || NOW });
  const good = r.allowed === expect && (maxGets === undefined || r.gets <= maxGets);
  if (!good) { fails++; console.log('FAIL  ' + desc + '  (got ' + (r.allowed ? 'ALLOW' : 'DENY') + ', gets=' + r.gets + ', errors=' + JSON.stringify(r.errors) + ')'); }
  else console.log('ok    ' + desc + '  [' + (r.allowed ? 'allow' : 'deny') + ', gets ' + r.gets + ']');
  return r;
}
// helper: update = merge patch onto existing
const merged = (db, path, patch) => Object.assign({}, db[path], patch);

console.log('\n--- feedback create ---');
run('old site: anonymous 14-field create', true, { method: 'create', path: '/feedback/fb-1', data: oldDoc(null, null) }, 0);
run('old site: signed-in 14-field create', true, { method: 'create', path: '/feedback/fb-1', auth: U_A, data: oldDoc('userA', 'a@example.com') }, 0);
run('new cloud.js: anonymous create + lastAt/lastFrom/claimKey/files(2)', true, { method: 'create', path: '/feedback/fb-1', data: oldDoc(null, null, { lastAt: ts(NOW), lastFrom: 'user', claimKey: KEY, files: meta('first', 2) }) }, 0);
run('new cloud.js: anonymous create, no attachments (lastAt/lastFrom/claimKey)', true, { method: 'create', path: '/feedback/fb-1', data: oldDoc(null, null, { lastAt: ts(NOW), lastFrom: 'user', claimKey: KEY }) });
run('new cloud.js: signed-in create + files(3), no claimKey', true, { method: 'create', path: '/feedback/fb-1', auth: U_A, data: oldDoc('userA', 'a@example.com', { lastAt: ts(NOW), lastFrom: 'user', files: meta('first', 3) }) });
run('create: 64-char hex claimKey', true, { method: 'create', path: '/feedback/fb-1', data: oldDoc(null, null, { claimKey: KEY + KEY }) });
run('create: claimKey with uid set -> denied', false, { method: 'create', path: '/feedback/fb-1', auth: U_A, data: oldDoc('userA', 'a@example.com', { claimKey: KEY }) });
run('create: claimKey 31 chars -> denied', false, { method: 'create', path: '/feedback/fb-1', data: oldDoc(null, null, { claimKey: KEY.slice(1) }) });
run('create: claimKey 65 chars -> denied', false, { method: 'create', path: '/feedback/fb-1', data: oldDoc(null, null, { claimKey: KEY + KEY + 'a' }) });
run('create: claimKey non-hex -> denied', false, { method: 'create', path: '/feedback/fb-1', data: oldDoc(null, null, { claimKey: KEY.slice(1) + 'g' }) });
run('create: files 4 entries -> denied', false, { method: 'create', path: '/feedback/fb-1', data: oldDoc(null, null, { files: meta('first', 4) }) });
run('create: files not a list -> denied', false, { method: 'create', path: '/feedback/fb-1', data: oldDoc(null, null, { files: 'x' }) });
run('create: lastFrom admin -> denied', false, { method: 'create', path: '/feedback/fb-1', data: oldDoc(null, null, { lastFrom: 'admin' }) });
run('create: lastAt not server time -> denied', false, { method: 'create', path: '/feedback/fb-1', data: oldDoc(null, null, { lastAt: ts(NOW - 1000) }) });
for (const f of ['status', 'reply', 'repliedAt', 'lastAdminAt', 'claimProof']) run('create: carries ' + f + ' -> denied', false, { method: 'create', path: '/feedback/fb-1', data: oldDoc(null, null, { [f]: f === 'status' ? 'new' : (f.endsWith('At') ? ts(NOW) : 'x') }) });
run('create: uid of someone else -> denied', false, { method: 'create', path: '/feedback/fb-1', auth: U_B, data: oldDoc('userA', null) });
run('create: handled true -> denied', false, { method: 'create', path: '/feedback/fb-1', data: oldDoc(null, null, { handled: true }) });

// stored docs
const anonDoc = oldDoc(null, null, { lastAt: ts(NOW - 2 * MIN), lastFrom: 'user', claimKey: KEY, files: meta('first', 2), createdAt: ts(NOW - 2 * MIN) });
const ownDoc = oldDoc('userA', 'a@example.com', { lastAt: ts(NOW - DAY), lastFrom: 'user', files: meta('first', 1), createdAt: ts(NOW - DAY) });
const legacyDoc = oldDoc('userA', 'a@example.com', { createdAt: ts(NOW - 90 * DAY) });
const DB = {
  '/feedback/anon': anonDoc,
  '/feedback/own': ownDoc,
  '/feedback/legacy': legacyDoc,
  '/feedback/anonOld': Object.assign({}, anonDoc, { createdAt: ts(NOW - 31 * DAY) }),
  '/feedback/anon20': Object.assign({}, anonDoc, { createdAt: ts(NOW - 20 * MIN) }),
  '/feedback/anonNoKey': oldDoc(null, null, { createdAt: ts(NOW - MIN) }),
  ['/feedback/own/messages/' + MID]: { from: 'user', uid: 'userA', text: 'more', files: meta(MID, 2), createdAt: ts(NOW - MIN) },
  ['/feedback/own/messages/' + MID2]: { from: 'admin', uid: ADMIN, text: 'reply', files: meta(MID2, 1), createdAt: ts(NOW - MIN) },
};

console.log('\n--- feedback retry (set() on an existing doc = update) ---');
run('feedback.js retry by the signed-in owner (new createdAt) -> denied', false, { db: DB, method: 'update', path: '/feedback/own', auth: U_A, data: Object.assign({}, ownDoc, { createdAt: ts(NOW), lastAt: ts(NOW) }) });
run('cloud.js retry without signing in -> denied', false, { db: DB, method: 'update', path: '/feedback/anon', data: Object.assign({}, anonDoc, { createdAt: ts(NOW), lastAt: ts(NOW) }) });

console.log('\n--- feedback update: admin ---');
run('admin status patch {status, handled}', true, { db: DB, method: 'update', path: '/feedback/own', auth: U_ADMIN, data: merged(DB, '/feedback/own', { status: 'in_progress', handled: false }) }, 0);
run('admin status patch on a legacy doc', true, { db: DB, method: 'update', path: '/feedback/legacy', auth: U_ADMIN, data: merged(DB, '/feedback/legacy', { status: 'closed', handled: true }) }, 0);
run('admin reply batch: parent patch', true, { db: DB, method: 'update', path: '/feedback/own', auth: U_ADMIN, data: merged(DB, '/feedback/own', { status: 'answered', handled: true, lastAt: ts(NOW), lastFrom: 'admin', lastAdminAt: ts(NOW) }) }, 0);
run('admin reply on a legacy doc (no lastAt before)', true, { db: DB, method: 'update', path: '/feedback/legacy', auth: U_ADMIN, data: merged(DB, '/feedback/legacy', { status: 'answered', handled: true, lastAt: ts(NOW), lastFrom: 'admin', lastAdminAt: ts(NOW) }) });
run('old dashboard reply {reply, repliedAt, status, handled}', true, { db: DB, method: 'update', path: '/feedback/legacy', auth: U_ADMIN, data: merged(DB, '/feedback/legacy', { reply: 'Thank you', repliedAt: ts(NOW), status: 'answered', handled: true }) });
run('admin: lastAdminAt not server time -> denied', false, { db: DB, method: 'update', path: '/feedback/own', auth: U_ADMIN, data: merged(DB, '/feedback/own', { lastAdminAt: ts(NOW - 5) }) });
run('admin: repliedAt not server time -> denied', false, { db: DB, method: 'update', path: '/feedback/own', auth: U_ADMIN, data: merged(DB, '/feedback/own', { reply: 'x', repliedAt: ts(NOW - 5) }) });
run('admin: lastFrom bot -> denied', false, { db: DB, method: 'update', path: '/feedback/own', auth: U_ADMIN, data: merged(DB, '/feedback/own', { lastFrom: 'bot' }) });
run('admin: lastAt a string -> denied', false, { db: DB, method: 'update', path: '/feedback/own', auth: U_ADMIN, data: merged(DB, '/feedback/own', { lastAt: 'now' }) });
run('admin: bad status -> denied', false, { db: DB, method: 'update', path: '/feedback/own', auth: U_ADMIN, data: merged(DB, '/feedback/own', { status: 'spam' }) });
run('admin: edits the message -> denied', false, { db: DB, method: 'update', path: '/feedback/own', auth: U_ADMIN, data: merged(DB, '/feedback/own', { message: 'edited' }) });

console.log('\n--- feedback update: owner follow-up ---');
const FU = { lastAt: ts(NOW), lastFrom: 'user', status: 'new', handled: false };
run('owner follow-up patch', true, { db: DB, method: 'update', path: '/feedback/own', auth: U_A, data: merged(DB, '/feedback/own', FU) }, 0);
run('owner follow-up on a legacy doc (fields were absent)', true, { db: DB, method: 'update', path: '/feedback/legacy', auth: U_A, data: merged(DB, '/feedback/legacy', FU) });
run('follow-up by a different user -> denied', false, { db: DB, method: 'update', path: '/feedback/own', auth: U_B, data: merged(DB, '/feedback/own', FU) });
run('follow-up not signed in -> denied', false, { db: DB, method: 'update', path: '/feedback/own', data: merged(DB, '/feedback/own', FU) });
run('follow-up on an unclaimed anonymous doc -> denied', false, { db: DB, method: 'update', path: '/feedback/anon', auth: U_A, data: merged(DB, '/feedback/anon', FU) });
run('owner sets status closed -> denied', false, { db: DB, method: 'update', path: '/feedback/own', auth: U_A, data: merged(DB, '/feedback/own', Object.assign({}, FU, { status: 'closed' })) });
run('owner sets lastFrom admin -> denied', false, { db: DB, method: 'update', path: '/feedback/own', auth: U_A, data: merged(DB, '/feedback/own', Object.assign({}, FU, { lastFrom: 'admin' })) });
run('owner writes reply -> denied', false, { db: DB, method: 'update', path: '/feedback/own', auth: U_A, data: merged(DB, '/feedback/own', Object.assign({}, FU, { reply: 'fake team reply' })) });
run('owner writes lastAdminAt -> denied', false, { db: DB, method: 'update', path: '/feedback/own', auth: U_A, data: merged(DB, '/feedback/own', Object.assign({}, FU, { lastAdminAt: ts(NOW) })) });
run('owner adds files to the parent -> denied', false, { db: DB, method: 'update', path: '/feedback/own', auth: U_A, data: merged(DB, '/feedback/own', Object.assign({}, FU, { files: meta('first', 3) })) });

console.log('\n--- feedback update: claim ---');
const CLAIM = { uid: 'userA', email: 'a@example.com', claimProof: KEY };
run('claim on sign-in (messages.js)', true, { db: DB, method: 'update', path: '/feedback/anon', auth: U_A, data: merged(DB, '/feedback/anon', CLAIM) }, 0);
run('claim with email null', true, { db: DB, method: 'update', path: '/feedback/anon', auth: { uid: 'userA', token: {} }, data: merged(DB, '/feedback/anon', { uid: 'userA', email: null, claimProof: KEY }) });
run('claim with wrong proof -> denied', false, { db: DB, method: 'update', path: '/feedback/anon', auth: U_A, data: merged(DB, '/feedback/anon', Object.assign({}, CLAIM, { claimProof: KEY.replace('0', '1') })) });
run('claim without proof -> denied', false, { db: DB, method: 'update', path: '/feedback/anon', auth: U_A, data: merged(DB, '/feedback/anon', { uid: 'userA', email: 'a@example.com' }) });
run('claim for someone else uid -> denied', false, { db: DB, method: 'update', path: '/feedback/anon', auth: U_B, data: merged(DB, '/feedback/anon', CLAIM) });
run('claim with another email -> denied', false, { db: DB, method: 'update', path: '/feedback/anon', auth: U_A, data: merged(DB, '/feedback/anon', Object.assign({}, CLAIM, { email: 'x@example.com' })) });
run('claim not signed in -> denied', false, { db: DB, method: 'update', path: '/feedback/anon', data: merged(DB, '/feedback/anon', CLAIM) });
run('claim after 31 days -> denied', false, { db: DB, method: 'update', path: '/feedback/anonOld', auth: U_A, data: merged(DB, '/feedback/anonOld', CLAIM) });
run('claim of an old anonymous doc without claimKey -> denied', false, { db: DB, method: 'update', path: '/feedback/anonNoKey', auth: U_A, data: merged(DB, '/feedback/anonNoKey', { uid: 'userA', email: 'a@example.com', claimProof: null }) });
run('claim that also changes status -> denied', false, { db: DB, method: 'update', path: '/feedback/anon', auth: U_A, data: merged(DB, '/feedback/anon', Object.assign({}, CLAIM, { status: 'closed' })) });
run('re-claim an already-owned doc -> denied', false, { db: DB, method: 'update', path: '/feedback/own', auth: U_B, data: merged(DB, '/feedback/own', { uid: 'userB', email: 'b@example.com', claimProof: KEY }) });
run('claim of a missing doc -> denied', false, { db: DB, method: 'update', path: '/feedback/nope', auth: U_A, data: CLAIM });

console.log('\n--- feedback read / delete ---');
run('owner reads own conversation', true, { db: DB, method: 'get', path: '/feedback/own', auth: U_A });
run('other user reads it -> denied', false, { db: DB, method: 'get', path: '/feedback/own', auth: U_B });
run('admin reads', true, { db: DB, method: 'get', path: '/feedback/anon', auth: U_ADMIN });
run('anonymous reads the anonymous doc -> denied', false, { db: DB, method: 'get', path: '/feedback/anon' });
run('admin deletes the conversation', true, { db: DB, method: 'delete', path: '/feedback/own', auth: U_ADMIN });
run('owner deletes -> denied', false, { db: DB, method: 'delete', path: '/feedback/own', auth: U_A });

console.log('\n--- messages ---');
const NEWMID = 'm-1790000000123-abc123';
const umsg = (extra) => Object.assign({ from: 'user', uid: 'userA', text: 'Thanks, one more thing', files: [], createdAt: ts(NOW) }, extra || {});
const amsg = (extra) => Object.assign({ from: 'admin', uid: ADMIN, text: 'Fixed now', files: meta(NEWMID, 1), createdAt: ts(NOW) }, extra || {});
run('owner follow-up message (messages.js batch)', true, { db: DB, method: 'create', path: '/feedback/own/messages/' + NEWMID, auth: U_A, data: umsg() }, 1);
run('owner follow-up with 3 files and empty text', true, { db: DB, method: 'create', path: '/feedback/own/messages/' + NEWMID, auth: U_A, data: umsg({ text: '', files: meta(NEWMID, 3) }) });
run('owner follow-up without files key', true, { db: DB, method: 'create', path: '/feedback/own/messages/' + NEWMID, auth: U_A, data: (() => { const m = umsg(); delete m.files; return m; })() });
run('admin reply message (admin batch)', true, { db: DB, method: 'create', path: '/feedback/own/messages/' + NEWMID, auth: U_ADMIN, data: amsg() }, 0);
run('admin reply into an unclaimed anonymous conversation', true, { db: DB, method: 'create', path: '/feedback/anon/messages/' + NEWMID, auth: U_ADMIN, data: amsg() }, 0);
run('empty text and no files -> denied', false, { db: DB, method: 'create', path: '/feedback/own/messages/' + NEWMID, auth: U_A, data: umsg({ text: '' }) });
run('text 5001 chars -> denied', false, { db: DB, method: 'create', path: '/feedback/own/messages/' + NEWMID, auth: U_A, data: umsg({ text: 'x'.repeat(5001) }) });
run('text 5000 chars', true, { db: DB, method: 'create', path: '/feedback/own/messages/' + NEWMID, auth: U_A, data: umsg({ text: 'x'.repeat(5000) }) });
run('4 files -> denied', false, { db: DB, method: 'create', path: '/feedback/own/messages/' + NEWMID, auth: U_A, data: umsg({ files: meta(NEWMID, 4) }) });
run('createdAt not server time -> denied', false, { db: DB, method: 'create', path: '/feedback/own/messages/' + NEWMID, auth: U_A, data: umsg({ createdAt: ts(NOW - 1) }) });
run('extra key -> denied', false, { db: DB, method: 'create', path: '/feedback/own/messages/' + NEWMID, auth: U_A, data: umsg({ status: 'x' }) });
run('owner posting as admin -> denied', false, { db: DB, method: 'create', path: '/feedback/own/messages/' + NEWMID, auth: U_A, data: umsg({ from: 'admin' }) });
run('owner with someone else uid -> denied', false, { db: DB, method: 'create', path: '/feedback/own/messages/' + NEWMID, auth: U_A, data: umsg({ uid: 'userB' }) });
run('other user -> denied', false, { db: DB, method: 'create', path: '/feedback/own/messages/' + NEWMID, auth: U_B, data: umsg({ uid: 'userB' }) });
run('not signed in -> denied', false, { db: DB, method: 'create', path: '/feedback/anon/messages/' + NEWMID, data: umsg({ uid: null }) });
run('signed in, unclaimed anonymous conversation -> denied', false, { db: DB, method: 'create', path: '/feedback/anon/messages/' + NEWMID, auth: U_A, data: umsg() });
run('admin posting as user in someone else conversation -> denied', false, { db: DB, method: 'create', path: '/feedback/own/messages/' + NEWMID, auth: U_ADMIN, data: umsg({ uid: ADMIN }) });
run('admin with another uid -> denied', false, { db: DB, method: 'create', path: '/feedback/own/messages/' + NEWMID, auth: U_ADMIN, data: amsg({ uid: 'userA' }) });
run('message on a missing conversation -> denied', false, { db: DB, method: 'create', path: '/feedback/nope/messages/' + NEWMID, auth: U_A, data: umsg() });
run('message update by admin -> denied', false, { db: DB, method: 'update', path: '/feedback/own/messages/' + MID, auth: U_ADMIN, data: Object.assign({}, DB['/feedback/own/messages/' + MID], { text: 'x' }) });
run('message update by owner -> denied', false, { db: DB, method: 'update', path: '/feedback/own/messages/' + MID, auth: U_A, data: Object.assign({}, DB['/feedback/own/messages/' + MID], { text: 'x' }) });
run('message delete by admin', true, { db: DB, method: 'delete', path: '/feedback/own/messages/' + MID, auth: U_ADMIN });
run('message delete by owner -> denied', false, { db: DB, method: 'delete', path: '/feedback/own/messages/' + MID, auth: U_A });
run('message list by owner', true, { db: DB, method: 'list', path: '/feedback/own/messages/' + MID, auth: U_A }, 1);
run('message get by admin', true, { db: DB, method: 'get', path: '/feedback/own/messages/' + MID, auth: U_ADMIN }, 0);
run('message get by other user -> denied', false, { db: DB, method: 'get', path: '/feedback/own/messages/' + MID, auth: U_B });
run('message get not signed in -> denied', false, { db: DB, method: 'get', path: '/feedback/own/messages/' + MID });

console.log('\n--- files ---');
const file = (mid, n, extra) => Object.assign({ mid, n, name: 'shot' + n + '.webp', type: 'image/webp', size: 5000, data: bytes(5000), from: 'user', createdAt: ts(NOW) }, extra || {});
const fp = (fb, mid, n) => '/feedback/' + fb + '/files/' + mid + '-' + n;
run('cloud.js anonymous upload first-0 with key', true, { db: DB, method: 'create', path: fp('anon', 'first', 0), data: file('first', 0, { key: KEY }) }, 1);
run('cloud.js anonymous upload first-1 with key', true, { db: DB, method: 'create', path: fp('anon', 'first', 1), data: file('first', 1, { key: KEY }) }, 1);
run('anonymous first-2 (only 2 declared) -> denied', false, { db: DB, method: 'create', path: fp('anon', 'first', 2), data: file('first', 2, { key: KEY }) });
run('anonymous wrong key -> denied', false, { db: DB, method: 'create', path: fp('anon', 'first', 0), data: file('first', 0, { key: KEY.replace('0', '9') }) });
run('anonymous without key -> denied', false, { db: DB, method: 'create', path: fp('anon', 'first', 0), data: file('first', 0) });
run('anonymous after 15 minutes -> denied', false, { db: DB, method: 'create', path: fp('anon20', 'first', 0), data: file('first', 0, { key: KEY }) });
run('anonymous from admin -> denied', false, { db: DB, method: 'create', path: fp('anon', 'first', 0), data: file('first', 0, { key: KEY, from: 'admin' }) });
run('anonymous upload to a claimed doc -> denied', false, { db: DB, method: 'create', path: fp('own', 'first', 0), data: file('first', 0, { key: KEY }) });
run('anonymous upload into a reply message -> denied', false, { db: DB, method: 'create', path: fp('anon', MID, 0), data: file(MID, 0, { key: KEY }) });
run('signed-in first-0 by the owner (cloud.js signed in)', true, { db: DB, method: 'create', path: fp('own', 'first', 0), auth: U_A, data: file('first', 0) }, 1);
run('signed-in first-1 (only 1 declared) -> denied', false, { db: DB, method: 'create', path: fp('own', 'first', 1), auth: U_A, data: file('first', 1) });
run('first-0 by another user -> denied', false, { db: DB, method: 'create', path: fp('own', 'first', 0), auth: U_B, data: file('first', 0) });
run('owner file for own message (messages.js)', true, { db: DB, method: 'create', path: fp('own', MID, 1), auth: U_A, data: file(MID, 1) }, 2);
run('owner file beyond the declared count -> denied', false, { db: DB, method: 'create', path: fp('own', MID, 2), auth: U_A, data: file(MID, 2) });
run('owner file into the admin reply -> denied', false, { db: DB, method: 'create', path: fp('own', MID2, 0), auth: U_A, data: file(MID2, 0) });
run('admin file for admin reply', true, { db: DB, method: 'create', path: fp('own', MID2, 0), auth: U_ADMIN, data: file(MID2, 0, { from: 'admin' }) }, 1);
run('admin file into the user message -> denied', false, { db: DB, method: 'create', path: fp('own', MID, 0), auth: U_ADMIN, data: file(MID, 0, { from: 'admin' }) });
run('file for a missing message -> denied', false, { db: DB, method: 'create', path: fp('own', NEWMID, 0), auth: U_A, data: file(NEWMID, 0) });
run('PDF 800000 bytes', true, { db: DB, method: 'create', path: fp('own', MID, 0), auth: U_A, data: file(MID, 0, { type: 'application/pdf', name: 'report.pdf', size: 800000, data: bytes(800000) }) });
run('800001 bytes -> denied', false, { db: DB, method: 'create', path: fp('own', MID, 0), auth: U_A, data: file(MID, 0, { size: 800001, data: bytes(800001) }) });
run('size != data length -> denied', false, { db: DB, method: 'create', path: fp('own', MID, 0), auth: U_A, data: file(MID, 0, { size: 10 }) });
run('SVG type -> denied', false, { db: DB, method: 'create', path: fp('own', MID, 0), auth: U_A, data: file(MID, 0, { type: 'image/svg+xml' }) });
run('data as a string -> denied', false, { db: DB, method: 'create', path: fp('own', MID, 0), auth: U_A, data: file(MID, 0, { data: 'x'.repeat(5000) }) });
run('id not mid-n -> denied', false, { db: DB, method: 'create', path: '/feedback/own/files/' + MID + '-0', auth: U_A, data: file(MID, 1) });
run('n = 3 -> denied', false, { db: DB, method: 'create', path: fp('own', MID, 3), auth: U_A, data: file(MID, 3) });
run('n as a string -> denied', false, { db: DB, method: 'create', path: fp('own', MID, 0), auth: U_A, data: file(MID, '0') });
run('bad mid -> denied', false, { db: DB, method: 'create', path: '/feedback/own/files/../x-0', auth: U_A, data: file('../x', 0) });
run('name 121 chars -> denied', false, { db: DB, method: 'create', path: fp('own', MID, 0), auth: U_A, data: file(MID, 0, { name: 'a'.repeat(121) }) });
run('name 120 chars', true, { db: DB, method: 'create', path: fp('own', MID, 0), auth: U_A, data: file(MID, 0, { name: 'a'.repeat(120) }) });
run('createdAt not server time -> denied', false, { db: DB, method: 'create', path: fp('own', MID, 0), auth: U_A, data: file(MID, 0, { createdAt: ts(NOW - 1) }) });
run('missing createdAt -> denied', false, { db: DB, method: 'create', path: fp('own', MID, 0), auth: U_A, data: (() => { const f = file(MID, 0); delete f.createdAt; return f; })() });
run('extra key -> denied', false, { db: DB, method: 'create', path: fp('own', MID, 0), auth: U_A, data: file(MID, 0, { url: 'x' }) });
run('re-upload of an existing file (set() = update) -> denied', false, { db: Object.assign({}, DB, { [fp('own', MID, 0)]: file(MID, 0) }), method: 'update', path: fp('own', MID, 0), auth: U_A, data: file(MID, 0) });
run('file update by admin -> denied', false, { db: Object.assign({}, DB, { [fp('own', MID, 0)]: file(MID, 0) }), method: 'update', path: fp('own', MID, 0), auth: U_ADMIN, data: file(MID, 0, { name: 'x' }) });
run('file get by owner', true, { db: DB, method: 'get', path: fp('own', MID, 0), auth: U_A }, 1);
run('file get by admin', true, { db: DB, method: 'get', path: fp('anon', 'first', 0), auth: U_ADMIN }, 0);
run('file list by admin (delete cascade)', true, { db: DB, method: 'list', path: fp('anon', 'first', 0), auth: U_ADMIN }, 0);
run('file get by other user -> denied', false, { db: DB, method: 'get', path: fp('own', MID, 0), auth: U_B });
run('file get not signed in (even the anonymous sender) -> denied', false, { db: DB, method: 'get', path: fp('anon', 'first', 0) });
run('file delete by admin', true, { db: DB, method: 'delete', path: fp('own', MID, 0), auth: U_ADMIN });
run('file delete by owner -> denied', false, { db: DB, method: 'delete', path: fp('own', MID, 0), auth: U_A });

console.log('\n--- other collections unchanged ---');
run('stotras public read', true, { method: 'get', path: '/stotras/x' });
run('stotras write by user -> denied', false, { method: 'create', path: '/stotras/x', auth: U_A, data: { a: 1 } });
run('users own read', true, { method: 'get', path: '/users/userA', auth: U_A });
run('users other read -> denied', false, { method: 'get', path: '/users/userA', auth: U_B });
run('config public read', true, { method: 'get', path: '/config/weekday' });
run('updates admin create', true, { method: 'create', path: '/updates/u1', auth: U_ADMIN, data: { date: '2026-09-30', tag: 'new', title: 'Hi', body: 'b', published: true, updatedAt: ts(NOW) } });

console.log('\n--- Playground checklist (no data, as written in the file) ---');
const P = [
  ['get', '/stotras/test', null, true], ['get', '/updates/test', null, true],
  ['get', '/users/abc', { uid: 'abc' }, true], ['get', '/users/abc', { uid: 'xyz' }, false],
  ['get', '/feedback/test123', null, false], ['get', '/feedback/test123', U_ADMIN, true],
  ['get', '/feedback/test123/messages/m-1', null, false], ['get', '/feedback/test123/messages/m-1', U_ADMIN, true],
  ['get', '/feedback/test123/messages/m-1', { uid: 'xyz' }, false],
  ['get', '/feedback/test123/files/first-0', null, false], ['get', '/feedback/test123/files/first-0', U_ADMIN, true],
  ['get', '/feedback/test123/files/first-0', { uid: 'xyz' }, false],
  ['delete', '/feedback/test123/files/first-0', { uid: 'xyz' }, false], ['delete', '/feedback/test123/files/first-0', U_ADMIN, true],
  ['delete', '/feedback/test123/messages/m-1', U_ADMIN, true], ['delete', '/feedback/test123', U_ADMIN, true],
  ['update', '/feedback/test123/messages/m-1', U_ADMIN, false, { text: 'x' }],
  ['update', '/feedback/test123/files/first-0', U_ADMIN, false, { text: 'x' }],
  ['update', '/feedback/test123', null, false, { text: 'x' }],
];
for (const [m, p, a, exp, d] of P) run('playground ' + m + ' ' + p + ' ' + (a ? a.uid : 'off'), exp, { method: m, path: p, auth: a, data: d });

console.log('\n' + (fails ? fails + ' FAILED' : 'ALL PASSED'));
process.exit(fails ? 1 : 0);
