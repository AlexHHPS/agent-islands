'use strict';
// Chromium remains in QA's isolated profile context. Remote documents never get the app bridge.
// The page fills the pane; one floating dock carries the tools. Collapsed, the page is used normally;
// open, a click annotates an element and a drag marks an area.
var browserSession=null,browserOwner=null,browserWanted=false,browserMode='navigate',browserPending=new Map(),browserReferencesSeen=new Set(),browserRequestChain=Promise.resolve(),visualSendDrafts=new Map(),browserRecordings=new Map();
let browserFrameBusy=false,browserGeneration=0,browserScope=workspaceScopeIdentity(state),browserDrag=null,browserHoverTimer=null,browserLiveRunning=false,browserLiveSeq=0,browserTabsKey='',browserDetected=null,browserStatusTimer=null,browserPointer=null;
Object.assign(paths,{
 globe:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3.5 9h17M3.5 15h17M12 3c-3 3.2-3 14.8 0 18M12 3c3 3.2 3 14.8 0 18',
 launcher:'M4 6h16M4 12h9M4 18h5M17.5 13.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1Z',
 pointer:'M5 4l5.6 15 2.3-6.2L19 10.5ZM18 15v5M15.5 17.5h5',
 text:'M5 7V5h14v2M12 5v14M9 19h6',
 camera:'M4 8h3.5L9 5.5h6L16.5 8H20v11H4ZM12 10.5a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4',
 record:'M12 6.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11',stop:'M8 8h8v8H8Z',
 pause:'M9 6v12M15 6v12',play:'M8 5.5v13l10.5-6.5Z',
 eye:'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12ZM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5',
 eyeOff:'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12ZM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M4 4l16 16',
 list:'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
 send:'M21 3 10 14M21 3l-7 18-4-7-7-4Z',check:'M5 12.5l4.5 4.5L19 7.5',
 trash:'M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5',
 gear:'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1',
 back:'M15 5l-7 7 7 7',reload:'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4.5H15',chevron:'M9 6l6 6-6 6',pencil:'M15 5l4 4L8 20H4v-4Z',
 desktop:'M3 5h18v11H3ZM8.5 20h7M12 16v4',laptop:'M5 6h14v9H5ZM2.5 18.5h19',tablet:'M6 3h12v18H6ZM11 18h2',mobile:'M8 3h8v18H8ZM11 18h2'
});
const browserPane=document.createElement('section');browserPane.id='browser-pane';browserPane.hidden=true;browserPane.dataset.slot='controlled-browser';browserPane.dataset.mode='navigate';I18n.attribute(browserPane,'aria-label',()=>I18n.t('Navegador de la conversación'));
const dockButton=(attrs,name,label,key='')=>`<button type="button" class="dock-button" ${attrs} aria-label="${label}"${key?` data-key="${key}"`:''}>${icon(name)}</button>`;
browserPane.innerHTML=ht`<header class="bw-bar"><h2 id="browser-heading" class="sr-only">Navegador</h2><button id="browser-hide" type="button" class="bw-icon" title="Volver a islas" aria-label="Volver a islas">${icon('island')}</button>
<div id="browser-controls" class="bw-controls" hidden><button id="browser-back" type="button" class="bw-icon" title="Atrás" aria-label="Atrás">${icon('back')}</button><button id="browser-reload" type="button" class="bw-icon" title="Recargar" aria-label="Recargar">${icon('reload')}</button>
<form id="browser-address-form" class="bw-address"><label class="sr-only" for="browser-address">Dirección del navegador</label><input id="browser-address" type="url" required placeholder="https://…" autocomplete="off" spellcheck="false"><button type="submit" class="sr-only">Ir</button></form>
<nav id="browser-tabs" aria-label="Pestañas del navegador" hidden></nav>
<div id="browser-viewport" class="bw-segment" role="group" aria-label="Tamaño de pantalla"><button type="button" class="bw-icon" data-viewport="desktop" aria-pressed="true" title="Escritorio" aria-label="Escritorio">${icon('desktop')}</button><button type="button" class="bw-icon" data-viewport="laptop" aria-pressed="false" title="Portátil" aria-label="Portátil">${icon('laptop')}</button><button type="button" class="bw-icon" data-viewport="tablet" aria-pressed="false" title="Tableta" aria-label="Tableta">${icon('tablet')}</button><button type="button" class="bw-icon" data-viewport="mobile" aria-pressed="false" title="Móvil" aria-label="Móvil">${icon('mobile')}</button></div>
<span id="browser-issues" class="bw-issues" hidden></span></div>
<span id="browser-recording" class="bw-recording" role="status" hidden></span><button id="browser-close" type="button" class="bw-icon" title="Cerrar navegador" aria-label="Cerrar navegador">${icon('close')}</button></header>
<div id="browser-setup"><section class="browser-quick" aria-labelledby="browser-quick-title"><h3 id="browser-quick-title">Abre tu producto</h3><p class="browser-quick-lead">Elige el frontend que corre en tu Mac o pega su dirección.</p><div id="browser-detected" class="browser-detected" aria-live="polite"></div><form id="browser-local-form" class="browser-local"><label for="browser-local-url" class="sr-only">Dirección del frontend</label><div class="browser-inline"><input id="browser-local-url" type="url" placeholder="http://localhost:5173" autocomplete="off" spellcheck="false"><button class="primary" type="submit">Abrir</button></div></form></section>
<details id="browser-saved" class="browser-saved"><summary>Entornos guardados y accesos</summary><label for="browser-environment">Entorno de esta conversación</label><select id="browser-environment"></select><div class="browser-setup-actions"><button id="browser-connect" class="primary" type="button">Abrir navegador</button><button id="browser-environments" type="button">Configurar entornos</button></div><div id="browser-logins"></div></details><div id="browser-sessions"></div><p id="browser-setup-status" class="browser-setup-status" role="status"></p></div>
<div class="browser-body"><div id="browser-stage" hidden><img id="browser-frame" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="Navegador interactivo" tabindex="0" draggable="false"><div id="browser-selection" hidden></div><div id="annotation-layer" aria-hidden="true"></div><div id="browser-hover" class="bw-hover" hidden><small id="browser-hover-source"></small><span id="browser-hover-name"></span></div>
<p id="browser-status" class="bw-toast" role="status" hidden></p>
<form id="browser-note-form" class="bw-note" hidden><label for="browser-note" class="sr-only">Nota en este momento de la grabación</label><input id="browser-note" maxlength="1000" placeholder="Nota en este momento…" autocomplete="off"><button type="submit">Añadir nota</button></form>
<div id="browser-settings" class="bw-panel" hidden><div class="bw-panel-head"><strong>Navegador visual</strong><span>Agent Islands</span></div>
<div class="bw-row"><span>Detalle para el agente</span><button type="button" id="annotation-level" class="bw-cycle" data-level="standard"><span id="annotation-level-label">Estándar</span><i aria-hidden="true"></i><i aria-hidden="true"></i><i aria-hidden="true"></i></button></div>
<div class="bw-row"><span>Adjuntar avisos de la página</span><button type="button" id="annotation-issues-default" class="bw-switch" role="switch" aria-checked="true" aria-label="Adjuntar avisos de la página"></button></div>
<div id="browser-references" class="bw-references" aria-label="Referencias de esta conversación"></div>
<button type="button" id="browser-settings-environments" class="bw-link">Configurar entornos ${icon('chevron')}</button></div>
<div id="browser-dock" class="bw-dock" data-open="false" role="toolbar" aria-label="Herramientas del navegador"><div class="dock-tools">
${dockButton('data-browser-mode="annotate" aria-pressed="false"','pointer','Anotar elementos','A')}${dockButton('data-browser-mode="text" aria-pressed="false"','text','Anotar texto','T')}${dockButton('data-browser-mode="region" aria-pressed="false"','camera','Capturar componente o región','C')}<span class="dock-sep"></span>
${dockButton('id="browser-freeze" aria-pressed="false"','pause','Pausar animaciones','P')}${dockButton('id="annotation-markers-toggle" aria-pressed="false"','eye','Ocultar marcadores','H')}${dockButton('id="annotation-rail-toggle" aria-pressed="false"','list','Anotaciones','L')}<span class="dock-send">${dockButton('id="annotation-send" disabled','send','Añadir al mensaje')}<b id="annotation-send-count" class="dock-badge" hidden></b></span>${dockButton('id="annotation-clear" data-danger="true" disabled','trash','Borrar borradores','X')}${dockButton('id="browser-settings-toggle" aria-pressed="false"','gear','Ajustes')}<span class="dock-sep"></span></div>
${dockButton('id="browser-record"','record','Grabar flujo','R')}<span class="dock-launch">${dockButton('id="browser-dock-toggle" aria-expanded="false"','launcher','Anotar la página','A')}<b id="browser-dock-badge" class="dock-badge" hidden></b></span></div></div>
<aside id="annotation-rail" aria-label="Anotaciones de esta conversación" hidden></aside></div>`;
$('.main-pane').append(browserPane);
const browserSplitter=document.createElement('div');browserSplitter.id='browser-splitter';browserSplitter.setAttribute('role','separator');browserSplitter.setAttribute('aria-orientation','vertical');browserSplitter.tabIndex=0;I18n.attribute(browserSplitter,'aria-label',()=>I18n.t('Ajustar el ancho del terminal'));$('#inspector').before(browserSplitter);
const browserButton=document.createElement('button');browserButton.id='open-browser';browserButton.type='button';I18n.bind(browserButton,"textContent",()=>I18n.t('Navegador'));I18n.attribute(browserButton,'title',()=>I18n.t('Navegador visual · ⌘⇧B'));$('#open-operations').before(browserButton);browserButton.onclick=()=>openBrowser();
// The open conversation reaches its page from its own header, beside expanding the terminal.
const agentBrowserButton=document.createElement('button');agentBrowserButton.id='agent-browser';agentBrowserButton.type='button';agentBrowserButton.className='icon-button';agentBrowserButton.innerHTML=icon('globe');I18n.attribute(agentBrowserButton,'title',()=>I18n.t('Abrir el navegador · ⌘⇧B'));I18n.attribute(agentBrowserButton,'aria-label',()=>I18n.t('Abrir el navegador'));$('#expand-terminal').before(agentBrowserButton);
agentBrowserButton.onclick=()=>{if(browserVisible()){browserWanted=false;updateBrowserVisibility()}else openBrowser()};
$('#attach-image').insertAdjacentHTML('beforebegin',ht('<button id="composer-browser" type="button" class="icon-button" title="Capturar o grabar el navegador" aria-label="Capturar o grabar el navegador">▣</button>'));$('#composer-browser').innerHTML=icon('globe');$('#composer-browser').onclick=()=>openBrowser();
function browserAgent(){return state.agents.find(a=>a.id===terminalTarget())}
function browserRoots(agent){return agent.executionProjectIds||state.projectWorkspaces?.find(w=>w.id===agent.workspaceId)?.projectIds||[agent.projectId]}
function browserRPC(method,params={}){
 const owner=params.agentId||browserOwner,requestId=crypto.randomUUID(),generation=browserGeneration;
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{browserPending.delete(requestId);reject(Error(I18n.t('El navegador no respondió. Vuelve a intentarlo.')))},method==='browser.open'?45000:35000);
  browserPending.set(requestId,{resolve,reject,timer,method,generation,owner});
  if(native)send('operations',{requestId,method,params:{...params,agentId:owner}});
  else{clearTimeout(timer);browserPending.delete(requestId);resolve({})}
 });
}
// Messages are short-lived pills over the page; errors stay a little longer. Setup shows them inline.
function browserStatus(message,error=false){
 const setup=!$('#browser-setup').hidden,el=setup?$('#browser-setup-status'):$('#browser-status');
 I18n.bind(el,"textContent",()=>message);el.classList.toggle('browser-error',error);if(setup)return;
 el.hidden=!message;clearTimeout(browserStatusTimer);if(message)browserStatusTimer=setTimeout(()=>{el.hidden=true},error?7000:2600);
}
function browserVisible(){return browserWanted&&browserOwner===terminalTarget()&&state.agents.some(a=>a.id===browserOwner)}
function updateBrowserVisibility(){
 browserPane.hidden=!browserVisible();document.body.classList.toggle('browser-visible',!browserPane.hidden);browserButton.classList.toggle('selected',!browserPane.hidden);for(const child of $('.main-pane').children)if(child!==browserPane)child.inert=!browserPane.hidden;
 const eligible=browserAgent();agentBrowserButton.hidden=!(eligible?.managed&&['codex','claude'].includes(eligible.harness));agentBrowserButton.setAttribute('aria-pressed',String(!browserPane.hidden));
 const width=Number(localStorage.getItem('islands.browserTerminalWidth'))||0;if(!browserPane.hidden&&width)$('#inspector').style.setProperty('--panel-width',width+'px');else $('#inspector').style.removeProperty('--panel-width');
 if(!browserPane.hidden)browserKick();if(typeof annotationsVisibility==='function')annotationsVisibility(!browserPane.hidden);
}
function browserShowSetup(on){$('#browser-setup').hidden=!on;$('#browser-controls').hidden=on;$('#browser-stage').hidden=on;$('#browser-recording').hidden=on||!browserSession?.recording}
async function openBrowser(){
 const agent=browserAgent();if(!agent?.managed||!['codex','claude'].includes(agent.harness)){toast(I18n.t('Abre una conversación de Codex o Claude para adjuntar referencias.'));return}
 if(browserOwner!==agent.id){browserGeneration++;browserSession=null;browserOwner=agent.id;browserLiveSeq=0}
 if(view!=='world')setView('world');
 browserWanted=true;document.body.classList.remove('terminal-expanded');updateBrowserVisibility();I18n.bind($('#browser-heading'),"textContent",()=>I18n.t('Navegador · ')+agent.name);
 if(browserSession){renderBrowserFrame(browserSession);return}
 browserShowSetup(true);browserStatus(I18n.t('Cargando entornos y navegadores…'));
 try{
  const owner=browserOwner,generation=browserGeneration;
  const [snapshot,list]=await Promise.all([browserRPC('snapshot'),browserRPC('browser.list')]);if(generation!==browserGeneration||owner!==browserOwner)return;
  const roots=browserRoots(agent);
  const environments=(snapshot.environments||[]).filter(e=>roots.includes(e.projectId));browserEnvironments=environments;$('#browser-environment').innerHTML=options(environments);$('#browser-connect').disabled=!environments.length;$('#browser-saved').open=environments.length>0&&!browserDetected?.servers?.length;
  $('#browser-sessions').innerHTML=(list.browsers||[]).filter(s=>s.agentId===owner).map(s=>ht`<button data-browser-session="${esc(s.id)}">${s.recording?'● Grabando · ':''}Continuar ${esc(s.url)}</button>`).join('');
  $('#browser-logins').innerHTML=(snapshot.logins||[]).filter(l=>environments.some(e=>e.id===l.environmentId)&&l.profileId===(agent.profileId||agent.harness)).map(l=>ht`<button data-browser-login="${esc(l.id)}" data-environment="${esc(l.environmentId)}">Controlar ventana de acceso · ${esc(l.account)}</button>`).join('');
  $$('[data-browser-session]').forEach(b=>b.onclick=async()=>{browserSession={id:b.dataset.browserSession};browserLiveSeq=0;await refreshBrowser()});
  $$('[data-browser-login]').forEach(b=>b.onclick=()=>connectBrowser({loginId:b.dataset.browserLogin,environmentId:b.dataset.environment}));
  renderBrowserReferences(list.references||[]);browserStatus('');
  detectFrontends(agent,environments);
 }catch(e){browserStatus(e.message,true)}
}
var browserEnvironments=[];
// Loopback dev servers become one-click entries; nothing is saved until the user opens one.
async function detectFrontends(agent,environments){
 const generation=browserGeneration;$('#browser-detected').innerHTML=ht('<p class="browser-detecting">Buscando servidores locales…</p>');
 try{const result=await browserRPC('browser.detect');if(generation!==browserGeneration)return;browserDetected=result;
  const project=result.projects?.find(p=>p.id===agent.projectId)||result.projects?.[0];
  const servers=(result.servers||[]).slice(0,6);
  const saved=new Set(environments.map(e=>e.origin));
  $('#browser-detected').innerHTML=servers.length?servers.map(s=>ht`<button type="button" class="browser-server" data-server="${esc(s.origin)}" data-project="${esc(s.projectId||agent.projectId)}"><span class="browser-server-dot" aria-hidden="true"></span><strong>${esc(s.origin.replace('http://',''))}</strong><span>${esc(s.title||I18n.t('Sin título'))}</span>${saved.has(s.origin)?ht('<em>Guardado</em>'):''}</button>`).join(''):
   ht`<p class="browser-empty">No hay ningún servidor local respondiendo.${project?.script?ht` Arranca <code>npm run ${esc(project.script.name)}</code>${project.framework?' · '+esc(project.framework):''} en el terminal y vuelve a buscar.`:''}</p><button type="button" id="browser-detect-again">Buscar de nuevo</button>`;
  if(!$('#browser-local-url').value&&project?.ports?.[0])$('#browser-local-url').placeholder='http://localhost:'+project.ports[0];
  $$('[data-server]').forEach(b=>b.onclick=()=>openLocal(b.dataset.server,b.dataset.project));
  const again=$('#browser-detect-again');if(again)again.onclick=()=>detectFrontends(agent,environments);
 }catch(e){$('#browser-detected').innerHTML=ht`<p class="browser-empty">${esc(e.message)}</p>`}
}
async function openLocal(raw,projectId){
 const agent=browserAgent();if(!agent)return;let url;try{url=new URL(raw)}catch{browserStatus(I18n.t('Usa una dirección HTTP o HTTPS.'),true);return}
 if(!['http:','https:'].includes(url.protocol)){browserStatus(I18n.t('Usa una dirección HTTP o HTTPS.'),true);return}
 const project=state.projects.find(p=>p.id===(projectId||agent.projectId))||state.projects.find(p=>p.id===agent.projectId);if(!project){browserStatus(I18n.t('Selecciona un directorio de proyecto activo.'),true);return}
 browserStatus(I18n.t('Abriendo Chromium…'));
 try{let env=browserEnvironments.find(e=>e.origin===url.origin&&e.projectId===project.id);
  if(!env){env=await browserRPC('environment.save',{name:url.host,origin:url.origin,projectId:project.id,projectPath:project.path,healthPath:url.pathname||'/'});browserEnvironments.push(env)}
  await connectBrowser({environmentId:env.id});
 }catch(e){browserStatus(e.message,true)}
}
async function connectBrowser(extra={}){
 $('#browser-connect').disabled=true;browserStatus(I18n.t('Abriendo Chromium…'));const generation=browserGeneration;
 try{const frame=await browserRPC('browser.open',{environmentId:$('#browser-environment').value,...extra});if(generation===browserGeneration){browserLiveSeq=0;renderBrowserFrame(frame)}}catch(e){browserStatus(e.message,true)}finally{$('#browser-connect').disabled=!$('#browser-environment').value}
}
function renderBrowserFrame(frame){
 if(!frame?.image)return;const finished=browserSession?.recordingId&&!frame.recording?browserSession.recordingId:null;
 // Live frames carry no token; keep the last stable token only while it describes the same view.
 browserSession=frame.live?{...frame,frameToken:undefined}:frame;if(finished&&!browserReferencesSeen.has(finished))browserRPC('browser.reference',{referenceId:finished}).catch(e=>browserStatus(e.message,true));
 if(!$('#browser-setup').hidden){browserShowSetup(false);$('#browser-setup-status').textContent=''}
 const image=$('#browser-frame');image.src=frame.image;image.style.aspectRatio=frame.width+'/'+frame.height;
 if(document.activeElement!==$('#browser-address'))$('#browser-address').value=frame.url||'';
 const record=$('#browser-record');record.classList.toggle('is-recording',!!frame.recording);record.innerHTML=icon(frame.recording?'stop':'record');I18n.attribute(record,'aria-label',()=>frame.recording?I18n.t('Terminar y adjuntar la grabación'):I18n.t('Grabar flujo'));
 $('#browser-recording').hidden=!frame.recording;$('#browser-note-form').hidden=!frame.recording;
 I18n.bind($('#browser-recording'),"textContent",()=>frame.recording?I18n.t('Grabando')+' · '+Math.max(0,Math.floor(Date.now()/1000-frame.recordingStartedAt))+' s':'');
 const tabsKey=JSON.stringify(frame.tabs||[]);if(tabsKey!==browserTabsKey){browserTabsKey=tabsKey;const tabs=frame.tabs||[];$('#browser-tabs').hidden=tabs.length<2;$('#browser-tabs').innerHTML=tabs.map(t=>ht`<button type="button" data-browser-tab="${t.index}" aria-current="${t.active?'page':'false'}">${esc(t.url||I18n.t('Nueva pestaña'))}</button>`).join('');$$('[data-browser-tab]').forEach(b=>b.onclick=()=>browserAction('tab',{index:Number(b.dataset.browserTab)}))}
 if(frame.viewport){const preset=Object.entries({desktop:1280,laptop:1440,tablet:834,mobile:390}).find(([,w])=>w===frame.viewport.width)?.[0];if(preset)$$('[data-viewport]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.viewport===preset)))}
 const freeze=$('#browser-freeze');freeze.setAttribute('aria-pressed',String(!!frame.frozen));freeze.innerHTML=icon(frame.frozen?'play':'pause');I18n.attribute(freeze,'aria-label',()=>frame.frozen?I18n.t('Reanudar animaciones'):I18n.t('Pausar animaciones'));
 const issues=Number(frame.issues)||0;$('#browser-issues').hidden=!issues;I18n.bind($('#browser-issues'),"textContent",()=>I18n.count('aviso de la página',issues));
 if(frame.recording&&frame.recordingId)browserRecordings.set(frame.recordingId,{owner:browserOwner,browserId:frame.id});
 if(frame.recordingError)browserStatus(frame.recordingError,true);
 if(typeof annotationsOnFrame==='function')annotationsOnFrame(browserSession);
 browserKick();
}
async function refreshBrowser(){if(!browserSession||browserFrameBusy||browserPane.hidden)return;browserFrameBusy=true;try{const generation=browserGeneration,frame=await browserRPC('browser.frame',{id:browserSession.id});if(generation===browserGeneration&&!browserDrag)renderBrowserFrame(frame)}catch(e){browserStatus(e.message,true)}finally{browserFrameBusy=false}}
// Live view: one long-poll at a time returns the next screencast frame (or nothing after 1.5 s).
function browserKick(){if(!browserLiveRunning&&browserSession&&browserMode==='navigate'&&browserVisible()&&!document.hidden&&native)browserLive()}
async function browserLive(){
 browserLiveRunning=true;const generation=browserGeneration;
 try{while(generation===browserGeneration&&browserSession&&browserMode==='navigate'&&browserVisible()&&!document.hidden){
  try{const frame=await browserRPC('browser.live',{id:browserSession.id,since:browserLiveSeq});if(generation!==browserGeneration||browserMode!=='navigate')break;
   if(frame.seq)browserLiveSeq=frame.seq;if(frame.image&&!browserDrag)renderBrowserFrame(frame);else if(frame.unchanged&&typeof annotationsOnFrame==='function')annotationsOnFrame({...browserSession,...frame,image:browserSession.image})}
  catch(e){browserStatus(e.message,true);await new Promise(r=>setTimeout(r,1500))}
 }}finally{browserLiveRunning=false}
}
function browserAction(action,extra={}){
 const generation=browserGeneration,id=browserSession?.id;if(!id)return Promise.resolve();
 browserRequestChain=browserRequestChain.catch(()=>{}).then(async()=>{if(generation!==browserGeneration)return;try{const frame=await browserRPC('browser.action',{id,action,frameToken:browserSession?.frameToken,...extra});if(generation===browserGeneration)renderBrowserFrame(frame)}catch(e){browserStatus(e.message,true)}});return browserRequestChain;
}
function browserPoint(event){const r=$('#browser-frame').getBoundingClientRect();return {x:Math.max(0,Math.min(browserSession.width-1,(event.clientX-r.left)*browserSession.width/r.width)),y:Math.max(0,Math.min(browserSession.height-1,(event.clientY-r.top)*browserSession.height/r.height))}}
function browserBox(box){const image=$('#browser-frame'),r=image.getBoundingClientRect(),stage=$('#browser-stage').getBoundingClientRect();return {left:r.left-stage.left+box.x*r.width/browserSession.width,top:r.top-stage.top+box.y*r.height/browserSession.height,width:box.width*r.width/browserSession.width,height:box.height*r.height/browserSession.height}}
function browserSelection(box,kind){const el=$('#browser-selection');el.hidden=!box;el.dataset.kind=kind||'';if(box){const b=browserBox(box);el.style.left=b.left+'px';el.style.top=b.top+'px';el.style.width=b.width+'px';el.style.height=b.height+'px'}if(!box)browserHoverLabel(null)}
// The element name follows the pointer, 8 px above it and kept inside the page.
function browserHoverLabel(component){
 const el=$('#browser-hover');if(!component||!browserPointer){el.hidden=true;return}
 const source=component.framework?.source,file=source?.file?String(source.file).split('/').slice(-2).join('/')+(source.line?':'+source.line:''):'',chain=(component.framework?.components||[]).slice(-3).join(' › ');
 $('#browser-hover-name').textContent=component.name||component.tag||'';$('#browser-hover-source').textContent=file||chain;$('#browser-hover-source').hidden=!(file||chain);el.hidden=false;
 const stage=$('#browser-stage').getBoundingClientRect(),w=el.offsetWidth,h=el.offsetHeight;
 el.style.left=Math.min(Math.max(8,browserPointer.x-w/2),stage.width-w-8)+'px';el.style.top=Math.max(8,browserPointer.y-h-12)+'px';
}
const browserModeHint={annotate:()=>I18n.t('Haz clic en un elemento o arrastra para marcar un área'),text:()=>I18n.t('Arrastra sobre el texto que quieres corregir'),region:()=>I18n.t('Haz clic en un componente o arrastra una región para adjuntarla')};
function setBrowserMode(mode){
 const previous=browserMode;browserMode=mode;browserSelection(null);browserPane.dataset.mode=mode;$$('[data-browser-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.browserMode===mode)));
 const open=mode!=='navigate',dock=$('#browser-dock');dock.dataset.open=String(open);$('#browser-dock-toggle').setAttribute('aria-expanded',String(open));$('#browser-dock-toggle').innerHTML=icon(open?'close':'launcher');I18n.attribute($('#browser-dock-toggle'),'aria-label',()=>open?I18n.t('Volver a navegar'):I18n.t('Anotar la página'));$('#browser-dock-toggle').dataset.key=open?'Esc':'A';
 if(!open)browserSettings(false);if(previous!==mode&&browserModeHint[mode])browserStatus(browserModeHint[mode]());if(mode==='navigate')$('#browser-status').hidden=true;
 $('#browser-frame').focus({preventScroll:true});
 if(typeof annotationsModeChanged==='function')annotationsModeChanged(mode);
 // Selection tools work on a stable frame: the live view pauses until the user navigates again.
 if(mode!=='navigate'&&previous==='navigate'&&browserSession&&native)refreshBrowser();if(mode==='navigate')browserKick();
}
function browserSettings(open){const panel=$('#browser-settings');panel.hidden=!open;$('#browser-settings-toggle').setAttribute('aria-pressed',String(open))}
$$('[data-browser-mode]').forEach(b=>b.onclick=()=>setBrowserMode(browserMode===b.dataset.browserMode&&b.dataset.browserMode!=='annotate'?'annotate':b.dataset.browserMode));
$('#browser-dock-toggle').onclick=()=>{if(!browserSession)return;if(browserMode==='navigate')setBrowserMode('annotate');else{if(typeof annotationsCancel==='function')annotationsCancel();setBrowserMode('navigate')}};
$('#browser-settings-toggle').onclick=()=>browserSettings($('#browser-settings').hidden);
$('#browser-settings-environments').onclick=()=>openOperations('environments');
$('#browser-connect').onclick=()=>connectBrowser();$('#browser-environments').onclick=()=>openOperations('environments');
$('#browser-local-form').onsubmit=e=>{e.preventDefault();openLocal($('#browser-local-url').value||$('#browser-local-url').placeholder)};
$('#browser-hide').onclick=()=>{browserWanted=false;updateBrowserVisibility()};
$('#browser-close').onclick=async()=>{if(!browserSession){browserWanted=false;updateBrowserVisibility();return}try{await browserRPC('browser.close',{id:browserSession.id});browserSession=null;browserWanted=false;browserGeneration++;setBrowserMode('navigate');updateBrowserVisibility()}catch(e){browserStatus(e.message,true)}};
$('#browser-address-form').onsubmit=e=>{e.preventDefault();browserAction('navigate',{url:$('#browser-address').value})};$('#browser-back').onclick=()=>browserAction('back');$('#browser-reload').onclick=()=>browserAction('reload');
$$('[data-viewport]').forEach(b=>b.onclick=()=>browserAction('viewport',{preset:b.dataset.viewport}));
$('#browser-freeze').onclick=()=>browserAction('freeze',{on:$('#browser-freeze').getAttribute('aria-pressed')!=='true'});
$('#browser-note-form').onsubmit=async e=>{e.preventDefault();const text=$('#browser-note').value.trim();if(!text||!browserSession)return;try{const r=await browserRPC('browser.record.note',{id:browserSession.id,text});$('#browser-note').value='';browserStatus(I18n.count('nota en la grabación',r.notes||1))}catch(err){browserStatus(err.message,true)}};
$('#browser-record').onclick=async()=>{
 if(!browserSession)return;const button=$('#browser-record'),generation=browserGeneration;button.disabled=true;
 try{const stopping=browserSession.recording,result=await browserRPC(stopping?'browser.record.stop':'browser.record.start',{id:browserSession.id});if(generation!==browserGeneration)return;browserSession={...browserSession,...result,recording:!stopping};
  if(!stopping&&browserMode!=='navigate')setBrowserMode('navigate');renderBrowserFrame(browserSession);browserStatus(stopping?I18n.t('Grabación adjunta al borrador del chat'):I18n.t('Grabando · máximo 5 minutos'));if(stopping)await loadBrowserReferences()}catch(e){browserStatus(e.message,true)}finally{button.disabled=false}
};
async function captureBrowser(point,extra={}){const generation=browserGeneration;try{await browserRPC('browser.capture',{id:browserSession.id,frameToken:browserSession.frameToken,kind:extra.width?'region':'component',...point,...extra});if(generation===browserGeneration){setBrowserMode('annotate');browserStatus(I18n.t('Referencia adjunta al borrador del chat'));await loadBrowserReferences()}}catch(e){browserStatus(e.message,true)}finally{browserSelection(null)}}
const browserPickModes=['region','annotate'],browserDragThreshold=8;
function browserInspectHover(p){clearTimeout(browserHoverTimer);const generation=browserGeneration;browserHoverTimer=setTimeout(async()=>{try{const r=await browserRPC('browser.inspect',{id:browserSession.id,frameToken:browserSession.frameToken,...p});if(generation===browserGeneration&&browserPickModes.includes(browserMode)&&!browserDrag?.moved&&r.component){browserSelection({...r.component.bounds,x:r.component.bounds.x+r.component.offset.x,y:r.component.bounds.y+r.component.offset.y},'hover');browserHoverLabel(r.component)}}catch{}},90)}
function browserStagePoint(e){const s=$('#browser-stage').getBoundingClientRect();return {x:e.clientX-s.left,y:e.clientY-s.top}}
$('#browser-frame').onpointerdown=e=>{if(!browserSession||e.button!==0)return;e.preventDefault();$('#browser-frame').focus({preventScroll:true});if(browserMode==='navigate')return;if(!browserSession.frameToken){browserStatus(I18n.t('Preparando la selección…'));return}
 browserDrag={...browserPoint(e),client:{x:e.clientX,y:e.clientY},moved:false,token:browserSession.frameToken};e.target.setPointerCapture(e.pointerId)};
$('#browser-frame').onpointermove=e=>{
 if(!browserSession)return;const p=browserPoint(e);browserPointer=browserStagePoint(e);
 if(browserDrag){if(!browserDrag.moved&&Math.hypot(e.clientX-browserDrag.client.x,e.clientY-browserDrag.client.y)<browserDragThreshold&&browserMode!=='text')return;browserDrag.moved=true;clearTimeout(browserHoverTimer);$('#browser-hover').hidden=true;
  browserSelection({x:Math.min(p.x,browserDrag.x),y:Math.min(p.y,browserDrag.y),width:Math.abs(p.x-browserDrag.x),height:Math.abs(p.y-browserDrag.y)},browserMode==='annotate'?'area':browserMode);return}
 if(browserPickModes.includes(browserMode)&&browserSession.frameToken&&$('#annotation-popover')?.hidden!==false)browserInspectHover(p);
};
$('#browser-frame').onpointerleave=()=>{if(!browserDrag){clearTimeout(browserHoverTimer);if($('#annotation-popover')?.hidden!==false)browserSelection(null)}};
$('#browser-frame').onpointerup=e=>{if(!browserSession)return;const p=browserPoint(e);
 if(browserMode==='navigate'){if(e.button===0)browserAction('click',p);return}
 const from=browserDrag;browserDrag=null;if(!from)return;
 if(from.moved){const box={x:Math.min(from.x,p.x),y:Math.min(from.y,p.y),width:Math.abs(from.x-p.x),height:Math.abs(from.y-p.y)};
  if(browserMode==='region')captureBrowser({x:box.x,y:box.y},{width:box.width,height:box.height});else if(typeof annotationsCompose==='function')annotationsCompose({kind:browserMode==='text'?'text':'region',...box});return}
 if(browserMode==='region')captureBrowser(p);else if(browserMode==='annotate'&&typeof annotationsPick==='function')annotationsPick(p,e.shiftKey||e.metaKey||e.ctrlKey)};
$('#browser-frame').onpointercancel=()=>{browserDrag=null;browserSelection(null)};
$('#browser-frame').onwheel=e=>{if(!browserSession)return;e.preventDefault();browserAction('wheel',{dx:e.deltaX,dy:e.deltaY})};
$('#browser-frame').onkeydown=e=>{if(e.key==='Escape'&&browserMode!=='navigate'){e.preventDefault();browserEscape();return}if(browserMode!=='navigate'){if(!e.metaKey&&!e.ctrlKey&&browserShortcut(e))e.preventDefault();return}if(e.metaKey&&e.key==='Enter')return;if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='v')return;e.preventDefault();if(e.key.length===1&&!e.metaKey&&!e.ctrlKey&&!e.altKey)browserAction('text',{text:e.key});else{const key=(e.metaKey?"Meta+":'')+(e.ctrlKey?"Control+":'')+(e.altKey?"Alt+":'')+(e.shiftKey?"Shift+":'')+e.key;if(/(?:Enter|Tab|Escape|Backspace|Delete|Arrow\w+|Home|End|PageUp|PageDown|[acvxz])$/.test(key))browserAction('key',{key})}};
$('#browser-frame').onpaste=e=>{e.preventDefault();if(browserMode==='navigate')browserAction('text',{text:e.clipboardData.getData('text/plain')})};
// Esc unwinds one layer at a time: settings, the note being written, the selection, then the dock.
function browserEscape(){if(!$('#browser-settings').hidden){browserSettings(false);return}if(typeof annotationsEscape==='function'&&annotationsEscape())return;browserDrag=null;setBrowserMode('navigate')}
// Single-key tools apply when focus is outside the page and outside text fields (the page receives typing).
function browserShortcut(e){if(!browserSession)return false;const key=e.key.toLowerCase(),mode={a:'annotate',t:'text',c:'region',n:'navigate'}[key];if(mode){setBrowserMode(mode);return true}
 const click={p:'#browser-freeze',h:'#annotation-markers-toggle',l:'#annotation-rail-toggle',r:'#browser-record',x:'#annotation-clear'}[key];if(click){const b=$(click);if(b&&!b.disabled)b.click();return true}return false}
document.addEventListener('keydown',e=>{
 if(e.metaKey&&e.shiftKey&&e.key.toLowerCase()==='b'){e.preventDefault();if(browserVisible()){browserWanted=false;updateBrowserVisibility()}else openBrowser();return}
 if(!browserVisible()||e.metaKey||e.ctrlKey||e.altKey||e.target===$('#browser-frame')||e.target.closest?.('input,textarea,select,[contenteditable],dialog'))return;
 if(e.key==='Escape'&&browserMode!=='navigate'){e.preventDefault();browserEscape();return}
 if(browserShortcut(e))e.preventDefault();
});
async function loadBrowserReferences(){try{const generation=browserGeneration,result=await browserRPC('browser.list');if(generation===browserGeneration)renderBrowserReferences(result.references||[])}catch(e){browserStatus(e.message,true)}}
function renderBrowserReferences(references){
 const label=r=>({recording:'▶ ',annotations:'◎ '})[r.kind]||'';
 $('#browser-references').innerHTML=references.length?ht('<h3>Referencias guardadas</h3>')+references.slice(0,8).map(r=>ht`<button type="button" data-browser-reference="${esc(r.id)}" title="Adjuntar de nuevo">${label(r)}${esc(r.name)}${r.duration?' · '+Math.round(r.duration)+' s':''}</button>`).join(''):'';
 $$('[data-browser-reference]').forEach(b=>b.onclick=()=>browserRPC('browser.reference',{referenceId:b.dataset.browserReference}).catch(e=>browserStatus(e.message,true)));
}
// The splitter gives the terminal more or less room next to the page; the width is remembered.
browserSplitter.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();browserSplitter.setPointerCapture(e.pointerId);document.body.classList.add('browser-resizing');
 const move=ev=>{const width=Math.round(Math.max(360,Math.min(window.innerWidth-480,window.innerWidth-ev.clientX)));$('#inspector').style.setProperty('--panel-width',width+'px');localStorage.setItem('islands.browserTerminalWidth',String(width))};
 const up=()=>{browserSplitter.removeEventListener('pointermove',move);document.body.classList.remove('browser-resizing');if(typeof fitTerminal==='function')fitTerminal()};
 browserSplitter.addEventListener('pointermove',move);browserSplitter.addEventListener('pointerup',up,{once:true})};
browserSplitter.onkeydown=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const current=$('#inspector').getBoundingClientRect().width,width=Math.round(Math.max(360,Math.min(window.innerWidth-480,current+(e.key==='ArrowLeft'?40:-40))));$('#inspector').style.setProperty('--panel-width',width+'px');localStorage.setItem('islands.browserTerminalWidth',String(width));if(typeof fitTerminal==='function')fitTerminal()};
// Visual references use the same per-agent composer draft as images.
const browserRenderAttachments=renderAttachments;
renderAttachments=function(){browserRenderAttachments();const el=$('#composer-attachments');I18n.attribute(el,'aria-label',()=>I18n.t('Referencias e imágenes adjuntas'));for(const item of el.querySelectorAll('.composer-image')){const id=item.querySelector('[data-remove]')?.dataset.remove,a=composerAttachments.find(a=>a.id===id);if(!a?.visual)continue;item.classList.add('composer-reference');const open=document.createElement('button');open.type='button';open.className='reference-open';I18n.bind(open,"textContent",()=>(({recording:'▶ ',annotations:'◎ '})[a.kind]||'')+a.name);I18n.bind(open,"title",()=>I18n.t('Ver referencia'));open.onclick=()=>send('visualReferenceOpen',{referenceId:a.id});item.append(open)}};
const browserSelectAgent=selectAgent;selectAgent=function(id){browserSelectAgent(id);updateBrowserVisibility()};
const browserBackToTeam=backToTeam;backToTeam=function(){browserBackToTeam();updateBrowserVisibility()};
const browserSwitchComposer=switchComposerAgent;
switchComposerAgent=function(id){browserSwitchComposer(id);updateBrowserVisibility()};
// The terminal deck and the expanded terminal hide the page canvas, so the browser steps aside.
const browserSetView=setView;setView=function(next){if(next!=='world')browserWanted=false;browserSetView(next);updateBrowserVisibility()};
const browserExpand=$('#expand-terminal').onclick;$('#expand-terminal').onclick=()=>{if(!document.body.classList.contains('terminal-expanded'))browserWanted=false;browserExpand();updateBrowserVisibility()};
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
  browserReferencesSeen.add(data.id);browserRecordings.delete(data.id);toast(I18n.t('Referencia añadida al borrador.'));
 }
 if(event==='promptAccepted')visualSendDrafts.delete(data.requestId);
 if(event==='promptRejected'&&visualSendDrafts.has(data.requestId)){
  const draft=visualSendDrafts.get(data.requestId);visualSendDrafts.delete(data.requestId);
  if(terminalTarget()===draft.owner){if(!$('#prompt').value)$('#prompt').value=draft.text;for(const a of draft.attachments)if(!composerAttachments.some(b=>b.id===a.id))composerAttachments.push(a);renderAttachments()}
  else{const saved=composerDrafts.get(draft.owner)||{text:'',attachments:[]};if(!saved.text)saved.text=draft.text;for(const a of draft.attachments)if(!saved.attachments.some(b=>b.id===a.id))saved.attachments.push(a);composerDrafts.set(draft.owner,saved)}
 }
};
setInterval(async()=>{for(const [id,record] of browserRecordings){if(!state.agents.some(a=>a.id===record.owner))continue;try{const result=await browserRPC('browser.list',{agentId:record.owner});if(result.references?.some(r=>r.id===id))await browserRPC('browser.reference',{agentId:record.owner,referenceId:id})}catch{}}},6000);
setInterval(browserKick,1500);document.addEventListener('visibilitychange',browserKick);
if(preview&&!native&&query.get('screen')==='browser'){
 const agent=state.agents.find(a=>a.managed&&['codex','claude'].includes(a.harness))||state.agents.find(a=>['codex','claude'].includes(a.harness));if(agent){agent.managed=true;agent.processRunning=true;selectAgent(agent.id);browserOwner=terminalTarget();browserWanted=true;updateBrowserVisibility();I18n.bind($('#browser-heading'),"textContent",()=>I18n.t('Navegador · Portal de clientes'));
 const fixture=ht('<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800"><rect width="1280" height="800" fill="#faf8f3"/><rect width="1280" height="88" fill="#e9eee5"/><g font-family="Arial" fill="#29382b"><text x="64" y="54" font-size="28">Portal de clientes</text><text x="64" y="196" font-size="44">Tu equipo, listo para empezar.</text><text x="64" y="246" font-size="24">Invita a las personas con las que vas a trabajar.</text><rect x="64" y="310" width="520" height="220" rx="24" fill="#e4ecdf"/><text x="96" y="364" font-size="28">Acceso al equipo</text><rect x="96" y="410" width="240" height="64" rx="16" fill="#42664e"/><text x="128" y="451" font-size="24" fill="white">Invitar a una persona</text></g></svg>');
 renderBrowserFrame({id:'preview-browser',image:'data:image/svg+xml;base64,'+btoa(fixture),width:1280,height:800,url:'https://portal.ejemplo.com/equipo',frameToken:'preview',recording:false,issues:2,viewport:{width:1280,height:800},scroll:{x:0,y:0},tabs:[{index:0,url:I18n.t('Portal · Equipo'),active:true}]});
 if(query.get('state')==='empty'){browserSession=null;browserShowSetup(true);$('#browser-detected').innerHTML=ht('<button type="button" class="browser-server"><span class="browser-server-dot" aria-hidden="true"></span><strong>localhost:5173</strong><span>Portal de clientes · Vite</span></button><button type="button" class="browser-server"><span class="browser-server-dot" aria-hidden="true"></span><strong>localhost:6006</strong><span>Storybook</span><em>Guardado</em></button>')}
 if(query.get('state')==='loading'){browserShowSetup(true);$('#browser-detected').innerHTML='';browserStatus(I18n.t('Abriendo Chromium…'))}
 if(query.get('state')==='error')browserStatus(I18n.t('El navegador no respondió. Actualiza para volver a conectar.'),true);
 $('#toast').hidden=true;
 }
}
