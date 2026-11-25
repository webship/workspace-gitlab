import test, { after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { register } from '../src/index';
import { gitlabProvider } from '../src/lib/provider';
import { accessAssociation, currentMilestone, gitlabTracker, itemOf } from '../src/lib/tracker';

// Recorded from a GitLab CE 19.6.1 run for the proof, with its address and mail domain made anonymous.
const PKG = fs.existsSync(path.join(__dirname, '..', 'package.json')) ? path.join(__dirname, '..') : path.join(__dirname, '..', '..');
const FIX = path.join(PKG, 'tests', 'fixtures', 'tracker');
const fixture = (f: string) => fs.readFileSync(path.join(FIX, f), 'utf8');
const made: string[] = [];
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

const TOKEN = 'glpat-' + 'a1B2c3D4'.repeat(3);
const SETTINGS = { host: 'gitlab.test', token: TOKEN };

function tree(remote = 'https://gitlab.test/proof/tracker-proof.git') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gitlab-tracker-'));
  made.push(root);
  const p = path.join(root, 'dev', 'site1');
  fs.mkdirSync(path.join(p, '.git'), { recursive: true });
  fs.writeFileSync(path.join(p, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  fs.writeFileSync(path.join(p, '.git', 'config'), `[remote "origin"]\n\turl = ${remote}\n`);
  return root;
}

/** What a curl call asked: its method, the URL, the headers file's lines and the body file's JSON. Read while they exist. */
function readCurl(args: string[]) {
  const at = (flag: string) => args.indexOf(flag);
  const headerFile = args.find((a) => a.startsWith('@') && a.endsWith('/headers'));
  const bodyFile = args.find((a) => a.startsWith('@') && a.endsWith('/body.json'));
  return {
    method: args[at('-X') + 1],
    url: args[args.length - 1],
    headers: headerFile ? fs.readFileSync(headerFile.slice(1), 'utf8') : '',
    body: bodyFile ? JSON.parse(fs.readFileSync(bodyFile.slice(1), 'utf8')) : undefined,
  };
}

/** The api, with a `run` that answers curl from the recorded fixtures (and `answers` first), remembering each call. */
function fakeApi(root: string, settings: Record<string, unknown> = SETTINGS, answers: (c: ReturnType<typeof readCurl>, cmd: string, args: string[]) => any = () => null) {
  const calls: any = { rowMenus: {}, actions: {}, fragments: [], ran: [] as any[] };
  const ok = (body: unknown, status = 200) => ({ ok: true, code: 0, stdout: `${typeof body === 'string' ? body : JSON.stringify(body)}\n${status}`, stderr: '' });
  const api: any = {
    name: 'gitlab', config: {}, settings: { file: 'plugin.gitlab.settings.yml', read: () => settings, set() {}, setList() {} },
    lib: {
      esc: (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)),
      ROOT: root, workspaceDir: (ws: string) => path.join(root, ws), listProjects: (dir: string) => fs.readdirSync(dir), isValidWorkspace: () => true,
      screenAction: () => {}, iconHtml: () => '', NAME_RE: /^[a-zA-Z0-9_-]+$/, screensCached: () => [], listScreens: async () => [],
      cliError: (t: string) => String(t).trim().split('\n').slice(-3).join(' '),
      run: async (cmd: string, args: string[], cwd: string, opts: any = {}) => {
        if (cmd !== 'curl') { calls.ran.push({ cmd, args, env: opts.env || {} }); return { ok: true, code: 0, stdout: '', stderr: '' }; }
        const c = readCurl(args);
        calls.ran.push({ cmd, args, env: opts.env || {}, ...c });
        const a = answers(c, cmd, args);
        if (a) return a;
        const u = c.url.replace('https://gitlab.test', '');
        if (u === '/api/graphql') return ok(fixture(c.body && c.body.variables && c.body.variables.i === '2' ? 'graphql-workitem-2.json' : 'graphql-workitem-1.json'));
        if (/\/issues\?/.test(u)) return ok(fixture('issues.json'));
        if (/\/issues\/\d+\/notes$/.test(u) && c.method === 'POST') return ok({ id: 77 }, 201);
        if (/\/issues\/1\/notes/.test(u)) return ok(fixture('notes-1.json'));
        if (/\/issues\/1$/.test(u)) return ok(fixture('issue-1.json'));
        if (/\/milestones\?/.test(u)) return ok(fixture('milestones.json'));
        if (/\/boards$/.test(u)) return ok(fixture('boards.json'));
        if (/\/members\/all\/1$/.test(u)) return ok(fixture('member-root.json'));
        if (/\/members\/all\/2$/.test(u)) return ok(fixture('member-member1.json'));
        if (/\/members\/all\/3$/.test(u)) return ok(fixture('member-reporter1.json'));
        if (/\/members\/all\/\d+$/.test(u)) return ok({ message: '404 Not found' }, 404);
        if (/\/merge_requests$/.test(u)) return ok({ iid: 5, web_url: 'https://gitlab.test/proof/tracker-proof/-/merge_requests/5' }, 201);
        return ok({}, 200);
      },
    },
    addRowMenu: (slot: string, spec: any, fn: any) => { calls.rowMenus[slot] = { spec, fn }; },
    addProjectChip() {}, addAction: (name: string, fn: any) => { calls.actions[name] = fn; }, addFolderSetup() {}, addCss() {}, addForge() {},
    addFragment: (fn: any) => calls.fragments.push(fn), addProjectBadge() {}, addAssistantContext() {}, addSettingsOptions() {},
  };
  return { api, calls };
}

const SCOPE = { id: 'proof/tracker-proof', name: 'proof/tracker-proof', web: 'https://gitlab.test/proof/tracker-proof' };

test('membership: Developer and above are inside; Guests, Reporters and non-members are not', () => {
  assert.strictEqual(accessAssociation(50), 'owner');
  assert.strictEqual(accessAssociation(40), 'member');
  assert.strictEqual(accessAssociation(30), 'member');
  assert.strictEqual(accessAssociation(20), 'contributor');
  assert.strictEqual(accessAssociation(10), 'contributor');
  assert.strictEqual(accessAssociation(undefined), 'outside');
});

test('the issues read as items, with their milestone and their board column; the current milestone is the next due', () => {
  const list = JSON.parse(fixture('issues.json'));
  const items = list.map((i: any) => itemOf(i, ['Doing', 'Review']));
  assert.deepStrictEqual(items.map((i: any) => [i.id, i.state]), [['2', 'open'], ['4', 'open'], ['1', 'open']]);
  assert.strictEqual(items.find((i: any) => i.id === '1').iteration, 'milestone Proof round 1');
  assert.strictEqual(itemOf({ ...list[0], labels: ['proof', 'Doing'] }, ['Doing', 'Review']).column, 'Doing');
  assert.strictEqual(currentMilestone(JSON.parse(fixture('milestones.json')), new Date('2026-11-24T00:00:00Z')), 'Proof round 1');
});

test('the token goes in a header file, never on curl\'s command line; the views ask what they mean', async () => {
  const root = tree();
  const { api, calls } = fakeApi(root);
  const t = gitlabTracker(api, gitlabProvider(api));
  await t.list(SCOPE, { view: 'open', limit: 30 });
  const first = calls.ran[0];
  assert.match(first.url, /^https:\/\/gitlab\.test\/api\/v4\/projects\/proof%2Ftracker-proof\/issues\?state=opened&per_page=30&order_by=updated_at$/);
  assert.strictEqual(first.headers, `PRIVATE-TOKEN: ${TOKEN}\n`);
  for (const c of calls.ran) assert.ok(!c.args.join(' ').includes(TOKEN), 'no token on a command line');
  await t.list(SCOPE, { view: 'mine', limit: 5 });
  assert.match(calls.ran[calls.ran.length - 1].url, /scope=assigned_to_me/);
  const ms = await t.list(SCOPE, { view: 'iteration', limit: 5 });
  assert.match(calls.ran[calls.ran.length - 1].url, /milestone=Proof\+round\+1/);
  assert.ok(ms.length);
  await t.list(SCOPE, { view: 'query', text: 'greeting $(id)', limit: 5 });
  assert.match(calls.ran[calls.ran.length - 1].url, /search=greeting\+%24%28id%29/);
  const board = await t.list(SCOPE, { view: 'board', limit: 5 });
  assert.ok(Array.isArray(board));
});

test('one issue: its notes and the standing of each author from their membership; the description\'s last editor', async () => {
  const root = tree();
  const { api } = fakeApi(root);
  const t = gitlabTracker(api, gitlabProvider(api));
  const one = await t.get(SCOPE, '1');
  assert.deepStrictEqual(one.author, { name: 'root', association: 'owner' });
  assert.deepStrictEqual(one.comments.map((c) => [c.author.name, c.author.association]), [['member1', 'member'], ['stranger1', 'outside']]);
  assert.strictEqual(one.lastEditor, undefined);
  // #2 was opened by root and its description last edited by reporter1 (a Reporter): an outsider's edit.
  const { api: a2 } = fakeApi(root, SETTINGS, (c) => (/\/issues\/2$/.test(c.url) ? { ok: true, code: 0, stdout: `${fixture('issue-1.json').replace('"iid": 1', '"iid": 2')}\n200`, stderr: '' }
    : /\/issues\/2\/notes/.test(c.url) ? { ok: true, code: 0, stdout: '[]\n200', stderr: '' } : null));
  const two = await gitlabTracker(a2, gitlabProvider(a2)).get(SCOPE, '2');
  assert.deepStrictEqual(two.lastEditor, { name: 'reporter1', association: 'contributor' });
});

test('writes: a note, a worklog with its summary, a move to a board list, and a draft merge request pushed with askpass', async () => {
  const root = tree();
  const { api, calls } = fakeApi(root);
  const t = gitlabTracker(api, gitlabProvider(api));
  const note = await t.comment!(SCOPE, '1', 'Done on a branch `$(id)`');
  assert.deepStrictEqual([note.ok, note.url], [true, 'https://gitlab.test/proof/tracker-proof/-/issues/1#note_77']);
  const posted = calls.ran.find((c: any) => c.method === 'POST' && /\/notes$/.test(c.url));
  assert.deepStrictEqual(posted.body, { body: 'Done on a branch `$(id)`' });
  assert.ok(!posted.args.join(' ').includes('$(id)'), 'the body is in a file');
  await t.worklog!(SCOPE, '1', { minutes: 25, text: 'Fixed the typo' });
  assert.deepStrictEqual(calls.ran.find((c: any) => /add_spent_time/.test(c.url)).body, { duration: '25m', summary: 'Fixed the typo' });
  const moved = await t.transition!(SCOPE, '1', 'list:Doing');
  assert.ok(moved.ok);
  assert.deepStrictEqual(calls.ran.filter((c: any) => c.method === 'PUT').pop().body, { add_labels: 'Doing', remove_labels: 'Review' });
  assert.strictEqual((await t.transition!(SCOPE, '1', 'list:Nope')).ok, false);
  const dir = path.join(root, 'dev', 'site1');
  const mr = await t.openRequest!(SCOPE, { dir, remote: '', branch: '1-fix', base: 'main', title: 'Fix it', body: 'Closes #1', draft: true });
  assert.deepStrictEqual([mr.ok, mr.url], [true, 'https://gitlab.test/proof/tracker-proof/-/merge_requests/5']);
  const push = calls.ran.find((c: any) => c.cmd === 'git');
  assert.ok(push.args.includes('core.hooksPath=/dev/null'));
  assert.deepStrictEqual(push.args.slice(-3), ['push', 'https://gitlab.test/proof/tracker-proof.git', 'refs/heads/1-fix:refs/heads/1-fix']);
  assert.strictEqual(push.env.WS_GITLAB_TOKEN, TOKEN, 'the token is in the environment of git only');
  assert.match(push.env.GIT_ASKPASS, /askpass\.sh$/);
  assert.ok(!push.args.join(' ').includes(TOKEN));
  assert.deepStrictEqual(calls.ran.find((c: any) => /merge_requests$/.test(c.url)).body, { source_branch: '1-fix', target_branch: 'main', title: 'Draft: Fix it', description: 'Closes #1', remove_source_branch: false });
  const elsewhere = await t.openRequest!({ ...SCOPE, id: 'proof/other' }, { dir, remote: '', branch: '1-fix', base: 'main', title: 'x', body: 'y', draft: true });
  assert.strictEqual(elsewhere.ok, false);
});

test('http for a local instance: every URL the plugin builds follows the scheme setting', async () => {
  const root = tree('http://127.0.0.1:8929/proof/tracker-proof.git');
  const { api, calls } = fakeApi(root, { host: '127.0.0.1:8929', scheme: 'http', token: TOKEN });
  const forge = gitlabProvider(api);
  const repo = forge.repoOf('http://127.0.0.1:8929/proof/tracker-proof.git', 'origin');
  assert.deepStrictEqual(repo, { path: 'proof/tracker-proof', web: 'http://127.0.0.1:8929/proof/tracker-proof', remote: 'origin' });
  const t = gitlabTracker(api, forge);
  assert.deepStrictEqual(t.parseScope('proof/tracker-proof'), { id: 'proof/tracker-proof', name: 'proof/tracker-proof', web: 'http://127.0.0.1:8929/proof/tracker-proof' });
  await t.list(t.parseScope('proof/tracker-proof')!, { view: 'open', limit: 1 });
  assert.match(calls.ran[0].url, /^http:\/\/127\.0\.0\.1:8929\/api\/v4\//);
});

test('register(): one GITLAB button; with a token its menu opens the issues as work items, without one it keeps the plain list', () => {
  const root = tree();
  const ctx: any = { key: 'dev', project: 'site1', dir: path.join(root, 'dev'), meta: {}, allowed: new Set(), vals: () => '' };
  const { api, calls } = fakeApi(root);
  register(api);
  assert.deepStrictEqual(Object.keys(calls.rowMenus), ['gitlab'], 'no second button');
  for (const a of ['tracker-work', 'tracker-request', 'tracker-worklog', 'issues', 'pulls']) assert.ok(calls.actions[a], a);
  assert.match(calls.rowMenus.gitlab.fn(ctx), /Issues — get, analyze, work…/);
  const { api: a2, calls: c2 } = fakeApi(root, { host: 'gitlab.test' });
  register(a2);
  const plain = c2.rowMenus.gitlab.fn(ctx);
  assert.match(plain, /Open issues<\/a>/);
  assert.ok(!/Issues — get, analyze, work/.test(plain));
});

test('the default branch is asked of the API; the fetch goes with the token through askpass, into the remote of the scope', async () => {
  const root = tree();
  const { api, calls } = fakeApi(root, SETTINGS, (c) => (/\/projects\/proof%2Ftracker-proof$/.test(c.url) ? { ok: true, code: 0, stdout: '{"default_branch":"main"}\n200', stderr: '' } : null));
  const t = gitlabTracker(api, gitlabProvider(api));
  assert.strictEqual(await t.defaultBranch!(SCOPE), 'main');
  const f = await t.fetchBranch!(SCOPE, path.join(root, 'dev', 'site1'), 'main');
  assert.deepStrictEqual(f, { ok: true, error: '', ref: 'origin/main' });
  const fetch = calls.ran.find((c: any) => c.cmd === 'git');
  assert.deepStrictEqual(fetch.args.slice(-4), ['fetch', '--quiet', 'https://gitlab.test/proof/tracker-proof.git', '+refs/heads/main:refs/remotes/origin/main']);
  assert.strictEqual(fetch.env.WS_GITLAB_TOKEN, TOKEN);
  assert.ok(!fetch.args.join(' ').includes(TOKEN));
});
