const fs = require('node:fs');

function extractPre(file) {
  const html = fs.readFileSync(file, 'utf8');
  const match = html.match(/<pre[^>]*id="content"[^>]*>([\s\S]*?)<\/pre>/i);
  if (!match) throw new Error(file + ': source content missing');
  return match[1];
}

function toTelugu(value) {
  return [...value].map(char => {
    const code = char.codePointAt(0);
    if (code === 0x950) return 'ఓం';
    if (code === 0x964 || code === 0x965) return '';
    if (code >= 0x951 && code <= 0x954) return '';
    if (code >= 0x966 && code <= 0x96f) return String(code - 0x966);
    if (code >= 0x900 && code <= 0x97f) return String.fromCodePoint(code + 0x300);
    return char;
  }).join('').replace(/[ \t]+/g, ' ').trim();
}

function namesFromLines(content, options = {}) {
  const rejected = options.reject || (() => false);
  const result = content
    .split(/\r?\n/)
    .map(line => line.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim())
    .filter(line => /नमः/.test(line) && !rejected(line))
    .map(line => {
      const name = line.replace(/^ॐ\s*/, '').replace(/\s*नमः.*$/, '').trim();
      return toTelugu('ॐ ' + name + ' नमः');
    });
  if (result.length !== 108) throw new Error((options.label || 'source') + ': expected 108 names, found ' + result.length);
  return result;
}

function groupNames(names) {
  return Array.from({length: 27}, (_, index) => ({
    number: String(index + 1),
    text: names.slice(index * 4, index * 4 + 4).join('\n')
  }));
}

function writeStotram(key, config, names) {
  const value = {...config, data: groupNames(names)};
  fs.writeFileSync('public/data/stotras/' + key + '108.js',
    '/* Generated from the cited Sanskrit edition; review metadata is in content-audit.js. */\n' +
    'window.STOTRAS_DATA = window.STOTRAS_DATA || {};\n' +
    'window.STOTRAS_DATA.' + key + '108 = ' + JSON.stringify(value, null, 2) + ';\n');
  console.log('PASS: ' + key + ' contains 108 names in source order.');
}

module.exports = {extractPre, namesFromLines, writeStotram};
