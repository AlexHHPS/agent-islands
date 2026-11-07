// Integration probes, not production adapters. All accounts and sites are fixtures.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,existsSync,statSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const root=mkdtempSync(join(tmpdir(),'islands-integration-')),out=resolve('build/browser-research'),report={date:new Date().toISOString(),scope:'Local fixture only; no real auth, deployments or paid model calls',experiments:{}};
mkdirSync(out,{recursive:true});const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/(API_KEY|TOKEN|SECRET|PASSWORD)/.test(k)&&!k.startsWith('AGENT_BROWSER_')&&!['CODEX_HOME','CLAUDE_CONFIG_DIR','CLAUDECODE'].includes(k)));
env.LIGHTPANDA_DISABLE_TELEMETRY='true';const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function checkedBinary(name){const release=JSON.parse(readFileSync(join(out,name+'-release.json')));assert.equal('sha256:'+createHash('sha256').update(readFileSync(join(out,name))).digest('hex'),release.digest);return join(out,name)}
function run(file,args){return new Promise((resolve,reject)=>{const p=spawn(file,args,{env,stdio:['ignore','pipe','pipe']});let output='',error='';const timeout=setTimeout(()=>p.kill('SIGTERM'),20000);p.stdout.on('data',d=>output+=d);p.stderr.on('data',d=>error+=d);p.on('error',reject);p.on('close',code=>{clearTimeout(timeout);if(code!==0)return reject(Error((error||output).slice(0,800)));try{const result=JSON.parse(output);if(result.success===false)throw Error(JSON.stringify(result.error));resolve(result.data??result)}catch(e){reject(e)}})})}
async function probe(result,name,fn){const start=performance.now();try{const value=await fn();result.checks[name]={status:'passed',ms:+(performance.now()-start).toFixed(2),...(value===undefined?{}:{result:value})}}catch(e){result.checks[name]={status:'failed',ms:+(performance.now()-start).toFixed(2),error:String(e.message).slice(0,700)}}}
const server=createServer((req,res)=>{const u=new URL(req.url,'http://localhost');if(u.pathname==='/data'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(['Acceso','Invitación','Equipo']));return}res.setHeader('Content-Type','text/html; charset=utf-8');if(u.pathname==='/signin')res.setHeader('Set-Cookie','islands_fixture='+u.searchParams.get('account')+'; HttpOnly; SameSite=Lax; Path=/');if(u.pathname==='/frame'){res.end('<button id="framed">Dentro del marco</button>');return}res.end(`<!doctype html><title>Portal fixture</title><style>body{font:20px system-ui}button{padding:18px}iframe{display:block;width:600px;height:100px}</style><h1>Acceso del equipo</h1><button id="next" onclick="history.pushState({},'', '/step-two');document.querySelector('#step').textContent='2'">Continuar</button><button id="finish" onclick="document.querySelector('#step').textContent='3'">Terminar</button><span id="step">1</span><ul id="products"></ul><iframe src="/frame"></iframe><div id="shadow"></div><script>document.querySelector('#shadow').attachShadow({mode:'open'}).innerHTML='<button id="shadow-button">Confirmar equipo</button>';fetch('/data').then(r=>r.json()).then(a=>{document.querySelector('#products').innerHTML=a.map(x=>'<li>'+x+'</li>').join('');document.body.dataset.ready='yes'})</script>`)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;

async function lightpanda(){
 const result={version:'1.0.3',checks:{},decision:'background_only'},s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));
 const child=spawn(checkedBinary('lightpanda'),['serve','--host','127.0.0.1','--port',String(port),'--log-level','error','--load-resources','iframe','--load-resources','stylesheet'],{env,stdio:'ignore'});let browser,secondBrowser,secondChild;
 try{
  for(let i=0;i<100;i++){try{await fetch('http://127.0.0.1:'+port+'/json/version');break}catch{}await sleep(30)}
  browser=await chromium.connectOverCDP('ws://127.0.0.1:'+port,{timeout:5000});const a=await browser.newContext();
  await probe(result,'multiple_contexts_same_process',async()=>{const extra=await browser.newContext();await extra.close()});
  result.isolationStrategy='Separate Lightpanda processes for separate profiles';
  const another=createServer();await new Promise(r=>another.listen(0,'127.0.0.1',r));const secondPort=another.address().port;await new Promise(r=>another.close(r));
  secondChild=spawn(checkedBinary('lightpanda'),['serve','--host','127.0.0.1','--port',String(secondPort),'--log-level','error'],{env,stdio:'ignore'});
  for(let i=0;i<100;i++){try{await fetch('http://127.0.0.1:'+secondPort+'/json/version');break}catch{}await sleep(30)}
  secondBrowser=await chromium.connectOverCDP('ws://127.0.0.1:'+secondPort,{timeout:5000});const b=await secondBrowser.newContext(),page=await a.newPage(),other=await b.newPage();
  await page.goto(origin+'/signin?account=work');await other.goto(origin+'/signin?account=personal');
  await probe(result,'javascript_fetch',async()=>{await page.waitForFunction(()=>document.body.dataset.ready==='yes',{},{timeout:2000});assert.equal(await page.locator('#products li').count(),3)});
  await probe(result,'independent_auth',async()=>{const ac=await a.cookies(),bc=await b.cookies();assert.equal(ac.find(c=>c.name==='islands_fixture')?.value,'work');assert.equal(bc.find(c=>c.name==='islands_fixture')?.value,'personal')});
  await probe(result,'shadow_dom',async()=>assert.equal(await page.locator('#shadow-button').textContent({timeout:2000}),'Confirmar equipo'));
  await probe(result,'iframe',async()=>assert.equal(await page.frameLocator('iframe').locator('#framed').textContent({timeout:2000}),'Dentro del marco'));
  await probe(result,'locator_click_spa',async()=>{await page.locator('#next').click({timeout:2000});assert.equal(await page.locator('#step').textContent(),'2');assert(page.url().endsWith('/step-two'))});
  await probe(result,'storage_state_restore',async()=>{const state=await a.storageState();await a.close();const restored=await browser.newContext({storageState:state});assert.equal((await restored.cookies()).find(c=>c.name==='islands_fixture')?.value,'work');await restored.close()});
  result.visualEvidence='Intentionally unsupported: no real page rendering or faithful layout.';
 }finally{await browser?.close().catch(()=>{});await secondBrowser?.close().catch(()=>{});for(const c of [child,secondChild].filter(Boolean)){c.kill('SIGTERM');if(c.exitCode===null&&c.signalCode===null)await new Promise(r=>c.once('exit',r))}}
 return result;
}

async function agentBrowser(){
 const binary=checkedBinary('agent-browser'),config=join(root,'agent-config.json');writeFileSync(config,'{}');const sessions=['work','personal','restored'].map(name=>'ai-'+name+'-'+randomUUID().slice(0,8));
 const args=session=>['--config',config,'--session',session,'--executable-path',chromium.executablePath(),'--json'];const cmd=(session,...command)=>run(binary,[...args(session),...command]);
 const value=async(session,expression)=>{const r=await cmd(session,'eval',expression);return r.result??r.value??r};
 const result={version:'0.41.2',checks:{},decision:'promising_adapter_requires_more_work'};let socket;
 try{
  await cmd(sessions[0],'open',origin+'/signin?account=work');await cmd(sessions[1],'open',origin+'/signin?account=personal');
  await probe(result,'independent_auth',async()=>{const a=await cmd(sessions[0],'cookies'),b=await cmd(sessions[1],'cookies');assert(JSON.stringify(a).includes('work'));assert(!JSON.stringify(a).includes('personal'));assert(JSON.stringify(b).includes('personal'))});
  await probe(result,'snapshot_refs_and_delta',async()=>{const baseline=await cmd(sessions[0],'snapshot','-i');assert(JSON.stringify(baseline).includes('Continuar'));const delta=await cmd(sessions[0],'snapshot','-i','--delta');return {snapshotBytes:JSON.stringify(baseline).length,deltaBytes:JSON.stringify(delta).length}});
  await probe(result,'auth_restore',async()=>{const file=join(root,'fixture-state.json');await cmd(sessions[0],'state','save',file);await run(binary,[...args(sessions[2]),'--state',file,'open',origin]);const cookies=await cmd(sessions[2],'cookies');assert(JSON.stringify(cookies).includes('work'))});
  await probe(result,'stream_and_input_without_ack',async()=>{
   const status=await cmd(sessions[0],'stream','status');assert(status.port);const frames=[];socket=new WebSocket('ws://127.0.0.1:'+status.port+'/?pacing=ack&maxFps=10');
   socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.type==='frame')frames.push(m)});await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true})});
   for(let i=0;i<80&&!frames.length;i++)await sleep(25);assert(frames.length);const first=frames[0];assert.equal(Buffer.from(first.data,'base64').subarray(0,2).toString('hex'),'ffd8');await sleep(250);assert.equal(frames.length,1,'ACK pacing must prevent stale-frame backlog');
   const point=await value(sessions[0],"(()=>{const r=document.querySelector('#next').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
   const start=performance.now();socket.send(JSON.stringify({type:'input_mouse',eventType:'mousePressed',...point,button:'left',clickCount:1}));socket.send(JSON.stringify({type:'input_mouse',eventType:'mouseReleased',...point,button:'left',clickCount:1}));
   for(let i=0;i<30;i++){if(await value(sessions[0],"document.querySelector('#step').textContent")==='2')break;await sleep(15)}
   assert.equal(await value(sessions[0],"document.querySelector('#step').textContent"),'2');const observedMs=performance.now()-start;assert.equal(frames.length,1,'Input must execute while the viewer withholds ACK');socket.send(JSON.stringify({type:'ack',seq:first.seq}));
   for(let i=0;i<60&&frames.length<2;i++)await sleep(20);assert(frames.length>=2);socket.close();socket=null;return {inputObservedUpperBoundMs:+observedMs.toFixed(2),firstFrameBytes:Buffer.from(first.data,'base64').length,framesAfterAck:frames.length};
  });
  await probe(result,'webm_recording',async()=>{const file=join(out,'agent-browser-flow.webm');await cmd(sessions[0],'record','start',file,'--fps','10','--contact-sheet');await cmd(sessions[0],'click','#finish');await sleep(500);await cmd(sessions[0],'record','stop');assert.equal(readFileSync(file).subarray(0,4).toString('hex'),'1a45dfa3');return {bytes:statSync(file).size}});
 }finally{socket?.close();for(const session of sessions)await cmd(session,'close').catch(()=>{})}
 return result;
}

async function stagehand(){
 const sdk=resolve('build/browser-research/stagehand/node_modules/@browserbasehq/stagehand/dist/index.mjs');if(!existsSync(sdk))return {status:'not_installed',checks:{}};
 const {localBrowser,Stagehand}=await import(pathToFileURL(sdk).href),result={version:'4.4.0',checks:{},decision:'optional_semantic_fallback'},browser=await localBrowser.launch({headless:true,executablePath:chromium.executablePath(),userDataDir:join(root,'stagehand-profile')});let stage,inferenceCalls=0;
 try{
  stage=await Stagehand.create({browser,model:{generate:async()=>{inferenceCalls++;throw Error('Inference deliberately disabled in local integration research')}},domSettleTimeoutMs:100,cache:true,logging:{level:'error'}});
  const page=await browser.context.activePage();await page.goto(origin);
  await probe(result,'deterministic_flow',async()=>{await page.locator('#next').click();assert.equal(await page.locator('#step').textContent(),'2')});
  await probe(result,'replay_observed_action_no_llm',async()=>{const start=inferenceCalls,reply=await stage.act({selector:'#finish',description:'Finalizar recorrido',method:'click',arguments:[]},{page,timeout:2000});assert.equal(inferenceCalls,start);assert.equal(await page.locator('#step').textContent(),'3');return {inferenceCalls:0,cache:reply.metadata?.cache||reply.cache||null}});
  result.semanticRecovery='Not benchmarked: requires an actual model and representative changed pages; no model was called.';
 }finally{await stage?.close().catch(()=>{});await browser.close()}
 return result;
}
try{
 for(const [name,fn] of [['lightpanda',lightpanda],['agentBrowser',agentBrowser],['stagehand',stagehand]]){try{report.experiments[name]=await fn()}catch(e){report.experiments[name]={status:'failed_to_initialize',error:String(e.message).slice(0,1000)}}console.log(name,JSON.stringify(report.experiments[name]))}
 report.experiments.ultralight={status:'not_run',decision:'retain_WKWebView',reason:'Already native Cocoa/WKWebView; renderer replacement needs a separately licensed SDK and a UI migration. Published Electron comparisons do not establish an improvement here.'};
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));rmSync(root,{recursive:true,force:true});mkdirSync(out,{recursive:true});writeFileSync(join(out,'browser-integration-results.json'),JSON.stringify(report,null,2)+'\n');console.log('Report: build/browser-research/browser-integration-results.json')}
