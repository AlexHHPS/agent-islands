/* Apache-2.0 · Optional GPU renderer for terminals.
   Off by default: inside the native window it slowed page snapshots several times over
   and is not yet verified on real sessions. Enable it for a trial with
   localStorage.setItem('islands.gpuTerminals','1') and reload. A lost GPU context
   (sleep, too many terminals) drops back to the default renderer and retries. */
'use strict';
function gpuTerminalsEnabled() { try { return localStorage.getItem('islands.gpuTerminals') === '1'; } catch { return false; } }
function useFastRenderer(term, attempt = 0) {
  if (!gpuTerminalsEnabled() || typeof WebglAddon === 'undefined' || !term?.element) return false;
  try {
    const addon = new WebglAddon.WebglAddon();
    addon.onContextLoss(() => {
      addon.dispose();
      // Display sleep drops GPU contexts; take the fast renderer back once things settle.
      if (attempt < 3) setTimeout(() => { if (term.element?.isConnected) useFastRenderer(term, attempt + 1); }, 2000);
    });
    term.loadAddon(addon);
    return true;
  } catch (error) {
    console.warn('Agent Islands: GPU terminal renderer unavailable, using the default renderer', error);
    return false;
  }
}
