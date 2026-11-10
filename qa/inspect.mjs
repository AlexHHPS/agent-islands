// Element description executed inside the inspected document, including cross-origin frames.
// It must stay self-contained: Playwright serialises the function source into the page.
// Never reads input values; framework data is read only from development-time metadata.
export function inspectPoint({x,y,active=false,rect=null}){
 let el=active?document.activeElement:document.elementFromPoint(x,y);
 while(el?.shadowRoot){const next=el.shadowRoot.elementFromPoint(x,y);if(!next||next===el)break;el=next}
 if(!el)return null;
 const clip=(s,n)=>String(s??'').replace(/\s+/g,' ').trim().slice(0,n);
 const sensitive=n=>n.matches?.('input,textarea,select,[contenteditable=true],[contenteditable=""]');
 const hashed=c=>/^(?:css|sc|jsx|emotion|svelte)-[\w-]{4,}$/.test(c)||/^[a-z]{1,3}[A-Z0-9][\w-]{4,}$/.test(c)&&/\d/.test(c);
 const classes=n=>[...(n.classList||[])].map(c=>c.replace(/_{1,2}[a-zA-Z0-9-]{5}$/,m=>/\d/.test(m)?'':m)).filter(c=>c&&!hashed(c)).slice(0,10);
 const selector=node=>{const parts=[];for(let n=node;n?.nodeType===1&&parts.length<7;n=n.parentElement){let s=n.localName;if(n.id){parts.unshift('#'+CSS.escape(n.id));break}const tid=n.getAttribute('data-testid');if(tid){parts.unshift('[data-testid='+JSON.stringify(tid)+']');break}const siblings=n.parentElement?[...n.parentElement.children].filter(c=>c.localName===n.localName):[];if(siblings.length>1)s+=':nth-of-type('+(siblings.indexOf(n)+1)+')';parts.unshift(s)}return parts.join(' > ')};
 const readable=node=>{const parts=[];for(let n=node;n?.nodeType===1&&parts.length<4;n=n.parentElement){const c=classes(n)[0];parts.unshift(n.id?'#'+n.id:c?'.'+c:n.localName);if(n.id)break}return parts.join(' > ')};
 const fullPath=node=>{const parts=[];for(let n=node;n?.nodeType===1;n=n.parentElement)parts.unshift(n.localName+(n.id?'#'+n.id:'')+(classes(n)[0]?'.'+classes(n)[0]:''));return parts.join(' > ').slice(0,600)};
 const visibleText=n=>sensitive(n)?'':clip(n.innerText||n.textContent,600);
 const name=n=>{const tag=n.localName,text=clip(visibleText(n),40),label=clip(n.getAttribute('aria-label')||n.getAttribute('alt')||n.getAttribute('title'),40);
  if(tag==='button'||n.getAttribute('role')==='button')return 'button "'+(text||label)+'"';
  if(tag==='a')return 'link "'+(text||label)+'"';
  if(['input','textarea','select'].includes(tag))return tag+(n.getAttribute('placeholder')?' "'+clip(n.getAttribute('placeholder'),40)+'"':n.getAttribute('name')?' ['+clip(n.getAttribute('name'),30)+']':'');
  if(/^h[1-6]$/.test(tag))return tag+' "'+text+'"';
  if(tag==='img')return 'img "'+label+'"';
  if(tag==='svg'||tag==='path'){const host=n.closest('button,a');return host?'icon in "'+clip(visibleText(host)||host.getAttribute('aria-label'),40)+'"':'icon'}
  return tag+(label?' "'+label+'"':text?' "'+text+'"':classes(n)[0]?'.'+classes(n)[0]:'');
 };
 const attributes=n=>{const out={};for(const a of ['id','data-testid','data-test','data-cy','role','aria-label','name','type','href','alt','placeholder','for'])if(n.hasAttribute?.(a))out[a]=a==='href'?(()=>{try{const u=new URL(n.getAttribute(a),location.href);return u.origin===location.origin?u.pathname:u.origin+u.pathname}catch{return ''}})():clip(n.getAttribute(a),200);return out};
 const nearby=n=>{const bits=[];const prev=n.previousElementSibling,next=n.nextElementSibling,heading=n.closest('section,article,form,main,dialog,[role=dialog]')?.querySelector('h1,h2,h3,h4,legend');if(heading&&heading!==n)bits.push(clip(heading.innerText,80));if(prev&&!sensitive(prev))bits.push(clip(prev.innerText,80));if(next&&!sensitive(next))bits.push(clip(next.innerText,80));return bits.filter(Boolean).join(' · ').slice(0,300)};
 const styles=n=>{const cs=getComputedStyle(n),out={};for(const p of ['display','position','color','background-color','font-family','font-size','font-weight','line-height','letter-spacing','text-align','padding','margin','gap','border','border-radius','box-shadow','width','height','opacity','z-index','flex-direction','justify-content','align-items','grid-template-columns','overflow','transform'])
  {const v=cs.getPropertyValue(p);if(v&&!['none','normal','auto','0px','static','visible','rgba(0, 0, 0, 0)','0px none rgb(0, 0, 0)','1','start'].includes(v))out[p]=v.slice(0,160)}return out};
 // React: fibers expose component names; _debugSource (≤18) or _debugStack (19) locate the JSX.
 const react=n=>{let key=null;for(let m=n;m&&!key;m=m.parentElement){key=Object.keys(m).find(k=>k.startsWith('__reactFiber$')||k.startsWith('__reactInternalInstance$'));if(key)n=m}if(!key)return null;
  const internal=/^(?:Fragment|Suspense|StrictMode|Profiler|Root|Routes?|Router|Outlet|Switch|Provider|Consumer|ErrorBoundary|HotReload|ReactDevOverlay|AppRouter|Layout(?:Router|Segment)|InnerLayoutRouter|RenderFromTemplateContext|ScrollAndFocusHandler|RedirectBoundary|NotFoundBoundary|LoadingBoundary|ServerRoot|AppContainer)$|Provider$|Boundary$|Context$|^With[A-Z]|^_/;
  const label=t=>!t?null:typeof t==='function'?t.displayName||t.name:typeof t==='object'?t.displayName||label(t.render)||label(t.type):null;
  const frame=stack=>{for(const line of String(stack||'').split('\n').slice(1)){if(/react-stack-top-frame|jsxDEV|jsx-dev-runtime|react-dom|node_modules|createElement|\(native\)/.test(line))continue;const m=line.match(/\(?((?:https?|webpack-internal|webpack|file|rsc):\/\/[^\s)]+?):(\d+):(\d+)\)?\s*$/);if(m)return {url:m[1],line:+m[2],column:+m[3]}}return null};
  let fiber=n[key],source=null,components=[],depth=0;
  for(let f=fiber;f&&depth<40;f=f.return,depth++){const nm=label(f.type);if(typeof f.type!=='string'&&nm&&!internal.test(nm)&&!components.includes(nm))components.push(nm);
   if(!source){const s=f._debugSource||f._debugOwner?._debugSource;if(s?.fileName)source={file:s.fileName,line:s.lineNumber,column:s.columnNumber||1,exact:true};else if(f._debugStack){const fr=frame(f._debugStack.stack||f._debugStack);if(fr)source={...fr,generated:true}}}}
  return {components:components.slice(0,8).reverse(),source};
 };
 const vue=n=>{for(let m=n;m;m=m.parentElement){const c=m.__vueParentComponent;if(c){const names=[];let file=null;for(let i=c;i&&names.length<8;i=i.parent){const nm=i.type?.name||i.type?.__name||(i.type?.__file||'').split('/').pop()?.replace(/\.vue$/,'');if(nm&&!names.includes(nm))names.push(nm);if(!file&&i.type?.__file)file=i.type.__file}return {components:names.reverse(),source:file?{file,exact:false}:null}}}return null};
 const svelte=n=>{for(let m=n;m;m=m.parentElement){const loc=m.__svelte_meta?.loc;if(loc?.file)return {components:[loc.file.split('/').pop().replace(/\.svelte$/,'')],source:{file:loc.file,line:(loc.line||0)+1,column:(loc.column||0)+1,exact:true}}}return null};
 const angular=n=>{try{const ng=window.ng;if(!ng?.getComponent)return null;const names=[];for(let m=n;m&&names.length<8;m=m.parentElement){const c=ng.getComponent(m);if(c){const nm=c.constructor?.name;if(nm&&!names.includes(nm))names.push(nm)}}return names.length?{components:names.reverse(),source:null}:null}catch{return null}};
 const framework=n=>{for(const [id,fn] of [['react',react],['vue',vue],['svelte',svelte],['angular',angular]]){try{const r=fn(n);if(r)return {id,...r}}catch{}}return null};
 // Text selection: text of elements whose box lies inside the dragged rectangle.
 let selectedText='';if(rect){const out=[];const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let t;while((t=walk.nextNode())&&out.join(' ').length<1200){const p=t.parentElement;if(!p||sensitive(p)||!t.nodeValue.trim())continue;const range=document.createRange();range.selectNodeContents(t);for(const b of range.getClientRects())if(b.right>rect.x&&b.left<rect.x+rect.width&&b.bottom>rect.y&&b.top<rect.y+rect.height){out.push(t.nodeValue.trim());break}}selectedText=clip(out.join(' '),1200)}
 const r=el.getBoundingClientRect(),cs=getComputedStyle(el);
 return {tag:el.localName,name:name(el),selector:selector(el),readable:readable(el),fullPath:fullPath(el),shadow:el.getRootNode() instanceof ShadowRoot,role:el.getAttribute('role')||'',label:clip(el.getAttribute('aria-label')||el.getAttribute('alt')||'',200),text:visibleText(el),nearbyText:nearby(el),classes:classes(el),attributes:attributes(el),styles:styles(el),accessibility:{role:el.getAttribute('role')||el.localName,label:clip(el.getAttribute('aria-label')||el.getAttribute('alt')||'',200),describedBy:el.getAttribute('aria-describedby')||'',focusable:el.tabIndex>=0},isFixed:['fixed','sticky'].includes(cs.position),bounds:{x:r.x,y:r.y,width:r.width,height:r.height},scroll:{x:scrollX,y:scrollY},ancestors:[...function*(n){for(let i=0;n&&i<5;n=n.parentElement,i++)yield n}(el)].map(n=>({tag:n.localName,id:n.id,classes:[...n.classList].slice(0,8)})),source:el.getAttribute('data-source')||el.getAttribute('data-file')||el.closest('[data-source-loc],[data-inspector-relative-path]')?.getAttribute('data-source-loc')||null,framework:framework(el),selectedText};
}

// Pauses CSS transitions/animations, Web Animations and media so a specific frame can be annotated.
export function freezePage(on){
 const id='islands-freeze';let style=document.getElementById(id);
 if(on){if(!style){style=document.createElement('style');style.id=id;style.textContent='*,*::before,*::after{animation-play-state:paused!important;transition:none!important;caret-color:transparent!important}';(document.head||document.documentElement).append(style)}
  for(const a of document.getAnimations?.()||[])try{if(a.playState==='running'){a.pause();a.__islandsPaused=true}}catch{}
  for(const v of document.querySelectorAll('video,audio'))if(!v.paused){v.pause();v.__islandsPaused=true}}
 else{style?.remove();for(const a of document.getAnimations?.()||[])if(a.__islandsPaused){try{a.play()}catch{}delete a.__islandsPaused}for(const v of document.querySelectorAll('video,audio'))if(v.__islandsPaused){v.play().catch(()=>{});delete v.__islandsPaused}}
 return on;
}

// Live style preview on one element of the main document. Values are applied inline and reversible.
export function previewStyle({selector,styles,reset}){
 const el=document.querySelector(selector);if(!el)return null;
 if(!el.__islandsOriginal)el.__islandsOriginal=el.getAttribute('style');
 if(reset){const o=el.__islandsOriginal;if(o===null)el.removeAttribute('style');else el.setAttribute('style',o);delete el.__islandsOriginal;return {reset:true}}
 const before={},cs=getComputedStyle(el);for(const [p,v] of Object.entries(styles||{})){before[p]=cs.getPropertyValue(p);el.style.setProperty(p,String(v).slice(0,200),'important')}
 const r=el.getBoundingClientRect();return {before,bounds:{x:r.x,y:r.y,width:r.width,height:r.height}};
}
