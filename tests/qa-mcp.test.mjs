import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {call,socketPath} from '../qa/service.mjs';

// Fixture assertions use Spanish independently of the calling harness locale.
process.env.AGENT_ISLANDS_LANGUAGE='es';
const root=mkdtempSync(join(tmpdir(),'islands-mcp-test-')),service=process.env.ISLANDS_QA_SERVICE_PATH || resolve('qa/service.mjs');
writeFileSync(join(root,'profiles.json'),JSON.stringify([{id:'work',enabled:true},{id:'personal',enabled:true}]));
const clients=[];
function connect(profile,owner,projects,language='es'){
 const child=spawn(process.execPath,['--disable-warning=ExperimentalWarning',service,'--mcp','--root',root,'--profile',profile,...(projects?['--project-ids',JSON.stringify(projects)]:[])],{stdio:['pipe','pipe','pipe'],env:{...process.env,AGENT_ISLANDS_LANGUAGE:language,...(owner?{AGENT_ISLANDS_ID:owner}:{})}});clients.push(child);
 let id=0;const pending=new Map();createInterface({input:child.stdout}).on('line',line=>{const m=JSON.parse(line);const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}});
 return (method,params)=>new Promise((resolve,reject)=>{const request=++id;const timeout=setTimeout(()=>{pending.delete(request);reject(Error('MCP response timeout'))},20000);pending.set(request,{resolve:r=>{clearTimeout(timeout);resolve(r)},reject:e=>{clearTimeout(timeout);reject(e)}});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:request,method,params})+'\n')});
}
try{
 const a=connect('work'),b=connect('personal');assert.equal((await a('initialize',{protocolVersion:'2024-11-05'})).serverInfo.name,'agent-islands-qa');
 const tools=await a('tools/list');assert(tools.tools.some(t=>t.name==='islands_run_start'));assert(!tools.tools.some(t=>t.name.includes('environment_save')));
 const results=await Promise.all([a('tools/call',{name:'islands_health',arguments:{}}),b('tools/call',{name:'islands_health',arguments:{}})]);assert(results.every(r=>JSON.parse(r.content[0].text).browserAvailable));
 const snapshot=await a('tools/call',{name:'islands_snapshot',arguments:{profileId:'personal'}});assert(Array.isArray(JSON.parse(snapshot.content[0].text).runs));
 // The MCP binding overwrites supplied identities and namespaces resource ownership.
 await a('tools/call',{name:'islands_lease_acquire',arguments:{resource:'fixture',owner:'agent',seconds:60}});
 await b('tools/call',{name:'islands_lease_release',arguments:{resource:'fixture',owner:'work:agent'}});
 const state=await call(root,'snapshot');assert.equal(state.leases.length,1);assert(state.leases[0].owner.startsWith('work:'));
 await a('tools/call',{name:'islands_lease_release',arguments:{resource:'fixture',owner:'agent'}});
 await call(root,'environment.save',{name:'Inside',origin:'http://127.0.0.1:12345',projectId:'inside'});await call(root,'environment.save',{name:'Outside',origin:'http://127.0.0.1:12346',projectId:'outside'});
 writeFileSync(join(root,'agents.json'),JSON.stringify([{id:'scoped-agent',profileId:'work',projectIds:['inside']} ]));
 const c=connect('work','scoped-agent',['inside']);writeFileSync(join(root,'agents.json'),'[]');const limited=await c('tools/call',{name:'islands_snapshot',arguments:{projectIds:['outside']}});const scoped=JSON.parse(limited.content[0].text);assert.deepEqual(scoped.environments.map(e=>e.projectId),['inside'],'MCP clients cannot widen their captured workspace');
 const english=connect('work',undefined,undefined,'en');
 await assert.rejects(english('tools/call',{name:'islands_run_get',arguments:{id:'missing'}}),/Run unavailable\./,'MCP uses its inherited language with an existing Spanish daemon');
 console.log('PASS MCP: concurrent daemon startup, protocol, real Chromium health, profile binding and reservation ownership');
}finally{for(const c of clients)c.stdin.end();try{await call(root,'shutdown')}catch{}await Promise.all(clients.map(c=>new Promise(r=>{if(c.exitCode!==null)r();else c.once('exit',r)})));rmSync(root,{recursive:true,force:true})}
