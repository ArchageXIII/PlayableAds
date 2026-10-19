import type { Mraid } from '../types';

// Subscribe before reading state so ready/viewable transitions cannot be lost.
export function observeMraid(sdk: Mraid, visibility: (visible: boolean) => void, resize: () => void, status: (message: string) => void): () => void {
  const subscriptions: Array<{ event: string; callback: (...args: any[]) => void }> = [];
  let ready = false;
  function listen(event: string, callback: (...args: any[]) => void): void {
    sdk.addEventListener(event, callback);
    subscriptions.push({ event, callback });
  }
  function viewable(value: boolean): void { if (ready) visibility(value === true); }
  function onReady(): void {
    if (ready) return;
    ready = true;
    status('');
    visibility(sdk.isViewable() === true);
  }
  listen('ready', onReady);
  listen('viewableChange', viewable);
  listen('sizeChange', resize);
  listen('error', function (message: string): void { status('Ad host: ' + message); });
  if (sdk.getState() !== 'loading') onReady();
  return function (): void {
    ready = false;
    for (let i = 0; i < subscriptions.length; i++) {
      if (sdk.removeEventListener) sdk.removeEventListener(subscriptions[i].event, subscriptions[i].callback);
    }
  };
}
