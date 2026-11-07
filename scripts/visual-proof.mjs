import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
const out='.atelier/proof';mkdirSync(out,{recursive:true});
const base=pathToFileURL(resolve('ui/index.html')).href;
const results=[];
for(const [name,width,height,mode,extra] of [['desktop',1512,960,'light',''],['dark',1512,960,'dark',''],['wide',2560,1440,'light',''],['mobile',390,844,'light',''],['empty',1512,960,'light','&state=empty'],['loading',1512,960,'light','&state=loading'],['error',1512,960,'light','&state=error'],['terminals',1512,960,'light','&screen=terminals'],['terminals-dark',1512,960,'dark','&screen=terminals'],['brief',1512,960,'light','&screen=brief'],['goal-blocked',1512,960,'light','&sceneState=blocked'],['goal-paused',1512,960,'light','&sceneState=paused'],['goal-complete',1512,960,'light','&sceneState=complete'],['goal-budget',1512,960,'light','&sceneState=budget_limited']]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto(base+'?preview=1'+extra);await page.evaluate(mode=>document.documentElement.dataset.mode=mode,mode);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(150);
  assert.deepEqual(errors,[],name+': console');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+': overflow');
  await page.screenshot({path:`${out}/${name}.png`,fullPage:true});
  results.push({name,width,height,mode,errors,scenes:await page.locator('.scene svg').count()});await page.close();
}
writeFileSync(`${out}/report.json`,JSON.stringify(results,null,2));await browser.close();console.log('PASS local file render: desktop, dark, wide, mobile, empty, loading and error; no network or runtime errors');
