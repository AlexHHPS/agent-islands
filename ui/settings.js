/* Apache-2.0 · Settings window. Runs in its own WKWebView with a narrow native bridge:
   preferences only (language, appearance, notifications, voice) plus links into the main window. */
'use strict';
const native=!!window.webkit?.messageHandlers?.native;
const query=new URLSearchParams(location.search);
const $=s=>document.querySelector(s);
const send=(action,data={})=>{if(native)window.webkit.messageHandlers.native.postMessage({action,...data})};
const sections=['general','alerts','integrations','ai','help','about'];
// icon() comes from icons.js, shared with the main window.
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Defaults mirror native/Activity.swift; the snapshot replaces them with the stored choice.
const activityDefaults=()=>({attention:{notification:true,dock:true,sound:true},error:{notification:true,dock:true,sound:true},done:{notification:true,sound:false}});
let state={binaries:{},profiles:[],accent:'green',style:'classic',notifications:false,voice:false,appearance:'system',navigation:'top',aiSource:'',version:'',activity:activityDefaults()};
let current=sections.includes(query.get('section'))?query.get('section'):'general';
// The main window remembers the accent locally; start from it so the page does not flash green before the native event.
try{const saved=localStorage.getItem('islands.accent');if(saved)state.accent=saved}catch{}
document.documentElement.dataset.accent=state.accent;
if(!native&&query.has('preview'))state={binaries:{codex:'/opt/homebrew/bin/codex',claude:'/Users/you/.local/bin/claude',docker:'/usr/local/bin/docker'},profiles:[{id:'codex',harness:'codex'},{id:'claude',harness:'claude'},{id:'claude-personal',harness:'claude'}],accent:'green',style:'classic',notifications:true,voice:false,appearance:'system',navigation:'top',aiSource:'localhost · llama3.1',version:'0.17.1',activity:activityDefaults()};

function sectionLabel(id){return {general:t('General'),alerts:t('Avisos'),integrations:t('Integraciones'),ai:t('Inteligencia'),help:t('Ayuda'),about:t('Acerca de')}[id]}
function renderNav(){
 const icons={general:'settings',alerts:'bell',integrations:'plug',ai:'spark',help:'help',about:'info'};
 $('#settings-nav').innerHTML=`<div class="side-title">${escape(t('Ajustes'))}</div>`+sections.map(id=>`<button type="button" class="side-item" data-section="${id}"${id===current?' aria-current="page"':''}>${icon(icons[id])}<span>${escape(sectionLabel(id))}</span></button>`).join('');
 for(const b of document.querySelectorAll('.side-item'))b.onclick=()=>showSection(b.dataset.section);
}
const row=(label,control,note='')=>`<div class="row"><div class="row-label"><span>${escape(label)}</span>${note?`<small>${escape(note)}</small>`:''}</div><div class="row-control">${control}</div></div>`;
const toggle=(id,on,label)=>`<button type="button" class="switch" id="${id}" role="switch" aria-checked="${on}" aria-label="${escape(label)}"><span></span></button>`;
// Segmented controls are radio groups: one Tab stop (the checked option) and arrow keys to move, as in AppKit.
const segmented=(name,value,options,label)=>`<div class="seg" role="radiogroup" aria-label="${escape(label)}">${options.map(([v,text])=>`<button type="button" role="radio" class="seg-btn" data-${name}="${v}" aria-checked="${v===value}" tabindex="${v===value?0:-1}">${escape(text)}</button>`).join('')}</div>`;
// Accent swatches, as macOS's own accent picker: circles, a white dot on the chosen one, the name as a tooltip.
const accentChoices=()=>[['system',t('Sistema')],['graphite',t('Grafito')],['red',t('Rojo')],['orange',t('Naranja')],['yellow',t('Amarillo')],['green',t('Verde')],['blue',t('Azul')],['purple',t('Morado')],['pink',t('Rosa')]];
const swatches=value=>`<div class="swatches" role="radiogroup" aria-label="${escape(t('Color de acento'))}">${accentChoices().map(([v,name])=>`<button type="button" role="radio" class="swatch swatch-${v}" data-accent="${v}" aria-checked="${v===value}" tabindex="${v===value?0:-1}" aria-label="${escape(name)}" title="${escape(name)}"></button>`).join('')}</div>`;
function applyAccent(){document.documentElement.dataset.accent=state.accent||'green'}
const action=(id,text,external=false)=>`<button type="button" class="push" id="${id}">${escape(text)}${external?icon('external'):''}</button>`;

function renderGeneral(){
 return `<div class="group">${
  row(t('Idioma de la aplicación'),`<select id="set-language" class="popup" aria-label="${escape(t('Idioma de la aplicación'))}"><option value="es">Castellano</option><option value="en">English</option></select>`)
 }${row(t('Apariencia'),segmented('appearance',state.appearance,[['system',t('Sistema')],['light',t('Claro')],['dark',t('Oscuro')]],t('Apariencia')))}${row(t('Color de acento'),swatches(state.accent),t('Botones, selección y elementos activos.'))}${row(t('Estilo'),segmented('style',state.style,[['classic',t('Clásico')],['glass',t('Cristal')]],t('Estilo')),t('Cristal desenfoca toda la ventana y separa los paneles como láminas de vidrio.'))}${row(t('Navegación'),segmented('navigation',state.navigation,[['top',t('Arriba')],['left',t('Izquierda')],['right',t('Derecha')]],t('Navegación')),t('Arriba usa una barra de herramientas; a los lados, pestañas verticales con las islas.'))}</div>`;
}
// Each state chooses how it reaches you outside the app (Rex's Program Activity model). The card always shows it.
function renderAlerts(){
 const states=[['attention',t('Te necesita'),t('Una pregunta, un permiso o un goal bloqueado.')],['error',t('Error'),t('El agente informa de que algo ha fallado.')],['done',t('Turno terminado'),t('El agente ha acabado y espera tu siguiente mensaje.')]];
 const names={notification:t('Notificación'),dock:t('Dock'),sound:t('Sonido')};
 const chips=(state_,label)=>`<div class="chips" role="group" aria-label="${escape(label)}">${Object.keys(names).filter(c=>!(state_==='done'&&c==='dock')).map(c=>{
  const off=c==='notification'&&!state.notifications;
  return `<button type="button" class="chip-toggle" data-activity-state="${state_}" data-activity-channel="${c}" aria-pressed="${!!state.activity[state_][c]&&!off}"${off?` disabled title="${escape(t('Activa los avisos del sistema para recibir notificaciones.'))}"`:''}>${escape(names[c])}</button>`}).join('')}</div>`;
 return `<div class="group">${
  row(t('Avisos del sistema'),toggle('set-notifications',state.notifications,t('Avisos del sistema')),t('Permite que Agent Islands envíe notificaciones de macOS.'))
 }${row(t('Leer respuestas en voz alta'),toggle('set-voice',state.voice,t('Leer respuestas en voz alta')))}</div>
 <h2 class="group-title">${escape(t('Por estado'))}</h2>
 <div class="group">${states.map(([id,label,note])=>row(label,chips(id,label),note).replace('class="row"',`class="row state-row state-${id}"`)).join('')}</div>
 <p class="group-note">${escape(t('La tarjeta del agente se resalta siempre en la app. El Dock muestra cuántos agentes te esperan.'))}</p>`;
}
function renderAI(){
 const configured=!!state.aiSource;
 return `<div class="group">${
  row(t('Resúmenes con IA'),`<span class="value${configured?'':' muted'}">${escape(configured?state.aiSource:t('Sin configurar'))}</span>${action('open-ai',t('Configurar…'),true)}`,t('Opcional. Genera checkpoints y resúmenes con un modelo que elijas.'))
 }</div>
 <h2 class="group-title">${escape(t('Cuentas y entornos'))}</h2>
 <div class="group">${
  row(t('Perfiles de Codex y Claude Code'),action('open-profiles',t('Gestionar…'),true))
 }${row(t('QA y entornos desplegados'),action('open-qa',t('Abrir…'),true))}</div>
 <p class="footnote">${escape(t('Estas opciones se abren en la ventana principal.'))}</p>`;
}
function renderHelp(){
 const items=[
  [t('Conexiones reales'),t('Los agentes que abres aquí tienen una terminal interactiva completa. Los detectados fuera de la app se muestran en observación. No se toma el control de sus terminales.')],
  [t('Plan y goal'),t('Claude señala Plan automáticamente al usar EnterPlanMode y ExitPlanMode. Los tres botones son etiquetas visuales: no cambian los permisos ni crean un goal. Otros harnesses pueden emitir eventos de modo. Un goal se inicia desde su terminal.')],
  [t('Docker y servicios'),t('El puerto consulta tu contexto Docker activo. Muestra contenedores, estado, puertos y logs. Permite arrancar, parar y reiniciar cada contenedor. Abrir un puerto usa localhost; algunos servicios no hablan HTTP.')],
  [t('Voz y privacidad'),t('El micrófono solo escucha al pulsarlo. Revisa el dictado antes de enviarlo. Usa reconocimiento local cuando macOS lo permite; en otros casos el sistema puede usar sus servicios. La voz y los avisos son opcionales.')],
  [t('Esta primera versión'),t('El editor permite explorar, editar y guardar texto. Todavía no incluye LSP, depuración, búsqueda de contenido ni gestión visual de diffs. Las sesiones se cierran al salir; el harness conserva su propio historial.')]];
 return `<div class="group">${items.map(([title,body],i)=>`<details class="disclosure"${i===0?' open':''}><summary>${icon('arrow')}<span>${escape(title)}</span></summary><p>${escape(body)}</p></details>`).join('')}</div>`;
}
// Agents found in your PATH, with their official marks. Codex and Claude Code report live states through
// hooks that each terminal receives when it opens; the others run as plain terminals.
const agentCatalog=[['codex','Codex',true],['claude','Claude Code',true],['gemini','Gemini CLI',false],['opencode','OpenCode',false],['goose','Goose',false],['hermes','Hermes Agent',false],['aider','Aider',false]];
function renderIntegrations(){
 const agentRow=([id,name,live])=>{
  const path=state.binaries?.[id],profiles=(state.profiles||[]).filter(p=>p.harness===id).length;
  const note=path?path:t('No encontrado en el PATH');
  const status=path?(live?t('Estados en vivo'):t('Solo terminal')):t('No instalado');
  return `<div class="row integration-row${path?'':' is-missing'}"><span class="integration-logo">${harnessLogo(id)}</span><div class="row-label"><span>${escape(name)}</span><small class="${path?'is-path':''}" title="${escape(note)}">${escape(note)}</small></div><div class="row-control"><span class="status-pill${path&&live?' is-live':''}">${escape(status)}</span>${path&&profiles?`<button type="button" class="push small" data-open-profiles>${escape(profiles===1?t('1 perfil'):t('{0} perfiles',profiles))}</button>`:''}</div></div>`;
 };
 const docker=state.binaries?.docker;
 return `<div class="group">${agentCatalog.map(agentRow).join('')}</div>
 <p class="group-note">${escape(t('Agent Islands busca los agentes en tu PATH. Codex y Claude Code reciben los hooks de estado al abrir cada terminal; no hay que instalar nada.'))}</p>
 <h2 class="group-title">${escape(t('Servicios'))}</h2>
 <div class="group"><div class="row integration-row${docker?'':' is-missing'}"><span class="integration-logo">${harnessLogo('docker')}</span><div class="row-label"><span>Docker</span><small>${escape(docker||t('No encontrado en el PATH'))}</small></div><div class="row-control"><span class="status-pill${docker?' is-live':''}">${escape(docker?t('Puerto Docker activo'):t('No instalado'))}</span></div></div></div>`;
}
function renderAbout(){
 return `<div class="about"><div class="about-mark">${icon('island')}</div><h2>Agent Islands</h2><p class="muted">${escape(state.version?t('Versión {0}',state.version):'')}</p></div>
 <div class="group">${row(t('Licencia'),'<span class="value">Apache 2.0</span>')}${row(t('Datos'),`<span class="value">${escape(t('En tu Mac'))}</span>`)}</div>`;
}
// Rebuilding the section must not cost the user their place: keep the focused control and open disclosures.
// Scoped by class: <html> carries data-style and data-accent too, so a bare [data-…] selector would match it first.
const keyOf=el=>el?.id?'#'+CSS.escape(el.id):el?(el.classList.length?'.'+CSS.escape(el.classList[0]):el.tagName.toLowerCase())+[...el.attributes].filter(a=>a.name.startsWith('data-')).map(a=>`[${a.name}="${CSS.escape(a.value)}"]`).join(''):'';
function render(){
 const focused=document.activeElement&&document.activeElement!==document.body?keyOf(document.activeElement):'';
 const open=[...document.querySelectorAll('#settings-body details')].map(d=>d.open);
 document.title=t('Ajustes');renderNav();
 $('#settings-title').textContent=sectionLabel(current);
 $('#settings-body').innerHTML=({general:renderGeneral,alerts:renderAlerts,integrations:renderIntegrations,ai:renderAI,help:renderHelp,about:renderAbout})[current]();
 const language=$('#set-language');if(language){language.value=I18n.language;language.onchange=e=>I18n.setLanguage(e.target.value)}
 const flip=(id,key,act)=>{const b=$('#'+id);if(b)b.onclick=()=>{if(native)send(act);else{state[key]=!state[key];render()}}};
 flip('set-notifications','notifications','notifications');flip('set-voice','voice','voice');
 for(const b of document.querySelectorAll('[data-activity-state]'))b.onclick=()=>{
  const s=b.dataset.activityState,c=b.dataset.activityChannel,value=!state.activity[s][c];
  state.activity[s][c]=value;render();send('activityChannel',{state:s,channel:c,value});
 };
 // Scoped to the control: <html data-style> also matches [data-style] and would answer the bubbled click with the old value.
 for(const b of document.querySelectorAll('.swatches [data-accent]'))b.onclick=()=>{state.accent=b.dataset.accent;applyAccent();send('accentColor',{accent:state.accent});render()};
 for(const b of document.querySelectorAll('.seg [data-style]'))b.onclick=()=>{state.style=b.dataset.style;send('interfaceStyle',{style:state.style});render()};
 for(const b of document.querySelectorAll('[data-open-profiles]'))b.onclick=()=>send('openOperations',{tab:'profiles'});
 for(const b of document.querySelectorAll('.seg [data-navigation]'))b.onclick=()=>{state.navigation=b.dataset.navigation;send('navigationLayout',{layout:state.navigation});render()};
 for(const b of document.querySelectorAll('.seg [data-appearance]'))b.onclick=()=>{state.appearance=b.dataset.appearance;applyMode();send('appearance',{mode:state.appearance});render()};
 for(const [id,tab] of [['open-ai','ai'],['open-profiles','profiles'],['open-qa','qa']]){const b=$('#'+id);if(b)b.onclick=()=>send('openOperations',{tab})}
 [...document.querySelectorAll('#settings-body details')].forEach((d,i)=>{if(i in open)d.open=open[i]});
 if(focused){try{document.querySelector(focused)?.focus({preventScroll:true})}catch{}}
 for(const group of document.querySelectorAll('.seg, .swatches'))group.onkeydown=e=>{
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();
  const items=[...group.querySelectorAll('.seg-btn, .swatch')],i=items.indexOf(document.activeElement);
  const next=items[(i+(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1)+items.length)%items.length];next.click();
  requestAnimationFrame(()=>{try{document.querySelector(keyOf(next))?.focus()}catch{}});
 };
 window.updateDragRegions();
}
function showSection(id){
 if(!sections.includes(id))return;current=id;render();
 try{const url=new URL(location.href);url.searchParams.set('section',id);history.replaceState(null,'',url)}catch{}
 document.querySelector('.side-item[aria-current]')?.focus({preventScroll:true});
}
window.showSection=showSection;
function applyStyle(){document.documentElement.dataset.style=state.style==='glass'?'glass':'classic'}
function applyMode(){document.documentElement.dataset.mode={light:'light',dark:'dark'}[state.appearance]||'auto'}
window.receiveNative=({event,data})=>{
 if(event==='snapshot'){
  // Snapshots arrive every time an agent changes; redraw only when something this page shows has changed.
  const before=JSON.stringify([state.notifications,state.voice,state.activity,state.binaries,state.profiles]);
  state.notifications=!!data.notifications;state.voice=!!data.voice;if(data.activityChannels)state.activity=data.activityChannels;if(data.binaries)state.binaries=data.binaries;if(data.profiles)state.profiles=(data.profiles||[]).map(p=>({id:p.id,harness:p.harness}));
  if(data.language&&data.language!==I18n.language)I18n.setLanguage(data.language,{notify:false});
  if(JSON.stringify([state.notifications,state.voice,state.activity,state.binaries,state.profiles])!==before)render();
 }
 else if(event==='appearance'){state.appearance=data.mode||'system';applyMode();render()}
 else if(event==='navigationLayout'){state.navigation=data.layout||'top';render()}
 else if(event==='interfaceStyle'){state.style=data.style||'classic';applyStyle();render()}
 else if(event==='accentColor'){state.accent=data.accent||'green';applyAccent();render()}
 else if(event==='settingsState'){state.aiSource=data.aiSource||'';state.version=data.version||'';render()}
 else if(event==='settingsSection')showSection(data.section);
};
$('#settings-nav').addEventListener('keydown',e=>{
 if(!['ArrowDown','ArrowUp'].includes(e.key))return;e.preventDefault();
 const i=sections.indexOf(current)+(e.key==='ArrowDown'?1:-1);showSection(sections[(i+sections.length)%sections.length]);
});
I18n.onChange(()=>render());
applyMode();render();send('ready');
