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
function log(message: string): void {
  const entry = document.createElement('li'); entry.textContent = message;
  control('events').prepend(entry);
  while (control('events').children.length > 12) control('events').lastElementChild!.remove();
}
function message(type: string, value?: unknown): void { frame.contentWindow?.postMessage({ channel: token, type, value }, '*'); }
function fitPreview(): void {
  const w = Number(width.value); const h = Number(height.value);
  const available = document.querySelector('.viewport-scroll')!.clientWidth - 16;
  const scale = window.innerWidth <= 720 ? Math.min(1, Math.max(0.2, available / w)) : 1;
  control('device').style.transformOrigin = 'top left'; control('device').style.transform = `scale(${scale})`;
  control('device-wrap').style.width = w * scale + 'px'; control('device-wrap').style.height = h * scale + 'px';
}
function resize(): void {
  const w = Math.max(240, Math.min(1280, Number(width.value) || 360));
  const h = Math.max(240, Math.min(1280, Number(height.value) || 640));
  width.value = String(w); height.value = String(h);
  control('device').style.width = w + 'px'; control('device').style.height = h + 'px';
  fitPreview();
  control('dimensions').textContent = w + ' × ' + h;
  log('Viewport ' + w + ' × ' + h);
}
function stubScript(): string {
  // Injected by the preview shell only, before the unmodified game script.
  return `<script>(function(){var token=${JSON.stringify(token)},mode=${JSON.stringify(host.value)},ready=${ready.checked},visible=${visible.checked},events={};function send(type,value){parent.postMessage({channel:token,type:type,value:value},'*')}function emit(name,value){(events[name]||[]).slice().forEach(function(fn){fn(value)})}if(mode==='unity'||mode==='google'){window.mraid={getState:function(){return ready?'default':'loading'},isViewable:function(){return visible},addEventListener:function(name,fn){(events[name]||(events[name]=[])).push(fn)},removeEventListener:function(name,fn){events[name]=(events[name]||[]).filter(function(item){return item!==fn})},open:function(url){send('exit',url)}}}window.ExitApi={exit:function(){send('exit','Google campaign final URL')}};window.addEventListener('adgames-preview-exit',function(){send('exit','Browser preview')});window.addEventListener('message',function(event){if(event.source!==parent||!event.data||event.data.channel!==token)return;if(event.data.type==='ready'&&!ready){ready=true;emit('ready')}if(event.data.type==='visible'){visible=event.data.value;emit('viewableChange',visible)}});setInterval(function(){var root=document.getElementById('ad-root');if(root)send('signals',{state:root.getAttribute('data-state'),audio:root.getAttribute('data-audio'),orientation:root.getAttribute('data-orientation'),progress:(document.querySelector('.progress')||{}).textContent})},200)})();</script>`;
}
async function reload(): Promise<void> {
  const current = ++reloadNumber;
  token = crypto.randomUUID(); exits = 0; control('exit-count').textContent = '0';
  const response = await fetch('/api/export?' + new URLSearchParams({ game: game.value, platform: host.value, os: os.value }));
  if (current !== reloadNumber) return;
  if (!response.ok) { log(await response.text()); return; }
  let html = await response.text();
  html = html.replace(`<script src="${EXIT_API}"></script>`, '');
  html = html.replace('<head>', '<head>' + stubScript());
  frame.srcdoc = html;
  control('preview-title').textContent = game.selectedOptions[0]?.textContent || game.value;
  ready.disabled = host.value === 'browser'; visible.disabled = host.value === 'browser';
  log('Loaded ' + game.value + ' / ' + host.value);
}
window.addEventListener('message', event => {
  if (event.source !== frame.contentWindow || event.data?.channel !== token) return;
  if (event.data.type === 'exit') { exits++; control('exit-count').textContent = String(exits); log('Install intercepted: ' + (event.data.value || 'Unconfigured preview destination')); }
  if (event.data.type === 'signals') for (const key of ['state', 'audio', 'orientation', 'progress']) control(key).textContent = event.data.value[key] || '—';
});
game.onchange = host.onchange = os.onchange = () => { void reload(); };
control('reload').onclick = () => { void reload(); };
ready.onchange = () => { if (!ready.checked) { void reload(); } else message('ready'); };
visible.onchange = () => message('visible', visible.checked);
control<HTMLInputElement>('overlay').onchange = () => { control('container-close').hidden = !control<HTMLInputElement>('overlay').checked; };
control('resize').onclick = resize;
window.addEventListener('resize', fitPreview);
for (const [id, w, h] of [['portrait', 360, 640], ['landscape', 640, 360], ['small', 320, 480]] as const) {
  control(id).onclick = () => { width.value = String(w); height.value = String(h); resize(); document.querySelectorAll('.size-tabs button').forEach(button => button.classList.toggle('selected', button.id === id)); };
}
control('verify').onclick = async () => {
  const response = await fetch('/api/report?game=' + encodeURIComponent(game.value));
  if (!response.ok) { control('report').textContent = await response.text(); return; }
  const report = await response.json();
  control('report').textContent = report.artifacts.map((item: { platform: string; os: string; bytes: number }) => `${item.platform} / ${item.os}: ${item.bytes.toLocaleString()} bytes`).join(' · ') + `. ${report.mode.toUpperCase()} builds. Platform acceptance pending.`;
};
const listing = await (await fetch('/api/games')).json();
for (const item of listing.games) { const option = document.createElement('option'); option.value = item.id; option.textContent = item.title; game.appendChild(option); }
if (listing.selectedGame) game.value = listing.selectedGame;
resize(); await reload();
