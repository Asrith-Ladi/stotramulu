const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve('public');
const server = http.createServer((req,res)=>{
 const name = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname === '/' ? '/index.html' : new URL(req.url, 'http://localhost').pathname));
 if (!name.startsWith(root+path.sep)) {res.writeHead(403).end();return;}
 fs.readFile(name,(err,data)=>{if(err){res.writeHead(404).end();return;} res.setHeader('Content-Type', name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':'text/html');res.end(data);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {channel:'msedge'})});
 try {
 const page=await browser.newPage({viewport:{width:1440,height:1050},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 page.on('console',msg=>{if(msg.type()==='warning' && msg.text().includes('3D')) console.log(msg.text());});
 await page.route(/googletagmanager|gstatic.com\/firebase|firestore.googleapis/,route=>route.abort());
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});
 await page.locator('.category-filters button').first().waitFor({state:'attached'});
 assert.equal(await page.locator('.cards-section:visible').count(),0,'Home is independent from Library');
 fs.mkdirSync('docs/ui-reviews/devotional',{recursive:true});
 await page.screenshot({path:'docs/ui-reviews/devotional/home-desktop.png'});
 await page.locator('[data-home-target="library"]').click();
 await page.screenshot({path:'docs/ui-reviews/devotional/library-desktop.png'});
 const categories=page.locator('.category-filters button');
 for(let i=1;i<await categories.count();i++){
  await categories.nth(i).click();
  assert.equal(await page.locator('.cards-section:visible').count(),1,'one chosen category');
 }
 await categories.first().click();
 assert.equal(await page.locator('a.card:visible').count(),30);
 await page.locator('a.card[data-stotram="vishnu"]').click();
 await page.locator('#readerPage.active').waitFor();
 assert.ok(page.url().includes('stotram=vishnu'));
 await page.locator('.font-btn').last().click();
 await page.locator('.reader-options summary').click();
 await page.locator('#favoriteButton').click();
 assert.equal(await page.locator('#favoriteButton').getAttribute('aria-pressed'),'true');
 await page.locator('#verseJump').selectOption('2');
 await page.locator('.reader-options summary').click();
 await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
 await page.screenshot({path:'docs/ui-reviews/devotional/reader-desktop.png'});
 await page.locator('[data-home-target="library"]').click();
 await page.locator('#homePage').waitFor({state:'visible'});
 await page.locator('[data-home-target="practice"]').click();
 await page.locator('#practice button').first().click();
 await page.locator('#japamalaPage.active').waitFor();
 assert.equal(await page.locator('.jm-mode-btn').count(),4);
 for(const mode of ['flow','strand','full']) {
  await page.locator('[data-mode="'+mode+'"]').click();
  await page.locator('.jm-btn-count').click();
 }
 assert.equal(await page.locator('#jmCount').textContent(),'3');
 await page.evaluate(()=>setJmMode('hand'));
 assert.ok(await page.locator('[data-mode="flow"]').evaluate(el=>el.classList.contains('active')));
 await page.locator('[data-mode="rudraksha3d"]').click();
 await page.screenshot({path:'docs/ui-reviews/devotional/mala-3d.png'});
 assert.equal(await page.locator('#jmRudrakshaFallback').isVisible(),false,'3D shader compiles and renders');
 await page.screenshot({path:'docs/ui-reviews/devotional/mala.png'});
 await page.locator('.jm-btn-count').click();
 await page.locator('#jmRudrakshaCanvas').click();
 assert.equal(await page.locator('#jmCount').textContent(),'5','canvas tap counts exactly once');
 const canvasBox=await page.locator('#jmRudrakshaCanvas').boundingBox();
 await page.mouse.move(canvasBox.x+100,canvasBox.y+100);
 await page.mouse.down();await page.mouse.move(canvasBox.x+180,canvasBox.y+110,{steps:8});await page.mouse.up();
 assert.equal(await page.locator('#jmCount').textContent(),'5','rotation does not count');
 await page.locator('#jmRudrakshaCanvas').press('Enter');
 assert.equal(await page.locator('#jmCount').textContent(),'6');
 const canLose=await page.evaluate(()=>{
  window.testGL=document.getElementById('jmRudrakshaCanvas').getContext('webgl').getExtension('WEBGL_lose_context');
  if(window.testGL)window.testGL.loseContext();return !!window.testGL;
 });
 assert.ok(canLose,'graphics loss extension available for recovery check');
 await page.locator('#jmRudrakshaFallback').waitFor({state:'visible'});
 await page.evaluate(()=>window.testGL.restoreContext());
 await page.locator('#jmRudrakshaFallback').waitFor({state:'hidden'});
 assert.equal(await page.locator('#jmCount').textContent(),'6','graphics recovery keeps the count');
 await page.locator('.jm-btn-reset').click();await page.locator('.sc-overlay [data-yes]').click();
 await page.locator('.sc-overlay').waitFor({state:'detached'});
 assert.equal(await page.locator('#jmCount').textContent(),'0');
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'docs/ui-reviews/devotional/mala-3d-mobile.png'});
 await page.setViewportSize({width:1440,height:1050});

 await page.locator('[data-home-target="favoritesSection"]').click();
 await page.locator('#favoritesSection').waitFor({state:'visible'});
 await page.locator('[data-home-target="practice"]').click();
 assert.equal(await page.locator('.cards-section:visible').count(),0);
 await page.locator('#practice button').nth(1).click();
 await page.locator('#trackPage.active').waitFor();
 await page.locator('#prevMonthBtn').click();
 await page.locator('#nextMonthBtn').click();
 await page.screenshot({path:'docs/ui-reviews/devotional/tracker.png'});
 await page.locator('.header-utilities button').nth(1).click();
 await page.locator('#cloudAuthBox').waitFor({state:'attached'});
 await page.locator('[data-home-target="library"]').click();
 await page.reload({waitUntil:'networkidle'});
 assert.equal(await page.locator('#homePage').getAttribute('data-view'),'library');
 await page.locator('[data-home-target="favoritesSection"]').click();
 await page.goBack();
 assert.equal(await page.locator('#homePage').getAttribute('data-view'),'library');
 await page.locator('.header-utilities button').first().click();
 await page.locator('#searchInput').fill('vishnu');
 await page.locator('.search-result').first().waitFor();
 await page.screenshot({path:'docs/ui-reviews/devotional/search.png'});
 await page.keyboard.press('Escape');
 await page.locator('.footer-feedback').click();
 await page.locator('#feedbackOverlay.active').waitFor();
 await page.screenshot({path:'docs/ui-reviews/devotional/feedback.png'});
 await page.keyboard.press('Escape');
 for(const width of [320,390,768]){
  await page.setViewportSize({width,height:844});
  await page.locator('[data-home-target="homePage"]').click();
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await page.screenshot({path:'docs/ui-reviews/devotional/home-'+width+'.png'});
  const overflow=await page.evaluate(()=>[...document.querySelectorAll('#homePage *, .header *')].filter(el=>!el.closest('.hero-art') && el.getBoundingClientRect().width && getComputedStyle(el).position!=='absolute' && el.getBoundingClientRect().right > innerWidth+1).map(el=>el.className));
  assert.deepEqual(overflow,[],'no horizontal overflow at '+width);
  for(const target of ['library','favoritesSection','practice']) {
   await page.locator('[data-home-target="'+target+'"]').click();
   const panels=await page.locator('#homePage > [data-panel]:visible').evaluateAll(nodes=>[...new Set(nodes.map(n=>n.dataset.panel))]);
   assert.deepEqual(panels,[{library:'library',favoritesSection:'saved',practice:'practice'}[target]]);
   const bad=await page.evaluate(()=>[...document.querySelectorAll('#homePage *')].filter(el=>el.getBoundingClientRect().width && el.getBoundingClientRect().right>innerWidth+1).map(el=>el.className));
   assert.deepEqual(bad,[],'view fits viewport: '+target+' '+width);
   if(width===390) await page.screenshot({path:'docs/ui-reviews/devotional/'+target+'-390.png'});
  }
 }
 await page.evaluate(()=>{
 const section=document.createElement('div');section.className='cards-section';section.innerHTML='<div class="section-divider"><h2 class="section-title">New collection</h2></div><div class="cards-grid"></div>';
 document.getElementById('homePage').append(section);document.dispatchEvent(new Event('stotras-updated'));
 });
 await page.locator('[data-home-target="library"]').click();
 await page.getByRole('button',{name:'New collection'}).click();
 assert.equal(await page.locator('.cards-section:visible').count(),1,'cloud-added collection joins the filter');
 assert.deepEqual(errors,[],'no uncaught page errors');
 console.log('PASS: isolated tabs, history/reload, 30 cards, category filters, reader controls/favorites, four mala modes, 3D rendering/tap/rotation/reset/context recovery, tracker, account entry, search, feedback dismissal and every tab at 320/390/768px.');
 } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
