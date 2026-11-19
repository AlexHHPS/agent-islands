/* Apache-2.0 · Reports [data-drag] strips to native so a press there moves the window.
   WKWebView swallows mouse-downs, so the transparent titlebar area cannot drag the window by itself.
   Controls inside a strip (buttons, inputs, links, [data-no-drag]) stay clickable. */
'use strict';
(() => {
 const bridge=window.webkit?.messageHandlers?.native;
 window.updateDragRegions=()=>{};
 if(!bridge)return;
 // WebKit's own right-click menu (Reload, Inspect Element) has no place in an app. Fields, terminal output and
 // selected text keep it for Cut, Copy and Paste.
 document.addEventListener('contextmenu',e=>{const t=e.target;if(t.closest?.('input,textarea,[contenteditable],.xterm')||String(getSelection()).trim())return;e.preventDefault()});
 const interactive='button,a,input,select,textarea,summary,label,[role=button],[role=tab],[contenteditable],[data-no-drag]';
 const box=r=>[Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)];
 let queued=false,last='',observed=new WeakSet();
 const resize=new ResizeObserver(()=>schedule());
 function report(){
  queued=false;const regions=[],exclude=[];
  for(const strip of document.querySelectorAll('[data-drag]')){
   if(!observed.has(strip)){observed.add(strip);resize.observe(strip)}
   const r=strip.getBoundingClientRect();if(r.width<1||r.height<1||strip.closest('[hidden]'))continue;
   regions.push(box(r));
   for(const control of strip.querySelectorAll(interactive)){const b=control.getBoundingClientRect();if(b.width>0&&b.height>0)exclude.push(box(b))}
  }
  // Never drag from where the traffic lights sit (centred in the 52px strip by the app), whatever the layout puts under them.
  exclude.push([0,0,84,52]);
  const payload=JSON.stringify([regions,exclude]);if(payload===last)return;last=payload;
  bridge.postMessage({action:'dragRegions',regions,exclude});
 }
 function schedule(){if(!queued){queued=true;requestAnimationFrame(report)}}
 window.updateDragRegions=schedule;
 addEventListener('resize',schedule);
 // Shell-level changes only: terminal output mutates deep nodes many times a second and must not trigger layout reads.
 const shell=new MutationObserver(schedule);
 const watch=()=>{for(const node of [document.documentElement,document.body,document.querySelector('[data-slot=app-shell]')].filter(Boolean))shell.observe(node,{attributes:true,childList:true});schedule()};
 if(document.readyState==='loading')addEventListener('DOMContentLoaded',watch,{once:true});else watch();
})();
