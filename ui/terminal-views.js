'use strict';
function loadTerminalViews(){try{const rows=JSON.parse(localStorage.getItem('islands.terminalViews.v1')||'[]');return Array.isArray(rows)?rows.filter(v=>v&&typeof v.id==='string'&&typeof v.name==='string'&&typeof v.scope==='string'&&Array.isArray(v.members)&&v.members.every(m=>m&&typeof m.key==='string'&&typeof m.name==='string')):[]}catch{return []}}
let terminalViews=loadTerminalViews(),terminalViewSelection={},terminalViewEditing=null,terminalViewMembers=[],terminalViewEditorScope=null;
try{const saved=JSON.parse(localStorage.getItem('islands.terminalViewSelection.v1')||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))terminalViewSelection=saved}catch{}
function terminalViewScope(){return state.activeWorkspaceId||'all'}
function currentTerminalView(){return terminalViews.find(v=>v.scope===terminalViewScope()&&v.id===terminalViewSelection[terminalViewScope()])}
function saveTerminalViews(){try{localStorage.setItem('islands.terminalViews.v1',JSON.stringify(terminalViews));localStorage.setItem('islands.terminalViewSelection.v1',JSON.stringify(terminalViewSelection))}catch{}}
const terminalViewControls=document.createElement('div');terminalViewControls.className='terminal-view-controls';
terminalViewControls.innerHTML=ht`<label for="terminal-view-select">Vista guardada</label><select id="terminal-view-select"></select><button id="terminal-view-create" type="button">${icon('plus')} Crear vista</button><button id="terminal-view-edit" type="button" hidden>${icon('plan')} Editar vista</button>`;
$('#terminal-menu .menu-items').append(terminalViewControls);
const terminalViewDialog=document.createElement('dialog');terminalViewDialog.id='terminal-view-dialog';terminalViewDialog.dataset.slot='terminal-view-editor';
terminalViewDialog.innerHTML=ht`<form id="terminal-view-form"><div class="dialog-heading"><h2 id="terminal-view-title">Crear vista</h2><button id="terminal-view-cancel" class="icon-button" type="button" aria-label="Cerrar">${icon('close')}</button></div><label for="terminal-view-name">Nombre de la vista</label><input id="terminal-view-name" maxlength="80" required autocomplete="off"><fieldset id="terminal-view-members"><legend>Terminales de la vista</legend><div id="terminal-view-options"></div></fieldset><p id="terminal-view-empty" hidden>Abre un terminal para añadirlo a una vista.</p><div class="dialog-footer"><button id="terminal-view-delete" type="button" hidden>Eliminar vista</button><button id="terminal-view-save" class="primary" type="submit" disabled>Guardar vista</button></div></form>`;
document.body.append(terminalViewDialog);terminalViewDialog.setAttribute('aria-labelledby','terminal-view-title');
function renderTerminalViewControls(){
 const select=$('#terminal-view-select'),current=currentTerminalView();
 const markup=ht('<option value="">Todos los terminales</option>')+terminalViews.filter(v=>v.scope===terminalViewScope()).map(v=>ht`<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('');if(select.innerHTML!==markup)select.innerHTML=markup;select.value=current?.id||'';$('#terminal-view-edit').hidden=!current;
}
function terminalViewAgents(agents){
 let changed=false;for(const a of agents){const old=terminalPinKey(a,true),key=terminalPinKey(a);if(old!==key)for(const v of terminalViews)for(const member of v.members)if(member.key===old){member.key=key;changed=true}}
 if(changed)saveTerminalViews();renderTerminalViewControls();const current=currentTerminalView();
 if(!current)return agents;const keys=current.members.map(m=>m.key);return agents.filter(a=>keys.includes(terminalPinKey(a))).sort((a,b)=>keys.indexOf(terminalPinKey(a))-keys.indexOf(terminalPinKey(b)));
}
function renderTerminalViewLayout(count){
 const deck=$('#terminal-deck'),custom=!!currentTerminalView();deck.classList.toggle('custom-view',custom);deck.style.setProperty('--terminal-columns',count===1?'1':count<=4?'2':'3');deck.style.setProperty('--terminal-rows',String(Math.max(1,Math.ceil(count/(count===1?1:count<=4?2:3)))));deck.style.setProperty('--terminal-count',String(Math.max(1,count)));
}
function editTerminalView(id=null){
 const saved=terminalViews.find(v=>v.id===id&&v.scope===terminalViewScope());terminalViewEditorScope=terminalViewScope();terminalViewEditing=saved?.id||null;terminalViewMembers=saved?structuredClone(saved.members):[];
 $('#terminal-view-name').value=saved?.name||'';I18n.bind($('#terminal-view-title'),'textContent',()=>saved?I18n.t('Editar vista'):I18n.t('Crear vista'));$('#terminal-view-delete').hidden=!saved;
 const agents=state.agents.filter(isOpenTerminal),liveKeys=new Set(agents.map(a=>terminalPinKey(a)));
 $('#terminal-view-options').innerHTML=agents.map(a=>ht`<label class="terminal-view-option"><input type="checkbox" value="${esc(terminalPinKey(a))}" ${terminalViewMembers.some(m=>m.key===terminalPinKey(a))?'checked':''}><span><strong>${esc(a.name)}</strong><small>${esc(state.projects.find(p=>p.id===a.projectId)?.name||'')}</small></span></label>`).join('')+terminalViewMembers.filter(m=>!liveKeys.has(m.key)).map(m=>ht`<label class="terminal-view-option"><input type="checkbox" value="${esc(m.key)}" checked><span><strong>${esc(m.name)}</strong><small>Terminal cerrada o fuera de este contexto</small></span></label>`).join('');
 $('#terminal-view-empty').hidden=agents.length>0||terminalViewMembers.length>0;
 for(const input of $$('#terminal-view-options input'))input.onchange=()=>{terminalViewMembers=terminalViewMembers.filter(m=>m.key!==input.value);if(input.checked){const a=agents.find(a=>terminalPinKey(a)===input.value),old=saved?.members.find(m=>m.key===input.value);if(a||old)terminalViewMembers.push(a?{key:terminalPinKey(a),name:a.name}:old)}updateTerminalViewSave()};
 updateTerminalViewSave();terminalViewDialog.showModal();$('#terminal-view-name').focus();
}
function updateTerminalViewSave(){$('#terminal-view-save').disabled=!$('#terminal-view-name').value.trim()||terminalViewMembers.length===0}
$('#terminal-view-name').oninput=updateTerminalViewSave;
$('#terminal-view-create').onclick=()=>editTerminalView();$('#terminal-view-edit').onclick=()=>editTerminalView(currentTerminalView()?.id);$('#terminal-view-cancel').onclick=()=>terminalViewDialog.close();
$('#terminal-view-select').onchange=e=>{terminalViewSelection[terminalViewScope()]=e.target.value;$('#terminal-project').value='';saveTerminalViews();renderTerminalDeck()};
$('#terminal-view-form').onsubmit=e=>{e.preventDefault();if($('#terminal-view-save').disabled)return;const id=terminalViewEditing||crypto.randomUUID(),value={id,name:$('#terminal-view-name').value.trim().slice(0,80),scope:terminalViewScope(),members:terminalViewMembers};terminalViews=terminalViews.filter(v=>v.id!==id);terminalViews.push(value);terminalViewSelection[terminalViewScope()]=id;$('#terminal-project').value='';saveTerminalViews();terminalViewDialog.close();renderTerminalDeck()};
$('#terminal-view-delete').onclick=()=>{terminalViews=terminalViews.filter(v=>v.id!==terminalViewEditing);delete terminalViewSelection[terminalViewScope()];saveTerminalViews();terminalViewDialog.close();renderTerminalDeck()};
const terminalViewsReceiveNative=window.receiveNative;
window.receiveNative=message=>{terminalViewsReceiveNative(message);if(message.event==='snapshot'){renderTerminalViewControls();if(terminalViewDialog.open&&terminalViewEditorScope!==terminalViewScope())terminalViewDialog.close()}};
I18n.onChange(()=>{renderTerminalViewControls()});
document.addEventListener('visibilitychange',()=>document.body.classList.toggle('motion-paused',document.hidden));
if(view==='terminals')renderTerminalDeck();else renderTerminalViewControls();
