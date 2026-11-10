import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,existsSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {QAService} from '../qa/service.mjs';
import {lookup,cleanSourcePath} from '../qa/sourcemap.mjs';

process.env.AGENT_ISLANDS_LANGUAGE='es';
// Minimal VLQ encoder for a fixture source map (generated line 1, column 30 → Toolbar.tsx:42:8).
const B64='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const vlq=n=>{let v=n<0?(-n<<1)|1:n<<1,out='';do{let d=v&31;v>>>=5;if(v)d|=32;out+=B64[d]}while(v);return out};
const map={version:3,sources:['webpack://portal/./src/components/Toolbar.tsx'],names:[],mappings:[0,0,0,0].map(vlq).join('')+','+[29,0,41,7].map(vlq).join('')};
assert.deepEqual(lookup(map,1,30),{file:'webpack://portal/./src/components/Toolbar.tsx',line:42,column:8});
assert.equal(cleanSourcePath('webpack://portal/./src/components/Toolbar.tsx'),'src/components/Toolbar.tsx');
assert.equal(cleanSourcePath('/Users/me/portal/src/App.tsx',['/Users/me/portal']),'src/App.tsx');

const root=mkdtempSync(join(tmpdir(),'islands-annotations-')),project=mkdtempSync(join(tmpdir(),'islands-project-'));
writeFileSync(join(root,'profiles.json'),JSON.stringify([{id:'work'}]));
let port;
const page=()=>`<!doctype html><style>body{font:20px sans-serif;margin:0;padding:24px}button{padding:16px;background:#ddd}.spin{animation:spin 1s linear infinite;width:20px;height:20px;background:red}@keyframes spin{to{transform:rotate(360deg)}}</style>
<h1>Equipo de ventas</h1><p id="copy">Invita a las personas con las que trabajas.</p><button id="invite" class="toolbar__button_ab12c">Invitar persona</button><button id="other">Cancelar</button><div class="spin"></div>
<script src="/bundle.js"></script>`;
const bundle=()=>`window.__fixture=1;                    \nconst b=document.getElementById('invite');function Toolbar(){}function App(){}b.__reactFiber$x={type:'button',_debugStack:{stack:'Error\\n    at jsxDEV (http://127.0.0.1:${port}/node_modules/react/jsx-dev-runtime.js:1:1)\\n    at Toolbar (http://127.0.0.1:${port}/bundle.js:1:30)'},return:{type:Toolbar,return:{type:App,return:null}}};console.error('Fallo al cargar /api/team');\n//# sourceMappingURL=bundle.js.map`;
const server=createServer((req,res)=>{
 if(req.url==='/bundle.js'){res.setHeader('content-type','text/javascript');return res.end(bundle())}
 if(req.url==='/bundle.js.map'){res.setHeader('content-type','application/json');return res.end(JSON.stringify(map))}
 res.setHeader('content-type','text/html');res.end(page());
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));port=server.address().port;
writeFileSync(join(project,'package.json'),JSON.stringify({name:'portal',devDependencies:{vite:'7'},scripts:{dev:'vite --port '+port}}));
execFileSync('git',['init','-q',project]);execFileSync('git',['-C',project,'add','.']);execFileSync('git',['-C',project,'-c','user.email=t@t','-c','user.name=t','commit','-qm','init']);
const service=new QAService(root,{chromium:{launch:options=>chromium.launch({...options,headless:true})}});
try{
 const env=service.saveEnvironment({name:'Portal',origin:'http://127.0.0.1:'+port,projectId:'portal',projectPath:project,healthPath:'/'});
 const scope={agentId:'agent-one',profileId:'work',projectIds:['portal']};
 const detected=await service.dispatch('browser.detect',{...scope,projectPaths:{portal:project,other:'/nowhere'}});
 assert.equal(detected.projects[0].framework,'Vite');assert(detected.projects[0].ports.includes(port));assert.equal(detected.projects.length,1,'Detection stays inside the workspace');
 let frame=await service.dispatch('browser.open',{...scope,environmentId:env.id});const v={...scope,id:frame.id},s=service.browsers.sessions.get(frame.id);
 const at=async sel=>{const b=await s.page.locator(sel).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2,box:b}};
 const live=await service.dispatch('browser.live',{...v,since:0});assert(live.image.startsWith('data:image/jpeg'));assert(live.seq>0);assert.equal(live.width,1280);
 frame=await service.dispatch('browser.frame',v);
 const invite=await at('#invite');
 const element=await service.dispatch('browser.annotation.create',{...v,frameToken:frame.frameToken,kind:'element',x:invite.x,y:invite.y,comment:'Hazlo el botón principal',intent:'change',severity:'important'});
 const target=element.targets[0];
 assert.equal(element.status,'draft');assert.equal(target.name,'button "Invitar persona"');assert.deepEqual(target.framework.components,['App','Toolbar']);
 assert.equal(target.sourceLocation.file,'src/components/Toolbar.tsx');assert.equal(target.sourceLocation.line,42);assert(target.classes.includes('toolbar__button'),'Hashed module suffixes are removed');
 assert(element.issues.some(i=>/Fallo al cargar/.test(i.message)),'Console errors travel with the annotation');assert(existsSync(element.files.before));
 const h1=await at('h1');
 const text=await service.dispatch('browser.annotation.create',{...v,frameToken:frame.frameToken,kind:'text',x:h1.box.x,y:h1.box.y,width:h1.box.width,height:h1.box.height,comment:'Errata: «ventas» va en mayúscula',intent:'fix',severity:'suggestion'});
 assert.match(text.selectedText,/Equipo de ventas/);
 const other=await at('#other');
 const multi=await service.dispatch('browser.annotation.create',{...v,frameToken:frame.frameToken,kind:'element',targets:[invite,other],comment:'Alinea estos dos botones',intent:'fix',severity:'blocking'});
 assert.equal(multi.kind,'multi');assert.equal(multi.targets.length,2);assert.deepEqual([element.number,text.number,multi.number],[1,2,3]);
 assert.equal((await service.dispatch('annotation.list',scope)).annotations.length,0,'Agents never see unsent drafts');
 const previewed=await service.dispatch('browser.annotation.preview',{...scope,annotationId:element.id,styles:{'background-color':'rgb(66, 102, 78)',color:'white'}});
 assert.equal(previewed.styleChanges.length,2);assert.equal(await s.page.locator('#invite').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(66, 102, 78)');
 await service.dispatch('browser.action',{...v,action:'freeze',on:true});assert(await s.page.evaluate(()=>!!document.getElementById('islands-freeze')));
 const sent=await service.dispatch('browser.annotation.send',{...scope,annotationIds:[element.id,text.id,multi.id],level:'detailed'});
 const summary=sent.reference.summary;assert.equal(sent.reference.kind,'annotations');assert(summary.indexOf('Alinea')<summary.indexOf('Hazlo'),'Blocking annotations come first');
 assert.match(summary,/src\/components\/Toolbar\.tsx:42:8/);assert.match(summary,/background-color: .* → rgb\(66, 102, 78\)/);assert.match(summary,/<App> <Toolbar>/);assert.match(summary,/islands_annotation_/);
 const watched=await service.dispatch('annotation.watch',{...scope,timeoutSeconds:1,batchWindowSeconds:0});assert.equal(watched.annotations.length,3);
 assert.equal((await service.dispatch('annotation.watch',{...scope,timeoutSeconds:1})).timedOut,true,'Watch only returns news');
 await assert.rejects(service.dispatch('annotation.resolve',{...scope,agentId:'agent-two',annotationId:element.id,summary:'x'}),/no pertenece/);
 await service.dispatch('annotation.ack',{...scope,annotationId:element.id});
 writeFileSync(join(project,'Toolbar.tsx'),'export const primary = true;\n');execFileSync('git',['-C',project,'add','.']);
 const resolved=await service.dispatch('annotation.resolve',{...scope,annotationId:element.id,summary:'Botón con el color principal'});
 assert.equal(resolved.status,'resolved');assert.equal(resolved.verification.captured,true);assert(existsSync(resolved.files.after));assert(resolved.code.after.files.some(f=>f.file==='Toolbar.tsx'),'Resolution records the code changed since sending');
 const replied=await service.dispatch('browser.annotation.reply',{...scope,annotationId:element.id,message:'Un poco más oscuro'});assert.equal(replied.status,'pending');
 assert.equal((await service.dispatch('annotation.watch',{...scope,timeoutSeconds:1,batchWindowSeconds:0})).annotations[0].thread.at(-1).content,'Un poco más oscuro');
 await service.dispatch('annotation.dismiss',{...scope,annotationId:text.id,reason:'Ya está corregido en el CMS'});
 const proposal=await service.dispatch('annotation.suggest',{...scope,selector:'#copy',comment:'El texto es demasiado largo para móvil',severity:'suggestion'});assert.equal(proposal.status,'proposed');assert.equal(proposal.author,'agent');
 assert.equal((await service.dispatch('browser.annotation.accept',{...scope,annotationId:proposal.id})).status,'draft');
 const image=await service.dispatch('browser.annotation.image',{...scope,annotationId:element.id,which:'after'});assert(image.image.startsWith('data:image/png'));
 const list=await service.dispatch('browser.annotation.list',scope);assert.equal(list.annotations.length,4);assert.equal((await service.dispatch('browser.annotation.list',{...scope,since:list.revision})).unchanged,true);
 await service.dispatch('browser.action',{...v,action:'viewport',preset:'mobile'});frame=await service.dispatch('browser.frame',v);assert.equal(frame.width,390);
 await service.dispatch('browser.record.start',v);const note=await service.dispatch('browser.record.note',{...v,text:'Aquí el menú tapa el botón'});assert.equal(note.notes,1);
 const recording=await service.dispatch('browser.record.stop',v);assert(recording.reference.events.some(e=>e.action==='note'&&e.text==='Aquí el menú tapa el botón'));
 await service.dispatch('browser.annotation.delete',{...scope,annotationId:proposal.id});assert(!existsSync(join(root,'annotations',proposal.id)));
 await service.dispatch('browser.close',v);
 // Retention removes evidence older than the configured window.
 const old=service.get('annotation',multi.id);service.put('annotation',{...old,updatedAt:1});process.env.AGENT_ISLANDS_RETENTION_DAYS='30';service.browsers.annotations.prune();assert.equal(service.get('annotation',multi.id),null);
 console.log('PASS annotations: rich element context, React 19 stack symbolication, text and multi-select, live preview styles, freeze, priority batch markdown, watch/ack/resolve/reply/dismiss, after capture with git changes, agent proposals, live frames, viewports, narrated recordings and retention');
}finally{await service.close().catch(()=>{});server.closeAllConnections();await new Promise(r=>server.close(r));rmSync(root,{recursive:true,force:true});rmSync(project,{recursive:true,force:true})}
