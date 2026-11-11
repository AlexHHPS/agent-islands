import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {request} from 'node:http';
import {randomUUID} from 'node:crypto';
import {t} from './i18n.mjs';

const run=promisify(execFile),now=()=>Date.now();
const webURL=raw=>{try{const u=new URL(raw);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u:null}catch{return null}};
const publicURL=raw=>{const u=webURL(raw);return u?u.origin+u.pathname:''};
const scope=v=>JSON.stringify([v.profileId,v.agentId,[...(v.projectIds||[])].sort()]);

// Only connect to local browser control endpoints. Page URLs themselves may be on the internet.
export function browserEndpoint(raw){
 let u;try{u=new URL(raw)}catch{throw Error(t('Indica una conexión local de Chromium válida.'))}
 if(!['http:','ws:'].includes(u.protocol)||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||!u.port||u.username||u.password||u.search||u.hash)throw Error(t('Indica una conexión local de Chromium válida.'));
 if(u.protocol==='http:'&&u.pathname!=='/'||u.protocol==='ws:'&&!/^\/devtools\/browser\/[\w-]+$/.test(u.pathname))throw Error(t('Indica una conexión local de Chromium válida.'));
 return u;
}
function jsonAt(endpoint,path){return new Promise((resolve,reject)=>{
 const req=request(new URL(path,endpoint),{method:'GET',timeout:900},res=>{let body='';res.on('data',chunk=>{body+=chunk;if(body.length>500000)req.destroy(Error('Browser response limit'))});res.on('end',()=>{try{if(res.statusCode!==200)throw Error('Browser endpoint unavailable');resolve(JSON.parse(body))}catch(e){reject(e)}})});
 req.on('timeout',()=>req.destroy(Error('Browser endpoint timeout')));req.on('error',reject);req.end();
})}
export async function localBrowserEndpoints(){
 const ports=new Set([9222,9223]);
 try{const {stdout}=await run('/usr/sbin/lsof',['-nP','-iTCP','-sTCP:LISTEN','-Fpcn'],{timeout:1800,maxBuffer:500000});let browser=false;
  for(const line of stdout.split('\n')){if(line[0]==='c')browser=/chrome|chromium|brave|msedge|google ch/i.test(line.slice(1));if(browser&&line[0]==='n'){const port=Number(line.match(/:(\d+)$/)?.[1]);if(port>0&&ports.size<24)ports.add(port)}}
 }catch{}
 const available=await Promise.all([...ports].map(async port=>{const endpoint='http://127.0.0.1:'+port;try{const info=await jsonAt(endpoint,'/json/version'),ws=browserEndpoint(info.webSocketDebuggerUrl);if(Number(ws.port)===port)return endpoint}catch{}return null}));
 return available.filter(Boolean);
}

// Capabilities bind a live Page to the requesting conversation, profile and workspace.
// Imported tabs are borrowed: no cookies are copied and closing the app never closes them.
export class OpenTabs {
 constructor(service,sessions){this.service=service;this.sessions=sessions;this.connections=new Map();this.connecting=new Map();this.offers=new Map();this.timer=setInterval(()=>this.prune(),30000);this.timer.unref()}
 taken(page){return [...this.sessions().values()].some(s=>s.allowedPages?s.allowedPages.has(page):s.context===page.context())}
 async connection(raw){const endpoint=browserEndpoint(raw).href;
  let target=endpoint;if(endpoint.startsWith('http:')){const info=await jsonAt(endpoint,'/json/version');const ws=browserEndpoint(info.webSocketDebuggerUrl);if(ws.port!==new URL(endpoint).port)throw Error(t('La conexión del navegador no está disponible.'));target=ws.href}
  const address=browserEndpoint(target),key=address.port+address.pathname,cached=this.connections.get(key);if(cached?.browser.isConnected()){cached.used=now();return cached.browser}
  if(!this.connecting.has(key))this.connecting.set(key,(async()=>{const browser=await (await this.service.browser()).connectOverCDP(target,{timeout:2500});this.connections.set(key,{browser,used:now()});return browser})().finally(()=>this.connecting.delete(key)));
  return this.connecting.get(key);
 }
 async list(v){this.service.profile(v.profileId);await this.prune();const rows=[];
  const offer=async(page,source,extra)=>{if(rows.length>=80||page.isClosed()||!webURL(page.url()))return;if(this.taken(page))return;
   const id=randomUUID(),record={id,page,source,...extra,scope:scope(v),expires:now()+5*60000};this.offers.set(id,record);while(this.offers.size>500)this.offers.delete(this.offers.keys().next().value);
   rows.push({id,title:await page.title().catch(()=>''),url:publicURL(page.url()),source,environmentId:extra.environmentId||null});
  };
  for(const login of this.service.logins.values()){const env=this.service.environment(login.environmentId);if(login.profileId!==v.profileId||Array.isArray(v.projectIds)&&!v.projectIds.includes(env.projectId))continue;
   for(const page of login.context.pages())await offer(page,'login',{browser:login.browser,context:login.context,loginId:login.id,environmentId:env.id});
  }
  const endpoints=v.endpoint?[browserEndpoint(v.endpoint).href]:await localBrowserEndpoints();let connected=0;
  for(const endpoint of endpoints){try{const browser=await this.connection(endpoint);connected++;if([...this.sessions().values()].some(s=>s.browser===browser&&s.profileId!==v.profileId))continue;for(const context of browser.contexts())for(const page of context.pages())await offer(page,'chromium',{browser,context})}catch{if(v.endpoint)throw Error(t('No se pudo conectar con ese navegador. Comprueba que permite control remoto.'))}}
  return {tabs:rows.slice(0,80),connected};
 }
 take(v){const record=this.offers.get(v.tabId);if(!record||record.expires<now()||record.page.isClosed()||record.scope!==scope(v))throw Error(t('La pestaña ya no está disponible. Actualiza la lista y vuelve a elegirla.'));
  if(this.taken(record.page))throw Error(t('Esa pestaña ya está controlada por otra conversación.'));
  this.offers.delete(v.tabId);return record;
 }
 async release(browser){if([...this.sessions().values()].some(s=>s.browser===browser))return;for(const [key,c] of this.connections)if(c.browser===browser){this.connections.delete(key);await browser.close().catch(()=>{})}}
 async prune(){for(const [key,r] of this.offers)if(r.expires<now()||r.page.isClosed())this.offers.delete(key);for(const [key,c] of this.connections)if(now()-c.used>120000&&![...this.sessions().values()].some(s=>s.browser===c.browser)){this.connections.delete(key);await c.browser.close().catch(()=>{})}}
 async dispose(){clearInterval(this.timer);for(const c of this.connections.values())await c.browser.close().catch(()=>{});this.connections.clear();this.offers.clear()}
}
