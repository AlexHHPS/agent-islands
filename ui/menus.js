/* Apache-2.0 · Menu behaviour shared by every <details class="control-menu">, as an NSMenu behaves:
   one open at a time, a press anywhere outside closes it, choosing an item closes it, the arrow keys move
   between items, and it closes when the window loses focus. Escape is handled in app.js. */
'use strict';
(() => {
 const openMenus=()=>[...document.querySelectorAll('details.control-menu[open]')];
 const closeAll=except=>{for(const menu of openMenus())if(menu!==except)menu.open=false};
 const items=menu=>[...menu.querySelectorAll('.menu-items button:not([hidden]):not(:disabled), .menu-items [role^=menuitem]:not([hidden])')].filter((el,i,all)=>all.indexOf(el)===i&&el.getClientRects().length);
 // Opening one menu closes the others (toggle does not bubble, so listen in the capture phase).
 document.addEventListener('toggle',e=>{const menu=e.target;if(menu instanceof HTMLDetailsElement&&menu.matches('.control-menu')&&menu.open)closeAll(menu)},true);
 // A press outside every open menu closes them; the press still reaches what it landed on.
 document.addEventListener('pointerdown',e=>{for(const menu of openMenus())if(!menu.contains(e.target))menu.open=false},true);
 // Choosing a command closes its menu. Fields inside a menu (selects, checkboxes in the filters) keep it open.
 document.addEventListener('click',e=>{const item=e.target.closest?.('details.control-menu .menu-items button, details.control-menu .menu-items [role^=menuitem]');if(item&&!item.closest('[data-keep-open]'))requestAnimationFrame(()=>{const menu=item.closest('details.control-menu');if(menu)menu.open=false})});
 // Popups that are not <details>: the composer's command list and the browser settings panel.
 const hidePopups=target=>{
  const composer=document.querySelector('#composer-menu');if(composer&&!composer.hidden&&!(target&&target.closest?.('#composer')))composer.hidden=true;
  const panel=document.querySelector('#browser-settings');if(panel&&!panel.hidden&&!(target&&target.closest?.('#browser-settings,#browser-settings-toggle'))&&typeof browserSettings==='function')browserSettings(false);
 };
 document.addEventListener('pointerdown',e=>hidePopups(e.target),true);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){const panel=document.querySelector('#browser-settings');if(panel&&!panel.hidden&&typeof browserSettings==='function'){browserSettings(false);e.preventDefault()}}},true);
 // The native shell calls this before it starts a window drag (the page never sees that press) and on blur.
 window.dismissMenus=()=>{closeAll();hidePopups(null)};
 addEventListener('blur',()=>window.dismissMenus());
 // Arrow keys move through the items of the open menu; Home and End jump to the ends.
 document.addEventListener('keydown',e=>{
  if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
  const menu=document.activeElement?.closest?.('details.control-menu[open]')||openMenus()[0];if(!menu)return;
  if(document.activeElement?.matches?.('select,input,textarea'))return;
  const list=items(menu);if(!list.length)return;
  const at=list.indexOf(document.activeElement);
  const next=e.key==='Home'?0:e.key==='End'?list.length-1:e.key==='ArrowDown'?(at+1)%list.length:(at<=0?list.length-1:at-1);
  list[next].focus();e.preventDefault();
 });
})();
