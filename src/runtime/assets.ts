import type { EmbeddedAsset } from './types';

export function loadImages(assets: Record<string, EmbeddedAsset>, done: (images: Record<string, HTMLImageElement>) => void, fail: (message: string) => void): () => void {
  const images: Record<string, HTMLImageElement> = {};
  const keys = Object.keys(assets).filter(function (key): boolean { return assets[key].kind === 'image'; });
  let remaining = keys.length;
  let stopped = false;
  if (!remaining) done(images);
  keys.forEach(function (key): void {
    const image = new Image();
    images[key] = image;
    image.crossOrigin = 'anonymous';
    image.onload = function (): void {
      if (stopped) return;
      if (--remaining === 0) done(images);
    };
    image.onerror = function (): void { if (!stopped) { stopped = true; fail('Unable to load artwork'); } };
    image.src = assets[key].data;
  });
  return function (): void {
    stopped = true;
    Object.keys(images).forEach(function (key): void { images[key].onload = null; images[key].onerror = null; });
  };
}
