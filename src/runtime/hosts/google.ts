import type { HostBridge } from '../types';
import { observeMraid } from './mraid';

export function createHost(): HostBridge {
  let unsubscribe = function (): void {};
  let viewable = false;
  return {
    start: function (visibility, resize, status): void {
      function report(visible: boolean): void { viewable = visible; visibility(visible); }
      if (window.mraid) {
        try { unsubscribe = observeMraid(window.mraid, report, resize, status); }
        catch (_error) { report(false); status('Ad host unavailable'); }
      } else report(true);
    },
    exit: function (): boolean {
      if (!viewable || !window.ExitApi || typeof window.ExitApi.exit !== 'function') return false;
      try { window.ExitApi.exit(); return true; } catch (_error) { return false; }
    },
    dispose: function (): void { unsubscribe(); }
  };
}
