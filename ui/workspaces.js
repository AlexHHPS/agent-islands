'use strict';
function workspaceScopeIdentity(data){const id=data.activeWorkspaceId || '';return id?JSON.stringify([id,(data.projectWorkspaces||[]).find(w=>w.id===id)?.projectIds || data.projects.map(p=>p.id)]):''}
let workspaceEditorId=null,workspaceSelection=[],workspacePending=false,workspaceSeen=workspaceScopeIdentity(state);
const workspaceBar=document.createElement('div');workspaceBar.id='workspace-bar';workspaceBar.dataset.slot='workspace-switcher';
// A pop-up button with a menu, as in a Mac toolbar: the choices are checkable menu items, the actions that open
// a sheet end in an ellipsis and sit below a separator.
workspaceBar.innerHTML=ht`<details class="control-menu" id="workspace-menu"><summary aria-haspopup="menu" title="Workspace">${icon('folder')}<span id="workspace-current">Todos los proyectos</span>${icon('popup')}</summary><div class="menu-items" role="menu" aria-label="Workspace"><div id="workspace-options" role="group"></div><p id="workspace-context" class="menu-note"></p><p id="workspace-background" class="menu-note" hidden></p><hr class="menu-separator"><button id="workspace-create" type="button" role="menuitem">Crear workspace…</button><button id="workspace-edit" type="button" role="menuitem" hidden>Editar workspace…</button></div></details>`;
$('#sidebar-workspace').append(workspaceBar);
const workspaceDialog=document.createElement('dialog');workspaceDialog.id='workspace-dialog';workspaceDialog.dataset.slot='workspace-editor';
workspaceDialog.innerHTML=ht`<form id="workspace-form"><div class="dialog-heading"><div><h2 id="workspace-editor-title">Crear workspace</h2></div><button id="workspace-close" type="button" class="icon-button" aria-label="Cerrar workspace" title="Cerrar workspace">${icon('close')}</button></div><label for="workspace-name">Nombre</label><input id="workspace-name" required maxlength="80" placeholder="Portal · API y web" autocomplete="off"><div class="workspace-list-heading"><label for="workspace-search">Proyectos incluidos</label><button id="workspace-add-folders" type="button">Añadir carpetas…</button></div><input id="workspace-search" type="search" placeholder="Buscar proyectos o rutas…" aria-label="Buscar proyectos para el workspace"><div id="workspace-projects" role="group" aria-label="Seleccionar proyectos"></div><label for="workspace-primary">Proyecto principal</label><select id="workspace-primary" aria-describedby="workspace-primary-note"></select><p id="workspace-primary-note">Los agentes empiezan aquí y reciben los demás directorios incluidos.</p><p id="workspace-error" role="alert" hidden></p><div class="dialog-footer"><span id="workspace-selected-count" role="status"></span><button id="workspace-cancel" type="button">Cancelar</button><button id="workspace-save" type="submit" class="primary">Crear y abrir</button></div></form>`;
document.body.append(workspaceDialog);
function workspaceProjects(){return state.allProjects || state.projects}
function prepareWorkspaceSwitch(){
 if(dirty&&!confirm(I18n.t('Tienes cambios sin guardar. ¿Cambiar de workspace y descartarlos?')))return false;
 currentFile=null;dirty=false;reportDirty();
 if(view==='agent')backToTeam();
 $('#code').value='';$('#code').disabled=true;$('#save-file').disabled=true;I18n.bind($('#file-name'),"textContent",()=>I18n.t('Abre un archivo'));
 return true;
}
function workspaceOption(id,name,active){return ht`<button type="button" role="menuitemradio" class="menu-check" data-workspace="${esc(id)}" aria-checked="${id===active?'true':'false'}"><span class="menu-check-mark">${icon('check')}</span><span class="menu-label">${esc(name)}</span></button>`}
function renderWorkspaceBar(){
 const groups=state.projectWorkspaces || [],active=state.activeWorkspaceId || '',options=$('#workspace-options');
 const html=workspaceOption('',I18n.t('Todos los proyectos'),active)+groups.map(g=>workspaceOption(g.id,g.name,active)).join('');if(options.innerHTML!==html)options.innerHTML=html;
 $('#workspace-edit').hidden=!active;
 I18n.bind($('#workspace-current'),'textContent',()=>groups.find(g=>g.id===active)?.name||I18n.t('Todos los proyectos'));
 I18n.bind($('#workspace-context'),"textContent",()=>active?I18n.count('project.count',state.projects.length)+' · '+state.projects.map(p=>p.name).join(' + '):'');
 I18n.bind($('#workspace-context'),"title",()=>state.projects.map(p=>p.path).join('\n'));
 $('#workspace-background').hidden=!state.backgroundSessionCount;I18n.bind($('#workspace-background'),"textContent",()=>I18n.count('background.count',state.backgroundSessionCount || 0));
 document.body.classList.toggle('workspace-scoped',!!active);
 if(workspaceDialog.open)renderWorkspaceProjects();
}
function editWorkspace(id=null){
 const group=(state.projectWorkspaces || []).find(g=>g.id===id);
 workspaceEditorId=group?.id || null;workspaceSelection=group?[...group.projectIds]:[];workspacePending=false;
 $('#workspace-name').value=group?.name || '';$('#workspace-search').value='';$('#workspace-error').hidden=true;
 $('#workspace-primary').replaceChildren();
 I18n.bind($('#workspace-editor-title'),"textContent",()=>group?I18n.t('Editar workspace'):I18n.t('Crear workspace'));I18n.bind($('#workspace-save'),"textContent",()=>group?I18n.t('Guardar y abrir'):I18n.t('Crear y abrir'));
 renderWorkspaceProjects();workspaceDialog.showModal();$('#workspace-name').focus();
}
function renderWorkspaceProjects(){
 const all=workspaceProjects(),term=$('#workspace-search').value.toLocaleLowerCase().trim(),visible=all.filter(p=>(p.name+' '+p.path).toLocaleLowerCase().includes(term));
 $('#workspace-projects').innerHTML=visible.length?visible.map(p=>ht`<label class="workspace-project"><input type="checkbox" value="${esc(p.id)}" ${workspaceSelection.includes(p.id)?'checked':''}><span><strong>${esc(p.name)}</strong><small>${esc(p.path)}</small></span></label>`).join(''):ht`<div class="workspace-empty">${all.length?I18n.t('No hay proyectos con ese nombre.'):I18n.t('Añade dos o más carpetas para trabajar con ellas juntas.')}</div>`;
 window.syncCheckedLabels?.($('#workspace-projects'));$('#workspace-projects').querySelectorAll('input').forEach(input=>input.onchange=()=>{if(input.checked){if(!workspaceSelection.includes(input.value))workspaceSelection.push(input.value)}else workspaceSelection=workspaceSelection.filter(id=>id!==input.value);renderWorkspacePrimary()});renderWorkspacePrimary();
}
function renderWorkspacePrimary(){
 const select=$('#workspace-primary'),previous=select.value,all=workspaceProjects();
 select.innerHTML=workspaceSelection.map(id=>all.find(p=>p.id===id)).filter(Boolean).map(p=>ht`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
 if(workspaceSelection.includes(previous))select.value=previous;
 I18n.bind($('#workspace-selected-count'),"textContent",()=>I18n.count('selected.count',workspaceSelection.length));$('#workspace-save').disabled=workspacePending||!workspaceSelection.length||workspaceSelection.length>30;
}
$('#workspace-create').onclick=()=>editWorkspace();$('#workspace-edit').onclick=()=>editWorkspace(state.activeWorkspaceId);
$('#workspace-options').onclick=e=>{const item=e.target.closest('[data-workspace]');if(!item)return;const id=item.dataset.workspace;$('#workspace-menu').open=false;if(id===(state.activeWorkspaceId||'')||!prepareWorkspaceSwitch())return;send('workspaceActivate',{workspaceId:id})};
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
   if(view==='agent')backToTeam();else clearAgentView();
   if(aiPending)cancelPulse();aiResults.clear();aiError=false;briefProject=null;workspaceSeen=next;sessionRequest++;sessionCatalog=[];macCatalog=[];catalogLoading=false;skillCatalog=[];
   operations={environments:[],recipes:[],runs:[],leases:[],auth:[],logins:[],installations:[],incidents:[]};operationsPending.clear();
   if($('#launch-dialog').open)$('#launch-dialog').close();if($('#search-dialog').open)$('#search-dialog').close();if($('#project-dialog').open)$('#project-dialog').close();
  }
 }
 workspaceReceiveNative(message);
 if(message.event==='snapshot')renderWorkspaceBar();
 if(message.event==='workspaceProjectsAdded'){for(const id of message.data.projectIds)if(!workspaceSelection.includes(id))workspaceSelection.push(id);renderWorkspaceProjects()}
 if(message.event==='workspaceResult'){
  workspacePending=false;renderWorkspacePrimary();
  if(message.data.success)workspaceDialog.close();else{I18n.bind($('#workspace-error'),"textContent",()=>message.data.message || I18n.t('No se pudo guardar el workspace.'));$('#workspace-error').hidden=false;renderWorkspaceBar()}
 }
};
renderWorkspaceBar();
if(preview&&!native&&query.get('screen')==='workspace'){
 state.allProjects=[...state.projects];state.projectWorkspaces=[{id:'example',name:I18n.t('Portal de clientes'),projectIds:state.projects.slice(0,2).map(p=>p.id)}];
 if(query.get('state')==='empty')state.allProjects=[];
 editWorkspace();$('#workspace-name').value=I18n.t('Portal de clientes');workspaceSelection=state.allProjects.slice(0,2).map(p=>p.id);renderWorkspaceProjects();
 if(query.get('state')==='loading'){workspacePending=true;renderWorkspacePrimary()}
 if(query.get('state')==='error'){$('#workspace-error').hidden=false;I18n.bind($('#workspace-error'),"textContent",()=>I18n.t('No se pudo guardar el workspace. Vuelve a intentarlo.'))}
}
