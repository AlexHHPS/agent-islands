import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,symlinkSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {QAService} from '../qa/service.mjs';

const root=mkdtempSync(join(tmpdir(),'islands-qa-test-'));
writeFileSync(join(root,'profiles.json'),JSON.stringify([{id:'work',enabled:true},{id:'personal',enabled:true}]));
let revision='one',posts=0;
const server=createServer((req,res)=>{
 if(req.url==='/version'){res.setHeader('content-type','application/json');res.end(JSON.stringify({revision}));return}
 if(req.url==='/change-version')revision='two';
 if(req.method==='POST'){posts++;res.end('written');return}
 if(req.url==='/slow'){setTimeout(()=>res.end('<main>Delayed</main>'),20000).unref();return}
 if(req.url==='/signin')res.setHeader('set-cookie','session=fixture; HttpOnly; Path=/');
 res.setHeader('content-type','text/html');res.end('<main><h1>Portal</h1><div id="account">Equipo</div><button id="write" onclick="fetch(\'/write\',{method:\'POST\'})">Cambiar</button></main>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const service=new QAService(root,{chromium:{executablePath:()=>chromium.executablePath(),launch:opts=>chromium.launch({...opts,headless:true})}});
const complete=async run=>{await service.active.get(run.id)?.promise;return service.get('run',run.id)};
try{
 const env=service.saveEnvironment({name:'Dev fixture',origin,projectId:'fixture',projectPath:root,healthPath:'/signin',revisionUrl:'/version',expectedRevision:'one',authSelector:'#account'});
 const recipe=service.saveRecipe({name:'Acceso del equipo',environmentId:env.id,mode:'read',steps:[{action:'navigate',path:'/'},{action:'expectText',selector:'h1',value:'Portal'}]});
 const [a,b]=await Promise.all([service.start({profileId:'work',environmentId:env.id,recipeId:recipe.id,agentId:'a'}),service.start({profileId:'personal',environmentId:env.id,recipeId:recipe.id,agentId:'b'})]);
 for(const result of await Promise.all([complete(a),complete(b)])){assert.equal(result.status,'passed');assert.equal(result.revisionVerified,true);assert.equal(result.checks.length,2);assert(result.artifacts.includes('page.png'));assert.equal(statSync(join(root,'evidence',result.id,'result.json')).mode&0o777,0o600)}
 assert.equal(service.snapshot('work').runs.length,1,'Profile snapshot must not expose personal runs');
 const login=await service.login({profileId:'work',environmentId:env.id});
 await assert.rejects(service.completeLogin({id:login.id,profileId:'personal'}));
 await service.completeLogin({id:login.id,profileId:'work'});
 assert.equal((await service.checkAuth({profileId:'work',environmentId:env.id})).status,'verified');
 await assert.rejects(service.checkAuth({profileId:'personal',environmentId:env.id}),/Completa primero/);
 assert.notEqual(service.authPath('work',env),service.authPath('personal',env));
 service.lease('environment:'+env.id,'agent-one',100);
 assert.throws(()=>service.lease('environment:'+env.id,'agent-two',100),/ocupado/);
 service.release('environment:'+env.id,'agent-two');assert.equal(service.snapshot().leases.length,1,'Another owner cannot release the lease');
 assert.throws(()=>service.saveEnvironment({...env,name:'Changed'}),/reservado/);service.release('environment:'+env.id,'agent-one');
 service.lease('environment:'+env.id,'work:agent-one',100);
 const owned=await complete(await service.start({profileId:'work',agentId:'agent-one',environmentId:env.id,recipeId:recipe.id}));assert.equal(owned.status,'passed','A task can test within its own environment reservation');
 assert(service.snapshot().leases.some(l=>l.owner==='work:agent-one'),'QA must preserve the task reservation');service.release('environment:'+env.id,'work:agent-one');
 const failure=service.saveRecipe({name:'Destino incorrecto',environmentId:env.id,steps:[{action:'expectURL',value:'/not-here'}]});
 assert.equal((await complete(await service.start({profileId:'work',environmentId:env.id,recipeId:failure.id}))).status,'failed');
 const change=service.saveRecipe({name:'Despliegue cambiante',environmentId:env.id,steps:[{action:'navigate',path:'/change-version'},{action:'expectVisible',selector:'main'}]});
 assert.equal((await complete(await service.start({profileId:'work',environmentId:env.id,recipeId:change.id}))).status,'stale');revision='one';
 const read=service.saveRecipe({name:'Sin escrituras',environmentId:env.id,mode:'read',steps:[{action:'click',selector:'#write'},{action:'expectVisible',selector:'main'}]});
 await complete(await service.start({profileId:'work',environmentId:env.id,recipeId:read.id}));assert.equal(posts,0,'Read-only recipes must block mutating requests');
 const slow=service.saveRecipe({name:'Cancelar',environmentId:env.id,steps:[{action:'navigate',path:'/slow'},{action:'expectVisible',selector:'main'}]});
 const pending=await service.start({profileId:'work',environmentId:env.id,recipeId:slow.id});await service.cancel(pending.id,'work');assert.equal((await complete(pending)).status,'cancelled');
 await assert.rejects(service.cancel(a.id,'personal'),/pertenece/);
 symlinkSync(resolve('node_modules'),join(root,'node_modules'),'dir');
 writeFileSync(join(root,'playwright.config.mjs'),`if(process.env.ANTHROPIC_API_KEY)throw Error('Parent credential crossed profiles');export default {testDir:'.',testMatch:'skip.spec.mjs',use:{baseURL:process.env.BASE_URL}}`);
 writeFileSync(join(root,'skip.spec.mjs'),`import {test} from '@playwright/test';test.skip('No execution',async()=>{});`);
 const oldKey=process.env.ANTHROPIC_API_KEY;process.env.ANTHROPIC_API_KEY='fixture-parent-key';
 const skipped=await complete(await service.start({profileId:'work',environmentId:env.id,suite:{config:'playwright.config.mjs'}}));
 if(oldKey===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=oldKey;
 assert.equal(skipped.status,'skipped');
 // A project opts into saved auth explicitly; its own setup must still execute.
 writeFileSync(join(root,'setup.mjs'),`import {writeFileSync} from 'node:fs';export default async()=>{writeFileSync(${JSON.stringify(join(root,'setup-ran'))},'ran')}`);
 const config=`export default {testDir:'.',testMatch:'auth.spec.mjs',globalSetup:'./setup.mjs',use:{baseURL:process.env.BASE_URL,storageState:process.env.AGENT_ISLANDS_QA_STORAGE_STATE||undefined}}`;
 writeFileSync(join(root,'auth.config.mjs'),config);
 writeFileSync(join(root,'auth.spec.mjs'),`import {test,expect} from '@playwright/test';test('saved profile auth',async({context})=>{expect((await context.cookies()).some(c=>c.name==='session'&&c.value==='fixture')).toBe(true);expect(process.env.AGENT_ISLANDS_QA_RUN).toBeTruthy();expect(process.env.AGENT_ISLANDS_QA_EVIDENCE_DIR).toBeTruthy()})`);
 const authenticated=await complete(await service.start({profileId:'work',environmentId:env.id,suite:{config:'auth.config.mjs'}}));
 assert.equal(authenticated.status,'passed',authenticated.message);
 assert.equal(readFileSync(join(root,'setup-ran'),'utf8'),'ran','Project setup must never be bypassed');
 assert.equal(readFileSync(join(root,'auth.config.mjs'),'utf8'),config,'Project config must remain unchanged');

 const contract=await service.dispatch('contract.save',{profileId:'work',agentId:'a',objective:'Acceso sencillo',acceptance:'Una persona recupera su cuenta',optional:'Otro proveedor'});assert.equal((await service.dispatch('contract.get',{profileId:'work',agentId:'a'})).id,contract.id);assert.equal(await service.dispatch('contract.get',{profileId:'personal',agentId:'a'}),null);
 const outside=service.saveEnvironment({name:'Otro workspace',origin,projectId:'outside'});
 const scoped=await service.dispatch('snapshot',{profileId:'work',projectIds:['fixture']});assert(scoped.environments.every(e=>e.projectId==='fixture'));assert(scoped.runs.every(r=>r.projectId==='fixture'));
 await assert.rejects(service.dispatch('run.start',{profileId:'work',projectIds:['fixture'],environmentId:outside.id,recipeId:recipe.id}),/fuera del workspace/);
 const runCount=service.snapshot().runs.length;await service.close();
 const reopened=new QAService(root);assert.equal(reopened.snapshot().runs.length,runCount);assert(reopened.snapshot().runs.every(r=>!['running','queued'].includes(r.status)));await reopened.close();
 console.log('PASS QA: real concurrent Chromium, per-profile auth, version changes, errors, read-only checks, leases, cancellation, all-skipped suites, task contracts, evidence and restart persistence');
}finally{if(service.db.isOpen)await service.close();server.closeAllConnections();await new Promise(r=>server.close(r));rmSync(root,{recursive:true,force:true})}
