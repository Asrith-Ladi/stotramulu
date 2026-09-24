const {extractPre, namesFromLines, writeStotram} = require('./lib/namavali-generator.cjs');

const works = {
  arunachala: {
    file: 'tools/references/phase16-arunachala.html',
    reject: line => /श्रीगणेशाय/.test(line),
    config: {
      title: 'శ్రీ అరుణాచలేశ్వర అష్టోత్తర శతనామావళి',
      subtitle: 'Sri Arunachaleshvara Ashtottara Shatanamavali',
      theme: 'shiva-theme', svgId: '#svg-shiva', svgColor: '#b86c75',
      origin: 'శ్రీ లక్ష్మణ భగవాన్ విరచిత అరుణాచలేశ్వరుని 108 నామాలు. ఆరంభ గణేశ ప్రార్థన పేరు లెక్కలో భాగం కాదు.',
      readingVersion: 'sd-arunachala-108-2026-09-24'
    }
  },
  aishwaryalakshmi: {
    file: 'tools/references/phase16-aishwaryalakshmi.html',
    config: {
      title: 'శ్రీ ఐశ్వర్యలక్ష్మీ అష్టోత్తర శతనామావళి',
      subtitle: 'Sri Aishwarya Lakshmi Ashtottara Shatanamavali',
      theme: 'lalitha-theme', svgId: '#svg-lalitha', svgColor: '#d8a32b',
      origin: 'ఐశ్వర్యలక్ష్మీ దేవి 108 నామాలు. ఎంపిక చేసిన సంస్కృత నామావళిని మూల క్రమంలో తెలుగు లిపిలో అందించాం.',
      readingVersion: 'sd-aishwaryalakshmi-108-2026-09-24'
    }
  }
};

for (const [key, work] of Object.entries(works)) {
  const content = extractPre(work.file);
  const names = namesFromLines(content, {label: key, reject: work.reject});
  writeStotram(key, work.config, names);
}
