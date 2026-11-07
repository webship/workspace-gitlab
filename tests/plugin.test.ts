import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { register, gitlabProvider } from '../src/index';

const PKG = fs.existsSync(path.join(__dirname, '..', 'package.json')) ? path.join(__dirname, '..') : path.join(__dirname, '..', '..');

function fakeApi(root: string, settings: Record<string, unknown> = {}) {
  const calls: any = { rowMenus: {}, chips: [], actions: {}, setups: [], css: [], forges: {} };
  const api: any = {
    name: 'gitlab', config: {}, settings: { file: 'plugin.gitlab.settings.yml', read: () => settings, set() {}, setList() {} },
    lib: {
      esc: (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)),
      ROOT: root, workspaceDir: (ws: string) => path.join(root, ws), listProjects: (dir: string) => fs.readdirSync(dir),
      screenAction: (send: any, o: any) => { calls.screen = o; send('started'); }, iconHtml: (n: string) => `<i data-icon="${n}"></i>`, NAME_RE: /^[a-zA-Z0-9_-]+$/,
      run: async (cmd: string, args: string[]) => { calls.ran = [cmd, ...args]; return { ok: true, code: 0, stdout: '[{\"iid\":12,\"title\":\"Update the recipe\",\"web_url\":\"https://git.drupalcode.org/project/webship/-/issues/12\",\"author\":{\"username\":\"me\"},\"updated_at\":\"2026-11-01T00:00:00Z\"}]', stderr: '' }; },
    },
    addRowMenu: (slot: string, spec: any, fn: any) => { calls.rowMenus[slot] = { spec, fn }; },
    addProjectChip: (fn: any) => calls.chips.push(fn), addAction: (name: string, fn: any) => { calls.actions[name] = fn; },
    addFolderSetup: (s: any) => calls.setups.push(s), addCss: (f: string) => calls.css.push(f),
    addForge: (host: string, spec: any) => { calls.forges[host] = spec; },
  };
  return { api, calls };
}

function tree(remote: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gitlab-'));
  const p = path.join(root, 'dev', 'site1');
  fs.mkdirSync(path.join(p, '.git'), { recursive: true });
  fs.writeFileSync(path.join(p, '.git', 'HEAD'), 'ref: refs/heads/feature-x\n');
  fs.writeFileSync(path.join(p, '.git', 'config'), `[remote "origin"]\n\turl = ${remote}\n`);
  return root;
}

test('the package requires nothing outside itself, and the manifest names files that ship', () => {
  for (const f of ['src/index.ts', 'src/lib/provider.ts']) {
    assert.doesNotMatch(fs.readFileSync(path.join(PKG, f), 'utf8'), /from ['"]\.\.\/\.\./, `${f} reaches outside the package`);
  }
  const m = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8')).workspacePlugin;
  assert.strictEqual(m.name, 'gitlab');
  assert.strictEqual(m.legacySettingsKey, 'git.drupal');
  for (const f of [m.settingsTemplate, m.labels, m.scripts.hostInstall, ...((m.ddev && m.ddev.compose) || []), ...(m.features || [])]) assert.ok(fs.existsSync(path.join(PKG, f)), `${f} is in the package`);
});

test('the provider: host, a remote on it reads as owner/name, the pages, the clone URL and the credential gate', () => {
  const p = gitlabProvider(fakeApi(os.tmpdir(), { host: 'git.drupalcode.org', token: 'glpat-x' }).api);
  assert.strictEqual(p.id, 'gitlab');
  assert.strictEqual(p.host(), 'git.drupalcode.org');
  const repo = p.repoOf('git@git.drupalcode.org:project/webship.git', 'origin');
  assert.ok(repo, 'the sample remote is on this forge');
  assert.strictEqual(repo.path, 'project/webship');
  assert.strictEqual(repo.web, 'https://git.drupalcode.org/project/webship');
  assert.strictEqual(p.repoOf('git@elsewhere.test:a/b.git', 'origin'), null);
  assert.strictEqual(p.cloneUrl('project/webship'), 'https://git.drupalcode.org/project/webship.git');
  assert.match(p.urls(repo).issues, /^https:\/\//);
  assert.match(p.urls(repo).newPull('feature-x'), /feature-x/);
  const env = p.env();
  assert.ok(env, 'a configured token gives an environment');
  assert.strictEqual(env.GITLAB_TOKEN, 'glpat-x'); assert.strictEqual(env.GITLAB_HOST, 'git.drupalcode.org');
  assert.strictEqual(gitlabProvider(fakeApi(os.tmpdir(), { token: 'CHANGE_ME' }).api).env(), null, 'CHANGE_ME is no credential');
});

test('register() puts the GITLAB menu on a project whose remote is here, and the credential on the host', async () => {
  const root = tree('git@git.drupalcode.org:project/webship.git');
  const { api, calls } = fakeApi(root, { host: 'git.drupalcode.org', token: 'glpat-x' });
  register(api);
  assert.deepStrictEqual(Object.keys(calls.forges), ['git.drupalcode.org']);
  assert.deepStrictEqual(calls.rowMenus.gitlab.spec, { label: 'GITLAB', row: 0 });
  const ctx: any = { key: 'dev', project: 'site1', dir: path.join(root, 'dev'), meta: {}, allowed: new Set(), vals: () => "hx-vals='{}'" };
  const html = calls.rowMenus.gitlab.fn(ctx);
  assert.match(html, /GITLAB/);
  assert.ok(html.includes('project/webship'));
  let out = '';
  await calls.actions.issues({ form: { projectName: 'site1' }, send: (h: string) => { out = h; }, workspace: 'dev' });
  assert.match(out, /#12 Update the recipe/);
});

test('a remote on another forge gets no GITLAB menu', () => {
  const root = tree('git@elsewhere.test:a/b.git');
  const { api, calls } = fakeApi(root);
  register(api);
  assert.strictEqual(calls.rowMenus.gitlab.fn({ key: 'dev', project: 'site1', dir: path.join(root, 'dev'), meta: {}, allowed: new Set(), vals: () => '' }), null);
});
