const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const store=new Map(),nodes={},events={};
function element(){return {children:[],attributes:{},appendChild(e){this.children.push(e)},replaceChildren(){this.children=[]},setAttribute(k,v){this.attributes[k]=v},focus(){},select(){this.selected=true}}}
for(const id of ['favoriteButton','favoritesSection','readerLinkStatus','readerLinkFallback'])nodes[id]=element();
let pushes=0,last='';const location={href:'https://example.test/?campaign=one'};
const c={URL,Set,navigator:{},currentType:'lalitha',stotramConfig:{lalitha:{title:'Lalitha',data:[]},draft:{hidden:true,data:[]}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},window:{location,history:{pushState:(_,__,url)=>{pushes++;location.href=url}},addEventListener:(k,fn)=>events[k]=fn},document:{getElementById:id=>nodes[id],createElement:element,addEventListener:(k,fn)=>events[k]=fn},openReader:k=>last=k,goHome:()=>last='home'};
vm.createContext(c);vm.runInContext(fs.readFileSync('public/assets/library.js','utf8'),c);const run=s=>vm.runInContext(s,c);
run("syncReaderRoute('lalitha'); syncReaderRoute('lalitha')");assert.equal(pushes,1);assert.equal(new URL(location.href).searchParams.get('campaign'),'one');
run('toggleFavorite()');assert.deepEqual(JSON.parse(store.get('stotramFavorites')),['lalitha']);assert.equal(nodes.favoriteButton.attributes['aria-pressed'],'true');
run('favoriteKeys = loadFavorites(); renderFavorites()');assert.equal(nodes.favoritesSection.children[1].children[0].textContent,'Lalitha');
run('toggleFavorite()');assert.deepEqual(JSON.parse(store.get('stotramFavorites')),[]);
for(const k of ['__proto__','constructor','draft','missing']){location.href='https://example.test/?stotram='+k;run('applyReaderRoute()');assert.equal(last,'home')}
location.href='https://example.test/?stotram=lalitha';events.popstate();assert.equal(last,'lalitha');
store.set('stotramFavorites','broken');assert.equal(run('loadFavorites().size'),0);
c.localStorage.setItem=()=>{throw Error('blocked')};run('toggleFavorite()');assert.match(nodes.readerLinkStatus.textContent,/సేవ్ కాలేదు/);
(async()=>{await run('copyReaderLink()');assert.equal(nodes.readerLinkFallback.selected,true);let copied='';c.navigator.clipboard={writeText:async url=>copied=url};await run('copyReaderLink()');assert.equal(new URL(copied).searchParams.get('stotram'),'lalitha');assert.equal(nodes.readerLinkFallback.hidden,true);location.href='https://example.test/?stotram=cloud';c.stotramConfig.cloud={title:'Cloud',data:[]};events['stotras-updated']();assert.equal(last,'cloud');console.log('PASS: favorites, storage failures, history, invalid/hidden URLs, cloud-loaded links, clipboard and fallback.');})().catch(e=>{console.error(e);process.exitCode=1});
