const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const context = {window:{}};
vm.createContext(context);
for (const file of fs.readdirSync('public/data/stotras').filter(f=>f.endsWith('.js'))) {
    vm.runInContext(fs.readFileSync('public/data/stotras/'+file,'utf8'),context,{filename:file});
}
vm.runInContext(fs.readFileSync('public/data/content-audit.js','utf8'),context);
const data = context.window.STOTRAS_DATA;
assert.equal(Object.keys(data).length,26);
for (const [key,cfg] of Object.entries(data)) {
    assert.ok(context.window.CONTENT_AUDIT[key],key+' has a review note');
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
assert.ok(/sourceStatusBadge/.test(fs.readFileSync('public/index.html','utf8')));
for (const file of fs.readdirSync('public/assets').filter(f=>f.endsWith('.js'))) {
    execFileSync(process.execPath,['--check',path.join('public/assets',file)]);
}
const html=fs.readFileSync('public/index.html','utf8').replace(/<!--[\s\S]*?-->/g,'');
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) if(match[1].trim()) new vm.Script(match[1]);
for(const match of html.matchAll(/(?:src|href)="((?:assets|data)\/[^"?#]+)"/g)) assert.ok(fs.existsSync('public/'+match[1]),match[1]);
const app=fs.readFileSync('public/assets/app.js','utf8');
const nodes={fontSizeDisplay:{},smaller:{},larger:{}};
const storage=new Map([['readerFontSize','30']]);
const sandbox={window:{},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},document:{getElementById:id=>nodes[id],documentElement:{style:{setProperty(){}}},querySelectorAll:sel=>sel.includes('-2')?[nodes.smaller]:sel.includes('(2)')?[nodes.larger]:[]}};
vm.createContext(sandbox);
vm.runInContext('const stotramConfig = '+JSON.stringify(data)+';\n'+app.slice(app.indexOf('let currentFontSize'),app.indexOf('function createParticles')),sandbox);
function include(from,to){vm.runInContext(app.slice(app.indexOf(from),app.indexOf(to,app.indexOf(from))),sandbox);}
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
console.log('PASS: all 26 datasets, 183/29/107 verse sequences, 108-name counts, meaning indexes, frontend/inline syntax, asset links, font persistence/bounds/storage failure, reading-version isolation, line counts.');
