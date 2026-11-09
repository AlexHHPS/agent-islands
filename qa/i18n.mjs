import {AsyncLocalStorage} from 'node:async_hooks';
import {readFileSync} from 'node:fs';
const context=new AsyncLocalStorage();
const catalogs=Object.fromEntries(['es','en'].map(lang=>[lang,JSON.parse(readFileSync(new URL('../ui/locales/'+lang+'.json',import.meta.url),'utf8'))]));
export const language=()=>context.getStore()||(['es','en'].includes(process.env.AGENT_ISLANDS_LANGUAGE)?process.env.AGENT_ISLANDS_LANGUAGE:'es');
export const withLanguage=(value,fn)=>context.run(['es','en'].includes(value)?value:language(),fn);
export function t(key,...args){return (catalogs[language()][key]??catalogs.es[key]??key).replace(/\{(\d+)\}/g,(m,n)=>n<args.length?String(args[n]??''):m)}
export function tr(strings,...args){return t(strings.reduce((s,p,i)=>s+(i?'{'+(i-1)+'}':'')+p,''),...args)}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function ht(strings,...args){
 if(typeof strings==='string')strings=[strings];let raw=null;
 let source=strings.reduce((s,p,i)=>s+(i?'\uE000'+(i-1)+'\uE001':'')+p,'');
 source=source.split(/(<(?:[^>"']|"[^"]*"|'[^']*')*>)/g).map(part=>{
  if(part.startsWith('<')){const tag=part.match(/^<\/?([\w-]+)/)?.[1]?.toLowerCase();if(/^<\//.test(part)&&tag===raw)raw=null;if(!/^<\//.test(part)&&['script','style','textarea','pre','code'].includes(tag))raw=tag;
   return part.replace(/\b(title|aria-label|placeholder|alt)=("([^"]*)"|'([^']*)')/g,(all,name,q,a,b)=>{const key=a??b;return key.includes('\uE000')?all:name+'="'+escape(t(key))+'"'});
  }
  if(raw)return part;
  return part.split(/(\uE000\d+\uE001)/).map(piece=>{if(piece.startsWith('\uE000')||!piece.trim())return piece;const key=piece.replace(/\s+/g,' ').trim();return piece.match(/^\s*/)[0]+escape(t(key))+piece.match(/\s*$/)[0]}).join('');
 }).join('');
 return source.replace(/\uE000(\d+)\uE001/g,(_,n)=>String(args[+n]??''));
}
