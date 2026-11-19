/* Apache-2.0 · Page states as plain classes.
   These states used to be :has() selectors. WebKit re-evaluates :has() against the page
   for every element added anywhere, and the islands and terminals add hundreds per frame,
   so each rule turned cheap DOM work into a full-page check. Classes cost nothing. */
'use strict';
(() => {
  // <dialog> open state on <body>: body.<id>-open
  const dialogs = ['project-dialog', 'launch-dialog', 'search-dialog', 'operations-dialog'];
  const syncDialogs = () => { for (const id of dialogs) document.body.classList.toggle(id + '-open', !!document.getElementById(id)?.open); };
  // The open attribute changes before the next paint, so the class never lags behind the dialog.
  const dialogObserver = new MutationObserver(syncDialogs);
  for (const id of dialogs) { const dialog = document.getElementById(id); if (dialog) dialogObserver.observe(dialog, {attributes: true, attributeFilter: ['open']}); }

  // Checked and keyboard-focused choices: label.is-checked, label.is-focus-visible
  const choices = '.annotation-choice label,.workspace-project';
  window.syncCheckedLabels = (root = document) => { for (const label of root.querySelectorAll(choices)) label.classList.toggle('is-checked', !!label.querySelector('input')?.checked); };
  document.addEventListener('change', event => { if (event.target instanceof HTMLInputElement) syncCheckedLabels(event.target.closest('form,[role=group]') || document); }, true);
  document.addEventListener('reset', event => queueMicrotask(() => syncCheckedLabels(event.target)), true);
  document.addEventListener('focusin', event => event.target.closest?.(choices)?.classList.toggle('is-focus-visible', event.target.matches(':focus-visible')));
  document.addEventListener('focusout', event => event.target.closest?.(choices)?.classList.remove('is-focus-visible'));
  syncDialogs(); syncCheckedLabels();
})();
