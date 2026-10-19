import type { CreateGame } from '../../src/runtime/types';
import { circleHit, drawSprite } from '../../src/runtime/math';

export const createGame: CreateGame = function (context) {
  const keys = ['coral', 'mint', 'blue'];
  const colours = ['#ff8a93', '#77e1d2', '#83b7ff'];
  const sorted = [false, false, false, false, false, false];
  let selected = -1;
  let pointerId = -1;
  let dragX = 0;
  let dragY = 0;
  let count = 0;
  function position(index: number): { x: number; y: number; radius: number } {
    return { x: context.layout.width * (0.18 + (index % 3) * 0.32), y: context.layout.height * (index < 3 ? 0.19 : 0.42), radius: Math.min(context.layout.width * 0.095, context.layout.height * 0.09, 29) };
  }
  context.setProgress('0 / 6');
  return {
    update: function (): void {},
    render: function (canvas): void {
      const width = context.layout.width;
      const height = context.layout.height;
      for (let bin = 0; bin < 3; bin++) {
        const x = width * (0.18 + bin * 0.32);
        canvas.fillStyle = '#253a50'; canvas.fillRect(x - width * 0.135, height * 0.66, width * 0.27, height * 0.28);
        canvas.strokeStyle = colours[bin]; canvas.lineWidth = 2; canvas.strokeRect(x - width * 0.135, height * 0.66, width * 0.27, height * 0.28);
        canvas.fillStyle = colours[bin]; canvas.font = Math.max(9, Math.min(12, width / 30)) + 'px Arial'; canvas.textAlign = 'center';
        canvas.fillText(keys[bin].toUpperCase(), x, height * 0.85);
      }
      for (let i = 0; i < 6; i++) {
        if (sorted[i]) continue;
        const shape = position(i);
        drawSprite(canvas, context.images[keys[i % 3]], selected === i ? dragX : shape.x, selected === i ? dragY : shape.y, shape.radius * 2);
      }
    },
    resize: function (): void { selected = -1; pointerId = -1; },
    onInput: function (input): void {
      if (input.phase === 'cancel') { selected = -1; pointerId = -1; return; }
      if (input.phase === 'down') {
        if (selected !== -1) return;
        for (let i = 0; i < 6; i++) {
          const shape = position(i);
          if (!sorted[i] && circleHit(input.x, input.y, shape.x, shape.y, shape.radius * 1.4)) {
            selected = i; pointerId = input.id; dragX = input.x; dragY = input.y; break;
          }
        }
      } else if (selected !== -1 && input.id === pointerId) {
        dragX = input.x; dragY = input.y;
        if (input.phase === 'up') {
          const binX = context.layout.width * (0.18 + (selected % 3) * 0.32);
          if (Math.abs(input.x - binX) < context.layout.width * 0.135 && input.y >= context.layout.height * 0.66 && input.y <= context.layout.height * 0.94) {
            sorted[selected] = true; count++; context.setProgress(count + ' / 6'); context.playSound();
            if (count === 6) context.complete('success');
          }
          selected = -1; pointerId = -1;
        }
      }
    },
    dispose: function (): void { selected = -1; }
  };
};
