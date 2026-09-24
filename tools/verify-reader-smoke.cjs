const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

function between(source, start, end) {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from + start.length);
    assert.ok(from >= 0 && to > from, 'missing source boundary: ' + start);
    return source.slice(from, to);
}

const elements = new Map();
function element(id) {
    if (!elements.has(id)) {
        const classes = new Set();
        elements.set(id, {
            id,
            hidden: false,
            innerHTML: '',
            textContent: '',
            className: '',
            style: {},
            children: [],
            classList: {
                add: value => classes.add(value),
                remove: value => classes.delete(value),
                contains: value => classes.has(value),
                toggle: (value, on) => on ? classes.add(value) : classes.delete(value)
            },
            appendChild(child) { this.children.push(child); },
            setAttribute(name, value) { this[name] = value; }
        });
    }
    return elements.get(id);
}

const app = fs.readFileSync('public/assets/app.js', 'utf8');
const openReaderSource = between(app, 'function openReader(type)', 'function goHome()');
const goHomeSource = between(app, 'function goHome()', "window.addEventListener('scroll'");

let rendered = 0;
let stopped = 0;
const context = {
    window: {scrollTo() {}},
    document: {
        body: {style:{}},
        getElementById: element,
        createElement: tag => element('created-' + tag)
    },
    console,
    renderSlokams(data, type) {
        assert.equal(type, 'demo');
        assert.equal(data.length, 1);
        rendered++;
    },
    setupReaderNavigation() {},
    initStotramCounter() {},
    clearReaderSearch() {},
    changeFontSize() {},
    syncReaderRoute() {},
    gaEvent() {},
    stopReaderPositionTracking() { stopped++; },
    renderHomePradakshina() {}
};
vm.createContext(context);
vm.runInContext(
    "const stotramConfig={demo:{title:'Demo',subtitle:'Test',theme:'demo-theme',svgColor:'#fff',svgId:'#demo',data:[{number:'1',text:'text'}]}};" +
    "const origins={demo:'origin'};let currentType=null;let activeDay=null;" +
    openReaderSource + goHomeSource,
    context
);

vm.runInContext("openReader('demo')", context);
assert.equal(rendered, 1, 'opening a prayer renders content');
assert.equal(element('homePage').style.display, 'none');
assert.equal(element('readerPage').classList.contains('active'), true);
assert.equal(element('readerTitle').textContent, 'Demo');

vm.runInContext('goHome()', context);
assert.equal(stopped, 1);
assert.equal(element('homePage').style.display, 'flex');
assert.equal(element('readerPage').classList.contains('active'), false);
assert.equal(vm.runInContext('currentType', context), null);

const reader = fs.readFileSync('public/assets/reader.js', 'utf8');
const renderSource = between(reader, 'function renderSlokams(data, type)', '/* ============================================================');
const emptyContext = {
    document: {
        getElementById: () => element('empty-container'),
        createElement: tag => element('empty-' + tag)
    },
    Array
};
vm.createContext(emptyContext);
vm.runInContext(renderSource, emptyContext);
assert.equal(vm.runInContext("renderSlokams([], 'empty')", emptyContext), false);
assert.equal(element('empty-container').children.at(-1).className, 'reader-empty-state');

console.log('PASS: Home opens a prayer with rendered content, returns safely, and empty datasets show a helpful state.');
