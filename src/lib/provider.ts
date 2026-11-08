/**
 * GitLab, as a forge provider: git.drupalcode.org by default, gitlab.com or a self-hosted instance
 * by setting. The REST API does the lists with the token from plugin.gitlab.settings.yml; glab
 * opens merge requests when it is there.
 */

import type { PluginApi, PluginLib } from '@webship.co/workspace-plugin-api';
import { repoPathAt } from '@webship.co/workspace-forge';
import type { ForgeItem, ForgeProvider, ForgeRepo } from '@webship.co/workspace-forge';

const configured = (v: unknown) => { const s = String(v == null ? '' : v).trim(); return s && s !== 'CHANGE_ME' ? s : null; };

export function gitlabProvider(api: PluginApi): ForgeProvider {
  const settings = () => api.settings.read() || {};
  const host = () => String(configured(settings().host) || 'git.drupalcode.org').toLowerCase();

  const env = (): NodeJS.ProcessEnv | null => {
    const t = configured(settings().token);
    return t ? { ...process.env, GITLAB_TOKEN: t, GITLAB_HOST: host() } : null;
  };

  async function rest(lib: PluginLib, e: NodeJS.ProcessEnv, url: string): Promise<any[]> {
    const headers = e.GITLAB_TOKEN ? ['-H', `PRIVATE-TOKEN: ${e.GITLAB_TOKEN}`] : [];
    const out = await lib.run('curl', ['-sS', '-m', '30', ...headers, url], process.env.HOME, { timeoutMs: 40 * 1000, env: process.env });
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
    newPullCommand: (_repo, branch) => `git push -u origin ${branch} && glab mr create --source-branch ${branch} --fill`,
    clone: { pattern: /^[\w.-]+(\/[\w.-]+)+$|^(https?:\/\/|git@)[\w.-]+[:/][\w./-]+$/, placeholder: 'project/webship', help: 'A GitLab repository is group/name (or deeper), or its clone URL.' },
    tokenHint: 'token in core/config/plugin.gitlab.settings.yml',
  };
}
