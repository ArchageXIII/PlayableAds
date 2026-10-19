import path from 'node:path';
import { createServer } from 'vite';
import { compileGame, verifyGame, type CompileTarget } from './build';
import { listGames, loadConfig, ROOT } from './config';
import type { Platform, TargetOs } from '../src/runtime/types';
import { PREVIEW_STORE_URLS } from './constants';

export async function startPreview(port: number, selectedGame?: string) {
  const server = await createServer({
    configFile: false, root: path.join(ROOT, 'preview'), server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [ROOT] } },
    plugins: [{ name: 'adgames-preview', configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) { next(); return; }
        try {
          const url = new URL(req.url, 'http://127.0.0.1');
          res.setHeader('Cache-Control', 'no-store');
          if (url.pathname === '/api/health') {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ service: 'adgames-preview', version: 1, projectRoot: ROOT, processId: process.pid }));
            return;
          }
          if (url.pathname === '/api/games') {
            const games = await Promise.all((await listGames()).map(async id => { const config = await loadConfig(id); return { id, title: config.title }; }));
            res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ games, selectedGame })); return;
          }
          const game = url.searchParams.get('game') || '';
          if (url.pathname === '/api/export') {
            const platform = url.searchParams.get('platform') as Platform;
            if (!['unity', 'google', 'browser'].includes(platform)) throw new Error('Invalid preview target.');
            if (url.searchParams.has('storeUrl')) throw new Error('Preview store URLs are supplied only by the Unity preview profile.');
            if (platform !== 'unity' && url.searchParams.has('os')) throw new Error('Google and Browser previews are universal; omit os.');
            let target: CompileTarget;
            if (platform === 'unity') {
              const os = (url.searchParams.get('os') ?? 'android') as TargetOs;
              if (!['android', 'ios'].includes(os)) throw new Error('Invalid Unity preview OS.');
              target = { platform, os, storeUrl: PREVIEW_STORE_URLS[os] };
            } else target = { platform };
            const built = await compileGame(game, target);
            res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(built.html); return;
          }
          if (url.pathname === '/api/report') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(await verifyGame(game))); return; }
          res.statusCode = 404; res.end('Unknown preview endpoint.');
        } catch (error) { res.statusCode = 400; res.setHeader('Content-Type', 'text/plain'); res.end((error as Error).message); }
      });
    } }]
  });
  await server.listen();
  console.log('AdGames preview: http://127.0.0.1:' + port + '/');
  return server;
}
