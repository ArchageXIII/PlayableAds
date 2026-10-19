import type { CreateGame } from '../../src/runtime/types';
import { circleHit, drawSprite } from '../../src/runtime/math';

export const createGame: CreateGame = function (context) {
  const collected = [false, false, false, false, false, false, false, false];
  let count = 0;
  let phase = 0;
  function position(index: number): { x: number; y: number; radius: number } {
    const width = context.layout.width;
    const height = context.layout.height;
    return { x: width * (index % 2 === 0 ? 0.28 : 0.72), y: height * (0.18 + Math.floor(index / 2) * 0.21), radius: Math.min(width * 0.12, height * 0.085, 33) };
  }
  context.setProgress('0 / 8');
  return {
    update: function (dt): void { phase += dt; },
    render: function (canvas): void {
      for (let i = 0; i < collected.length; i++) {
        const coin = position(i);
        if (collected[i]) {
          canvas.beginPath(); canvas.arc(coin.x, coin.y, coin.radius * 0.7, 0, Math.PI * 2);
          canvas.fillStyle = '#25394d'; canvas.fill();
          canvas.fillStyle = '#70a494'; canvas.font = '18px Arial'; canvas.textAlign = 'center'; canvas.textBaseline = 'middle'; canvas.fillText('✓', coin.x, coin.y);
        } else {
          const scale = 1 + Math.sin(phase * 3 + i) * 0.04;
          drawSprite(canvas, context.images.coin, coin.x, coin.y, coin.radius * 2 * scale);
        }
      }
    },
    resize: function (): void {},
    onInput: function (input): void {
      if (input.phase !== 'down') return;
      for (let i = 0; i < collected.length; i++) {
        const coin = position(i);
        if (!collected[i] && circleHit(input.x, input.y, coin.x, coin.y, coin.radius * 1.35)) {
          collected[i] = true; count++; context.setProgress(count + ' / 8'); context.playSound();
          if (count === 8) context.complete('success');
          break;
        }
      }
    },
    dispose: function (): void {}
  };
};
