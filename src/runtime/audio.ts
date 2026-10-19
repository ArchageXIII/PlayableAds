import type { EmbeddedAsset } from './types';

export function createAudio(assets: Record<string, EmbeddedAsset>, status: (value: string) => void) {
  let unlocked = false;
  let muted = false;
  let visible = false;
  let context: AudioContext | undefined;
  let oscillator: OscillatorNode | undefined;
  const clips: HTMLAudioElement[] = [];
  function update(): void { status(!unlocked ? 'locked' : muted ? 'muted' : visible ? 'ready' : 'paused'); }
  function silence(): void {
    if (oscillator) { try { oscillator.stop(); } catch (_error) {} oscillator = undefined; }
    for (let i = 0; i < clips.length; i++) { try { clips[i].pause(); clips[i].currentTime = 0; } catch (_error) {} }
  }
  function ignoreFailure(result: Promise<void> | void): void { if (result && result.catch) result.catch(function (): void {}); }
  return {
    unlock: function (): void {
      unlocked = true;
      try {
        const Constructor = window.AudioContext || window.webkitAudioContext;
        if (!context && Constructor) context = new Constructor();
        if (context && context.state === 'suspended') ignoreFailure(context.resume());
      } catch (_error) { context = undefined; }
      update();
    },
    toggle: function (): boolean { muted = !muted; if (muted) silence(); update(); return muted; },
    setVisible: function (value: boolean): void { visible = value; if (!value) silence(); update(); },
    play: function (assetId?: string): void {
      if (!unlocked || muted || !visible) return;
      try {
        if (assetId && assets[assetId] && assets[assetId].kind === 'audio') {
          const clip = new Audio(assets[assetId].data);
          clip.volume = 0.2;
          if (clips.length >= 8) { const oldest = clips.shift()!; oldest.pause(); }
          clips.push(clip);
          function removeClip(): void { const index = clips.indexOf(clip); if (index >= 0) clips.splice(index, 1); }
          clip.onended = removeClip; clip.onerror = removeClip;
          const playback = clip.play();
          if (playback && playback.catch) playback.catch(removeClip);
        } else if (context && context.state === 'running') {
          if (oscillator) { try { oscillator.stop(); } catch (_error) {} }
          oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.frequency.value = 660;
          gain.gain.setValueAtTime(0.08, context.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.1);
          oscillator.connect(gain);
          gain.connect(context.destination);
          const tone = oscillator;
          tone.onended = function (): void { tone.disconnect(); gain.disconnect(); if (oscillator === tone) oscillator = undefined; };
          oscillator.start();
          oscillator.stop(context.currentTime + 0.11);
        }
      } catch (_error) { /* Audio is optional; gameplay continues silently. */ }
    },
    dispose: function (): void { silence(); if (context && context.close) ignoreFailure(context.close()); }
  };
}
