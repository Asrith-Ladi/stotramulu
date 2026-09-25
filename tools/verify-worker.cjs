const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');

for (const file of ['src/index.js', 'src/http.js', 'src/auth.js', 'src/ocr.js']) {
  execFileSync(process.execPath, ['--check', file]);
}
const index = fs.readFileSync('src/index.js', 'utf8');
const ocr = fs.readFileSync('src/ocr.js', 'utf8');
const http = fs.readFileSync('src/http.js', 'utf8');
assert.match(index, /request\.method !== "POST"/);
assert.match(index, /env\.ASSETS\.fetch/);
assert.match(ocr, /MAX_IMAGES = 6/);
assert.match(ocr, /MAX_TOTAL_CHARS = 24_000_000/);
assert.match(ocr, /ALLOWED_MIME_TYPES/);
assert.match(ocr, /verifyFirebaseToken\(token, env\)/);
assert.match(http, /"Cache-Control": "no-store"/);

const transformed = ocr.replace(/^\uFEFF/, '')
  .replace(/^import .*$/gm, '')
  .replace(/export /g, '');
const sandbox = {Set, Response, fetch: async () => { throw new Error('not called'); }, verifyFirebaseToken() {}, json() {}};
vm.createContext(sandbox);
vm.runInContext(transformed, sandbox);
assert.deepEqual(JSON.parse(JSON.stringify(sandbox.validateImages(null))), {error: 'No images'});
assert.match(sandbox.validateImages(Array(7).fill({mime:'image/jpeg', data:'YQ=='})).error, /Too many/);
assert.match(sandbox.validateImages([{mime:'image/gif', data:'YQ=='}]).error, /Unsupported/);
assert.match(sandbox.validateImages([{mime:'image/png', data:'not base64!'}]).error, /encoding/);
assert.equal(sandbox.validateImages([{mime:'image/png', data:'YQ=='}]).images.length, 1);
assert.deepEqual(JSON.parse(JSON.stringify(sandbox.diffLines('a\nb', 'a\nc'))), [{line:2,a:'b',b:'c'}]);
console.log('PASS: worker modules parse, routing remains narrow, OCR payload limits validate, and line comparison is stable.');
