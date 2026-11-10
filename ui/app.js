'use strict';
function agentSignal(a){return agentControl(a).signal}
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths = {
  leaf:'M19 4C8 3 3 8 6 15c3 6 12 4 13-11ZM5 20 15 10M9 16l-1-5m3 3 5 1',
  bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  volume:'M11 4 5 9H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
  refresh:'M20 7v5h-5M4 17v-5h5M5 7a8 8 0 0 1 13-2l2 3M4 16l2 3a8 8 0 0 0 13-2',
  bot:'M6 8h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2ZM12 8V4m-2-2h4M8 13h.01M16 13h.01M9 17h6M1 12v4m22-4v4',
  claude:'m12 2 1 6 5-4-3 6 7 1-7 2 4 5-6-3-2 7-1-7-6 4 3-6-6-2 7-1-4-5 6 3Z',
  codex:'m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18',
  plan:'M4 3h13l3 3v15H4ZM8 8h5M8 12h8M8 16h5m1-14v5h5',
  goal:'M21 12a9 9 0 1 1-9-9M17 12a5 5 0 1 1-5-5M12 12 22 2m-5 0h5v5',
  work:'m14 5 5-3 3 3-3 5-4 1-9 10-3-3 10-9Z',
  check:'m5 12 4 4L19 6',
  eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  attention:'M12 3 2 21h20ZM12 9v5m0 3h.01',
  arrow:'m9 5 7 7-7 7',
  back:'m14 5-7 7 7 7',
  expand:'M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5',
  stop:'M6 6h12v12H6Z',
  mic:'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0ZM5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8',
  send:'m5 12 7-7 7 7M12 5v15',
  folder:'M3 5h7l2 3h9v12H3Z',
  file:'M5 2h9l5 5v15H5Zm9 0v6h5',
  up:'m5 14 7-7 7 7',
  docker:'M3 10h4v4H3Zm5 0h4v4H8Zm5 0h4v4h-4ZM8 5h4v4H8Zm5 0h4v4h-4ZM2 15h17c3 0 3-3 3-3M2 15c0 4 3 6 7 6s8-2 9-6',
  island:'m3 16 5-4 4 1 4-5 5 7-7 5H7ZM8 12V7m-2 2 2-4 2 4',
  plus:'M12 5v14M5 12h14',
  link:'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7',
  close:'m6 6 12 12M18 6 6 18',
  search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6'
  ,shield:'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6ZM4 3l16 18'
};
const icon = name => ht`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.bot}"/></svg>`;
const stateIcon = a => agentControl(a).icon;
const stateText = a => agentControl(a).label;
const hasGoal=a=>a.mode==='goal'||!!a.goalStatus||!!a.goalObjective;
const goalLabel=a=>agentControl(a).goalLabel;
const goalRank=a=>!hasGoal(a)?0:needsAttention(a)?5:agentControl(a).working?4:normalizedGoalStatus(a.goalStatus)==='active'?3:normalizedGoalStatus(a.goalStatus)==='complete'?1:2;
let state = {projects:[],agents:[],binaries:{},docker:{connected:false,containers:[],status:'checking'},native:false,voice:false,notifications:false};
let selected = null, fileProject = null, filePath = '', currentFile = null, dirty = false, view = 'world', filter = 'all';
let mounts = [], worldSignature = '', terminal, fitAddon, toastTimer;
let briefProject = null, draftContext = null, briefSignature = '';
let sessionCatalog=[], sessionRequest=0, sessionLoading=false, launchPending=false, sessionFallback=false, pickerSelection=null;
const dockerPending=new Set();
let macCatalog=[],catalogLoading=false;
const deckTerminals = new Map();
const contextPrompts = {
  get status(){return I18n.t('¿Cómo vamos con el encargo actual? Dime en un máximo de 5 líneas: qué está terminado, en qué estás ahora, qué falta y si necesitas una decisión mía. Informa sobre el contexto de esta sesión; no inicies trabajo nuevo ni ejecutes herramientas solo para responder.')},
  get recap(){return I18n.t('Resúmeme la situación para retomar este proyecto después de haber estado en otra tarea. Usa el contexto de esta conversación y distingue hechos comprobados de pendientes. Indica objetivo, lo hecho, estado actual, bloqueos o decisiones y siguiente paso. Máximo 8 líneas. No inicies trabajo nuevo ni ejecutes herramientas solo para responder.')}
};
const timeText = value => {
  if(!value)return I18n.t('Sin fecha registrada');
  const seconds=Math.max(0,Math.round(Date.now()/1000-value));
  return seconds<60?I18n.t('hace un momento'):seconds<3600?tr`hace ${Math.floor(seconds/60)} min`:seconds<86400?tr`hace ${Math.floor(seconds/3600)} h`:I18n.count('days.ago',Math.floor(seconds/86400));
};
function contextEvidence(a){
  const recap=!!a.contextResponse&&(a.contextAt || 0)>=(a.responseAt || 0)&&(a.contextAt || 0)>=(a.taskAt || 0);
  const text=recap?a.contextResponse:a.lastResponse,at=recap?a.contextAt:a.responseAt;
  return {text,at,label:at&&a.taskAt&&at<a.taskAt?I18n.t('Respuesta de un encargo anterior'):recap?I18n.t('Último resumen'):I18n.t('Última respuesta')};
}
const query = new URLSearchParams(location.search), preview = query.get('preview') === '1';
const native = !!window.webkit?.messageHandlers?.native;
function send(action, data = {}) {
  if (native) window.webkit.messageHandlers.native.postMessage({action,...data});
  else if (action === 'select') showPreviewTerminal(data.id);
  else if (action === 'mode') { const a = state.agents.find(a=>a.id===data.id); if(a){a.mode=data.mode;render()} }
  else if (['ready','resize','replay'].includes(action)) return;
  else toast(I18n.t('Disponible en la aplicación de macOS.'));
}
function toast(text) { I18n.bind($('#toast'),"textContent",()=>text); $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(()=>$('#toast').hidden=true,6500); }
function reportDirty(){send('dirty',{dirty})}
window.receiveNative = ({event,data}) => {
  if(event === 'snapshot') { state = data; render(); if(typeof renderSituation==='function')renderSituation(); }
  if(event==='launchProjectSelected'&&$('#launch-dialog').open){refreshLaunchProjects(data.projectId);if($('#launch-mode').value==='resume')loadSavedSessions()}
  if(event==='catalog'){macCatalog=data.sessions;catalogLoading=false;if($('#search-dialog').open)searchAgents()}
  if(event==='resumeReady'){if($('#search-dialog').open)$('#search-dialog').close();launchDialog(data.projectId,data.harness,data.profileId);pickerSelection=data.sessionId;$('#launch-mode').value='resume';$('#session-all-projects').checked=true;updateLaunchHarness()}
  if(event === 'error') toast(data.message);
  if(event === 'dockerActionResult'){dockerPending.delete(data.id);renderDocker();toast(data.success?I18n.t('Docker actualizado.'):data.message || I18n.t('Docker no pudo completar la acción.'))}
  if(event === 'savedSessions'&&data.requestId===sessionRequest&&data.projectId===$('#launch-project').value&&data.harness===$('#launch-harness').value&&(data.profileId || data.harness)===$('#launch-profile').value){sessionLoading=false;sessionCatalog=data.sessions;sessionFallback=!!data.globalFallback;if(sessionFallback)$('#session-all-projects').checked=true;renderSessionOptions()}
  if(event === 'launchResult'){
    launchPending=false;updateLaunchSubmit();
    if(data.success){$('#launch-dialog').close();requestAnimationFrame(()=>terminal?.focus())}
    else{I18n.bind($('#launch-error'),"textContent",()=>data.message || I18n.t('No se pudo abrir el agente.'));$('#launch-error').hidden=false}
  }
  if(event === 'promptRejected'){
    if(data.id===terminalTarget()){const typed=$('#prompt').value.trim();$('#prompt').value=!typed||typed===data.text.trim()?data.text:data.text+'\n\n'+$('#prompt').value;persistDraft(data.id,$('#prompt').value);draftContext={kind:data.contextKind,text:data.text};I18n.bind($('#composer-hint'),"textContent",()=>I18n.t('Borrador conservado · espera al final del turno'))}
    toast(data.message);
  }
  if(event === 'select') selectAgent(data.id);
  if(event === 'terminal') {
    if(data.id === terminalTarget()) writeBytes(data.bytes);
    const entry=deckTerminals.get(data.id);if(entry)entry.term.write(decodeBytes(data.bytes));
  }
  if(event === 'terminalReplay') {const entry=deckTerminals.get(data.id);if(entry){entry.term.reset();entry.term.write(decodeBytes(data.bytes))}}
  if(event === 'terminalReset' && data.id === terminalTarget()) { ensureTerminal(); terminal.reset(); writeBytes(data.bytes); requestAnimationFrame(()=>fitTerminal()); }
  if(event === 'attention' && data.id !== selected) { I18n.bind($('#global-status'),"textContent",()=>data.message); }
  if(event === 'files' && data.projectId === fileProject) renderFiles(data);
  if(event === 'file' && data.projectId === fileProject) {
    if(dirty && !confirm(I18n.t('Tienes cambios sin guardar. ¿Descartarlos y abrir este archivo?'))) return;
    currentFile = data; dirty = false; reportDirty(); $('#code').disabled = false; $('#code').value = data.text; I18n.bind($('#file-name'),"textContent",()=>data.path); $('#save-file').disabled = true; updateLineNumbers(); I18n.bind($('#file-status'),"textContent",()=>'UTF-8');
  }
  if(event === 'saved' && currentFile?.path === data.path) { currentFile.revision = data.revision; currentFile.text = $('#code').value; dirty = false; reportDirty(); $('#save-file').disabled=true; I18n.bind($('#file-name'),"textContent",()=>data.path); I18n.bind($('#file-status'),"textContent",()=>I18n.t('Guardado')); }
  if(event === 'dockerLogs') { $('#container-logs').hidden=false; I18n.bind($('#container-logs'),"textContent",()=>data.text || I18n.t('Sin logs.')); }
  if(event === 'dictation') handleDictation(data);
  if(event === 'intelligenceResult') acceptIntelligence(data);
  if(event === 'skills') {skillCatalog=data.skills;renderComposerMenu()}
  if(event === 'attachment') {if(data.owner&&data.owner!==selected){const draft=composerDrafts.get(data.owner)||{text:'',attachments:[]};draft.attachments.push(data);composerDrafts.set(data.owner,draft)}else{composerAttachments.push(data);renderAttachments()}}
};
function render() {
  const attention = state.agents.filter(a=>needsAttention(a));
  I18n.bind($('#attention-count'),"textContent",()=>attention.length);
  I18n.bind($('#goals-count'),"textContent",()=>state.agents.filter(hasGoal).length);
  I18n.bind($('#team-count'),"textContent",()=>state.agents.length);
  $('#world-counts').innerHTML = ht`<span>${icon('island')}<b>${state.projects.length}</b> ${I18n.t(state.projects.length===1?'isla':'islas')}</span><span>${icon('bot')}<b>${state.agents.length}</b> ${I18n.t(state.agents.length===1?'agente':'agentes')}</span>`;
  I18n.bind($('#global-status'),"textContent",()=>I18n.count('session.count',state.agents.filter(a=>a.managed && (a.processRunning ?? !['exited','error'].includes(a.state))).length)+' · '+I18n.count('attention.count',attention.length));
  $('#connection-status').innerHTML = ht`<span class="state-dot"></span>${state.native ? I18n.t('Conectado a tu Mac') : preview ? I18n.t('Vista de diseño') : I18n.t('Abre la aplicación de macOS')}`;
  I18n.bind($('#preview-label'),"textContent",()=>preview ? I18n.t('Datos de ejemplo') : '');
  $('#notifications').classList.toggle('enabled',!!state.notifications);
  $('#voice').classList.toggle('enabled',!!state.voice);
  I18n.attribute($('#notifications'),'aria-label',()=>state.notifications?I18n.t('Desactivar avisos'):I18n.t('Activar avisos'));
  I18n.attribute($('#voice'),'aria-label',()=>state.voice?I18n.t('Desactivar voz'):I18n.t('Activar voz'));
  $('#attention-list').innerHTML = attention.map(a=>ht`<button class="attention-card" data-agent="${esc(a.id)}"><span>${icon('attention')}</span><span class="attention-copy"><strong>${esc(a.name)}</strong><small>${esc(a.message || I18n.t('Tu decisión desbloquea el siguiente paso'))}</small></span></button>`).join('');
  $('#team-list').innerHTML = state.agents.length ? state.agents.map(agentButton).join('') : ht('<p class="team-empty">Añade una isla y abre tu primer agente.</p>');
  $('#team-view').querySelectorAll('[data-agent]').forEach(b=>b.onclick=()=>selectAgent(b.dataset.agent));
  const projectOptions = state.projects.map(p=>ht`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  if($('#file-project').innerHTML !== projectOptions) { $('#file-project').innerHTML = projectOptions; if(!state.projects.some(p=>p.id===fileProject)) fileProject = state.projects[0]?.id; $('#file-project').value = fileProject || ''; }
  renderWorld();
  if(selected) updateAgent();
  if(!$('#docker-view').hidden) renderDocker();
  if(view==='terminals')renderTerminalDeck();
  if($('#project-dialog').open)renderProjectBrief();
}
function agentButton(a) {
  const project = state.projects.find(p=>p.id===a.projectId);
  return ht`<button class="team-agent ${esc(a.state)} signal-${agentSignal(a)}" data-agent="${esc(a.id)}" title="${esc(a.name+' · '+stateText(a))}"><span class="avatar ${esc(a.harness)}">${icon(a.harness==='claude'?'claude':a.harness==='codex'?'codex':'bot')}</span><span class="team-agent-copy"><strong>${esc(a.name)}</strong><small>${esc(project?.name || '')}${a.parentId ? I18n.t(" · subagente") : a.managed ? '' : I18n.t(" · externo")}</small></span>${icon(stateIcon(a))}</button>`;
}
function renderWorld() {
  const focused=selected&&view==='world'&&!$('#agent-view').hidden?state.agents.find(a=>a.id===selected)?.projectId:null;
  document.body.classList.toggle('agent-focused',!!focused);
  if(typeof renderCheckpoints==='function')renderCheckpoints();
  // Update state in place so new events never reset the scene's animation clock.
  for(const ctx of mounts){
    let changed=false;
    for(const record of ctx.parts?.records || []){
      const next=ctx.parts.docker?state.docker?.containers?.find(a=>a.id===record.id):state.agents.find(a=>a.id===record.id);
      if(next){changed ||= ['state','stateAt','goalStatus','goalUpdatedAt','tokenBudget','tokensUsed'].some(k=>record[k]!==next[k]);Object.assign(record,next)}
    }
    if(changed&&matchMedia('(prefers-reduced-motion: reduce)').matches)ctx.stillFrame();
  }
  refreshIslandSignals();
  const signature = JSON.stringify([focused,state.projects,state.agents.map(a=>[a.id,a.name,a.harness,a.mode,hasGoal(a),filter==='attention'?needsAttention(a):null]),state.docker?.connected,state.docker?.containers?.map(c=>[c.id,c.name,c.image,c.state]),filter,query.get('state')]);
  if(signature === worldSignature) return; worldSignature = signature;
  mounts.forEach(m=>m.destroy()); mounts=[];Diorama.figures.splice(0);
  const world = $('#world'), oldScroll = world.scrollTop; world.replaceChildren();
  const forcedState = query.get('state');
  if(forcedState === 'loading') { world.innerHTML=ht('<div class="empty-world"><h2>El mundo se despierta…</h2><p>Conectando con los procesos de tu Mac.</p></div>'); return; }
  if(forcedState === 'error') { world.innerHTML=ht('<div class="empty-world"><h2>No se pudo conectar.</h2><p>Actualiza para volver a buscar tus agentes.</p><button class="primary" id="retry">Volver a conectar</button></div>'); $('#retry').onclick=()=>send('scan'); return; }
  let projects = forcedState==='empty' ? [] : state.projects;
  if(focused)projects=projects.filter(p=>p.id===focused);
  if(!focused&&filter==='attention') projects=projects.filter(p=>state.agents.some(a=>a.projectId===p.id&&needsAttention(a)));
  if(!focused&&filter==='goals') projects=projects.filter(p=>state.agents.some(a=>a.projectId===p.id&&hasGoal(a)));
  projects=[...projects].sort((a,b)=>Math.max(0,...state.agents.filter(x=>x.projectId===b.id).map(goalRank))-Math.max(0,...state.agents.filter(x=>x.projectId===a.id).map(goalRank)));
  if(!focused&&filter==='docker') projects=[];
  if(!projects.length && filter!=='docker') {
    const empty=document.createElement('div'); empty.className='empty-world'; empty.innerHTML=ht`<div class="scene" id="empty-scene"></div><h2>${filter==='attention'?I18n.t('Todo está en calma.'):filter==='goals'?I18n.t('Tu próximo objetivo empieza aquí.'):I18n.t('Un lugar para tus ideas.')}</h2><p>${filter==='attention'?I18n.t('Tu equipo no tiene decisiones pendientes.'):filter==='goals'?I18n.t('Los goals conectados tendrán su propio observatorio.'):I18n.t('Cada proyecto, una isla. Cada agente, un habitante.')}</p>${filter==='attention'||filter==='goals'?'':ht('<button class="primary" id="first-island">Añadir mi primera isla ＋</button>')}`; world.append(empty);
    mounts.push(Diorama.mount(workshopFigure({name:I18n.t('Tu próximo taller')},99,[],()=>{}),{el:$('#empty-scene')}));
    $('#first-island')?.addEventListener('click',()=>send('addProject'));
  }
  projects.forEach((project,i)=>addIsland(project,i,state.agents.filter(a=>a.projectId===project.id),!!focused));
  if(!state.activeWorkspaceId&&!focused&&filter!=='attention'&&filter!=='goals'&&forcedState!=='empty') addDockerIsland();
  world.scrollTop=oldScroll;
}
function addIsland(project,index,agents,focused=false) {
  const tile=document.createElement('article');tile.className='island';tile.dataset.projectId=project.id;I18n.attribute(tile,'aria-label',()=>project.name);
  const waiting=agents.filter(a=>needsAttention(a));
  tile.innerHTML=ht`${waiting.length?ht`<button class="island-callout" title="Abrir decisión pendiente">${icon('attention')}${waiting.length>1?waiting.length+I18n.t(" te necesitan"):I18n.t('Te necesito')}</button>`:''}<div class="scene" aria-label="Taller de ${esc(project.name)}"></div><div class="island-caption"><button class="project-button" title="Retomar ${esc(project.name)}">${esc(project.name)}${icon('arrow')}</button><button class="new-agent" title="Añadir agente a ${esc(project.name)}" aria-label="Añadir agente a ${esc(project.name)}">＋</button></div><div class="island-agents">${agents.length?agents.slice(0,6).map(a=>ht`<button class="agent-chip ${esc(a.state)} signal-${agentSignal(a)}" data-agent="${esc(a.id)}" title="${esc(a.name+' · '+stateText(a))}">${icon(stateIcon(a))}${esc(a.name.split(' · ')[0])}</button>`).join('')+(agents.length>6?ht`<button class="agent-chip more-agents">+${agents.length-6}</button>`:''):ht('<span class="muted">Taller disponible</span>')}</div>`;
  $('#world').append(tile);
  if(agents.some(hasGoal)){
    const strip=document.createElement('div');strip.className='island-goals';
    strip.innerHTML=agents.filter(hasGoal).map(a=>goalChip(a)).join('');tile.append(strip);
    strip.querySelectorAll('[data-goal-agent]').forEach(b=>b.onclick=()=>selectAgent(b.dataset.goalAgent));
  }
  tile.querySelector('.project-button').onclick=()=>openProjectBrief(project.id);
  tile.querySelector('.new-agent').onclick=()=>launchDialog(project.id);
  tile.querySelector('.island-callout')?.addEventListener('click',()=>selectAgent(waiting[0].id));
  tile.querySelectorAll('[data-agent]').forEach(b=>b.onclick=()=>selectAgent(b.dataset.agent));
  tile.querySelector('.more-agents')?.addEventListener('click',()=>{openSearch();$('#agent-search').value=project.name;searchAgents()});
  const figure=workshopFigure(project,index,agents,selectAgent);
  if(focused)figure.camera={...figure.camera,pad:.85};
  mounts.push(Diorama.mount(figure,{el:tile.querySelector('.scene')}));
}
function goalChip(a){
  const remaining=goalBudgetRemaining(a),used=remaining===null?null:1-remaining;
  const title=(a.goalObjective || I18n.t('Etiqueta visual de Goal'))+(used===null?'':tr` · ${Math.round(used*100)}% del presupuesto de tokens consumido`);
  return ht`<button class="goal-chip ${esc(normalizedGoalStatus(a.goalStatus) || '')}" data-goal-agent="${esc(a.id)}" title="${esc(title)}">${icon('goal')}<span>${esc(goalLabel(a))}</span>${used===null?'':ht`<meter min="0" max="1" value="${used}" aria-label="${esc(Math.round(used*100)+I18n.t('% del presupuesto de tokens consumido; no es progreso del objetivo'))}"></meter>`}</button>`;
}
function refreshIslandSignals(){
  $$('.island[data-project-id]').forEach(tile=>{
    const agents=state.agents.filter(a=>a.projectId===tile.dataset.projectId),waiting=agents.filter(a=>needsAttention(a));
    const old=tile.querySelector('.island-callout');
    if(waiting.length){
      const button=old || document.createElement('button');button.className='island-callout';I18n.bind(button,"title",()=>I18n.t('Abrir decisión pendiente'));
      button.innerHTML=icon('attention')+(waiting.length>1?waiting.length+I18n.t(" te necesitan"):I18n.t('Te necesito'));button.onclick=()=>selectAgent(waiting[0].id);if(!old)tile.prepend(button);
    }else old?.remove();
    tile.querySelector('.island-agents').innerHTML=agents.length?agents.slice(0,6).map(a=>ht`<button class="agent-chip ${esc(a.state)} signal-${agentSignal(a)}" data-agent="${esc(a.id)}" title="${esc(a.name+' · '+stateText(a))}">${icon(stateIcon(a))}${esc(a.name.split(' · ')[0])}</button>`).join('')+(agents.length>6?ht`<button class="agent-chip more-agents">+${agents.length-6}</button>`:''):ht('<span class="muted">Taller disponible</span>');
    tile.querySelectorAll('[data-agent]').forEach(b=>b.onclick=()=>selectAgent(b.dataset.agent));
    tile.querySelector('.more-agents')?.addEventListener('click',()=>{openSearch();$('#agent-search').value=state.projects.find(p=>p.id===tile.dataset.projectId)?.name || '';searchAgents()});
    const strip=tile.querySelector('.island-goals');if(strip){strip.innerHTML=agents.filter(hasGoal).map(goalChip).join('');strip.querySelectorAll('[data-goal-agent]').forEach(b=>b.onclick=()=>selectAgent(b.dataset.goalAgent))}
  });
}
function addDockerIsland() {
  const containers=state.docker?.containers || [], running=containers.filter(c=>c.state==='running');
  const tile=document.createElement('article');tile.className='island docker-island';I18n.attribute(tile,'aria-label',()=>I18n.t('Puerto Docker'));
  tile.innerHTML=ht`<div class="scene"></div><div class="island-caption"><button class="project-button">Puerto Docker ${icon('arrow')}</button><span class="count">${running.length}</span></div><div class="island-agents"><button class="agent-chip">${icon('docker')}${state.docker?.connected ? running.length+I18n.t(' en marcha') : state.docker?.status==='checking' ? I18n.t('Conectando…') : I18n.t('Desconectado')}</button>${containers.length>running.length?ht`<span class="agent-chip">${containers.length-running.length} detenidos</span>`:''}</div>`;
  $('#world').append(tile);tile.querySelectorAll('button').forEach(b=>b.onclick=openDocker);
  mounts.push(Diorama.mount(workshopFigure({name:'Docker'},98,containers,id=>{openDocker();if(id){const row=[...document.querySelectorAll('[data-logs]')].find(b=>b.dataset.logs===id)?.closest('.container-row');row?.scrollIntoView({block:'nearest'});row?.classList.add('container-selected')}},true),{el:tile.querySelector('.scene')}));
}
function selectAgent(id) {
  const a=state.agents.find(a=>a.id===id);if(!a)return;
  if(view==='terminals')setView('world');
  if(selected!==id){switchComposerAgent(id);draftContext=null;send('skills',{projectId:a.projectId})}
  selected=id;briefProject=null;$('#team-view').hidden=true;$('#docker-view').hidden=true;$('#agent-view').hidden=false;$('#inspector').classList.add('has-agent');
  renderWorld();
  updateAgent();ensureTerminal();fitTerminal();currentQuestionSafeReset();send('select',{id});if(typeof aiResults!=='undefined'&&aiResults)renderSituation();
}
function currentQuestionSafeReset(){if(typeof questionBar!=='undefined'){questionBar.hidden=true;questionJump.hidden=true;currentQuestion=null}}
function terminalTarget() { const a=state.agents.find(a=>a.id===selected);return a?.parentId || selected; }
function updateAgent() {
  const a=state.agents.find(a=>a.id===selected);if(!a){backToTeam();return}
  const controlled=a.managed||!!a.parentId;
  I18n.bind($('#agent-name'),"textContent",()=>a.name);I18n.bind($('#agent-project'),"textContent",()=>[state.projects.find(p=>p.id===a.projectId)?.name,a.profileName,a.workspaceName].filter(Boolean).join(' · '));
  $('#agent-state').innerHTML=`${icon(stateIcon(a))} ${esc(stateText(a))}`;
  $('#agent-permissions').hidden=!a.bypassPermissions&&!a.permissionsInherited;
  $('#agent-permissions').innerHTML=icon(a.permissionsInherited?'link':'shield')+(a.permissionsInherited?I18n.t('Permisos heredados'):I18n.t('Bypass'));
  I18n.bind($('#agent-permissions'),"title",()=>a.permissionsInherited?I18n.t('Conectado al servidor que conserva los permisos de la conversación'):I18n.t('Esta sesión se lanzó con bypass permissions'));
  $('#agent-state').style.display='inline-flex';$('#agent-state').style.alignItems='center';$('#agent-state').style.gap='var(--space-2)';
  $$('#mode-controls button').forEach(b=>b.classList.toggle('selected',b.dataset.mode===(a.mode || 'work')));
  $('#stop-agent').hidden=!a.managed;$('#composer').hidden=!controlled;$('.terminal-keys').hidden=!controlled;$('#terminal-host').hidden=!controlled;
  const alive=a.processRunning ?? !['exited','error'].includes(a.state);
  $('#send').disabled=!alive;$('#prompt').disabled=!alive;$('#mic').disabled=!alive;
  $('#agent-reconnect').hidden=!a.managed||alive;
  I18n.bind($('#agent-connection'),"textContent",()=>controlled?(alive?I18n.t('Terminal conectada'):I18n.t('Sin conexión')):I18n.t('Agente externo'));
  $('#reopen-agent').onclick=()=>{launchDialog(a.projectId,a.harness,a.profileId);if(['codex','claude'].includes(a.harness)){$('#launch-mode').value='resume';pickerSelection=a.threadId || null;updateLaunchHarness()}};$('#listen-agent').disabled=!a.message;
  const evidence=contextEvidence(a),response=evidence.text,responseAt=evidence.at;
  $('#agent-summary').hidden=!response;
  $('#agent-summary').innerHTML=response?ht`<details><summary>${evidence.label} · ${esc(timeText(responseAt))}</summary><p>${esc(response)}</p><small>${esc(a.harness)} · conversación original</small></details>`:'';
  $('#context-actions').hidden=false;
  $$('#context-actions button').forEach(b=>b.disabled=false);
  $('#last-task').hidden=!a.lastTask;
  $('#last-task').innerHTML=a.lastTask?ht`<details><summary>Último encargo · ${esc(timeText(a.taskAt))}</summary><p>${esc(a.lastTask)}</p></details>`:'';
  $('#goal-detail').hidden=!a.goalObjective;
  if(a.goalObjective){
    I18n.bind($('#goal-objective'),"textContent",()=>a.goalObjective);
    I18n.bind($('#goal-label'),"textContent",()=>goalLabel(a));
    const used=a.tokensUsed || 0,budget=a.tokenBudget;
    I18n.bind($('#goal-tokens'),"textContent",()=>budget ? used.toLocaleString(I18n.locale)+' / '+budget.toLocaleString(I18n.locale)+I18n.t(" tokens consumidos") : used.toLocaleString(I18n.locale)+I18n.t(" tokens consumidos"));
    $('#goal-budget').hidden=!budget;$('#goal-budget').max=budget || 1;$('#goal-budget').value=Math.min(used,budget || used);
  }
  $('#external-notice').hidden=controlled;
  if(!controlled) renderExternalGoal(a);
  $('#agent-view').dataset.signal=agentSignal(a);
  I18n.bind($('#composer-hint'),"textContent",()=>a.parentId?I18n.t('Mensaje a la terminal del agente principal'):draftContext?I18n.t('Consulta preparada · ⌘↵ para enviar'):I18n.t('⌘↵ para enviar'));
}
function backToTeam() { selected=null;$('#team-view').hidden=false;$('#agent-view').hidden=true;$('#docker-view').hidden=true;$('#inspector').classList.remove('has-agent');document.body.classList.remove('terminal-expanded');renderWorld();if(typeof aiResults!=='undefined'&&aiResults){briefProject=null;renderSituation()} }
function ensureTerminal() {
  if(terminal)return;
  const css=getComputedStyle(document.documentElement),c=n=>css.getPropertyValue(n).trim();
  terminal=new Terminal({cursorBlink:false,fontFamily:'"JetBrains Mono", Menlo, monospace',fontSize:12,lineHeight:1.35,scrollback:6000,allowProposedApi:false,theme:{background:c('--terminal-bg'),foreground:c('--terminal-fg'),cursor:c('--terminal-green'),selectionBackground:c('--terminal-selection'),black:c('--terminal-bg'),red:c('--terminal-red'),green:c('--terminal-green'),yellow:c('--terminal-yellow'),blue:c('--terminal-blue'),magenta:c('--terminal-magenta'),cyan:c('--terminal-cyan'),white:c('--terminal-fg'),brightBlack:c('--terminal-dark'),brightWhite:c('--terminal-bright')}});
  fitAddon=new FitAddon.FitAddon();terminal.loadAddon(fitAddon);terminal.open($('#terminal-surface'));
  terminal.onData(text=>send('input',{id:terminalTarget(),text}));
  terminal.onResize(({cols,rows})=>send('resize',{id:terminalTarget(),cols,rows}));
  terminal.attachCustomKeyEventHandler(e=>!(e.metaKey && ['1','2','k','s'].includes(e.key.toLowerCase())));
  new ResizeObserver(()=>fitTerminal()).observe($('#terminal-host'));
}
function fitTerminal(){if(view!=='terminals'&&terminal&&!$('#terminal-host').hidden&&$('#terminal-host').clientWidth>0)try{fitAddon.fit();send('resize',{id:terminalTarget(),cols:terminal.cols,rows:terminal.rows})}catch{}}
function decodeBytes(base64){const raw=atob(base64);return Uint8Array.from(raw,c=>c.charCodeAt(0))}
var terminalFollowUntil=0;
function scrollTerminalToBottom(){terminalFollowUntil=Date.now()+1800;terminal?.scrollToBottom();requestAnimationFrame(()=>terminal?.scrollToBottom())}
function writeBytes(base64){if(terminal){const follow=Date.now()<terminalFollowUntil;terminal.write(decodeBytes(base64),()=>{if(follow)terminal.scrollToBottom();if(typeof scheduleQuestionUpdate==='function')scheduleQuestionUpdate()})}}
function showPreviewTerminal(id){if(!preview)return;ensureTerminal();terminal.reset();terminal.writeln(I18n.t('\x1b[32mVista de diseño · terminal de ejemplo\x1b[0m\r\n\r\nEn la app verás aquí la terminal real del harness.\r\n\r\nLos permisos se responden directamente en esta terminal.'));}
function setView(next){if(dirty&&next!==view&&!confirm(I18n.t('Tienes cambios sin guardar. ¿Cambiar de vista?')))return;view=next;$('#world-view').hidden=next!=='world';$('#files-view').hidden=next!=='files';$('#terminals-view').hidden=next!=='terminals';document.body.classList.toggle('terminals-view',next==='terminals');$$('[data-view]').forEach(b=>b.classList.toggle('selected',b.dataset.view===next));if(next==='files'&&fileProject)send('listFiles',{projectId:fileProject,path:filePath});if(next==='terminals')renderTerminalDeck();document.body.classList.remove('terminal-expanded');renderWorld();requestAnimationFrame(()=>{if(next==='terminals')fitDeck();else fitTerminal()})}
function openProject(id){if(dirty&&!confirm(I18n.t('¿Descartar los cambios del archivo abierto?')))return;dirty=false;reportDirty();currentFile=null;fileProject=id;filePath='';$('#file-project').value=id;$('#code').value='';$('#code').disabled=true;I18n.bind($('#file-name'),"textContent",()=>I18n.t('Abre un archivo'));$('#save-file').disabled=true;setView('files')}
function refreshLaunchProjects(projectId){
  $('#launch-project').innerHTML=state.projects.map(p=>ht`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  $('#launch-project').value=state.projects.some(p=>p.id===projectId)?projectId:state.projects[0]?.id || '';
  const project=state.projects.find(p=>p.id===$('#launch-project').value);
  $('#project-search').value=project?.name || '';I18n.bind($('#launch-project-path'),"textContent",()=>project?.path || I18n.t('Elige una carpeta o reanuda una conversación guardada.'));
  $('#project-suggestions').hidden=true;$('#project-search').setAttribute('aria-expanded','false');$('#project-search').removeAttribute('aria-activedescendant');
  updateLaunchSubmit();
}
function launchDialog(projectId,harness,profileId){
  refreshLaunchProjects(projectId);
  const names={codex:'Codex',claude:'Claude Code',gemini:I18n.t('Gemini CLI'),opencode:I18n.t('OpenCode'),aider:I18n.t('Aider'),goose:I18n.t('Goose'),hermes:I18n.t('Hermes')};
  $('#launch-harness').innerHTML=Object.keys(state.binaries).filter(n=>n!=='docker').map(n=>ht`<option value="${esc(n)}">${esc(names[n] || n)}</option>`).join('')+ht('<option value="shell">Terminal zsh</option><option value="custom">Otro harness…</option>');
  if(harness&&state.binaries[harness])$('#launch-harness').value=harness;
  sessionRequest++;sessionCatalog=[];sessionLoading=false;launchPending=false;
  $('#launch-name').value='';$('#launch-mode').value='new';$('#session-search').value='';$('#session-all-projects').checked=true;sessionFallback=false;pickerSelection=null;$('#launch-details').open=false;$('#bypass-permissions').checked=false;$('#launch-error').hidden=true;
  renderLaunchProfiles(profileId);updateLaunchHarness();$('#launch-dialog').showModal();
}
function renderLaunchProfiles(preferred){
 const harness=$('#launch-harness').value,select=$('#launch-profile'),previous=preferred || select.value;
 const profiles=(state.profiles || []).filter(p=>p.harness===harness);
 select.innerHTML=(profiles.length?profiles:[{id:harness,name:harness==='claude'?'Claude Code':'Codex'}]).map(p=>ht`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
 if([...select.options].some(p=>p.value===previous))select.value=previous;
 $('#launch-profile-field').hidden=!['claude','codex'].includes(harness);
}
function updateLaunchHarness(){
  renderLaunchProfiles();
  const h=$('#launch-harness').value,supported=h==='codex'||h==='claude';
  $$('[data-launch-mode]').forEach(b=>{const active=b.dataset.launchMode===$('#launch-mode').value;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active))});
  $('#custom-fields').hidden=h!=='custom';$('#conversation-fields').hidden=!supported;$('#launch-permissions').hidden=!supported;
  if(!supported){$('#launch-mode').value='new';$('#bypass-permissions').checked=false}
  $('#saved-session-fields').hidden=!supported||$('#launch-mode').value!=='resume';
  updateBypassDescription();
  if(supported&&$('#launch-mode').value==='resume')loadSavedSessions();else{sessionRequest++;sessionLoading=false;updateLaunchSubmit()}
}
function updateBypassDescription(){
  const inherited=$('#launch-harness').value==='codex'&&$('#launch-mode').value==='resume'&&(state.profiles?.find(p=>p.id===$('#launch-profile').value)?.sharedServer ?? state.codexSharedServer);
  $('#bypass-permissions').disabled=!!inherited;$('#bypass-permissions').hidden=!!inherited;
  if(inherited)$('#bypass-permissions').checked=false;
  I18n.bind($('#bypass-title'),"textContent",()=>inherited?I18n.t('Permisos de la conversación'):I18n.t('Bypass permissions'));
  const checked=$('#bypass-permissions').checked;
  I18n.bind($('#bypass-description'),"textContent",()=>inherited?I18n.t('Se conservan los permisos de la sesión al reconectar.'):!checked?I18n.t('Permisos según la configuración del harness.'):$('#launch-harness').value==='codex'?I18n.t('Sin confirmaciones ni sandbox en esta sesión.'):I18n.t('Omite confirmaciones en esta sesión.'));
  $('#launch-permissions').classList.toggle('bypass-selected',checked);
}
function loadSavedSessions(){
  const harness=$('#launch-harness').value;if(!['codex','claude'].includes(harness))return;
  const requestId=++sessionRequest;sessionLoading=true;sessionFallback=false;sessionCatalog=[];$('#launch-error').hidden=true;renderSessionOptions();
  if(preview&&!native){
    const p=state.projects.find(p=>p.id===$('#launch-project').value) || {id:'',path:'/tmp/example'};
    receiveNative({event:'savedSessions',data:{requestId,projectId:p.id,harness,sessions:[{id:'01900000-0000-7000-8000-000000000001',harness,title:I18n.t('Construir Agent Islands y coordinar los agentes'),projectPath:p.path,updatedAt:Date.now()/1000-180,inUse:false},{id:'01900000-0000-7000-8000-000000000002',harness,title:I18n.t('Revisar el plan de autenticación'),projectPath:p.path,updatedAt:Date.now()/1000-7200,inUse:false}]}});
  }else send('listSessions',{projectId:$('#launch-project').value,harness,profileId:$('#launch-profile').value,requestId,allProjects:$('#session-all-projects').checked});
}
function renderSessionOptions(){
  const select=$('#saved-session'),previous=pickerSelection || select.value,search=$('#session-search').value.toLowerCase().trim();
  let records=sessionCatalog.filter(s=>(s.title+' '+s.projectPath+' '+s.id).toLowerCase().includes(search));
  if(pickerSelection){const chosen=records.find(s=>s.id===pickerSelection);if(chosen)records=[chosen,...records.filter(s=>s!==chosen)]}
  select.innerHTML=records.map(s=>ht`<option value="${esc(s.id)}" ${s.inUse?'disabled':''}>${esc(s.title)} · ${esc(timeText(s.updatedAt))}${s.inUse?I18n.t(' · abierta en Islands'):''}</option>`).join('');
  if(records.some(s=>s.id===previous&&!s.inUse))select.value=previous;
  else select.value=records.find(s=>!s.inUse)?.id || '';
  select.disabled=sessionLoading||!records.length;
  renderConversationRows(records);if(!sessionLoading)pickerSelection=null;
  I18n.bind($('#saved-session-status'),"textContent",()=>sessionLoading?I18n.t('Buscando conversaciones locales…'):records.length?tr`${records.length} conversaciones${sessionFallback?(state.activeWorkspaceId?I18n.t(" · ampliado al workspace"):I18n.t(" · ampliado a todo el Mac")):$('#session-all-projects').checked?(state.activeWorkspaceId?I18n.t(' · en este workspace'):I18n.t(' · en tu Mac')):I18n.t(' · en esta isla')}`:search?I18n.t('No hay conversaciones con ese nombre.'):I18n.t('No se han podido encontrar conversaciones locales. Actualiza para volver a buscar.'));
  updateSessionFolder();updateLaunchSubmit();
}
function renderConversationRows(records){
  const list=$('#session-results');
  if(sessionLoading){list.innerHTML=ht('<div class="picker-state" role="status"><span class="picker-spinner"></span>Buscando en tu Mac…</div>');return}
  if(!records.length){list.innerHTML=ht`<div class="picker-state">${icon('search')}<strong>${$('#session-search').value?I18n.t('Sin coincidencias'):I18n.t('Aún no hay conversaciones')}</strong><span>${$('#session-search').value?I18n.t('Prueba otro nombre o proyecto.'):I18n.t('Actualiza la lista o abre un nuevo agente.')}</span></div>`;return}
  list.innerHTML=records.slice(0,80).map(s=>ht`<button type="button" role="option" tabindex="-1" id="session-row-${esc(s.id)}" class="session-result" data-session="${esc(s.id)}" aria-selected="${s.id===$('#saved-session').value}" ${s.inUse?'disabled':''}><span class="result-avatar ${esc(s.harness)}">${icon(s.harness==='claude'?'claude':'codex')}</span><span class="result-copy"><strong>${esc(s.title || I18n.t('Conversación sin título'))}</strong><small>${esc(s.projectPath.split('/').filter(Boolean).at(-1))} <span>· ${esc(s.profileName || (s.harness==='claude'?'Claude Code':'Codex'))}</span></small></span><span class="result-time">${s.inUse?I18n.t('Abierta aquí'):esc(timeText(s.updatedAt))}</span><span class="result-check">${icon('check')}</span></button>`).join('');
  list.querySelectorAll('[data-session]').forEach(b=>b.onclick=()=>chooseSession(b.dataset.session));
  updatePickerActive();
}
function updatePickerActive(){
  const id=$('#saved-session').value;
  $$('#session-results [data-session]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.session===id)));
  for(const e of [$('#session-search'),$('#session-results')]){if(id)e.setAttribute('aria-activedescendant','session-row-'+id);else e.removeAttribute('aria-activedescendant')}
}
function chooseSession(id){$('#saved-session').value=id;updatePickerActive();updateSessionFolder();updateLaunchSubmit()}
function pickerKeys(e){
  if(!['ArrowDown','ArrowUp','Enter'].includes(e.key))return;
  e.preventDefault();const rows=$$('#session-results [data-session]:not(:disabled)');if(!rows.length)return;
  let index=rows.findIndex(b=>b.dataset.session===$('#saved-session').value);
  if(e.key!=='Enter')index=Math.max(0,Math.min(rows.length-1,index+(e.key==='ArrowDown'?1:-1)));
  chooseSession(rows[Math.max(0,index)].dataset.session);rows[Math.max(0,index)].scrollIntoView({block:'nearest'});
}
function showProjectSuggestions(){
  const input=$('#project-search'),term=input.value.toLocaleLowerCase().trim();
  const records=state.projects.filter(p=>(p.name+' '+p.path).toLocaleLowerCase().includes(term)).slice(0,12);
  const list=$('#project-suggestions');list.hidden=false;input.setAttribute('aria-expanded','true');
  list.innerHTML=records.length?records.map((p,i)=>ht`<button type="button" role="option" tabindex="-1" id="project-option-${i}" data-project="${esc(p.id)}" aria-selected="${p.id===$('#launch-project').value}">${icon('folder')}<span><strong>${esc(p.name)}</strong><small>${esc(p.path)}</small></span></button>`).join(''):ht('<div class="picker-state">No hay directorios activos con ese nombre. Elige otra carpeta.</div>');
  list.querySelectorAll('[data-project]').forEach(b=>b.onclick=()=>chooseProjectSuggestion(b.dataset.project));
}
function chooseProjectSuggestion(id){
  const p=state.projects.find(p=>p.id===id);if(!p)return;
  refreshLaunchProjects(id);
  if($('#launch-mode').value==='resume')loadSavedSessions();
}
function updateSessionFolder(){
  const record=sessionCatalog.find(s=>s.id===$('#saved-session').value);
  $('#session-folder').hidden=!record;
  $('#session-folder').innerHTML=record?ht`${icon('folder')}<span><strong>${esc(record.projectPath.split('/').filter(Boolean).at(-1) || record.projectPath)}</strong><small>${esc(record.projectPath)}</small></span><span class="session-harness">${esc(record.harness==='claude'?'Claude Code':'Codex')}</span>`:'';
  I18n.bind($('#session-folder'),"title",()=>record?.projectPath || '');
}
function updateLaunchSubmit(){
  const resume=$('#launch-mode').value==='resume';
  $('#launch-submit').disabled=launchPending||(resume?(sessionLoading||!$('#saved-session').value):!state.projects.some(p=>p.id===$('#launch-project').value));
  I18n.bind($('#launch-submit'),"textContent",()=>launchPending?I18n.t('Abriendo…'):resume?I18n.t('Reanudar conversación ↗'):I18n.t('Abrir agente ↗'));
}
function openDocker(){selected=null;$('#team-view').hidden=true;$('#agent-view').hidden=true;$('#docker-view').hidden=false;$('#inspector').classList.add('has-agent');renderWorld();renderDocker()}
function renderDocker(){
  const docker=state.docker || {},allContainers=docker.containers || [],needle=$('#container-search').value.toLocaleLowerCase().trim(),containers=allContainers.filter(c=>(c.name+' '+c.image+' '+c.project+' '+c.ports).toLocaleLowerCase().includes(needle)).sort((a,b)=>Number(b.state==='running')-Number(a.state==='running'));
  I18n.bind($('#docker-status'),"textContent",()=>docker.connected?allContainers.filter(c=>c.state==='running').length+I18n.t(' en marcha · ')+allContainers.length+' contenedores':I18n.t('Sin conexión al motor Docker'));
  $('#container-list').innerHTML=containers.length?containers.map(c=>{
    const ports=[...new Set([...c.ports.matchAll(/:(\d+)->/g)].map(m=>m[1]))];
    return ht`<article class="container-row ${c.state==='running'?'':'stopped'}"><div class="container-title"><span class="state-dot"></span><strong title="${esc(c.name)}">${esc(c.name)}</strong></div><div class="container-image">${esc(c.image)}</div><details><summary class="muted">${esc(c.status)}</summary><p>${esc(c.ports || I18n.t('Sin puertos publicados'))}</p>${c.project?ht`<p>${esc(c.project)}</p>`:''}</details><div class="container-actions">${ports.map(port=>ht`<button data-port="${esc(port)}" data-id="${esc(c.id)}">:${esc(port)} ↗</button>`).join('')}<button data-logs="${esc(c.id)}">Logs</button>${(c.state==='running'?['stop','restart']:['start']).map(op=>ht`<button data-docker-action="${op}" data-container="${esc(c.id)}" ${dockerPending.has(c.id)?'disabled':''}>${icon(op==='stop'?'stop':op==='restart'?'refresh':'send')}${({start:I18n.t('Arrancar'),stop:I18n.t('Parar'),restart:I18n.t('Reiniciar')})[op]}</button>`).join('')}</div></article>`;
  }).join(''):ht`<p class="team-empty">${docker.connected?(needle?I18n.t('No hay contenedores con ese nombre.'):I18n.t('No hay contenedores en este contexto.')):I18n.t('Abre Docker Desktop y actualiza el puerto.')}</p>`;
  $$('[data-docker-action]').forEach(b=>b.onclick=()=>{const id=b.dataset.container,operation=b.dataset.dockerAction;if(dockerPending.has(id))return;dockerPending.add(id);renderDocker();send('dockerAction',{id,operation})});
  $$('[data-port]').forEach(b=>b.onclick=()=>send('openPort',{id:b.dataset.id,port:b.dataset.port}));
  $$('[data-logs]').forEach(b=>b.onclick=()=>{$('#container-logs').hidden=false;I18n.bind($('#container-logs'),"textContent",()=>I18n.t('Cargando logs…'));send('dockerLogs',{id:b.dataset.logs})});
}
function renderFiles(data){filePath=data.path;I18n.bind($('#tree-path'),"textContent",()=>'/'+data.path);$('#file-list').innerHTML=data.entries.map(f=>ht`<button data-path="${esc(f.path)}" data-dir="${f.directory}" title="${esc(f.name)}">${icon(f.directory?'folder':'file')}${esc(f.name)}</button>`).join('');$$('#file-list button').forEach(b=>b.onclick=()=>send(b.dataset.dir==='true'?'listFiles':'readFile',{projectId:fileProject,path:b.dataset.path}))}
function updateLineNumbers(){const code=$('#code');I18n.bind($('#line-numbers'),"textContent",()=>Array.from({length:Math.min(60000,code.value.split('\n').length)},(_,i)=>i+1).join('\n'));$('#line-numbers').scrollTop=code.scrollTop}
function saveFile(){if(!currentFile||!dirty)return;send('saveFile',{projectId:fileProject,path:currentFile.path,text:$('#code').value,revision:currentFile.revision})}
function openSearch(){
  $('#search-dialog').showModal();$('#agent-search').value='';catalogLoading=true;searchAgents();send('catalog');$('#agent-search').focus();
  if(preview&&!native){macCatalog=state.projects.flatMap((p,i)=>[{id:'01900000-0000-7000-8000-00000000000'+(i+1),harness:i%2?'claude':'codex',title:[I18n.t('Construir Agent Islands'),I18n.t('Preparar la flota de agentes'),I18n.t('Diseñar el campus')][i],projectPath:p.path,updatedAt:Date.now()/1000-i*3600}]);catalogLoading=false;searchAgents()}
}
function searchAgents(){
  const term=$('#agent-search').value.toLocaleLowerCase().trim();
  const agents=state.agents.filter(a=>(a.name+' '+a.harness+' '+(state.projects.find(p=>p.id===a.projectId)?.name || '')).toLocaleLowerCase().includes(term));
  const records=macCatalog.filter(s=>(s.title+' '+s.projectPath+' '+s.harness+' '+(s.profileName || '')+' '+s.id).toLocaleLowerCase().includes(term));
  I18n.bind($('#catalog-status'),"textContent",()=>tr`${state.agents.filter(a=>a.state!=='exited').length} agentes ${state.activeWorkspaceId?I18n.t('en este workspace'):'detectados'} · ${catalogLoading?I18n.t("leyendo conversaciones…"):macCatalog.length+I18n.t(" conversaciones guardadas")}`);
  $('#search-results').innerHTML=(agents.length?ht`<h3 class="search-section">Agentes en las islas</h3>${agents.slice(0,10).map(agentButton).join('')}`:'')+(records.length?ht`<h3 class="search-section">Conversaciones guardadas</h3>${records.slice(0,20).map(s=>ht`<button type="button" class="catalog-result" data-catalog-id="${esc(s.id)}" data-harness="${esc(s.harness)}" data-profile-id="${esc(s.profileId || s.harness)}" ${s.inUse?'disabled':''}><span class="result-avatar ${esc(s.harness)}">${icon(s.harness==='claude'?'claude':'codex')}</span><span class="result-copy"><strong>${esc(s.title || I18n.t('Conversación sin título'))}</strong><small>${esc(s.projectPath.split('/').filter(Boolean).at(-1))} · ${esc(s.profileName || (s.harness==='claude'?'Claude Code':'Codex'))}</small></span><span class="result-time">${s.inUse?I18n.t('Abierta aquí'):esc(timeText(s.updatedAt))}</span>${icon('arrow')}</button>`).join('')}`:'')+(!agents.length&&!records.length?ht`<div class="picker-state">${icon('search')}<strong>${catalogLoading?I18n.t('Buscando en tu Mac…'):I18n.t('Sin coincidencias')}</strong></div>`:'');
  $$('#search-results [data-agent]').forEach(b=>b.onclick=()=>{$('#search-dialog').close();selectAgent(b.dataset.agent)});
  $$('#search-results [data-catalog-id]').forEach(b=>b.onclick=()=>send('prepareResume',{harness:b.dataset.harness,profileId:b.dataset.profileId,sessionId:b.dataset.catalogId}));
}


function prepareContext(kind,id=selected){ if(id)briefProject=null; if($('#project-dialog').open)$('#project-dialog').close(); requestIslandsAI(kind,id);$('#situation-body').hidden=false;$('#situation-toggle').setAttribute('aria-expanded','true'); }
function openProjectBrief(id){briefProject=id;briefSignature='';if(typeof aiResults!=='undefined'&&aiResults)renderSituation();renderProjectBrief();$('#project-dialog').showModal()}
function renderProjectBrief(){
  const project=state.projects.find(p=>p.id===briefProject);if(!project)return;
  I18n.bind($('#brief-project-name'),"textContent",()=>project.name);
  const agents=state.agents.filter(a=>a.projectId===briefProject);
  const signature=JSON.stringify([project,agents]);if(signature===briefSignature)return;briefSignature=signature;
  $('#project-brief').innerHTML=agents.length?agents.map(a=>{
    const evidence=contextEvidence(a),text=evidence.text,sourceAt=evidence.at;
    const controlled=(a.managed || !!a.parentId)&&a.state!=='exited';
    return ht`<article class="brief-agent" data-slot="agent-context"><div class="brief-agent-heading"><span class="avatar ${esc(a.harness)}">${icon(a.harness==='claude'?'claude':a.harness==='codex'?'codex':'bot')}</span><strong>${esc(a.name)}</strong><span class="brief-state">${icon(stateIcon(a))}${esc(stateText(a))}</span></div>${a.lastTask?ht`<details class="brief-task"><summary>Último encargo · ${esc(timeText(a.taskAt))}</summary><p>${esc(a.lastTask)}</p></details>`:''}${text?ht`<div class="brief-response"><div class="brief-source">${evidence.label} · ${esc(a.harness)} · ${esc(timeText(sourceAt))}</div><p>${esc(text)}</p></div>`:a.goalObjective?ht`<details><summary>Objetivo del goal</summary><p>${esc(a.goalObjective)}</p></details>`:ht`<p class="context-empty">${controlled?I18n.t('Todavía no hay una respuesta guardada.'):I18n.t('Conversación en su terminal original.')}</p>`}${a.pendingContext?ht('<span class="brief-source">Consulta enviada · esperando respuesta del agente</span>'):''}<div class="context-buttons"><button data-context="status" data-agent-id="${esc(a.id)}" ${controlled?'':'disabled'}>${icon('work')}¿Cómo vamos?</button><button data-context="recap" data-agent-id="${esc(a.id)}" ${controlled?'':'disabled'}>${icon('plan')}Recuérdame</button><button class="brief-open" data-open-agent="${esc(a.id)}">Abrir ${icon('arrow')}</button></div></article>`;
  }).join(''):ht('<p class="context-empty">Abre un agente para empezar esta conversación.</p>');
  $$('#project-brief [data-context]').forEach(b=>b.onclick=()=>prepareContext(b.dataset.context,b.dataset.agentId));
  $$('#project-brief [data-open-agent]').forEach(b=>b.onclick=()=>{$('#project-dialog').close();selectAgent(b.dataset.openAgent)});
}
function terminalTheme(){
  const css=getComputedStyle(document.documentElement),c=n=>css.getPropertyValue(n).trim();
  return {background:c('--terminal-bg'),foreground:c('--terminal-fg'),cursor:c('--terminal-green'),selectionBackground:c('--terminal-selection'),black:c('--terminal-bg'),red:c('--terminal-red'),green:c('--terminal-green'),yellow:c('--terminal-yellow'),blue:c('--terminal-blue'),magenta:c('--terminal-magenta'),cyan:c('--terminal-cyan'),white:c('--terminal-fg'),brightBlack:c('--terminal-dark'),brightWhite:c('--terminal-bright')};
}
function renderTerminalDeck(){
  const chooser=$('#terminal-project'),chosen=chooser.value;
  const options=ht('<option value="">Todas las islas</option>')+state.projects.map(p=>ht`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  if(chooser.innerHTML!==options){chooser.innerHTML=options;chooser.value=chosen}
  const agents=state.agents.filter(a=>a.managed&&(!chooser.value||a.projectId===chooser.value));
  const ids=new Set(agents.map(a=>a.id));
  for(const [id,entry] of deckTerminals)if(!ids.has(id)){entry.observer.disconnect();entry.term.dispose();entry.card.remove();deckTerminals.delete(id)}
  $('#terminal-deck .deck-empty')?.remove();
  I18n.bind($('#terminal-board-count'),"textContent",()=>agents.length?I18n.count('conversation.count',agents.length)+' · '+I18n.t('tu espacio de trabajo'):I18n.t('Las sesiones abiertas aquí aparecen juntas.'));
  if(!agents.length){
    const empty=document.createElement('div');empty.className='deck-empty';
    empty.innerHTML=ht`${icon('bot')}<h2>Tu mesa de conversaciones</h2><p>Abre tus agentes aquí para trabajar con sus terminales juntas.</p><button class="primary">Abrir mi primer agente ＋</button>`;
    empty.querySelector('button').onclick=()=>launchDialog(chooser.value);$('#terminal-deck').append(empty);return;
  }
  for(const a of agents){
    let entry=deckTerminals.get(a.id);
    if(!entry){
      const card=document.createElement('article');card.className='terminal-card';card.dataset.agentId=a.id;card.dataset.slot='agent-terminal';
      card.innerHTML=ht`<div class="deck-heading"><span class="avatar ${esc(a.harness)}">${icon(a.harness==='claude'?'claude':a.harness==='codex'?'codex':'bot')}</span><div><strong class="deck-name"></strong><span class="deck-project"></span></div><span class="permission-badge deck-permissions" hidden title="Bypass permissions">${icon('shield')}Bypass</span><span class="deck-state"></span><button class="icon-button deck-expand" title="Abrir conversación" aria-label="Abrir conversación de ${esc(a.name)}">${icon('expand')}</button></div><div class="deck-terminal"><div class="terminal-surface"></div></div><div class="deck-actions"><button data-context="status">¿Cómo vamos?</button><button data-context="recap">Recuérdame</button><span class="deck-time"></span></div>`;
      $('#terminal-deck').append(card);
      const term=new Terminal({fontFamily:'"JetBrains Mono", Menlo, monospace',fontSize:12,lineHeight:1.35,cursorBlink:false,scrollback:6000,theme:terminalTheme()});
      const fit=new FitAddon.FitAddon();term.loadAddon(fit);term.open(card.querySelector('.terminal-surface'));
      term.onData(text=>send('input',{id:a.id,text}));
      term.onResize(({cols,rows})=>{if(view==='terminals')send('resize',{id:a.id,cols,rows})});
      term.attachCustomKeyEventHandler(e=>!(e.metaKey&&['1','2','k','s'].includes(e.key.toLowerCase())));
      const observer=new ResizeObserver(()=>{if(view==='terminals')try{fit.fit()}catch{}});observer.observe(card.querySelector('.deck-terminal'));
      entry={card,term,fit,observer};deckTerminals.set(a.id,entry);
      card.querySelector('.deck-expand').onclick=()=>selectAgent(a.id);
      card.querySelectorAll('[data-context]').forEach(b=>b.onclick=()=>prepareContext(b.dataset.context,a.id));
      if(preview&&!native)term.writeln(I18n.t('\x1b[32mVista de diseño · datos de ejemplo\x1b[0m\r\n\r\nLa terminal interactiva de ')+a.harness+I18n.t(' aparece aquí.'));
      else send('replay',{id:a.id});
    }
    I18n.bind(entry.card.querySelector('.deck-name'),"textContent",()=>a.name);
    I18n.bind(entry.card.querySelector('.deck-project'),"textContent",()=>state.projects.find(p=>p.id===a.projectId)?.name || '');
    entry.card.querySelector('.deck-state').innerHTML=icon(stateIcon(a));
    I18n.bind(entry.card.querySelector('.deck-state'),"title",()=>stateText(a));
    entry.card.querySelector('.deck-permissions').hidden=!a.bypassPermissions&&!a.permissionsInherited;entry.card.querySelector('.deck-permissions').innerHTML=icon(a.permissionsInherited?'link':'shield')+(a.permissionsInherited?I18n.t('Permisos heredados'):I18n.t('Bypass'));
    I18n.bind(entry.card.querySelector('.deck-time'),"textContent",()=>a.responseAt?timeText(a.responseAt):'');
    entry.card.querySelectorAll('[data-context]').forEach(b=>b.disabled=a.processRunning===false||['exited','error'].includes(a.state));
    entry.term.options.disableStdin=a.state==='exited';
  }
  requestAnimationFrame(fitDeck);
}
function fitDeck(){if(view==='terminals')for(const [id,entry] of deckTerminals)try{entry.fit.fit();send('resize',{id,cols:entry.term.cols,rows:entry.term.rows})}catch{}}

// Static chrome is installed once; streaming output never rebuilds a terminal.
$('#agent-summary').insertAdjacentHTML('beforebegin',ht('<div id="context-actions" class="context-buttons"><button data-context="status">¿Cómo vamos?</button><button data-context="recap">Recuérdame</button></div><div id="last-task" hidden></div>'));
$('#mode-controls').insertAdjacentHTML('beforebegin',ht`<span id="agent-permissions" class="permission-badge" hidden title="Esta sesión se lanzó con bypass permissions">${icon('shield')}Bypass</span>`);
$$('#context-actions [data-context]').forEach(b=>b.onclick=()=>prepareContext(b.dataset.context));
$('#agent-summary').insertAdjacentHTML('afterend',ht('<details id="goal-detail" hidden><summary><span id="goal-label">Goal</span></summary><p id="goal-objective"></p><progress id="goal-budget" aria-label="Presupuesto de tokens consumido"></progress><small id="goal-tokens"></small></details>'));
const contextRegion=document.createElement('div');contextRegion.id='agent-context';
$('#last-task').before(contextRegion);for(const id of ['last-task','agent-summary','goal-detail'])contextRegion.append($('#'+id));
document.fonts.ready.then(()=>requestAnimationFrame(()=>{fitTerminal();fitDeck()}));
for(const [selector,name] of Object.entries({'#brand-icon':'island','#leaf-icon':'leaf','#notifications':'bell','#voice':'volume','#settings':'settings','#refresh':'refresh','#back-team':'back','#expand-terminal':'expand','#stop-agent':'stop','#mic':'mic','#send':'send','#listen-agent':'volume','#reveal':'folder','#file-up':'up','#back-docker':'back','#docker-refresh':'refresh'}))$(selector).innerHTML=icon(name);
$$('#mode-controls button').forEach(b=>{b.innerHTML=icon(b.dataset.mode);b.onclick=()=>send('mode',{id:selected,mode:b.dataset.mode})});
$$('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
$$('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;$$('[data-filter]').forEach(x=>x.classList.toggle('selected',x===b));renderWorld()});
$('#add-project').onclick=()=>send('addProject');$('#refresh').onclick=()=>{send('scan');send('docker')};
$('#new-agent-top').onclick=()=>launchDialog();$('#notifications').onclick=()=>send('notifications');$('#voice').onclick=()=>send('voice');$('#settings').onclick=()=>{$('#help-dialog').showModal();$('#app').setAttribute('aria-hidden','true')};
$('#help-dialog').addEventListener('cancel',()=>$('#app').removeAttribute('aria-hidden'));
$('#help-dialog').addEventListener('close',()=>{$('#app').removeAttribute('aria-hidden');if(!document.querySelector('dialog[open]'))$('#settings').focus({preventScroll:true})});
$('#world-size').innerHTML=icon('expand');
$('#world-size').onclick=()=>{const large=$('#world').classList.toggle('world-large');$('#world-size').setAttribute('aria-pressed',String(large));I18n.attribute($('#world-size'),'aria-label',()=>large?I18n.t('Cambiar a vista general'):I18n.t('Ampliar islas'));I18n.bind($('#world-size'),"title",()=>large?I18n.t('Cambiar a vista general'):I18n.t('Ampliar islas'))};
$('#back-team').onclick=backToTeam;$('#back-docker').onclick=backToTeam;
$('#expand-terminal').onclick=()=>{document.body.classList.toggle('terminal-expanded');fitTerminal()};
$('#stop-agent').onclick=()=>send('stop',{id:selected});$('#mic').onclick=toggleDictation;$('#listen-agent').onclick=()=>send('speak',{id:terminalTarget()});$('#docker-refresh').onclick=()=>send('docker');$('#container-search').oninput=renderDocker;
$$('.terminal-keys [data-key]').forEach(b=>b.onclick=()=>{const text=JSON.parse('"'+b.dataset.key+'"');send('input',{id:terminalTarget(),text})});
$('#composer').onsubmit=submitComposer;
$('#prompt').onkeydown=composerKeys;
$('#prompt').oninput=()=>{renderComposerMenu();persistDraft(selected,$('#prompt').value)};
$('#launch-harness').onchange=updateLaunchHarness;
$('#launch-profile').onchange=()=>{updateBypassDescription();if($('#launch-mode').value==='resume')loadSavedSessions()};
$('#launch-project').onchange=()=>chooseProjectSuggestion($('#launch-project').value);
$('#launch-add-project').onclick=()=>send('addProject',{forLaunch:true});
$('#launch-mode').onchange=updateLaunchHarness;
$('#session-search').oninput=renderSessionOptions;$('#session-search').onkeydown=pickerKeys;$('#session-results').onkeydown=pickerKeys;
$$('[data-launch-mode]').forEach(b=>b.onclick=()=>{$('#launch-mode').value=b.dataset.launchMode;updateLaunchHarness();if(b.dataset.launchMode==='resume')$('#session-search').focus()});
$('.project-picker').addEventListener('focusout',e=>{if(!e.relatedTarget?.closest('.project-picker')){$('#project-suggestions').hidden=true;$('#project-search').setAttribute('aria-expanded','false')}});
$('#project-search').onfocus=()=>{$('#project-search').select();showProjectSuggestions()};$('#project-search').oninput=showProjectSuggestions;
$('#project-search').onkeydown=e=>{if(e.key==='Escape'){$('#project-suggestions').hidden=true;$('#project-search').setAttribute('aria-expanded','false');e.preventDefault();e.stopPropagation();return}if(!['ArrowDown','ArrowUp','Enter'].includes(e.key))return;e.preventDefault();if($('#project-suggestions').hidden)showProjectSuggestions();const rows=$$('#project-suggestions [data-project]');if(!rows.length)return;let index=rows.findIndex(b=>b.id===$('#project-search').getAttribute('aria-activedescendant'));if(e.key==='Enter'){chooseProjectSuggestion(rows[Math.max(0,index)].dataset.project);return}index=(index+(e.key==='ArrowDown'?1:-1)+rows.length)%rows.length;rows.forEach((b,i)=>b.classList.toggle('highlighted',i===index));$('#project-search').setAttribute('aria-activedescendant',rows[index].id);rows[index].scrollIntoView({block:'nearest'})};
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.project-picker')){$('#project-suggestions').hidden=true;$('#project-search').setAttribute('aria-expanded','false')}});
$('#session-all-projects').onchange=loadSavedSessions;$('#session-refresh').onclick=loadSavedSessions;
$('#saved-session').onchange=()=>{updatePickerActive();updateSessionFolder();updateLaunchSubmit()};
$('#bypass-permissions').onchange=updateBypassDescription;$('#bypass-symbol').innerHTML=icon('shield');$('#session-refresh').innerHTML=icon('refresh');
$('#launch-form').onsubmit=e=>{
  e.preventDefault();if(launchPending||$('#launch-submit').disabled)return;
  const harness=$('#launch-harness').value,resume=$('#launch-mode').value==='resume';let args=[];
  if(harness==='custom')try{args=JSON.parse($('#custom-args').value);if(!Array.isArray(args)||!args.every(a=>typeof a==='string'))throw Error()}catch{toast(I18n.t('Los argumentos deben ser una lista JSON de textos.'));return}
  if(resume&&!sessionCatalog.some(s=>s.id===$('#saved-session').value&&!s.inUse))return;
  launchPending=true;$('#launch-error').hidden=true;updateLaunchSubmit();
  send('launch',{projectId:$('#launch-project').value,harness,...(['codex','claude'].includes(harness)?{profileId:$('#launch-profile').value}:{}),name:$('#launch-name').value,executable:$('#custom-executable').value,args,bypassPermissions:!$('#launch-permissions').hidden&&$('#bypass-permissions').checked,...(resume?{resumeSessionId:$('#saved-session').value}:{})});
  if(preview&&!native){launchPending=false;updateLaunchSubmit()}
};
function closeDialog(dialog){if(dialog.id==='help-dialog')$('#app').removeAttribute('aria-hidden');dialog.close()}
$$('.close-dialog').forEach(b=>b.onclick=()=>closeDialog(b.closest('dialog')));
$$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog(d)}}));
$('#agent-search').oninput=searchAgents;
$('#agent-search').onkeydown=e=>{if(['ArrowDown','Enter'].includes(e.key)){e.preventDefault();const first=$('#search-results button:not(:disabled)');if(e.key==='Enter')first?.click();else first?.focus()}};
$('#search-results').onkeydown=e=>{if(!['ArrowDown','ArrowUp'].includes(e.key))return;e.preventDefault();const rows=$$('#search-results button:not(:disabled)'),index=rows.indexOf(document.activeElement);rows[(index+(e.key==='ArrowDown'?1:-1)+rows.length)%rows.length]?.focus()};
$('#command-search').onclick=openSearch;$('#command-search-icon').innerHTML=icon('search');
$('#file-project').onchange=()=>openProject($('#file-project').value);
$('#reveal').onclick=()=>send('reveal',{projectId:fileProject});
$('#file-up').onclick=()=>send('listFiles',{projectId:fileProject,path:filePath.split('/').slice(0,-1).join('/')});
$('#save-file').onclick=saveFile;
$('#reload-file').onclick=()=>{if(currentFile)send('readFile',{projectId:fileProject,path:currentFile.path})};
$('#code').oninput=()=>{dirty=true;reportDirty();$('#save-file').disabled=false;I18n.bind($('#file-name'),"textContent",()=>currentFile.path+' ●');updateLineNumbers()};
$('#code').onscroll=()=>$('#line-numbers').scrollTop=$('#code').scrollTop;
$('#code').onkeydown=e=>{if(e.key==='Tab'){e.preventDefault();document.execCommand('insertText',false,'  ')}};
document.addEventListener('keydown',e=>{if(!e.metaKey)return;const k=e.key.toLowerCase();if(['1','2','k','s'].includes(k))e.preventDefault();if(k==='1')setView('world');if(k==='2')setView('terminals');if(k==='k')openSearch();if(k==='s')saveFile()});
$('#terminal-project').onchange=renderTerminalDeck;
$('#board-new-agent').onclick=()=>launchDialog($('#terminal-project').value);
$('#project-files').onclick=()=>{$('#project-dialog').close();openProject(briefProject)};
$('#project-terminals').onclick=()=>{$('#project-dialog').close();setView('terminals');$('#terminal-project').value=briefProject;renderTerminalDeck()};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});

if(preview && !native){
  state={native:false,voice:false,notifications:false,binaries:{codex:'/opt/homebrew/bin/codex',claude:'~/.local/bin/claude'},projects:[{id:'portal',name:'customer-portal',path:'/projects/customer-portal'},{id:'fleet',name:'agent-fleet',path:'/projects/agent-fleet'},{id:'islands',name:'agent-visor',path:'/projects/agent-visor'}],agents:[{id:'a',projectId:'portal',name:I18n.t('Arquitecto'),harness:'claude',state:'waiting',mode:'plan',managed:true,message:I18n.t('¿Seguimos con este plan?')},{id:'b',projectId:'portal',name:I18n.t('Backend'),harness:'codex',state:'active',mode:'goal',managed:true},{id:'c',projectId:'fleet',name:I18n.t('Explorador'),harness:'claude',state:'active',mode:'work',managed:true},{id:'d',projectId:'fleet',name:I18n.t('Implementador'),harness:'codex',state:'active',mode:'goal',managed:true},{id:'e',projectId:'islands',name:I18n.t('Diseñador'),harness:'codex',state:'ready',mode:'work',managed:true}],docker:{connected:true,status:'ready',containers:[{id:'db',name:'portal-postgres',image:'postgres:17',state:'running',status:I18n.t('Up 2 days (healthy)'),ports:'127.0.0.1:5438->5432/tcp',project:'portal'},{id:'api',name:'portal-api',image:'portal-api:local',state:'running',status:I18n.t('Up 3 hours'),ports:'0.0.0.0:3000->3000/tcp',project:'portal'},{id:'redis',name:'fleet-redis',image:'redis:7',state:'running',status:I18n.t('Up 4 hours'),ports:'127.0.0.1:6379->6379/tcp',project:'fleet'}]}};
  const now=Date.now()/1000;
  Object.assign(state.agents[0],{lastTask:I18n.t('Preparar el plan de autenticación para el portal.'),taskAt:now-7200,lastResponse:I18n.t('Plan preparado. Falta decidir si usamos el proveedor actual o uno nuevo.'),responseAt:now-1200,contextResponse:I18n.t('Objetivo: unificar la autenticación del portal.\nHecho: revisado el acceso actual y preparado el plan.\nPendiente: elegir proveedor y validar los permisos.\nTu decisión: mantener el proveedor actual o migrar.\nSiguiente paso: implementar la opción que elijas.'),contextKind:'recap',contextAt:now-180});
  Object.assign(state.agents[1],{lastTask:I18n.t('Implementar el contrato de las sesiones.'),taskAt:now-3600,lastResponse:I18n.t('Contrato implementado y pruebas del módulo superadas. Estoy revisando la integración.'),responseAt:now-420});
  Object.assign(state.agents[1],{goalStatus:'active',goalObjective:I18n.t('Completar el contrato de sesiones y validar su integración.'),tokenBudget:50000,tokensUsed:18500});
  Object.assign(state.agents[3],{state:'observed',goalStatus:'paused',goalObjective:I18n.t('Coordinar los agentes de la flota.'),tokenBudget:30000,tokensUsed:9000});
  const sceneState=query.get('sceneState');
  if(sceneState){const a=state.agents[1];a.goalStatus=sceneState;a.state=sceneState==='active'?'active':sceneState==='complete'?'ready':sceneState==='blocked'||sceneState==='budget_limited'?'waiting':'observed';if(sceneState==='budget_limited')a.tokensUsed=a.tokenBudget;}
}
render();send('ready');
if(preview&&!native&&query.get('screen')==='terminals')setView('terminals');
if(preview&&!native&&query.get('screen')==='conversation'){selectAgent(state.agents[1].id);state.agents[1].bypassPermissions=true;updateAgent()}
if(preview&&!native&&query.get('screen')==='docker')openDocker();
if(preview&&!native&&query.get('screen')==='brief')openProjectBrief(state.projects[0].id);

if(preview&&!native&&['resume','bypass'].includes(query.get('screen'))){
  launchDialog(state.projects[0].id,query.get('harness')==='claude'?'claude':'codex');
  $('#launch-mode').value='resume';updateLaunchHarness();
  $('#bypass-permissions').checked=query.get('screen')==='bypass';updateBypassDescription();
}

if(preview&&!native&&query.get('screen')==='search')openSearch();

if(preview&&!native&&['resume','bypass'].includes(query.get('screen'))){
  const variant=query.get('state');
  if(variant==='empty'){sessionCatalog=[];renderSessionOptions()}
  if(variant==='loading'){sessionLoading=true;renderSessionOptions()}
  if(variant==='error'){$('#launch-error').hidden=false;I18n.bind($('#launch-error'),"textContent",()=>I18n.t('No se pudo leer el historial. Pulsa actualizar para reintentarlo.'))}
}

$('#container-search').oninput=renderDocker;

// Islands' own assistant never writes to an agent terminal.
var aiRequestID=0,aiPending=false,aiError=false,aiScope=null,aiProject=null,aiFollow=true,aiResults=new Map(),aiAuto=false,aiLastFingerprint='',aiLastRun=0,aiScopeTimer=null;
var aiRequestedAgent=null,checkpointStore=loadCheckpointStore(),checkpointSignature='';
function checkpointKey(a){const project=state.projects.find(p=>p.id===a.projectId);return JSON.stringify([a.profileId || a.harness,project?.path || a.projectId,a.threadId || a.id])}
function loadCheckpointStore(){
 try{const value=JSON.parse(localStorage.getItem('islands.productCheckpoints.v1') || '{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch{return {}}
}
function agentCheckpoints(a){const identity=checkpointKey(a);let rows=checkpointStore?.[identity];if(!rows&&a.threadId&&checkpointStore){const project=state.projects.find(p=>p.id===a.projectId),old=JSON.stringify([a.profileId||a.harness,project?.path||a.projectId,a.id]);if(checkpointStore[old]){rows=checkpointStore[old];checkpointStore[identity]=rows;if(native)send('checkpoints',{key:identity,entries:rows})}}return Array.isArray(rows)?rows.filter(r=>r&&typeof r.summary==='string'&&Number.isFinite(r.generatedAt)&&Array.isArray(r.changes)).slice(0,20):[]}
function recordCheckpoint(data){
 if(data.error||!data.agentId||!['checkpoint','status','recap'].includes(data.kind)||!data.summary?.trim())return;
 const a=state.agents.find(a=>a.id===data.agentId);if(!a)return;
 const key=checkpointKey(a),rows=agentCheckpoints(a),entry={summary:String(data.summary).slice(0,6000),headline:String(data.headline || I18n.t('Avance del producto')).slice(0,200),changes:(Array.isArray(data.changes)?data.changes:[]).filter(c=>typeof c==='string'&&c.trim()).slice(0,5).map(c=>c.slice(0,600)),nextStep:String(data.nextStep || '').slice(0,1000),generatedAt:data.generatedAt || Date.now()/1000,capturedAt:data.capturedAt || data.generatedAt || Date.now()/1000,source:String(data.source || I18n.t('Islands')).slice(0,200),taskAt:a.taskAt || 0,evidence:Array.isArray(data.evidence)?data.evidence:[]};
 checkpointStore[key]=[entry,...rows.filter(r=>r.generatedAt!==entry.generatedAt)].slice(0,20);
 const keys=Object.keys(checkpointStore).sort((a,b)=>(checkpointStore[b]?.[0]?.generatedAt || 0)-(checkpointStore[a]?.[0]?.generatedAt || 0));
 for(const old of keys.slice(100))delete checkpointStore[old];
 try{localStorage.setItem('islands.productCheckpoints.v1',JSON.stringify(checkpointStore))}catch{}
 if(native)send('checkpoints',{key,entries:checkpointStore[key]});
}
function statusLabelSafe(status){return ({passed:'comprobaciones correctas',failed:'comprobaciones fallidas',blocked:'acceso bloqueado',stale:I18n.t('versión anterior'),skipped:I18n.t('sin comprobaciones')})[status] || status}
function checkpointDate(value){return new Date(value*1000).toLocaleString(I18n.locale,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
function renderCheckpoints(){
 const section=$('#agent-checkpoints'),a=state.agents.find(a=>a.id===selected);
 section.hidden=!a||view!=='world'||$('#agent-view').hidden;
 if(!checkpointStore||section.hidden)return;
 const rows=agentCheckpoints(a),latest=rows[0],pending=aiPending&&aiRequestedAgent===a.id,error=aiError&&aiRequestedAgent===a.id;
 $('#checkpoint-refresh').disabled=!!aiPending;I18n.bind($('#checkpoint-refresh'),"textContent",()=>pending?I18n.t('Consultando…'):I18n.t('Actualizar checkpoint'));
 I18n.bind($('#checkpoint-consulted'),"textContent",()=>latest?I18n.t('Última consulta · ')+checkpointDate(latest.generatedAt):I18n.t('Sin consultas todavía'));
 const status=$('#checkpoint-status');status.hidden=!pending&&!error;I18n.bind(status,"textContent",()=>error?I18n.t('No se pudo actualizar. ')+aiError:pending?I18n.t('Consultando el avance del producto…'):'');section.setAttribute('aria-busy',String(!!pending));
 const signature=JSON.stringify([checkpointKey(a),rows]);if(signature===checkpointSignature)return;checkpointSignature=signature;
 const receipt=r=>ht`<article class="checkpoint-entry"><h3>${esc(r.headline)}</h3><p class="checkpoint-summary">${esc(r.summary)}</p>${r.changes.length?ht`<h4>Cambios principales</h4><ul>${r.changes.map(c=>ht`<li>${esc(c)}</li>`).join('')}</ul>`:ht('<p class="checkpoint-no-changes">Sin cambios principales confirmados en esta consulta.</p>')}${r.nextStep?ht`<div class="checkpoint-next"><strong>Siguiente paso</strong><p>${esc(r.nextStep)}</p></div>`:''}${r.evidence?.length?ht`<div class="checkpoint-verification">${r.evidence.map(e=>ht`<span>${e.status==='passed'&&e.revisionVerified&&e.finishedAt>=(r===latest?(a.taskAt||0):(r.taskAt||0))?I18n.t('Validado en el entorno'):I18n.t('Validación pendiente o anterior')} · ${esc(statusLabelSafe(e.status))}</span>`).join('')}</div>`:''}<footer>${esc(r.source)} · Contexto del ${esc(checkpointDate(r.capturedAt))}</footer></article>`;
 $('#checkpoint-content').innerHTML=latest?receipt(latest)+(rows.length>1?ht`<div class="checkpoint-history"><h3>Checkpoints anteriores <span>${rows.length-1}</span></h3>${rows.slice(1).map(r=>ht`<details><summary><time datetime="${esc(new Date(r.generatedAt*1000).toISOString())}">${esc(checkpointDate(r.generatedAt))}</time><span>${esc(r.headline)}</span></summary>${receipt(r)}</details>`).join('')}</div>`:''):ht('<div class="checkpoint-empty"><h3>El próximo avance empieza aquí</h3><p>Consulta un resumen del progreso y los cambios principales del producto.</p></div>');
}
$('#checkpoint-refresh').onclick=()=>{if(selected)requestIslandsAI('checkpoint',selected)};
var skillCatalog=[],composerAttachments=[],composerDrafts=new Map(),composerMenuIndex=0,dictationAnchor=null;
function situationKey(id,project=aiProject){return (state.activeWorkspaceId?'workspace:'+state.activeWorkspaceId+':':'')+(id || (project?'project:'+project:'world'))}
const situation=document.createElement('section');situation.id='situation';situation.dataset.slot='situation-viewer';I18n.attribute(situation,'aria-label',()=>I18n.t('Pulso de trabajo'));
situation.innerHTML=ht`<div class="pulse-toolbar"><span class="pulse-mark">${icon('bot')}</span><strong>Pulso</strong><label class="sr-only" for="ai-scope">Alcance del pulso</label><select id="ai-scope" aria-label="Alcance del pulso"></select><span id="pulse-live" class="pulse-live">En vivo</span><button id="ai-refresh" class="icon-button" title="Actualizar pulso" aria-label="Actualizar pulso">${icon('refresh')}</button><button id="situation-toggle" class="icon-button" aria-expanded="false" aria-controls="situation-body" title="Expandir pulso" aria-label="Expandir pulso">${icon('expand')}</button></div><div id="pulse-overview"></div><div id="ai-result" role="status"></div><div id="situation-body" hidden><div id="pulse-details"></div><div id="ai-actions" hidden><button id="ai-draft">Preparar respuesta</button><button id="ai-open">Abrir agente ${icon('arrow')}</button></div><form id="ai-question-form"><label for="ai-question" class="sr-only">Pregunta sobre este contexto</label><input id="ai-question" placeholder="Pregunta sobre este contexto…" maxlength="2000"><button class="icon-button" aria-label="Consultar a Islands" title="Consultar a Islands">${icon('send')}</button></form><div class="pulse-provenance"><span id="ai-source">Resúmenes opcionales</span><label class="ai-auto"><input id="ai-auto" type="checkbox">Actualizar automáticamente</label><button id="ai-cancel" hidden>Cancelar análisis</button></div></div>`;
$('#world').before(situation);
function pulseAgents(){return state.agents.filter(a=>aiScope?a.id===aiScope:aiProject?a.projectId===aiProject:true)}
function pulseContextLabel(){return aiScope?state.agents.find(a=>a.id===aiScope)?.name || I18n.t('Agente'):aiProject?state.projects.find(p=>p.id===aiProject)?.name || I18n.t('Isla'):I18n.t('Todas las islas')}
function syncPulseScope(){
 if(!$('#ai-scope'))return;
 const next=aiFollow?(briefProject?null:selected):aiScope,nextProject=aiFollow?(briefProject || null):aiProject;
 if(next!==aiScope||nextProject!==aiProject){
  if(aiPending)cancelPulse();aiScope=next || null;aiProject=next?null:nextProject || null;aiError=false;aiLastFingerprint='';
  clearTimeout(aiScopeTimer);if(native&&aiAuto)aiScopeTimer=setTimeout(()=>requestIslandsAI(aiScope?'checkpoint':'status',aiScope),700);
 }
 const html=ht`<option value="follow">${esc(briefProject?I18n.t('Isla abierta'):selected?I18n.t('Agente abierto'):I18n.t('Seguir selección'))}</option><option value="world">${state.activeWorkspaceId?I18n.t('Workspace completo'):I18n.t('Todas las islas')}</option>`+state.projects.map(p=>ht`<option value="project:${esc(p.id)}">${esc(p.name)}</option>`).join('');
 if($('#ai-scope').innerHTML!==html)$('#ai-scope').innerHTML=html;
 $('#ai-scope').value=aiFollow?'follow':aiProject?'project:'+aiProject:'world';
}
function cancelPulse(){send('cancelIntelligence');aiRequestID++;aiPending=false;aiError=false;$('#ai-cancel').hidden=true;$('#ai-refresh').disabled=false;$('#ai-result').removeAttribute('aria-busy')}
$('#situation-toggle').onclick=()=>{const open=$('#situation-body').hidden;$('#situation-body').hidden=!open;$('#situation-toggle').setAttribute('aria-expanded',String(open));I18n.attribute($('#situation-toggle'),'aria-label',()=>open?I18n.t('Contraer pulso'):I18n.t('Expandir pulso'));};
$('#ai-cancel').onclick=()=>{cancelPulse();renderSituation()};
$('#ai-auto').onchange=()=>{aiAuto=$('#ai-auto').checked;if(aiAuto)requestIslandsAI('status',aiScope);renderSituation()};
$('#ai-scope').onchange=()=>{const value=$('#ai-scope').value;cancelPulse();aiFollow=value==='follow';aiScope=aiFollow?selected:null;aiProject=value.startsWith('project:')?value.slice(8):aiFollow&&!selected?briefProject:null;renderSituation();requestIslandsAI('status',aiScope)};
$('#ai-refresh').onclick=()=>requestIslandsAI('status',aiScope);
$('#ai-question-form').onsubmit=e=>{e.preventDefault();const question=$('#ai-question').value.trim();if(aiPending){toast(I18n.t('Espera al análisis en curso o cancélalo.'));return}if(question){requestIslandsAI('question',aiScope,question);$('#ai-question').value=''}};
function requestIslandsAI(kind='status',id=aiScope,question=''){
 clearTimeout(aiScopeTimer);
 if(view==='terminals')setView('world');
 if(id!==aiScope){if(aiPending)cancelPulse();aiScope=id;aiProject=null;aiFollow=id===selected}
 if(aiPending)return;
 aiRequestedAgent=id;aiPending=true;aiError=false;aiLastRun=Date.now();const requestId=++aiRequestID;
 $('#ai-cancel').hidden=false;$('#ai-refresh').disabled=true;$('#ai-result').setAttribute('aria-busy','true');
 renderSituation();
 if(native){const a=state.agents.find(a=>a.id===id),previous=a?agentCheckpoints(a)[0]:null;send('intelligence',{kind,id,projectId:aiProject,question,requestId,...(previous?{previousCheckpoint:{summary:previous.summary,changes:previous.changes,capturedAt:previous.capturedAt}}:{})})}
 else{aiPending=false;$('#ai-cancel').hidden=true;$('#ai-refresh').disabled=false;$('#ai-result').removeAttribute('aria-busy');renderSituation()}
}
function acceptIntelligence(data){
 if(data.requestId!==aiRequestID)return;
 aiPending=false;aiError=data.error || false;$('#ai-cancel').hidden=true;$('#ai-refresh').disabled=false;$('#ai-result').removeAttribute('aria-busy');
 if(!data.error){aiResults.set(situationKey(data.agentId,data.projectId || null),data);recordCheckpoint(data)}
 renderSituation();
}
function renderSituation(){
 if(!$('#situation')||!aiResults)return;
 syncPulseScope();
 renderCheckpoints();
 const agents=pulseAgents(),attention=agents.filter(needsAttention),working=agents.filter(a=>agentControl(a).working),goals=agents.filter(hasGoal);
 const counts=[['working',working.length,I18n.t('en marcha')],['waiting',attention.length,I18n.t("por atender")],['goal',goals.length,'goals']];
 $('#pulse-overview').innerHTML=ht`<div class="pulse-counts">${counts.map(([signal,n,label])=>ht`<span class="signal-${signal}"><i></i><b>${n}</b> ${label}</span>`).join('')}</div><span class="pulse-context">${esc(pulseContextLabel())}</span>`;
 const data=aiResults.get(situationKey(aiScope)),focus=attention[0] || agents.find(a=>agentControl(a).working) || agents[0],signal=focus?agentSignal(focus):'idle';
 situation.dataset.signal=signal;
 I18n.bind($('#pulse-live'),"textContent",()=>aiPending?I18n.t('Leyendo…'):aiAuto?I18n.t('En vivo'):I18n.t('En pausa'));
 $('#pulse-live').classList.toggle('is-loading',aiPending);
 if(aiError){$('#ai-result').innerHTML=ht`<div class="pulse-focus signal-blocked"><span class="pulse-state-icon">${icon('attention')}</span><div><strong>No se pudo actualizar</strong><p>${esc(aiError)}</p></div><button id="ai-retry">Reintentar</button></div>`;$('#ai-retry').onclick=()=>{aiError=false;requestIslandsAI('status',aiScope)};return}
 const heading=data?.headline || (attention.length?(aiScope?I18n.t('Tu siguiente decisión'):attention.length===1?I18n.t('Un agente necesita tu atención'):attention.length+I18n.t(' agentes necesitan tu atención')):aiScope?I18n.t('En este agente'):I18n.t('Tu equipo, de un vistazo'));
 const summary=data?.summary || (aiPending?I18n.t('Preparando un resumen de este contexto…'):focus?.message || focus?.goalObjective || (agents.length?I18n.t('Actualiza el pulso para recuperar el contexto.'):I18n.t('Abre un agente o selecciona una isla.')));
 $('#ai-result').innerHTML=ht`<div class="pulse-focus signal-${signal}"><span class="pulse-state-icon">${icon(focus?stateIcon(focus):'island')}</span><div class="pulse-focus-copy"><strong>${esc(heading)}</strong><p>${esc(summary)}</p></div><button id="pulse-primary" class="pulse-primary">${attention.length?I18n.t('Revisar'):I18n.t('Ver detalle')}${icon('arrow')}</button></div>`;
 $('#pulse-primary').onclick=()=>{if(attention.length&&focus?.id!==selected){selectAgent(focus.id)}$('#situation-body').hidden=false;$('#situation-toggle').setAttribute('aria-expanded','true')};
 const rows=(data?.items || []).filter(item=>agents.some(a=>a.id===item.agentId));
 $('#pulse-details').innerHTML=`${data?ht`<p class="pulse-full-summary">${esc(data.summary)}</p>`:''}${rows.length?ht`<div class="pulse-agent-rows">${rows.map(item=>{const a=agents.find(a=>a.id===item.agentId);return ht`<button class="pulse-agent-row signal-${agentSignal(a)}" data-pulse-agent="${esc(a.id)}"><span>${icon(stateIcon(a))}</span><div><strong>${esc(a.name)}</strong><p>${esc(item.summary)}</p></div>${icon('arrow')}</button>`}).join('')}</div>`:''}${data?.blocker&&data.kind==='unblock'?ht`<div class="pulse-finding"><span>${icon('attention')}Bloqueo observado</span><p>${esc(data.blocker)}</p></div>`:''}${data?.nextStep?ht`<div class="pulse-finding"><span>${icon('arrow')}Siguiente paso sugerido</span><p>${esc(data.nextStep)}</p></div>`:''}`;
 $$('#pulse-details [data-pulse-agent]').forEach(b=>b.onclick=()=>selectAgent(b.dataset.pulseAgent));
 I18n.bind($('#ai-source'),"textContent",()=>data?`${data.source} · ${timeText(data.generatedAt)}${Date.now()/1000-data.capturedAt>120?I18n.t(" · contexto anterior"):''}`:I18n.t('Resúmenes opcionales'));
 const a=state.agents.find(a=>a.id===data?.agentId);
 $('#ai-actions').hidden=!a;$('#ai-draft').hidden=!data?.draft;I18n.bind($('#ai-draft'),"textContent",()=>a?.managed?I18n.t('Preparar respuesta'):I18n.t('Copiar propuesta'));
 $('#ai-draft').onclick=()=>{if(a?.managed){selectAgent(a.id);if($('#prompt').value.trim()){toast(I18n.t('Conserva o borra el borrador actual antes de preparar otro.'));return}$('#prompt').value=data.draft;$('#prompt').focus()}else{send('copyText',{text:data.draft});if(!native)navigator.clipboard?.writeText(data.draft);toast(I18n.t('Propuesta copiada.'))}};
 $('#ai-open').onclick=()=>a&&selectAgent(a.id);
}
function renderExternalGoal(a){
  const isGoal=hasGoal(a),blocked=agentControl(a).goalNeedsAttention||agentControl(a).effective==='error';
  $('#external-notice').innerHTML=ht`<div class="goal-workbench" data-slot="goal-workbench"><div class="goal-workbench-top"><span class="signal-badge signal-${agentSignal(a)}">${icon(stateIcon(a))}${esc(stateText(a))}</span><small>${esc(timeText(a.goalUpdatedAt))}</small></div><h2>${isGoal?I18n.t('Da el siguiente paso'):I18n.t('Retoma este agente')}</h2><p class="goal-focus">${esc(a.goalObjective || a.lastTask || a.message || I18n.t('Conversación en su terminal original.'))}</p><div class="goal-evidence"><strong>Evidencia disponible</strong><p>${esc(a.lastResponse || a.message || I18n.t('El registro indica el estado, pero no confirma la causa. Islands puede consultar el historial guardado.'))}</p></div><button class="primary" id="analyze-goal">${icon(blocked?'attention':'bot')}${blocked?I18n.t('Analizar cómo desbloquear'):I18n.t('Resumir la situación')}</button><button id="open-managed">${a.threadId?I18n.t('Abrir esta conversación'):I18n.t('Buscar conversación')} ${icon('link')}</button><small>El análisis aparece en el visor de Islands.</small></div>`;
  $('#analyze-goal').onclick=()=>{requestIslandsAI(blocked?'unblock':'recap',a.id);$('#situation-body').hidden=false;$('#situation-toggle').setAttribute('aria-expanded','true')};
  $('#open-managed').onclick=()=>{if(a.threadId)send('prepareAgentResume',{id:a.id});else{launchDialog(a.projectId,a.harness,a.profileId);if(['codex','claude'].includes(a.harness)){$('#launch-mode').value='resume';pickerSelection=a.threadId || null;updateLaunchHarness()}}};
}
// Only observed changes within the current scope trigger a new analysis.
setInterval(()=>{
 if(!native||!aiAuto||aiPending||document.hidden||!pulseAgents().length||Date.now()-aiLastRun<120000)return;
 const fingerprint=JSON.stringify(pulseAgents().map(a=>[a.id,a.state,a.goalStatus,a.goalUpdatedAt,a.taskAt,a.responseAt]));
 if(fingerprint===aiLastFingerprint)return;aiLastFingerprint=fingerprint;requestIslandsAI(aiScope?'checkpoint':'status',aiScope);
},15000);
// Text drafts survive restarts; attachments stay in memory because their files are per session.
function persistDraft(id,text){if(!id)return;try{text?.trim()?localStorage.setItem('islands.draft.'+id,text.slice(0,20000)):localStorage.removeItem('islands.draft.'+id)}catch{}}
function storedDraft(id){try{return localStorage.getItem('islands.draft.'+id)||''}catch{return ''}}
function switchComposerAgent(id){
 if(typeof composerDrafts==='undefined'||!composerDrafts)return;
 if(selected)composerDrafts.set(selected,{text:$('#prompt').value,attachments:composerAttachments});
 if(dictationAnchor){send('stopDictation');dictationAnchor=null}
 const draft=composerDrafts.get(id);$('#prompt').value=draft?.text || storedDraft(id);composerAttachments=draft?.attachments || [];renderAttachments();
}
$('#composer').insertAdjacentHTML('afterbegin',ht('<div id="composer-menu" role="listbox" aria-label="Comandos y skills" hidden></div><div id="composer-attachments" aria-label="Imágenes adjuntas" hidden></div>'));
$('#mic').insertAdjacentHTML('beforebegin',ht`<button id="attach-image" type="button" class="icon-button" title="Adjuntar imagen · también puedes pegar o arrastrar" aria-label="Adjuntar imagen">${icon('plus')}</button><button id="composer-skills" type="button" title="Skills y comandos" aria-label="Skills y comandos">/</button>`);
$('#attach-image').onclick=()=>send('chooseImage',{id:selected});
$('#composer-skills').onclick=()=>{if(!$('#prompt').value)$('#prompt').value='/';$('#prompt').focus();renderComposerMenu()};
const localCommands=[{name:'/resumen',description:I18n.t('Resumen en Islands, sin enviar un turno'),kind:'recap'},{name:'/estado',description:I18n.t('Qué requiere tu atención'),kind:'status'},{name:'/bloqueo',description:I18n.t('Analizar el bloqueo con Islands'),kind:'unblock'},{name:'/borrar',description:I18n.t('Borrar borrador e imágenes'),kind:'erase'},{name:'/limpiar',description:I18n.t('Limpiar solo la vista del terminal'),kind:'clear'},{name:'/dictar',description:I18n.t('Iniciar o detener el dictado'),kind:'dictate'},{name:'/skills',description:I18n.t('Ver skills locales del proyecto'),kind:'skills'}];
function composerOptions(){
 const text=$('#prompt').value;if(!/^[/$][^\s]*$/.test(text))return [];
 const a=state.agents.find(a=>a.id===selected),needle=text.slice(1).toLowerCase();
 const skills=(skillCatalog || []).filter(s=>s.name.toLowerCase().includes(needle)).map(s=>({...s,name:(a?.harness==='claude'?'/':'$')+s.name,kind:'skill'}));
 return [...(text[0]==='/'?localCommands.filter(c=>c.name.includes(needle)):[]),...skills].slice(0,10);
}
function renderComposerMenu(){
 const menu=$('#composer-menu');if(!menu)return;const options=composerOptions();menu.hidden=!options.length;composerMenuIndex=Math.min(composerMenuIndex,Math.max(0,options.length-1));
 $('#prompt').setAttribute('aria-expanded',String(!!options.length));$('#prompt').setAttribute('aria-controls','composer-menu');
 menu.innerHTML=options.map((c,i)=>ht`<button type="button" role="option" aria-selected="${i===composerMenuIndex}" data-option="${i}"><strong>${esc(c.name)}</strong><span>${esc(c.description)}</span></button>`).join('');
 menu.querySelectorAll('button').forEach(b=>b.onclick=()=>applyComposerOption(options[+b.dataset.option]));
}
function clearComposerDraft(){
 if(dictationAnchor){send('stopDictation');dictationAnchor=null}
 for(const a of composerAttachments)send('removeAttachment',{attachmentId:a.id});composerAttachments=[];$('#prompt').value='';renderAttachments();renderComposerMenu();
}
function applyComposerOption(option){
 if(option.kind==='skill'){$('#prompt').value=option.name+' ';$('#composer-menu').hidden=true;$('#prompt').focus();return}
 $('#prompt').value='';$('#composer-menu').hidden=true;
 if(['status','recap','unblock'].includes(option.kind))requestIslandsAI(option.kind,selected);
 if(option.kind==='erase')clearComposerDraft();
 if(option.kind==='clear')terminal?.clear();
 if(option.kind==='dictate')toggleDictation();
 if(option.kind==='skills'){$('#prompt').value=state.agents.find(a=>a.id===selected)?.harness==='claude'?'/':'$';renderComposerMenu()}
}
function submitComposer(e){
 e.preventDefault();if($('#send').disabled)return;
 const text=$('#prompt').value,command=localCommands.find(c=>c.name===text.trim());if(command){applyComposerOption(command);return}
 if(!text.trim()&&!composerAttachments.length)return;
 if(!composerAttachments.length&&typeof submitQuestionText==='function'&&submitQuestionText(text)){$('#prompt').value='';renderComposerMenu();terminal?.focus();return}
 scrollTerminalToBottom();const requestId=crypto.randomUUID();if(typeof visualSendDrafts!=='undefined')visualSendDrafts.set(requestId,{owner:terminalTarget(),text,attachments:[...composerAttachments]});send('prompt',{requestId,id:terminalTarget(),text:text || I18n.t('Examina las referencias adjuntas.'),attachments:composerAttachments.filter(a=>!a.visual).map(a=>a.id),references:composerAttachments.filter(a=>a.visual).map(a=>a.id)});
 draftContext=null;persistDraft(selected,'');$('#prompt').value='';composerAttachments=[];renderAttachments();renderComposerMenu();I18n.bind($('#composer-hint'),"textContent",()=>I18n.t('⌘↵ para enviar'));scrollTerminalToBottom();terminal?.focus();
}
function composerKeys(e){
 const options=composerOptions();
 if(e.key==='Escape'){e.preventDefault();e.stopPropagation();$('#composer-menu').hidden=true;if(dictationAnchor)send('stopDictation');return}
 if(!$('#composer-menu').hidden&&options.length&&['ArrowDown','ArrowUp',I18n.t('Tab'),'Enter'].includes(e.key)&&!e.metaKey&&!e.shiftKey){e.preventDefault();if([I18n.t('Tab'),'Enter'].includes(e.key))applyComposerOption(options[composerMenuIndex]);else{composerMenuIndex=(composerMenuIndex+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;renderComposerMenu()}return}
 if(e.key==='Enter'&&e.metaKey){e.preventDefault();$('#composer').requestSubmit()}
}
function renderAttachments(){const el=$('#composer-attachments');if(!el)return;el.hidden=!composerAttachments.length;el.innerHTML=composerAttachments.map(a=>ht`<div class="composer-image"><img src="${esc(a.preview)}" alt="${esc(a.name)}"><button class="remove-image" type="button" aria-label="Quitar ${esc(a.name)}" data-remove="${esc(a.id)}">${icon('close')}</button></div>`).join('');el.querySelectorAll('button').forEach(b=>b.onclick=()=>{send('removeAttachment',{attachmentId:b.dataset.remove});composerAttachments=composerAttachments.filter(a=>a.id!==b.dataset.remove);renderAttachments()})}
function readComposerImage(file){
 if(!file?.type.startsWith('image/'))return;if(file.size>10000000){toast(I18n.t('La imagen supera los 10 MB.'));return}if(composerAttachments.length>=6){toast(I18n.t('Máximo 6 imágenes por mensaje.'));return}
 const owner=selected,reader=new FileReader();reader.onload=()=>send('attachImage',{id:owner,base64:String(reader.result).split(',')[1]});reader.readAsDataURL(file);
}
$('#prompt').addEventListener('paste',e=>{const images=[...e.clipboardData.items].filter(i=>i.type.startsWith('image/'));if(images.length){e.preventDefault();images.slice(0,6).forEach(i=>readComposerImage(i.getAsFile()))}});
$('#composer').addEventListener('dragover',e=>{e.preventDefault();$('#composer').classList.add('dragging')});
$('#composer').addEventListener('dragleave',()=>$('#composer').classList.remove('dragging'));
$('#composer').addEventListener('drop',e=>{e.preventDefault();$('#composer').classList.remove('dragging');[...e.dataTransfer.files].slice(0,6).forEach(readComposerImage)});
function toggleDictation(){
 if(dictationAnchor){send('stopDictation');return}
 if(!dictationAnchor){const p=$('#prompt');dictationAnchor={agent:selected,before:p.value.slice(0,p.selectionStart),after:p.value.slice(p.selectionEnd)};}
 send('dictate');
}
function handleDictation(data){
 if(!dictationAnchor&&data.recording)return;
 $('#mic').classList.toggle('recording',!!data.recording);I18n.attribute($('#mic'),'aria-label',()=>data.recording?I18n.t('Detener dictado'):I18n.t('Dictar mensaje'));
 if(data.text&&dictationAnchor?.agent===selected)$('#prompt').value=dictationAnchor.before+data.text+dictationAnchor.after;
 I18n.bind($('#composer-hint'),"textContent",()=>data.recording?I18n.t('Escuchando · Esc para terminar'):I18n.t('Revisa el dictado · ⌘↵ para enviar'));
 if(!data.recording)dictationAnchor=null;
}
if(preview&&!native&&query.get('screen')==='copilot'){
 selectAgent(state.agents[1].id);aiScope=selected;aiRequestID=1;acceptIntelligence({requestId:1,agentId:aiScope,kind:'unblock',source:I18n.t('Vista de diseño · ejemplo'),generatedAt:Date.now()/1000,capturedAt:Date.now()/1000,sources:1,headline:I18n.t('Listo para validar el siguiente paso'),summary:I18n.t('La implementación está terminada. Queda pendiente validar el flujo de autenticación.'),blocker:I18n.t('El registro no confirma la causa del bloqueo.'),nextStep:I18n.t('Revisa el último intercambio antes de reanudar el objetivo.'),draft:I18n.t('¿Qué decisión necesitas para continuar?')});
}

if(preview&&!native&&query.get('screen')==='checkpoints'){
 selectAgent(state.agents[1].id);aiScope=selected;aiRequestedAgent=selected;
 const now=Date.now()/1000,base={agentId:selected,kind:'checkpoint',source:I18n.t('Vista de diseño · ejemplo')};
 const sample=state.agents.find(a=>a.id===selected);delete checkpointStore[checkpointKey(sample)];
 if(query.get('state')!=='empty'){
  recordCheckpoint({...base,generatedAt:now-3600,capturedAt:now-3600,headline:I18n.t('El acceso del equipo ya está definido'),summary:I18n.t('El equipo cuenta con un flujo de acceso acordado. La experiencia de recuperación de cuenta sigue pendiente.'),changes:[I18n.t('Acordado un acceso único para todas las personas del equipo.'),I18n.t('Definidos los permisos de cada perfil para evitar accesos indebidos.')],nextStep:I18n.t('Completar y validar la recuperación de cuenta.')});
  const latest={...base,generatedAt:now-180,capturedAt:now-210,headline:I18n.t('Recuperar el acceso ya es más sencillo'),summary:I18n.t('Las personas del equipo pueden recuperar su cuenta sin ayuda de soporte en el entorno de prueba. Falta validar la experiencia antes de publicarla.'),changes:[I18n.t('Añadida la recuperación de cuenta para reducir la dependencia de soporte.'),I18n.t('Los mensajes explican cómo volver a entrar cuando caduca un enlace.'),I18n.t('El acceso conserva el perfil y los permisos de cada persona.')],nextStep:I18n.t('Validar el recorrido con una persona del equipo antes de publicarlo.')};
  recordCheckpoint(latest);aiResults.set(selected,latest);
 }
 if(query.get('state')==='loading')aiPending=true;
 if(query.get('state')==='error')aiError=I18n.t('No se pudo consultar el progreso. Reintenta.');
 $('#toast').hidden=true;
 renderCheckpoints();
}

renderSituation();

function updateTerminalLanguage(){
 if(window.Terminal)Object.assign(Terminal.strings,{promptLabel:I18n.t('Mensaje para el agente'),tooMuchOutput:I18n.t('Consulta el terminal para ver la salida completa.')});
 for(const input of document.querySelectorAll('.xterm-helper-textarea'))input.setAttribute('aria-label',I18n.t('Mensaje para el agente'));
}
updateTerminalLanguage();
// Change only app-owned presentation. Agent processes and user drafts stay intact.
I18n.bind($('#app-language'),'value',()=>I18n.language);
$('#app-language').onchange=e=>I18n.setLanguage(e.target.value);
I18n.onChange(()=>{
 const focus=document.activeElement?.id;
 const values=[...document.querySelectorAll('input[id],textarea[id],select[id]')].map(el=>({id:el.id,value:el.value,checked:el.checked,selectionStart:el.selectionStart,selectionEnd:el.selectionEnd}));
 const details=[...document.querySelectorAll('details')].map((el,index)=>({id:el.id,index,open:el.open}));
 worldSignature='';briefSignature='';checkpointSignature='';
 render();renderSituation();renderCheckpoints();
 if(typeof renderWorkspaceBar==='function')renderWorkspaceBar();
 if(typeof operationsDialog!=='undefined'&&operationsDialog.open)renderOperations();
 if($('#launch-dialog').open){updateLaunchSubmit();renderSessionOptions()}
 if(typeof currentQuestion!=='undefined'&&currentQuestion){currentQuestion=null;updateHarnessQuestions()}
 for(const v of values){const el=document.getElementById(v.id);if(!el||v.id==='app-language')continue;el.value=v.value;if(typeof v.checked==='boolean')el.checked=v.checked;if(v.selectionStart!==null&&['TEXTAREA','INPUT'].includes(el.tagName))try{el.setSelectionRange(v.selectionStart,v.selectionEnd)}catch{}}
 for(const v of details){const el=v.id?document.getElementById(v.id):document.querySelectorAll('details')[v.index];if(el)el.open=v.open}
 $('#app-language').value=I18n.language;
 if(focus)document.getElementById(focus)?.focus({preventScroll:true});
 // xterm's screen-reader descriptions are ours too; terminal bytes stay untouched.
 updateTerminalLanguage();
 requestAnimationFrame(fitTerminal);
});
