import { parseArgs } from 'node:util';
import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildGame, verifyGame, type BuildMode, type BuildPlatform } from './build';
import { ROOT, listGames, releaseUrls, validId } from './config';
import { startPreview } from './preview-server';
import { platformCheckEvidence } from './platform-check';
import type { TargetOs } from '../src/runtime/types';

const command = process.argv[2];
const { values } = parseArgs({ args: process.argv.slice(3), options: {
  game: { type: 'string' }, all: { type: 'boolean' }, mode: { type: 'string' }, os: { type: 'string' }, config: { type: 'string' },
  id: { type: 'string' }, template: { type: 'string', default: 'tap' }, port: { type: 'string', default: '5173' }, platform: { type: 'string' }, result: { type: 'string' }, notes: { type: 'string' }, tester: { type: 'string' }
} });

async function main(): Promise<void> {
  if (command === 'dev') {
    const port = Number(values.port);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid preview port.');
    if (values.game) validId(values.game);
    await startPreview(port, values.game); return;
  }
  if (command === 'create') {
    if (!values.id) throw new Error('Use --id your-game --template tap|drag.');
    validId(values.id);
    const sourceId = values.template === 'tap' ? 'tap-to-collect' : values.template === 'drag' ? 'drag-to-sort' : '';
    if (!sourceId) throw new Error('Templates: tap or drag.');
    const destination = path.join(ROOT, 'games', values.id);
    try { await access(destination); throw new Error('Game already exists: ' + values.id); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await mkdir(destination);
    // Copy only authoring files, never release configuration or generated output.
    const source = path.join(ROOT, 'games', sourceId);
    await cp(path.join(source, 'assets'), path.join(destination, 'assets'), { recursive: true });
    await cp(path.join(source, 'game.ts'), path.join(destination, 'game.ts'));
    const config = JSON.parse(await readFile(path.join(source, 'game.config.json'), 'utf8'));
    config.id = values.id; config.title = values.id.split('-').map((word: string) => word[0].toUpperCase() + word.slice(1)).join(' ');
    await writeFile(path.join(destination, 'game.config.json'), JSON.stringify(config, null, 2) + '\n');
    await cp(path.join(ROOT, 'docs', 'game-brief.template.md'), path.join(destination, 'brief.md'));
    console.log('Created games/' + values.id + '. Fill in brief.md, then edit game.ts and game.config.json.'); return;
  }
  if (command === 'build' || command === 'verify') {
    if (values.all && values.game) throw new Error('Use --all or --game, not both.');
    const games = values.all ? await listGames() : values.game ? [values.game] : [];
    if (!games.length) throw new Error('Specify --game <id> or --all.');
    if (command === 'verify' && [values.platform, values.os, values.mode, values.config].some(value => value !== undefined)) throw new Error('verify checks the entire latest build report; --platform, --os, --mode and --config are build-only flags.');
    const mode = (values.mode || 'release') as BuildMode;
    if (!['preview', 'release'].includes(mode)) throw new Error('Mode must be preview or release.');
    const platform = (values.platform ?? 'all') as BuildPlatform;
    if (!['all', 'unity', 'google'].includes(platform)) throw new Error('Select --platform google, unity or all.');
    if (platform === 'google' && values.os !== undefined) throw new Error('Google exports are universal; omit --os. Configure the app OS in Google Ads.');
    const urls = command === 'build' && mode === 'release' && platform !== 'google' ? await releaseUrls(values.config) : {};
    const systems = platform === 'google' ? [] : values.os !== undefined ? values.os.split(',') : mode === 'release' && command === 'build' ? Object.keys(urls) : ['android', 'ios'];
    if (platform !== 'google' && (!systems.length || systems.some(os => !['android', 'ios'].includes(os)) || new Set(systems).size !== systems.length)) throw new Error('Select --os android,ios or one configured Unity OS.');
    for (const game of games) {
      const report = command === 'build' ? await buildGame(game, mode, systems as TargetOs[], urls, platform) : await verifyGame(game);
      console.log(game + ': ' + report.artifacts.length + ' verified ' + report.mode + ' artifacts; platform acceptance pending.');
      for (const artifact of report.artifacts) console.log('  ' + artifact.path + ' (' + artifact.bytes.toLocaleString('en-GB') + ' bytes)');
    }
    return;
  }
  if (command === 'platform-check') {
    if (!values.game || !values.platform || !values.os || !values.result || !values.notes || !values.tester) throw new Error('Specify --game, --platform unity|google, --os android|ios, --result pass|fail, --tester, and --notes.');
    if (!['unity', 'google'].includes(values.platform) || !['android', 'ios'].includes(values.os) || !['pass', 'fail'].includes(values.result)) throw new Error('Invalid platform-check target or result.');
    const report = await verifyGame(values.game);
    const evidence = platformCheckEvidence(report, values.platform as 'unity' | 'google', values.os as TargetOs, values.tester, values.result as 'pass' | 'fail', values.notes);
    const destination = path.join(ROOT, 'platform-checks', values.game + '.json');
    let records: unknown[] = [];
    try { records = JSON.parse(await readFile(destination, 'utf8')); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    records.push(evidence);
    await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, JSON.stringify(records, null, 2) + '\n');
    console.log('Recorded manual result against SHA-256 ' + evidence.sha256 + '. No platform upload was performed.'); return;
  }
  throw new Error('Commands: dev, create, build, verify, platform-check. See README.md.');
}
main().catch(error => { console.error((error as Error).message); process.exitCode = 1; });
