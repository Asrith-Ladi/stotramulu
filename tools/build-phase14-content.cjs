const {extractPre, namesFromLines, writeStotram} = require('./lib/namavali-generator.cjs');

const source = extractPre('tools/references/phase14-ashtalakshmi.html');

function sectionNames(sectionNumber) {
  const sections = source.split(/<h2[^>]*>/i);
  const selected = sections[sectionNumber + 1];
  if (!selected) throw new Error('section ' + sectionNumber + ': source section missing');
  return namesFromLines(selected.replace(/^.*?<\/h2>/i, ''), {label: 'section ' + sectionNumber});
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
  writeStotram(key, publishedConfig, sectionNames(sectionNumber));
}
