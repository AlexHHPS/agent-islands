import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const model=runInNewContext(readFileSync('ui/agent-state.js','utf8')+';({agentControl,normalizedGoalStatus})');
const base={id:'goal',projectId:'p',harness:'codex',name:'Objetivo del portal',mode:'goal',managed:true,processRunning:true,state:'waiting',goalUpdatedAt:100,goalObjective:'Reducir el abandono del acceso'};
for(const [raw,status,attention] of [['stalled','blocked',true],['in_progress','active',false],['achieved','complete',false],['in-progress','active',false],[' IN PROGRESS ','active',false],['completed','complete',false],['paused','paused',false],['budget_limited','budget_limited',true],['usage_limited','usage_limited',true],['future_state','unknown',true]]){
 const a={...base,goalStatus:raw};assert.equal(model.normalizedGoalStatus(raw),status);assert.equal(model.agentControl(a).needsAttention,attention,raw);
}
assert.equal(model.agentControl({...base,state:'error',goalStatus:'achieved'}).effective,'complete');
assert.equal(model.agentControl({...base,state:'error',goalStatus:'in_progress'}).needsAttention,false);
assert.equal(model.agentControl({...base,state:'waiting',stateAt:101,goalStatus:'in_progress'}).effective,'waiting','Fresh session decisions remain independent of active goals');
assert.equal(model.agentControl({...base,state:'waiting',stateAt:99,goalStatus:'achieved'}).needsAttention,false);
assert.equal(model.agentControl({...base,state:'observed',goalStatus:'in_progress',tokenBudget:10,tokensUsed:50}).needsAttention,false);
assert.equal(model.agentControl({...base,state:'waiting',goalStatus:'stalled',processRunning:false}).needsAttention,true);
assert.equal(model.agentControl({...base,state:'waiting',goalStatus:'achieved',processRunning:false}).needsAttention,false);

const browser=await chromium.launch({});
try{
 const page=await browser.newPage({viewport:{width:1512,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.webkit={messageHandlers:{native:{postMessage(){}}}}});await page.goto(pathToFileURL(resolve('ui/index.html')).href);
 const initial={native:true,projects:[{id:'p',name:'Portal',path:'/portal'}],agents:[base],binaries:{codex:'/bin/codex'},docker:{containers:[]}};
 const update=async agent=>page.evaluate(data=>{receiveNative({event:'snapshot',data});aiAuto=false}, {...initial,agents:[agent]});
 await update({...base,goalStatus:'stalled'});assert.equal(await page.locator('#attention-count').textContent(),'1');assert.equal(await page.locator('.goal-chip.blocked').count(),1);assert.equal(await page.locator('.island-callout').count(),1);
 await page.evaluate(()=>selectAgent('goal'));assert((await page.locator('#agent-state').textContent()).includes('bloqueado'));assert((await page.locator('#goal-label').textContent()).includes('Bloqueado'));
 const scene=await page.evaluate(()=>{window.goalScene=mounts[0];return !!goalScene});assert(scene);
 await update({...base,goalStatus:'in_progress',goalUpdatedAt:110});assert.equal(await page.locator('#attention-count').textContent(),'0');assert.equal(await page.locator('.island-callout').count(),0);assert.equal(await page.locator('.goal-chip.blocked').count(),0);assert((await page.locator('#agent-state').textContent()).includes('en progreso'));assert(!await page.locator('#analyze-goal').count(),'Managed conversations do not show external unblock actions');
 await update({...base,state:'error',goalStatus:'achieved',goalUpdatedAt:120});assert.equal(await page.locator('#attention-count').textContent(),'0');assert.equal(await page.locator('.goal-chip.complete').count(),1);assert((await page.locator('#agent-state').textContent()).includes('completado'));assert.equal(await page.evaluate(()=>agentVisualState(state.agents[0])),'complete');
 assert.equal(await page.evaluate(()=>mounts[0]===goalScene),true,'State transitions must update the existing world');
 await update({...base,state:'waiting',stateAt:131,goalStatus:'in_progress',goalUpdatedAt:130});assert.equal(await page.locator('#attention-count').textContent(),'1');assert((await page.locator('#agent-state').textContent()).includes('Decisión pendiente'));assert.equal(await page.locator('.goal-chip.active').count(),1);
 await page.evaluate(()=>backToTeam());await page.locator('[data-filter=attention]').click();assert.equal(await page.locator('#world .island').count(),1);
 await update({...base,goalStatus:'achieved',goalUpdatedAt:140});assert.equal(await page.locator('#world .island').count(),0);assert((await page.locator('#world').textContent()).includes('Todo está en calma'));
 assert.deepEqual(errors,[]);console.log('PASS agent state: lifecycle aliases, blocked → progress → achieved, independent decisions, explicit limits, attention counts/filter/labels and stable scene transitions');
}finally{await browser.close()}
