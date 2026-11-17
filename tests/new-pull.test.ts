/**
 * "Open a merge request from <branch>…" asks glab before it pushes anything, pushes to the remote the GitLab
 * repository was found on, and opens the request on that repository (#27).
 *
 * It ran `git push -u origin <branch> && glab mr create --source-branch <branch> --fill`: without glab, or with
 * glab not signed in at the host, the branch was pushed and only then did the request fail; and it always pushed
 * to origin, so a project whose GitLab repository is another remote got its branch pushed to whatever origin is.
 *
 * The line is run for real with bash, against stand-in `git` and `glab` that write down how they were called.
 */
import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

import { gitlabProvider } from '../src/index';

const api = (settings: Record<string, unknown> = {}): any => ({ name: 'gitlab', config: {}, settings: { file: 'plugin.gitlab.settings.yml', read: () => settings, set() {}, setList() {} }, lib: {} });

/** A folder of stand-ins: git and, unless left out, glab (whose `auth status` answers `authStatus`). */
function bin(withGlab: boolean, authStatus = 0) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitlab-new-pull-'));
  const log = path.join(dir, 'calls.log');
  const stub = (name: string, body = '') => fs.writeFileSync(path.join(dir, name),
    `#!/bin/bash\nprintf '%s' "${name}" >> "${log}"; for a in "$@"; do printf ' [%s]' "$a" >> "${log}"; done; printf '\\n' >> "${log}"\n${body}exit 0\n`, { mode: 0o755 });
  stub('git');
  if (withGlab) stub('glab', `[ "$1 $2" = "auth status" ] && exit ${authStatus}\n`);
  return { dir, log, calls: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : []) };
}

const repo = { path: 'project/site', web: 'https://git.drupalcode.org/project/site', remote: 'drupalcode' };
const run = (line: string, b: { dir: string }, env: Record<string, string> = {}) =>
  spawnSync('/bin/bash', ['-c', line], { encoding: 'utf8', env: { PATH: b.dir, HOME: os.tmpdir(), ...env } });

test('without glab, nothing is pushed: the line says glab is missing, where to get it and the page that opens one instead', () => {
  const b = bin(false);
  const out = run(gitlabProvider(api()).newPullCommand!(repo, 'feature-x'), b);
  assert.strictEqual(out.status, 1);
  assert.match(out.stdout, /glab is not installed, and opening a merge request from here needs it: https:\/\/gitlab\.com\/gitlab-org\/cli/);
  assert.match(out.stdout, /https:\/\/git\.drupalcode\.org\/project\/site\/-\/merge_requests\/new\?merge_request%5Bsource_branch%5D=feature-x\. Nothing was pushed\./);
  assert.deepStrictEqual(b.calls(), [], 'git was not run');
});

test('with glab not signed in at the host, nothing is pushed and the line names the login to run', () => {
  const b = bin(true, 1);
  const out = run(gitlabProvider(api()).newPullCommand!(repo, 'feature-x'), b);
  assert.strictEqual(out.status, 1);
  assert.match(out.stdout, /glab is not signed in at git\.drupalcode\.org: run glab auth login --hostname git\.drupalcode\.org, then try again\. Nothing was pushed\./);
  assert.deepStrictEqual(b.calls(), ['glab [auth] [status] [--hostname] [git.drupalcode.org]'], 'only the login was asked');
});

test('signed in, the branch goes to the remote the repository is on, quoted, and the request is opened on that repository', () => {
  const b = bin(true, 0);
  const out = run(gitlabProvider(api({ host: 'gitlab.example.invalid' })).newPullCommand!({ path: 'group/site', web: 'https://gitlab.example.invalid/group/site', remote: 'gitlab' }, 'feat;x'), b);
  assert.strictEqual(out.status, 0, out.stdout + out.stderr);
  assert.deepStrictEqual(b.calls(), [
    'glab [auth] [status] [--hostname] [gitlab.example.invalid]',
    'git [push] [-u] [gitlab] [feat;x]',
    'glab [mr] [create] [--repo] [https://gitlab.example.invalid/group/site] [--source-branch] [feat;x] [--fill]',
  ]);
});

test('a token in the environment counts as a login: the push and the request go ahead', () => {
  const b = bin(true, 1);
  const out = run(gitlabProvider(api()).newPullCommand!(repo, 'feature-x'), b, { GITLAB_TOKEN: 'x' });
  assert.strictEqual(out.status, 0, out.stdout + out.stderr);
  assert.deepStrictEqual(b.calls().map((c) => c.split(' ').slice(0, 2).join(' ')), ['git [push]', 'glab [mr]']);
});
