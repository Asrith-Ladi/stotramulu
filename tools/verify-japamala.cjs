const fs = require('node:fs');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

const html = fs.readFileSync('public/index.html', 'utf8');
const js = fs.readFileSync('public/assets/japamala.js', 'utf8');
const css = fs.readFileSync('public/assets/japamala-hand.css', 'utf8');
const modes = [...html.matchAll(/class="jm-mode-btn" data-mode="([^"]+)"/g)].map(match => match[1]);

assert.deepEqual(modes, ['flow', 'strand', 'full', 'hand'], 'all four Japamala modes remain available');
for (const id of ['jmStageStrand', 'jmStageFull', 'jmStageFlow', 'jmStageHand',
    'jmHandBeads', 'jmHandActiveBead', 'jmHandIndex', 'jmHandThumb']) {
    assert.match(html, new RegExp('id="' + id + '"'), id + ' exists');
}
assert.match(html, /assets\/japamala-hand\.css/, 'hand stylesheet is loaded');
assert.match(js, /function buildHand\(\)/, 'hand mala is built');
assert.match(js, /function renderHand\(animate\)/, 'hand count state is rendered');
assert.match(js, /function animateHandPull\(\)/, 'hand pull animation is triggered');
assert.match(js, /hand: 'jmStageHand'/, 'hand mode switches to its stage');
assert.match(js, /jmMode === 'hand'\) renderHand\(true\)/, 'each hand-mode tap animates');
assert.match(js, /hand: 'jmSvgHand'/, 'completion animation targets hand mode');
assert.match(css, /@keyframes jmIndexPull/, 'index finger moves');
assert.match(css, /@keyframes jmThumbPull/, 'thumb moves');
assert.match(css, /@keyframes jmBeadPull/, 'pinched bead moves with the fingers');
assert.match(css, /min-height: 44px/, 'mobile mode targets are large enough');
assert.match(css, /prefers-reduced-motion: reduce/, 'reduced motion is respected');
execFileSync(process.execPath, ['--check', 'public/assets/japamala.js']);
console.log('PASS: four Japamala modes, articulated finger/bead motion, mobile targets, and reduced-motion fallback.');
