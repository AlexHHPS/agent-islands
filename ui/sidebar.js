'use strict';
// Source list in the macOS sense: views, the islands with their most urgent signal, tools and settings.
// It replaces the old top bar so the traffic lights sit over the sidebar, as in Finder, Mail or Glim.
const sidebarSignalRank={blocked:0,waiting:1,working:2,plan:3,goal:4,ready:5,paused:6,idle:7};
function projectSignal(agents){
  let best='idle';
  for(const a of agents){const signal=agentSignal(a);if((sidebarSignalRank[signal]??9)<(sidebarSignalRank[best]??9))best=signal}
  return best;
}
// The agents working in an island, as overlapping marks of the tool each one runs (Rex stacks its tab icons the
// same way). The most urgent first; three at most, then a count.
function islandStateLabel(signal){
  return {blocked:I18n.t('Bloqueado'),waiting:I18n.t('Te necesita'),working:I18n.t('En marcha'),plan:I18n.t('Planificando'),goal:I18n.t('Goal'),ready:I18n.t('Turno terminado'),paused:I18n.t('En pausa')}[signal]||'';
}
function agentStack(agents){
  if(!agents.length)return '';
  const sorted=[...agents].sort((a,b)=>(sidebarSignalRank[agentSignal(a)]??9)-(sidebarSignalRank[agentSignal(b)]??9));
  const counts={};for(const a of agents)counts[harnessName(a.harness)]=(counts[harnessName(a.harness)]||0)+1;
  const label=Object.entries(counts).map(([name,n])=>n+' '+name).join(' · ');
  // Names and counts are data, not interface text: built as plain escaped markup so they skip the translation catalogue.
  return '<span class="agent-stack" role="img" aria-label="'+esc(label)+'" title="'+esc(label)+'">'+sorted.slice(0,3).map(a=>'<span class="stack-logo" aria-hidden="true">'+harnessLogo(a.harness)+'</span>').join('')+'</span>'+(agents.length>3?'<span class="stack-more" aria-hidden="true">+'+(agents.length-3)+'</span>':'');
}
function renderSidebar(){
  if(!$('#sidebar'))return;
  const open=state.agents.filter(isOpenTerminal),chosen=view==='terminals'?$('#terminal-project').value:'';
  I18n.bind($('#nav-terminals-count'),'textContent',()=>open.length?String(open.length):'');
  I18n.bind($('#nav-world-count'),'textContent',()=>state.projects.length?String(state.projects.length):'');
  const terminalsRow=$('.nav-row[data-view="terminals"]');
  if(chosen&&terminalsRow){terminalsRow.classList.remove('selected');terminalsRow.removeAttribute('aria-current')}
  const rows=state.projects.map(p=>{
    // Every live agent in the island, the app's own terminals and the ones it only observes.
    const agents=state.agents.filter(a=>a.projectId===p.id&&!a.closedAt&&a.state!=='exited'),attention=agents.filter(needsAttention).length,current=chosen===p.id;
    // Leading slot: who works there (tool marks, or the island glyph when nobody does). Trailing: the island's most
    // urgent state as a dot, only when there is one, plus how many agents wait for you.
    const signal=projectSignal(agents),stateName=islandStateLabel(signal);
    return ht`<button type="button" class="nav-row project-row signal-${signal}${current?' selected':''}" data-sidebar-project="${esc(p.id)}" title="${esc(p.path||p.name)}"${current?' aria-current="true"':''}><span class="island-lead">${agents.length?agentStack(agents):icon('island')}</span><span class="nav-label">${esc(p.name)}</span>${attention?ht`<span class="nav-badge" title="Te necesitan">${attention}</span>`:''}${stateName?'<i class="project-dot" role="img" aria-label="'+esc(stateName)+'" title="'+esc(stateName)+'"></i>':''}</button>`;
  }).join('');
  setMarkup($('#sidebar-projects'),rows||ht('<p class="sidebar-empty">Añade una carpeta para crear tu primera isla.</p>'));
}
$('#sidebar-projects').onclick=e=>{
  const row=e.target.closest('[data-sidebar-project]');if(!row)return;
  const chooser=$('#terminal-project'),id=row.dataset.sidebarProject;
  chooser.value=view==='terminals'&&chooser.value===id?'':id;
  if(view!=='terminals')setView('terminals');else renderTerminalDeck();
  renderSidebar();
};
// "Terminales" in the sidebar means every terminal: it clears the island and state filters.
$('.nav-row[data-view="terminals"]').addEventListener('click',()=>{
  if($('#terminal-project').value||deckSignal){$('#terminal-project').value='';deckSignal=null;renderTerminalDeck();renderSituation()}
  renderSidebar();
});
$('#terminal-project').addEventListener('change',()=>renderSidebar());
const setViewBeforeSidebar=setView;
// eslint-disable-next-line no-global-assign
setView=function(next){setViewBeforeSidebar(next);renderSidebar();if(typeof updateDragRegions==='function')updateDragRegions()};

// Accent colour (Settings → General). Remembered locally too, so the first frame already has it.
const accentColors=['green','blue','purple','pink','red','orange','yellow','graphite','system'];
function applyAccent(accent){
  accent=accentColors.includes(accent)?accent:'green';
  document.documentElement.dataset.accent=accent;
  try{localStorage.setItem('islands.accent',accent)}catch{}
}
{let initial=null;try{initial=localStorage.getItem('islands.accent')}catch{}applyAccent(initial)}
// Navigation sits in a toolbar above the content by default; Settings can move it to vertical tabs on either side (Rex: Above, Left Side, Right Side).
const navigationLayouts=['top','left','right'];
function applyNavigationLayout(layout){
  layout=navigationLayouts.includes(layout)?layout:'top';
  document.body.dataset.nav=layout;
  const bar=$('#sidebar'),workspace=$('.workspace');
  if(layout==='top'){if(bar.parentElement!==$('#app'))$('#app').insertBefore(bar,workspace)}
  else if(bar.parentElement!==workspace)workspace.prepend(bar);
  // As a toolbar, its empty space moves the window like any Mac toolbar; as a sidebar only the head strip does.
  bar.toggleAttribute('data-drag',layout==='top');
  try{localStorage.setItem('islands.navigation',layout)}catch{}
  requestAnimationFrame(()=>{if(view==='terminals')fitDeck();else fitTerminal();if(typeof updateDragRegions==='function')updateDragRegions()});
}
{let initial=new URLSearchParams(location.search).get('nav');try{initial=initial||localStorage.getItem('islands.navigation')}catch{}applyNavigationLayout(initial)}
// Interface style (Settings → General → Estilo). Glass: the window blurs behind everything and the content
// and inspector float as separate glass panes; the pane you work in stays clear, the other one recedes (Rex: 1 · 0.8).
function applyInterfaceStyle(style){
  style=style==='glass'?'glass':'classic';
  document.documentElement.dataset.style=style;
  try{localStorage.setItem('islands.style',style)}catch{}
}
{let initial=new URLSearchParams(location.search).get('style');try{initial=initial||localStorage.getItem('islands.style')}catch{}applyInterfaceStyle(initial)}
function setActivePane(target){
  const pane=target?.closest?.('.main-pane,.inspector');if(!pane)return;
  for(const el of document.querySelectorAll('.main-pane,.inspector'))el.classList.toggle('is-active-pane',el===pane);
}
document.addEventListener('pointerdown',e=>setActivePane(e.target),true);
document.addEventListener('focusin',e=>setActivePane(e.target));
setActivePane($('.main-pane'));
function sidebarHidden(){return document.body.classList.contains('sidebar-hidden')}
function toggleSidebar(force){
  if(document.body.dataset.nav==='top'&&typeof force!=='boolean')return;
  const hidden=typeof force==='boolean'?force:!sidebarHidden();
  document.body.classList.toggle('sidebar-hidden',hidden);
  try{localStorage.setItem('islands.sidebarHidden',hidden?'1':'0')}catch{}
  const label=()=>hidden?I18n.t('Mostrar barra lateral'):I18n.t('Ocultar barra lateral');
  I18n.attribute($('#sidebar-toggle'),'aria-label',label);I18n.bind($('#sidebar-toggle'),'title',()=>label()+' · ⌃⌘S');
  $('#sidebar-toggle').setAttribute('aria-expanded',String(!hidden));
  requestAnimationFrame(()=>{if(view==='terminals')fitDeck();else fitTerminal();if(typeof updateDragRegions==='function')updateDragRegions()});
}
try{toggleSidebar(localStorage.getItem('islands.sidebarHidden')==='1')}catch{toggleSidebar(false)}

// Settings live in their own window in the Mac app (⌘,). The browser preview keeps the dialog.
function openSettings(section='general'){
  if(native){send('openSettings',{section});return}
  $('#help-dialog').showModal();$('#app').setAttribute('aria-hidden','true');
}
// Atelier reads data-mode: auto follows the system, light and dark force a palette.
function applyAppearance(mode){document.documentElement.dataset.mode=mode==='light'||mode==='dark'?mode:'auto'}
renderSidebar();
