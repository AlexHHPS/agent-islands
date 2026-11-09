/* Apache-2.0 · App-owned messages only; user content is never a translation key. */
'use strict';
const I18n = (() => {
 const catalogs=window.ISLANDS_LOCALES,storageKey='islands.language';
 const supported=value=>['es','en'].includes(value)?value:null;
 let saved;try{saved=localStorage.getItem(storageKey)}catch{}
 let language=supported(window.islandsLanguage)||supported(new URLSearchParams(location.search).get('lang'))||supported(saved)||'es';
 const bindings=new WeakMap(),boundNodes=new Set(),listeners=new Set(),missing=new Set();
 const prune=()=>{for(const ref of boundNodes)if(!ref.deref()?.isConnected)boundNodes.delete(ref)};
 setInterval(prune,5000);
 const normalize=key=>key.replace(/\s+/g,' ').trim();
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const pack=value=>btoa(unescape(encodeURIComponent(JSON.stringify(value))));
 const unpack=value=>JSON.parse(decodeURIComponent(escapeLegacy(atob(value))));
 function escapeLegacy(s){return [...s].map(c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0')).join('')}
 function text(key,...args){if(!Object.hasOwn(catalogs[language],key))missing.add(key);const value=catalogs[language][key]??catalogs.es[key]??key;return value.replace(/\{(\d+)\}/g,(m,n)=>n<args.length?String(args[n]??''):m)}
 function count(key,value){const locale=language==='es'?'es-ES':'en-US';return text(key+'.'+new Intl.PluralRules(locale).select(value),new Intl.NumberFormat(locale).format(value))}
 function tr(strings,...args){if(typeof strings==='string')return text(strings,...args);return text(strings.reduce((s,p,i)=>s+(i?'{'+(i-1)+'}':'')+p,''),...args)}
 function bind(node,property,render){
  if(!node)return;let entry=bindings.get(node);if(!entry){entry=new Map();bindings.set(node,entry);boundNodes.add(new WeakRef(node))}entry.set(property,render);
  const value=render();if(property.startsWith('@'))node.setAttribute(property.slice(1),value);else node[property]=value;return value;
 }
 function attribute(node,name,render){return bind(node,'@'+name,render)}
 // A key is built solely from a developer-authored template. Slots remain opaque values.
 function descriptor(source,args){
  const indexes=[];const key=normalize(source.replace(/\uE000(\d+)\uE001/g,(_,n)=>{indexes.push(+n);return '{'+(indexes.length-1)+'}'}));
  if(!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(key.replace(/\{\d+\}/g,'')))return null;
  const decode=document.createElement('textarea');decode.innerHTML=key;
  return {key:decode.value,args:indexes.map(i=>args[i])};
 }
 function rendered(d){if(!Object.hasOwn(catalogs[language],d.key))missing.add(d.key);const translated=catalogs[language][d.key]??catalogs.es[d.key]??d.key;return translated.split(/(\{\d+\})/).map(s=>/^\{\d+\}$/.test(s)?String(d.args[+s.slice(1,-1)]??s):escape(s)).join('')}
 function html(strings,...args){
  if(typeof strings==='string')strings=[strings];
  let source=strings.reduce((s,p,i)=>s+(i?'\uE000'+(i-1)+'\uE001':'')+p,'');
  let raw=null;
  const result=source.split(/(<(?:[^>"']|"[^"]*"|'[^']*')*>)/g).map(part=>{
   if(part.startsWith('<')){
    const tag=part.match(/^<\/?([\w-]+)/)?.[1]?.toLowerCase();if(/^<\//.test(part)&&tag===raw)raw=null;
    let attrs={};
    part=part.replace(/\b(title|aria-label|placeholder|alt)=("([^"]*)"|'([^']*)')/g,(all,name,quoted,a,b)=>{
     const source=a??b,d=descriptor(source,args);if(!d)return all;d.args=d.args.map(value=>{const el=document.createElement('textarea');el.innerHTML=String(value??'');return el.value});attrs[name]=d;
     return name+'="'+escape(text(d.key,...d.args))+'"';
    });
    if(Object.keys(attrs).length)part=part.replace(/\/?>(?=$)/,end=>' data-i18n-attrs="'+pack(attrs)+'"'+end);
    if(!/^<\//.test(part)&&['script','style','textarea','pre','code'].includes(tag))raw=tag;
    return part;
   }
   if(raw||!part.trim())return part;
   return part.split(/(\uE000\d+\uE001)/).map(piece=>{
    if(/^\uE000/.test(piece))return piece;
    const d=descriptor(piece,args);if(!d)return piece;
    const prefix=piece.match(/^\s*/)[0],suffix=piece.match(/\s*$/)[0];
    return prefix+'<!--islands-i18n:'+pack(d)+'-->'+rendered(d)+'<!--/islands-i18n-->'+suffix;
   }).join('');
  }).join('');
  return result.replace(/\uE000(\d+)\uE001/g,(_,n)=>String(args[+n]??''));
 }
 function captureStatic(root){
  const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
  while((node=walk.nextNode())){
   if(node.parentElement?.closest('script,style,textarea,pre,code'))continue;
   const original=node.nodeValue,key=normalize(original);if(!key||!catalogs.es.hasOwnProperty(key))continue;
   const before=original.match(/^\s*/)[0],after=original.match(/\s*$/)[0];bind(node,'nodeValue',()=>before+text(key)+after);
  }
  for(const el of root.querySelectorAll('[title],[aria-label],[placeholder],[alt]'))for(const name of ['title','aria-label','placeholder','alt']){
   const key=el.getAttribute(name);if(key&&catalogs.es.hasOwnProperty(key))attribute(el,name,()=>text(key));
  }
 }
 function refresh(){
  document.documentElement.lang=language;
  for(const ref of boundNodes){const node=ref.deref();if(!node?.isConnected){boundNodes.delete(ref);continue}const entries=bindings.get(node);for(const [property,render] of entries){const value=render();if(property.startsWith('@'))node.setAttribute(property.slice(1),value);else node[property]=value}}
  for(const el of document.querySelectorAll('[data-i18n-attrs]')){const attrs=unpack(el.dataset.i18nAttrs);for(const [name,d] of Object.entries(attrs))el.setAttribute(name,text(d.key,...d.args))}
  const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_COMMENT),starts=[];let node;while((node=walk.nextNode()))if(node.nodeValue.startsWith('islands-i18n:'))starts.push(node);
  for(const start of starts){if(!start.isConnected)continue;let end=start.nextSibling;while(end&&!(end.nodeType===8&&end.nodeValue==='/islands-i18n'))end=end.nextSibling;if(!end)continue;const range=document.createRange();range.setStartAfter(start);range.setEndBefore(end);range.deleteContents();range.insertNode(range.createContextualFragment(rendered(unpack(start.nodeValue.slice(13)))))}
 }
 function setLanguage(value,{notify=true}={}){
  if(!supported(value))return false;language=value;window.islandsLanguage=value;try{localStorage.setItem(storageKey,value)}catch{}
  refresh();for(const listener of listeners)listener(value);
  if(notify&&window.webkit?.messageHandlers?.native)window.webkit.messageHandlers.native.postMessage({action:'language',language:value});return true;
 }
 document.documentElement.lang=language;captureStatic(document.body);
 return {t:text,count,tr,html,bind,attribute,refresh,setLanguage,onChange:fn=>listeners.add(fn),get missingKeys(){return [...missing]},get language(){return language},get locale(){return language==='es'?'es-ES':'en-US'}};
})();
window.I18n=I18n;
const t=I18n.t,tr=I18n.tr,ht=I18n.html;
