const fs=require('node:fs'),vm=require('node:vm');const c={window:{}};vm.createContext(c);for(const f of fs.readdirSync('public/data/stotras').filter(f=>f.endsWith('.js')))vm.runInContext(fs.readFileSync('public/data/stotras/'+f,'utf8'),c);
const te=s=>s.replace(/[\u0900-\u0963]/g,ch=>ch==='ॐ'?'ఓం':String.fromCharCode(ch.charCodeAt(0)+0x300));
const norm=s=>s.normalize('NFC').replace(/[\s\p{P}\p{N}\u200c\u200d\u200b]/gu,'').replace(/[ఙఞణనమ]్(?=[క-హ])/g,'ం').replaceAll('ళ','ల').replace(/^ఓం/,'').replace(/నమః$/,'');
const sources=require('./references/name-sources.json');let report={};
for(const [key,path]of Object.entries(sources)){
const h=fs.readFileSync('tools/references/'+key+'.html','utf8');const p=h.match(/<pre[^>]*id="content"[^>]*>([\s\S]*?)<\/pre>/i)?.[1]||h.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i)?.[1]||'';
let names=[...p.replace(/<[^>]*>/g,'').matchAll(/(?:ॐ|ओं)\s*([^\n]*?)नमः/g)].map(m=>te(m[1]));
if(key==='lalitha108') names=[...p.matchAll(/([^\n]+?) नमो नमः/g)].map(m=>te(m[1]));
if(key==='ayyappa108') {
 const body=p.slice(p.indexOf('ॐ महाशास्त्रे'),p.indexOf('॥ १०८',p.indexOf('ॐ महाशास्त्रे')));
 names=body.replace('त्रिलोकरक्षकाय धन्विने','त्रिलोकरक्षकाय । धन्विने').split(/[।॥]/).map(t=>t.replace(/<[^>]*>|[०-९]|ॐ|नमः/g,'').trim()).filter(Boolean).map(te);
}
names=names.map(n=>n.replace(/\([^)]*\)/g,'').trim());
const local=c.window.STOTRAS_DATA[key].data.filter(b=>/^\d/.test(b.number)).flatMap(b=>b.text.split('\n')).filter(x=>x.includes('నమః'));
const refSet=new Set(names.map(norm)), ownSet=new Set(local.map(norm));
report[key]={source:'https://sanskritdocuments.org/'+path,localCount:local.length,referenceCount:names.length,normalizedMatches:local.filter(x=>refSet.has(norm(x))).length,localDifferences:local.map((text,i)=>({name:i+1,text})).filter(x=>!refSet.has(norm(x.text))),referenceDifferences:names.map((text,i)=>({name:i+1,text})).filter(x=>!ownSet.has(norm(x.text))),duplicates:local.filter((x,i)=>local.findIndex(y=>norm(y)===norm(x))<i)};
console.log(key,JSON.stringify({local:local.length,ref:names.length,matches:report[key].normalizedMatches,duplicates:report[key].duplicates}));
}
fs.writeFileSync('docs/namavali-comparison.json',JSON.stringify(report,null,2));
for(const key of ['vishnu','bilvashtakam','lingashtakam','chalisa']) {const h=fs.readFileSync('tools/references/'+key+'.html','utf8');const p=h.match(/<pre[^>]*id="content"[^>]*>([\s\S]*?)<\/pre>/i)?.[1]||'';fs.writeFileSync('tools/references/'+key+'.txt',te(p.replace(/<[^>]*>/g,'')));console.log(key,'reference text',p.length);}
