import {t,tr,ht,withLanguage,language} from './i18n.mjs';
import {DatabaseSync} from 'node:sqlite';
import {BrowserSessions} from './browser.mjs';
import {mkdirSync,readFileSync,writeFileSync,existsSync,chmodSync,realpathSync,readdirSync,unlinkSync,statSync,rmSync} from 'node:fs';
import {join,resolve,dirname,relative,isAbsolute} from 'node:path';
import {homedir,tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer,request as httpRequest} from 'node:http';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import {createRequire} from 'node:module';

const here=dirname(fileURLToPath(import.meta.url));
export const defaultRoot=join(homedir(),'Library/Application Support/Agent Islands/qa');
const hash=s=>createHash('sha256').update(s).digest('hex').slice(0,28);
const text=(s,max=2000)=>String(s??'').slice(0,max);
const now=()=>Date.now()/1000;
const safeError=e=>text(e?.message||e,500).replace(/Bearer\s+\S+|sk-[\w-]+/gi,'[omitido]').replace(/https?:\/\/[^\s]+/g,u=>{try{const a=new URL(u);return a.origin+a.pathname}catch{return '[URL]'}});
const ensure=(condition,message)=>{if(!condition)throw new Error(message)};
const key=(profile,env,account)=>hash(JSON.stringify([profile,env,account]));
const executionEnvironment=()=>Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('ANTHROPIC_')&&!k.startsWith('OPENAI_')&&!k.startsWith('CLAUDE_CODE_')&&!['CLAUDE_CONFIG_DIR','CLAUDECODE','CODEX_HOME'].includes(k)));
export class QAService {
 constructor(root=defaultRoot,{chromium,channel}={}){
  mkdirSync(resolve(root),{recursive:true,mode:0o700});this.root=realpathSync(root);chmodSync(this.root,0o700);
  this.db=new DatabaseSync(join(this.root,'qa.sqlite'));this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS records(kind TEXT,id TEXT,value TEXT,updated REAL,PRIMARY KEY(kind,id)); CREATE TABLE IF NOT EXISTS leases(resource TEXT PRIMARY KEY,owner TEXT,expires REAL); PRAGMA user_version=1;');
  chmodSync(join(this.root,'qa.sqlite'),0o600);this.active=new Map();this.logins=new Map();this.chromium=chromium;this.channel=channel;this.browsers=new BrowserSessions(this);
  for(const run of this.all('run'))if(['running','queued'].includes(run.status))this.put('run',{...run,status:'interrupted',message:t('La ejecución se interrumpió; vuelve a comprobarla.'),finishedAt:now()});
  this.db.prepare('DELETE FROM leases WHERE expires<?').run(now());
 }
 all(kind){return this.db.prepare('SELECT value FROM records WHERE kind=? ORDER BY updated DESC LIMIT 1000').all(kind).map(r=>JSON.parse(r.value))}
 remove(kind,id){this.db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind,id)}
 get(kind,id){const r=this.db.prepare('SELECT value FROM records WHERE kind=? AND id=?').get(kind,id);return r?JSON.parse(r.value):null}
 put(kind,value){this.db.prepare('INSERT INTO records VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value,updated=excluded.updated').run(kind,value.id,JSON.stringify(value),now());if(kind==='run'&&['blocked','failed','interrupted','stale'].includes(value.status)&&value.finishedAt){const id=hash(JSON.stringify([value.profileId,value.environmentId,value.status,value.message])),old=this.get('incident',id);if(old?.lastRunId!==value.id)this.put('incident',{id,profileId:value.profileId,environmentId:value.environmentId,message:value.message,status:value.status,count:(old?.count||0)+1,lastRunId:value.id,lastAt:now()})}return value}
 profiles(){try{return JSON.parse(readFileSync(join(this.root,'profiles.json'),'utf8')).filter(p=>p.enabled!==false)}catch{return []}}
 profile(id){const p=this.profiles().find(p=>p.id===id);ensure(p,t('Selecciona un perfil disponible.'));ensure(p.qaEnabled!==false,t('QA está desactivado para este perfil.'));return p}
 async browser(){if(!this.chromium){const module=await import('playwright');this.chromium=module.chromium}return this.chromium}
 browserOptions(headless=true){return {headless,...(this.channel?{channel:this.channel}:{}),timeout:30000}}
 authPath(profile,env,account='default'){const directory=join(this.root,'auth',key(profile,env.origin,account||'default'));mkdirSync(directory,{recursive:true,mode:0o700});return join(directory,'state.json')}
 lease(resource,owner,seconds=300,parentOwner=null){
  ensure(resource&&owner,t('La reserva requiere recurso y propietario.'));const expires=now()+Math.min(Math.max(Number(seconds)||300,30),3600);
  this.db.exec('BEGIN IMMEDIATE');try{
   const live=this.db.prepare('SELECT * FROM leases WHERE expires>?').all(now());
   if(resource.startsWith('environment:'))ensure(!live.some(l=>(l.resource.startsWith('environment-reader:'+resource.slice('environment:'.length)+':')||l.resource.startsWith('environment-writer:'+resource.slice('environment:'.length)+':'))&&l.owner!==owner),t('Hay comprobaciones utilizando este entorno.'));
   if(resource.startsWith('environment-reader:')||resource.startsWith('environment-writer:')){
    const env=resource.split(':')[1];ensure(!live.some(l=>l.resource==='environment:'+env&&l.owner!==owner&&l.owner!==parentOwner),t('El entorno tiene una reserva exclusiva.'));
    ensure(!live.some(l=>l.resource.startsWith('environment-writer:'+env+':')&&l.owner!==owner),t('Hay una comprobación de escritura activa.'));
    if(resource.startsWith('environment-writer:'))ensure(!live.some(l=>l.resource.startsWith('environment-reader:'+env+':')&&l.owner!==owner),t('Hay comprobaciones de lectura activas.'));
   }
   const old=this.db.prepare('SELECT * FROM leases WHERE resource=?').get(resource);ensure(!old||old.expires<now()||old.owner===owner,t('Recurso ocupado por otra ejecución.'));this.db.prepare('INSERT INTO leases VALUES(?,?,?) ON CONFLICT(resource) DO UPDATE SET owner=excluded.owner,expires=excluded.expires').run(resource,owner,expires);this.db.exec('COMMIT');return {resource,owner,expires}
  }catch(e){this.db.exec('ROLLBACK');throw e}
 }
 release(resource,owner){this.db.prepare('DELETE FROM leases WHERE resource=? AND owner=?').run(resource,owner);return {released:true}}
 environment(id){const env=this.get('environment',id);ensure(env,t('El entorno no está registrado.'));return env}
 async health(){let executable=null,available=false;try{const b=await this.browser();executable=b.executablePath();available=existsSync(executable)}catch{}return {protocolVersion:6,browserSessions:this.browsers.sessions.size,node:process.version,browserAvailable:available,executable,activeRuns:this.active.size,loginWindows:this.logins.size,checkedAt:now()}}
 async install(){
  ensure(!this.installing,t('La instalación ya está en curso.'));this.installing=true;
  const id='chromium';this.put('installation',{id,status:'running',startedAt:now()});
  const req=createRequire(import.meta.url),cli=req.resolve('playwright/cli');
  const child=spawn(process.execPath,[cli,'install','chromium'],{stdio:'ignore'});
  child.once('error',()=>{this.installing=false;this.put('installation',{id,status:'failed',finishedAt:now()})});
  child.once('exit',code=>{this.installing=false;this.put('installation',{id,status:code===0?'complete':'failed',finishedAt:now()})});
  return {id,status:'running'};
 }
 saveEnvironment(v){
  const url=new URL(v.origin);ensure(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&!url.search&&!url.hash,t('Usa una URL HTTP o HTTPS sin credenciales.'));
  const id=v.id||randomUUID();const old=this.get('environment',id);const busy=this.db.prepare('SELECT * FROM leases WHERE expires>?').all(now()).some(l=>l.resource==='environment:'+id||l.resource.startsWith('environment-reader:'+id+':')||l.resource.startsWith('environment-writer:'+id+':'));ensure(!busy,t('No puedes cambiar un entorno reservado.'));
  let revisionUrl=null;if(v.revisionUrl){const rev=new URL(v.revisionUrl,url);ensure(rev.origin===url.origin,t('La comprobación de versión debe pertenecer al mismo entorno.'));revisionUrl=rev.href}
  const env={id,name:text(v.name||url.host,100),projectId:text(v.projectId,200),projectPath:v.projectPath?realpathSync(v.projectPath):old?.projectPath||'',origin:url.origin,healthPath:text(v.healthPath||'/',500),revisionUrl,expectedRevision:text(v.expectedRevision,200),authSelector:text(v.authSelector,500),legacyLockPath:text(v.legacyLockPath,2000),updatedAt:now()};
  for(const path of [env.healthPath])ensure(new URL(path,env.origin).origin===env.origin,t('El acceso debe permanecer en el entorno.'));
  return this.put('environment',env);
 }
 saveRecipe(v){
  this.environment(v.environmentId);ensure(v.name&&Array.isArray(v.steps)&&v.steps.length>0&&v.steps.length<=50,t('El recorrido necesita nombre y de 1 a 50 pasos.'));
  const steps=v.steps.map(step=>{ensure(['navigate','click','fill','expectVisible','expectText','expectURL'].includes(step.action),t('Acción de recorrido no admitida.'));return {action:step.action,path:text(step.path,1000),selector:text(step.selector,500),value:text(step.value,2000)}});
  return this.put('recipe',{id:v.id||randomUUID(),name:text(v.name,200),environmentId:v.environmentId,mode:v.mode==='write'?'write':'read',steps,updatedAt:now()});
 }
 async revision(env,context){
  if(!env.revisionUrl)return null;
  const response=await context.request.get(env.revisionUrl,{timeout:15000,maxRedirects:0});if(!response.ok())throw new Error(t('No se pudo comprobar la versión desplegada.'));
  try{const obj=await response.json();return text(obj.revision||obj.commit||obj.sha||obj.version,200)||null}catch{return text(response.headers()['x-revision'],200)||null}
 }
 async legacyBusy(env){
  if(!env.legacyLockPath)return false;
  // Explicit bridge to existing resource ledgers. Unknown formats fail closed.
  try{const l=JSON.parse(readFileSync(env.legacyLockPath,'utf8'));if(Array.isArray(l))return l.some(x=>x.status!=='released'&&(!x.expiresAt||new Date(x.expiresAt).getTime()>Date.now()));if(l.leases&&typeof l.leases==='object')return Object.values(l.leases).some(x=>x.status!=='released');if(l.owner||l.holder||l.locked)return true;if(l.version===1&&l.leases)return false;return Object.keys(l).length>0}catch{throw new Error(t('No se pudo interpretar la reserva externa del entorno.'))}
 }
 async login(v){
  this.profile(v.profileId);const env=this.environment(v.environmentId),id=randomUUID(),auth=this.authPath(v.profileId,env,v.account);
  let target;try{target=new URL(v.url||new URL(env.healthPath,env.origin).href)}catch{throw Error(t('Usa una dirección HTTP o HTTPS.'))}ensure(target.origin===env.origin&&['http:','https:'].includes(target.protocol)&&!target.username&&!target.password,t('Usa una dirección HTTP o HTTPS.'));
  ensure(this.logins.size<3,t('Ya hay tres ventanas de acceso abiertas.'));const browser=await (await this.browser()).launch(this.browserOptions(false));try{const context=await browser.newContext({...(existsSync(auth)?{storageState:auth}:{})});
  const page=await context.newPage();await page.goto(target.href,{timeout:30000,waitUntil:'domcontentloaded'});
  const timer=setTimeout(()=>this.closeLogin(id),15*60*1000);timer.unref();this.logins.set(id,{id,profileId:v.profileId,environmentId:env.id,account:v.account||'default',auth,browser,context,page,timer});browser.once?.('disconnected',()=>{this.closeLogin(id).catch(()=>{})});return {id,status:'awaiting_login',message:t('Completa el acceso y pulsa Guardar acceso.')};}catch(error){await browser.close();throw error}
 }
 async closeLogin(id){for(const s of [...this.browsers.sessions.values()])if(s.loginId===id)await this.browsers.close(s.id).catch(()=>{});const login=this.logins.get(id);if(login){clearTimeout(login.timer);this.logins.delete(id);await login.browser.close().catch(()=>{})}return {closed:true}}
 async completeLogin(v){
  const l=this.logins.get(v.id);ensure(l,t('La ventana de acceso ya no está disponible.'));ensure(!v.profileId||v.profileId===l.profileId,t('El acceso pertenece a otro perfil.'));const env=this.environment(l.environmentId);
  ensure(new URL(l.page.url()).origin===env.origin,t('Termina el acceso en la aplicación antes de guardarlo.'));ensure(env.authSelector,t('Configura el elemento que confirma una sesión autenticada.'));
  await l.page.locator(env.authSelector).waitFor({state:'visible',timeout:10000});await l.context.storageState({path:l.auth,indexedDB:true});chmodSync(l.auth,0o600);
  this.put('auth',{id:key(l.profileId,env.origin,l.account),profileId:l.profileId,environmentId:env.id,account:l.account,status:'saved',checkedAt:now()});for(const s of [...this.browsers.sessions.values()])if(s.loginId===l.id)await this.browsers.close(s.id);await this.closeLogin(l.id);return {status:'saved',checkedAt:now()};
 }
 async checkAuth(v){const env=this.environment(v.environmentId);this.profile(v.profileId);const auth=this.authPath(v.profileId,env,v.account);ensure(existsSync(auth),t('Completa primero el acceso de este perfil.'));ensure(env.authSelector,t('Configura el elemento que confirma el acceso.'));const browser=await (await this.browser()).launch(this.browserOptions());try{const context=await browser.newContext({storageState:auth});const page=await context.newPage();const response=await page.goto(new URL(env.healthPath,env.origin).href,{timeout:30000,waitUntil:'domcontentloaded'});ensure(response?.ok()&&new URL(page.url()).origin===env.origin,t('El acceso ha caducado.'));await page.locator(env.authSelector).waitFor({state:'visible',timeout:10000});return this.put('auth',{id:key(v.profileId,env.origin,v.account||'default'),profileId:v.profileId,environmentId:env.id,account:v.account||'default',status:'verified',checkedAt:now()})}finally{await browser.close()}}
 async start(v){
  this.profile(v.profileId);ensure(this.active.size<4,t('Ya hay cuatro ejecuciones de QA en curso.'));const env=this.environment(v.environmentId);const recipe=v.recipeId?this.get('recipe',v.recipeId):null;ensure(recipe||v.suite,t('Selecciona un recorrido o una suite.'));if(recipe)ensure(recipe.environmentId===env.id,t('El recorrido pertenece a otro entorno.'));
  const id=randomUUID(),run={id,profileId:v.profileId,agentId:v.agentId||null,threadId:v.threadId||null,recipeId:v.recipeId||null,suite:v.suite||null,environmentId:env.id,projectId:env.projectId,projectPath:env.projectPath,name:recipe?.name||t('Suite desplegada'),status:'queued',startedAt:now(),checks:[],artifacts:[],account:v.account||'default',expectedRevision:env.expectedRevision,revisionVerified:false};
  ensure(!await this.legacyBusy(env),t('El entorno tiene una reserva externa activa.'));
  // Mutation suites serialize on the environment. Read-only recipes still get isolated contexts.
  const resource=(recipe?.mode==='read'?'environment-reader:':'environment-writer:')+env.id+':'+id,parentOwner=v.agentId?v.profileId+':'+v.agentId:v.reservationOwner||null;this.lease(resource,id,300,parentOwner);
  this.put('run',run);const controller={cancelled:false,browser:null,child:null,resource,parentOwner};this.active.set(id,controller);
  controller.promise=this.execute(run,env,recipe,v,controller).catch(async e=>{await controller.browser?.close();run.status=controller.cancelled?'cancelled':'blocked';run.message=safeError(e);run.finishedAt=now();this.put('run',run)}).finally(()=>{if(resource)this.release(resource,id);this.active.delete(id)});
  return run;
 }
 async execute(run,env,recipe,v,control){
  run.status='running';this.put('run',run);const directory=join(this.root,'evidence',run.id);mkdirSync(directory,{recursive:true,mode:0o700});
  const browser=await (await this.browser()).launch(this.browserOptions());control.browser=browser;
  const auth=this.authPath(run.profileId,env,run.account);const context=await browser.newContext({...(existsSync(auth)?{storageState:auth}:{}),viewport:{width:1440,height:900}});
  const page=await context.newPage();const errors=[];page.on('pageerror',()=>errors.push(t('Error de aplicación en el navegador')));page.on('response',r=>{if(r.status()>=500)errors.push(t('Respuesta HTTP ')+r.status())});
  let revisionBefore;
  const renew=setInterval(()=>{if(control.resource)try{this.lease(control.resource,run.id,300,control.parentOwner)}catch{control.cancelled=true;control.browser?.close();control.child?.kill('SIGTERM')}},60000);renew.unref();
  const deadline=setTimeout(()=>{control.timedOut=true;control.browser?.close();control.child?.kill('SIGTERM')},v.suite?60*60*1000:5*60*1000);deadline.unref();
  try{
   revisionBefore=await this.revision(env,context);run.revisionBefore=revisionBefore;this.put('run',run);
   if(recipe?.mode==='read')await context.route('**/*',route=>['GET','HEAD','OPTIONS'].includes(route.request().method())?route.continue():route.abort());
   const response=await page.goto(new URL(env.healthPath,env.origin).href,{waitUntil:'domcontentloaded',timeout:30000});ensure(response,t('El entorno no respondió.'));ensure(![401,403].includes(response.status()),t('El entorno requiere completar el acceso.'));ensure(response.ok(),t('El entorno no está disponible.'));ensure(new URL(page.url()).origin===env.origin,t('El entorno redirige al acceso; completa SSO.'));
   if(env.authSelector)await page.locator(env.authSelector).waitFor({state:'visible',timeout:10000});
   if(v.suite){await this.suite(run,env,v.suite,directory,control,auth)}else{
    for(const [index,step] of recipe.steps.entries()){
     ensure(!control.cancelled,t('Ejecución cancelada.'));const check={index,action:step.action,status:'running'};run.checks.push(check);
     try{
      if(step.action==='navigate'){const url=new URL(step.path,env.origin);ensure(url.origin===env.origin,t('El recorrido intenta salir del entorno.'));await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:30000})}
      if(step.action==='click')await page.locator(step.selector).click({timeout:15000});
      if(step.action==='fill')await page.locator(step.selector).fill(step.value,{timeout:15000});
      if(step.action==='expectVisible')await page.locator(step.selector).waitFor({state:'visible',timeout:15000});
      if(step.action==='expectText'){await page.locator(step.selector).filter({hasText:step.value}).waitFor({state:'visible',timeout:15000})}
      if(step.action==='expectURL')ensure(page.url().includes(step.value),t('La navegación no llegó al destino esperado.'));
      ensure(new URL(page.url()).origin===env.origin,t('El recorrido ha salido del entorno.'));check.status='passed';
     }catch(e){check.status='failed';throw e}finally{this.put('run',run)}
    }
   }
   const revisionAfter=await this.revision(env,context);run.revisionAfter=revisionAfter;
   run.revisionVerified=!!revisionBefore&&revisionBefore===revisionAfter&&(!env.expectedRevision||env.expectedRevision===revisionAfter);
   if(control.cancelled)run.status='cancelled';else if(revisionBefore!==revisionAfter||env.expectedRevision&&revisionAfter!==env.expectedRevision)run.status='stale';else if(run.status!=='skipped')run.status=run.checks.some(c=>c.status==='failed')||errors.length?'failed':'passed';
   run.message=run.status==='passed'?(run.revisionVerified?t('Recorrido validado contra la versión comprobada.'):t('Recorrido comprobado; la versión desplegada no está verificada.')):run.status==='stale'?t('El entorno cambió o no contiene la versión esperada.'):run.status==='skipped'?t('No se ejecutaron comprobaciones.'):t('Hay comprobaciones o errores de aplicación pendientes.');
  }catch(e){run.status=control.cancelled?'cancelled':control.timedOut?'blocked':run.checks.some(c=>c.status==='failed')?'failed':'blocked';run.message=safeError(e)}finally{
   clearInterval(renew);clearTimeout(deadline);run.errors=errors.slice(0,20);
   if(!page.isClosed())try{await page.screenshot({path:join(directory,'page.png'),fullPage:true,timeout:5000});run.artifacts.push('page.png')}catch{}
   await browser.close();run.finishedAt=now();run.artifacts.push('result.json');this.put('run',run);writeFileSync(join(directory,'result.json'),JSON.stringify(run,null,2),{mode:0o600});
  }
 }
 async suite(run,env,suite,directory,control,auth){
  ensure(env.projectPath,t('El entorno necesita el directorio del proyecto.'));const project=realpathSync(env.projectPath),config=realpathSync(resolve(project,suite.config));ensure(!relative(project,config).startsWith('..')&&!isAbsolute(relative(project,config)),t('La configuración queda fuera del proyecto.'));
  const req=createRequire(join(dirname(config),'package.json'));const cli=req.resolve('@playwright/test/cli');const args=[cli,'test','--config',config,'--workers=1','--reporter=json','--output',join(directory,'test-results')];
  if(suite.grep)args.push('--grep',text(suite.grep,300));
  const storage=existsSync(auth)?auth:'';const vars={...executionEnvironment(),BASE_URL:env.origin,AGENT_ISLANDS_QA_STORAGE_STATE:storage,AGENT_ISLANDS_QA_PROFILE_DIR:join(this.root,'login-profiles',key(run.profileId,env.origin,run.account)),AGENT_ISLANDS_QA_EVIDENCE_DIR:directory,AGENT_ISLANDS_QA_RUN:run.id};
  let stdout='',stderr='';let code;
  try{code=await new Promise((done,reject)=>{const child=spawn(process.execPath,args,{cwd:dirname(config),env:vars,stdio:['ignore','pipe','pipe']});control.child=child;child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',d=>{if(stdout.length<8e6)stdout+=d});child.stderr.on('data',d=>{if(stderr.length<20000)stderr+=d});child.once('error',reject);child.once('exit',done)})}finally{control.child=null}
  let report;try{const start=stdout.indexOf('{');report=JSON.parse(stdout.slice(start))}catch{throw new Error(t('La suite no produjo un informe JSON válido. Comprueba sus dependencias y configuración.'))}
  const visit=suites=>{for(const s of suites||[]){for(const spec of s.specs||[])for(const test of spec.tests||[])run.checks.push({name:text(spec.title,200),status:test.status==='expected'?'passed':test.status==='skipped'?'skipped':'failed'});visit(s.suites)}};visit(report.suites);
  if(!run.checks.some(c=>c.status!=='skipped'))run.status='skipped';else if(code!==0&&!run.checks.some(c=>c.status==='failed'))run.checks.push({name:t('Finalización de la suite'),status:'failed'});
 }
 async cancel(id,profileId){const run=this.get('run',id);ensure(run&&(!profileId||run.profileId===profileId),t('La ejecución no pertenece a este perfil.'));const active=this.active.get(id);if(active){active.cancelled=true;active.child?.kill('SIGTERM');await active.browser?.close()}return {id,status:active?'cancelling':run.status}}
 snapshot(profileId,projectIds=null){const allowed=project=>!Array.isArray(projectIds)||projectIds.includes(project);const environments=this.all('environment').filter(e=>allowed(e.projectId)),environmentIds=new Set(environments.map(e=>e.id));const runs=this.all('run').filter(r=>(!profileId||r.profileId===profileId)&&allowed(r.projectId));return {environments,recipes:this.all('recipe').filter(r=>environmentIds.has(r.environmentId)),runs:runs.slice(0,100),incidents:this.all('incident').filter(i=>(!profileId||i.profileId===profileId)&&environmentIds.has(i.environmentId)).slice(0,30),installations:this.all('installation'),leases:this.db.prepare('SELECT * FROM leases WHERE expires>?').all(now()).filter(l=>!Array.isArray(projectIds)||environmentIds.has(l.resource.split(':')[1])),auth:this.all('auth').filter(a=>(!profileId||a.profileId===profileId)&&environmentIds.has(a.environmentId)),logins:[...this.logins.values()].filter(l=>(!profileId||l.profileId===profileId)&&environmentIds.has(l.environmentId)).map(({id,profileId,environmentId,account})=>({id,profileId,environmentId,account}))}}
 async dispatch(method,v={}){return withLanguage(v.language,()=>this.dispatchLocalized(method,v))}
 async dispatchLocalized(method,v={}){
  if(Array.isArray(v.projectIds)){
   let environmentId=v.environmentId;
   if(method.startsWith('environment.')&&v.id)environmentId=v.id;
   if(method.startsWith('run.')&&v.id)environmentId=this.get('run',v.id)?.environmentId;
   if(method.startsWith('login.')&&v.id)environmentId=this.logins.get(v.id)?.environmentId;
   if(method.startsWith('lease.'))environmentId=String(v.resource||'').split(':')[1];
   if(environmentId){const env=this.environment(environmentId);ensure(v.projectIds.includes(env.projectId),t('El entorno está fuera del workspace de ejecución.'));}
   if(method==='environment.save')ensure(v.projectIds.includes(v.projectId),t('El proyecto está fuera del workspace.'));
   if(method==='recipe.save'&&v.id){const previous=this.get('recipe',v.id),owner=previous&&this.get('environment',previous.environmentId);ensure(!owner||v.projectIds.includes(owner.projectId),t('El entorno está fuera del workspace de ejecución.'));}
  }
  if(method.startsWith('browser.')&&method!=='browser.install')return this.browsers.dispatch(method,v);
  if(method.startsWith('annotation.'))return this.browsers.annotations.dispatch(method,v,'agent');
  if(method==='snapshot')return this.snapshot(v.profileId,v.projectIds);
  if(method==='health')return this.health();
  if(method==='browser.install')return this.install();
  if(method==='contract.save'){
   this.profile(v.profileId);ensure(v.objective?.trim()&&v.acceptance?.trim(),t('Define el resultado y cómo se comprobará.'));
   const task=text(v.threadId||v.agentId,200);ensure(task,t('Selecciona un agente.'));
   return this.put('contract',{id:hash(JSON.stringify([v.profileId,task])),profileId:v.profileId,threadId:v.threadId||null,agentId:v.agentId||null,objective:text(v.objective,2000),acceptance:text(v.acceptance,2000),optional:text(v.optional,1000),decisions:text(v.decisions,2000),environmentId:v.environmentId||null,updatedAt:now()});
  }
  if(method==='contract.get'){this.profile(v.profileId);const id=hash(JSON.stringify([v.profileId,text(v.threadId||v.agentId,200)]));let contract=this.get('contract',id);if(!contract&&v.threadId&&v.agentId){contract=this.get('contract',hash(JSON.stringify([v.profileId,text(v.agentId,200)])));if(contract)contract=this.put('contract',{...contract,id,threadId:v.threadId})}return contract}
  if(method==='environment.save')return this.saveEnvironment(v);
  if(method==='recipe.save')return this.saveRecipe(v);
  if(method==='lease.acquire')return this.lease(v.resource,v.owner,v.seconds);
  if(method==='lease.release')return this.release(v.resource,v.owner);
  if(method==='login.open')return this.login(v);
  if(method==='login.save')return this.completeLogin(v);
  if(method==='login.close'){for(const s of [...this.browsers.sessions.values()])if(s.loginId===v.id)await this.browsers.close(s.id);ensure(!v.profileId||this.logins.get(v.id)?.profileId===v.profileId,t('La ventana pertenece a otro perfil.'));return this.closeLogin(v.id)}
  if(method==='auth.check')return this.checkAuth(v);
  if(method==='run.start')return this.start(v);
  if(method==='run.cancel')return this.cancel(v.id,v.profileId);
  if(method==='run.retry'){const r=this.get('run',v.id);ensure(r&&(!v.profileId||v.profileId===r.profileId),t('La ejecución pertenece a otro perfil.'));ensure(!this.active.has(r.id),t('La ejecución sigue activa.'));return this.start({profileId:r.profileId,agentId:r.agentId,threadId:r.threadId,environmentId:r.environmentId,account:r.account,...(r.recipeId?{recipeId:r.recipeId}:{suite:r.suite})})}
  if(method==='run.get'){const r=this.get('run',v.id);ensure(r&&(!v.profileId||r.profileId===v.profileId),t('Ejecución no disponible.'));return r}
  throw new Error(t('Operación QA desconocida.'));
 }
 async close(){await this.browsers.dispose();for(const id of [...this.logins.keys()])await this.closeLogin(id);for(const [id] of this.active)await this.cancel(id);await Promise.all([...this.active.values()].map(a=>a.promise));this.db.close()}
}

// Annotation tools carry their own schemas: agents read, acknowledge, resolve and answer user feedback.
const annotationTools={
 'annotation.list':()=>({description:t('Agent Islands: lista las anotaciones visuales que el usuario dejó en el navegador de esta conversación (comentario, intención, prioridad, selector, archivo de origen, componentes, capturas). Filtra por estado: pending, acknowledged, resolved, dismissed, proposed.'),inputSchema:{type:'object',properties:{status:{type:'array',items:{type:'string',enum:['pending','acknowledged','resolved','dismissed','proposed']}}},additionalProperties:false}}),
 'annotation.watch':()=>({description:t('Agent Islands: espera (hasta 100 s) a que el usuario envíe anotaciones nuevas o responda en un hilo, y las devuelve en lote. Úsalo en bucle para el modo manos libres.'),inputSchema:{type:'object',properties:{timeoutSeconds:{type:'number',minimum:1,maximum:100},batchWindowSeconds:{type:'number',minimum:0,maximum:20}},additionalProperties:false}}),
 'annotation.ack':()=>({description:t('Agent Islands: marca una anotación como vista antes de empezar a trabajar en ella; el usuario lo ve en su marcador.'),inputSchema:{type:'object',properties:{annotationId:{type:'string'},message:{type:'string'}},required:['annotationId'],additionalProperties:false}}),
 'annotation.resolve':()=>({description:t('Agent Islands: marca una anotación como resuelta con un resumen del cambio. Devuelve la ruta de una captura posterior del mismo elemento (files.after) para que verifiques el resultado y los archivos cambiados según git.'),inputSchema:{type:'object',properties:{annotationId:{type:'string'},summary:{type:'string'}},required:['annotationId','summary'],additionalProperties:false}}),
 'annotation.dismiss':()=>({description:t('Agent Islands: descarta una anotación explicando el motivo (por ejemplo, ya está hecho o contradice otra petición).'),inputSchema:{type:'object',properties:{annotationId:{type:'string'},reason:{type:'string'}},required:['annotationId','reason'],additionalProperties:false}}),
 'annotation.reply':()=>({description:t('Agent Islands: responde en el hilo de una anotación, por ejemplo para hacer una pregunta de aclaración. El usuario la ve junto al marcador.'),inputSchema:{type:'object',properties:{annotationId:{type:'string'},message:{type:'string'}},required:['annotationId','message'],additionalProperties:false}}),
 'annotation.suggest':()=>({description:t('Agent Islands: propone una anotación sobre un elemento visible del navegador abierto de esta conversación (modo crítica). El usuario la acepta o la descarta; no se aplica nada sin su visto bueno.'),inputSchema:{type:'object',properties:{selector:{type:'string'},comment:{type:'string'},intent:{type:'string',enum:['fix','change','question','approve']},severity:{type:'string',enum:['blocking','important','suggestion']}},required:['selector','comment'],additionalProperties:false}})
};

export function socketPath(root){return join(tmpdir(),'islands-qa-'+hash(existsSync(root)?realpathSync(root):resolve(root))+'.sock')}
export async function call(root,method,params={}){
 return new Promise((done,reject)=>{const req=httpRequest({socketPath:socketPath(root),path:'/rpc',method:'POST',headers:{'Content-Type':'application/json'}},res=>{let data='';res.setEncoding('utf8');res.on('data',d=>data+=d);res.on('end',()=>{try{const result=JSON.parse(data);result.error?reject(new Error(result.error)):done(result.result)}catch(e){reject(e)}})});req.on('error',reject);req.setTimeout(120000,()=>req.destroy(new Error(t('La operación QA agotó su tiempo.'))));req.end(JSON.stringify({method,params:{language:language(),...params}}))})
}
async function ensureServer(root){
 let previous;try{previous=await call(root,'health')}catch{}
 if(previous?.protocolVersion===6)return;
 if(previous){
  const state=await call(root,'snapshot');ensure(!previous.activeRuns&&!previous.loginWindows&&!previous.browserSessions&&!state.installations?.some(i=>i.status==='running'),t('El servicio de QA anterior tiene operaciones activas. Termínalas antes de usar el workspace.'));
  await call(root,'shutdown');
  for(let i=0;i<50;i++){await new Promise(r=>setTimeout(r,100));try{await call(root,'health')}catch{break}}
 }
 mkdirSync(root,{recursive:true,mode:0o700});const child=spawn(process.execPath,['--disable-warning=ExperimentalWarning',fileURLToPath(import.meta.url),'--serve','--root',root],{detached:true,stdio:'ignore',env:executionEnvironment()});child.unref();
 for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,100));try{await call(root,'health');return}catch{}}
 throw new Error(t('No se pudo iniciar QA. Comprueba Node y los permisos del registro.'));
}
async function main(){
 const argv=process.argv.slice(2),root=resolve(argv.includes('--root')?argv[argv.indexOf('--root')+1]:defaultRoot);
 if(argv.includes('--broker')){
  // Private app child; scope and profile are validated by Cocoa before each call.
  // Responses can complete out of order. Mutations are never replayed after a timeout.
  const input=createInterface({input:process.stdin,crlfDelay:Infinity});const pending=new Set();let output=Promise.resolve(),boot=null,lastInput=Date.now();
  const idle=setInterval(()=>{if(!pending.size&&Date.now()-lastInput>90000){input.close();process.stdin.destroy()}},30000);idle.unref();
  const write=value=>{output=output.then(()=>new Promise((resolve,reject)=>{process.stdout.write(JSON.stringify(value)+'\n',e=>e?reject(e):resolve())}));return output};
  const ready=()=>{if(!boot)boot=ensureServer(root).catch(e=>{boot=null;throw e});return boot};
  const handle=async line=>{let request;try{ensure(line.length<=2e6,t('La petición supera el límite.'));request=JSON.parse(line);ensure(typeof request.id==='string'&&typeof request.method==='string',t('Petición incompleta.'));await ready();let result;try{result=await call(root,request.method,request.params||{})}catch(e){if(!['ENOENT','ECONNREFUSED'].includes(e.code))throw e;boot=null;await ready();result=await call(root,request.method,request.params||{})}await write({id:request.id,result})}catch(e){await write({id:request?.id??null,error:safeError(e)})}};
  for await(const line of input){lastInput=Date.now();if(pending.size>=100){let id=null;try{id=JSON.parse(line).id??null}catch{}write({id,error:t('Demasiadas peticiones pendientes.')}).catch(()=>{});continue}const p=handle(line);pending.add(p);p.finally(()=>pending.delete(p))}
  await Promise.allSettled([...pending]);await output;clearInterval(idle);return;
 }
 if(argv.includes('--serve')){
  mkdirSync(root,{recursive:true,mode:0o700});const boot=join(root,'daemon.lock');
  try{mkdirSync(boot,{mode:0o700})}catch{
   let pid;try{pid=Number(readFileSync(join(boot,'pid'),'utf8'));process.kill(pid,0);return}catch(e){if(!pid||e.code!=='ESRCH')return}
   rmSync(boot,{recursive:true,force:true});mkdirSync(boot,{mode:0o700});
  }
  writeFileSync(join(boot,'pid'),String(process.pid),{mode:0o600});
  const socket=socketPath(root);let service,lastRequest=Date.now();
  let stopping=false;const stop=async()=>{if(stopping)return;stopping=true;try{await service?.close()}catch{}server.close(()=>{rmSync(boot,{recursive:true,force:true});process.exit(0)})};
  const server=createServer(async(req,res)=>{lastRequest=Date.now();let raw='';req.setEncoding('utf8');req.on('data',d=>{raw+=d;if(raw.length>2e6)req.destroy()});req.on('end',async()=>{try{ensure(req.method==='POST'&&req.url==='/rpc',t('Petición no admitida.'));const {method,params}=JSON.parse(raw);if(method==='shutdown'){ensure(!service.active.size&&!service.logins.size&&!service.browsers.sessions.size,t('Hay operaciones activas.'));res.end(JSON.stringify({result:{stopped:true}}));setImmediate(stop);return}res.end(JSON.stringify({result:await service.dispatch(method,params)}))}catch(e){res.end(JSON.stringify({error:safeError(e)}))}})});
  // Never unlink an active daemon's socket. The bind arbitrates concurrent starters.
  try{await call(root,'health');return}catch{}
  if(existsSync(socket))try{unlinkSync(socket)}catch{}
  server.once('error',()=>{rmSync(boot,{recursive:true,force:true});process.exit(1)});server.listen(socket,()=>{chmodSync(socket,0o600);service=new QAService(root)});
  setInterval(()=>{if(service&&!service.installing&&!service.active.size&&!service.logins.size&&!service.browsers.sessions.size&&Date.now()-lastRequest>15*60*1000)stop()},60000).unref();
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,stop);return;
 }
 if(argv.includes('--mcp')){
  const bound=argv.includes('--profile')?argv[argv.indexOf('--profile')+1]:null;
  const ownerIdentity=process.env.AGENT_ISLANDS_ID||randomUUID();
  const capturedProjects=argv.includes('--project-ids')?JSON.parse(argv[argv.indexOf('--project-ids')+1]):null;
  ensure(capturedProjects===null||Array.isArray(capturedProjects)&&capturedProjects.every(id=>typeof id==='string'),t('El alcance del workspace no es válido.'));
  const names=['snapshot','health','run.start','run.get','run.cancel','run.retry','login.open','login.save','login.close','auth.check','lease.acquire','lease.release',...Object.keys(annotationTools)];
  const input=createInterface({input:process.stdin});for await(const line of input){let m;try{m=JSON.parse(line);if(m.id===undefined)continue;let result;if(m.method==='initialize')result={protocolVersion:m.params?.protocolVersion||'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'agent-islands-qa',version:'1.0.0'}};else if(m.method==='ping')result={};else if(m.method==='tools/list')result={tools:names.map(name=>annotationTools[name]?{name:'islands_'+name.replaceAll('.','_'),...annotationTools[name]()}:({name:'islands_'+name.replaceAll('.','_'),description:t('Agent Islands QA: {0}. Comprobaciones y evidencias del navegador por perfil. Usa snapshot para encontrar los entornos y recorridos configurados. Una ejecución no implica autorización de despliegue.',name),inputSchema:{type:'object',properties:{environmentId:{type:'string'},recipeId:{type:'string'},id:{type:'string'},account:{type:'string'},resource:{type:'string'},owner:{type:'string'},seconds:{type:'number'},suite:{type:'object',properties:{config:{type:'string'},grep:{type:'string'}}}},additionalProperties:true}}))};else if(m.method==='tools/call'){await ensureServer(root);const name=names.find(n=>'islands_'+n.replaceAll('.','_')===m.params?.name);ensure(name,t('Herramienta desconocida.'));const args={...m.params.arguments,...(bound?{profileId:bound}:{})};
   if(bound){delete args.projectIds;if(capturedProjects)args.projectIds=capturedProjects;else try{const registry=JSON.parse(readFileSync(join(root,'agents.json'),'utf8')),agent=registry.find(a=>a.id===ownerIdentity&&a.profileId===bound);if(Array.isArray(agent?.projectIds))args.projectIds=agent.projectIds}catch{}}
   if(name.startsWith('annotation.')){ensure(bound,t('Las anotaciones requieren un perfil de Agent Islands.'));args.agentId=ownerIdentity;delete args.role}
   if(bound&&name==='run.start'){
    args.agentId=ownerIdentity;delete args.threadId;delete args.reservationOwner;
    try{const registry=JSON.parse(readFileSync(join(root,'agents.json'),'utf8'));const agent=registry.find(a=>a.id===ownerIdentity&&a.profileId===bound);if(agent?.threadId)args.threadId=agent.threadId}catch{}
   }
   if(bound&&['run.cancel','run.retry'].includes(name)){const original=await call(root,'run.get',{id:args.id,profileId:bound});ensure(original.agentId===ownerIdentity,t('La ejecución pertenece a otro agente.'));}
   if(name.startsWith('lease.')&&bound)args.owner=bound+':'+ownerIdentity;const value=await call(root,name,args);result={content:[{type:'text',text:JSON.stringify(value)}]}}else throw new Error(t('Método MCP no admitido.'));process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\n')}catch(e){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m?.id??null,error:{code:-32000,message:safeError(e)}})+'\n')}}return;
 }
 const index=argv.indexOf('--request');ensure(index>=0,t('Usa --serve, --mcp o --request archivo.json.'));const request=JSON.parse(readFileSync(argv[index+1],'utf8'));await ensureServer(root);const result=await call(root,request.method,request.params);process.stdout.write(JSON.stringify({result})+'\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{process.stdout.write(JSON.stringify({error:safeError(e)})+'\n');process.exitCode=1});
