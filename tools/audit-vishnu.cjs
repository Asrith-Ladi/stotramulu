const fs = require('node:fs');
const vm = require('node:vm');

const context = {window: {}};
vm.createContext(context);
vm.runInContext(fs.readFileSync('public/data/stotras/vishnu.js', 'utf8'), context, {filename: 'vishnu.js'});
const localData = context.window.STOTRAS_DATA.vishnu.data;

function expandLocal(data) {
    const verses = [];
    for (const item of data) {
        const label = String(item.number);
        if (/^\d+$/.test(label)) {
            verses.push({number: Number(label), text: item.text});
            continue;
        }
        const range = label.match(/^(\d+)-(\d+)$/);
        if (!range) continue;
        const parts = item.text.split(/\n\s*\n/).filter(Boolean);
        const start = Number(range[1]);
        const end = Number(range[2]);
        if (parts.length !== end - start + 1) {
            throw new Error(`Local range ${label} has ${parts.length} paragraphs`);
        }
        parts.forEach((text, index) => verses.push({number: start + index, text}));
    }
    return verses;
}

function devanagariNumber(value) {
    return Number([...value].map(char => char.codePointAt(0) - 0x966).join(''));
}

function extractReference() {
    const source = fs.readFileSync('tools/references/vishnu.txt', 'utf8');
    const opening = 'ఓం విశ్వం విష్ణుర్వషట్కారో';
    const start = source.indexOf(opening);
    if (start < 0) throw new Error('Reference main-text opening not found');
    const body = source.slice(start);
    const verses = [];
    const matcher = /([\s\S]*?)॥\s*([०-९]+)॥/g;
    let match;
    while ((match = matcher.exec(body))) {
        const number = devanagariNumber(match[2]);
        if (number !== verses.length + 1) break;
        verses.push({
            number,
            text: match[1].trim().replace(/^ఓం\s+/, number === 1 ? 'ఓం ' : '')
        });
        if (number === 107) break;
    }
    if (verses.length !== 107) throw new Error(`Reference sequence has ${verses.length} verses`);
    return verses;
}

function normalize(text) {
    return text.normalize('NFC')
        .replace(/^\s*ఓం\s*/, '')
        .replace(/[|।॥\s\p{P}\p{N}\u200c\u200d\u200b]/gu, '')
        .replace(/[ఙఞణనమ]్(?=[క-హ])/g, 'ం')
        .replaceAll('ళ', 'ల');
}

const local = expandLocal(localData);
const reference = extractReference();
if (local.length !== 107) throw new Error(`Local main text has ${local.length} verses`);
if (local.some((verse, index) => verse.number !== index + 1)) throw new Error('Local numbering is not continuous');

const acceptedVariants = {
    7: 'Sandhi and anusvara spelling; the temple comparison agrees with the local reading.',
    12: 'Recorded edition difference: sammita/asammita. The temple comparison agrees with the local sammita reading.',
    38: 'Consonant-doubling orthography only: mahardhi/maharddhi.',
    42: 'Consonant-doubling orthography only: parardhi/pararddhi.',
    43: 'The source includes an inline alternate reading; the local text retains its main reading.',
    55: 'The source carries an editorial viniyojyah note from verse 54 into extraction; the verse text agrees after ordinary script folding.',
    60: 'Avagraha and sandhi typography only.',
    61: 'The source explicitly records divispṛk as an alternate; the local text uses that recorded variant.',
    62: 'The source carries the verse 61 alternate note into extraction; remaining differences are conjunct spelling.',
    65: 'Chandrabindu/anusvara typography only.',
    86: 'Recorded hṛda/hrada edition difference; the temple comparison agrees with the local hṛda reading.',
    88: 'Avagraha sandhi and conjunct spelling only.',
    105: 'Final-consonant sandhi reading bhuk/bhug; the temple comparison agrees with local bhuk.'
};
const differences = local.map((verse, index) => ({
    number: verse.number,
    local: verse.text,
    reference: reference[index].text
})).filter(row => normalize(row.local) !== normalize(row.reference))
  .map(row => ({...row, disposition: acceptedVariants[row.number] || 'Unexpected difference'}));
const unexpected = differences.filter(row => !acceptedVariants[row.number]);
const verse66 = local.find(row => row.number === 66);
if (!verse66 || !verse66.text.includes('విజితాత్మాఽవిధేయాత్మా')) {
    throw new Error('Verse 66 correction is missing');
}
if (unexpected.length) {
    throw new Error('Unexpected Vishnu differences: ' + unexpected.map(row => row.number).join(', '));
}

const report = {
    sources: [
        'https://sanskritdocuments.org/doc_vishhnu/vsahasranew.html',
        'https://www.ohtccwa.org/pooja_library/vishnu_sahasranamam_te'
    ],
    editionScope: 'Main stotram verses 1-107 only',
    localVerseCount: local.length,
    referenceVerseCount: reference.length,
    exactAfterNormalization: local.length - differences.length,
    acceptedVariantCount: differences.length,
    unexpectedDifferenceCount: unexpected.length,
    verifiedVerseCount: unexpected.length ? 0 : local.length,
    correction: {
        verse: 66,
        before: 'విజితాత్మా విధేయాత్మా',
        after: 'విజితాత్మాఽవిధేయాత్మా',
        basis: 'Both comparison sources include the initial a in avidheyatma.'
    },
    normalization: 'Spacing, danda marks, punctuation, numerals, joiners, common anusvara conjunct spelling, and Telugu la/lla are folded.',
    acceptedVariants: differences
};
fs.writeFileSync('docs/vishnu-collation.json', JSON.stringify(report, null, 2) + '\n');
console.log(`PASS: Vishnu main text has ${local.length} continuous verses; verse 66 is corrected; ${differences.length} known edition/script variants; no unexpected differences.`);
