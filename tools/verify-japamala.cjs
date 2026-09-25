const fs = require('node:fs');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

const html = fs.readFileSync('public/index.html', 'utf8');
const js = fs.readFileSync('public/assets/japamala.js', 'utf8');
const handCss = fs.readFileSync('public/assets/japamala-hand.css', 'utf8');
const threeJs = fs.readFileSync('public/assets/japamala-3d.js', 'utf8');
const threeCss = fs.readFileSync('public/assets/japamala-3d.css', 'utf8');
const modes = [...html.matchAll(/class="jm-mode-btn" data-mode="([^"]+)"/g)].map(match => match[1]);

assert.deepEqual(modes, ['flow', 'strand', 'full', 'hand', 'rudraksha3d'],
    'the four existing Japamala modes remain and 3D is fifth');
for (const id of ['jmStageStrand', 'jmStageFull', 'jmStageFlow', 'jmStageHand',
    'jmHandBeads', 'jmHandActiveBead', 'jmHandIndex', 'jmHandThumb',
    'jmStageRudraksha3d', 'jmRudrakshaCanvas', 'jmRudrakshaFallback']) {
    assert.match(html, new RegExp('id="' + id + '"'), id + ' exists');
}

assert.match(html, /assets\/japamala-hand\.css/, 'hand stylesheet is loaded');
assert.match(js, /function buildHand\(\)/, 'hand mala is built');
assert.match(js, /function renderHand\(animate\)/, 'hand mala count state is rendered');
assert.match(js, /function animateHandPull\(\)/, 'hand pull animation is triggered');
assert.match(js, /hand: 'jmStageHand'/, 'hand mode switches to its stage');
assert.match(js, /jmMode === 'hand'\) renderHand\(true\)/, 'each hand-mode tap animates');
assert.match(js, /hand: 'jmSvgHand'/, 'completion animation targets hand mode');
assert.match(handCss, /@keyframes jmIndexPull/, 'index finger moves');
assert.match(handCss, /@keyframes jmThumbPull/, 'thumb moves');
assert.match(handCss, /@keyframes jmBeadPull/, 'pinched bead moves with the fingers');
assert.match(handCss, /min-height: 44px/, 'mobile mode targets are large enough');
assert.match(handCss, /prefers-reduced-motion: reduce/, 'reduced motion is respected');

assert.ok(html.indexOf('assets/japamala-3d.js') < html.indexOf('assets/japamala.js'),
    '3D renderer loads before shared Japamala controller');
assert.match(js, /rudraksha3d: 'jmStageRudraksha3d'/, '3D mode switches to its stage');
assert.match(js, /Japamala3D\.advance\(jm\.total\)/, '3D mode receives the shared count');
assert.match(js, /Japamala3D\.reset\(0\)/, '3D mode resets with the shared count');
assert.match(js, /rudraksha3d: 'jmRudrakshaCanvas'/, 'completion animation targets the 3D canvas');
assert.match(threeJs, /getContext\('webgl'/, 'renderer uses real WebGL');
assert.match(threeJs, /function createRudrakshaGeometry\(\)/, 'Rudraksha mesh is procedural');
assert.match(threeJs, /longitude \* 5\.0/, 'shader renders five mukhi grooves');
assert.match(threeJs, /longitude \* 5 \+/, 'mesh contains five physical groove channels');
assert.match(threeJs, /const tubercles =/, 'rough tuberculated surface changes the physical mesh');
assert.match(threeJs, /topInnerStart/, 'top and bottom recessed thread channels are modeled');
assert.match(threeJs, /float bore =/, 'thread channel receives dark recessed shading');
assert.match(threeJs, /longitudeSegments = 52/, 'mesh has enough detail for the irregular silhouette');
assert.equal(threeJs.includes("].join('\\\\n');"), false, 'shader arrays join with real newline separators');
assert.match(threeJs, /powerPreference: 'low-power'/, 'mobile-friendly GPU preference');
assert.match(threeJs, /Math\.min\(window\.devicePixelRatio \|\| 1, 1\.5\)/, 'pixel density is capped');
assert.match(threeJs, /prefers-reduced-motion: reduce/, '3D pull respects reduced motion');
assert.match(threeJs, /webglcontextlost/, 'WebGL loss has a fallback');
assert.match(threeCss, /touch-action: pan-y/, 'the large canvas preserves vertical mobile scrolling');
assert.match(threeCss, /jmRudrakshaCelebrate/, '108-count celebration reaches the 3D canvas');
assert.match(threeCss, /data-mode="rudraksha3d"/, 'fifth mobile selector has deliberate layout');
assert.doesNotMatch(threeJs, /three(?:\.js)?|https?:\/\//i, '3D mode has no heavy or remote runtime dependency');
assert.ok(Buffer.byteLength(threeJs) < 24000, '3D renderer remains a small lazy runtime');

execFileSync(process.execPath, ['--check', 'public/assets/japamala-3d.js']);
execFileSync(process.execPath, ['--check', 'public/assets/japamala.js']);
console.log('PASS: five Japamala modes, articulated 2D hand, procedural WebGL Rudraksha, shared count, mobile input, and fallbacks.');
