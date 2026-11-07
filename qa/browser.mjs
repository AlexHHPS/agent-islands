import {mkdirSync,writeFileSync,readFileSync,existsSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

const check=(ok,message)=>{if(!ok)throw Error(message)};
const stamp=()=>Date.now()/1000;
const cleanURL=raw=>{try{const u=new URL(raw);return u.origin+u.pathname}catch{return ''}};
const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Runs in the inspected document (including cross-origin frames). Never reads input values.
export function inspectPoint({x,y,active=false}){
 let el=active?document.activeElement:document.elementFromPoint(x,y);
 while(el?.shadowRoot){const next=el.shadowRoot.elementFromPoint(x,y);if(!next||next===el)break;el=next}
 if(!el)return null;
 const selector=node=>{const parts=[];for(let n=node;n?.nodeType===1&&parts.length<7;n=n.parentElement){let s=n.localName;if(n.id){parts.unshift('#'+CSS.escape(n.id));break}const tid=n.getAttribute('data-testid');if(tid){parts.unshift('[data-testid='+JSON.stringify(tid)+']');break}const siblings=n.parentElement?[...n.parentElement.children].filter(c=>c.localName===n.localName):[];if(siblings.length>1)s+=':nth-of-type('+(siblings.indexOf(n)+1)+')';parts.unshift(s)}return parts.join(' > ')};
 const r=el.getBoundingClientRect(),sensitive=el.matches('input,textarea,[contenteditable=true]');
 return {tag:el.localName,selector:selector(el),shadow:el.getRootNode() instanceof ShadowRoot,role:el.getAttribute('role')||'',label:(el.getAttribute('aria-label')||el.getAttribute('alt')||'').slice(0,200),text:sensitive?'':(el.innerText||'').trim().slice(0,600),bounds:{x:r.x,y:r.y,width:r.width,height:r.height},ancestors:[...function*(n){for(let i=0;n&&i<5;n=n.parentElement,i++)yield n}(el)].map(n=>({tag:n.localName,id:n.id,classes:[...n.classList].slice(0,8)})),source:el.getAttribute('data-source')||el.getAttribute('data-file')||null};
}

export class BrowserSessions {
 constructor(service){this.service=service;this.sessions=new Map()}
 list(profileId,projectIds){return [...this.sessions.values()].filter(s=>(!profileId||s.profileId===profileId)&&(!Array.isArray(projectIds)||projectIds.includes(s.projectId))).map(s=>this.describe(s))}
 describe(s){return {id:s.id,agentId:s.agentId,profileId:s.profileId,environmentId:s.environmentId,projectId:s.projectId,account:s.account,recording:!!s.recording,recordingStartedAt:s.recording?.startedAt,recordingId:s.recording?.id,url:cleanURL(s.page.url()),loginId:s.loginId||null}}
 get(v){const s=this.sessions.get(v.id);check(s,'El navegador ya está cerrado.');check(!v.profileId||s.profileId===v.profileId,'El navegador pertenece a otro perfil.');check(!v.agentId||s.agentId===v.agentId,'El navegador pertenece a otra conversación.');check(!Array.isArray(v.projectIds)||v.projectIds.includes(s.projectId),'El navegador está fuera del workspace.');s.touched=stamp();return s}
 async open(v){
  check(this.sessions.size<4,'Ya hay cuatro navegadores abiertos.');this.service.profile(v.profileId);const env=this.service.environment(v.environmentId);
  let browser,context,page,login;
  if(v.loginId){login=this.service.logins.get(v.loginId);check(login&&login.profileId===v.profileId&&login.environmentId===env.id,'La ventana de acceso pertenece a otro perfil o entorno.');check(![...this.sessions.values()].some(s=>s.loginId===login.id),'La ventana ya está controlada desde la app.');({browser,context,page}=login)}
  else{browser=await (await this.service.browser()).launch(this.service.browserOptions());try{const auth=this.service.authPath(v.profileId,env,v.account);context=await browser.newContext({...(existsSync(auth)?{storageState:auth}:{}),viewport:{width:1280,height:800},deviceScaleFactor:1});page=await context.newPage();await page.goto(new URL(env.healthPath,env.origin).href,{waitUntil:'domcontentloaded',timeout:30000})}catch(e){await browser.close();throw e}}
  const s={id:randomUUID(),profileId:v.profileId,agentId:v.agentId||null,environmentId:env.id,projectId:env.projectId,account:v.account||'default',browser,context,page,loginId:login?.id,touched:stamp(),frames:new Map(),serial:Promise.resolve(),recording:null};this.sessions.set(s.id,s);
  // Per-context binding observes native windows too. Only explicit recordings retain events.
  s.binding='islandsObserve'+s.id.replaceAll('-','');
  await context.exposeBinding(s.binding,({page:source},event)=>{if(s.recording&&source===s.page&&s.recording.events.length<1000)s.recording.events.push({...event,at:stamp()-s.recording.startedAt,url:cleanURL(source.url())})});
  const observe=({binding})=>{if(window[binding+'Installed'])return;window[binding+'Installed']=true;for(const type of ['click','change','submit'])document.addEventListener(type,e=>{const el=e.composedPath()[0];if(!el?.localName)return;const sensitive=el.matches('input,textarea,[contenteditable=true]');window[binding]({action:type,component:{tag:el.localName,selector:el.id?'#'+CSS.escape(el.id):el.localName,label:(el.getAttribute('aria-label')||'').slice(0,200),text:sensitive?'':(el.innerText||'').slice(0,300)}}).catch(()=>{})},true)};
  s.observe=observe;s.observeArgs={binding:s.binding,inspect:inspectPoint.toString()};await context.addInitScript(observe,s.observeArgs);
  for(const p of context.pages())for(const f of p.frames())await f.evaluate(observe,s.observeArgs).catch(()=>{});
  s.onPage=p=>{s.serial=s.serial.then(()=>this.switchPage(s,p)).catch(e=>{s.recordingError=String(e.message)})};context.on('page',s.onPage);
  s.timer=setInterval(()=>{if(stamp()-s.touched>30*60)this.close(s.id).catch(()=>{})},60000);s.timer.unref();
  try{return await this.frame(s)}catch(e){await this.close(s.id);throw e}
 }
 async switchPage(s,page){if(page.isClosed())return;if(s.recording)await this.stopSegment(s);s.page=page;s.frames.clear();if(s.recording)await this.startSegment(s);await page.bringToFront()}
 async state(s){return s.page.evaluate(()=>({url:location.href,x:scrollX,y:scrollY,width:innerWidth,height:innerHeight,epoch:performance.timeOrigin}))}
 async frame(s){
  if(s.page.isClosed()){const next=s.context.pages().find(p=>!p.isClosed());check(next,'La pestaña se ha cerrado.');await this.switchPage(s,next)}
  let image,after,stable=false;for(let attempt=0;attempt<4;attempt++){const before=await this.state(s);image=await s.page.screenshot({type:'jpeg',quality:75,timeout:5000});after=await this.state(s);if(JSON.stringify(before)===JSON.stringify(after)){stable=true;break}await new Promise(r=>setTimeout(r,100))}
  check(stable,'La página está cambiando. Vuelve a intentarlo.');
  const token=randomUUID();s.frames.set(token,after);while(s.frames.size>8)s.frames.delete(s.frames.keys().next().value);
  return {...this.describe(s),frameToken:token,width:after.width,height:after.height,image:'data:image/jpeg;base64,'+image.toString('base64'),tabs:s.context.pages().filter(p=>!p.isClosed()).map((p,index)=>({index,url:cleanURL(p.url()),active:p===s.page})),recordingError:s.recordingError||null};
 }
 async at(s,point){let frame=s.page.mainFrame(),x=point.x,y=point.y,offset={x:0,y:0},chain=[];
  for(let depth=0;depth<8;depth++){const handle=await frame.evaluateHandle(({x,y})=>{let el=document.elementFromPoint(x,y);while(el?.shadowRoot){const n=el.shadowRoot.elementFromPoint(x,y);if(!n||n===el)break;el=n}return el},{x,y});const el=handle.asElement(),child=el?await el.contentFrame():null;
   if(!child){await handle.dispose();const component=await frame.evaluate(inspectPoint,{x,y});return component?{...component,frameURL:cleanURL(frame.url()),frameChain:chain,offset}:null}
   const box=await el.boundingBox();await handle.dispose();if(!box)break;chain.push(cleanURL(child.url()));frame=child;offset={x:box.x,y:box.y};x=point.x-box.x;y=point.y-box.y;
  }return null;
 }
 async validateFrame(s,v){const previous=s.frames.get(v.frameToken);check(previous&&JSON.stringify(previous)===JSON.stringify(await this.state(s)),'La página cambió desde la captura. Actualiza y selecciona de nuevo.');return previous}
 directory(id){const dir=join(this.service.root,'references',id);mkdirSync(dir,{recursive:true,mode:0o700});return dir}
 saveReference(s,value,dir){
  const ref={schemaVersion:1,...value,agentId:s.agentId,profileId:s.profileId,environmentId:s.environmentId,projectId:s.projectId,account:s.account,url:cleanURL(s.page.url()),createdAt:stamp()};
  writeFileSync(join(dir,'reference.json'),JSON.stringify(ref,null,2),{mode:0o600});
  const media=(ref.videos||[]).map(v=>'<video controls preload="metadata" src="'+html(v)+'"></video>').join('');
  const images=(ref.images||[]).map(i=>'<img alt="Fotograma de referencia" src="'+html(i)+'">').join('');
  writeFileSync(join(dir,'index.html'),'<!doctype html><meta charset="utf-8"><meta name="color-scheme" content="light dark"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src \'self\'; media-src \'self\'; style-src \'unsafe-inline\'"><title>'+html(ref.name)+'</title><style>body{font:16px system-ui;margin:24px;max-width:1100px}video,img{display:block;width:100%;margin:16px 0}li{margin:12px 0}</style><h1>'+html(ref.name)+'</h1><p>'+html(ref.url)+'</p>'+media+images+'<ol>'+(ref.events||[]).map(e=>'<li>'+html(e.at.toFixed(1)+'s · '+e.action+' · '+(e.component?.label||e.component?.text||e.url||''))+'</li>').join('')+'</ol>',{mode:0o600});
  this.service.put('reference',ref);return ref;
 }
 payload(ref){const dir=join(this.service.root,'references',ref.id);return {reference:{...ref,manifest:join(dir,'reference.json'),preview:'data:image/png;base64,'+readFileSync(join(dir,ref.images[0])).toString('base64')}}}
 async capture(s,v){
  const state=await this.validateFrame(s,v);const point={x:Number(v.x),y:Number(v.y)};check(Number.isFinite(point.x)&&Number.isFinite(point.y)&&point.x>=0&&point.y>=0&&point.x<state.width&&point.y<state.height,'Selecciona dentro del navegador.');
  const component=await this.at(s,point);let clip;
  if(v.kind==='component'){check(component,'No se encontró el componente.');clip={x:component.bounds.x+component.offset.x,y:component.bounds.y+component.offset.y,width:component.bounds.width,height:component.bounds.height}}
  else{check(v.kind==='region','Tipo de captura desconocido.');clip={x:point.x,y:point.y,width:Number(v.width),height:Number(v.height)}}
  clip.x=Math.max(0,clip.x);clip.y=Math.max(0,clip.y);clip.width=Math.min(clip.width,state.width-clip.x);clip.height=Math.min(clip.height,state.height-clip.y);check(Object.values(clip).every(Number.isFinite)&&clip.width>=3&&clip.height>=3,'Selecciona una región de al menos 3 × 3 píxeles.');
  const id=randomUUID(),dir=this.directory(id);await s.page.screenshot({path:join(dir,'capture.png'),clip,timeout:5000});chmodSync(join(dir,'capture.png'),0o600);
  check(JSON.stringify(state)===JSON.stringify(await this.state(s)),'La página cambió durante la captura. Selecciona otra vez.');
  const ref=this.saveReference(s,{id,kind:v.kind,name:v.kind==='component'?'Componente · '+(component.label||component.tag):'Región del navegador',viewport:{width:state.width,height:state.height},scroll:{x:state.x,y:state.y},bounds:clip,component,images:['capture.png']},dir);return this.payload(ref);
 }
 async startSegment(s){const r=s.recording,file='flow-'+(r.videos.length+1)+'.webm';await s.page.screencast.start({path:join(r.dir,file),size:{width:1280,height:800},fps:15});r.videos.push(file);r.recordedPage=s.page;r.events.push({at:stamp()-r.startedAt,action:'pestaña',url:cleanURL(s.page.url())})}
 async stopSegment(s){const r=s.recording;if(r?.recordedPage){await r.recordedPage.screencast.stop().catch(e=>{r.warning='La pestaña se cerró durante la grabación: '+String(e.message).slice(0,150)});r.recordedPage=null}}
 async keyframe(s){const r=s.recording;if(!r||r.images.length>=24||s.page.isClosed())return;const file='step-'+String(r.images.length+1).padStart(2,'0')+'.png';await s.page.screenshot({path:join(r.dir,file),timeout:5000});chmodSync(join(r.dir,file),0o600);r.images.push(file);r.events.push({at:stamp()-r.startedAt,action:'fotograma',image:file,url:cleanURL(s.page.url())})}
 async startRecording(s){check(!s.recording,'Ya se está grabando este navegador.');const id=randomUUID(),dir=this.directory(id);s.recording={id,dir,startedAt:stamp(),events:[],images:[],videos:[]};try{await this.startSegment(s);await this.keyframe(s);s.recording.keyframeTimer=setInterval(()=>{s.serial=s.serial.then(()=>this.keyframe(s)).catch(()=>{})},10000);s.recording.keyframeTimer.unref();s.recording.timer=setTimeout(()=>{s.serial=s.serial.then(()=>this.stopRecording(s)).catch(()=>{})},5*60*1000);s.recording.timer.unref();return {...this.describe(s),maxSeconds:300}}catch(e){await this.stopSegment(s);s.recording=null;throw e}}
 async stopRecording(s){check(s.recording,'No hay grabación en curso.');const r=s.recording;clearTimeout(r.timer);clearInterval(r.keyframeTimer);if(r.images.length>=24)r.images.pop();await this.keyframe(s).catch(()=>{});await this.stopSegment(s);s.recording=null;for(const f of r.videos)if(existsSync(join(r.dir,f)))chmodSync(join(r.dir,f),0o600);const ref=this.saveReference(s,{id:r.id,kind:'recording',name:'Flujo grabado',duration:stamp()-r.startedAt,images:r.images,videos:r.videos,events:r.events,warning:r.warning||s.recordingError||null},r.dir);check(ref.images.length,'No se pudo capturar ningún fotograma.');return this.payload(ref)}
 async close(id){const s=this.sessions.get(id);if(!s)return {closed:true};clearInterval(s.timer);let result={};if(s.recording)result=await this.stopRecording(s);s.context.off('page',s.onPage);this.sessions.delete(id);if(!s.loginId)await s.browser.close();return {...result,closed:true}}
 async dispatch(method,v){
  if(method==='browser.list')return {browsers:this.list(v.profileId,v.projectIds),references:this.service.all('reference').filter(r=>(!v.profileId||r.profileId===v.profileId)&&(!v.agentId||r.agentId===v.agentId)&&(!Array.isArray(v.projectIds)||v.projectIds.includes(r.projectId))).slice(0,40)};
  if(method==='browser.open')return this.open(v);
  if(method==='browser.reference'){const ref=this.service.get('reference',v.referenceId);check(ref&&(!v.profileId||ref.profileId===v.profileId)&&(!v.agentId||ref.agentId===v.agentId)&&(!Array.isArray(v.projectIds)||v.projectIds.includes(ref.projectId)),'La referencia no pertenece a esta conversación o workspace.');return this.payload(ref)}
  const s=this.get(v);const job=s.serial.then(async()=>{
   if(method==='browser.frame')return this.frame(s);
   if(method==='browser.close')return this.close(s.id);
   if(method==='browser.capture')return this.capture(s,v);
   if(method==='browser.record.start')return this.startRecording(s);
   if(method==='browser.record.stop')return this.stopRecording(s);
   if(method==='browser.inspect'){await this.validateFrame(s,v);return {component:await this.at(s,{x:Number(v.x),y:Number(v.y)})}}
   if(method==='browser.action'){
    const a=v.action;
    if(['click','wheel'].includes(a))await this.validateFrame(s,v);
    if(a==='navigate'){const u=new URL(v.url);check(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password,'Usa una dirección HTTP o HTTPS.');await s.page.goto(u.href,{waitUntil:'domcontentloaded',timeout:30000})}
    else if(a==='back')await s.page.goBack({waitUntil:'domcontentloaded',timeout:15000});
    else if(a==='reload')await s.page.reload({waitUntil:'domcontentloaded',timeout:15000});
    else if(a==='tab'){const p=s.context.pages()[Number(v.index)];check(p,'Pestaña no disponible.');await this.switchPage(s,p)}
    else if(a==='click'){check(Number.isFinite(v.x)&&Number.isFinite(v.y),'Punto inválido.');await s.page.mouse.click(v.x,v.y,{clickCount:v.double?2:1})}
    else if(a==='wheel')await s.page.mouse.wheel(Math.max(-2000,Math.min(2000,Number(v.dx)||0)),Math.max(-2000,Math.min(2000,Number(v.dy)||0)));
    else if(a==='text')await s.page.keyboard.insertText(String(v.text||'').slice(0,4000));
    else if(a==='key'){check(/^(?:(?:Control|Meta|Alt|Shift)\+)*(?:Enter|Tab|Escape|Backspace|Delete|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown|[acvxz])$/.test(v.key),'Tecla no admitida.');await s.page.keyboard.press(v.key)}
    else throw Error('Acción de navegador desconocida.');
    if(s.recording){s.recording.events.push({at:stamp()-s.recording.startedAt,action:a,url:cleanURL(s.page.url())});if(!['text','key','wheel'].includes(a))await this.keyframe(s).catch(()=>{})}
    return this.frame(s);
   }throw Error('Control de navegador desconocido.');
  });s.serial=job.catch(()=>{});return job;
 }
 async dispose(){for(const id of [...this.sessions.keys()])await this.close(id)}
}
