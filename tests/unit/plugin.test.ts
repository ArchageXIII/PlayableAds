import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../../tooling/config';

const pluginRoot = path.join(ROOT, 'plugins/playableads');
const json = async (file: string) => JSON.parse(await readFile(file, 'utf8'));

async function packagedPath(root: string, relative: string): Promise<string> {
  assert.ok(relative.startsWith('./'), 'Package paths must start with ./');
  const base = await realpath(root);
  const resolved = await realpath(path.resolve(base, relative));
  const inside = path.relative(base, resolved);
  assert.ok(inside && !inside.startsWith('..') && !path.isAbsolute(inside), 'Path must stay inside package');
  return resolved;
}

test('plugin manifest and optional marketplace resolve to an installable skills package', async () => {
  const catalog = await json(path.join(ROOT, '.agents/plugins/marketplace.json'));
  const manifest = await json(path.join(pluginRoot, 'plugin.json'));
  assert.equal(catalog.name, 'playableads');
  assert.equal(catalog.plugins.length, 1);
  const entry = catalog.plugins[0];
  assert.equal(entry.name, manifest.name);
  assert.equal(entry.policy.installation, 'AVAILABLE');
  assert.equal(entry.policy.authentication, 'ON_INSTALL');
  assert.equal(typeof entry.category, 'string');
  assert.equal(entry.source.source, 'local');
  assert.equal(await packagedPath(ROOT, entry.source.path), await realpath(pluginRoot));
  assert.equal(manifest.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
  assert.match(manifest.name, /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/);
  assert.ok(manifest.name.length <= 64);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(manifest.description.length > 0);
  assert.equal(manifest.license, 'MIT');
  assert.equal(manifest.author.name, 'Magicave Holdings Limited');
  assert.equal(new URL(manifest.repository).href, 'https://github.com/ArchageXIII/PlayableAds');
  assert.ok(manifest.keywords.every((keyword: unknown) => typeof keyword === 'string'));
  const allowed = ['$schema', 'name', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords', 'extensions'];
  assert.ok(Object.keys(manifest).every(key => allowed.includes(key)), 'Unexpected portable manifest field');
  const extension = manifest.extensions['com.openai'];
  const onboarding = await packagedPath(pluginRoot, extension.onboardingSkill);
  assert.equal(onboarding, await realpath(path.join(pluginRoot, 'skills/setup/SKILL.md')));
  assert.equal(extension.interface.displayName, 'PlayableAds');
  assert.ok(extension.interface.defaultPrompt.every((prompt: unknown) => typeof prompt === 'string'));
});

test('all bundled skills have discoverable metadata and onboarding is included', async () => {
  const skills = await readdir(path.join(pluginRoot, 'skills'), { withFileTypes: true });
  assert.deepEqual(skills.map(skill => skill.name).sort(), ['author', 'setup', 'verify']);
  for (const skill of skills) {
    assert.ok(skill.isDirectory() && !skill.isSymbolicLink());
    const text = await readFile(await packagedPath(pluginRoot, `./skills/${skill.name}/SKILL.md`), 'utf8');
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
    assert.ok(frontmatter, `${skill.name}: missing YAML frontmatter`);
    // These skills deliberately use plain, single-line YAML metadata.
    const fields = Object.fromEntries(frontmatter[1].split(/\r?\n/).map(line => {
      const field = /^(name|description): (.+)$/.exec(line);
      assert.ok(field, `${skill.name}: unsupported metadata line`);
      return [field[1], field[2]];
    }));
    assert.equal(fields.name, skill.name);
    assert.ok(fields.description.length > 20 && fields.description.length <= 1024);
    assert.ok(text.slice(frontmatter[0].length).trim().length > 0);
  }
});

test('plugin distribution contains its license and only intended standalone resources', async () => {
  const files = (await readdir(pluginRoot, { recursive: true, withFileTypes: true }))
    .filter(entry => !entry.isDirectory());
  const expected = ['CHANGELOG.md', 'LICENSE', 'plugin.json', 'skills/author/SKILL.md', 'skills/setup/SKILL.md', 'skills/verify/SKILL.md'];
  const actual = files.map(entry => {
    assert.ok(entry.isFile() && !entry.isSymbolicLink(), 'Do not publish symlinks');
    return path.relative(pluginRoot, path.join(entry.parentPath, entry.name)).split(path.sep).join('/');
  }).sort();
  assert.deepEqual(actual, expected.sort(), 'Review new packaged resources before distributing them');
  const normalize = (text: string) => text.replace(/\r\n/g, '\n').trim();
  assert.equal(normalize(await readFile(path.join(pluginRoot, 'LICENSE'), 'utf8')), normalize(await readFile(path.join(ROOT, 'LICENSE'), 'utf8')));
});

test('package path validation rejects absent and escaping references', async () => {
  await assert.rejects(packagedPath(pluginRoot, './missing/SKILL.md'));
  await assert.rejects(packagedPath(pluginRoot, '../README.md'));
  await assert.rejects(packagedPath(pluginRoot, './../../README.md'));
});
