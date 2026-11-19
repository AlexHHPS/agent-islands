/* Apache-2.0 · Island animation budget.
   Every diorama is driven by one shared loop at a capped frame rate, and only while
   someone is looking: after a quiet spell, or when the window or the scene cannot be
   seen, the islands hold their last frame and cost nothing. Pointer activity and agent
   changes wake them again. Reduced-motion mounts keep their single still frame. */
'use strict';
const IslandMotion = (() => {
  const frameMs = 1000 / 24, quietMs = 20000, live = new Map();
  let awakeUntil = performance.now() + quietMs, windowVisible = true, covered = false, raf = 0, timer = 0, last = 0, drawn = 0;
  const mount = Diorama.mount;
  const canAnimate = () => windowVisible && !covered && !document.hidden && performance.now() < awakeUntil;
  function tick(now) {
    raf = 0;
    if (!canAnimate()) { last = 0; return; }
    const dt = last ? Math.min(.1, (now - last) / 1000) : 0; last = now;
    let any = false;
    for (const [ctx, entry] of live) if (entry.visible) { any = true; ctx.step(dt); ctx.render(); }
    if (!any) { last = 0; return; }
    drawn++;
    // Sleep between frames instead of being called at display rate just to skip.
    timer = setTimeout(() => { timer = 0; raf = requestAnimationFrame(tick); }, frameMs - 8);
  }
  function schedule() { if (!raf && !timer && canAnimate() && [...live.values()].some(e => e.visible)) raf = requestAnimationFrame(tick); }
  function wake(ms = quietMs) { awakeUntil = Math.max(awakeUntil, performance.now() + ms); schedule(); }
  function setWindowVisible(visible) { windowVisible = !!visible; if (windowVisible) wake(); }
  // A modal dialog covers the page: islands hold their frame behind it (the page stays visible, dimmed).
  function setCovered(value) { covered = !!value; if (!covered) wake(); }
  Diorama.mount = (fig, opts = {}) => {
    const ctx = mount(fig, opts);
    if (ctx.reduced) return ctx;
    // The kernel's own loop runs at display rate; the shared loop replaces it.
    ctx.stop(); ctx.start = () => { wake(); return ctx; };
    const entry = {visible: true}, host = opts.el;
    const io = typeof IntersectionObserver === 'function' && host ? new IntersectionObserver(es => { entry.visible = es[es.length - 1].isIntersecting; if (entry.visible) schedule(); }, {threshold: 0}) : null;
    if (io) io.observe(host);
    // The kernel resizes on its own observer; while the loop sleeps the new size still needs a frame.
    const ro = typeof ResizeObserver === 'function' && host ? new ResizeObserver(() => ctx.render()) : null;
    if (ro) ro.observe(host);
    live.set(ctx, entry);
    const destroy = ctx.destroy;
    ctx.destroy = () => { live.delete(ctx); io?.disconnect(); ro?.disconnect(); destroy(); };
    schedule();
    return ctx;
  };
  for (const type of ['pointermove', 'pointerdown', 'wheel']) document.addEventListener(type, () => { if (performance.now() > awakeUntil - quietMs + 500) wake(); }, {passive: true});
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
  return {wake, setWindowVisible, setCovered, get animating() { return (raf !== 0 || timer !== 0) && canAnimate(); }, get count() { return live.size; }, get frames() { return drawn; }, frameMs, quietMs};
})();
window.IslandMotion = IslandMotion;
