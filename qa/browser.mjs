import {t,tr,ht,withLanguage,language} from './i18n.mjs';
import {mkdirSync,writeFileSync,readFileSync,existsSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {inspectPoint,freezePage} from './inspect.mjs';
import {SourceResolver} from './sourcemap.mjs';
import {Annotations} from './annotations.mjs';
import {detectFrontends} from './detect.mjs';

const check=(ok,message)=>{if(!ok)throw Error(message)};
const stamp=()=>Date.now()/1000;
const cleanURL=raw=>{try{const u=new URL(raw);return u.origin==='null'?u.protocol+u.pathname:u.origin+u.pathname}catch{return ''}};
const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export {inspectPoint};
const VIEWPORTS={desktop:{width:1280,height:800},laptop:{width:1440,height:900},tablet:{width:834,height:1112},mobile:{width:390,height:844}};

export class BrowserSessions {
 constructor(service){this.service=service;this.sessions=new Map();this.annotations=new Annotations(service,this);this.cleanURL=cleanURL}
 list(profileId,projectIds){return [...this.sessions.values()].filter(s=>(!profileId||s.profileId===profileId)&&(!Array.isArray(projectIds)||projectIds.includes(s.projectId))).map(s=>this.describe(s))}
 describe(s){return {id:s.id,agentId:s.agentId,profileId:s.profileId,environmentId:s.environmentId,projectId:s.projectId,account:s.account,recording:!!s.recording,recordingStartedAt:s.recording?.startedAt,recordingId:s.recording?.id,url:cleanURL(s.page.url()),loginId:s.loginId||null,viewport:s.size,frozen:!!s.frozen,issues:(s.issues||[]).length}}
 get(v){const s=this.sessions.get(v.id);check(s,t('El navegador ya está cerrado.'));check(!v.profileId||s.profileId===v.profileId,t('El navegador pertenece a otro perfil.'));check(!v.agentId||s.agentId===v.agentId,t('El navegador pertenece a otra conversación.'));check(!Array.isArray(v.projectIds)||v.projectIds.includes(s.projectId),t('El navegador está fuera del workspace.'));s.touched=stamp();return s}
 async open(v){
  check(this.sessions.size<4,t('Ya hay cuatro navegadores abiertos.'));this.service.profile(v.profileId);const env=this.service.environment(v.environmentId);
  let browser,context,page,login;const early={issues:[]};
  if(v.loginId){login=this.service.logins.get(v.loginId);check(login&&login.profileId===v.profileId&&login.environmentId===env.id,t('La ventana de acceso pertenece a otro perfil o entorno.'));check(![...this.sessions.values()].some(s=>s.loginId===login.id),t('La ventana ya está controlada desde la app.'));({browser,context,page}=login)}
  else{browser=await (await this.service.browser()).launch(this.service.browserOptions());try{const auth=this.service.authPath(v.profileId,env,v.account);context=await browser.newContext({...(existsSync(auth)?{storageState:auth}:{}),viewport:{width:1280,height:800},deviceScaleFactor:1});page=await context.newPage();this.watchIssues(early,page);await page.goto(new URL(env.healthPath,env.origin).href,{waitUntil:'domcontentloaded',timeout:30000})}catch(e){await browser.close();throw e}}
  const s={id:randomUUID(),profileId:v.profileId,agentId:v.agentId||null,environmentId:env.id,projectId:env.projectId,account:v.account||'default',browser,context,page,loginId:login?.id,touched:stamp(),frames:new Map(),serial:Promise.resolve(),recording:null,size:page.viewportSize()||{...VIEWPORTS.desktop},issues:early.issues,live:null,liveSeq:0,liveWaiters:new Set(),liveWanted:0};this.sessions.set(s.id,s);
  try{
  // Per-context binding observes native windows too. Only explicit recordings retain events.
  s.binding='islandsObserve'+s.id.replaceAll('-','');
  await context.exposeBinding(s.binding,({page:source},event)=>{if(s.recording&&source===s.page&&s.recording.events.length<1000)s.recording.events.push({...event,at:stamp()-s.recording.startedAt,url:cleanURL(source.url())})});
  const observe=({binding})=>{if(window[binding+'Installed'])return;window[binding+'Installed']=true;for(const type of ['click','change','submit'])document.addEventListener(type,e=>{const el=e.composedPath()[0];if(!el?.localName)return;const sensitive=el.matches('input,textarea,[contenteditable=true]');window[binding]({action:type,component:{tag:el.localName,selector:el.id?'#'+CSS.escape(el.id):el.localName,label:(el.getAttribute('aria-label')||'').slice(0,200),text:sensitive?'':(el.innerText||'').slice(0,300)}}).catch(()=>{})},true)};
  s.observe=observe;s.observeArgs={binding:s.binding,inspect:inspectPoint.toString()};await context.addInitScript(observe,s.observeArgs);
  for(const p of context.pages()){this.watchIssues(s,p);for(const f of p.frames())await f.evaluate(observe,s.observeArgs).catch(()=>{})}
  s.onPage=p=>{this.watchIssues(s,p);s.serial=s.serial.then(()=>this.switchPage(s,p)).catch(e=>{s.recordingError=String(e.message)})};context.on('page',s.onPage);
  s.timer=setInterval(()=>{if(stamp()-s.touched>30*60)this.close(s.id).catch(()=>{});else if(!s.recording&&s.castPage&&stamp()-s.liveWanted>20)this.stopCast(s).catch(()=>{})},15000);s.timer.unref();
  // A crashed or externally closed browser must not keep counting as an open session.
  if(!login)browser.once?.('disconnected',()=>{clearInterval(s.timer);for(const w of s.liveWaiters)w();if(s.recording){clearTimeout(s.recording.timer);clearInterval(s.recording.keyframeTimer)}this.sessions.delete(s.id)});
  return await this.frame(s)}catch(e){await this.close(s.id).catch(()=>{});throw e}
 }
 async switchPage(s,page){if(page.isClosed())return;if(s.recording)await this.stopSegment(s);else await this.stopCast(s);s.page=page;s.frames.clear();if(s.frozen)await this.freeze(s,true).catch(()=>{});if(s.recording)await this.startSegment(s);else if(stamp()-s.liveWanted<20)await this.cast(s,page,null).catch(()=>{});await page.bringToFront()}
 // Console errors, uncaught exceptions and failed requests become context for annotations.
 watchIssues(s,page){if(page.__islandsIssues)return;page.__islandsIssues=true;const push=issue=>{s.issues.push({...issue,at:stamp(),page:cleanURL(page.url())});if(s.issues.length>60)s.issues.shift()};
  page.on('console',m=>{if(['error','warning'].includes(m.type()))push({kind:m.type(),message:String(m.text()).replace(/https?:\/\/[^\s)]+/g,u=>cleanURL(u)||u).slice(0,300)})});
  page.on('pageerror',e=>push({kind:'exception',message:String(e.message).slice(0,300)}));
  page.on('requestfailed',r=>push({kind:'request',message:r.method()+' '+cleanURL(r.url())+' · '+String(r.failure()?.errorText||'').slice(0,80)}));
  page.on('response',r=>{if(r.status()>=400)push({kind:'http '+r.status(),message:r.request().method()+' '+cleanURL(r.url())})})}
 // One screencast per page carries the live view and, while recording, the WebM segment.
 async cast(s,page,path){await this.stopCast(s);if(page.isClosed())return;await page.screencast.start({onFrame:f=>this.liveFrame(s,page,f),size:s.size,quality:70,...(path?{path,fps:15}:{})});s.castPage=page;s.castPath=path||null}
 async stopCast(s){const page=s.castPage;s.castPage=null;s.castPath=null;if(page&&!page.isClosed())await page.screencast.stop()}
 liveFrame(s,page,f){if(page!==s.page)return;s.live={seq:++s.liveSeq,data:f.data,width:f.viewportWidth||s.size.width,height:f.viewportHeight||s.size.height,at:stamp()};for(const w of [...s.liveWaiters])w()}
 async live(s,v){s.liveWanted=stamp();if(s.page.isClosed())return this.frame(s);if(!s.castPage&&!s.recording)await this.cast(s,s.page,null);
  const since=Number(v.since)||0;if(!(s.live?.seq>since))await new Promise(resolve=>{const done=()=>{clearTimeout(timer);s.liveWaiters.delete(done);resolve()};const timer=setTimeout(done,1500);s.liveWaiters.add(done)});
  if(!s.live)return this.frame(s);if(s.live.seq<=since)return {...this.describe(s),unchanged:true,seq:s.live.seq};
  const scroll=await this.state(s).catch(()=>null);
  return {...this.describe(s),live:true,seq:s.live.seq,image:'data:image/jpeg;base64,'+s.live.data.toString('base64'),width:s.live.width,height:s.live.height,scroll:scroll&&{x:scroll.x,y:scroll.y},tabs:s.context.pages().filter(p=>!p.isClosed()).map((p,index)=>({index,url:cleanURL(p.url()),active:p===s.page})),recordingError:s.recordingError||null}}
 async freeze(s,on){s.frozen=!!on;for(const f of s.page.frames())await f.evaluate(freezePage,!!on).catch(()=>{})}
 resolver(s){if(!s.resolver)s.resolver=new SourceResolver(async url=>{const u=new URL(url);if(!['http:','https:'].includes(u.protocol))return null;const r=await s.context.request.get(u.href,{timeout:8000,maxRedirects:2}).catch(()=>null);if(!r?.ok())return null;const body=await r.body();return body.length>12*1024*1024?null:body.toString('utf8')});return s.resolver}
 async state(s){return s.page.evaluate(()=>({url:location.href,x:scrollX,y:scrollY,width:innerWidth,height:innerHeight,epoch:performance.timeOrigin}))}
 async frame(s){
  if(s.page.isClosed()){const next=s.context.pages().find(p=>!p.isClosed());check(next,t('La pestaña se ha cerrado.'));await this.switchPage(s,next)}
  let image,after,stable=false;for(let attempt=0;attempt<4;attempt++){const before=await this.state(s);image=await s.page.screenshot({type:'jpeg',quality:75,timeout:5000});after=await this.state(s);if(JSON.stringify(before)===JSON.stringify(after)){stable=true;break}await new Promise(r=>setTimeout(r,100))}
  check(stable,t('La página está cambiando. Vuelve a intentarlo.'));
  const token=randomUUID();s.frames.set(token,after);while(s.frames.size>8)s.frames.delete(s.frames.keys().next().value);
  return {...this.describe(s),frameToken:token,width:after.width,height:after.height,scroll:{x:after.x,y:after.y},image:'data:image/jpeg;base64,'+image.toString('base64'),tabs:s.context.pages().filter(p=>!p.isClosed()).map((p,index)=>({index,url:cleanURL(p.url()),active:p===s.page})),recordingError:s.recordingError||null};
 }
 async at(s,point,rect=null){let frame=s.page.mainFrame(),x=point.x,y=point.y,offset={x:0,y:0},chain=[];
  for(let depth=0;depth<8;depth++){const handle=await frame.evaluateHandle(({x,y})=>{let el=document.elementFromPoint(x,y);while(el?.shadowRoot){const n=el.shadowRoot.elementFromPoint(x,y);if(!n||n===el)break;el=n}return el},{x,y});const el=handle.asElement(),child=el?await el.contentFrame():null;
   if(!child){await handle.dispose();const component=await frame.evaluate(inspectPoint,{x,y,rect:rect&&{...rect,x:rect.x-offset.x,y:rect.y-offset.y}});return component?{...component,frameURL:cleanURL(frame.url()),frameChain:chain,offset}:null}
   const box=await el.boundingBox();await handle.dispose();if(!box)break;chain.push(cleanURL(child.url()));frame=child;offset={x:box.x,y:box.y};x=point.x-box.x;y=point.y-box.y;
  }return null;
 }
 async validateFrame(s,v){const previous=s.frames.get(v.frameToken);check(previous&&JSON.stringify(previous)===JSON.stringify(await this.state(s)),t('La página cambió desde la captura. Actualiza y selecciona de nuevo.'));return previous}
 directory(id){const dir=join(this.service.root,'references',id);mkdirSync(dir,{recursive:true,mode:0o700});return dir}
 saveReference(s,value,dir){
  const ref={schemaVersion:1,...value,agentId:s.agentId,profileId:s.profileId,environmentId:s.environmentId,projectId:s.projectId,account:s.account,url:cleanURL(s.page.url()),createdAt:stamp()};
  writeFileSync(join(dir,'reference.json'),JSON.stringify(ref,null,2),{mode:0o600});
  const actionLabel=action=>({click:t('Clic'),change:t('Cambio'),submit:t('Enviar formulario'),tab:t('Pestaña'),keyframe:t('Fotograma'),navigate:t('Navegar'),reload:t('Recargar'),back:t('Atrás'),wheel:t('Desplazar'),text:t('Escribir'),key:t('Tecla')})[action]||action;
  const media=(ref.videos||[]).map(v=>'<video controls preload="metadata" src="'+html(v)+ht('"></video>')).join('');
  const images=(ref.images||[]).map(i=>ht`<img alt="Fotograma de referencia" src="${html(i)}">`).join('');
  writeFileSync(join(dir,'index.html'),'<!doctype html><html lang="'+language()+'">'+ht('<meta charset="utf-8"><meta name="color-scheme" content="light dark"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src \'self\'; media-src \'self\'; style-src \'unsafe-inline\'"><title>')+html(ref.name)+ht('</title><style>body{font:16px system-ui;margin:24px;max-width:1100px}video,img{display:block;width:100%;margin:16px 0}li{margin:12px 0}</style><h1>')+html(ref.name)+ht('</h1><p>')+html(ref.url)+ht('</p>')+media+images+ht('<ol>')+(ref.events||[]).map(e=>ht('<li>')+html(new Intl.NumberFormat(language(),{maximumFractionDigits:1}).format(e.at)+'s · '+actionLabel(e.action)+' · '+(e.component?.label||e.component?.text||e.url||''))+ht('</li>')).join('')+ht('</ol>')+'</html>',{mode:0o600});
  this.service.put('reference',ref);return ref;
 }
 payload(ref){const dir=join(this.service.root,'references',ref.id);return {reference:{...ref,manifest:join(dir,'reference.json'),preview:'data:image/png;base64,'+readFileSync(join(dir,ref.images[0])).toString('base64')}}}
 async capture(s,v){
  const state=await this.validateFrame(s,v);const point={x:Number(v.x),y:Number(v.y)};check(Number.isFinite(point.x)&&Number.isFinite(point.y)&&point.x>=0&&point.y>=0&&point.x<state.width&&point.y<state.height,t('Selecciona dentro del navegador.'));
  const component=await this.at(s,point);let clip;
  if(v.kind==='component'){check(component,t('No se encontró el componente.'));clip={x:component.bounds.x+component.offset.x,y:component.bounds.y+component.offset.y,width:component.bounds.width,height:component.bounds.height}}
  else{check(v.kind==='region',t('Tipo de captura desconocido.'));clip={x:point.x,y:point.y,width:Number(v.width),height:Number(v.height)}}
  clip.x=Math.max(0,clip.x);clip.y=Math.max(0,clip.y);clip.width=Math.min(clip.width,state.width-clip.x);clip.height=Math.min(clip.height,state.height-clip.y);check(Object.values(clip).every(Number.isFinite)&&clip.width>=3&&clip.height>=3,t('Selecciona una región de al menos 3 × 3 píxeles.'));
  const id=randomUUID(),dir=this.directory(id);await s.page.screenshot({path:join(dir,'capture.png'),clip,timeout:5000});chmodSync(join(dir,'capture.png'),0o600);
  check(JSON.stringify(state)===JSON.stringify(await this.state(s)),t('La página cambió durante la captura. Selecciona otra vez.'));
  const ref=this.saveReference(s,{id,kind:v.kind,name:v.kind==='component'?t('Componente · ')+(component.label||component.tag):t('Región del navegador'),viewport:{width:state.width,height:state.height},scroll:{x:state.x,y:state.y},bounds:clip,component,images:['capture.png']},dir);return this.payload(ref);
 }
 async startSegment(s){const r=s.recording,file='flow-'+(r.videos.length+1)+'.webm';await this.cast(s,s.page,join(r.dir,file));r.videos.push(file);r.recordedPage=s.page;r.events.push({at:stamp()-r.startedAt,action:'tab',url:cleanURL(s.page.url())})}
 async stopSegment(s){const r=s.recording;if(r?.recordedPage){await this.stopCast(s).catch(e=>{r.warning=t('La pestaña se cerró durante la grabación: ')+String(e.message).slice(0,150)});r.recordedPage=null}}
 async keyframe(s){const r=s.recording;if(!r||r.images.length>=24||s.page.isClosed())return;const file='step-'+String(r.images.length+1).padStart(2,'0')+'.png';await s.page.screenshot({path:join(r.dir,file),timeout:5000});chmodSync(join(r.dir,file),0o600);r.images.push(file);r.events.push({at:stamp()-r.startedAt,action:'keyframe',image:file,url:cleanURL(s.page.url())})}
 async startRecording(s){check(!s.recording,t('Ya se está grabando este navegador.'));const id=randomUUID(),dir=this.directory(id);s.recording={id,dir,startedAt:stamp(),events:[],images:[],videos:[]};try{await this.startSegment(s);await this.keyframe(s);s.recording.keyframeTimer=setInterval(()=>{s.serial=s.serial.then(()=>this.keyframe(s)).catch(()=>{})},10000);s.recording.keyframeTimer.unref();s.recording.timer=setTimeout(()=>{s.serial=s.serial.then(()=>this.stopRecording(s)).catch(()=>{})},5*60*1000);s.recording.timer.unref();return {...this.describe(s),maxSeconds:300}}catch(e){await this.stopSegment(s);s.recording=null;throw e}}
 async stopRecording(s){check(s.recording,t('No hay grabación en curso.'));const r=s.recording;clearTimeout(r.timer);clearInterval(r.keyframeTimer);if(r.images.length>=24)r.images.pop();await this.keyframe(s).catch(()=>{});await this.stopSegment(s);s.recording=null;if(stamp()-s.liveWanted<20)await this.cast(s,s.page,null).catch(()=>{});for(const f of r.videos)if(existsSync(join(r.dir,f)))chmodSync(join(r.dir,f),0o600);const ref=this.saveReference(s,{id:r.id,kind:'recording',name:t('Flujo grabado'),duration:stamp()-r.startedAt,images:r.images,videos:r.videos,events:r.events,warning:r.warning||s.recordingError||null},r.dir);check(ref.images.length,t('No se pudo capturar ningún fotograma.'));return this.payload(ref)}
 async close(id){const s=this.sessions.get(id);if(!s)return {closed:true};clearInterval(s.timer);for(const w of s.liveWaiters)w();let result={};try{if(s.recording)result=await this.stopRecording(s)}finally{await this.stopCast(s).catch(()=>{});if(s.onPage)s.context.off('page',s.onPage);this.sessions.delete(id);if(!s.loginId)await s.browser.close().catch(()=>{})}return {...result,closed:true}}
 async dispatch(method,v){
  if(method==='browser.list')return {browsers:this.list(v.profileId,v.projectIds),references:this.service.all('reference').filter(r=>(!v.profileId||r.profileId===v.profileId)&&(!v.agentId||r.agentId===v.agentId)&&(!Array.isArray(v.projectIds)||v.projectIds.includes(r.projectId))).slice(0,40)};
  if(method==='browser.open')return this.open(v);
  if(method==='browser.detect'){const paths=v.projectPaths&&typeof v.projectPaths==='object'?v.projectPaths:{};return detectFrontends(Object.entries(paths).filter(([id,path])=>(!Array.isArray(v.projectIds)||v.projectIds.includes(id))&&typeof path==='string').slice(0,8).map(([id,path])=>({id,path,name:id})))}
  if(method.startsWith('browser.annotation.'))return this.annotations.dispatch(method.slice(8),v,'human');
  if(method==='browser.reference'){const ref=this.service.get('reference',v.referenceId);check(ref&&(!v.profileId||ref.profileId===v.profileId)&&(!v.agentId||ref.agentId===v.agentId)&&(!Array.isArray(v.projectIds)||v.projectIds.includes(ref.projectId)),t('La referencia no pertenece a esta conversación o workspace.'));return this.payload(ref)}
  const s=this.get(v);if(method==='browser.live')return this.live(s,v);const job=s.serial.then(async()=>{
   if(method==='browser.frame')return this.frame(s);
   if(method==='browser.close')return this.close(s.id);
   if(method==='browser.capture')return this.capture(s,v);
   if(method==='browser.record.start')return this.startRecording(s);
   if(method==='browser.record.stop')return this.stopRecording(s);
   if(method==='browser.record.note'){check(s.recording,t('No hay grabación en curso.'));const note=String(v.text||'').trim().slice(0,1000);check(note,t('Escribe un mensaje.'));s.recording.events.push({at:stamp()-s.recording.startedAt,action:'note',text:note,url:cleanURL(s.page.url())});await this.keyframe(s).catch(()=>{});return {...this.describe(s),notes:s.recording.events.filter(e=>e.action==='note').length}}
   if(method==='browser.inspect'){await this.validateFrame(s,v);return {component:await this.at(s,{x:Number(v.x),y:Number(v.y)})}}
   if(method==='browser.action'){
    const a=v.action;
    if(['click','wheel'].includes(a)&&v.frameToken)await this.validateFrame(s,v);
    if(a==='navigate'){const u=new URL(v.url);check(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password,t('Usa una dirección HTTP o HTTPS.'));await s.page.goto(u.href,{waitUntil:'domcontentloaded',timeout:30000})}
    else if(a==='back')await s.page.goBack({waitUntil:'domcontentloaded',timeout:15000});
    else if(a==='reload')await s.page.reload({waitUntil:'domcontentloaded',timeout:15000});
    else if(a==='viewport'){const preset=VIEWPORTS[v.preset];check(preset,t('Tamaño de pantalla no disponible.'));check(!s.recording,t('Termina la grabación antes de cambiar el tamaño.'));s.size={...preset};await s.page.setViewportSize(s.size);s.frames.clear();if(s.castPage)await this.cast(s,s.page,s.castPath).catch(()=>{})}
    else if(a==='freeze')await this.freeze(s,!!v.on);
    else if(a==='tab'){const p=s.context.pages()[Number(v.index)];check(p,t('Pestaña no disponible.'));await this.switchPage(s,p)}
    else if(a==='click'){check(Number.isFinite(v.x)&&Number.isFinite(v.y)&&v.x>=0&&v.y>=0&&v.x<s.size.width&&v.y<s.size.height,t('Punto inválido.'));await s.page.mouse.click(v.x,v.y,{clickCount:v.double?2:1})}
    else if(a==='wheel')await s.page.mouse.wheel(Math.max(-2000,Math.min(2000,Number(v.dx)||0)),Math.max(-2000,Math.min(2000,Number(v.dy)||0)));
    else if(a==='text')await s.page.keyboard.insertText(String(v.text||'').slice(0,4000));
    else if(a==='key'){check(/^(?:(?:Control|Meta|Alt|Shift)\+)*(?:Enter|Tab|Escape|Backspace|Delete|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown|[acvxz])$/.test(v.key),t('Tecla no admitida.'));await s.page.keyboard.press(v.key)}
    else throw Error(t('Acción de navegador desconocida.'));
    if(s.recording){s.recording.events.push({at:stamp()-s.recording.startedAt,action:a,url:cleanURL(s.page.url())});if(!['text','key','wheel'].includes(a))await this.keyframe(s).catch(()=>{})}
    return this.frame(s);
   }throw Error(t('Control de navegador desconocido.'));
  });s.serial=job.catch(()=>{});return job;
 }
 async dispose(){for(const id of [...this.sessions.keys()])await this.close(id)}
}
