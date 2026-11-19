'use strict';
const terminalInteractions=new Map(),terminalOutputAt=new Map();
function terminalCardActivity(a){const control=agentControl(a);return control.working||['shell','custom'].includes(a.harness)&&Date.now()-(terminalOutputAt.get(a.id)||0)<1800?'working':control.effective}
function isOpenTerminal(a){return !!a.managed&&!a.closedAt&&(a.processRunning??!['exited','error'].includes(a.state))}
// One reducer for labels, attention lists, filters, pulse and world animations.
function normalizedGoalStatus(raw){
 if(typeof raw!=='string'||!raw.trim())return null;
 const key=raw.trim().toLowerCase().replace(/[- ]/g,'_');
 return ({active:'active',in_progress:'active',running:'active',blocked:'blocked',stalled:'blocked',complete:'complete',completed:'complete',achieved:'complete',succeeded:'complete',paused:'paused',budget_limited:'budget_limited',usage_limited:'usage_limited'})[key]||'unknown';
}
function agentControl(a){
 const goal=normalizedGoalStatus(a.goalStatus),available=!a.closedAt&&!(a.managed&&a.processRunning===false);
 const goalNeedsAttention=available&&['blocked','budget_limited','usage_limited'].includes(goal);
 const interaction=terminalInteractions.get(a.id)?.kind||a.interactionKind;
 const sessionNeedsAttention=available&&!a.parentId&&['codex','claude'].includes(a.harness)&&['question','approval'].includes(interaction);
 let effective=!available?'exited':goalNeedsAttention?'blocked':sessionNeedsAttention?'waiting':goal==='complete'?'complete':goal==='paused'?'paused':goal==='active'&&a.managed&&a.state!=='observed'?(a.mode==='plan'?'planning':'working'):!available||a.state==='exited'?'exited':a.state==='active'?(a.mode==='plan'?'planning':'working'):a.state==='ready'?'ready':a.state==='observed'||!a.managed&&['waiting','error'].includes(a.state)?'observed':'idle';
 const signal=({blocked:'blocked',error:'blocked',waiting:'waiting',paused:'paused',complete:'ready',exited:'idle',working:goal?'goal':'working',planning:'plan',ready:'ready',observed:goal==='active'?'goal':'idle',idle:goal==='active'?'goal':'idle'})[effective];
 const goalLabel=({active:I18n.t('En progreso'),paused:I18n.t('En pausa'),blocked:I18n.t('Bloqueado'),usage_limited:I18n.t('Límite de uso'),budget_limited:I18n.t('Sin presupuesto'),complete:I18n.t('Completado'),unknown:I18n.t('Estado sin reconocer')})[goal]||I18n.t('Goal · etiqueta');
 let label=goal?({active:I18n.t('Goal en progreso · registro local'),paused:I18n.t('Goal pausado'),blocked:I18n.t('Goal bloqueado'),usage_limited:I18n.t('Límite de uso'),budget_limited:I18n.t('Presupuesto agotado'),complete:I18n.t('Goal completado'),unknown:I18n.t('Estado del goal sin reconocer')})[goal]:({waiting:I18n.t('Necesita tu atención'),working:I18n.t('Trabajando'),planning:I18n.t('Planificando'),ready:I18n.t('Turno terminado'),idle:I18n.t('Sesión abierta'),observed:I18n.t('Observación'),exited:I18n.t('Sesión cerrada'),error:I18n.t('Revisar error')})[effective];
 if(sessionNeedsAttention&&goal&&!goalNeedsAttention)label=(effective==='error'?I18n.t('Error de la sesión'):I18n.t('Decisión pendiente en la sesión'))+' · '+goalLabel.toLocaleLowerCase();
 const icon=({blocked:'attention',error:'attention',waiting:'attention',complete:'check',paused:'stop',exited:'stop',working:goal?'goal':'work',planning:'plan',ready:'check',observed:goal==='active'?'goal':'eye',idle:goal==='active'?'goal':a.mode==='goal'?'goal':'bot'})[effective];
 return {goal,effective,goalNeedsAttention,sessionNeedsAttention,needsAttention:goalNeedsAttention||sessionNeedsAttention,working:['working','planning'].includes(effective),signal,label,goalLabel,icon};
}
const needsAttention=a=>agentControl(a).needsAttention;
