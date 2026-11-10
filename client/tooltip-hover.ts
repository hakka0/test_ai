export type TooltipHoverMode = 'trigger' | 'interactive';

/** Hover lifetime is independent of click/touch pinning. Opt in per trigger. */
export function tooltipHoverMode(source: HTMLElement): TooltipHoverMode {
 return source.dataset.tooltipHover === 'interactive' ? 'interactive' : 'trigger';
}

export function createTooltipHover(options: {
 tip: HTMLElement;
 source: () => HTMLElement | null;
 pinned?: () => boolean;
 close: () => void;
}) {
 let leaveTimer = 0;
 const contains = (element: HTMLElement | null, target: EventTarget | null) =>
  target instanceof Node && !!element?.contains(target);
 function cancel() { window.clearTimeout(leaveTimer); leaveTimer = 0; }
 function enter() {
  cancel();
  const source = options.source();
  if (source) options.tip.dataset.tooltipHover = tooltipHoverMode(source);
 }
 function leave(target: EventTarget | null) {
  const source = options.source();
  if (!source || options.pinned?.() || contains(source, target)) return;
  cancel();
  if (tooltipHoverMode(source) === 'trigger') options.close();
  else if (!contains(options.tip, target)) {
   // Let the pointer cross the gap between an interactive balloon and its trigger.
   leaveTimer = window.setTimeout(options.close, 120);
  }
 }
 options.tip.addEventListener('pointerenter', () => {
  const source = options.source();
  if (!source || options.pinned?.()) return;
  if (tooltipHoverMode(source) === 'interactive') cancel();
  else options.close();
 });
 options.tip.addEventListener('pointerleave', event => leave(event.relatedTarget));
 return { enter, leave, cancel };
}
