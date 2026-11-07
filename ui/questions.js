'use strict';
// Read the rendered screen rather than matching historical ANSI output.
function terminalScreenLines(term){
 const b=term?.buffer.active;if(!b)return [];
 return Array.from({length:term.rows},(_,i)=>b.getLine(b.baseY+i)?.translateToString(true) || '');
}
function detectHarnessQuestion(lines,harness){
 if(!['codex','claude'].includes(harness))return null;
 const text=lines.join('\n');
 const queued=text.match(/\b(\d+)\s+(?:questions?|preguntas?)\b/i);
 if(harness==='codex'&&queued&&/(?:to answer|para responder)/i.test(text))return {kind:'queued',count:+queued[1],signature:'queued:'+queued[1]};
 const choiceUI=/(?:enter.*(?:select|submit|confirm)|space.*select|tab.*(?:switch|next)|select.*option|elige.*opci[oó]n)/i.test(text);
 if(!choiceUI)return null;
 const options=[];
 for(let i=0;i<lines.length;i++){
  const match=lines[i].match(/^\s*([›❯>●○☐☑✓ ]*?)\s*(\d+)[.)]\s+(.+)$/);
  if(match)options.push({number:+match[2],label:match[3].trim(),selected:/[›❯>●]/.test(match[1]),line:i});
 }
 if(options.length<2||options.length>12){
  if(/enter.*to submit (?:answer|all)/i.test(text))return {kind:'text',title:'Respuesta libre',signature:'text:'+harness};
  return null;
 }
 const notes=/tab or esc to clear notes/i.test(text);
 // Absolute navigation is safe only when the current cursor is actually visible.
 const selected=options.findIndex(o=>o.selected),multi=/(?:space.*select|multi.select|select all that apply)/i.test(text);
 const before=lines.slice(Math.max(0,options[0].line-4),options[0].line).map(s=>s.trim()).filter(Boolean);
 const title=before.filter(s=>!/^[─━═╭╮│┌┐]+$/.test(s)).slice(-2).join(' ');
 return {kind:'choice',options,selected:notes?-1:selected,multi,notes,navigate:/navigate questions|tab.*(?:switch|next)/i.test(text),title:title || 'Tu agente necesita una respuesta',signature:JSON.stringify([options.map(o=>o.label),selected,multi,notes,title])};
}
let currentQuestion=null,questionUpdateTimer;
const questionBar=document.createElement('section');questionBar.id='agent-questions';questionBar.dataset.slot='agent-questions';questionBar.setAttribute('aria-label','Preguntas del agente');questionBar.hidden=true;
$('#terminal-host').before(questionBar);
const questionJump=document.createElement('button');questionJump.id='question-jump';questionJump.type='button';questionJump.title='Abrir preguntas de Codex · Mayús + ←';questionJump.textContent='Preguntas';questionJump.hidden=true;$('.terminal-keys').insertBefore(questionJump,$('#listen-agent'));
questionJump.onclick=()=>{scrollTerminalToBottom();send('input',{id:terminalTarget(),text:'\x1b[1;2D'});terminal?.focus()};
function updateHarnessQuestions(){
 if(!terminal||!selected){questionBar.hidden=true;questionJump.hidden=true;currentQuestion=null;return}
 const a=state.agents.find(a=>a.id===terminalTarget());
 questionJump.hidden=a?.harness!=='codex'||a?.processRunning===false;
 const question=detectHarnessQuestion(terminalScreenLines(terminal),a?.harness);
 if(!question){currentQuestion=null;questionBar.hidden=true;return}
 if(currentQuestion?.signature===question.signature&&currentQuestion.agent===a.id)return;
 currentQuestion={...question,agent:a.id};questionBar.hidden=false;
 if(question.kind==='text'){
  questionBar.innerHTML=`<div class="question-heading"><span>${icon('attention')}<strong>Tu agente espera una respuesta</strong></span><button id="question-write" class="question-answer">Escribir respuesta</button></div>`;
  $('#question-write').onclick=()=>{scrollTerminalToBottom();$('#prompt').focus();$('#composer-hint').textContent='Respuesta a la pregunta · ⌘↵ para enviar'};
  return;
 }
 if(question.kind==='queued'){
  questionBar.innerHTML=`<div class="question-heading"><span>${icon('attention')}<strong>${question.count} ${question.count===1?'pregunta pendiente':'preguntas pendientes'}</strong></span><button id="answer-queued" class="question-answer">Responder ${icon('arrow')}</button></div>`;
  $('#answer-queued').onclick=questionJump.onclick;return;
 }
 questionBar.innerHTML=`<div class="question-heading"><strong>${esc(question.title)}</strong><button class="icon-button" id="question-terminal" title="Responder en terminal" aria-label="Responder en terminal">${icon('expand')}</button></div><div class="question-options">${question.options.map((o,i)=>`<button type="button" data-question-choice="${i}" ${question.selected<0?'disabled':''} aria-label="${esc(o.label)}"><span>${esc(o.number)}</span>${esc(o.label)}</button>`).join('')}</div><div class="question-footer"><span>${question.multi?'Elige las opciones y confirma':'Pulsa una opción para responder'}</span>${question.multi?'<button id="confirm-question">Confirmar selección</button>':''}${question.navigate?'<button id="previous-question" title="Pregunta anterior">↤ Anterior</button><button id="next-question" title="Siguiente pregunta">Siguiente ↦</button>':''}${a.harness==='codex'?'<button id="question-note">Añadir nota</button>':''}</div>`;
 $('#question-terminal').onclick=()=>{scrollTerminalToBottom();terminal.focus()};
 $('#next-question')?.addEventListener('click',()=>{send('input',{id:terminalTarget(),text:a.harness==='codex'?'\x1b[C':'\t'});terminal.focus()});
 $('#previous-question')?.addEventListener('click',()=>{send('input',{id:terminalTarget(),text:a.harness==='codex'?'\x1b[D':'\x1b[Z'});terminal.focus()});
 $('#question-note')?.addEventListener('click',()=>{if(!question.notes)send('input',{id:terminalTarget(),text:'\t'});scrollTerminalToBottom();terminal.focus()});
 $('#confirm-question')?.addEventListener('click',()=>{send('input',{id:terminalTarget(),text:'\r'});terminal.focus()});
 questionBar.querySelectorAll('[data-question-choice]').forEach(button=>button.onclick=()=>{
  // Re-read before dispatch: never answer a replaced question or a stale cursor.
  const fresh=detectHarnessQuestion(terminalScreenLines(terminal),a.harness);
  if(!fresh||fresh.signature!==currentQuestion.signature||fresh.selected<0){updateHarnessQuestions();return}
  const index=+button.dataset.questionChoice,delta=index-fresh.selected;
  const keys=(delta<0?'\x1b[A':'\x1b[B').repeat(Math.abs(delta))+(fresh.multi?' ':'\r');
  send('input',{id:terminalTarget(),text:keys});scrollTerminalToBottom();terminal.focus();
 });
 requestAnimationFrame(fitTerminal);
}
function scheduleQuestionUpdate(){clearTimeout(questionUpdateTimer);questionUpdateTimer=setTimeout(updateHarnessQuestions,100)}

function submitQuestionText(text){
 if(currentQuestion?.kind!=='text'||currentQuestion.agent!==terminalTarget())return false;
 const a=state.agents.find(a=>a.id===terminalTarget()),fresh=detectHarnessQuestion(terminalScreenLines(terminal),a?.harness);
 if(fresh?.kind!=='text')return false;
 const id=terminalTarget();send('input',{id,text:'\x1b[200~'+text+'\x1b[201~'});
 setTimeout(()=>send('input',{id,text:'\r'}),120);scrollTerminalToBottom();return true;
}
