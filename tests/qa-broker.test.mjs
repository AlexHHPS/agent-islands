import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {call} from '../qa/service.mjs';
import {withLanguage} from '../qa/i18n.mjs';

// Fixture assertions use Spanish independently of the calling harness locale.
process.env.AGENT_ISLANDS_LANGUAGE='es';
const root=mkdtempSync(join(tmpdir(),'islands-broker-')),child=spawn(process.execPath,['--disable-warning=ExperimentalWarning',resolve('qa/service.mjs'),'--broker','--root',root],{stdio:['pipe','pipe','pipe']});
let next=0;const pending=new Map();createInterface({input:child.stdout}).on('line',line=>{const reply=JSON.parse(line),p=pending.get(reply.id);if(p){pending.delete(reply.id);reply.error?p.reject(Error(reply.error)):p.resolve(reply.result)}});
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=String(++next),timer=setTimeout(()=>{pending.delete(id);reject(Error('Broker timeout'))},20000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});child.stdin.write(JSON.stringify({id,method,params})+'\n')});
try{
 const results=await Promise.all(Array.from({length:12},()=>send('health')));assert(results.every(r=>r.protocolVersion===4));assert.equal(new Set(results.map(r=>r.executable)).size,1);
 const env=await send('environment.save',{name:'Fixture',origin:'https://example.test',projectId:'inside'});assert.equal(env.projectId,'inside');
 const values=await Promise.all([send('snapshot',{projectIds:['inside']}),send('snapshot',{projectIds:['outside']})]);assert.equal(values[0].environments.length,1);assert.equal(values[1].environments.length,0);
 await assert.rejects(send('missing.operation'),/desconocida/);
 const localized=await Promise.all(['en','es'].map(language=>withLanguage(language,()=>call(root,'missing.operation').catch(e=>e.message))));
 assert.deepEqual(localized,['Unknown QA operation.','Operación QA desconocida.'],'Transport carries each caller locale to an already-running daemon');assert((await send('health')).node,'One failed request cannot poison the connection');
 await call(root,'shutdown');await new Promise(r=>setTimeout(r,300));assert((await send('health')).node,'Broker reconnects after an idle daemon exits');
 await call(root,'shutdown');child.stdin.end();await new Promise(r=>child.once('exit',r));assert.equal(child.exitCode,0);
 console.log('PASS QA broker: concurrent correlation, persisted mutations, per-request scope, failure isolation, idle daemon recovery and clean EOF');
}finally{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');try{await call(root,'shutdown')}catch{}rmSync(root,{recursive:true,force:true})}
