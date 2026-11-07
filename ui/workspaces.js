'use strict';
function workspaceScopeIdentity(data){const id=data.activeWorkspaceId || '';return id?JSON.stringify([id,(data.projectWorkspaces||[]).find(w=>w.id===id)?.projectIds || data.projects.map(p=>p.id)]):''}
let workspaceEditorId=null,workspaceSelection=[],workspacePending=false,workspaceSeen=workspaceScopeIdentity(state);
const workspaceBar=document.createElement('div');workspaceBar.id='workspace-bar';workspaceBar.dataset.slot='workspace-switcher';
workspaceBar.innerHTML=`<div class="workspace-choice"><label for="workspace-select">Workspace</label><select id="workspace-select" aria-describedby="workspace-context"><option value="">Todos los proyectos</option></select></div><div id="workspace-context"></div><div class="workspace-buttons"><button id="workspace-create" type="button">Crear workspace</button><button id="workspace-edit" type="button" hidden>Editar</button><span id="workspace-background" hidden></span></div>`;
$('.workspace').before(workspaceBar);
const workspaceDialog=document.createElement('dialog');workspaceDialog.id='workspace-dialog';workspaceDialog.dataset.slot='workspace-editor';
workspaceDialog.innerHTML=`<form id="workspace-form"><div class="dialog-heading"><div><span class="sheet-kicker">TU CONTEXTO DE TRABAJO</span><h2 id="workspace-editor-title">Crear workspace</h2></div><button id="workspace-close" type="button" class="icon-button" aria-label="Cerrar workspace">×</button></div><label for="workspace-name">Nombre</label><input id="workspace-name" required maxlength="80" placeholder="Portal · API y web" autocomplete="off"><div class="workspace-list-heading"><label for="workspace-search">Proyectos incluidos</label><button id="workspace-add-folders" type="button">Añadir carpetas…</button></div><input id="workspace-search" type="search" placeholder="Buscar proyectos o rutas…" aria-label="Buscar proyectos para el workspace"><div id="workspace-projects" role="group" aria-label="Seleccionar proyectos"></div><label for="workspace-primary">Proyecto principal</label><select id="workspace-primary" aria-describedby="workspace-primary-note"></select><p id="workspace-primary-note">Los agentes empiezan aquí y reciben los demás directorios incluidos.</p><p id="workspace-error" role="alert" hidden></p><div class="dialog-footer"><span id="workspace-selected-count" role="status"></span><button id="workspace-cancel" type="button">Cancelar</button><button id="workspace-save" type="submit" class="primary">Crear y abrir</button></div></form>`;
document.body.append(workspaceDialog);
function workspaceProjects(){return state.allProjects || state.projects}
function prepareWorkspaceSwitch(){
 if(dirty&&!confirm('Tienes cambios sin guardar. ¿Cambiar de workspace y descartarlos?'))return false;
 if(selected){switchComposerAgent(null);selected=null;$('#agent-view').hidden=true;$('#team-view').hidden=false;$('#inspector').classList.remove('has-agent')}
 currentFile=null;dirty=false;reportDirty();$('#code').value='';$('#code').disabled=true;$('#save-file').disabled=true;$('#file-name').textContent='Abre un archivo';
 return true;
}
function renderWorkspaceBar(){
 const groups=state.projectWorkspaces || [],active=state.activeWorkspaceId || '',select=$('#workspace-select');
 const html='<option value="">Todos los proyectos</option>'+groups.map(g=>`<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');if(select.innerHTML!==html)select.innerHTML=html;select.value=active;
 $('#workspace-edit').hidden=!active;
 $('#workspace-context').textContent=active?`${state.projects.length} proyectos · ${state.projects.map(p=>p.name).join(' + ')}`:'Elige varios proyectos para acotar el trabajo.';
 $('#workspace-context').title=state.projects.map(p=>p.path).join('\n');
 $('#workspace-background').hidden=!state.backgroundSessionCount;$('#workspace-background').textContent=`${state.backgroundSessionCount || 0} sesiones en segundo plano`;
 document.body.classList.toggle('workspace-scoped',!!active);
 if(workspaceDialog.open)renderWorkspaceProjects();
}
function editWorkspace(id=null){
 const group=(state.projectWorkspaces || []).find(g=>g.id===id);
 workspaceEditorId=group?.id || null;workspaceSelection=group?[...group.projectIds]:[];workspacePending=false;
 $('#workspace-name').value=group?.name || '';$('#workspace-search').value='';$('#workspace-error').hidden=true;
 $('#workspace-primary').replaceChildren();
 $('#workspace-editor-title').textContent=group?'Editar workspace':'Crear workspace';$('#workspace-save').textContent=group?'Guardar y abrir':'Crear y abrir';
 renderWorkspaceProjects();workspaceDialog.showModal();$('#workspace-name').focus();
}
function renderWorkspaceProjects(){
 const all=workspaceProjects(),term=$('#workspace-search').value.toLocaleLowerCase().trim(),visible=all.filter(p=>(p.name+' '+p.path).toLocaleLowerCase().includes(term));
 $('#workspace-projects').innerHTML=visible.length?visible.map(p=>`<label class="workspace-project"><input type="checkbox" value="${esc(p.id)}" ${workspaceSelection.includes(p.id)?'checked':''}><span><strong>${esc(p.name)}</strong><small>${esc(p.path)}</small></span></label>`).join(''):`<div class="workspace-empty">${all.length?'No hay proyectos con ese nombre.':'Añade dos o más carpetas para trabajar con ellas juntas.'}</div>`;
 $('#workspace-projects').querySelectorAll('input').forEach(input=>input.onchange=()=>{if(input.checked){if(!workspaceSelection.includes(input.value))workspaceSelection.push(input.value)}else workspaceSelection=workspaceSelection.filter(id=>id!==input.value);renderWorkspacePrimary()});renderWorkspacePrimary();
}
function renderWorkspacePrimary(){
 const select=$('#workspace-primary'),previous=select.value,all=workspaceProjects();
 select.innerHTML=workspaceSelection.map(id=>all.find(p=>p.id===id)).filter(Boolean).map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
 if(workspaceSelection.includes(previous))select.value=previous;
 $('#workspace-selected-count').textContent=`${workspaceSelection.length} proyectos seleccionados`;$('#workspace-save').disabled=workspacePending||!workspaceSelection.length||workspaceSelection.length>30;
}
$('#workspace-create').onclick=()=>editWorkspace();$('#workspace-edit').onclick=()=>editWorkspace(state.activeWorkspaceId);
$('#workspace-select').onchange=()=>{const id=$('#workspace-select').value;if(!prepareWorkspaceSwitch()){$('#workspace-select').value=state.activeWorkspaceId||'';return}send('workspaceActivate',{workspaceId:id})};
$('#workspace-search').oninput=renderWorkspaceProjects;$('#workspace-add-folders').onclick=()=>send('addProject',{registrationOnly:true});
$('#workspace-close').onclick=$('#workspace-cancel').onclick=()=>workspaceDialog.close();
$('#workspace-form').onsubmit=e=>{
 e.preventDefault();if(workspacePending||!workspaceSelection.length||!prepareWorkspaceSwitch())return;
 const primary=$('#workspace-primary').value,ids=[primary,...workspaceSelection.filter(id=>id!==primary)];
 workspacePending=true;$('#workspace-error').hidden=true;renderWorkspacePrimary();
 send('workspaceSave',{...(workspaceEditorId?{id:workspaceEditorId}:{}),name:$('#workspace-name').value.trim(),projectIds:ids,activate:true});
};
const workspaceReceiveNative=window.receiveNative;
window.receiveNative=message=>{
 if(message.event==='snapshot'){
  const next=workspaceScopeIdentity(message.data);
  if(next!==workspaceSeen){
   if(selected)switchComposerAgent(null);selected=null;$('#agent-view').hidden=true;$('#team-view').hidden=false;$('#docker-view').hidden=true;$('#inspector').classList.remove('has-agent');document.body.classList.remove('terminal-expanded');
   if(aiPending)cancelPulse();clearTimeout(aiScopeTimer);aiResults.clear();aiError=false;aiScope=null;aiProject=null;aiFollow=true;briefProject=null;workspaceSeen=next;sessionRequest++;sessionCatalog=[];macCatalog=[];catalogLoading=false;skillCatalog=[];
   operations={environments:[],recipes:[],runs:[],leases:[],auth:[],logins:[],installations:[],incidents:[]};operationsPending.clear();
   if($('#launch-dialog').open)$('#launch-dialog').close();if($('#search-dialog').open)$('#search-dialog').close();if($('#project-dialog').open)$('#project-dialog').close();
  }
 }
 workspaceReceiveNative(message);
 if(message.event==='snapshot')renderWorkspaceBar();
 if(message.event==='workspaceProjectsAdded'){for(const id of message.data.projectIds)if(!workspaceSelection.includes(id))workspaceSelection.push(id);renderWorkspaceProjects()}
 if(message.event==='workspaceResult'){
  workspacePending=false;renderWorkspacePrimary();
  if(message.data.success)workspaceDialog.close();else{$('#workspace-error').textContent=message.data.message || 'No se pudo guardar el workspace.';$('#workspace-error').hidden=false;$('#workspace-select').value=state.activeWorkspaceId||''}
 }
};
renderWorkspaceBar();
if(preview&&!native&&query.get('screen')==='workspace'){
 state.allProjects=[...state.projects];state.projectWorkspaces=[{id:'example',name:'Portal de clientes',projectIds:state.projects.slice(0,2).map(p=>p.id)}];
 if(query.get('state')==='empty')state.allProjects=[];
 editWorkspace();$('#workspace-name').value='Portal de clientes';workspaceSelection=state.allProjects.slice(0,2).map(p=>p.id);renderWorkspaceProjects();
 if(query.get('state')==='loading'){workspacePending=true;renderWorkspacePrimary()}
 if(query.get('state')==='error'){$('#workspace-error').hidden=false;$('#workspace-error').textContent='No se pudo guardar el workspace. Vuelve a intentarlo.'}
}
