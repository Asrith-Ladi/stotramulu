const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const context = {window:{}};
vm.createContext(context);
vm.runInContext(fs.readFileSync('public/data/stotras/lalitha.js', 'utf8'), context);
const local = context.window.STOTRAS_DATA.lalitha.data.filter(item => /^\d+$/.test(item.number));
const html = fs.readFileSync('tools/references/lalitha.html', 'utf8');
const pre = html.match(/<pre[^>]*id="content"[^>]*>([\s\S]*?)<\/pre>/i);
assert.ok(pre, 'Lalitha source text is missing');
const source = pre[1].replace(/<h2[^>]*>[\s\S]*?<\/h2>/i, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\r/g, '');
const start = source.indexOf('ॐ श्रीमाता');
assert.ok(start >= 0, 'Main-text opening is missing');
const main = source.slice(start);
const markers = [...main.matchAll(/॥\s*([०-९]+)\s*॥/g)];
function number(value) { return Number([...value].map(char => char.codePointAt(0) - 0x966).join('')); }
function toTelugu(text) {
 return [...text].map(char => { const code=char.codePointAt(0); if(code===0x950)return 'ఓం'; if(code===0x964)return '।'; if(code===0x965)return '॥'; if(code>=0x951&&code<=0x954)return ''; if(code>=0x966&&code<=0x96f)return String(code-0x966); if(code>=0x900&&code<=0x97f)return String.fromCodePoint(code+0x300); return char; }).join('');
}
function normalize(text) { return toTelugu(text).normalize('NFC').replace(/[-‐‑–—]/g,'').replace(/[।॥|]/g,'').replace(/\s+/g,'').replace(/ఁ/g,'ం'); }
const sourceVerses=[]; let previousEnd=0;
for(const marker of markers){ const n=number(marker[1]); if(n<1)continue; if(n>183)break; sourceVerses.push({number:String(n),text:main.slice(previousEnd,marker.index).trim()}); previousEnd=marker.index+marker[0].length; if(n===183)break; }
assert.equal(sourceVerses.length,182,'Source must contain numbered verses 1-182');
const closingTail=main.slice(previousEnd);
const closingEnd=closingTail.indexOf('॥');
assert.ok(closingEnd>=0,'Unnumbered concluding verse is missing');
sourceVerses.push({number:'183',text:closingTail.slice(0,closingEnd+2).trim()});
sourceVerses.forEach((verse,index)=>assert.equal(Number(verse.number),index+1,'Source sequence'));
assert.equal(local.length,183,'Local main-text verse count');
local.forEach((verse,index)=>{ assert.equal(Number(verse.number),index+1,'Local sequence'); assert.equal(normalize(verse.text),normalize(sourceVerses[index].text),'Lalitha verse '+verse.number+' differs from selected source'); });
const report={auditedOn:'2026-09-23',result:'pass',source:'https://sanskritdocuments.org/doc_devii/lalita.html',scope:'Source-numbered verses 1-182 plus its unnumbered concluding verse, displayed locally as 183; four local dhyana verses are outside this comparison.',localMainVerses:local.length,sourceMainVerses:sourceVerses.length,missingNumbers:[],unexpectedDifferences:0};
fs.writeFileSync('docs/lalitha-collation.json',JSON.stringify(report,null,2)+'\n');
console.log('PASS: Lalitha main stotram verses 1-183 match the selected source after Telugu-script conversion; no missing numbers or unexpected differences.');

