// Isolated research. No user profiles, cloud requests, deployed environments or app state.
// Optional engines: build/browser-research/{lightpanda,agent-browser} (verified release binaries).
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync,mkdirSync} from 'node:fs';
import {tmpdir,cpus,totalmem} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createInterface} from 'node:readline';
import {chromium} from 'playwright';
import {randomUUID} from 'node:crypto';
import {call} from '../qa/service.mjs';

const root=mkdtempSync(join(tmpdir(),'islands-browser-bench-')),out=resolve('build/browser-research');mkdirSync(out,{recursive:true});
const report={date:new Date().toISOString(),machine:{cpu:cpus()[0].model,logicalCores:cpus().length,memoryGiB:totalmem()/2**30},sampleCount:20,limitations:['Synthetic local page, warm sequential operations, no SSO, framework bundle, video or deployed latency.','RSS sums may double-count shared pages; instantaneous samples are not PSS or peak memory.','Agent-browser and direct CDP use the same Chrome binary; production transport uses Playwright default Chromium.']};
const cleanEnv=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/(TOKEN|SECRET|API_KEY|PASSWORD)/.test(k)&&!k.startsWith('AGENT_BROWSER_')&&!['CODEX_HOME','CLAUDE_CONFIG_DIR','CLAUDECODE'].includes(k)));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const stats=values=>{const sorted=[...values].sort((a,b)=>a-b);return {n:values.length,medianMs:+sorted[Math.floor(sorted.length/2)].toFixed(2),p95Ms:+sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*.95)-1)].toFixed(2),minMs:+sorted[0].toFixed(2),maxMs:+sorted.at(-1).toFixed(2)}};
const timed=async fn=>{const start=performance.now();const value=await fn();return {ms:performance.now()-start,value}};
const sample=async(fn,n=20)=>{const values=[];for(let i=0;i<n;i++)values.push((await timed(()=>fn(i))).ms);return stats(values)};
function run(file,args,env=cleanEnv){return new Promise((resolve,reject)=>{const p=spawn(file,args,{env,stdio:['ignore','pipe','pipe']});let output='',error='';const timer=setTimeout(()=>p.kill('SIGTERM'),30000);p.stdout.on('data',d=>output+=d);p.stderr.on('data',d=>error+=d);p.on('error',reject);p.on('close',code=>{clearTimeout(timer);code===0?resolve(output):reject(Error(error.slice(0,1000)||'Exit '+code))})})}
function memory(pid){const rows=execFileSync('/bin/ps',['-axo','pid=,ppid=,rss='],{encoding:'utf8'}).trim().split('\n').map(l=>l.trim().split(/\s+/).map(Number));const ids=new Set([pid]);let changed=true;while(changed){changed=false;for(const [id,parent] of rows)if(ids.has(parent)&&!ids.has(id)){ids.add(id);changed=true}}return {processes:rows.filter(r=>ids.has(r[0])).length,rssMiB:+(rows.filter(r=>ids.has(r[0])).reduce((n,r)=>n+r[2],0)/1024).toFixed(1)}}
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/data'?'application/json':'text/html; charset=utf-8');if(req.url==='/data'){res.end(JSON.stringify(Array.from({length:100},(_,i)=>({id:i,name:'Producto '+i}))));return}res.end('<!doctype html><title>Islands benchmark</title><style>body{font:16px system-ui}article{padding:12px;border:1px solid #ddd}</style><h1>Catálogo</h1><button id="next" onclick="document.querySelector(\'#count\').textContent=String(Number(document.querySelector(\'#count\').textContent)+1)">Siguiente</button><span id="count">0</span><main></main><script>fetch("/data").then(r=>r.json()).then(items=>{document.querySelector("main").innerHTML=items.map(p=>`<article data-product>${p.name}</article>`).join("");document.body.dataset.ready="yes"})</script>')});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const children=[];let qaRoot,agentArgs,agentEnv,broker;
function persistent(node,script,root){const child=spawn(node,['--disable-warning=ExperimentalWarning',script,'--broker','--root',root],{env:cleanEnv,stdio:['pipe','pipe','ignore']});let id=0;const pending=new Map();createInterface({input:child.stdout}).on('line',line=>{const m=JSON.parse(line),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.result)}});return {child,call:(method,params={})=>new Promise((resolve,reject)=>{const key=String(++id);pending.set(key,{resolve,reject});child.stdin.write(JSON.stringify({id:key,method,params})+'\n')}),close:()=>child.stdin.end()}}
async function readyURL(port){for(let i=0;i<100;i++){try{const r=await fetch('http://127.0.0.1:'+port+'/json/version');const v=await r.json();if(v.webSocketDebuggerUrl)return v.webSocketDebuggerUrl}catch{}await sleep(50)}throw Error('Engine did not listen')}
async function port(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p}
async function engine(name){
 const p=await port(),start=performance.now(),isLight=name==='lightpanda';
 const args=isLight?['serve','--host','127.0.0.1','--port',String(p),'--log-level','error']:['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-address=127.0.0.1','--remote-debugging-port='+p,'--user-data-dir='+join(root,'chrome-profile'),'about:blank'];
 const child=spawn(isLight?join(out,'lightpanda'):chromium.executablePath(),args,{env:{...cleanEnv,LIGHTPANDA_DISABLE_TELEMETRY:'true'},stdio:'ignore'});children.push(child);
 let cdp;try{
  await readyURL(p);const connected=await chromium.connectOverCDP('http://127.0.0.1:'+p,{timeout:10000});const context=await connected.newContext();const page=await context.newPage();cdp={close:()=>connected.close()};
  const startupMs=performance.now()-start;
  const evaluate=expression=>page.evaluate(expression);
  const readiness=iteration=>`location.search==='?iteration=${iteration}'&&document.body?.dataset.ready==='yes'&&document.querySelectorAll('[data-product]').length===100`;
  const extraction=`JSON.stringify({count:document.querySelectorAll('[data-product]').length,first:document.querySelector('[data-product]')?.textContent,clicked:(document.querySelector('#next').click(),document.querySelector('#count').textContent)})`;
  const navigateExtract=async i=>{await page.goto(origin+'/?iteration='+i,{waitUntil:'domcontentloaded',timeout:5000});for(let n=0;n<200;n++){try{if(await evaluate(readiness(i)))break}catch{}if(n===199)throw Error('DOM readiness failed');await sleep(5)}const result=JSON.parse(await evaluate(extraction));if(result.count!==100||result.first!=='Producto 0'||result.clicked!=='1')throw Error('DOM correctness failed')};
  await navigateExtract(-1);const navigationExtraction=await sample(navigateExtract),warmEvaluation=await sample(()=>evaluate('document.querySelectorAll("[data-product]").length'));
  const result={startupMs:+startupMs.toFixed(2),navigationExtraction,warmEvaluation,memory:memory(child.pid),correctness:'20/20 pages: JS fetch + 100 DOM products + click result'};
  if(isLight){try{const screenshot=await page.screenshot({type:'png',timeout:3000});result.screenshotBytes=screenshot.length;result.visualEvidence='not a rendered page (per engine documentation)'}catch(e){result.screenshotError=e.message}}
  return result;
 }finally{await cdp?.close().catch(()=>{});child.kill('SIGTERM');if(child.exitCode===null&&child.signalCode===null)await new Promise(r=>child.once('exit',r))}
}
try{
 report.chromeVersion=await run(chromium.executablePath(),['--version']);
 report.engines={};for(const name of ['chrome','lightpanda']){if(name==='lightpanda'&&!existsSync(join(out,name)))continue;try{report.engines[name]=await engine(name)}catch(e){report.engines[name]={error:e.message}}console.log(name,JSON.stringify(report.engines[name]))}
 qaRoot=join(root,'qa');mkdirSync(qaRoot);writeFileSync(join(qaRoot,'profiles.json'),'[{"id":"bench"}]');const node=resolve('build/Agent Islands.app/Contents/Resources/qa/runtime/bin/node'),service=resolve('qa/service.mjs');
 const worker=async(method,params={})=>{const file=join(qaRoot,'request-'+randomUUID()+'.json');writeFileSync(file,JSON.stringify({method,params}));try{const result=JSON.parse(await run(node,['--disable-warning=ExperimentalWarning',service,'--request',file,'--root',qaRoot]));if(result.error)throw Error(result.error);return result.result}finally{rmSync(file)}};
 const env=await worker('environment.save',{name:'Benchmark',origin,projectId:'bench'}),opened=await timed(()=>worker('browser.open',{profileId:'bench',agentId:'bench',environmentId:env.id}));const v={id:opened.value.id,profileId:'bench',agentId:'bench'};
 broker=persistent(node,service,qaRoot);await broker.call('health');
 report.transport={brokerHealth:await sample(()=>broker.call('health')),brokerFrame:await sample(()=>broker.call('browser.frame',v)),brokerMemory:memory(broker.child.pid),coldOpenMs:+opened.ms.toFixed(2),directHealth:await sample(()=>call(qaRoot,'health')),workerHealth:await sample(()=>worker('health')),directFrame:await sample(()=>call(qaRoot,'browser.frame',v)),workerFrame:await sample(()=>worker('browser.frame',v)),framePayloadBytes:JSON.stringify(await call(qaRoot,'browser.frame',v)).length,daemonTree:memory(Number(readFileSync(join(qaRoot,'daemon.lock/pid'),'utf8')))};
 await call(qaRoot,'browser.close',v);broker.close();broker=null;await call(qaRoot,'shutdown');qaRoot=null;console.log('transport',JSON.stringify(report.transport));
 const agent=join(out,'agent-browser');if(existsSync(agent)){
  writeFileSync(join(root,'agent-config.json'),'{}');agentArgs=['--config',join(root,'agent-config.json'),'--session','islands-bench-'+randomUUID(),'--executable-path',chromium.executablePath(),'--json'];agentEnv={...cleanEnv,AGENT_BROWSER_HOME:join(root,'agent-home'),AGENT_BROWSER_IDLE_TIMEOUT_MS:'60000'};
  try{const cold=await timed(()=>run(agent,[...agentArgs,'open',origin],agentEnv));const evaluation=await sample(()=>run(agent,[...agentArgs,'eval','document.querySelectorAll("[data-product]").length'],agentEnv));const snapshot=await run(agent,[...agentArgs,'snapshot','-i'],agentEnv);report.agentBrowser={coldOpenMs:+cold.ms.toFixed(2),warmEvaluation:evaluation,interactiveSnapshotBytes:snapshot.length,snapshot:JSON.parse(snapshot)};console.log('agentBrowser',JSON.stringify(report.agentBrowser))}catch(e){report.agentBrowser={error:e.message}}finally{await run(agent,[...agentArgs,'close'],agentEnv).catch(()=>{})}
 }
}finally{
 broker?.close();
 if(qaRoot){try{const state=await call(qaRoot,'browser.list');for(const s of state.browsers)await call(qaRoot,'browser.close',{id:s.id});await call(qaRoot,'shutdown')}catch{}}
 for(const c of children)if(c.exitCode===null)c.kill('SIGTERM');server.closeAllConnections();await new Promise(r=>server.close(r));
 writeFileSync(join(out,'results.json'),JSON.stringify(report,null,2));rmSync(root,{recursive:true,force:true});console.log('Results: build/browser-research/results.json');
}
