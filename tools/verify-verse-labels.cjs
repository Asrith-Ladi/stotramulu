// Verse labels in the admin editor (admin-dashboard.js parseVerses / joinVerses).
// Runs the editor's own two functions, cut out of the file, in a sandbox:
//  - every built-in stotram survives "open in the editor, save" with the same
//    verses and labels (those whose verse text holds blank lines are kept by
//    the editor's "unchanged" path instead, so they are only counted here);
//  - [label] lines become labels, other verses are numbered 1, 2, 3…, and
//    adding a verse keeps the labels.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'admin-dashboard.js'), 'utf8');
const from = src.indexOf('  function splitVerses(raw)');
const to = src.indexOf('  function sameVerses(a, b)');
assert.ok(from > 0 && to > from, 'parseVerses / joinVerses found in admin-dashboard.js');
const box = {};
vm.createContext(box);
vm.runInContext(src.slice(from, to) + '\nthis.parseVerses = parseVerses; this.joinVerses = joinVerses;', box);
const { parseVerses, joinVerses } = box;
const plain = (v) => JSON.parse(JSON.stringify(v));

// 1. The song example from the owner's guide.
const song = '[పల్లవి]\nశ్రీ రామ జయ రామ జయ జయ రామ\n\nమొదటి చరణం\n\nరెండో చరణం';
assert.deepEqual(plain(parseVerses(song)).map((v) => v.number), ['పల్లవి', '1', '2']);
assert.equal(parseVerses(song)[0].text, 'శ్రీ రామ జయ రామ జయ జయ రామ', 'the label line is not part of the verse');
assert.equal(joinVerses(parseVerses(song)), song, 'a song opens in the editor exactly as it was typed');
// Adding a verse at the top keeps the label and renumbers only the plain verses.
assert.deepEqual(plain(parseVerses('కొత్త మొదటి భాగం\n\n' + joinVerses(parseVerses(song)))).map((v) => v.number), ['1', 'పల్లవి', '2', '3']);
// A label written with a blank line after it belongs to the next verse.
assert.deepEqual(plain(parseVerses('[ధ్యానం]\n\nశుక్లాంబరధరం\n\nమొదటి శ్లోకం')).map((v) => v.number), ['ధ్యానం', '1']);
// Windows line endings, spaces around the label, and a [bracket] inside a verse.
assert.deepEqual(plain(parseVerses('[ ఫలశ్రుతి ]\r\nఫలం\r\n\r\nవిష్ణువు [నారాయణుడు] రక్షించుగాక')), [{ number: 'ఫలశ్రుతి', text: 'ఫలం' }, { number: '1', text: 'విష్ణువు [నారాయణుడు] రక్షించుగాక' }]);
assert.equal(parseVerses('').length, 0);

// 2. Every built-in stotram round-trips: labels, numbering and two-part verses
// (their inner blank line is shown as a "~" line in the editor).
const W = { STOTRAS_DATA: {} };
const dataDir = path.join(__dirname, '..', 'public', 'data', 'stotras');
for (const f of fs.readdirSync(dataDir).filter((f) => f.endsWith('.js'))) {
  vm.runInNewContext(fs.readFileSync(path.join(dataDir, f), 'utf8'), { window: W });
}
let checked = 0, labels = 0, twoPart = 0;
for (const [key, cfg] of Object.entries(W.STOTRAS_DATA)) {
  // plain(): the stotra files ran in another context, so compare as plain data.
  const data = plain((cfg.data || []).map((v) => ({
    number: v.number == null ? '' : String(v.number),
    text: String(v.text).replace(/\r\n?/g, '\n').trim().replace(/\n\s*\n/g, '\n\n'),
  })));
  const back = plain(parseVerses(joinVerses(data)));
  assert.deepEqual(back, data, key + ': opening and saving in the editor changes nothing');
  labels += data.filter((v) => !/^\d+$/.test(v.number)).length;
  twoPart += data.filter((v) => v.text.includes('\n\n')).length;
  checked++;
}
assert.equal(checked, Object.keys(W.STOTRAS_DATA).length);
assert.ok(checked >= 30, 'all built-in stotras checked (' + checked + ')');
// The "~" line in the editor text.
assert.match(joinVerses([{ number: 'సమర్పణం', text: 'మొదటి భాగం\n\nరెండో భాగం' }]), /^\[సమర్పణం\]\nమొదటి భాగం\n~\nరెండో భాగం$/);
assert.deepEqual(plain(parseVerses('పల్లవి పాఠం\n~\nరెండో భాగం\n\nచరణం')).map((v) => v.text), ['పల్లవి పాఠం\n\nరెండో భాగం', 'చరణం']);
console.log('PASS: verse labels — [label] lines, numbering, labels kept when verses are added, "~" two-part verses; all ' + checked + ' built-in stotras round-trip (' + labels + ' labels, ' + twoPart + ' two-part verses).');
