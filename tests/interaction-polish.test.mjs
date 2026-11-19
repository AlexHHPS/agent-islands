// Regressions from the interaction audit: dialogs over a visible app, backdrop close for every dialog,
// shortcuts that respect an open modal, Escape on mouse-opened menus and a Settings page that keeps focus.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const base = pathToFileURL(resolve('ui')).href + '/';
const browser = await chromium.launch({ headless: true });
const kill = setTimeout(() => { browser.close(); process.exit(2); }, 120000);
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + 'index.html?preview=1&screen=terminals');

  // ⌘K floats over the app instead of replacing it.
  await page.keyboard.press('Meta+k');
  assert(await page.locator('#search-dialog').evaluate(d => d.open));
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#app')).visibility), 'visible', 'The app stays visible behind ⌘K');
  // ⌘2 waits while a modal is open; Escape closes it.
  await page.keyboard.press('Meta+2');
  assert(await page.locator('#terminals-view').isVisible(), 'View shortcuts do not switch the page behind a modal');
  await page.keyboard.press('Escape');

  // ⌘K over another dialog replaces it instead of stacking a second modal.
  await page.evaluate(() => launchDialog());
  await page.keyboard.press('Meta+k');
  assert.equal(await page.evaluate(() => document.querySelectorAll('dialog[open]').length), 1);
  assert(await page.locator('#search-dialog').evaluate(d => d.open));
  await page.keyboard.press('Escape');

  // Dialogs created by later modules close from their backdrop too.
  await page.evaluate(() => document.querySelector('#workspace-dialog').showModal());
  await page.mouse.click(8, 890);
  assert.equal(await page.locator('#workspace-dialog').evaluate(d => d.open), false, 'Backdrop click closes the workspace editor');

  // Escape closes a menu even when it was opened without focusing its summary (WebKit mouse clicks).
  await page.evaluate(() => { document.querySelector('#terminal-menu').open = true; document.activeElement?.blur(); });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#terminal-menu').evaluate(d => d.open), false);

  // Menus behave like NSMenu: a press outside closes them, opening one closes the other, arrows move through items.
  await page.locator('#workspace-menu summary').click();
  assert.equal(await page.locator('#workspace-menu').evaluate(d => d.open), true);
  await page.mouse.click(700, 500);
  assert.equal(await page.locator('#workspace-menu').evaluate(d => d.open), false, 'A press outside closes the menu');
  await page.locator('#workspace-menu summary').click();
  await page.locator('#terminal-menu summary').click();
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('details.control-menu[open]')].map(d => d.id)), ['terminal-menu'], 'Only one menu is open at a time');
  await page.keyboard.press('Escape');
  await page.locator('#workspace-menu summary').click();
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.workspace), '', 'Arrow keys reach the first item');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#workspace-menu').evaluate(d => d.open), false);

  // Focus returns to the opener after a dialog closes.
  await page.locator('#board-new-agent').click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'board-new-agent');

  // A long agent name ellipsizes inside the inspector instead of pushing its state ("Bloqueado") out of the panel.
  await page.evaluate(() => setView('world'));
  await page.evaluate(() => { const a = { ...state.agents[0], id: 'long', name: 'Analizar tickets para mejorar Sparkbites con Codex', harness: 'codex' }; document.querySelector('#attention-list').insertAdjacentHTML('afterbegin', agentButton(a, true)); });
  assert(await page.evaluate(() => { const panel = document.querySelector('.inspector').getBoundingClientRect(); return [...document.querySelectorAll('#attention-list .team-agent, #attention-list .agent-indicator')].every(e => e.getBoundingClientRect().right <= panel.right + 0.5); }), 'Inspector rows stay inside the panel');
  assert(await page.locator('#attention-list .team-agent').first().isVisible());
  await page.evaluate(() => setView('terminals'));

  // Mac chrome: interface text does not select, fields still do; the top toolbar moves the window, the view picker does not.
  await page.evaluate(() => { document.documentElement.classList.add('is-app'); applyNavigationLayout('top'); });
  assert.deepEqual(await page.evaluate(() => [getComputedStyle(document.querySelector('.terminal-board-heading h1')).userSelect, getComputedStyle(document.querySelector('.view-switch .nav-row')).userSelect]), ['none', 'none'], 'Titles and toolbar labels do not select');
  assert.equal(await page.evaluate(() => { const i = document.createElement('input'); document.body.append(i); const v = getComputedStyle(i).userSelect; i.remove(); return v; }), 'text', 'Text fields still select');
  assert.equal(await page.evaluate(() => document.querySelector('#sidebar').hasAttribute('data-drag')), true, 'The whole top toolbar is a drag strip');
  assert.equal(await page.evaluate(() => document.querySelector('.view-switch').hasAttribute('data-no-drag')), true);
  assert(await page.evaluate(() => { const set = document.querySelector('#settings').getBoundingClientRect(), search = document.querySelector('#command-search').getBoundingClientRect(); return set.width > 0 && set.left >= search.right; }), 'Settings sits after the search field in the toolbar');
  await page.evaluate(() => applyNavigationLayout('left'));
  assert.equal(await page.evaluate(() => document.querySelector('#sidebar').hasAttribute('data-drag')), false, 'As a sidebar only its head moves the window');
  await page.evaluate(() => { document.documentElement.classList.remove('is-app'); applyNavigationLayout('top'); });

  // Settings: keyboard choices keep focus, arrows move through a segmented control, snapshots do not reset the page.
  const settings = await browser.newPage({ viewport: { width: 760, height: 560 } });
  settings.on('pageerror', e => errors.push(e.message));
  await settings.goto(base + 'settings.html?preview=1&section=general');
  await settings.locator('[data-appearance="system"]').focus();
  await settings.keyboard.press('ArrowRight');
  await settings.waitForTimeout(50);
  assert.equal(await settings.evaluate(() => document.activeElement?.dataset.appearance), 'light', 'Arrow keys move the choice and keep focus');
  assert.equal(await settings.evaluate(() => document.querySelectorAll('.seg [tabindex="0"]').length), await settings.evaluate(() => document.querySelectorAll('.seg').length), 'One Tab stop per segmented control');
  // The page root carries data-style too; choosing Glass must send glass once, not be overwritten by the bubbled click.
  await settings.evaluate(() => { window.sent = []; document.documentElement.dataset.style = 'classic'; window.webkit = { messageHandlers: { native: { postMessage: m => sent.push(m) } } }; });
  await settings.evaluate(() => receiveNative({ event: 'interfaceStyle', data: { style: 'classic' } }));
  await settings.locator('.seg [data-style="glass"]').click();
  assert.equal(await settings.locator('.seg [data-style="glass"]').getAttribute('aria-checked'), 'true');
  // The settings pane scrolls when its section is taller than the window (the grid row must not grow with it).
  await settings.setViewportSize({ width: 640, height: 440 });
  await settings.goto(base + 'settings.html?preview=1&section=integrations');
  assert(await settings.evaluate(() => { const b = document.querySelector('.settings-body'); return b.scrollHeight > b.clientHeight && b.getBoundingClientRect().bottom <= innerHeight; }), 'Settings content scrolls inside the window');
  await settings.setViewportSize({ width: 760, height: 560 });
  // Accent colour: a swatch sends the choice, and both pages repaint --primary with it.
  await settings.goto(base + 'settings.html?preview=1&section=general');
  await settings.locator('.swatches [data-accent="orange"]').click();
  assert.deepEqual(await settings.evaluate(() => [document.documentElement.dataset.accent, document.querySelector('.swatches [data-accent="orange"]').getAttribute('aria-checked'), getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()]), ['orange', 'true', '#b65c1f']);
  await page.evaluate(() => receiveNative({ event: 'accentColor', data: { accent: 'blue' } }));
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()), '#2b74d1', 'The main window takes the accent');
  await page.evaluate(() => receiveNative({ event: 'accentColor', data: { accent: 'green' } }));
  await settings.goto(base + 'settings.html?preview=1&section=help');
  await settings.evaluate(() => { const d = document.querySelectorAll('#settings-body details'); d[0].open = false; d[2].open = true; });
  await settings.evaluate(() => receiveNative({ event: 'snapshot', data: { notifications: true, voice: false } }));
  assert.deepEqual(await settings.evaluate(() => [...document.querySelectorAll('#settings-body details')].slice(0, 3).map(d => d.open)), [false, false, true], 'An unchanged snapshot leaves open sections alone');

  assert.deepEqual(errors, []);
  console.log('PASS interaction polish: dialogs over a visible app, backdrop close, modal-aware shortcuts, menu Escape, focus return, Mac chrome selection and drag strips, inspector rows and settings scroll, menus, settings keyboard, accent colour and stable snapshots');
} finally { clearTimeout(kill); await browser.close(); }
