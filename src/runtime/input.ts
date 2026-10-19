import type { GameInput } from './types';

export function bindInput(canvas: HTMLCanvasElement, accept: (input: GameInput, event: Event) => void): () => void {
  const listeners: Array<{ name: string; handler: EventListener }> = [];
  let mouseDown = false;
  let lastTouch = 0;
  function send(phase: GameInput['phase'], x: number, y: number, id: number, event: Event): void {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    event.preventDefault();
    accept({ phase, x: x - rect.left, y: y - rect.top, id }, event);
  }
  function listen(name: string, handler: EventListener): void { canvas.addEventListener(name, handler, false); listeners.push({ name, handler }); }
  if (typeof window.PointerEvent !== 'undefined') {
    (['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const).forEach(function (name): void {
      listen(name, function (event): void {
        const pointer = event as PointerEvent;
        if (!pointer.isPrimary || (name === 'pointerdown' && pointer.button !== 0)) return;
        if (name === 'pointerdown' && canvas.setPointerCapture) { try { canvas.setPointerCapture(pointer.pointerId); } catch (_error) {} }
        send(name.replace('pointer', '') as GameInput['phase'], pointer.clientX, pointer.clientY, pointer.pointerId, event);
      });
    });
  } else {
    (['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const).forEach(function (name): void {
      listen(name, function (event): void {
        const touch = (event as TouchEvent).changedTouches[0];
        if (!touch) return;
        lastTouch = Date.now();
        const phase = name === 'touchstart' ? 'down' : name === 'touchend' ? 'up' : name === 'touchmove' ? 'move' : 'cancel';
        send(phase, touch.clientX, touch.clientY, touch.identifier, event);
      });
    });
    listen('mousedown', function (event): void {
      const mouse = event as MouseEvent;
      if (Date.now() - lastTouch < 800 || mouse.button !== 0) return;
      mouseDown = true; send('down', mouse.clientX, mouse.clientY, 0, event);
    });
    listen('mousemove', function (event): void { if (mouseDown) { const mouse = event as MouseEvent; send('move', mouse.clientX, mouse.clientY, 0, event); } });
    listen('mouseup', function (event): void { if (mouseDown) { mouseDown = false; const mouse = event as MouseEvent; send('up', mouse.clientX, mouse.clientY, 0, event); } });
    listen('mouseleave', function (event): void { if (mouseDown) { mouseDown = false; const mouse = event as MouseEvent; send('cancel', mouse.clientX, mouse.clientY, 0, event); } });
  }
  return function (): void { listeners.forEach(function (listener): void { canvas.removeEventListener(listener.name, listener.handler, false); }); };
}
