const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const refs = path.join(__dirname, 'references');

function loadData(key) {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'public/data/stotras', key + '.js'), 'utf8'), context);
  return JSON.parse(JSON.stringify(context.window.STOTRAS_DATA[key]));
}

function article(file) {
  const html = fs.readFileSync(path.join(refs, file), 'utf8');
  const match = html.match(/<PRE[^>]*id="content"[^>]*>([\s\S]*?)<\/PRE>/i);
  assert.ok(match, 'source content missing: ' + file);
  return match[1]
    .replace(/<h2[^>]*>[\s\S]*?<\/h2>/i, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\r/g, '')
    .trim();
}

function toTelugu(text) {
  return [...text].map(char => {
    const code = char.codePointAt(0);
    if (code === 0x950) return '\u0c13\u0c02';
    if (code === 0x964) return '|';
    if (code === 0x965) return '||';
    if (code >= 0x951 && code <= 0x954) return '';
    if (code >= 0x966 && code <= 0x96f) return String(code - 0x966);
    if (code >= 0x900 && code <= 0x97f) return String.fromCodePoint(code + 0x300);
    return char;
  }).join('')
    .replace(/\s+([|])/g, ' $1')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

function devanagariNumber(value) {
  return Number([...value].map(char => char.codePointAt(0) - 0x966).join(''));
}

function parseShiva() {
  const paragraphs = article('phase4-shiva.html').split(/\n\s*\n/);
  const pending = [];
  const verses = [];
  for (const paragraph of paragraphs) {
    if (/Proofread by/.test(paragraph)) break;
    const markers = [...paragraph.matchAll(/(?:\u0965|\u0964|\s)\s*([\u0966-\u096f]{1,3})\s*\u0965/g)];
    if (!markers.length) { pending.push(paragraph); continue; }
    const marker = markers.at(-1);
    const number = devanagariNumber(marker[1]);
    if (number < 1 || number > 182) continue;
    let body = paragraph.slice(0, marker.index).trim();
    if (pending.length) { body = pending.join('\n') + '\n' + body; pending.length = 0; }
    verses.push({ number: String(number), text: toTelugu(body) });
    if (number === 182) break;
  }
  return verses;
}

function parseGanesha() {
  const raw = article('phase4-ganeshasahasram.html');
  const markers = [...raw.matchAll(/(?:\u0965|\u0964|\s)\s*([\u0966-\u096f]{1,3})\s*\u0965/g)];
  const records = markers.map((marker, index) => ({
    number: String(devanagariNumber(marker[1])),
    text: toTelugu(raw.slice(index ? markers[index - 1].index + markers[index - 1][0].length : 0, marker.index)
      .replace(/\(var[^\n]*\)/g, '')
      .replace(/(?:end of |start of )?mAtRikA prefix names/gi, '')
      .replace(/start of 21 names/g, '')
      .replace(/(^|\n)var [^\n]*/g, '$1')
      .replace(/ var [^\n]*/g, '')
      .trim())
  }));
  for (let start = 0; start <= records.length - 216; start++) {
    const sequence = records.slice(start, start + 216);
    if (sequence.every((record, index) => Number(record.number) === index + 1)) {
      const opening = sequence[0].text.indexOf('శ్రీమహాగణపతిరువాచ');
      if (opening >= 0) sequence[0].text = sequence[0].text.slice(opening);
      return sequence;
    }
  }
  throw new Error('Ganesha 1-216 sequence missing');
}

function verify(key, expected, count) {
  const data = loadData(key);
  assert.equal(data.data.length, count, key + ' count');
  data.data.forEach((verse, index) => assert.equal(Number(verse.number), index + 1, key + ' sequence'));
  assert.deepEqual(data.data, expected, key + ' differs from selected source after Telugu conversion');
  return data;
}

const shiva = verify('shivasahasram', parseShiva(), 182);
const ganesha = verify('ganeshasahasram', parseGanesha(), 216);
assert.match(shiva.data[30].text, /స్థిరః స్థాణుః/);
assert.match(shiva.data[152].text, /విముక్తో ముక్తతేజాశ్చ/);
assert.match(shiva.data[153].text, /యథా ప్రధానం/);
assert.match(ganesha.data[169].text, /అనన్తనామా/);
assert.match(ganesha.data[170].text, /ఇతి వైనాయకం/);
assert.match(ganesha.data[215].text, /కిఙ్కిణీగణ/);

const report = {
  auditedOn: '2026-09-23',
  result: 'pass',
  unexpectedDifferences: 0,
  editions: {
    shivasahasram: {
      source: 'https://sanskritdocuments.org/doc_shiva/shivasahasMaha.html',
      numberedVerses: 182,
      sections: [
        { verses: '1-30', scope: 'introduction' },
        { verses: '31-153', scope: 'sahasranama' },
        { verses: '154-182', scope: 'phalashruti and transmission' }
      ]
    },
    ganeshasahasram: {
      source: 'https://sanskritdocuments.org/doc_ganesha/ganesha1000.html',
      numberedVerses: 216,
      sections: [
        { verses: '1-170', scope: 'sahasranama' },
        { verses: '171-216', scope: 'phalashruti and closing verses' },
        { verses: '210-212', scope: 'supplemental 21-name offering within the closing section' }
      ]
    }
  }
};
fs.writeFileSync(path.join(root, 'docs/sahasranama-collation.json'), JSON.stringify(report, null, 2) + '\n');
console.log('PASS: Shiva 1-182 and Ganesha 1-216 match their selected sources after Telugu-script conversion; no unexpected differences.');