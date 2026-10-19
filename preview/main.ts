import './style.css';
import { EXIT_API } from '../tooling/constants';

function control<T extends HTMLElement>(id: string): T { return document.getElementById(id) as T; }
const frame = control<HTMLIFrameElement>('playable');
const game = control<HTMLSelectElement>('game');
const host = control<HTMLSelectElement>('host');
const os = control<HTMLSelectElement>('os');
const ready = control<HTMLInputElement>('ready');
const visible = control<HTMLInputElement>('visible');
const width = control<HTMLInputElement>('width');
const height = control<HTMLInputElement>('height');
let token = '';
let exits = 0;
let reloadNumber = 0;
let viewportWidth = 360; let viewportHeight = 640;
function log(message: string): void {
  const entry = document.createElement('li'); entry.textContent = message;
  control('events').prepend(entry);
  while (control('events').children.length > 12) control('events').lastElementChild!.remove();
}
function message(type: string, value?: unknown): void { frame.contentWindow?.postMessage({ channel: token, type, value }, '*'); }
function fitPreview(): void {
  const w = viewportWidth; const h = viewportHeight;
  const available = document.querySelector('.viewport-scroll')!.clientWidth - 16;
  const scale = Math.min(1, Math.max(0, available / w));
  control('device').style.transform = `scale(${scale})`;
  control('device-wrap').style.width = w * scale + 'px'; control('device-wrap').style.height = h * scale + 'px';
  control('dimensions').textContent = `${w} × ${h} · ${Math.round(scale * 100)}%`;
}
function resize(): void {
  const w = Math.max(240, Math.min(1280, Number(width.value) || 360));
  const h = Math.max(240, Math.min(1280, Number(height.value) || 640));
  width.value = String(w); height.value = String(h);
  viewportWidth = w; viewportHeight = h;
  control('device').style.width = w + 'px'; control('device').style.height = h + 'px';
  fitPreview();
  for (const [id, pw, ph] of [['portrait', 360, 640], ['landscape', 640, 360], ['small', 320, 480]] as const) control(id).setAttribute('aria-pressed', String(w === pw && h === ph));
  log('Viewport ' + w + ' × ' + h);
}
function stubScript(): string {
  // Injected by the preview shell only, before the unmodified game script.
  return `<script>(function(){var token=${JSON.stringify(token)},mode=${JSON.stringify(host.value)},ready=${ready.checked},visible=${visible.checked},events={};function send(type,value){parent.postMessage({channel:token,type:type,value:value},'*')}function emit(name,value){(events[name]||[]).slice().forEach(function(fn){fn(value)})}if(mode==='unity'||mode==='google'){window.mraid={getState:function(){return ready?'default':'loading'},isViewable:function(){return visible},addEventListener:function(name,fn){(events[name]||(events[name]=[])).push(fn)},removeEventListener:function(name,fn){events[name]=(events[name]||[]).filter(function(item){return item!==fn})},open:function(url){send('exit',url)}}}window.ExitApi={exit:function(){send('exit','Google campaign final URL')}};window.addEventListener('adgames-preview-exit',function(){send('exit','Browser preview')});window.addEventListener('message',function(event){if(event.source!==parent||!event.data||event.data.channel!==token)return;if(event.data.type==='ready'&&!ready){ready=true;emit('ready')}if(event.data.type==='visible'){visible=event.data.value;emit('viewableChange',visible)}});setInterval(function(){var root=document.getElementById('ad-root');if(root)send('signals',{state:root.getAttribute('data-state'),audio:root.getAttribute('data-audio'),orientation:root.getAttribute('data-orientation'),progress:(document.querySelector('.progress')||{}).textContent})},200)})();</script>`;
}
async function reload(): Promise<void> {
  const current = ++reloadNumber;
  token = crypto.randomUUID(); exits = 0; control('exit-count').textContent = '0';
  control('os-field').hidden = host.value !== 'unity';
  control('google-destination').hidden = host.value !== 'google';
  const params = new URLSearchParams({ game: game.value, platform: host.value });
  if (host.value === 'unity') params.set('os', os.value);
  control('preview-error').hidden = true;
  control('preview-title').textContent = 'Loading preview…';
  for (const key of ['state', 'audio', 'orientation', 'progress']) control(key).textContent = '—';
  let response: Response;
  try { response = await fetch('/api/export?' + params); } catch (error) { if (current === reloadNumber) previewError(String(error)); return; }
  if (current !== reloadNumber) return;
  if (!response.ok) { const error = await response.text(); if (current === reloadNumber) previewError(error); return; }
  let html = await response.text();
  if (current !== reloadNumber) return;
  html = html.replace(`<script src="${EXIT_API}"></script>`, '');
  html = html.replace('<head>', '<head>' + stubScript());
  frame.srcdoc = html;
  control('preview-title').textContent = game.selectedOptions[0]?.textContent || game.value;
  ready.disabled = host.value === 'browser'; visible.disabled = host.value === 'browser';
  log('Loaded ' + game.value + ' / ' + host.value);
}
window.addEventListener('message', event => {
  if (event.source !== frame.contentWindow || event.data?.channel !== token) return;
  if (event.data.type === 'exit') { exits++; control('exit-count').textContent = String(exits); log('CTA click recorded: ' + (event.data.value || 'Unconfigured preview destination')); }
  if (event.data.type === 'signals') for (const key of ['state', 'audio', 'orientation', 'progress']) control(key).textContent = event.data.value[key] || '—';
});
function previewError(error: string): void {
  frame.srcdoc = ''; control('preview-title').textContent = 'Preview unavailable';
  control('preview-error').hidden = false;
  control('preview-error').textContent = `Preview failed: ${error}. Fix the reported error and restart preview.`;
}
game.onchange = () => { void reload(); void refreshFiles(true); };
host.onchange = () => { void reload(); updateBuildCommand(); };
os.onchange = () => { void reload(); };
control('reload').onclick = () => { void reload(); };
ready.onchange = () => { if (!ready.checked) { void reload(); } else message('ready'); };
visible.onchange = () => message('visible', visible.checked);
control<HTMLInputElement>('overlay').onchange = () => { control('container-close').hidden = !control<HTMLInputElement>('overlay').checked; };
control<HTMLFormElement>('size-form').onsubmit = event => { event.preventDefault(); resize(); };
window.addEventListener('resize', fitPreview);
let pendingFit = 0;
new ResizeObserver(() => {
  cancelAnimationFrame(pendingFit);
  pendingFit = requestAnimationFrame(fitPreview);
}).observe(document.querySelector('.viewport-scroll')!);
for (const [id, w, h] of [['portrait', 360, 640], ['landscape', 640, 360], ['small', 320, 480]] as const) {
  control(id).onclick = () => { width.value = String(w); height.value = String(h); resize(); };
}

type FileListing = { state: 'empty' } | { state: 'built'; fingerprint: string; mode: string; createdAt: string; artifacts: { platform: 'google' | 'unity'; os?: string; available: boolean; absolutePath: string; bytes: number; error: string }[] };
let filesNumber = 0; let verificationNumber = 0; let fingerprint = ''; let filesGame = ''; let listingSignature = '';
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.textContent = text; return node;
}
function updateBuildCommand(): void {
  const command = document.getElementById('build-command');
  if (command) command.textContent = `npm run build -- --game ${game.value} --platform ${host.value === 'browser' ? 'all' : host.value} --mode preview`;
}
function downloadUrl(extra: Record<string, string>): string {
  return '/api/download?' + new URLSearchParams({ game: filesGame, fingerprint, ...extra });
}
function resetVerification(): void {
  verificationNumber++; control('report').textContent = 'Current sources not checked.';
}
async function copyPath(value: string): Promise<void> {
  control('copy-fallback').hidden = true;
  try {
    await navigator.clipboard.writeText(value);
    control('file-action-status').textContent = 'File path copied.';
  } catch {
    control('copy-fallback').hidden = false;
    const input = control<HTMLInputElement>('copy-path'); input.value = value; input.focus(); input.select();
    control('file-action-status').textContent = 'Clipboard unavailable. Copy the selected file path.';
  }
}
async function refreshFiles(reset = false, quiet = false): Promise<void> {
  const current = ++filesNumber; const selected = game.value;
  if (!selected) return;
  if (reset) { fingerprint = ''; filesGame = selected; resetVerification(); control('files').textContent = 'Loading exported files…'; }
  if (reset || !fingerprint) control<HTMLButtonElement>('verify').disabled = true;
  if (!quiet) { control('file-action-status').textContent = ''; control('copy-fallback').hidden = true; }
  try {
    const response = await fetch('/api/files?game=' + encodeURIComponent(selected));
    if (!response.ok) throw new Error(await response.text());
    const listing = await response.json() as FileListing;
    if (current !== filesNumber || selected !== game.value) return;
    const signature = selected + JSON.stringify(listing);
    if (!reset && signature === listingSignature) return;
    listingSignature = signature;
    const nextFingerprint = listing.state === 'built' ? listing.fingerprint : '';
    if (fingerprint !== nextFingerprint || filesGame !== selected) resetVerification();
    fingerprint = nextFingerprint; filesGame = selected;
    const files = control('files'); files.replaceChildren();
    if (listing.state === 'empty') {
      control<HTMLButtonElement>('verify').disabled = true;
      files.append(element('p', 'No export yet'), element('p', 'Build preview exports from the project folder:'));
      const command = element('code', ''); command.id = 'build-command'; files.append(command); updateBuildCommand(); return;
    }
    files.append(element('p', listing.mode === 'preview' ? 'Preview build' : 'Release build'), element('p', 'Built ' + new Date(listing.createdAt).toLocaleString()));
    for (const item of listing.artifacts) {
      const card = element('div', ''); card.className = 'file-card';
      const name = item.platform === 'google' ? 'Google ZIP' : `Unity ${item.os === 'android' ? 'Android' : 'iOS'} HTML`;
      if (item.available) {
        const link = element('a', 'Download ' + name); link.href = downloadUrl({ platform: item.platform, ...(item.os ? { os: item.os } : {}) });
        link.setAttribute('download', ''); card.append(link);
        const copy = element('button', 'Copy file path'); copy.setAttribute('aria-label', 'Copy file path for ' + name); copy.onclick = () => { void copyPath(item.absolutePath); };
        card.append(element('p', `${item.bytes.toLocaleString()} bytes`), copy);
      } else card.append(element('strong', name), element('p', item.error));
      files.append(card);
    }
    const reportLink = element('a', 'View verification report'); reportLink.href = downloadUrl({ report: '1' }); reportLink.target = '_blank'; reportLink.rel = 'noopener';
    files.append(reportLink, element('p', 'This report records checks performed at build time.'));
    control<HTMLButtonElement>('verify').disabled = false;
  } catch (error) {
    if (current !== filesNumber || selected !== game.value) return;
    fingerprint = ''; listingSignature = ''; resetVerification();
    control<HTMLButtonElement>('verify').disabled = true;
    control('files').replaceChildren(element('p', 'Export files unavailable'), element('p', `${(error as Error).message} Fix the reported issue, rebuild if needed, then refresh files.`));
  }
}
control('refresh-files').onclick = () => { void refreshFiles(); };
window.addEventListener('focus', () => { void refreshFiles(false, true); });
control('verify').onclick = async () => {
  const current = ++verificationNumber; const selected = game.value; const checkedFingerprint = fingerprint;
  control<HTMLButtonElement>('verify').disabled = true; control('report').textContent = 'Checking exports…';
  try {
    const response = await fetch('/api/verify?' + new URLSearchParams({ game: selected, fingerprint: checkedFingerprint }));
    if (!response.ok) throw new Error(await response.text());
    const result = await response.json() as { fingerprint: string; status: string; message: string; checkedAt: string };
    if (current !== verificationNumber || selected !== game.value || checkedFingerprint !== fingerprint) return;
    if (result.fingerprint !== checkedFingerprint) throw new Error('Build report changed. Refresh files.');
    const status = result.status === 'passed' ? 'Local checks passed' : result.status === 'outdated' ? 'Exports outdated' : 'Verification failed';
    control('report').textContent = `${status} · Checked ${new Date(result.checkedAt).toLocaleString()}.` + (result.status === 'passed' ? '' : ` ${result.message} ${result.status === 'outdated' ? 'Rebuild exports, refresh files and verify again.' : 'Fix the reported issue, then verify again.'}`);
  } catch (error) {
    if (current === verificationNumber && selected === game.value) control('report').textContent = `Verification failed. ${(error as Error).message} Refresh files and retry after fixing the reported issue.`;
  } finally {
    if (current === verificationNumber) control<HTMLButtonElement>('verify').disabled = !fingerprint;
  }
};
const listing = await (await fetch('/api/games')).json();
for (const item of listing.games) { const option = document.createElement('option'); option.value = item.id; option.textContent = item.title; game.appendChild(option); }
if (listing.selectedGame) game.value = listing.selectedGame;
resize(); await Promise.all([reload(), refreshFiles(true)]);
