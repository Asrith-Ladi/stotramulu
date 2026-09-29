const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.chdir(path.resolve(__dirname, '..'));
const read = file => fs.readFileSync(file, 'utf8');
const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
/* Base rules only: drop every @media / @supports / @container block, however deeply nested. */
function stripAtBlocks(css) {
    const start = /@(?:media|supports|container)\b[^{;]*\{/g;
    let out = '';
    let from = 0;
    let match;
    while ((match = start.exec(css))) {
        out += css.slice(from, match.index);
        let depth = 1;
        let i = start.lastIndex;
        for (; i < css.length && depth; i++) {
            if (css[i] === '{') depth++;
            else if (css[i] === '}') depth--;
        }
        from = start.lastIndex = i;
    }
    return out + css.slice(from);
}

const html = read('index.html');
const reader = read('public/assets/reader.js');
const app = read('public/assets/app.js');
const tokensCss = stripComments(read('styles/tokens.css'));
const libraryCss = stripComments(read('styles/library.css'));
const componentsCss = stripComments(read('styles/components.css'));

assert.match(html, /<body class="grandham">/, 'Grandham presentation is always active');
assert.doesNotMatch(html, /grandhamToggle|toggleGrandham/, 'reader has no redundant Grandham toggle');
assert.doesNotMatch(reader + app + html, /localStorage\.getItem\(['"]grandham['"]\)|initGrandham|toggleGrandham/, 'old Grandham preference path is removed');
assert.doesNotMatch(html, /గ్రంథ రూపం, శ్లోకం/, 'reader options summary no longer advertises a removed control');

const SELECTED_CHIP = '.category-filters button[aria-pressed="true"]';
assert.ok(libraryCss.includes(SELECTED_CHIP), 'library.css gives the selected category an explicit visual state');
assert.match(componentsCss, /(?:^|[{};])\s*\.home-page input\[type="date"\]\s*\{[^}]*color-scheme:\s*light;/,
    'components.css keeps the standalone .home-page date-input rule (paper surface, light picker)');

/* ---------- Contrast, computed from the design tokens ---------- */
const tokens = new Map();
for (const block of stripAtBlocks(tokensCss).matchAll(/:root\s*\{([^}]*)\}/g)) {
    for (const [, name, value] of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens.set(name, value.trim());
}
function resolveColor(value, seen = new Set()) {
    const v = String(value).replace(/!\s*important\s*$/i, '').trim();
    const ref = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/);
    if (ref) {
        if (seen.has(ref[1])) return null;
        seen.add(ref[1]);
        if (tokens.has(ref[1])) return resolveColor(tokens.get(ref[1]), seen);
        return ref[2] ? resolveColor(ref[2], seen) : null;
    }
    if (/^#[0-9a-f]{3}$/i.test(v)) return '#' + v.slice(1).split('').map(c => c + c).join('').toLowerCase();
    if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
    if (/^white$/i.test(v)) return '#ffffff';
    if (/^black$/i.test(v)) return '#000000';
    return null;
}
function token(name) {
    const hex = resolveColor('var(' + name + ')');
    assert.ok(hex, 'tokens.css defines ' + name + ' as a solid hex colour');
    return hex;
}
function luminance(hex) {
    const rgb = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
        .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
function contrast(foreground, background) {
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
}
const ratios = [];
function expectContrast(label, foreground, background, minimum) {
    const ratio = contrast(foreground, background);
    assert.ok(ratio >= minimum, label + ': ' + foreground + ' on ' + background + ' is ' + ratio.toFixed(2) + ':1, needs ' + minimum + ':1');
    ratios.push(label + ' ' + ratio.toFixed(1));
}
expectContrast('ink on ivory', token('--ink'), token('--ivory'), 7);
expectContrast('ink-3 on ivory', token('--ink-3'), token('--ivory'), 4.5);
expectContrast('reading-ink on paper-leaf', token('--reading-ink'), token('--paper-leaf'), 7);
expectContrast('white on peacock-800', token('--white'), token('--peacock-800'), 4.5);
expectContrast('zari-700 on ivory', token('--zari-700'), token('--ivory'), 4.5);

/* The selected filter chip: read the colours library.css actually uses when
   they resolve to solid tokens; otherwise hold the contract pair
   (white on peacock-800, zari-300 count). */
function ruleDeclarations(css, selector) {
    const decls = new Map();
    for (const [, selectors, body] of stripAtBlocks(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!selectors.split(',').map(s => s.trim()).includes(selector)) continue;
        for (const [, prop, value] of body.matchAll(/([\w-]+)\s*:\s*([^;]+)/g)) decls.set(prop.toLowerCase(), value.trim());
    }
    return decls;
}
const chip = ruleDeclarations(libraryCss, SELECTED_CHIP);
assert.ok((chip.has('background') || chip.has('background-color')) && chip.has('color'),
    'library.css has a base `' + SELECTED_CHIP + '` rule that sets both background and color');
const chipBackground = resolveColor(chip.get('background-color') || chip.get('background') || '') || token('--peacock-800');
const chipText = resolveColor(chip.get('color') || '') || token('--white');
expectContrast('selected filter chip', chipText, chipBackground, 4.5);
const count = ruleDeclarations(libraryCss, SELECTED_CHIP + ' .filter-count');
const countBackground = resolveColor(count.get('background-color') || count.get('background') || '') || chipBackground;
const countText = resolveColor(count.get('color') || '') || token('--zari-300');
expectContrast('selected chip count', countText, countBackground, 4.5);

console.log('PASS: fixed Grandham reader, selected-category and date-input styles, and token contrast (' + ratios.join(', ') + ').');
