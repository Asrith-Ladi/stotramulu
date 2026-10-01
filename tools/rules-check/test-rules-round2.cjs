'use strict';
// Round-2 rule checks: files-list entries (SEC-1), integer n (SEC-3), message id pattern.
// Run with: npm run rules:check (after test-rules.cjs).
const fs = require('fs');
const path = require('path');
const { lex, Parser, evaluate, TS, FL } = require('./rules.cjs');
const FILE = process.env.RULES || path.resolve(__dirname, '..', '..', 'docs', 'firestore.rules.proposed');
const rules = new Parser(lex(fs.readFileSync(FILE, 'utf8'))).file();
let fails = 0;
const ADMIN = '0d3PPSYaFncy1tY2oUGtBMGMFwu2';
const NOW = Date.UTC(2026, 8, 30, 12, 0, 0);
const MIN = 60e3, DAY = 864e5;
const ts = (ms) => TS(ms);
const U_A = { uid: 'userA', token: { email: 'a@example.com' } };
const U_ADMIN = { uid: ADMIN, token: { email: 'admin@example.com' } };
const KEY = '0123456789abcdef0123456789abcdef';
const MID = 'm-1790000000000-a1b2c3';
const NEWMID = 'm-1790000000123-abc123';
const bytes = (n) => new Uint8Array(n);
const meta = (mid, n) => Array.from({ length: n }, (_, i) => ({ id: mid + '-' + i, name: 'shot' + i + '.webp', type: 'image/webp', size: 1000 }));
function oldDoc(uid, email, extra) {
  return Object.assign({ type: 'problem', name: 'Ravi', contact: '9876543210', message: 'The page is slow', screen: 'reader', stotram: 'vishnu', stotramTitle: 'Vishnu Sahasranamam', lang: 'te', device: 'Android Chrome', sentAt: '2026-09-30T11:59:59.000Z', uid: uid, email: email, handled: false, createdAt: ts(NOW) }, extra || {});
}
function run(desc, expect, req) {
  const r = evaluate(rules, req.db || {}, { method: req.method, path: req.path, auth: req.auth || null, data: req.data, now: NOW });
  if (r.allowed !== expect) { fails++; console.log('FAIL  ' + desc + '  (got ' + (r.allowed ? 'ALLOW' : 'DENY') + ', errors=' + JSON.stringify(r.errors) + ')'); }
  else console.log('ok    ' + desc + '  [' + (r.allowed ? 'allow' : 'deny') + ']');
}
const anonDoc = oldDoc(null, null, { lastAt: ts(NOW - 2 * MIN), lastFrom: 'user', claimKey: KEY, files: meta('first', 2), createdAt: ts(NOW - 2 * MIN) });
const ownDoc = oldDoc('userA', 'a@example.com', { lastAt: ts(NOW - DAY), lastFrom: 'user', files: meta('first', 1), createdAt: ts(NOW - DAY) });
const DB = {
  '/feedback/anon': anonDoc,
  '/feedback/own': ownDoc,
  ['/feedback/own/messages/' + MID]: { from: 'user', uid: 'userA', text: 'more', files: meta(MID, 2), createdAt: ts(NOW - MIN) },
};
const withEntry = (patch) => [Object.assign({}, meta('first', 1)[0], patch)];

console.log('--- SEC-1: each files entry is checked (feedback create) ---');
const create = (files, auth) => ({ method: 'create', path: '/feedback/fb-9', auth: auth || null, data: oldDoc(auth ? 'userA' : null, auth ? 'a@example.com' : null, Object.assign({ lastAt: ts(NOW), lastFrom: 'user', files: files }, auth ? {} : { claimKey: KEY })) });
run('valid entries (3) from Files.meta', true, create(meta('first', 3)));
run('valid entry, name 120 chars', true, create(withEntry({ name: 'n'.repeat(120) })));
run('valid entry, PDF 800000', true, create(withEntry({ type: 'application/pdf', name: 'a.pdf', size: 800000 })));
run('entry with an extra key -> denied', false, create(withEntry({ junk: 'x'.repeat(50000) })));
run('entry name 121 chars -> denied', false, create(withEntry({ name: 'n'.repeat(121) })));
run('entry id 81 chars -> denied', false, create(withEntry({ id: 'i'.repeat(81) })));
run('entry type svg -> denied', false, create(withEntry({ type: 'image/svg+xml' })));
run('entry size 800001 -> denied', false, create(withEntry({ size: 800001 })));
run('entry size as string -> denied', false, create(withEntry({ size: '1000' })));
run('entry size negative -> denied', false, create(withEntry({ size: -1 })));
run('entry is a string -> denied', false, create(['x'.repeat(100000)]));
run('entry is a list -> denied', false, create([[1, 2, 3]]));
run('third entry bad, first two good -> denied', false, create(meta('first', 2).concat(withEntry({ type: 'text/html' }))));
run('entry missing size -> denied', false, create([{ id: 'first-0', name: 'a.webp', type: 'image/webp' }]));

console.log('--- SEC-1: each files entry is checked (message create) ---');
const umsg = (files, mid) => ({ db: DB, method: 'create', path: '/feedback/own/messages/' + (mid || NEWMID), auth: U_A, data: { from: 'user', uid: 'userA', text: 'more', files: files, createdAt: ts(NOW) } });
run('message with files: [] (messages.js, nothing attached)', true, umsg([]));
run('message with 3 valid entries', true, umsg(meta(NEWMID, 3)));
run('message entry with an extra key -> denied', false, umsg([Object.assign({}, meta(NEWMID, 1)[0], { junk: 'x' })]));
run('message entry huge name -> denied', false, umsg([Object.assign({}, meta(NEWMID, 1)[0], { name: 'x'.repeat(5000) })]));
run('admin message with valid entry', true, { db: DB, method: 'create', path: '/feedback/own/messages/' + NEWMID, auth: U_ADMIN, data: { from: 'admin', uid: ADMIN, text: 'ok', files: meta(NEWMID, 1), createdAt: ts(NOW) } });

console.log('--- message id pattern ---');
run('mid from newMessageId()', true, umsg([], 'm-1790000000123-abc123'));
run('mid 16 digits', true, umsg([], 'm-1790000000123456-abcd'));
run('mid free text -> denied', false, umsg([], 'hello'));
run('mid uppercase suffix -> denied', false, umsg([], 'm-1790000000123-ABC123'));
run('mid 9 digits -> denied', false, umsg([], 'm-179000000-abc123'));
run('mid "first" -> denied', false, umsg([], 'first'));

console.log('--- SEC-3: n must be an int ---');
const file = (mid, n, extra) => Object.assign({ mid, n, name: 'shot.webp', type: 'image/webp', size: 5000, data: bytes(5000), from: 'user', createdAt: ts(NOW) }, extra || {});
run('owner file n=1 (int)', true, { db: DB, method: 'create', path: '/feedback/own/files/' + MID + '-1', auth: U_A, data: file(MID, 1) });
run('owner file n=0.0 (float) at id -0.0 -> denied', false, { db: DB, method: 'create', path: '/feedback/own/files/' + MID + '-0.0', auth: U_A, data: file(MID, FL(0)) });
run('owner file n=1.0 (float) at id -1 -> denied', false, { db: DB, method: 'create', path: '/feedback/own/files/' + MID + '-1', auth: U_A, data: file(MID, FL(1)) });
run('anonymous first-0 (int) with key', true, { db: DB, method: 'create', path: '/feedback/anon/files/first-0', data: file('first', 0, { key: KEY }) });
run('anonymous first-0.0 (float) with key -> denied', false, { db: DB, method: 'create', path: '/feedback/anon/files/first-0.0', data: file('first', FL(0), { key: KEY }) });

console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASSED');
process.exit(fails ? 1 : 0);
