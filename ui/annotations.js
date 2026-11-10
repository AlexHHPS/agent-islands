'use strict';
// Annotations: numbered markers where the user clicked, a small editor beside them, and an optional
// list with the agent's answers and a before/after strip. Drafts reach the agent only through Enviar.
let annotationList=[],annotationRevision=0,annotationTargets=[],annotationSpec=null,annotationEditing=null,annotationMarkersHidden=false,annotationFilter='open',annotationFocus=null,annotationPollTimer=null,annotationSeen=new Map(),annotationRailOpen=false,annotationSendTimer=null;
const annotationStored=(key,fallback)=>{try{return localStorage.getItem(key)??fallback}catch{return fallback}};
let annotationLevel=annotationStored('islands.annotationLevel','standard'),annotationIssuesDefault=annotationStored('islands.annotationIssues','true')!=='false';
const annotationImages=new Map();
const annotationStatus={draft:()=>I18n.t('Borrador'),pending:()=>I18n.t('Pendiente del agente'),acknowledged:()=>I18n.t('El agente está en ello'),resolved:()=>I18n.t('Resuelta'),dismissed:()=>I18n.t('Descartada'),proposed:()=>I18n.t('Propuesta del agente')};
const annotationIntent={fix:()=>I18n.t('Arreglar'),change:()=>I18n.t('Cambiar'),question:()=>I18n.t('Pregunta'),approve:()=>I18n.t('Aprobar')};
const annotationSeverity={blocking:()=>I18n.t('Bloqueante'),important:()=>I18n.t('Importante'),suggestion:()=>I18n.t('Sugerencia')};
const annotationLevels={compact:()=>I18n.t('Compacto'),standard:()=>I18n.t('Estándar'),detailed:()=>I18n.t('Completo')};
const annotationOpen=a=>['draft','proposed','pending','acknowledged'].includes(a.status);

$('#browser-stage').insertAdjacentHTML('beforeend',ht`<form id="annotation-popover" class="annotation-popover" hidden><button type="button" class="ap-head" id="annotation-details-toggle" aria-expanded="false" aria-controls="annotation-details"><span id="annotation-target"></span>${icon('chevron')}</button>
<div id="annotation-details" class="ap-details" hidden><code id="annotation-source" hidden></code><fieldset class="annotation-choice"><legend>Intención</legend><label><input type="radio" name="annotation-intent" value="fix">Arreglar</label><label><input type="radio" name="annotation-intent" value="change" checked>Cambiar</label><label><input type="radio" name="annotation-intent" value="question">Pregunta</label><label><input type="radio" name="annotation-intent" value="approve">Aprobar</label></fieldset>
<fieldset class="annotation-choice"><legend>Prioridad</legend><label><input type="radio" name="annotation-severity" value="blocking">Bloqueante</label><label><input type="radio" name="annotation-severity" value="important" checked>Importante</label><label><input type="radio" name="annotation-severity" value="suggestion">Sugerencia</label></fieldset>
<label class="check-line" id="annotation-issues-line" hidden><input type="checkbox" id="annotation-issues" checked><span id="annotation-issues-label"></span></label></div>
<blockquote id="annotation-quote" class="ap-quote" hidden></blockquote><label for="annotation-comment" class="sr-only">Qué debería cambiar</label><textarea id="annotation-comment" rows="2" maxlength="4000" placeholder="¿Qué debería cambiar?"></textarea>
<div class="annotation-popover-actions"><button type="button" id="annotation-delete" class="ap-danger" hidden>Eliminar</button><button type="button" id="annotation-cancel" class="ap-ghost">Cancelar</button><button type="submit" class="primary" id="annotation-add" disabled>Añadir</button></div></form>
<div id="annotation-peek" class="annotation-peek" hidden><em id="annotation-peek-name"></em><span id="annotation-peek-comment"></span></div>`);
$('#annotation-rail').innerHTML=ht`<div class="rail-head"><h3 id="annotation-heading">Anotaciones</h3><button type="button" id="annotation-rail-close" class="bw-icon" aria-label="Cerrar lista" title="Cerrar lista">${icon('close')}</button></div>
<div class="rail-filters" role="group" aria-label="Filtrar anotaciones"><button type="button" data-annotation-filter="open" aria-pressed="true">Abiertas</button><button type="button" data-annotation-filter="resolved" aria-pressed="false">Resueltas</button><button type="button" data-annotation-filter="all" aria-pressed="false">Todas</button></div>
<ol id="annotation-list" class="annotation-list"></ol>`;
document.body.insertAdjacentHTML('beforeend',ht`<dialog id="annotation-compare" class="annotation-compare"><div class="dialog-heading"><div><span class="sheet-kicker">ANTES Y DESPUÉS</span><h2 id="annotation-compare-title"></h2></div><button type="button" class="close-dialog icon-button" aria-label="Cerrar">×</button></div><div class="compare-stage" id="compare-stage"><img id="compare-before" alt="Antes del cambio" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"><img id="compare-after" alt="Después del cambio" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"><span class="compare-label compare-label-before">Antes</span><span class="compare-label compare-label-after">Después</span></div><label for="compare-slider" class="sr-only">Comparar antes y después</label><input id="compare-slider" type="range" min="0" max="100" value="50"><p id="compare-summary" class="compare-summary"></p><ul id="compare-code" class="compare-code"></ul></dialog>`);
function renderAnnotationSettings(){const b=$('#annotation-level');b.dataset.level=annotationLevel;I18n.bind($('#annotation-level-label'),"textContent",()=>annotationLevels[annotationLevel]());$('#annotation-issues-default').setAttribute('aria-checked',String(annotationIssuesDefault))}
$('#annotation-level').onclick=()=>{const order=Object.keys(annotationLevels);annotationLevel=order[(order.indexOf(annotationLevel)+1)%order.length];try{localStorage.setItem('islands.annotationLevel',annotationLevel)}catch{}renderAnnotationSettings()};
$('#annotation-issues-default').onclick=()=>{annotationIssuesDefault=!annotationIssuesDefault;try{localStorage.setItem('islands.annotationIssues',String(annotationIssuesDefault))}catch{}renderAnnotationSettings()};
$$('[data-annotation-filter]').forEach(b=>b.onclick=()=>{annotationFilter=b.dataset.annotationFilter;$$('[data-annotation-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderAnnotationRail();renderAnnotationMarkers()});
$('#annotation-markers-toggle').onclick=()=>annotationsToggleMarkers();
$('#annotation-rail-toggle').onclick=()=>annotationsRail(!annotationRailOpen);
$('#annotation-rail-close').onclick=()=>annotationsRail(false);
$('#annotation-clear').onclick=async()=>{const drafts=annotationList.filter(a=>a.status==='draft');if(!drafts.length)return;try{for(const a of drafts)await browserRPC('browser.annotation.delete',{annotationId:a.id});annotationList=annotationList.filter(a=>a.status!=='draft');annotationsCancel();renderAnnotationRail();renderAnnotationMarkers();browserStatus(I18n.count('borrador eliminado',drafts.length))}catch(e){browserStatus(e.message,true)}};
$('#annotation-compare .close-dialog').onclick=()=>$('#annotation-compare').close();
$('#compare-slider').oninput=e=>$('#compare-stage').style.setProperty('--reveal',e.target.value+'%');
$('#annotation-details-toggle').onclick=()=>{const open=$('#annotation-details').hidden;$('#annotation-details').hidden=!open;$('#annotation-details-toggle').setAttribute('aria-expanded',String(open))};
$('#annotation-comment').oninput=()=>{$('#annotation-add').disabled=!$('#annotation-comment').value.trim()};

function annotationsRail(open){annotationRailOpen=open;$('#annotation-rail').hidden=!open||!browserSession?.id;$('#annotation-rail-toggle').setAttribute('aria-pressed',String(open))}
function annotationsToggleMarkers(){annotationMarkersHidden=!annotationMarkersHidden;const b=$('#annotation-markers-toggle');b.setAttribute('aria-pressed',String(annotationMarkersHidden));b.innerHTML=icon(annotationMarkersHidden?'eyeOff':'eye');I18n.attribute(b,'aria-label',()=>annotationMarkersHidden?I18n.t('Mostrar marcadores'):I18n.t('Ocultar marcadores'));renderAnnotationMarkers()}
function annotationPath(url){try{return new URL(url).pathname}catch{return ''}}
// A marker follows its element through scrolling; fixed elements keep their viewport position.
function annotationBox(a,frame){
 if(!frame?.url||annotationPath(frame.url)!==annotationPath(a.url)||frame.width!==a.viewport?.width)return null;
 const fixed=a.targets?.[0]?.isFixed,scroll=frame.scroll||a.scroll;if(fixed||!scroll)return a.bounds;
 return {...a.bounds,x:a.docBounds.x-scroll.x,y:a.docBounds.y-scroll.y};
}
const annotationGroup=a=>a.kind==='region'||a.kind==='text'||a.kind==='multi'||a.targets?.length>1;
function annotationPinPoint(a,box){const pin=a.pin||{dx:box.width/2,dy:box.height/2};return browserBox({x:box.x+Math.min(Math.max(0,pin.dx),box.width),y:box.y+Math.min(Math.max(0,pin.dy),box.height),width:0,height:0})}
function renderAnnotationMarkers(){
 const layer=$('#annotation-layer');if(!layer||!browserSession?.width){if(layer)layer.innerHTML='';return}
 const pins=annotationMarkersHidden?[]:annotationList.filter(a=>a.status!=='dismissed'&&(annotationFilter==='all'||(annotationFilter==='open'?annotationOpen(a):a.status==='resolved'))).map(a=>({a,box:annotationBox(a,browserSession)})).filter(x=>x.box&&x.box.y+x.box.height>0&&x.box.y<browserSession.height);
 const selecting=annotationTargets.map(t=>browserBox(t.box)).map(b=>`<span class="annotation-outline" data-status="selecting" style="left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px"></span>`).join('');
 const composing=annotationSpec&&!annotationEditing?(()=>{const p=annotationSpec.pinAt||annotationPinPoint({},annotationSpec.box);return `<span class="annotation-pin" data-status="draft" data-composing="true"${annotationSpec.group?' data-group="true"':''} style="left:${p.left}px;top:${p.top}px">+</span>`})():'';
 layer.innerHTML=pins.map(({a,box})=>{const b=browserBox(box),p=annotationPinPoint(a,box);return `<span class="annotation-outline" data-outline="${esc(a.id)}" data-status="${esc(a.status)}"${annotationFocus===a.id?' data-focus="true"':''} style="left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px"></span><button type="button" class="annotation-pin" data-status="${esc(a.status)}" data-pin="${esc(a.id)}"${annotationGroup(a)?' data-group="true"':''} style="left:${p.left}px;top:${p.top}px" tabindex="-1"><span>${a.status==='resolved'?'✓':a.number}</span>${a.status==='draft'?icon('pencil'):''}</button>`}).join('')+selecting+composing;
 $$('[data-pin]').forEach(p=>{const id=p.dataset.pin;p.onclick=e=>{e.stopPropagation();annotationsMarkerClick(id)};p.onmouseenter=()=>annotationsPeek(id,p);p.onmouseleave=()=>annotationsPeek(null)});
}
// Hovering a marker shows a one-line preview of the note below it, or above near the bottom.
function annotationsPeek(id,pin){const peek=$('#annotation-peek');const a=id&&annotationList.find(x=>x.id===id);annotationsSetFocus(id||null);if(!a||!$('#annotation-popover').hidden){peek.hidden=true;return}
 $('#annotation-peek-name').textContent=annotationName(a);$('#annotation-peek-comment').textContent=a.comment||annotationStatus[a.status]?.()||'';peek.dataset.status=a.status;peek.hidden=false;
 const stage=$('#browser-stage').getBoundingClientRect(),r=pin.getBoundingClientRect(),w=peek.offsetWidth,h=peek.offsetHeight,cx=r.left+r.width/2-stage.left,below=r.bottom-stage.top+10;
 peek.style.left=Math.min(Math.max(8,cx-w/2),stage.width-w-8)+'px';peek.style.top=(below+h+8>stage.height?r.top-stage.top-h-10:below)+'px'}
function annotationsMarkerClick(id){const a=annotationList.find(x=>x.id===id);if(!a)return;$('#annotation-peek').hidden=true;
 if(a.status==='draft'){annotationsEdit(a);return}annotationsRail(true);annotationsFocus(id)}
// Focus only flips attributes so hovering the list never rebuilds the page layer.
function annotationsSetFocus(id){annotationFocus=id;for(const o of $$('[data-outline]'))o.toggleAttribute('data-focus',o.dataset.outline===id)}
function annotationsFocus(id){annotationsSetFocus(id);const card=$(`[data-annotation="${CSS.escape(id)}"]`);if(card){card.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});card.classList.add('is-focused');setTimeout(()=>card.classList.remove('is-focused'),1600)}}
function annotationsOnFrame(frame){renderAnnotationMarkers();$('#annotation-rail').hidden=!annotationRailOpen||!frame?.id;if(annotationSpec&&!$('#annotation-popover').hidden)annotationsPlace()}
function annotationsModeChanged(mode){if(mode!=='annotate'){annotationTargets=[];renderAnnotationMarkers()}if(mode==='navigate')annotationsCancel()}
function annotationsCancel(){annotationSpec=null;annotationEditing=null;$('#annotation-popover').hidden=true;annotationTargets=[];browserSelection(null);renderAnnotationMarkers()}
function annotationsEscape(){if(!$('#annotation-popover').hidden||annotationTargets.length){annotationsCancel();$('#browser-frame').focus({preventScroll:true});return true}return false}
function annotationName(a){return a.targets?.length>1?I18n.count('elemento seleccionado',a.targets.length):a.targets?.[0]?.name||(a.kind==='text'?I18n.t('Texto seleccionado'):I18n.t('Área de la página'))}
async function annotationsPick(point,adding){
 try{const r=await browserRPC('browser.inspect',{id:browserSession.id,frameToken:browserSession.frameToken,...point});const c=r.component;if(!c){browserStatus(I18n.t('No se encontró el componente.'),true);return}
  const target={...point,name:c.name||c.tag,box:{x:c.bounds.x+c.offset.x,y:c.bounds.y+c.offset.y,width:c.bounds.width,height:c.bounds.height},source:c.framework?.source||null};
  const existing=annotationTargets.findIndex(t=>t.name===target.name&&Math.abs(t.box.x-target.box.x)<1&&Math.abs(t.box.y-target.box.y)<1);
  if(adding){if(existing>=0)annotationTargets.splice(existing,1);else if(annotationTargets.length<12)annotationTargets.push(target);browserSelection(null);renderAnnotationMarkers();browserStatus(I18n.count('elemento seleccionado',annotationTargets.length)+' · '+I18n.t('Clic sin Mayúsculas para escribir la nota'));return}
  if(existing<0)annotationTargets.push(target);
  const targets=[...annotationTargets],x=Math.min(...targets.map(t=>t.box.x)),y=Math.min(...targets.map(t=>t.box.y));
  annotationsCompose({kind:'element',targets,group:targets.length>1,name:targets.length>1?I18n.count('elemento seleccionado',targets.length):target.name,box:{x,y,width:Math.max(...targets.map(t=>t.box.x+t.box.width))-x,height:Math.max(...targets.map(t=>t.box.y+t.box.height))-y},point,source:targets.length===1?target.source:null});
 }catch(e){browserStatus(e.message,true)}
}
function annotationsCompose(spec){
 const box=spec.box||{x:spec.x,y:spec.y,width:spec.width,height:spec.height};if(!(box.width>=3&&box.height>=3)){browserStatus(I18n.t('Selecciona una región de al menos 3 × 3 píxeles.'),true);return}
 const point=spec.point||{x:box.x+box.width/2,y:box.y+box.height/2};annotationEditing=null;
 annotationSpec={...spec,box,group:spec.group||spec.kind==='region'||spec.kind==='text',pinAt:browserBox({x:point.x,y:point.y,width:0,height:0})};browserSelection(box,spec.kind==='element'?'picked':spec.kind==='text'?'text':'area');
 I18n.bind($('#annotation-target'),"textContent",()=>spec.name||(spec.kind==='text'?I18n.t('Texto seleccionado'):I18n.t('Área de la página')));
 const source=spec.source?.file||spec.source?.url;$('#annotation-source').hidden=!source;$('#annotation-source').textContent=source?String(source).split('/').slice(-2).join('/')+(spec.source.line?':'+spec.source.line:''):'';
 const issues=Number(browserSession?.issues)||0;$('#annotation-issues-line').hidden=!issues;$('#annotation-issues').checked=annotationIssuesDefault;I18n.bind($('#annotation-issues-label'),"textContent",()=>I18n.count('aviso reciente de la página adjunto',issues));
 const form=$('#annotation-popover');form.querySelector('[name=annotation-intent][value='+(spec.kind==='text'?'fix':'change')+']').checked=true;form.querySelector('[name=annotation-severity][value=important]').checked=true;
 annotationsOpenEditor({comment:'',quote:'',placeholder:spec.group?(spec.kind==='text'?I18n.t('¿Qué debería decir?'):spec.targets?.length>1?I18n.t('Nota para este grupo de elementos…'):I18n.t('¿Qué debería cambiar en esta zona?')):I18n.t('¿Qué debería cambiar?'),submit:I18n.t('Añadir')});
 renderAnnotationMarkers();
}
function annotationsEdit(a){
 const box=annotationBox(a,browserSession);if(!box)return;annotationTargets=[];annotationEditing=a.id;annotationSpec={kind:a.kind,box,group:annotationGroup(a),pinAt:annotationPinPoint(a,box)};browserSelection(box,'picked');
 I18n.bind($('#annotation-target'),"textContent",()=>annotationName(a));const source=annotationSource(a);$('#annotation-source').hidden=!source;$('#annotation-source').textContent=source;$('#annotation-issues-line').hidden=true;
 const form=$('#annotation-popover');form.querySelector(`[name=annotation-intent][value=${a.intent}]`).checked=true;form.querySelector(`[name=annotation-severity][value=${a.severity}]`).checked=true;
 annotationsOpenEditor({comment:a.comment||'',quote:a.selectedText||'',placeholder:I18n.t('¿Qué debería cambiar?'),submit:I18n.t('Guardar'),edit:true});renderAnnotationMarkers();
}
function annotationsOpenEditor({comment,quote,placeholder,submit,edit=false}){
 const form=$('#annotation-popover');$('#annotation-comment').value=comment;$('#annotation-comment').placeholder=placeholder;$('#annotation-add').textContent=submit;$('#annotation-add').disabled=!comment.trim();$('#annotation-delete').hidden=!edit;
 $('#annotation-quote').hidden=!quote;$('#annotation-quote').textContent=quote?'«'+quote.slice(0,80)+(quote.length>80?'…':'')+'»':'';
 $('#annotation-details').hidden=true;$('#annotation-details-toggle').setAttribute('aria-expanded','false');$('#annotation-peek').hidden=true;$('#browser-hover').hidden=true;
 form.hidden=false;form.classList.remove('is-entering');void form.offsetWidth;form.classList.add('is-entering');annotationsPlace();$('#annotation-comment').focus({preventScroll:true});
}
// The editor centres on the marker, 20 px below it, or above when the marker is near the bottom.
function annotationsPlace(){const form=$('#annotation-popover'),p=annotationSpec?.pinAt;if(!p)return;const stage=$('#browser-stage').getBoundingClientRect(),w=form.offsetWidth,h=form.offsetHeight;
 form.style.left=Math.min(Math.max(8,p.left-w/2),Math.max(8,stage.width-w-8))+'px';const below=p.top+20;form.style.top=Math.max(8,below+h+8>stage.height?p.top-h-20:below)+'px'}
$('#annotation-cancel').onclick=()=>{annotationsCancel();$('#browser-frame').focus({preventScroll:true})};
$('#annotation-delete').onclick=()=>{const id=annotationEditing;annotationsCancel();if(id)annotationAct('delete',id)};
$('#annotation-comment').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(!$('#annotation-add').disabled)$('#annotation-popover').requestSubmit()}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();annotationsCancel();$('#browser-frame').focus({preventScroll:true})}};
// Clicking outside an unsaved note shakes the editor instead of dropping what was typed.
document.addEventListener('pointerdown',e=>{const form=$('#annotation-popover');if(form.hidden||form.contains(e.target)||!$('#annotation-comment').value.trim()||!$('#browser-stage').contains(e.target))return;e.stopPropagation();e.preventDefault();form.classList.remove('is-shaking');void form.offsetWidth;form.classList.add('is-shaking')},true);
$('#annotation-popover').onsubmit=async e=>{
 e.preventDefault();const spec=annotationSpec;if(!spec||!browserSession)return;const form=e.target,button=$('#annotation-add');button.disabled=true;
 const value=name=>form.querySelector(`[name=${name}]:checked`)?.value;
 try{
  if(annotationEditing){const a=await browserRPC('browser.annotation.update',{annotationId:annotationEditing,comment:$('#annotation-comment').value,intent:value('annotation-intent'),severity:value('annotation-severity')});upsertAnnotation(a);annotationsCancel();return}
  const params={id:browserSession.id,frameToken:browserSession.frameToken,kind:spec.kind,comment:$('#annotation-comment').value,intent:value('annotation-intent'),severity:value('annotation-severity'),includeIssues:$('#annotation-issues').checked};
  if(spec.kind==='element')params.targets=spec.targets.map(t=>({x:t.x,y:t.y}));else Object.assign(params,spec.box);
  const a=await browserRPC('browser.annotation.create',params);upsertAnnotation(a,true);annotationsCancel();$('#browser-frame').focus({preventScroll:true});
 }catch(err){browserStatus(err.message,true)}finally{button.disabled=!$('#annotation-comment').value.trim()}
};
function upsertAnnotation(a,fresh=false){const i=annotationList.findIndex(x=>x.id===a.id);if(i>=0)annotationList[i]=a;else annotationList.unshift(a);renderAnnotationRail();renderAnnotationMarkers();if(fresh){const pin=$(`[data-pin="${CSS.escape(a.id)}"]`);pin?.classList.add('is-confirmed')}}
async function annotationImage(a,which){const key=a.id+':'+which+':'+(which==='after'?a.afterAt:a.createdAt);if(annotationImages.has(key))return annotationImages.get(key);const task=browserRPC('browser.annotation.image',{annotationId:a.id,which}).then(r=>r.image).catch(()=>null);annotationImages.set(key,task);return task}
function annotationSource(a){const s=a.targets?.[0]?.sourceLocation;return s?.file?s.file.split('/').slice(-2).join('/')+(s.line?':'+s.line:''):''}
function renderAnnotationDock(){
 const open=annotationList.filter(annotationOpen).length,drafts=annotationList.filter(a=>a.status==='draft').length,news=annotationList.filter(a=>a.status==='proposed'||a.status==='resolved'&&!a.seenResolved).length;
 const count=$('#annotation-send-count');count.hidden=!drafts;count.textContent=String(drafts);$('#annotation-send').disabled=!drafts;$('#annotation-clear').disabled=!drafts;$('#annotation-markers-toggle').disabled=!annotationList.length;
 I18n.attribute($('#annotation-send'),'aria-label',()=>drafts?I18n.count('anotación al mensaje',drafts):I18n.t('Añadir al mensaje'));
 const badge=$('#browser-dock-badge');badge.hidden=!open;badge.textContent=String(open);
 $('#annotation-rail-toggle').dataset.news=news?'true':'false';
}
function renderAnnotationRail(){
 renderAnnotationDock();const list=$('#annotation-list');if(!list)return;
 const visible=annotationList.filter(a=>annotationFilter==='all'||(annotationFilter==='open'?annotationOpen(a):a.status==='resolved'||a.status==='dismissed'));
 const open=annotationList.filter(annotationOpen).length;
 I18n.bind($('#annotation-heading'),"textContent",()=>annotationList.length?I18n.count('anotación abierta',open):I18n.t('Anotaciones'));
 list.innerHTML=visible.length?visible.map(a=>{const source=annotationSource(a);return ht`<li class="annotation-card" data-annotation="${esc(a.id)}" data-status="${esc(a.status)}"><button type="button" class="annotation-pin" data-status="${esc(a.status)}" data-card-pin="${esc(a.id)}"${annotationGroup(a)?' data-group="true"':''} aria-label="Ver en la página"><span>${a.status==='resolved'?'✓':String(a.number)}</span></button><div class="annotation-main"><div class="annotation-meta"><strong>${esc(annotationName(a))}</strong><span class="annotation-state">${esc(annotationStatus[a.status]?.()||a.status)}</span></div>${a.comment?`<p class="annotation-comment">${esc(a.comment)}</p>`:''}${a.selectedText?`<blockquote class="annotation-quote">${esc(a.selectedText.slice(0,160))}</blockquote>`:''}<div class="annotation-chips"><span data-intent="${esc(a.intent)}">${esc(annotationIntent[a.intent]())}</span><span data-severity="${esc(a.severity)}">${esc(annotationSeverity[a.severity]())}</span>${source?`<code title="${esc(a.targets[0].sourceLocation.file)}">${esc(source)}</code>`:''}${a.styleChanges?.length?ht`<span>Estilo probado</span>`:''}${a.author==='agent'?ht`<span>Del agente</span>`:''}</div>${a.thread.length?`<ol class="annotation-thread">${a.thread.slice(-4).map(m=>`<li data-role="${esc(m.role)}"><b>${esc(m.role==='agent'?I18n.t('Agente'):I18n.t('Tú'))}</b> ${esc(m.content)}</li>`).join('')}</ol>`:''}${a.images?.after?ht`<button type="button" class="annotation-strip" data-compare="${esc(a.id)}"><img data-thumb="${esc(a.id)}" data-which="before" alt="Antes"><img data-thumb="${esc(a.id)}" data-which="after" alt="Después"><span>Comparar antes y después</span></button>`:''}${a.code?.after?.files?.length?ht`<p class="annotation-code">${esc(I18n.count('archivo cambiado',a.code.after.files.length))}</p>`:''}${a.verification&&!a.verification.captured?`<p class="annotation-note">${esc(a.verification.reason||'')}</p>`:''}<div class="annotation-actions">${annotationActions(a)}</div>${a.status==='draft'&&a.kind!=='region'&&a.kind!=='text'&&!a.targets?.[0]?.frameChain?.length?annotationStyleForm(a):''}<form class="annotation-reply" data-reply-form="${esc(a.id)}" hidden><label class="sr-only" for="reply-${esc(a.id)}">Responder</label><textarea id="reply-${esc(a.id)}" rows="2" maxlength="4000"></textarea><button type="submit">Enviar respuesta</button></form></div></li>`}).join(''):
  ht`<li class="annotation-empty">${annotationList.length?I18n.t('Nada en esta vista.'):I18n.t('Aún no hay anotaciones.')}</li>`;
 for(const img of list.querySelectorAll('[data-thumb]')){const a=annotationList.find(x=>x.id===img.dataset.thumb);if(a)annotationImage(a,img.dataset.which).then(src=>{if(src&&img.isConnected)img.src=src})}
 list.querySelectorAll('[data-card-pin]').forEach(b=>b.onclick=()=>annotationsSetFocus(b.dataset.cardPin));
 list.querySelectorAll('.annotation-card').forEach(card=>{card.onmouseenter=()=>annotationsSetFocus(card.dataset.annotation);card.onmouseleave=()=>annotationsSetFocus(null)});
 list.querySelectorAll('[data-annotation-action]').forEach(b=>b.onclick=()=>annotationAct(b.dataset.annotationAction,b.closest('[data-annotation]').dataset.annotation));
 list.querySelectorAll('[data-compare]').forEach(b=>b.onclick=()=>openAnnotationCompare(b.dataset.compare));
 list.querySelectorAll('[data-reply-form]').forEach(f=>f.onsubmit=async e=>{e.preventDefault();const message=f.querySelector('textarea').value.trim();if(!message)return;try{upsertAnnotation(await browserRPC('browser.annotation.reply',{annotationId:f.dataset.replyForm,message}))}catch(err){browserStatus(err.message,true)}});
 list.querySelectorAll('[data-style-form]').forEach(f=>f.onsubmit=async e=>{e.preventDefault();const styles={};for(const input of f.querySelectorAll('[data-style]'))if(input.value&&input.dataset.dirty)styles[input.dataset.style]=input.value;try{upsertAnnotation(await browserRPC('browser.annotation.preview',{annotationId:f.dataset.styleForm,styles}));browserStatus(I18n.t('Estilo aplicado en la página. El agente lo pasará al código.'))}catch(err){browserStatus(err.message,true)}});
 list.querySelectorAll('[data-style]').forEach(i=>i.oninput=()=>{i.dataset.dirty='1'});
}
function annotationActions(a){
 const b=(action,label,primary)=>`<button type="button" data-annotation-action="${action}"${primary?' class="primary"':''}>${esc(label)}</button>`;
 if(a.status==='draft')return b('edit',I18n.t('Editar'))+b('delete',I18n.t('Eliminar'));
 if(a.status==='proposed')return b('accept',I18n.t('Aceptar'),true)+b('dismiss',I18n.t('Descartar'));
 if(a.status==='resolved')return b('verify',I18n.t('Recapturar'))+b('reply',I18n.t('Pedir otro ajuste'));
 if(a.status==='dismissed')return b('reply',I18n.t('Responder'));
 return b('reply',I18n.t('Responder'))+b('resolve',I18n.t('Marcar resuelta'));
}
function annotationStyleForm(a){const current=a.targets?.[0]?.styles||{},tried=Object.fromEntries((a.styleChanges||[]).map(c=>[c.property,c.to]));
 const field=(prop,label,type)=>{const value=tried[prop]||current[prop]||'';const hex=type==='color'?annotationHex(value):value;return `<label><span>${esc(label)}</span><input data-style="${prop}" type="${type}" value="${esc(hex)}"${tried[prop]?' data-dirty="1"':''}></label>`};
 return ht`<details class="annotation-style"${a.styleChanges?.length?' open':''}><summary>Ajustar estilo en vivo</summary><form data-style-form="${esc(a.id)}">${field('color',I18n.t('Texto'),'color')}${field('background-color',I18n.t('Fondo'),'color')}${field('font-size',I18n.t('Tamaño de letra'),'text')}${field('padding',I18n.t('Relleno'),'text')}${field('border-radius',I18n.t('Radio'),'text')}<div class="annotation-actions"><button type="submit">Probar en la página</button>${a.styleChanges?.length?`<button type="button" data-annotation-action="reset-style">${esc(I18n.t('Deshacer'))}</button>`:''}</div></form></details>`}
function annotationHex(value){const m=String(value).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);return m?'#'+m.slice(1,4).map(n=>Number(n).toString(16).padStart(2,'0')).join(''):/^#[0-9a-f]{6}$/i.test(value)?value:'#000000'}
async function annotationAct(action,id){
 try{
  if(action==='edit'){const a=annotationList.find(x=>x.id===id);if(a){if(browserMode==='navigate')setBrowserMode('annotate');annotationsEdit(a)}return}
  if(action==='reply'){const f=$(`[data-reply-form="${CSS.escape(id)}"]`);f.hidden=!f.hidden;if(!f.hidden)f.querySelector('textarea').focus();return}
  if(action==='delete'){await browserRPC('browser.annotation.delete',{annotationId:id});annotationList=annotationList.filter(a=>a.id!==id);renderAnnotationRail();renderAnnotationMarkers();return}
  if(action==='reset-style'){upsertAnnotation(await browserRPC('browser.annotation.preview',{annotationId:id,reset:true}));return}
  const method={accept:'browser.annotation.accept',dismiss:'browser.annotation.dismiss',resolve:'browser.annotation.resolve',verify:'browser.annotation.verify'}[action];if(!method)return;
  if(action==='verify')browserStatus(I18n.t('Recapturando el elemento…'));
  const a=await browserRPC(method,{annotationId:id});upsertAnnotation(a);
  if(a.verification)browserStatus(a.verification.captured?I18n.t('Captura posterior lista. Compara antes y después.'):a.verification.reason,!a.verification.captured);
 }catch(e){browserStatus(e.message,true)}
}
// Sending turns the drafts into one composer reference; the icon confirms with a check for two seconds.
$('#annotation-send').onclick=async()=>{
 const ids=annotationList.filter(a=>a.status==='draft').map(a=>a.id);if(!ids.length)return;const button=$('#annotation-send');button.disabled=true;
 try{await browserRPC('browser.annotation.send',{annotationIds:ids,level:annotationLevel});annotationList=annotationList.map(a=>ids.includes(a.id)?{...a,status:'pending'}:a);renderAnnotationRail();renderAnnotationMarkers();
  button.innerHTML=icon('check');button.dataset.done='true';clearTimeout(annotationSendTimer);annotationSendTimer=setTimeout(()=>{button.innerHTML=icon('send');delete button.dataset.done},2000);browserStatus(I18n.t('Añadidas al mensaje. Pulsa Enviar en el chat.'))}
 catch(e){browserStatus(e.message,true)}finally{renderAnnotationDock()}
};
async function openAnnotationCompare(id){
 const a=annotationList.find(x=>x.id===id);if(!a)return;const [before,after]=await Promise.all([annotationImage(a,'before'),annotationImage(a,'after')]);if(!before||!after){browserStatus(I18n.t('La captura no está disponible.'),true);return}
 $('#compare-before').src=before;$('#compare-after').src=after;$('#compare-slider').value=50;$('#compare-stage').style.setProperty('--reveal','50%');
 I18n.bind($('#annotation-compare-title'),"textContent",()=>a.number+' · '+(a.targets?.[0]?.name||I18n.t('Área de la página')));
 $('#compare-summary').textContent=a.summary||a.comment||'';$('#compare-code').innerHTML=(a.code?.after?.files||[]).slice(0,12).map(f=>`<li><code>${esc(f.file)}</code><span>+${f.added} −${f.removed}</span></li>`).join('');
 $('#annotation-compare').showModal();
}
// The list follows the conversation that owns the browser; changes from the agent arrive by polling.
async function pollAnnotations(){
 if(!browserOwner||!native||document.hidden)return;const owner=browserOwner,generation=browserGeneration;
 try{const r=await browserRPC('browser.annotation.list',{since:annotationRevision});if(owner!==browserOwner||generation!==browserGeneration||r.unchanged)return;annotationRevision=r.revision;
  for(const a of r.annotations){const before=annotationSeen.get(a.id);if(before&&before!==a.status&&['acknowledged','resolved','dismissed'].includes(a.status)&&a.resolvedBy!=='human')toast(I18n.t('Anotación {0}: {1}',a.number,annotationStatus[a.status]()));if(!before&&a.status==='proposed')toast(I18n.t('El agente propone la anotación {0}.',a.number));annotationSeen.set(a.id,a.status)}
  annotationList=r.annotations;renderAnnotationRail();renderAnnotationMarkers();browserButton.dataset.updates=String(annotationList.filter(a=>a.status==='proposed'||a.status==='resolved'&&!a.seenResolved).length||'');
 }catch{}
}
function annotationsVisibility(visible){clearInterval(annotationPollTimer);annotationPollTimer=setInterval(pollAnnotations,visible?2500:6000);if(visible)pollAnnotations()}
const annotationSelectAgent=selectAgent;selectAgent=function(id){const owner=browserOwner;annotationSelectAgent(id);if(browserOwner!==owner){annotationList=[];annotationRevision=0;annotationSeen.clear();renderAnnotationRail()}};
renderAnnotationSettings();renderAnnotationRail();
if(preview&&!native&&query.get('screen')==='browser'&&query.get('state')!=='empty'){
 const now=Date.now()/1000,base={viewport:{width:1280,height:800},scroll:{x:0,y:0},url:'https://portal.ejemplo.com/equipo',thread:[],styleChanges:[],images:{before:'before.png'},createdAt:now};
 annotationList=[
  {...base,id:'p1',number:1,status:'acknowledged',kind:'element',intent:'change',severity:'blocking',comment:'El botón principal debe decir «Invitar al equipo» y ocupar todo el ancho en móvil.',bounds:{x:96,y:410,width:240,height:64},docBounds:{x:96,y:410,width:240,height:64},pin:{dx:200,dy:30},targets:[{name:'button "Invitar a una persona"',sourceLocation:{file:'src/team/InviteCard.tsx',line:42,exact:true}}],thread:[{role:'agent',content:'Visto. Cambio el texto y el ancho en InviteCard.',timestamp:now}]},
  {...base,id:'p2',number:2,status:'draft',kind:'text',intent:'fix',severity:'suggestion',comment:'«con las que vas a trabajar» suena largo; usa «de tu equipo».',selectedText:'Invita a las personas con las que vas a trabajar.',bounds:{x:64,y:224,width:600,height:30},docBounds:{x:64,y:224,width:600,height:30},targets:[{name:'p "Invita a las personas…"'}]},
  {...base,id:'p3',number:3,status:'resolved',kind:'element',intent:'fix',severity:'important',comment:'La tarjeta necesita más aire arriba.',bounds:{x:64,y:310,width:520,height:220},docBounds:{x:64,y:310,width:520,height:220},pin:{dx:440,dy:40},targets:[{name:'section "Acceso al equipo"',sourceLocation:{file:'src/team/AccessCard.tsx',line:12,exact:true}}],images:{before:'before.png',after:'after.png'},afterAt:now,summary:'Padding superior de 24 a 40 px.',code:{after:{files:[{file:'src/team/AccessCard.tsx',added:2,removed:1}]}},thread:[{role:'agent',content:'Padding superior de 24 a 40 px.',timestamp:now}]},
  {...base,id:'p4',number:4,status:'proposed',author:'agent',kind:'element',intent:'change',severity:'suggestion',comment:'El título y el subtítulo tienen poco contraste de jerarquía.',bounds:{x:64,y:150,width:640,height:60},docBounds:{x:64,y:150,width:640,height:60},pin:{dx:560,dy:30},targets:[{name:'h1 "Tu equipo, listo para empezar."'}]}
 ];
 const swatch=color=>'data:image/svg+xml;base64,'+btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="90"><rect width="240" height="90" rx="10" fill="${color}"/></svg>`);
 for(const a of annotationList){annotationImages.set(a.id+':before:'+a.createdAt,Promise.resolve(swatch('#e4ecdf')));annotationImages.set(a.id+':after:'+a.afterAt,Promise.resolve(swatch('#cfe0c8')))}
 renderAnnotationRail();renderAnnotationMarkers();
 if(query.get('state')==='annotate'){setBrowserMode('annotate');annotationsCompose({kind:'element',targets:[{x:216,y:442}],point:{x:300,y:442},name:'button "Invitar a una persona"',box:{x:96,y:410,width:240,height:64},source:{file:'src/team/InviteCard.tsx',line:42}})}
 if(query.get('state')==='list'){setBrowserMode('annotate');annotationsRail(true)}
 if(query.get('state')==='settings'){setBrowserMode('annotate');browserSettings(true)}
}
