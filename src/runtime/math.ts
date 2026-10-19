export function clamp(value: number, low: number, high: number): number { return Math.max(low, Math.min(high, value)); }
export function lerp(from: number, to: number, amount: number): number { return from + (to - from) * amount; }
export function easeOutCubic(value: number): number { return 1 - Math.pow(1 - clamp(value, 0, 1), 3); }
export function circleHit(x: number, y: number, cx: number, cy: number, radius: number): boolean {
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= radius * radius;
}
export function drawSprite(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height = width): void {
  ctx.drawImage(image, x - width / 2, y - height / 2, width, height);
}
