/**
 * GitLab, as a forge provider: git.drupalcode.org by default, gitlab.com or a self-hosted instance
 * by setting. The REST API does the lists with the token from plugin.gitlab.settings.yml; glab
 * opens merge requests when it is there.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import type { PluginApi, PluginLib } from '@webship.co/workspace-plugin-api';
import { repoPathAt } from '@webship.co/workspace-forge';
import type { ForgeItem, ForgeProvider, ForgeRepo } from '@webship.co/workspace-forge';

const configured = (v: unknown) => { const s = String(v == null ? '' : v).trim(); return s && s !== 'CHANGE_ME' ? s : null; };
/** One word for a shell: single-quoted. A remote or a branch name may hold `;` or `$`. */
const shq = (v: unknown) => `'${String(v).replace(/'/g, `'\\''`)}'`;

/**
 * Run `fn` with curl arguments that read these header lines from a file only this user can read, removed
 * after. On curl's command line a token is readable by every account of the machine for as long as curl
 * runs (`ps`, /proc/<pid>/cmdline); `-H @file` (curl 7.55+) keeps it off.
 */
export async function withHeaderFile<T>(headers: string[], fn: (args: string[]) => Promise<T>): Promise<T> {
  if (!headers.length) return fn([]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-curl-'));
  const file = path.join(dir, 'headers');
  fs.writeFileSync(file, `${headers.join('\n')}\n`, { mode: 0o600 });
  try { return await fn(['-H', `@${file}`]); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}


export function gitlabProvider(api: PluginApi): ForgeProvider {
  const settings = () => api.settings.read() || {};
  const host = () => String(configured(settings().host) || 'git.drupalcode.org').toLowerCase();

  const env = (): NodeJS.ProcessEnv | null => {
    const t = configured(settings().token);
    return t ? { ...process.env, GITLAB_TOKEN: t, GITLAB_HOST: host() } : null;
  };

  async function rest(lib: PluginLib, e: NodeJS.ProcessEnv, url: string): Promise<any[]> {
    // The token in a header file, never on curl's command line (withHeaderFile).
    const secret = e.GITLAB_TOKEN ? [`PRIVATE-TOKEN: ${e.GITLAB_TOKEN}`] : [];
    const out = await withHeaderFile(secret, (auth) => lib.run('curl', ['-sS', '-m', '30', ...auth, url], process.env.HOME, { timeoutMs: 40 * 1000, env: process.env }));
    if (!out.ok) throw new Error(lib.cliError(String(out.stderr || out.stdout)));
    const data = JSON.parse(String(out.stdout));
    if (data && data.message && !Array.isArray(data)) throw new Error(String(data.message));
    return data;
  }

  async function list(kind: 'issues' | 'merge_requests', repo: ForgeRepo, lib: PluginLib, e: NodeJS.ProcessEnv): Promise<ForgeItem[]> {
    const data = await rest(lib, e, `https://${host()}/api/v4/projects/${encodeURIComponent(repo.path)}/${kind}?state=opened&per_page=20&order_by=updated_at`);
    return data.map((i) => ({ number: i.iid, title: i.title, url: i.web_url, author: i.author && i.author.username, updated: i.updated_at }));
  }

  return {
    id: 'gitlab',
    label: 'GITLAB',
    title: 'GitLab',
    host,
    cli: 'glab',
    pullsLabel: 'Merge requests',
    env,
    auth: () => { const s = settings(); return { username: configured(s.username) || undefined, email: configured(s.email) || undefined, how: configured(s.token) ? 'token' : 'none' }; },
    repoOf: (url, remote) => { const p = repoPathAt(host(), url); return p ? { path: p, web: `https://${host()}/${p}`, remote } : null; },
    cloneUrl: (spec) => (/^(https?:\/\/|git@)/.test(spec) ? spec : `https://${host()}/${spec.replace(/\.git$/, '')}.git`),
    urls: (repo) => ({ issues: `${repo.web}/-/issues`, pulls: `${repo.web}/-/merge_requests`, newIssue: `${repo.web}/-/issues/new`, newPull: (branch) => `${repo.web}/-/merge_requests/new?merge_request%5Bsource_branch%5D=${encodeURIComponent(branch)}` }),
    listIssues: (repo, lib, e) => list('issues', repo, lib, e),
    listPulls: (repo, lib, e) => list('merge_requests', repo, lib, e),
    // glab is asked first: without it, or without a login it can use at this host, nothing is pushed and the line says
    // which step is missing. Then the branch goes to the remote the repository was found on (not always origin), and
    // the merge request is opened on that repository, not on whichever one glab would read from the folder.
    newPullCommand: (repo, branch) => [
      `command -v glab >/dev/null 2>&1 || { echo ${shq(`glab is not installed, and opening a merge request from here needs it: https://gitlab.com/gitlab-org/cli (then glab auth login --hostname ${host()}). Or open one on ${repo.web}/-/merge_requests/new?merge_request%5Bsource_branch%5D=${encodeURIComponent(branch)}. Nothing was pushed.`)}; exit 1; }`,
      `{ [ -n "\${GITLAB_TOKEN:-}" ] || glab auth status --hostname ${shq(host())} >/dev/null 2>&1; } || { echo ${shq(`glab is not signed in at ${host()}: run glab auth login --hostname ${host()}, then try again. Nothing was pushed.`)}; exit 1; }`,
      `git push -u ${shq(repo.remote)} ${shq(branch)} && glab mr create --repo ${shq(repo.web)} --source-branch ${shq(branch)} --fill`,
    ].join('; '),
    clone: { pattern: /^[\w.-]+(\/[\w.-]+)+$|^(https?:\/\/|git@)[\w.-]+[:/][\w./-]+$/, placeholder: 'project/webship', help: 'A GitLab repository is group/name (or deeper), or its clone URL.' },
    tokenHint: 'token in core/config/plugin.gitlab.settings.yml',
  };
}
