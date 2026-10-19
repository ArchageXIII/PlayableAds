import type { CreateGame, GameContext, HostBridge, Layout, PlayableGame, RuntimeConfig } from './types';
import { loadImages } from './assets';
import { createAudio } from './audio';
import { bindInput } from './input';
import { clamp } from './math';

export function boot(createGame: CreateGame, config: RuntimeConfig, host: HostBridge): void {
  const root = document.getElementById('ad-root');
  if (!root) return;
  function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
    const item = document.createElement(tag); item.className = className; item.textContent = text; return item;
  }
  const shell = element('main', 'playable');
  const header = element('header', 'game-header');
  const eyebrow = element('div', 'eyebrow', 'PLAY A LITTLE');
  const title = element('h1', 'game-title', config.title);
  const instructions = element('p', 'instructions', config.instructions);
  instructions.id = 'instructions';
  const hud = element('div', 'hud');
  const progress = element('span', 'progress', '0');
  const time = element('span', 'time', config.durationSeconds + 's');
  const mute = element('button', 'sound-button', 'Sound on');
  mute.type = 'button'; mute.setAttribute('aria-label', 'Mute sound');
  hud.appendChild(progress); hud.appendChild(time); hud.appendChild(mute);
  header.appendChild(eyebrow); header.appendChild(title); header.appendChild(instructions); header.appendChild(hud);
  const stage = element('section', 'stage');
  const canvas = element('canvas', 'game-canvas');
  canvas.setAttribute('aria-label', config.title + ' play area'); canvas.setAttribute('aria-describedby', 'instructions');
  const status = element('p', 'status', 'Loading artwork');
  status.setAttribute('role', 'status');
  const endcard = element('section', 'endcard');
  endcard.hidden = true;
  const result = element('h2', 'result');
  const endcopy = element('p', 'endcopy');
  const install = element('button', 'install', config.ctaText);
  install.type = 'button'; install.hidden = true;
  const replay = element('button', 'replay', 'Play again');
  replay.type = 'button';
  endcard.appendChild(result); endcard.appendChild(endcopy); endcard.appendChild(install); endcard.appendChild(replay);
  stage.appendChild(canvas); stage.appendChild(status); stage.appendChild(endcard);
  shell.appendChild(header); shell.appendChild(stage); root.appendChild(shell);
  shell.style.borderColor = config.accent;
  install.style.backgroundColor = config.accent;
  const drawing = canvas.getContext('2d');
  if (!drawing) { status.textContent = 'Canvas is unavailable'; return; }
  const ctx2d = drawing;
  let layout: Layout = { width: 320, height: 320, pixelRatio: 1, orientation: 'portrait' };
  let game: PlayableGame | undefined;
  let hostVisible = false;
  let pageVisible = !document.hidden;
  let assetsReady = false;
  let finished = false;
  let disposed = false;
  let frame: number | undefined;
  let previousTime: number | undefined;
  let hostMessage = '';
  let outcomeMessage = '';
  const requestFrame = window.requestAnimationFrame ? function (callback: FrameRequestCallback): number { return window.requestAnimationFrame(callback); } : function (callback: FrameRequestCallback): number { return window.setTimeout(function (): void { callback(Date.now()); }, 16); };
  const cancelFrame = window.cancelAnimationFrame ? function (id: number): void { window.cancelAnimationFrame(id); } : function (id: number): void { window.clearTimeout(id); };
  const audio = createAudio(config.assets, function (value): void { root!.setAttribute('data-audio', value); });
  const context: GameContext = {
    config, layout, images: {}, elapsed: 0, hasInteracted: false,
    complete: function (outcome): void {
      if (finished || disposed) return;
      finished = true;
      root!.setAttribute('data-outcome', outcome);
      result.textContent = outcome === 'success' ? 'Nicely done!' : 'Another try?';
      endcopy.textContent = outcome === 'success' ? config.successText : config.failureText;
      install.hidden = !context.hasInteracted;
      endcard.hidden = false;
      context.playSound();
      synchronize();
    },
    setProgress: function (value): void { progress.textContent = value; },
    playSound: function (assetId): void { audio.play(assetId); }
  };
  function active(): boolean { return assetsReady && hostVisible && pageVisible && !disposed; }
  function draw(): void { if (game) { ctx2d.clearRect(0, 0, layout.width, layout.height); game.render(ctx2d); } }
  function tick(timestamp: number): void {
    frame = undefined;
    if (!active() || finished || !game) return;
    const dt = previousTime === undefined ? 0 : clamp((timestamp - previousTime) / 1000, 0, 0.05);
    previousTime = timestamp;
    if (context.hasInteracted) {
      context.elapsed += dt;
      game.update(dt);
      time.textContent = Math.ceil(Math.max(0, config.durationSeconds - context.elapsed)) + 's';
      if (context.elapsed >= config.durationSeconds && !finished) context.complete('failure');
    }
    draw();
    if (!finished && active() && frame === undefined) frame = requestFrame(tick);
  }
  function synchronize(): void {
    previousTime = undefined;
    if (frame !== undefined) { cancelFrame(frame); frame = undefined; }
    audio.setVisible(active());
    root!.setAttribute('data-state', disposed ? 'disposed' : !assetsReady ? 'loading' : !hostVisible || !pageVisible ? 'paused' : finished ? 'completed' : 'running');
    status.textContent = outcomeMessage || hostMessage || (!assetsReady ? 'Loading artwork' : !hostVisible ? 'Waiting for visibility' : !pageVisible ? 'Paused' : '');
    status.hidden = !status.textContent;
    install.disabled = !active() || !context.hasInteracted;
    replay.disabled = !active();
    canvas.setAttribute('aria-disabled', String(!active() || finished));
    if (active() && !finished) frame = requestFrame(tick);
  }
  function resize(): void {
    shell.style.height = window.innerHeight + 'px';
    const rect = stage.getBoundingClientRect();
    layout = { width: Math.max(1, rect.width), height: Math.max(1, rect.height), pixelRatio: clamp(window.devicePixelRatio || 1, 1, 2), orientation: window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait' };
    context.layout = layout;
    canvas.width = Math.round(layout.width * layout.pixelRatio); canvas.height = Math.round(layout.height * layout.pixelRatio);
    ctx2d.setTransform(layout.pixelRatio, 0, 0, layout.pixelRatio, 0, 0);
    root!.setAttribute('data-orientation', layout.orientation);
    if (game) { game.onInput({ phase: 'cancel', x: 0, y: 0, id: -1 }); game.resize(layout); }
    draw();
  }
  const unbind = bindInput(canvas, function (input, event): void {
    if (!active() || finished || !game) return;
    if (input.phase === 'down') {
      if (!event.isTrusted) return;
      context.hasInteracted = true;
      audio.unlock();
    }
    game.onInput(input);
    draw();
  });
  mute.onclick = function (event): void {
    if (!active() || !event.isTrusted) return;
    audio.unlock();
    const muted = audio.toggle();
    mute.textContent = muted ? 'Sound off' : 'Sound on';
    mute.setAttribute('aria-label', muted ? 'Enable sound' : 'Mute sound');
    mute.setAttribute('aria-pressed', String(muted));
  };
  install.onclick = function (event): void {
    if (!event.isTrusted || !active() || !context.hasInteracted || !finished) return;
    if (!host.exit()) {
      outcomeMessage = 'Install is unavailable in this environment';
      status.textContent = outcomeMessage; status.hidden = false;
    }
  };
  replay.onclick = function (event): void {
    if (!event.isTrusted || !active()) return;
    if (game) game.dispose();
    finished = false; context.elapsed = 0; context.hasInteracted = false; outcomeMessage = '';
    root!.removeAttribute('data-outcome'); endcard.hidden = true; install.hidden = true;
    time.textContent = config.durationSeconds + 's';
    game = createGame(context); game.resize(layout); draw(); synchronize();
  };
  function visibility(): void {
    const legacy = document as Document & { webkitHidden?: boolean };
    pageVisible = !(document.hidden || legacy.webkitHidden);
    if (!pageVisible && game) game.onInput({ phase: 'cancel', x: 0, y: 0, id: -1 });
    synchronize();
  }
  function pageHide(): void { pageVisible = false; synchronize(); }
  function pageShow(): void { visibility(); }
  function dispose(): void {
    if (disposed) return;
    disposed = true; synchronize(); unbind(); cancelLoad(); host.dispose(); audio.dispose();
    if (game) game.dispose();
    window.removeEventListener('resize', resize); window.removeEventListener('pagehide', pageHide); window.removeEventListener('pageshow', pageShow);
    document.removeEventListener('visibilitychange', visibility); document.removeEventListener('webkitvisibilitychange', visibility);
  }
  resize();
  const cancelLoad = loadImages(config.assets, function (images): void {
    if (disposed) return;
    context.images = images; assetsReady = true;
    try { game = createGame(context); game.resize(layout); draw(); synchronize(); }
    catch (_error) { assetsReady = false; outcomeMessage = 'Unable to start game'; synchronize(); }
  }, function (message): void { outcomeMessage = message; synchronize(); });
  host.start(function (visible): void {
    hostVisible = visible;
    if (!visible && game) game.onInput({ phase: 'cancel', x: 0, y: 0, id: -1 });
    synchronize();
  }, resize, function (message): void { hostMessage = message; synchronize(); });
  window.addEventListener('resize', resize); window.addEventListener('pagehide', pageHide); window.addEventListener('pageshow', pageShow);
  window.addEventListener('unload', dispose);
  document.addEventListener('visibilitychange', visibility); document.addEventListener('webkitvisibilitychange', visibility);
}
