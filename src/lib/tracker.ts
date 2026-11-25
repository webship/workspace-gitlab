/**
 * GitLab, as a provider of the tracker family (@webship.co/workspace-tracker): the issues (work items) of the
 * project a remote names, over the REST API v4 with the token of plugin.gitlab.settings.yml, and GraphQL where
 * REST has no answer (who last edited a description).
 *
 * Reads: the open issues, mine, assigned to someone, the current milestone (iterations are a paid feature), the
 * board (its label lists), a search, and one issue with its notes. Each author's standing is their project
 * membership: Developer and above are inside; Guests and Reporters, who can open issues, count as outside, so the
 * base keeps their issues analyze-only unless a person confirms by name.
 *
 * Writes, which the base offers only with writes on, each after a person's click: a note, a worklog (time
 * tracking), close and reopen, a move to a board list, labels, an assignee, a new issue, and a draft merge request
 * from the run's branch, which the dashboard pushes itself. Epics are not in the Community Edition: none is offered.
 *
 * The token goes in a header file (curl) or in the environment of one git process (askpass); never on a command
 * line, never in what is shown.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import type { PluginApi } from '@webship.co/workspace-plugin-api';
import { gitRemotes, repoOnForge } from '@webship.co/workspace-forge';
import type { ForgeProvider } from '@webship.co/workspace-forge';
import { GIT_SAFE } from '@webship.co/workspace-tracker';
import type { Person, RequestSpec, TrackerItem, TrackerItemFull, TrackerProvider, TrackerScope, WriteResult } from '@webship.co/workspace-tracker';

const PATH_RE = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)+$/;
const configured = (v: unknown) => { const s = String(v == null ? '' : v).trim(); return s && s !== 'CHANGE_ME' ? s : ''; };

/** A project membership's access level as the base reads it: Developer (30) and above are inside. */
export function accessAssociation(level: unknown): Person['association'] {
  const n = Number(level);
  if (n >= 50) return 'owner';
  if (n >= 30) return 'member';
  if (n >= 10) return 'contributor';
  return 'outside';
}

/** One issue of the REST API, as the base reads an item. `lists` are the board's list labels, for its column. */
export function itemOf(i: any, lists: string[] = []): TrackerItem {
  const state = String(i.state || '') === 'opened' ? 'open' : String(i.state || '');
  const labels: string[] = (i.labels || []).map((l: any) => String(typeof l === 'string' ? l : (l && l.name) || '')).filter(Boolean);
  return {
    id: String(i.iid),
    title: String(i.title || ''),
    url: String(i.web_url || ''),
    state,
    stateClass: state === 'open' ? (lists.some((l) => labels.includes(l)) ? 'doing' : 'open') : 'done',
    type: i.issue_type && i.issue_type !== 'issue' ? String(i.issue_type) : undefined,
    assignees: (i.assignees || []).map((a: any) => String(a.username || '')).filter(Boolean),
    labels,
    iteration: i.milestone && i.milestone.title ? `milestone ${i.milestone.title}` : undefined,
    column: lists.find((l) => labels.includes(l)),
    updated: i.updated_at || undefined,
  };
}

/** The active milestone a "current milestone" view means: the next one due, else the first active one. */
export function currentMilestone(list: any[], now = new Date()): string {
  const open = (list || []).filter((m) => m && m.title);
  const due = open.filter((m) => m.due_date && Date.parse(m.due_date) >= now.getTime() - 24 * 3600 * 1000)
    .sort((a, b) => Date.parse(a.due_date) - Date.parse(b.due_date));
  return String((due[0] || open[0] || {}).title || '');
}

function tempDir(): { dir: string; done: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-gitlab-'));
  return { dir, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

export function gitlabTracker(api: PluginApi, forge: ForgeProvider): TrackerProvider {
  const lib = api.lib;
  const settings = () => api.settings.read() || {};
  const host = () => forge.host();
  const scheme = () => (String(settings().scheme || '').trim().toLowerCase() === 'http' ? 'http' : 'https');
  const origin = () => `${scheme()}://${host()}`;
  const token = () => configured(settings().token);
  const pid = (s: TrackerScope) => encodeURIComponent(s.id);

  /** One call of the REST API: the token and the body in files only this user reads, removed after. */
  async function call(method: string, p: string, body?: unknown): Promise<{ status: number; data: any; text: string }> {
    const t = tempDir();
    try {
      const args = ['-sS', '-m', '30', '-X', method, '-w', '\n%{http_code}', '-H', 'Accept: application/json'];
      const secret = token();
      if (secret) {
        const h = path.join(t.dir, 'headers');
        fs.writeFileSync(h, `PRIVATE-TOKEN: ${secret}\n`, { mode: 0o600 });
        args.push('-H', `@${h}`);
      }
      if (body !== undefined) {
        const b = path.join(t.dir, 'body.json');
        fs.writeFileSync(b, JSON.stringify(body), { mode: 0o600 });
        args.push('-H', 'Content-Type: application/json', '--data-binary', `@${b}`);
      }
      args.push(`${origin()}${p}`);
      const r = await lib.run('curl', args, process.env.HOME || '/', { timeoutMs: 40 * 1000, env: process.env });
      const out = String(r.stdout || '');
      const at = out.lastIndexOf('\n');
      const status = Number(out.slice(at + 1)) || 0;
      const text = at >= 0 ? out.slice(0, at) : out;
      if (!r.ok && !status) throw new Error(lib.cliError(String(r.stderr || 'curl did not answer')));
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }
      return { status, data, text };
    } finally { t.done(); }
  }
  const why = (r: { status: number; data: any; text: string }) => {
    const m = r.data && (r.data.message || r.data.error);
    return `GitLab answered ${r.status}: ${typeof m === 'string' ? m : JSON.stringify(m || r.text).slice(0, 200)}`;
  };
  async function get(p: string): Promise<any> {
    const r = await call('GET', `/api/v4${p}`);
    if (r.status < 200 || r.status >= 300) throw new Error(why(r));
    return r.data;
  }
  async function write(method: string, p: string, body: unknown, url = ''): Promise<WriteResult & { data?: any }> {
    try {
      const r = await call(method, `/api/v4${p}`, body);
      if (r.status < 200 || r.status >= 300) return { ok: false, error: why(r) };
      return { ok: true, error: '', url: url || (r.data && r.data.web_url) || '', data: r.data };
    } catch (e) { return { ok: false, error: String((e as Error).message || e) }; }
  }

  // Membership, asked once per user and project for a few minutes.
  const members = new Map<string, { at: number; a: Person['association'] }>();
  async function standing(scope: TrackerScope, userId: unknown): Promise<Person['association']> {
    const id = Number(userId);
    if (!id) return 'unknown';
    const k = `${scope.id}#${id}`;
    const hit = members.get(k);
    if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.a;
    let a: Person['association'] = 'outside';
    try {
      const r = await call('GET', `/api/v4/projects/${pid(scope)}/members/all/${id}`);
      a = r.status === 200 ? accessAssociation(r.data && r.data.access_level) : r.status === 404 ? 'outside' : 'unknown';
    } catch (_) { a = 'unknown'; }
    members.set(k, { at: Date.now(), a });
    return a;
  }

  async function boardLists(scope: TrackerScope): Promise<string[]> {
    try {
      const boards = await get(`/projects/${pid(scope)}/boards`);
      const first = (boards || [])[0];
      return first ? (first.lists || []).map((l: any) => String((l.label && l.label.name) || '')).filter(Boolean) : [];
    } catch (_) { return []; }
  }

  /** The remote of a project folder whose URL is the scope's project on this host, or ''. */
  const remoteOf = (dir: string, scope: TrackerScope) => {
    const remotes = gitRemotes(dir);
    return Object.keys(remotes).find((n) => { const repo = forge.repoOf(remotes[n], n); return repo && repo.path === scope.id; }) || '';
  };
  /** git with hooks off and the token through an askpass that reads it from git's own environment. */
  async function gitWithToken(dir: string, args: string[], timeoutMs = 120 * 1000) {
    const t = tempDir();
    try {
      const askpass = path.join(t.dir, 'askpass.sh');
      fs.writeFileSync(askpass, '#!/bin/sh\ncase "$1" in Username*) echo oauth2 ;; *) printf \'%s\\n\' "$WS_GITLAB_TOKEN" ;; esac\n', { mode: 0o700 });
      return await lib.run('git', [...GIT_SAFE, '-c', 'credential.helper=', '-C', dir, ...args], dir,
        { timeoutMs, env: { ...process.env, GIT_ASKPASS: askpass, GIT_TERMINAL_PROMPT: '0', WS_GITLAB_TOKEN: token() } });
    } finally { t.done(); }
  }
  const defaults = new Map<string, { at: number; branch: string }>();

  let who: { at: number; login: string; id: number } = { at: 0, login: '', id: 0 };
  async function me(): Promise<{ login: string; id: number }> {
    if (who.login && Date.now() - who.at < 10 * 60 * 1000) return who;
    const u = await get('/user');
    who = { at: Date.now(), login: String(u.username || ''), id: Number(u.id) || 0 };
    return who;
  }

  return {
    id: api.name,
    title: 'GitLab',
    label: 'GITLAB',
    noun: { one: 'issue', many: 'issues' },
    capabilities: {
      views: ['open', 'mine', 'assigned', 'iteration', 'board', 'query'],
      iterationWord: 'milestone',
      comment: true, worklog: true, transition: true, labels: true, assign: true, create: true,
      request: 'open', requestNoun: 'merge request',
    },
    idPattern: /^[1-9][0-9]{0,8}$/,
    cli: 'glab',
    tokenVariables: ['GITLAB_TOKEN', 'GITLAB_PRIVATE_TOKEN', 'GLAB_TOKEN', 'CI_JOB_TOKEN'],
    secret: () => token(),
    ready: () => (token() ? '' : `no token in ${api.settings.file}: set one with read_api (api for writes)`),
    scopeOf: (ref) => {
      const repo = repoOnForge(forge, ref.dir);
      return repo ? { id: repo.path, name: repo.path, web: repo.web } : null;
    },
    parseScope: (text) => {
      const t = String(text || '').trim().replace(/\.git$/, '');
      return PATH_RE.test(t) ? { id: t, name: t, web: `${origin()}/${t}` } : null;
    },
    urlOf: (s, id) => `${s.web}/-/issues/${encodeURIComponent(id)}`,
    account: async () => { try { return (await me()).login; } catch (_) { return ''; } },

    defaultBranch: async (scope) => {
      const hit = defaults.get(scope.id);
      if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.branch;
      const branch = String((await get(`/projects/${pid(scope)}`)).default_branch || '');
      if (!/^[A-Za-z0-9._/-]+$/.test(branch)) throw new Error(`no default branch for ${scope.id}`);
      defaults.set(scope.id, { at: Date.now(), branch });
      return branch;
    },
    fetchBranch: async (scope, dir, branch) => {
      const remote = remoteOf(dir, scope);
      if (!remote) return { ok: false, error: `No remote of ${dir} is ${scope.id} on ${host()}.`, ref: '' };
      const f = await gitWithToken(dir, ['fetch', '--quiet', `${origin()}/${scope.id}.git`, `+refs/heads/${branch}:refs/remotes/${remote}/${branch}`]);
      return f.ok ? { ok: true, error: '', ref: `${remote}/${branch}` } : { ok: false, error: lib.cliError(String(f.stderr || f.stdout || '')), ref: '' };
    },

    list: async (scope, q) => {
      const params = new URLSearchParams({ state: 'opened', per_page: String(Math.max(1, Math.min(q.limit, 100))), order_by: 'updated_at' });
      if (q.view === 'mine') params.set('scope', 'assigned_to_me');
      if (q.view === 'assigned') { if (!q.who) return []; params.set('assignee_username', q.who); }
      if (q.view === 'iteration') {
        const title = currentMilestone(await get(`/projects/${pid(scope)}/milestones?state=active&per_page=50`));
        if (!title) return [];
        params.set('milestone', title);
      }
      if (q.view === 'query') params.set('search', String(q.text || ''));
      const lists = q.view === 'board' ? await boardLists(scope) : [];
      const items = ((await get(`/projects/${pid(scope)}/issues?${params.toString()}`)) as any[]).map((i) => itemOf(i, lists));
      // The board: every open issue, those in a list first, in the order of the lists.
      return q.view === 'board' ? items.sort((a, b) => (lists.indexOf(a.column || '') + 1 || 99) - (lists.indexOf(b.column || '') + 1 || 99)) : items;
    },

    get: async (scope, id) => {
      const [i, notes, lists] = await Promise.all([
        get(`/projects/${pid(scope)}/issues/${id}`),
        get(`/projects/${pid(scope)}/issues/${id}/notes?sort=asc&order_by=created_at&per_page=100`),
        boardLists(scope),
      ]);
      const author: Person = { name: String((i.author && i.author.username) || 'unknown'), association: await standing(scope, i.author && i.author.id) };
      // Who last edited the description: the description widget of the work item, GraphQL only.
      let lastEditor: Person | undefined;
      try {
        const r = await call('POST', '/api/graphql', { query: 'query($p:ID!,$i:String!){project(fullPath:$p){workItems(iid:$i){nodes{widgets{type ... on WorkItemWidgetDescription{lastEditedAt lastEditedBy{id username}}}}}}}', variables: { p: scope.id, i: String(id) } });
        const node = r.data && r.data.data && r.data.data.project && r.data.data.project.workItems && (r.data.data.project.workItems.nodes || [])[0];
        const widget = node && (node.widgets || []).find((w: any) => w && w.type === 'DESCRIPTION');
        const by = widget && widget.lastEditedAt && widget.lastEditedBy;
        if (by && by.username && by.username !== author.name) {
          lastEditor = { name: String(by.username), association: await standing(scope, String(by.id || '').split('/').pop()) };
        }
      } catch (_) { /* unknown: no editor to say */ }
      const comments = [];
      for (const n of (notes || []).filter((x: any) => !x.system)) {
        comments.push({ author: { name: String((n.author && n.author.username) || 'unknown'), association: await standing(scope, n.author && n.author.id) }, body: String(n.body || ''), at: String(n.created_at || '') });
      }
      const full: TrackerItemFull = { ...itemOf(i, lists), body: String(i.description || ''), author, ...(lastEditor ? { lastEditor } : {}), comments };
      return full;
    },

    comment: async (scope, id, markdown) => {
      const r = await write('POST', `/projects/${pid(scope)}/issues/${id}/notes`, { body: markdown });
      return r.ok ? { ok: true, error: '', url: `${scope.web}/-/issues/${id}#note_${r.data && r.data.id}`, id: String(r.data && r.data.id) } : r;
    },
    worklog: async (scope, id, entry) => write('POST', `/projects/${pid(scope)}/issues/${id}/add_spent_time`, { duration: `${entry.minutes}m`, summary: entry.text }, `${scope.web}/-/issues/${id}`),
    transitions: async (scope, id) => {
      const [i, lists] = await Promise.all([get(`/projects/${pid(scope)}/issues/${id}`), boardLists(scope)]);
      if (String(i.state) !== 'opened') return [{ id: 'reopen', name: 'Reopen' }];
      const labels: string[] = i.labels || [];
      return [...lists.filter((l) => !labels.includes(l)).map((l) => ({ id: `list:${l}`, name: `Move to ${l}` })), { id: 'close', name: 'Close' }];
    },
    transition: async (scope, id, to) => {
      const url = `${scope.web}/-/issues/${id}`;
      if (to === 'close' || to === 'reopen') return write('PUT', `/projects/${pid(scope)}/issues/${id}`, { state_event: to }, url);
      if (to.startsWith('list:')) {
        const lists = await boardLists(scope);
        const want = to.slice(5);
        if (!lists.includes(want)) return { ok: false, error: `${want} is not a list of the board` };
        return write('PUT', `/projects/${pid(scope)}/issues/${id}`, { add_labels: want, remove_labels: lists.filter((l) => l !== want).join(',') }, url);
      }
      return { ok: false, error: `not a move: ${to}` };
    },
    labels: async (scope, id, add, remove) => write('PUT', `/projects/${pid(scope)}/issues/${id}`, { ...(add.length ? { add_labels: add.join(',') } : {}), ...(remove.length ? { remove_labels: remove.join(',') } : {}) }, `${scope.web}/-/issues/${id}`),
    assign: async (scope, id, whom) => {
      let uid = 0;
      try {
        if (whom === 'me') uid = (await me()).id;
        else { const users = await get(`/users?username=${encodeURIComponent(whom)}`); uid = Number((users || [])[0] && users[0].id) || 0; }
      } catch (e) { return { ok: false, error: String((e as Error).message || e) }; }
      if (!uid) return { ok: false, error: `no user ${whom} on ${host()}` };
      return write('PUT', `/projects/${pid(scope)}/issues/${id}`, { assignee_ids: [uid] }, `${scope.web}/-/issues/${id}`);
    },
    create: async (scope, item) => {
      const r = await write('POST', `/projects/${pid(scope)}/issues`, { title: item.title, description: item.body });
      return r.ok ? { ok: true, error: '', url: r.url, id: String(r.data && r.data.iid) } : r;
    },

    /**
     * Push the run's branch to the scope's own project (over the instance's URL, the token through askpass, hooks off)
     * and open a draft merge request from it. The remote must be the scope's project.
     */
    openRequest: async (scope, r: RequestSpec) => {
      if (!remoteOf(r.dir, scope)) return { ok: false, error: `No remote of ${r.dir} is ${scope.id} on ${host()}: nothing was pushed.` };
      if (!token()) return { ok: false, error: `no token in ${api.settings.file}: nothing was pushed.` };
      const push = await gitWithToken(r.dir, ['push', `${origin()}/${scope.id}.git`, `refs/heads/${r.branch}:refs/heads/${r.branch}`]);
      if (!push.ok) return { ok: false, error: `git push did not go: ${lib.cliError(String(push.stderr || push.stdout || ''))}` };
      const mr = await write('POST', `/projects/${pid(scope)}/merge_requests`, {
        source_branch: r.branch, target_branch: r.base, title: r.draft ? `Draft: ${r.title}` : r.title, description: r.body, remove_source_branch: false,
      });
      return mr.ok ? { ok: true, error: '', url: mr.url, id: String(mr.data && mr.data.iid) } : mr;
    },
  };
}
