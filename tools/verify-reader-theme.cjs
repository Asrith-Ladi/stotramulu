const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('public/index.html', 'utf8');
const reader = fs.readFileSync('public/assets/reader.js', 'utf8');
const app = fs.readFileSync('public/assets/app.js', 'utf8');
const readingCss = fs.readFileSync('public/assets/reading.css', 'utf8');
const designCss = fs.readFileSync('public/assets/design-system.css', 'utf8');

assert.match(html, /<body class="grandham">/, 'Grandham presentation is always active');
assert.doesNotMatch(html, /grandhamToggle|toggleGrandham/, 'reader has no redundant Grandham toggle');
assert.doesNotMatch(reader + app + html, /localStorage\.getItem\(['"]grandham['"]\)|initGrandham|toggleGrandham/, 'old Grandham preference path is removed');
assert.doesNotMatch(html, /గ్రంథ రూపం, శ్లోకం/, 'reader options summary no longer advertises a removed control');

assert.match(designCss, /\.category-filters button\[aria-pressed="true"\]/, 'category selection has an explicit visual state');
assert.match(designCss, /\.home-page input\[type="date"\]\s*\{[^}]*color-scheme:\s*dark;/, 'date input remains legible on the dark counter');

function luminance(hex) {
    const rgb = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
        .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
function contrast(foreground, background) {
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
}
assert.ok(contrast('#526256', '#f7f5ef') >= 4.5, 'category text meets AA normal-text contrast');
assert.ok(contrast('#fff9e9', '#173e35') >= 7, 'selected category exceeds AAA normal-text contrast');

console.log('PASS: fixed Grandham reader and high-contrast Home category controls.');