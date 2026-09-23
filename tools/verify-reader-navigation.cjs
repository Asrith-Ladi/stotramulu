const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const storage = new Map();
let storageFails = false;
const elements = {
    readerProgressText: {textContent: ''},
    readerProgressBar: {max: 0, value: 0, setAttribute(name, value) { this[name] = value; }},
    verseJump: {value: '', replaceChildren() {}, appendChild() {}},
    previousVerseButton: {disabled: false},
    nextVerseButton: {disabled: false}
};
for (let i = 0; i < 3; i++) {
    elements['verse-' + i] = {
        dataset: {idx: String(i)},
        scrollIntoView() { this.scrolled = true; },
        focus() { this.focused = true; },
        getBoundingClientRect() { return {top: i * 100}; }
    };
}

const sandbox = {
    console,
    Date,
    Object,
    Number,
    JSON,
    Set,
    Math,
    currentType: 'alpha',
    stotramConfig: {
        alpha: {title: 'Alpha', data: [{number: '1'}, {number: '2'}, {number: '3'}]}
    },
    localStorage: {
        getItem(key) {
            if (storageFails) throw new Error('storage unavailable');
            return storage.has(key) ? storage.get(key) : null;
        },
        setItem(key, value) {
            if (storageFails) throw new Error('storage unavailable');
            storage.set(key, value);
        }
    },
    readSet() { return new Set(); },
    openReader() {},
    requestAnimationFrame(fn) { fn(); },
    IntersectionObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
    document: {
        getElementById(id) { return elements[id] || null; },
        querySelectorAll() { return []; },
        createElement() { return {setAttribute() {}, append() {}, appendChild() {}, replaceChildren() {}}; },
        addEventListener() {}
    },
    window: {
        CONTENT_AUDIT: {},
        innerHeight: 800,
        matchMedia() { return {matches: true}; },
        addEventListener() {}
    }
};
sandbox.window.IntersectionObserver = sandbox.IntersectionObserver;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('public/assets/reader-navigation.js', 'utf8'), sandbox);

assert.deepStrictEqual(JSON.parse(JSON.stringify(sandbox.loadReaderPositions())), {positions: {}, recent: null});
assert.strictEqual(sandbox.savedReaderPosition('missing'), null);

storage.set('stotramReaderPositions', JSON.stringify({positions: {alpha: 99}, recent: {type: 'alpha', index: 99}}));
assert.strictEqual(sandbox.savedReaderPosition('alpha'), null);

sandbox.rememberReaderPosition('alpha', 1);
assert.strictEqual(sandbox.savedReaderPosition('alpha'), 1);
const saved = JSON.parse(storage.get('stotramReaderPositions'));
assert.deepStrictEqual(saved.positions, {alpha: 1});
assert.strictEqual(saved.recent.type, 'alpha');
assert.strictEqual(saved.recent.index, 1);

sandbox.setCurrentVersePosition(1, false);
assert.strictEqual(elements.readerProgressText.textContent, 'శ్లోకం 2 / 3');
assert.strictEqual(elements.readerProgressBar.value, 2);
assert.strictEqual(elements.readerProgressBar.max, 3);
assert.strictEqual(elements.previousVerseButton.disabled, false);
assert.strictEqual(elements.nextVerseButton.disabled, false);

sandbox.nextVerse();
assert.strictEqual(elements['verse-2'].scrolled, true);
assert.strictEqual(sandbox.savedReaderPosition('alpha'), 2);
assert.strictEqual(elements.nextVerseButton.disabled, true);

storage.set('stotramReaderPositions', '{bad json');
assert.deepStrictEqual(JSON.parse(JSON.stringify(sandbox.loadReaderPositions())), {positions: {}, recent: null});
storageFails = true;
assert.doesNotThrow(() => sandbox.rememberReaderPosition('alpha', 0));
assert.doesNotThrow(() => sandbox.loadReaderPositions());

console.log('PASS: reader positions validate bounds, update progress, navigate, and tolerate unavailable storage.');
