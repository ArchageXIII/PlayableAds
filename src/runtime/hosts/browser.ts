import type { HostBridge } from '../types';

// Development harness only. This module is never included in ad exports.
export function createHost(): HostBridge {
  return {
    start: function (visibility): void { visibility(true); },
    exit: function (): boolean {
      window.dispatchEvent(new CustomEvent('adgames-preview-exit'));
      return true;
    },
    dispose: function (): void {}
  };
}
