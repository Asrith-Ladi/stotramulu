const fs = require('node:fs');

function sourceHtml() {
  const html = fs.readFileSync('tools/references/phase14-ashtalakshmi.html', 'utf8');
  const match = html.match(/<pre[^>]*id="content"[^>]*>([\s\S]*?)<\/pre>/i);
  if (!match) throw new Error('Ashtalakshmi source content missing');
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

function names(sectionNumber) {
  const sections = sourceHtml().split(/<h2[^>]*>/i);
  const selected = sections[sectionNumber + 1];
  if (!selected) throw new Error(`section ${sectionNumber}: source section missing`);
  const result = selected
    .replace(/^.*?<\/h2>/i, '')
    .split(/\r?\n/)
    .map(line => line.replace(/<[^>]+>/g, '').trim())
    .filter(line => /नमः/.test(line))
    .map(line => {
      const name = line.replace(/^ॐ\s*/, '').replace(/\s*नमः.*$/, '').trim();
      return toTelugu('ॐ ' + name + ' नमः');
    });
  if (result.length !== 108) throw new Error(`section ${sectionNumber}: expected 108 names, found ${result.length}`);
  return Array.from({length: 27}, (_, index) => ({
    number: String(index + 1),
    text: result.slice(index * 4, index * 4 + 4).join('\n')
  }));
}

const configs = {
  adilakshmi: {
    sectionNumber: 1,
    title: 'శ్రీ ఆదిలక్ష్మీ అష్టోత్తర శతనామావళి',
    subtitle: 'Sri Adi Lakshmi Ashtottara Shatanamavali',
    theme: 'lalitha-theme', svgId: '#svg-lalitha', svgColor: '#d8a32b',
    origin: 'ఆదిలక్ష్మీ దేవి 108 నామాలు. ఎంపిక చేసిన సంస్కృత నామావళిని మూల క్రమంలో తెలుగు లిపిలో అందించాం.',
    readingVersion: 'sd-adilakshmi-108-2026-09-24'
  },
  vijayalakshmi: {
    sectionNumber: 6,
    title: 'శ్రీ విజయలక్ష్మీ అష్టోత్తర శతనామావళి',
    subtitle: 'Sri Vijaya Lakshmi Ashtottara Shatanamavali',
    theme: 'lalitha-theme', svgId: '#svg-lalitha', svgColor: '#d8a32b',
    origin: 'విజయలక్ష్మీ దేవి 108 నామాలు. ఎంపిక చేసిన సంస్కృత నామావళిని మూల క్రమంలో తెలుగు లిపిలో అందించాం.',
    readingVersion: 'sd-vijayalakshmi-108-2026-09-24'
  }
};

for (const [key, config] of Object.entries(configs)) {
  const {sectionNumber, ...publishedConfig} = config;
  const value = {...publishedConfig, data: names(sectionNumber)};
  fs.writeFileSync(`public/data/stotras/${key}108.js`,
    '/* Generated from the cited Sanskrit edition; review metadata is in content-audit.js. */\n' +
    'window.STOTRAS_DATA = window.STOTRAS_DATA || {};\n' +
    `window.STOTRAS_DATA.${key}108 = ${JSON.stringify(value, null, 2)};\n`);
  console.log(`PASS: ${key} contains 108 names in source order.`);
}


