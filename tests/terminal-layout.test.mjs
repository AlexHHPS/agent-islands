import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1512,height:960}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(pathToFileURL(resolve('ui/index.html')).href+'?preview=1&screen=conversation');
await page.evaluate(()=>document.fonts.ready);
for(const [width,height] of [[1512,960],[1080,720],[1512,960]]){
  await page.setViewportSize({width,height});
  await page.evaluate(()=>{document.querySelectorAll('#agent-context details').forEach(d=>d.open=true);fitTerminal()});
  await page.waitForTimeout(150);
  const metrics=await page.evaluate(()=>{
    const surface=document.querySelector('#terminal-surface').getBoundingClientRect(),screen=document.querySelector('#terminal-surface .xterm-screen').getBoundingClientRect(),panel=document.querySelector('#agent-view').getBoundingClientRect(),composer=document.querySelector('#composer').getBoundingClientRect();
    return {rows:terminal.rows,cols:terminal.cols,screen:{left:screen.left,right:screen.right,bottom:screen.bottom},surface:{left:surface.left,right:surface.right,bottom:surface.bottom},panelBottom:panel.bottom,composerBottom:composer.bottom};
  });
  assert(metrics.rows>=2);assert(metrics.cols>=20);
  assert(metrics.screen.bottom<=metrics.surface.bottom+1,`Last terminal row is clipped at ${width}x${height}: ${JSON.stringify(metrics)}`);
  assert(metrics.screen.right<=metrics.surface.right+1,`Last terminal column is clipped at ${width}x${height}`);
  assert(metrics.composerBottom<=metrics.panelBottom+1,'Composer must fit inside the window');
}
await page.locator('#expand-terminal').click();
await page.evaluate(()=>fitTerminal());
assert(await page.locator('#terminal-surface').evaluate(e=>e.clientWidth>1000));
await page.locator('[data-view="terminals"]').click();
await page.evaluate(()=>fitDeck());
const decks=await page.evaluate(()=>[...document.querySelectorAll('.deck-terminal .terminal-surface')].map(e=>{const outer=e.getBoundingClientRect(),screen=e.querySelector('.xterm-screen').getBoundingClientRect();return {width:outer.width,height:outer.height,right:screen.right-outer.right,bottom:screen.bottom-outer.bottom}}));
assert(decks.length>=2);
for(const d of decks){assert(d.width>0&&d.height>0);assert(d.right<=1&&d.bottom<=1,JSON.stringify(d))}
assert.deepEqual(errors,[]);
console.log('PASS terminal layout: last row/column visible at 1512x960 and 1080x720, expanded context, full window and terminal mosaic');
await browser.close();
