import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {readFileSync, readdirSync} from 'node:fs';
// The interface must stay cheap for hours: islands animate within a frame budget and
// only while someone uses the window, nothing is filtered per frame, and terminals
// draw on the GPU. tests/perf-probe.mjs measures the same load in WebKit by hand.
// WebKit re-checks :has() against the page for every inserted element; one rule made each island frame cost 700 ms.
for (const file of readdirSync('ui').filter(f => f.endsWith('.css'))) assert(!readFileSync('ui/' + file, 'utf8').includes(':has('), `ui/${file} must express page state with classes, not :has()`);
const browser = await chromium.launch({headless: true});
try {
  const page = await browser.newPage({viewport: {width: 1728, height: 1084}}), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.messages = []; window.webkit = {messageHandlers: {native: {postMessage: m => messages.push(m)}}};
  });
  await page.goto(pathToFileURL(resolve('ui/index.html')).href);
  const projects = ['one', 'two', 'three'].map((name, i) => ({id: 'p' + i, name, path: '/tmp/' + name}));
  const agents = Array.from({length: 6}, (_, i) => ({id: 'a' + i, threadId: 't' + i, name: 'Agent ' + i, projectId: 'p' + (i % 3), harness: 'codex', managed: true, processRunning: true, state: 'session'}));
  const data = {native: true, projects, agents, binaries: {codex: '/codex'}, docker: {connected: true, containers: []}};
  await page.evaluate(data => { receiveNative({event: 'snapshot', data}); setView('world') }, data);
  assert.equal(await page.evaluate(() => IslandMotion.count), 4, 'Every island is driven by the shared loop');
  assert.equal(await page.locator('#world [filter]').count(), 0, 'No island element is filtered on every frame');

  const rate = () => page.evaluate(() => new Promise(done => { const start = IslandMotion.frames, t = performance.now(); setTimeout(() => done((IslandMotion.frames - start) / ((performance.now() - t) / 1000)), 2000) }));
  await page.mouse.move(600, 500);
  const awake = await rate();
  assert(awake > 5 && awake <= 27, `Islands animate within 24 fps while in use (got ${awake.toFixed(1)})`);

  await page.evaluate(() => receiveNative({event: 'windowVisibility', data: {visible: false}}));
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => IslandMotion.animating), false, 'A hidden window stops the animation');
  assert.equal(await rate(), 0, 'A hidden window draws no island frames');
  await page.evaluate(() => receiveNative({event: 'windowVisibility', data: {visible: true}}));
  assert.equal(await page.evaluate(() => IslandMotion.animating), true, 'A visible window resumes the animation');

  // Quiet spell: fast-forward the clock the loop compares against.
  await page.evaluate(() => { const now = performance.now.bind(performance), skew = IslandMotion.quietMs + 1000; performance.now = () => now() + skew });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => IslandMotion.animating), false, 'Islands rest after a quiet spell');
  await page.mouse.move(700, 520);
  assert.equal(await page.evaluate(() => IslandMotion.animating), true, 'Pointer activity wakes them');

  // Walking robots reorder the scene; only the groups that changed place may move.
  const moves = await page.evaluate(([projects, agents]) => {
    receiveNative({event: 'snapshot', data: {native: true, projects, agents: agents.map(a => ({...a, state: 'active'})), binaries: {codex: '/codex'}, docker: {connected: true, containers: []}}});
    IslandMotion.setWindowVisible(false);
    for (const m of mounts) { m.step(1 / 24); m.render(); }
    let count = 0; const insert = Node.prototype.insertBefore, append = Node.prototype.appendChild;
    Node.prototype.insertBefore = function (...a) { count++; return insert.apply(this, a) }; Node.prototype.appendChild = function (...a) { count++; return append.apply(this, a) };
    for (let i = 0; i < 12; i++) for (const m of mounts) { m.step(1 / 24); m.render(); }
    Node.prototype.insertBefore = insert; Node.prototype.appendChild = append; IslandMotion.setWindowVisible(true);
    return count / 12;
  }, [projects, agents]);
  assert(moves < 120, `An animated frame moves few elements (got ${moves.toFixed(0)} per frame)`);

  await page.evaluate(() => document.querySelector('#search-dialog').showModal());
  assert(await page.evaluate(() => document.body.classList.contains('search-dialog-open') && getComputedStyle(document.querySelector('#app')).visibility === 'visible' && !IslandMotion.animating), 'An open dialog keeps the app visible behind it and pauses the islands');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.body.classList.contains('search-dialog-open')), false, 'Closing the dialog clears the class');

  await page.evaluate(() => setView('terminals'));
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => IslandMotion.animating && [...document.querySelectorAll('#world .scene')].some(s => s.checkVisibility?.())), false, 'Hidden islands are not drawn');
  assert.equal(await page.locator('#terminal-deck canvas').count(), 0, 'Terminals use the default renderer unless the GPU trial is enabled');
  const gpu = await browser.newPage({viewport: {width: 1728, height: 1084}});
  await gpu.addInitScript(() => { window.webkit = {messageHandlers: {native: {postMessage() {}}}}; localStorage.setItem('islands.gpuTerminals', '1') });
  await gpu.goto(pathToFileURL(resolve('ui/index.html')).href);
  await gpu.evaluate(data => { receiveNative({event: 'snapshot', data}); setView('terminals') }, data);
  assert(await gpu.locator('#terminal-deck canvas').count() >= 6, 'The GPU trial draws mosaic terminals on canvases');
  await gpu.close();

  const markup = await page.evaluate(data => { receiveNative({event: 'snapshot', data}); const list = document.querySelector('#team-list'), first = list.firstElementChild; receiveNative({event: 'snapshot', data}); return list.firstElementChild === first }, data);
  assert(markup, 'An unchanged snapshot keeps the team list elements');
  assert.deepEqual(errors, []);
  console.log('PASS performance: islands share a 24 fps loop, stop when hidden or quiet and wake on use; no per-frame filters or :has() rules; in-place scene reordering; opt-in GPU terminals; unchanged snapshots keep markup');
} finally { await browser.close() }
