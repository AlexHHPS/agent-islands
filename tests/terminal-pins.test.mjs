import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.messages=[];window.webkit={messageHandlers:{native:{postMessage:m=>messages.push(m)}}}});
 const snapshot={native:true,projects:[{id:'p',name:'Portal',path:'/tmp/portal'},{id:'q',name:'Billing',path:'/tmp/billing'}],agents:['a','b','c'].map((id,i)=>({id,threadId:'thread-'+id,projectId:i===2?'q':'p',profileId:'work',name:id,harness:'codex',managed:true,processRunning:true,state:'ready'})),binaries:{codex:'/codex'},docker:{containers:[]}};
 const order=()=>page.locator('.terminal-card').evaluateAll(cards=>cards.map(c=>c.dataset.agentId));
 await page.goto(pathToFileURL(resolve('ui/index.html')).href);await page.evaluate(data=>{receiveNative({event:'snapshot',data});setView('terminals')},snapshot);
 assert.deepEqual(await order(),['a','b','c']);
 await page.evaluate(()=>{window.originalTerminal=deckTerminals.get('c').term;return new Promise(resolve=>originalTerminal.write('Keep terminal output\r\n',resolve))});
 await page.locator('[data-agent-id=c] .deck-pin').click();assert.deepEqual(await order(),['c','a','b']);assert.equal(await page.locator('[data-agent-id=c] .deck-pin').getAttribute('aria-pressed'),'true');
 assert(await page.evaluate(()=>deckTerminals.get('c').term===originalTerminal));assert.equal(await page.evaluate(()=>originalTerminal.buffer.active.getLine(0).translateToString(true)),'Keep terminal output');
 await page.locator('[data-agent-id=b] .deck-pin').focus();await page.keyboard.press('Enter');assert.deepEqual(await order(),['b','c','a']);
 await page.locator('#terminal-project').selectOption('p');assert.deepEqual(await order(),['b','a']);await page.locator('#terminal-project').selectOption('');assert.deepEqual(await order(),['b','c','a']);
 await page.locator('[data-agent-id=b] .deck-pin').click();assert.deepEqual(await order(),['c','a','b']);
 await page.evaluate(()=>I18n.setLanguage('en'));assert.equal(await page.locator('[data-agent-id=c] .deck-pin').getAttribute('aria-label'),'Unpin terminal');
 await page.reload();await page.evaluate(data=>{data.agents[2].id='reopened';receiveNative({event:'snapshot',data});setView('terminals')},structuredClone(snapshot));assert.deepEqual(await order(),['reopened','a','b'],'Pins persist by conversation, including a new process identity');
 await page.evaluate(data=>{data.projects=data.projects.filter(p=>p.id==='p');data.agents=data.agents.filter(a=>a.projectId==='p');data.activeWorkspaceId='portal';data.projectWorkspaces=[{id:'portal',name:'Portal only',projectIds:['p']}];receiveNative({event:'snapshot',data})},snapshot);assert.deepEqual(await order(),['a','b'],'Pins cannot widen workspace scope');
 assert.equal(await page.evaluate(()=>messages.filter(m=>['prompt','launch','stop','input'].includes(m.action)).length),0);assert.deepEqual(errors,[]);
 console.log('PASS terminal pins: stable ordering, keyboard control, persisted conversation identity, project/workspace scope, localization and preserved terminal instances/output');
}finally{await browser.close()}
