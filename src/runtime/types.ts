export type Platform = 'unity' | 'google' | 'browser';
export type TargetOs = 'android' | 'ios';
export type InputPhase = 'down' | 'move' | 'up' | 'cancel';
export interface GameInput { phase: InputPhase; x: number; y: number; id: number }
export interface Layout { width: number; height: number; pixelRatio: number; orientation: 'portrait' | 'landscape' }
export interface AssetSpec { path: string; kind: 'image' | 'audio' }
export interface GameConfig {
  id: string;
  title: string;
  instructions: string;
  durationSeconds: number;
  successText: string;
  failureText: string;
  ctaText: string;
  accent: string;
  assets: Record<string, AssetSpec>;
}
export interface EmbeddedAsset { kind: 'image' | 'audio'; data: string }
export interface RuntimeConfig extends Omit<GameConfig, 'assets'> {
  assets: Record<string, EmbeddedAsset>;
  storeUrl: string;
  targetOs: TargetOs;
}
export interface GameContext {
  config: RuntimeConfig;
  layout: Layout;
  images: Record<string, HTMLImageElement>;
  elapsed: number;
  hasInteracted: boolean;
  complete: (outcome: 'success' | 'failure') => void;
  setProgress: (text: string) => void;
  playSound: (assetId?: string) => void;
}
export interface PlayableGame {
  update: (dt: number) => void;
  render: (canvas: CanvasRenderingContext2D) => void;
  resize: (layout: Layout) => void;
  onInput: (input: GameInput) => void;
  dispose: () => void;
}
export type CreateGame = (context: GameContext) => PlayableGame;
export interface HostBridge {
  start: (visibility: (visible: boolean) => void, resize: () => void, status: (message: string) => void) => void;
  exit: (storeUrl: string) => boolean;
  dispose: () => void;
}
export interface Mraid {
  getState: () => string;
  isViewable: () => boolean;
  addEventListener: (event: string, callback: (...args: any[]) => void) => void;
  removeEventListener?: (event: string, callback: (...args: any[]) => void) => void;
  open: (url: string) => void;
}
declare global {
  interface Window {
    mraid?: Mraid;
    ExitApi?: { exit: () => void };
    webkitAudioContext?: typeof AudioContext;
    webkitHidden?: boolean;
  }
}
