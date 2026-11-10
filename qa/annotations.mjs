// Visual annotations: per-element feedback the user leaves on the controlled browser and the
// agent answers through MCP. Lifecycle: draft → pending → acknowledged → resolved | dismissed;
// agents may propose annotations (critique mode) that the user accepts or discards.
import {t} from './i18n.mjs';
import {mkdirSync,existsSync,rmSync,copyFileSync,chmodSync,readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {previewStyle} from './inspect.mjs';

const check=(ok,message)=>{if(!ok)throw Error(message)};
const stamp=()=>Date.now()/1000;
const text=(s,max)=>String(s??'').slice(0,max);
const INTENTS=['fix','change','question','approve'],SEVERITIES=['blocking','important','suggestion'],LEVELS=['compact','standard','detailed'];
const OPEN=['pending','acknowledged'],FINAL=['resolved','dismissed'];
const pathOf=url=>{try{return new URL(url).pathname}catch{return ''}};
const retentionDays=()=>{const v=Number(process.env.AGENT_ISLANDS_RETENTION_DAYS??30);return Number.isFinite(v)&&v>=0?v:30};

function git(cwd,args){try{return execFileSync('git',['-C',cwd,...args],{encoding:'utf8',timeout:3000,stdio:['ignore','pipe','ignore'],maxBuffer:2*1024*1024}).trim()}catch{return null}}
export function codeState(path,base=null){
 if(!path||!existsSync(path)||git(path,['rev-parse','--is-inside-work-tree'])!=='true')return null;
 const head=git(path,['rev-parse','HEAD']);const numstat=git(path,['diff','--numstat',base||'HEAD'])||'';
 const files=numstat.split('\n').filter(Boolean).slice(0,60).map(l=>{const [added,removed,...f]=l.split('\t');return {file:f.join('\t'),added:Number(added)||0,removed:Number(removed)||0}});
 const untracked=(git(path,['ls-files','--others','--exclude-standard'])||'').split('\n').filter(Boolean).slice(0,30);
 return {head,files,untracked,checkedAt:stamp()};
}

export class Annotations {
 constructor(service,browsers){this.service=service;this.browsers=browsers;this.waiters=new Set();this.revision=Date.now();this.prune()}
 // Evidence retention: annotations and visual references older than the configured days are removed.
 prune(){const days=retentionDays();if(!days)return;const limit=stamp()-days*86400;
  for(const kind of ['annotation','reference'])for(const r of this.service.all(kind))if((r.updatedAt||r.createdAt||0)<limit){rmSync(join(this.service.root,kind==='annotation'?'annotations':'references',r.id),{recursive:true,force:true});this.service.remove(kind,r.id)}}
 touch(agentId){this.revision++;for(const w of [...this.waiters])if(!agentId||w.agentId===agentId)w.wake()}
 directory(id){const dir=join(this.service.root,'annotations',id);mkdirSync(dir,{recursive:true,mode:0o700});return dir}
 own(a,v){return a&&(!v.profileId||a.profileId===v.profileId)&&(!v.agentId||a.agentId===v.agentId)&&(!Array.isArray(v.projectIds)||v.projectIds.includes(a.projectId))}
 find(v){const a=this.service.get('annotation',v.annotationId);check(this.own(a,v),t('La anotación no pertenece a esta conversación.'));return a}
 mine(v){return this.service.all('annotation').filter(a=>this.own(a,v))}
 save(a){a.updatedAt=stamp();this.service.put('annotation',a);this.touch(a.agentId);return a}
 // Public form: absolute evidence paths for agents, no image bytes.
 view(a){const dir=join(this.service.root,'annotations',a.id);return {...a,files:Object.fromEntries(Object.entries(a.images||{}).filter(([,f])=>f).map(([k,f])=>[k,join(dir,f)]))}}
 session(v){const s=[...this.browsers.sessions.values()].find(s=>s.agentId===v.agentId&&(!v.profileId||s.profileId===v.profileId)&&!s.page.isClosed());return s||null}

 async crop(s,bounds,file,state){const pad=12,clip={x:Math.max(0,bounds.x-pad),y:Math.max(0,bounds.y-pad)};clip.width=Math.min(bounds.width+pad*2,state.width-clip.x);clip.height=Math.min(bounds.height+pad*2,state.height-clip.y);
  check(clip.width>=3&&clip.height>=3,t('Selecciona una región de al menos 3 × 3 píxeles.'));await s.page.screenshot({path:file,clip,timeout:5000});chmodSync(file,0o600);return clip}

 async describe(s,point,rect=null){const c=await this.browsers.at(s,point,rect);if(!c)return null;const env=this.service.get('environment',s.environmentId);
  const position=c.framework?.source||(c.source?{file:c.source,exact:false}:null);
  if(position)c.sourceLocation=await this.browsers.resolver(s).resolve(position,[env?.projectPath].filter(Boolean)).catch(()=>null);
  return c}

 async create(s,v){
  const state=await this.browsers.validateFrame(s,v);const kind=['element','region','text','multi'].includes(v.kind)?v.kind:'element';
  const inside=p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0&&p.x<state.width&&p.y<state.height;
  const points=(Array.isArray(v.targets)&&v.targets.length?v.targets:[{x:v.x,y:v.y}]).slice(0,12).map(p=>({x:Number(p.x),y:Number(p.y)}));check(points.every(inside),t('Selecciona dentro del navegador.'));
  let targets=[],bounds,selectedText='';
  if(kind==='region'||kind==='text'){const r={x:Number(v.x),y:Number(v.y),width:Number(v.width),height:Number(v.height)};check(inside(r)&&r.width>=3&&r.height>=3,t('Selecciona una región de al menos 3 × 3 píxeles.'));
   const c=await this.describe(s,{x:r.x+r.width/2,y:r.y+r.height/2},kind==='text'?r:null);if(c){targets=[c];selectedText=c.selectedText||''}bounds=r;check(kind!=='text'||selectedText,t('No hay texto en la zona seleccionada.'))}
  else{for(const p of points){const c=await this.describe(s,p);if(c&&!targets.some(o=>o.selector===c.selector))targets.push(c)}check(targets.length,t('No se encontró el componente.'));
   const boxes=targets.map(c=>({x:c.bounds.x+c.offset.x,y:c.bounds.y+c.offset.y,width:c.bounds.width,height:c.bounds.height}));const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));bounds={x,y,width:Math.max(...boxes.map(b=>b.x+b.width))-x,height:Math.max(...boxes.map(b=>b.y+b.height))-y}}
  const id=randomUUID(),dir=this.directory(id);const clip=await this.crop(s,bounds,join(dir,'before.png'),state);
  const number=1+Math.max(0,...this.mine({agentId:s.agentId,profileId:s.profileId}).map(a=>a.number||0));
  const recent=(s.issues||[]).filter(i=>stamp()-i.at<180).slice(-8);
  const a={id,number,agentId:s.agentId,profileId:s.profileId,projectId:s.projectId,environmentId:s.environmentId,browserId:s.id,author:'human',status:'draft',kind:targets.length>1?'multi':kind,
   comment:text(v.comment,4000).trim(),intent:INTENTS.includes(v.intent)?v.intent:'change',severity:SEVERITIES.includes(v.severity)?v.severity:'important',
   url:this.browsers.cleanURL(s.page.url()),viewport:{width:state.width,height:state.height},scroll:{x:state.x,y:state.y},bounds,clip,docBounds:{...bounds,x:bounds.x+state.x,y:bounds.y+state.y},
   pin:kind==='region'||kind==='text'?{dx:bounds.width/2,dy:bounds.height/2}:{dx:points[0].x-bounds.x,dy:points[0].y-bounds.y},targets,selectedText,styleChanges:[],issues:v.includeIssues===false?[]:recent,images:{before:'before.png',after:null},thread:[],createdAt:stamp()};
  check(a.comment||a.intent==='approve',t('Escribe qué quieres cambiar.'));
  return this.view(this.save(a));
 }

 async capture(a,s){
  // After a change, re-capture the same element (or region) when the page shows the same route.
  if(!s||pathOf(s.page.url())!==pathOf(a.url))return {captured:false,reason:t('El navegador de la conversación no muestra esta página.')};
  await new Promise(r=>setTimeout(r,1200));const state=await this.browsers.state(s);let bounds=null;
  const main=a.targets?.[0];if(main&&!main.frameChain?.length&&a.kind!=='region'&&a.kind!=='text'){const box=await s.page.locator(main.selector).first().boundingBox({timeout:2000}).catch(()=>null);if(box)bounds=box}
  if(!bounds&&a.docBounds)bounds={...a.docBounds,x:a.docBounds.x-state.x,y:a.docBounds.y-state.y};
  if(!bounds||bounds.y+bounds.height<0||bounds.y>state.height||bounds.x>state.width)return {captured:false,reason:t('El elemento no está visible; desplázate hasta él y vuelve a capturar.')};
  const dir=this.directory(a.id);await this.crop(s,{x:Math.max(0,bounds.x),y:Math.max(0,bounds.y),width:Math.min(bounds.width,state.width),height:Math.min(bounds.height,state.height)},join(dir,'after.png'),state);
  a.images={...a.images,after:'after.png'};a.afterAt=stamp();return {captured:true};
 }
 async verify(a){const s=this.session(a);const job=s?s.serial.then(()=>this.capture(a,s)):Promise.resolve(this.capture(a,null));if(s)s.serial=job.catch(()=>{});const result=await job;const env=this.service.get('environment',a.environmentId);if(a.code?.before)a.code.after=codeState(env?.projectPath,a.code.before.head);a.verification=result;return result}

 markdown(list,level,dirFor){
  const intent={fix:t('Arreglar'),change:t('Cambiar'),question:t('Pregunta'),approve:t('Aprobar')},severity={blocking:t('Bloqueante'),important:t('Importante'),suggestion:t('Sugerencia')};
  const first=list[0];const lines=['## '+t('Anotaciones visuales')+' · '+(pathOf(first.url)||first.url)+' · '+first.viewport.width+'×'+first.viewport.height,''];
  for(const a of list){const c=a.targets?.[0]||{};
   lines.push('### '+a.number+'. '+(a.targets.length>1?t('{0} elementos',a.targets.length):c.name||a.kind)+' · '+intent[a.intent]+' · '+severity[a.severity]+' ['+a.id+']');
   if(a.comment)lines.push('**'+t('Petición')+':** '+a.comment);
   if(pathOf(a.url)!==pathOf(first.url))lines.push('**URL:** '+a.url);
   for(const target of a.targets.slice(0,level==='compact'?1:12)){const src=target.sourceLocation;const prefix=a.targets.length>1?'- '+target.name+': ':'';
    if(src?.file)lines.push(prefix+'**'+t('Origen')+':** '+src.file+(src.line?':'+src.line+(src.column?':'+src.column:''):'')+(src.exact?'':' ('+t('aproximado')+')'));
    if(target.framework?.components?.length&&level!=='compact')lines.push(prefix+'**'+t('Componentes')+'** ('+target.framework.id+'): '+target.framework.components.map(n=>'<'+n+'>').join(' '));
    lines.push(prefix+'**'+t('Selector')+':** `'+(level==='compact'?target.readable||target.selector:target.selector)+'`');
    if(level!=='compact'){if(target.classes?.length)lines.push(prefix+'**'+t('Clases')+':** '+target.classes.join(' '));if(target.text&&!a.selectedText)lines.push(prefix+'**'+t('Texto')+':** '+text(target.text,200))}
    if(level==='detailed'){const st=Object.entries(target.styles||{}).map(([k,v])=>k+': '+v).join('; ');if(st)lines.push(prefix+'**'+t('Estilos calculados')+':** '+st);if(target.nearbyText)lines.push(prefix+'**'+t('Contexto')+':** '+target.nearbyText);lines.push(prefix+'**'+t('Accesibilidad')+':** role='+(target.accessibility?.role||'')+(target.accessibility?.label?', label="'+target.accessibility.label+'"':''));if(target.fullPath)lines.push(prefix+'**'+t('Ruta DOM')+':** '+target.fullPath)}}
   if(a.selectedText)lines.push('**'+t('Texto seleccionado')+':** "'+a.selectedText+'"');
   if(a.styleChanges?.length)lines.push('**'+t('Estilos probados en vivo (persístelos en el código)')+':** '+a.styleChanges.map(c=>c.property+': '+c.from+' → '+c.to).join('; '));
   if(a.issues?.length&&level!=='compact')lines.push('**'+t('Errores recientes de la página')+':** '+a.issues.map(i=>i.kind+' '+text(i.message,160)).join(' | '));
   if(level!=='compact'||a.kind==='region')lines.push('**'+t('Posición')+':** x='+Math.round(a.bounds.x)+' y='+Math.round(a.docBounds.y)+' '+Math.round(a.bounds.width)+'×'+Math.round(a.bounds.height));
   lines.push('**'+t('Captura')+':** '+dirFor(a));
   const replies=a.thread.filter(m=>m.role==='human').slice(-3);for(const m of replies)lines.push('**'+t('Seguimiento del usuario')+':** '+m.content);
   lines.push('');
  }
  lines.push(t('Atiende cada anotación en orden de prioridad. Si tienes las herramientas islands_annotation_*, márcala como vista al empezar (ack), resuélvela con un resumen al terminar (resolve) y usa reply para preguntar si algo es ambiguo; resolve devuelve una captura posterior para que compruebes el resultado.'));
  return lines.join('\n').slice(0,20000);
 }

 send(v){
  const ids=[...new Set(Array.isArray(v.annotationIds)?v.annotationIds:[])].slice(0,20);check(ids.length,t('No hay anotaciones para enviar.'));
  const list=ids.map(id=>this.find({...v,annotationId:id}));check(list.every(a=>['draft','pending','acknowledged'].includes(a.status)),t('Solo puedes enviar anotaciones abiertas.'));
  const projectId=list[0].projectId;check(list.every(a=>a.projectId===projectId),t('Envía juntas solo anotaciones del mismo proyecto.'));
  const level=LEVELS.includes(v.level)?v.level:'standard';const env=this.service.get('environment',list[0].environmentId);const baseline=codeState(env?.projectPath);
  const ref={id:randomUUID()},dir=this.browsers.directory(ref.id),images=[];
  list.sort((a,b)=>({blocking:0,important:1,suggestion:2}[a.severity]-{blocking:0,important:1,suggestion:2}[b.severity])||a.number-b.number);
  for(const a of list){const file='annotation-'+a.number+'.png';copyFileSync(join(this.directory(a.id),'before.png'),join(dir,file));chmodSync(join(dir,file),0o600);images.push(file)}
  const summary=this.markdown(list,level,a=>join(dir,'annotation-'+a.number+'.png'));
  for(const a of list){a.status='pending';a.sentAt=stamp();a.watchSeenAt=0;a.level=level;if(baseline)a.code={before:baseline};this.save(a)}
  const owner={agentId:list[0].agentId,profileId:list[0].profileId,environmentId:list[0].environmentId,projectId,account:'default',page:{url:()=>list[0].url}};
  const saved=this.browsers.saveReference(owner,{id:ref.id,kind:'annotations',name:t('Anotaciones visuales · {0}',list.length),annotations:list.map(a=>a.id),viewport:list[0].viewport,images,summary},dir);
  return this.browsers.payload(saved);
 }

 async watch(v){
  const timeout=Math.min(Math.max(Number(v.timeoutSeconds)||60,1),100)*1000,windowMs=Math.min(Math.max(Number(v.batchWindowSeconds)||3,0),20)*1000;
  const fresh=()=>this.mine(v).filter(a=>a.status==='pending'&&(a.watchSeenAt||0)<a.updatedAt);
  let found=fresh();
  if(!found.length){await new Promise(resolve=>{const w={agentId:v.agentId,wake:()=>{clearTimeout(w.timer);this.waiters.delete(w);resolve()}};w.timer=setTimeout(w.wake,timeout);this.waiters.add(w)});found=fresh();if(found.length&&windowMs)await new Promise(r=>setTimeout(r,windowMs));found=fresh()}
  for(const a of found){a.watchSeenAt=stamp()+1;this.service.put('annotation',a)}
  return {annotations:found.map(a=>this.view(a)),timedOut:!found.length};
 }

 async suggest(v){
  const s=this.session(v);check(s,t('Abre el navegador de esta conversación para proponer anotaciones.'));check(typeof v.selector==='string'&&v.selector.length<=500,t('Indica un selector CSS.'));
  const job=s.serial.then(async()=>{
   const box=await s.page.locator(v.selector).first().boundingBox({timeout:3000}).catch(()=>null);check(box,t('No se encontró el componente.'));
   const state=await this.browsers.state(s);check(box.y<state.height&&box.y+box.height>0,t('El elemento no está visible; desplázate hasta él y vuelve a capturar.'));
   const c=await this.describe(s,{x:Math.min(state.width-1,Math.max(0,box.x+box.width/2)),y:Math.min(state.height-1,Math.max(0,box.y+box.height/2))});
   const id=randomUUID(),dir=this.directory(id),bounds={x:Math.max(0,box.x),y:Math.max(0,box.y),width:box.width,height:box.height},clip=await this.crop(s,bounds,join(dir,'before.png'),state);
   const number=1+Math.max(0,...this.mine({agentId:s.agentId,profileId:s.profileId}).map(a=>a.number||0));
   return this.view(this.save({id,number,agentId:s.agentId,profileId:s.profileId,projectId:s.projectId,environmentId:s.environmentId,browserId:s.id,author:'agent',status:'proposed',kind:'element',comment:text(v.comment,4000),intent:INTENTS.includes(v.intent)?v.intent:'change',severity:SEVERITIES.includes(v.severity)?v.severity:'suggestion',url:this.browsers.cleanURL(s.page.url()),viewport:{width:state.width,height:state.height},scroll:{x:state.x,y:state.y},bounds,clip,docBounds:{...bounds,y:bounds.y+state.y,x:bounds.x+state.x},targets:c?[c]:[],selectedText:'',styleChanges:[],issues:[],images:{before:'before.png',after:null},thread:[],createdAt:stamp()}));
  });s.serial=job.catch(()=>{});return job;
 }

 async preview(s,a,v){
  const target=a.targets?.[0];check(target&&!target.frameChain?.length&&a.kind!=='region'&&a.kind!=='text',t('Los ajustes en vivo funcionan con un elemento del documento principal.'));
  const allowed=['color','background-color','font-size','font-weight','line-height','letter-spacing','padding','margin','gap','border-radius','border','width','height','opacity','text-align','box-shadow'];
  const styles=Object.fromEntries(Object.entries(v.styles||{}).filter(([k,val])=>allowed.includes(k)&&String(val).length<=200&&!/url\(|expression|javascript:/i.test(String(val))));
  const result=await s.page.evaluate(previewStyle,{selector:target.selector,styles,reset:!!v.reset});check(result,t('No se encontró el componente.'));
  if(v.reset)a.styleChanges=[];else for(const [property,to] of Object.entries(styles)){const prior=a.styleChanges.find(c=>c.property===property);if(prior)prior.to=String(to);else a.styleChanges.push({property,from:result.before[property]||'',to:String(to)})}
  return this.view(this.save(a));
 }

 image(a,which){const file=a.images?.[which];check(file,t('La captura no está disponible.'));const path=join(this.directory(a.id),file);check(existsSync(path)&&statSync(path).size<8_000_000,t('La captura no está disponible.'));return {image:'data:image/png;base64,'+readFileSync(path).toString('base64'),at:which==='after'?a.afterAt:a.createdAt}}

 // role: 'human' for app calls (browser.annotation.*), 'agent' for MCP calls (annotation.*).
 async dispatch(method,v,role){
  const human=role==='human';
  if(method==='annotation.list'){const since=Number(v.since)||0;if(since&&since===this.revision)return {unchanged:true,revision:this.revision};let list=this.mine(v);if(v.status)list=list.filter(a=>[].concat(v.status).includes(a.status));if(!human)list=list.filter(a=>a.status!=='draft');return {annotations:list.slice(0,200).map(a=>this.view(a)),revision:this.revision}}
  if(method==='annotation.watch'){check(!human,t('Operación QA desconocida.'));return this.watch(v)}
  if(method==='annotation.suggest'){check(!human,t('Operación QA desconocida.'));return this.suggest(v)}
  if(method==='annotation.send'){check(human,t('Operación QA desconocida.'));return this.send(v)}
  if(method==='annotation.create'){check(human,t('Operación QA desconocida.'));const s=this.browsers.get(v);const job=s.serial.then(()=>this.create(s,v));s.serial=job.catch(()=>{});return job}
  const a=this.find(v);
  if(method==='annotation.image')return this.image(a,v.which==='after'?'after':'before');
  if(method==='annotation.update'){check(human&&['draft','proposed'].includes(a.status),t('Solo puedes editar anotaciones sin enviar.'));if(v.comment!==undefined)a.comment=text(v.comment,4000).trim();if(INTENTS.includes(v.intent))a.intent=v.intent;if(SEVERITIES.includes(v.severity))a.severity=v.severity;return this.view(this.save(a))}
  if(method==='annotation.delete'){check(human,t('Operación QA desconocida.'));if(a.styleChanges?.length){const s=this.session(a);if(s)await s.page.evaluate(previewStyle,{selector:a.targets[0].selector,reset:true}).catch(()=>{})}rmSync(join(this.service.root,'annotations',a.id),{recursive:true,force:true});this.service.remove('annotation',a.id);this.touch(a.agentId);return {deleted:true}}
  if(method==='annotation.accept'){check(human&&a.status==='proposed',t('La anotación ya no es una propuesta.'));a.status='draft';a.author='agent';return this.view(this.save(a))}
  if(method==='annotation.preview'){check(human,t('Operación QA desconocida.'));const s=this.browsers.get({...v,id:a.browserId});const job=s.serial.then(()=>this.preview(s,a,v));s.serial=job.catch(()=>{});return job}
  if(method==='annotation.verify'){check(human,t('Operación QA desconocida.'));const result=await this.verify(a);this.save(a);return {...this.view(a),verification:result}}
  if(method==='annotation.reply'){const content=text(v.message,4000).trim();check(content,t('Escribe un mensaje.'));a.thread.push({id:randomUUID(),role,content,timestamp:stamp()});if(a.thread.length>50)a.thread.shift();if(human){a.watchSeenAt=0;if(FINAL.concat(['acknowledged']).includes(a.status))a.status='pending'}return this.view(this.save(a))}
  if(method==='annotation.ack'){check(OPEN.includes(a.status),t('La anotación no está pendiente.'));a.status='acknowledged';a.acknowledgedAt=stamp();if(v.message)a.thread.push({id:randomUUID(),role,content:text(v.message,4000),timestamp:stamp()});return this.view(this.save(a))}
  if(method==='annotation.resolve'){check(OPEN.includes(a.status)||human&&a.status==='draft',t('La anotación no está pendiente.'));a.status='resolved';a.resolvedAt=stamp();a.resolvedBy=role;a.summary=text(v.summary,4000);if(a.summary)a.thread.push({id:randomUUID(),role,content:a.summary,timestamp:stamp()});const verification=await this.verify(a).catch(e=>({captured:false,reason:String(e.message).slice(0,200)}));this.save(a);return {...this.view(a),verification}}
  if(method==='annotation.dismiss'){check(OPEN.includes(a.status)||a.status==='proposed'||human&&a.status==='draft',t('La anotación no está pendiente.'));a.status='dismissed';a.resolvedAt=stamp();a.resolvedBy=role;a.reason=text(v.reason,2000);if(a.reason)a.thread.push({id:randomUUID(),role,content:a.reason,timestamp:stamp()});return this.view(this.save(a))}
  throw Error(t('Operación QA desconocida.'));
 }
}
