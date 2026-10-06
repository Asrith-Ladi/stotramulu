const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
process.chdir(path.resolve(__dirname, '..'));
const context = {window:{}};
vm.createContext(context);
for (const file of fs.readdirSync('public/data/stotras').filter(f=>f.endsWith('.js'))) {
    vm.runInContext(fs.readFileSync('public/data/stotras/'+file,'utf8'),context,{filename:file});
}
vm.runInContext(fs.readFileSync('public/data/content-audit.js','utf8'),context);
const data = context.window.STOTRAS_DATA;
assert.equal(Object.keys(data).length,32);
for (const [key,cfg] of Object.entries(data)) {
    assert.ok(context.window.CONTENT_AUDIT[key],key+' has a review note');
    const audit=context.window.CONTENT_AUDIT[key];
    assert.match(audit.reviewedOn,/^20\d{2}-\d{2}-\d{2}$/,key+' review date');
    assert.ok(Array.isArray(audit.sources)&&audit.sources.length,key+' source list');
    audit.sources.forEach(source=>assert.match(source.url,/^https:\/\//,key+' source URL'));
    assert.ok(cfg.data.every(b=>b.number&&b.text&&b.text.trim()),key+' has no empty verses');
    for (const idx of Object.keys(cfg.meanings||{})) assert.ok(cfg.data[Number(idx)],key+' meaning index');
    if (/108$/.test(key)) {
        const count=cfg.data.filter(b=>/^\d/.test(b.number)).reduce((n,b)=>n+(b.text.match(/నమః/g)||[]).length,0);
        assert.equal(count,108,key+' name count (not an authenticity test)');
    }
}
for (const [key,count] of [['lalitha',183],['suprabhatam',29],['shivasahasram',182],['ganeshasahasram',216]]) {
    const verses=data[key].data.filter(b=>/^\d+$/.test(b.number));
    assert.equal(verses.length,count);
    verses.forEach((v,i)=>assert.equal(Number(v.number),i+1));
    assert.equal(new Set(verses.map(v=>v.text)).size,count);
    assert.ok(data[key].readingVersion);
    assert.ok(verses.every(v=>!/[a-zA-Z<>]/.test(v.text)),key+' has no extraction debris');
}
assert.equal(context.window.CONTENT_AUDIT.lalitha.status,'verified');
assert.match(context.window.CONTENT_AUDIT.lalitha.scope,/1–182/);
assert.match(data.lalitha.data.find(v=>v.number==='79').text,/తాపత్రయ/);
assert.match(data.lalitha.data.find(v=>v.number==='182').text,/ఆబాల/);
assert.match(data.suprabhatam.data.find(v=>v.number==='20').text,/త్వద్గోపుర/);
const vishnuVerses=data.vishnu.data.filter(b=>/^\d/.test(b.number)).flatMap(block=>{
    const range=String(block.number).match(/^(\d+)(?:-(\d+))?$/);
    const start=Number(range[1]),end=Number(range[2]||range[1]);
    const parts=block.text.split(/\n\s*\n/).filter(Boolean);
    assert.equal(parts.length,end-start+1,'vishnu range '+block.number);
    return parts.map((text,index)=>({number:start+index,text}));
});
assert.equal(vishnuVerses.length,107);
vishnuVerses.forEach((verse,index)=>assert.equal(verse.number,index+1));
assert.match(vishnuVerses.find(verse=>verse.number===66).text,/విజితాత్మాఽవిధేయాత్మా/);
assert.ok(data.vishnu.readingVersion);
assert.equal(context.window.CONTENT_AUDIT.vishnu.status,'partial');
assert.equal(context.window.CONTENT_AUDIT.shivasahasram.status,'verified');
assert.equal(context.window.CONTENT_AUDIT.ganeshasahasram.status,'verified');
assert.match(data.shivasahasram.origin,/31–153/);
assert.match(data.ganeshasahasram.origin,/1–170/);
assert.equal(JSON.stringify(data.shivasahasram.sections.map(section=>section.index)),'[0,30,153]');
assert.equal(JSON.stringify(data.ganeshasahasram.sections.map(section=>section.index)),'[0,170]');
assert.equal(JSON.stringify(data.vishnu.sections.map(section=>section.index)),'[0,6,43]');
assert.equal(JSON.stringify(data.lalitha.sections.map(section=>section.index)),'[0,4]');
assert.ok(/readerSectionNav/.test(fs.readFileSync('index.html','utf8')));
assert.ok(/sourceStatusBadge/.test(fs.readFileSync('index.html','utf8')));
for (const file of fs.readdirSync('public/assets').filter(f=>f.endsWith('.js'))) {
    execFileSync(process.execPath,['--check',path.join('public/assets',file)]);
}
execFileSync(process.execPath,['tools/verify-reader-smoke.cjs']);
execFileSync(process.execPath,['tools/verify-worker.cjs']);
execFileSync(process.execPath,['tools/verify-japamala.cjs']);
execFileSync(process.execPath,['tools/verify-reader-theme.cjs']);
execFileSync(process.execPath,['tools/verify-meanings.cjs']);
execFileSync(process.execPath,['tools/verify-library.cjs']);
execFileSync(process.execPath,['tools/verify-reader-navigation.cjs']);
execFileSync(process.execPath,['tools/verify-verse-labels.cjs']);
execFileSync(process.execPath,['tools/verify-build-stamp.cjs']);
const html=fs.readFileSync('index.html','utf8').replace(/<!--[\s\S]*?-->/g,'');
assert.ok(html.indexOf('assets/reader.js') < html.indexOf('assets/app.js'),'reader module load order');
assert.ok(html.indexOf('assets/tracking.js') < html.indexOf('assets/app.js'),'tracking module load order');

// Stylesheets: index.html links ONE local stylesheet, styles/app.css, which @imports the layers in
// cascade order: tokens, base, components, the page files, and behavior.css LAST (docs/ARCHITECTURE.md).
const stylesheetHrefs=[...html.matchAll(/<link\b[^>]*>/gi)].map(match=>match[0])
    .filter(tag=>/\brel\s*=\s*["']?stylesheet\b/i.test(tag)).map(tag=>(tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)||[])[1]||'');
assert.deepEqual(stylesheetHrefs.filter(href=>!/^(?:[a-z]+:)?\/\//i.test(href)),['/styles/app.css'],'index.html links exactly one local stylesheet, /styles/app.css');
const stripCssComments=css=>css.replace(/\/\*[\s\S]*?\*\//g,'');
function cssImports(file){
    return [...stripCssComments(fs.readFileSync(file,'utf8')).matchAll(/@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^\s)"';]+))[^;]*;/g)].map(match=>match[1]||match[2]||match[3]);
}
// "./x.css", "../x.css" and "/styles/x.css" are local; so is a bare "x.css" when that file exists next to the importer (CSS resolves it relatively).
const isLocalCss=(spec,from='styles/app.css')=>/^(?:\.{1,2}\/|\/)/.test(spec)||(!spec.startsWith('@')&&/\.css$/i.test(spec)&&fs.existsSync(path.join(path.dirname(from),spec)));
// A bare specifier is an npm package (the self-hosted fonts). Before `npm install` it only has to be declared in package.json.
function resolvePackageCss(spec){
    const parts=spec.split('/');
    const name=parts.slice(0,spec.startsWith('@')?2:1).join('/');
    const sub=parts.slice(spec.startsWith('@')?2:1).join('/');
    const dir=path.join('node_modules',name);
    if(!fs.existsSync(dir)){
        const manifest=JSON.parse(fs.readFileSync('package.json','utf8'));
        assert.ok({...manifest.dependencies,...manifest.devDependencies}[name],'@import "'+spec+'" names a package that package.json does not declare');
        return null;
    }
    if(sub) return path.join(dir,path.extname(sub)?sub:sub+'.css');
    const pkg=JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8'));
    const dot=pkg.exports&&(typeof pkg.exports==='string'?pkg.exports:pkg.exports['.']);
    return path.join(dir,(typeof dot==='string'?dot:dot&&(dot.style||dot.default))||pkg.style||pkg.main||'index.css');
}
const appImports=cssImports('styles/app.css');
const localLayers=appImports.filter(spec=>isLocalCss(spec)).map(spec=>path.posix.basename(spec));
const FIRST_LAYERS=['tokens.css','base.css','components.css'];
const PAGE_LAYERS=['layout.css','home.css','library.css','reader.css','practice.css','japamala.css','japamala-3d.css','overlays.css'];
for(const layer of [...FIRST_LAYERS,...PAGE_LAYERS,'behavior.css']) assert.ok(localLayers.includes(layer),'styles/app.css imports '+layer);
assert.deepEqual(localLayers.slice(0,3),FIRST_LAYERS,'tokens.css, base.css and components.css load first, in that order');
assert.equal(path.posix.basename(appImports[appImports.length-1]||''),'behavior.css','behavior.css is the LAST @import in styles/app.css');
assert.equal(new Set(localLayers).size,localLayers.length,'no stylesheet is imported twice');
for(const legacy of ['styles.css','reading.css','design-system.css']) assert.ok(!localLayers.includes(legacy),'legacy '+legacy+' is not imported');
const appCssText=stripCssComments(fs.readFileSync('styles/app.css','utf8'));
assert.ok(!/\{/.test(appCssText.slice(0,appCssText.lastIndexOf('@import'))),'every @import in styles/app.css precedes all rules (a later @import is ignored)');
const tokensCss=fs.readFileSync('styles/tokens.css','utf8');
for(const name of ['--peacock-800','--zari-500','--reader-font-size','--gold-light']) assert.match(tokensCss,new RegExp(name+'\\s*:'),'tokens.css defines '+name);
const behaviorCss=stripCssComments(fs.readFileSync('styles/behavior.css','utf8'));
assert.match(behaviorCss,/\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/,'behavior.css: [hidden] { display: none !important; } always wins');
for(const view of ['home','library','saved','practice']){
    const selector='#homePage[data-view="'+view+'"] > [data-panel]:not([data-panel="'+view+'"])';
    const at=behaviorCss.indexOf(selector);
    assert.ok(at>=0,'behavior.css hides the non-'+view+' panels: '+selector);
    assert.match(behaviorCss.slice(at,behaviorCss.indexOf('}',at)+1),/\{\s*display:\s*none\s*!important;?\s*\}/,'the '+view+' panel rule is display: none !important');
}
const reducedMotion=behaviorCss.indexOf('@media (prefers-reduced-motion: reduce)');
assert.ok(reducedMotion>=0,'behavior.css has @media (prefers-reduced-motion: reduce)');
assert.match(behaviorCss.slice(reducedMotion),/animation:\s*none\s*!important[\s\S]*transition:\s*none\s*!important/,'reduced motion switches every animation and transition off');

assert.ok(!/card-btn/.test(html+fs.readFileSync('public/assets/admin.js','utf8')),'nested card buttons stay removed');
assert.equal([...html.matchAll(/<a[^>]+data-stotram="[^"]+"/g)].length,30,'all visible bundled prayer cards are semantic links');
assert.ok(!/<div[^>]+class="card(?: |")/.test(html),'no bundled prayer card remains a clickable div');
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) if(match[1].trim()) new vm.Script(match[1]);
// Every file a stylesheet pulls in exists: @import targets (followed recursively from app.css) and local url() references.
const checkedCss=new Set();
function checkStylesheet(file,from){
    if(checkedCss.has(file)) return;
    checkedCss.add(file);
    assert.ok(fs.existsSync(file),'stylesheet '+file+' exists (referenced from '+from+')');
    const css=stripCssComments(fs.readFileSync(file,'utf8'));
    const local=!file.startsWith('node_modules');
    if(local) for(const spec of cssImports(file)){
        if(/^(?:[a-z]+:)?\/\//i.test(spec)) continue;
        const target=isLocalCss(spec,file)?(spec.startsWith('/')?spec.slice(1):path.join(path.dirname(file),spec)):resolvePackageCss(spec);
        if(target) checkStylesheet(target,file);
    }
    for(const match of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/g)){
        const ref=(match[1]??match[2]??match[3]??'').replace(/[?#].*$/,'');
        if(!ref||/^(?:data:|[a-z]+:|\/\/|#)/i.test(ref)) continue;
        const candidates=ref.startsWith('/')?['public'+ref,ref.slice(1)]:[path.join(path.dirname(file),ref)];
        assert.ok(candidates.some(candidate=>fs.existsSync(candidate)),file+' url('+ref+') exists');
    }
}
for(const match of html.matchAll(/(?:src|href)="\/((?:assets|data|styles)\/[^"?#]+)"/g)) {
    const rel = match[1].startsWith('styles/') ? match[1] : 'public/'+match[1];
    assert.ok(fs.existsSync(rel),match[1]);
    if(rel.endsWith('.css')) checkStylesheet(rel,'index.html');
}
// Icons: every sprite fragment exists in public/icons.svg; every same-document <use href="#…"> has its <symbol>.
const sprite=fs.readFileSync('public/icons.svg','utf8');
for(const [,name] of html.matchAll(/href="\/icons\.svg#([\w-]+)"/g)) assert.ok(sprite.includes('id="'+name+'"'),'public/icons.svg has #'+name);
for(const [,name] of html.matchAll(/<use\b[^>]*\bhref="#([\w-]+)"/g)) assert.ok(html.includes('id="'+name+'"'),'index.html defines the <symbol id="'+name+'">');
const app=fs.readFileSync('public/assets/app.js','utf8');
const reader=fs.readFileSync('public/assets/reader.js','utf8');
const tracking=fs.readFileSync('public/assets/tracking.js','utf8');
assert.ok(app.split(/\r?\n/).length < 700,'app.js stays focused');
assert.match(reader,/function renderSlokams/);
assert.match(tracking,/function openTrack/);
assert.ok(!/headerActions/.test(app+fs.readFileSync('public/assets/japamala.js','utf8')+html),'removed header code stays deleted');
const nodes={fontSizeDisplay:{},smaller:{},larger:{}};
const storage=new Map([['readerFontSize','30']]);
const sandbox={window:{},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},document:{getElementById:id=>nodes[id],documentElement:{style:{setProperty(){}}},querySelectorAll:sel=>sel.includes('-2')?[nodes.smaller]:sel.includes('(2)')?[nodes.larger]:[]}};
vm.createContext(sandbox);
vm.runInContext('const stotramConfig = '+JSON.stringify(data)+';\n'+app.slice(app.indexOf('let currentFontSize'),app.indexOf('function createParticles')),sandbox);
function include(from,to){vm.runInContext(reader.slice(reader.indexOf(from),reader.indexOf(to,reader.indexOf(from))),sandbox);}
include('function changeFontSize','function toggleMeanings');
include('function readingKey','function readSet');
vm.runInContext('changeFontSize(0)',sandbox);assert.equal(nodes.fontSizeDisplay.textContent,30);
vm.runInContext('changeFontSize(100)',sandbox);assert.equal(nodes.fontSizeDisplay.textContent,48);assert.equal(nodes.larger.disabled,true);
vm.runInContext('changeFontSize(-100)',sandbox);assert.equal(nodes.fontSizeDisplay.textContent,18);assert.equal(nodes.smaller.disabled,true);
assert.equal(storage.get('readerFontSize'),'18');
assert.notEqual(vm.runInContext("readingKey('lalitha')",sandbox),'lalitha');
assert.equal(vm.runInContext("readingKey('shiva108')",sandbox),'shiva108');
sandbox.localStorage.setItem=()=>{throw Error('storage blocked');};vm.runInContext('changeFontSize(2)',sandbox);assert.equal(nodes.fontSizeDisplay.textContent,20);
include('function countTextLines','function labelHighestNumber');
assert.equal(vm.runInContext("countTextLines('a\\r\\nb\\n')",sandbox),2);
console.log('PASS: all 32 datasets, 183/29/107 verse sequences, 108-name counts, meaning indexes, frontend/inline syntax, one app.css entry with tokens-first/behavior-last layers, asset/import/url/icon links, font persistence/bounds/storage failure, reading-version isolation, line counts.');
