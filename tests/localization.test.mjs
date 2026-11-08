import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {QAService} from '../qa/service.mjs';
import {withLanguage,t as serverText,tr as serverTemplate} from '../qa/i18n.mjs';

const es=JSON.parse(readFileSync('ui/locales/es.json')),en=JSON.parse(readFileSync('ui/locales/en.json'));
assert.deepEqual(Object.keys(es).sort(),Object.keys(en).sort());
assert.equal(withLanguage('en',()=>serverText('Cancelar')),'Cancel');
assert.equal(withLanguage('en',()=>serverTemplate`Sesión cerrada (${7}).`),'Session closed (7).');
const parallel=await Promise.all(['en','es'].map(language=>withLanguage(language,async()=>{await new Promise(r=>setTimeout(r,language==='en'?20:5));return serverText('El navegador ya está cerrado.')})));
assert.deepEqual(parallel,['The browser is already closed.','El navegador ya está cerrado.']);
const root=mkdtempSync(join(tmpdir(),'islands-localization-'));
writeFileSync(join(root,'profiles.json'),'[]');
const service=new QAService(root);
try{
 const errors=await Promise.all(['en','es'].map(language=>service.dispatch('profile.invalid',{language}).catch(e=>e.message)));
 assert.deepEqual(errors,['Unknown QA operation.','Operación QA desconocida.']);
}finally{await service.close();rmSync(root,{recursive:true,force:true})}

const browser=await chromium.launch({headless:true});
const base=pathToFileURL(resolve('ui/index.html')).href;
try{
 const context=await browser.newContext(),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.messages=[];window.webkit={messageHandlers:{native:{postMessage:m=>messages.push(m)}}}});
 await page.goto(base);
 const userName='Guardar <img src=x onerror=alert(1)>',draft='Mi borrador: Guardar. Keep this exactly. {0}';
 await page.evaluate(userName=>receiveNative({event:'snapshot',data:{native:true,projects:[{id:'p',name:userName,path:'/tmp/Guardar'}],allProjects:[{id:'p',name:userName,path:'/tmp/Guardar'}],agents:[{id:'a',projectId:'p',name:'Cancelar',harness:'codex',state:'ready',managed:true,processRunning:true}],binaries:{codex:'/bin/codex'},docker:{containers:[]}}}),userName);
 await page.evaluate(()=>selectAgent('a'));await page.locator('#prompt').fill(draft);
 await page.evaluate(()=>new Promise(r=>terminal.write('Provider says: Guardar / Cancelar\r\n',r)));
 const before=await page.evaluate(()=>messages.filter(m=>['prompt','launch','stop','workspaceActivate','intelligence'].includes(m.action)).length);
 await page.locator('#settings').click();await page.locator('#app-language').selectOption('en');
 assert.equal(await page.locator('html').getAttribute('lang'),'en');
 assert.equal(await page.locator('#help-dialog h2').textContent(),'Your little operations center');
 assert.equal(await page.locator('#prompt').inputValue(),draft);
 assert.equal(await page.locator('#agent-name').textContent(),'Cancelar','Agent names are not translation keys');
 assert.equal(await page.locator('#agent-project').textContent(),userName,'Project names remain verbatim and escaped');
 assert.equal(await page.locator('#agent-project img').count(),0);
 assert.equal(await page.evaluate(()=>terminal.buffer.active.getLine(0).translateToString(true)),'Provider says: Guardar / Cancelar');
 assert.equal(await page.evaluate(()=>messages.filter(m=>['prompt','launch','stop','workspaceActivate','intelligence'].includes(m.action)).length),before);
 assert(await page.evaluate(()=>messages.some(m=>m.action==='language'&&m.language==='en')));
 assert.equal(await page.evaluate(()=>I18n.t('Imagen {0}','{1} · Cuenta')),'Image {1} · Cuenta');
 assert.equal(await page.evaluate(()=>I18n.count('project.count',1)),'1 project');
 assert.equal(await page.evaluate(()=>I18n.count('project.count',2)),'2 projects');
 assert.equal(await page.evaluate(()=>I18n.count('session.count',0)),'0 sessions');
 assert.equal(await page.evaluate(()=>I18n.setLanguage('fr')),false);
 assert.equal(await page.evaluate(()=>I18n.language),'en');
 await page.locator('#help-dialog .close-dialog').click();
 assert.equal(await page.locator('#app').getAttribute('aria-hidden'),null,'Closing settings restores the application accessibility tree');
 // Rebuilt settings fields retain typed values and the working request identity.
 await page.evaluate(()=>openOperations('ai'));
 await page.locator('#ai-endpoint').fill('https://summary.example.test/v1/chat/completions');
 await page.locator('#ai-model').fill('my-local-model');
 await page.evaluate(()=>I18n.setLanguage('es'));
 assert.equal(await page.locator('#ai-model').inputValue(),'my-local-model');
 assert.equal(await page.locator('#ai-endpoint').inputValue(),'https://summary.example.test/v1/chat/completions');
 assert((await page.locator('#operations-body h3').textContent()).includes('Resúmenes opcionales'));
 assert.equal(await page.evaluate(()=>I18n.count('selected.count',1)),'1 proyecto seleccionado');
 await page.locator('#operations-close').click();
 await page.evaluate(()=>editWorkspace());await page.locator('#workspace-name').fill('Guardar - workspace personal');
 await page.locator('#workspace-projects input').check();await page.evaluate(()=>I18n.setLanguage('en'));
 assert.equal(await page.locator('#workspace-name').inputValue(),'Guardar - workspace personal');
 assert(await page.locator('#workspace-projects input').isChecked());
 assert.equal(await page.locator('#workspace-save').textContent(),'Create and open');
 await page.locator('#workspace-cancel').click();
 assert.deepEqual(await page.evaluate(()=>I18n.missingKeys),[]);
 assert.deepEqual(errors,[]);
 await page.reload();assert.equal(await page.locator('html').getAttribute('lang'),'en','Language persists across reloads');
 await context.close();
 // Every major preview surface, including failure/empty states, has complete English coverage.
 for(const screen of ['','conversation','resume','search','brief','workspace','browser','operations']){
  for(const state of ['',...(screen==='browser'||screen==='resume'?['empty','loading','error']:[])]){
   const page=await browser.newPage();const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
   await page.goto(base+'?preview=1&lang=en'+(screen?'&screen='+screen:'')+(state?'&state='+state:''));
   if(screen==='operations')for(const tab of ['profiles','environments','health','ai'])await page.locator('[data-operations-tab='+tab+']').click();
   assert.deepEqual(pageErrors,[],screen+'/'+state);
   assert.deepEqual(await page.evaluate(()=>I18n.missingKeys),[],screen+'/'+state);
   assert.equal(await page.locator('html').getAttribute('lang'),'en');
   await page.close();
  }
 }
 const mobile=await browser.newPage({viewport:{width:390,height:844}});
 await mobile.goto(base+'?preview=1&lang=en');await mobile.locator('#settings').click();await mobile.locator('#app-language').selectOption('es');
 assert.equal(await mobile.locator('html').getAttribute('lang'),'es');
 assert(await mobile.locator('#app-language').isVisible(),'Language settings remain reachable on narrow viewports');
 assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Language settings must not overflow');
 await mobile.locator('#help-dialog .close-dialog').click();
 await mobile.goto(base+'?preview=1&lang=en&screen=browser');
 assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'English browser controls must not overflow narrow viewports');
 await mobile.close();
 console.log('PASS localization: shared catalogues, concurrent service locales, English journeys, live switching, native preference event, persisted language, escaped user content, terminal/draft/form/selection preservation and placeholder safety');
}finally{await browser.close()}
