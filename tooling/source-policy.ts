import { readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { ROOT, validId } from './config';

const forbiddenGlobals = new Set(['window', 'document', 'navigator', 'location', 'globalThis', 'self', 'parent', 'top', 'frames', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker', 'SharedWorker', 'localStorage', 'sessionStorage', 'indexedDB', 'caches', 'Image', 'Audio', 'AudioContext', 'webkitAudioContext', 'mraid', 'ExitApi', 'eval', 'Function', 'setTimeout', 'setInterval', 'requestAnimationFrame']);
export function auditSource(code: string, filename: string, gameRoot: string): void {
  const source = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true);
  function walk(node: ts.Node): void {
    if (ts.isIdentifier(node) && forbiddenGlobals.has(node.text)) throw new Error('Game source must use runtime services instead of ' + node.text + ': ' + filename);
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier = node.moduleSpecifier;
      if (specifier && ts.isStringLiteral(specifier)) {
        const target = path.resolve(path.dirname(filename), specifier.text);
        const relative = path.relative(gameRoot, target);
        const local = !relative.startsWith('..') && !path.isAbsolute(relative) && specifier.text.startsWith('.');
        const shared = ['types', 'math'].some(name => target === path.join(ROOT, 'src', 'runtime', name) || target === path.join(ROOT, 'src', 'runtime', name + '.ts'));
        if (!local && !shared) throw new Error('Games may only import local modules and runtime types/math: ' + specifier.text);
      }
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) throw new Error('Dynamic imports are not supported.');
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') throw new Error('CommonJS dependencies are not supported in games.');
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'getContext' && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text !== '2d') throw new Error('Only Canvas 2D is supported.');
    ts.forEachChild(node, walk);
  }
  walk(source);
}
export async function auditGame(id: string): Promise<void> {
  validId(id);
  const gameRoot = path.join(ROOT, 'games', id);
  const canonicalRoot = await realpath(gameRoot);
  async function visit(folder: string): Promise<void> {
    for (const item of await readdir(folder, { withFileTypes: true })) {
      const file = path.join(folder, item.name);
      if (item.isSymbolicLink()) throw new Error('Symlinks are not supported in game sources.');
      if (item.isDirectory()) await visit(file);
      else if (/\.[cm]?[jt]sx?$/.test(item.name)) auditSource(await readFile(file, 'utf8'), file, canonicalRoot);
    }
  }
  await visit(gameRoot);
}
