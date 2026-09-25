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
 await page.route(/googletagmanager|gstatic.com\/firebase|firestore.googleapis/,route=>route.abort());
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});
 await page.locator('.category-filters button').first().waitFor();
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
 await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
 await page.screenshot({path:'docs/ui-reviews/devotional/reader-desktop.png'});
 await page.locator('[data-home-target="library"]').click();
 await page.locator('#homePage').waitFor({state:'visible'});
 await page.locator('[data-home-target="practice"]').click();
 await page.locator('#practice button').first().click();
 await page.locator('#japamalaPage.active').waitFor();
 await page.locator('[data-home-target="favoritesSection"]').click();
 await page.locator('#favoritesSection').waitFor({state:'visible'});
 for(const width of [320,390,768]){
  await page.setViewportSize({width,height:844});
  await page.locator('[data-home-target="homePage"]').click();
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await page.screenshot({path:'docs/ui-reviews/devotional/home-'+width+'.png'});
  const overflow=await page.evaluate(()=>[...document.querySelectorAll('#homePage *, .header *')].filter(el=>!el.closest('.hero-art') && el.getBoundingClientRect().width && getComputedStyle(el).position!=='absolute' && el.getBoundingClientRect().right > innerWidth+1).map(el=>el.className));
  assert.deepEqual(overflow,[],'no horizontal overflow at '+width);
 }
 await page.evaluate(()=>{
 const section=document.createElement('div');section.className='cards-section';section.innerHTML='<div class="section-divider"><h2 class="section-title">New collection</h2></div><div class="cards-grid"></div>';
 document.getElementById('homePage').append(section);document.dispatchEvent(new Event('stotras-updated'));
 });
 await page.getByRole('button',{name:'New collection'}).click();
 assert.equal(await page.locator('.cards-section:visible').count(),1,'cloud-added collection joins the filter');
 assert.deepEqual(errors,[],'no uncaught page errors');
 console.log('PASS: 30 library cards, every category filter, reader routes, reader-to-library, practice-to-saved, and 320/390/768px layouts.');
 } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
