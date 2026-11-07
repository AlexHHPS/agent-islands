'use strict';
// Chromium remains in QA's isolated profile context. Remote documents never get the app bridge.
var browserSession=null,browserOwner=null,browserWanted=false,browserMode='navigate',browserPending=new Map(),browserReferencesSeen=new Set(),browserRequestChain=Promise.resolve(),visualSendDrafts=new Map(),browserRecordings=new Map();
let browserFrameBusy=false,browserGeneration=0,browserScope=workspaceScopeIdentity(state),browserDrag=null,browserHoverTimer=null;
const browserPane=document.createElement('section');browserPane.id='browser-pane';browserPane.hidden=true;browserPane.dataset.slot='controlled-browser';browserPane.setAttribute('aria-label','Navegador de la conversación');
browserPane.innerHTML=`<div class="browser-heading"><div><span class="sheet-kicker">REFERENCIAS VISUALES</span><h2 id="browser-heading">Navegador</h2></div><span id="browser-recording" role="status" hidden></span><button id="browser-hide" type="button">Volver a islas</button><button id="browser-close" type="button" aria-label="Cerrar navegador" class="icon-button">×</button></div><div id="browser-setup"><label for="browser-environment">Entorno de esta conversación</label><select id="browser-environment"></select><div class="browser-setup-actions"><button id="browser-connect" class="primary" type="button">Abrir navegador</button><button id="browser-environments" type="button">Configurar entornos</button></div><div id="browser-sessions"></div><div id="browser-logins"></div></div><div id="browser-controls" hidden><form id="browser-address-form"><button id="browser-back" type="button" aria-label="Atrás">←</button><button id="browser-reload" type="button" aria-label="Recargar">↻</button><label class="sr-only" for="browser-address">Dirección del navegador</label><input id="browser-address" type="url" required placeholder="https://…" autocomplete="off"><button type="submit">Ir</button></form><nav id="browser-tabs" aria-label="Pestañas del navegador"></nav><div class="browser-tools" role="group" aria-label="Capturar referencias"><button data-browser-mode="navigate" aria-pressed="true">Navegar</button><button data-browser-mode="component" aria-pressed="false">Seleccionar componente</button><button data-browser-mode="region" aria-pressed="false">Capturar región</button><button id="browser-record" type="button">● Grabar flujo</button></div></div><p id="browser-status" role="status">Elige un entorno para capturar una referencia o grabar un recorrido.</p><div id="browser-stage" hidden><img id="browser-frame" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="Navegador interactivo" tabindex="0" draggable="false" aria-describedby="browser-status"><div id="browser-selection" hidden></div></div><div id="browser-references" aria-label="Referencias de esta conversación"></div>`;
$('.main-pane').append(browserPane);
const browserButton=document.createElement('button');browserButton.id='open-browser';browserButton.type='button';browserButton.textContent='Navegador';$('#open-operations').before(browserButton);browserButton.onclick=()=>openBrowser();
$('#attach-image').insertAdjacentHTML('beforebegin','<button id="composer-browser" type="button" class="icon-button" title="Capturar o grabar el navegador" aria-label="Capturar o grabar el navegador">▣</button>');$('#composer-browser').onclick=()=>openBrowser();
function browserAgent(){return state.agents.find(a=>a.id===terminalTarget())}
function browserRPC(method,params={}){
 const owner=params.agentId||browserOwner,requestId=crypto.randomUUID(),generation=browserGeneration;
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{browserPending.delete(requestId);reject(Error('El navegador no respondió. Vuelve a intentarlo.'))},method==='browser.open'?45000:35000);
  browserPending.set(requestId,{resolve,reject,timer,method,generation,owner});
  if(native)send('operations',{requestId,method,params:{...params,agentId:owner}});
  else{clearTimeout(timer);browserPending.delete(requestId);resolve({})}
 });
}
function browserStatus(message,error=false){$('#browser-status').textContent=message;$('#browser-status').classList.toggle('browser-error',error)}
function browserVisible(){return browserWanted&&browserOwner===terminalTarget()&&state.agents.some(a=>a.id===browserOwner)}
function updateBrowserVisibility(){browserPane.hidden=!browserVisible();document.body.classList.toggle('browser-visible',!browserPane.hidden);browserButton.classList.toggle('selected',!browserPane.hidden);for(const child of $('.main-pane').children)if(child!==browserPane)child.inert=!browserPane.hidden}
async function openBrowser(){
 const agent=browserAgent();if(!agent?.managed||!['codex','claude'].includes(agent.harness)){toast('Abre una conversación de Codex o Claude para adjuntar referencias.');return}
 if(browserOwner!==agent.id){browserGeneration++;browserSession=null;browserOwner=agent.id}
 browserWanted=true;document.body.classList.remove('terminal-expanded');updateBrowserVisibility();$('#browser-heading').textContent='Navegador · '+agent.name;
 if(browserSession){renderBrowserFrame(browserSession);return}
 $('#browser-setup').hidden=false;$('#browser-controls').hidden=true;$('#browser-stage').hidden=true;browserStatus('Cargando entornos y navegadores…');
 try{
  const owner=browserOwner,generation=browserGeneration;
  const [snapshot,list]=await Promise.all([browserRPC('snapshot'),browserRPC('browser.list')]);if(generation!==browserGeneration||owner!==browserOwner)return;
  const roots=agent.executionProjectIds||state.projectWorkspaces?.find(w=>w.id===agent.workspaceId)?.projectIds||[agent.projectId];
  const environments=(snapshot.environments||[]).filter(e=>roots.includes(e.projectId));$('#browser-environment').innerHTML=options(environments);$('#browser-connect').disabled=!environments.length;
  $('#browser-sessions').innerHTML=(list.browsers||[]).filter(s=>s.agentId===owner).map(s=>`<button data-browser-session="${esc(s.id)}">${s.recording?'● Grabando · ':''}Continuar ${esc(s.url)}</button>`).join('');
  $('#browser-logins').innerHTML=(snapshot.logins||[]).filter(l=>environments.some(e=>e.id===l.environmentId)&&l.profileId===(agent.profileId||agent.harness)).map(l=>`<button data-browser-login="${esc(l.id)}" data-environment="${esc(l.environmentId)}">Controlar ventana de acceso · ${esc(l.account)}</button>`).join('');
  $$('[data-browser-session]').forEach(b=>b.onclick=async()=>{browserSession={id:b.dataset.browserSession};await refreshBrowser()});
  $$('[data-browser-login]').forEach(b=>b.onclick=()=>connectBrowser({loginId:b.dataset.browserLogin,environmentId:b.dataset.environment}));
  renderBrowserReferences(list.references||[]);browserStatus(environments.length?'Abre el entorno y selecciona un componente, arrastra una región o graba el flujo.':'Añade un entorno a uno de los proyectos de esta conversación.');
 }catch(e){browserStatus(e.message,true)}
}
async function connectBrowser(extra={}){
 $('#browser-connect').disabled=true;browserStatus('Abriendo Chromium…');const generation=browserGeneration;
 try{const frame=await browserRPC('browser.open',{environmentId:$('#browser-environment').value,...extra});if(generation===browserGeneration)renderBrowserFrame(frame)}catch(e){browserStatus(e.message,true)}finally{$('#browser-connect').disabled=!$('#browser-environment').value}
}
function renderBrowserFrame(frame){
 if(!frame?.image)return;const finished=browserSession?.recordingId&&!frame.recording?browserSession.recordingId:null;browserSession=frame;if(finished&&!browserReferencesSeen.has(finished))browserRPC('browser.reference',{referenceId:finished}).catch(e=>browserStatus(e.message,true));$('#browser-setup').hidden=true;$('#browser-controls').hidden=false;$('#browser-stage').hidden=false;
 const image=$('#browser-frame');image.src=frame.image;image.style.aspectRatio=frame.width+'/'+frame.height;
 if(document.activeElement!==$('#browser-address'))$('#browser-address').value=frame.url||'';
 $('#browser-record').textContent=frame.recording?'■ Terminar y adjuntar':'● Grabar flujo';$('#browser-record').classList.toggle('is-recording',!!frame.recording);$('#browser-recording').hidden=!frame.recording;
 $('#browser-recording').textContent=frame.recording?'● Grabando · '+Math.max(0,Math.floor(Date.now()/1000-frame.recordingStartedAt))+' s':'';
 $('#browser-tabs').innerHTML=(frame.tabs||[]).map(t=>`<button type="button" data-browser-tab="${t.index}" aria-current="${t.active?'page':'false'}">${esc(t.url||'Nueva pestaña')}</button>`).join('');$$('[data-browser-tab]').forEach(b=>b.onclick=()=>browserAction('tab',{index:Number(b.dataset.browserTab)}));
 if(frame.recording&&frame.recordingId)browserRecordings.set(frame.recordingId,{owner:browserOwner,browserId:frame.id});
 if(frame.recordingError)browserStatus(frame.recordingError,true);
}
async function refreshBrowser(){if(!browserSession||browserFrameBusy||browserPane.hidden)return;browserFrameBusy=true;try{const generation=browserGeneration,frame=await browserRPC('browser.frame',{id:browserSession.id});if(generation===browserGeneration&&!browserDrag)renderBrowserFrame(frame)}catch(e){browserStatus(e.message,true)}finally{browserFrameBusy=false}}
function browserAction(action,extra={}){
 const generation=browserGeneration,id=browserSession?.id;if(!id)return Promise.resolve();
 browserRequestChain=browserRequestChain.catch(()=>{}).then(async()=>{if(generation!==browserGeneration)return;try{const frame=await browserRPC('browser.action',{id,action,frameToken:browserSession?.frameToken,...extra});if(generation===browserGeneration){renderBrowserFrame(frame);if(action!=='text'&&action!=='key')browserStatus(browserMode==='navigate'?'Navega aquí. Las referencias se añaden al borrador del chat.':'Selecciona una referencia en la página.')}}catch(e){browserStatus(e.message,true)}});return browserRequestChain;
}
function browserPoint(event){const r=$('#browser-frame').getBoundingClientRect();return {x:Math.max(0,Math.min(browserSession.width-1,(event.clientX-r.left)*browserSession.width/r.width)),y:Math.max(0,Math.min(browserSession.height-1,(event.clientY-r.top)*browserSession.height/r.height))}}
function browserSelection(box){const image=$('#browser-frame'),r=image.getBoundingClientRect(),stage=$('#browser-stage').getBoundingClientRect(),el=$('#browser-selection');el.hidden=!box;if(box){el.style.left=(r.left-stage.left+box.x*r.width/browserSession.width)+'px';el.style.top=(r.top-stage.top+box.y*r.height/browserSession.height)+'px';el.style.width=box.width*r.width/browserSession.width+'px';el.style.height=box.height*r.height/browserSession.height+'px'}}
function setBrowserMode(mode){browserMode=mode;browserSelection(null);browserPane.dataset.mode=mode;$$('[data-browser-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.browserMode===mode)));browserStatus(({navigate:'Haz clic y escribe en la página. Tab cambia de campo.',component:'Haz clic en el componente que quieres adjuntar. Esc cancela.',region:'Arrastra sobre la zona que quieres adjuntar. Esc cancela.'})[mode]);$('#browser-frame').focus()}
$$('[data-browser-mode]').forEach(b=>b.onclick=()=>setBrowserMode(b.dataset.browserMode));
$('#browser-connect').onclick=()=>connectBrowser();$('#browser-environments').onclick=()=>openOperations('environments');
$('#browser-hide').onclick=()=>{browserWanted=false;updateBrowserVisibility()};
$('#browser-close').onclick=async()=>{if(!browserSession){browserWanted=false;updateBrowserVisibility();return}try{await browserRPC('browser.close',{id:browserSession.id});browserSession=null;browserWanted=false;updateBrowserVisibility()}catch(e){browserStatus(e.message,true)}};
$('#browser-address-form').onsubmit=e=>{e.preventDefault();browserAction('navigate',{url:$('#browser-address').value})};$('#browser-back').onclick=()=>browserAction('back');$('#browser-reload').onclick=()=>browserAction('reload');
$('#browser-record').onclick=async()=>{
 if(!browserSession)return;const button=$('#browser-record'),generation=browserGeneration;button.disabled=true;
 try{const stopping=browserSession.recording,result=await browserRPC(stopping?'browser.record.stop':'browser.record.start',{id:browserSession.id});if(generation!==browserGeneration)return;browserSession={...browserSession,...result,recording:!stopping};renderBrowserFrame(browserSession);browserStatus(stopping?'Grabación adjunta al borrador. Escribe qué quieres cambiar del flujo.':'Grabando este navegador · máximo 5 minutos. Termina para adjuntar al chat.');if(stopping)await loadBrowserReferences()}catch(e){browserStatus(e.message,true)}finally{button.disabled=false}
};
async function captureBrowser(point,extra={}){const generation=browserGeneration;try{await browserRPC('browser.capture',{id:browserSession.id,frameToken:browserSession.frameToken,kind:browserMode,...point,...extra});if(generation===browserGeneration){setBrowserMode('navigate');browserStatus('Referencia adjunta al borrador. Escribe el cambio que quieres hacer.');await loadBrowserReferences()}}catch(e){browserStatus(e.message,true)}finally{browserSelection(null)}}
$('#browser-frame').onpointerdown=e=>{if(!browserSession||e.button!==0)return;e.preventDefault();$('#browser-frame').focus();if(browserMode==='region'){browserDrag={...browserPoint(e),token:browserSession.frameToken};e.target.setPointerCapture(e.pointerId)}};
$('#browser-frame').onpointermove=e=>{
 if(!browserSession)return;const p=browserPoint(e);
 if(browserDrag){browserSelection({x:Math.min(p.x,browserDrag.x),y:Math.min(p.y,browserDrag.y),width:Math.abs(p.x-browserDrag.x),height:Math.abs(p.y-browserDrag.y)});return}
 if(browserMode==='component'){clearTimeout(browserHoverTimer);const generation=browserGeneration;browserHoverTimer=setTimeout(async()=>{try{const r=await browserRPC('browser.inspect',{id:browserSession.id,frameToken:browserSession.frameToken,...p});if(generation===browserGeneration&&browserMode==='component'&&r.component)browserSelection({...r.component.bounds,x:r.component.bounds.x+r.component.offset.x,y:r.component.bounds.y+r.component.offset.y})}catch{}},160)}
};
$('#browser-frame').onpointerup=e=>{if(!browserSession)return;const p=browserPoint(e);if(browserDrag){const from=browserDrag;browserDrag=null;captureBrowser({x:Math.min(from.x,p.x),y:Math.min(from.y,p.y)},{width:Math.abs(from.x-p.x),height:Math.abs(from.y-p.y)});return}if(browserMode==='component')captureBrowser(p);else if(browserMode==='navigate')browserAction('click',p)};
$('#browser-frame').onpointercancel=()=>{browserDrag=null;browserSelection(null)};
$('#browser-frame').onwheel=e=>{if(browserMode!=='navigate'||!browserSession)return;e.preventDefault();browserAction('wheel',{dx:e.deltaX,dy:e.deltaY})};
$('#browser-frame').onkeydown=e=>{if(e.key==='Escape'&&browserMode!=='navigate'){e.preventDefault();browserDrag=null;setBrowserMode('navigate');return}if(browserMode!=='navigate')return;if(e.metaKey&&e.key==='Enter')return;if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='v')return;e.preventDefault();if(e.key.length===1&&!e.metaKey&&!e.ctrlKey&&!e.altKey)browserAction('text',{text:e.key});else{const key=(e.metaKey?'Meta+':'')+(e.ctrlKey?'Control+':'')+(e.altKey?'Alt+':'')+(e.shiftKey?'Shift+':'')+e.key;if(/(?:Enter|Tab|Escape|Backspace|Delete|Arrow\w+|Home|End|PageUp|PageDown|[acvxz])$/.test(key))browserAction('key',{key})}};
$('#browser-frame').onpaste=e=>{e.preventDefault();if(browserMode==='navigate')browserAction('text',{text:e.clipboardData.getData('text/plain')})};
async function loadBrowserReferences(){try{const generation=browserGeneration,result=await browserRPC('browser.list');if(generation===browserGeneration)renderBrowserReferences(result.references||[])}catch(e){browserStatus(e.message,true)}}
function renderBrowserReferences(references){
 $('#browser-references').innerHTML=references.length?'<h3>Referencias guardadas</h3>'+references.map(r=>`<button type="button" data-browser-reference="${esc(r.id)}">${r.kind==='recording'?'▶ ':''}${esc(r.name)}${r.duration?' · '+Math.round(r.duration)+' s':''} · Adjuntar de nuevo</button>`).join(''):'';
 $$('[data-browser-reference]').forEach(b=>b.onclick=()=>browserRPC('browser.reference',{referenceId:b.dataset.browserReference}).catch(e=>browserStatus(e.message,true)));
}
// Visual references use the same per-agent composer draft as images.
const browserRenderAttachments=renderAttachments;
renderAttachments=function(){browserRenderAttachments();const el=$('#composer-attachments');el.setAttribute('aria-label','Referencias e imágenes adjuntas');for(const item of el.querySelectorAll('.composer-image')){const id=item.querySelector('[data-remove]')?.dataset.remove,a=composerAttachments.find(a=>a.id===id);if(!a?.visual)continue;item.classList.add('composer-reference');const open=document.createElement('button');open.type='button';open.className='reference-open';open.textContent=(a.kind==='recording'?'▶ ':'')+a.name;open.title='Ver referencia';open.onclick=()=>send('visualReferenceOpen',{referenceId:a.id});item.append(open)}};
const browserSelectAgent=selectAgent;selectAgent=function(id){browserSelectAgent(id);updateBrowserVisibility()};
const browserBackToTeam=backToTeam;backToTeam=function(){browserBackToTeam();updateBrowserVisibility()};
const browserSwitchComposer=switchComposerAgent;
switchComposerAgent=function(id){browserSwitchComposer(id);updateBrowserVisibility()};
const browserReceiveNative=window.receiveNative;
window.receiveNative=message=>{
 if(message.event==='snapshot'&&workspaceScopeIdentity(message.data)!==browserScope){browserScope=workspaceScopeIdentity(message.data);browserGeneration++;browserWanted=false;browserSession=null;browserOwner=null;browserDrag=null}
 browserReceiveNative(message);
 const {event,data}=message;
 if(event==='snapshot'){updateBrowserVisibility();return}
 if(event==='operationsResult'&&browserPending.has(data.requestId)){const pending=browserPending.get(data.requestId);clearTimeout(pending.timer);browserPending.delete(data.requestId);data.error?pending.reject(Error(data.error)):pending.resolve(data.result);return}
 if(event==='visualReference'){
  const a={...data,visual:true},owner=data.owner;
  if(owner===terminalTarget()){if(!composerAttachments.some(a=>a.id===data.id)){composerAttachments.push(a);renderAttachments()}}
  else{const draft=composerDrafts.get(owner)||{text:'',attachments:[]};if(!draft.attachments.some(a=>a.id===data.id))draft.attachments.push(a);composerDrafts.set(owner,draft)}
  browserReferencesSeen.add(data.id);browserRecordings.delete(data.id);toast('Referencia añadida al borrador.');
 }
 if(event==='promptAccepted')visualSendDrafts.delete(data.requestId);
 if(event==='promptRejected'&&visualSendDrafts.has(data.requestId)){
  const draft=visualSendDrafts.get(data.requestId);visualSendDrafts.delete(data.requestId);
  if(terminalTarget()===draft.owner){if(!$('#prompt').value)$('#prompt').value=draft.text;for(const a of draft.attachments)if(!composerAttachments.some(b=>b.id===a.id))composerAttachments.push(a);renderAttachments()}
  else{const saved=composerDrafts.get(draft.owner)||{text:'',attachments:[]};if(!saved.text)saved.text=draft.text;for(const a of draft.attachments)if(!saved.attachments.some(b=>b.id===a.id))saved.attachments.push(a);composerDrafts.set(draft.owner,saved)}
 }
};
setInterval(async()=>{for(const [id,record] of browserRecordings){if(!state.agents.some(a=>a.id===record.owner))continue;try{const result=await browserRPC('browser.list',{agentId:record.owner});if(result.references?.some(r=>r.id===id))await browserRPC('browser.reference',{agentId:record.owner,referenceId:id})}catch{}}},6000);
setInterval(()=>{if(browserVisible()&&browserSession&&!browserDrag&&browserMode==='navigate'&&!document.hidden)refreshBrowser()},900);
if(preview&&!native&&query.get('screen')==='browser'){
 const agent=state.agents.find(a=>a.managed&&['codex','claude'].includes(a.harness))||state.agents.find(a=>['codex','claude'].includes(a.harness));if(agent){agent.managed=true;agent.processRunning=true;selectAgent(agent.id);browserOwner=terminalTarget();browserWanted=true;updateBrowserVisibility();$('#browser-heading').textContent='Navegador · Portal de clientes';
 const fixture='<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800"><rect width="1280" height="800" fill="#faf8f3"/><rect width="1280" height="88" fill="#e9eee5"/><g font-family="Arial" fill="#29382b"><text x="64" y="54" font-size="28">Portal de clientes</text><text x="64" y="196" font-size="44">Tu equipo, listo para empezar.</text><text x="64" y="246" font-size="24">Invita a las personas con las que vas a trabajar.</text><rect x="64" y="310" width="520" height="220" rx="24" fill="#e4ecdf"/><text x="96" y="364" font-size="28">Acceso al equipo</text><rect x="96" y="410" width="240" height="64" rx="16" fill="#42664e"/><text x="128" y="451" font-size="24" fill="white">Invitar a una persona</text></g></svg>';
 renderBrowserFrame({id:'preview-browser',image:'data:image/svg+xml;base64,'+btoa(fixture),width:1280,height:800,url:'https://portal.ejemplo.com/equipo',frameToken:'preview',recording:false,tabs:[{index:0,url:'Portal · Equipo',active:true}]});browserStatus('Selecciona un componente, captura una región o graba el recorrido.');
 if(query.get('state')==='empty'){browserSession=null;$('#browser-stage').hidden=true;$('#browser-controls').hidden=true;$('#browser-setup').hidden=false;browserStatus('Añade un entorno de este proyecto para empezar.')}
 if(query.get('state')==='loading'){$('#browser-stage').hidden=true;browserStatus('Abriendo Chromium…')}
 if(query.get('state')==='error')browserStatus('El navegador no respondió. Actualiza para volver a conectar.',true);
 $('#toast').hidden=true;
 }
}
