const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const dataContext = {window: {}};
vm.createContext(dataContext);
for (const file of fs.readdirSync('public/data/stotras').filter(file => file.endsWith('.js'))) {
    vm.runInContext(fs.readFileSync('public/data/stotras/' + file, 'utf8'), dataContext, {filename: file});
}
vm.runInContext(fs.readFileSync('public/data/content-audit.js', 'utf8'), dataContext);
const data = dataContext.window.STOTRAS_DATA;
const audits = dataContext.window.CONTENT_AUDIT;

let totalBlocks = 0;
let totalMeanings = 0;
const withMeanings = [];
for (const [key, cfg] of Object.entries(data)) {
    const available = Object.entries(cfg.meanings || {}).filter(([index, meaning]) =>
        Number.isInteger(Number(index)) && Number(index) >= 0 && Number(index) < cfg.data.length && String(meaning || '').trim()
    ).length;
    totalBlocks += cfg.data.length;
    totalMeanings += available;
    if (!available) continue;
    withMeanings.push(key);
    const audit = audits[key] && audits[key].meaningAudit;
    assert.ok(audit, key + ' has separate meaning audit metadata');
    assert.equal(audit.available, available, key + ' meaning count metadata');
    assert.equal(audit.total, cfg.data.length, key + ' block count metadata');
    assert.equal(audit.status, 'reference', key + ' does not overclaim semantic verification');
    assert.match(audit.checkedOn, /^20\d{2}-\d{2}-\d{2}$/, key + ' meaning-source check date');
    assert.ok(Array.isArray(audit.sources) && audit.sources.length, key + ' meaning source list');
    audit.sources.forEach(source => assert.match(source.url, /^https:\/\//, key + ' meaning source URL'));
}
assert.deepEqual(withMeanings.sort(), ['bilvashtakam', 'lalitha', 'lingashtakam', 'vishnu']);
assert.equal(totalBlocks, 1267, 'published block total');
assert.equal(totalMeanings, 65, 'meaning block total');

const nav = fs.readFileSync('public/assets/reader-navigation.js', 'utf8');
const helperSource = nav.slice(nav.indexOf('function readerMeaningCoverage'), nav.indexOf('function setupReaderNavigation'));
const label = {};
const elements = {
    meaningToggle: {hidden: false, attrs: {}, setAttribute(key, value) { this.attrs[key] = value; }, querySelector() { return label; }},
    meaningToggleRow: {hidden: false},
    readerOptionsSummary: {}
};
const uiContext = {
    stotramConfig: data,
    document: {getElementById(id) { return elements[id] || null; }, createElement() { return {}; }}
};
vm.createContext(uiContext);
vm.runInContext(helperSource, uiContext);
let coverage = uiContext.setupMeaningAvailability('lingashtakam');
assert.deepEqual(JSON.parse(JSON.stringify(coverage)), {available: 8, total: 9});
assert.equal(elements.meaningToggle.hidden, false);
assert.equal(label.textContent, 'అర్థం చూపించు (8/9)');
coverage = uiContext.setupMeaningAvailability('sai108');
assert.equal(coverage.available, 0);
assert.equal(elements.meaningToggle.hidden, true);
assert.equal(elements.meaningToggleRow.hidden, true);
assert.equal(elements.readerOptionsSummary.textContent, 'శ్లోకం, సేవ్, లెక్క');
assert.match(nav, /appendMeaningReview\(content, type, audit\)/, 'source panel renders meaning audit');

console.log('PASS: 65/1267 meaning coverage is explicit, four reference sets cite sources, and unavailable controls stay hidden.');