import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
// The native side holds terminal output while the window is hidden and sends one
// terminalReplay per session when it returns. Both the mosaic card and the open
// terminal must show the replayed screen, never the stale one or a duplicate.
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1512,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.messages=[];window.webkit={messageHandlers:{native:{postMessage:m=>messages.push(m)}}}});
 const agents=['codex','claude'].map((harness,i)=>({id:'a'+i,name:'Agent '+i,projectId:'p',harness,managed:true,processRunning:true,state:'active'}));
 const snapshot={native:true,projects:[{id:'p',name:'Product',path:'/tmp/product'}],agents,binaries:{codex:'/codex',claude:'/claude'},docker:{containers:[]}};
 const b64=text=>Buffer.from(text).toString('base64');
 const screen=(id,where)=>page.evaluate(([id,where])=>new Promise(done=>{const term=where==='deck'?deckTerminals.get(id).term:terminal;term.write('',()=>{const lines=[];for(let i=0;i<term.buffer.active.length;i++)lines.push(term.buffer.active.getLine(i).translateToString(true));done(lines.join('\n'))})}),[id,where]);
 await page.goto(pathToFileURL(resolve('ui/index.html')).href);
 await page.evaluate(data=>{receiveNative({event:'snapshot',data});setView('terminals')},snapshot);
 await page.evaluate(()=>selectAgent('a0'));
 await page.evaluate(bytes=>receiveNative({event:'terminalReset',data:{id:'a0',bytes}}),b64('stale screen\r\n'));
 await page.evaluate(bytes=>receiveNative({event:'terminal',data:{id:'a0',cols:90,rows:28,bytes}}),b64('before sleep\r\n'));
 assert((await screen('a0','main')).includes('before sleep'));
 await page.evaluate(bytes=>receiveNative({event:'terminalReplay',data:{id:'a0',cols:90,rows:28,bytes}}),b64('history line\r\nafter wake\r\n'));
 const main=await screen('a0','main'),deck=await screen('a0','deck');
 assert(main.includes('after wake'),'The open terminal shows the replayed screen');
 assert(!main.includes('stale screen')&&!main.includes('before sleep'),'The replay replaces the open terminal instead of appending to it');
 assert.equal(main.split('after wake').length,2,'Replayed output appears once');
 assert(deck.includes('after wake')&&!deck.includes('before sleep'),'The mosaic card shows the same replayed screen');
 await page.evaluate(bytes=>receiveNative({event:'terminalReplay',data:{id:'a1',cols:90,rows:28,bytes}}),b64('other agent\r\n'));
 assert(!(await screen('a0','main')).includes('other agent'),'Another session replay never reaches the open terminal');
 assert((await screen('a1','deck')).includes('other agent'));
 assert.deepEqual(errors,[]);
 assert.equal(await page.evaluate(()=>messages.filter(m=>['input','prompt','launch','stop'].includes(m.action)).length),0,'Replays never send input to an agent');
 console.log('PASS terminal resync: a returning window replays held output once into the open terminal and its mosaic card, scoped to its own session');
}finally{await browser.close()}
