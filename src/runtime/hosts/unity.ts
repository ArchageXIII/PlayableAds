import type { HostBridge } from '../types';
import { observeMraid } from './mraid';

export function createHost(): HostBridge {
  let timer: number | undefined;
  let unsubscribe = function (): void {};
  let stopped = false;
  let ready = false;
  return {
    start: function (visibility, resize, status): void {
      let attempts = 0;
      visibility(false);
      status('Waiting for ad host');
      function connect(): void {
        if (stopped) return;
        if (window.mraid) {
          try {
            unsubscribe = observeMraid(window.mraid, function (visible): void {
              ready = true;
              visibility(visible);
            }, resize, status);
          } catch (_error) { visibility(false); status('Ad host unavailable'); }
        } else if (++attempts < 100) timer = window.setTimeout(connect, 100);
        else status('Ad host unavailable');
      }
      connect();
    },
    exit: function (storeUrl): boolean {
      if (!ready || !storeUrl || !window.mraid || !window.mraid.isViewable()) return false;
      try { window.mraid.open(storeUrl); return true; } catch (_error) { return false; }
    },
    dispose: function (): void { stopped = true; window.clearTimeout(timer); unsubscribe(); }
  };
}
