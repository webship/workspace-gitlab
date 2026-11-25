/**
 * GitLab for Webship Workspace.
 *
 * The GITLAB menu on every project whose git remote is on GitLab (the repository, open issues,
 * open merge requests, open one from the current branch, the clone URL), the repository chip,
 * "Clone a repository" when a new folder is made, and the credential the dashboard uses for the
 * host. All of it is the forge family's surface (@webship.co/workspace-forge); this package is the
 * GitLab provider plus its settings template and host install.
 *
 * Its issues are also work items (@webship.co/workspace-tracker): "Issues — get, analyze, work…" in the GITLAB menu opens
 * the list, one issue, analyze, do the work with the workspace's AI CLI on a branch, the result and, with writes on, a
 * draft merge request, a note and a worklog, each a person's click after a preview.
 */

import type { PluginApi, RowContext } from '@webship.co/workspace-plugin-api';
import { registerForge } from '@webship.co/workspace-forge';
import { registerTracker } from '@webship.co/workspace-tracker';

import { gitlabProvider } from './lib/provider';
import { gitlabTracker } from './lib/tracker';

export { gitlabProvider, gitlabTracker };

/** The AI items the installer places: agents in ai-agents/, skills in ai-skills/, commands in ai-commands/, prompts in ai-prompts/. */
export const AGENTS: string[] = ['gitlab-issue-mr-worker'];
export const SKILLS: string[] = ['gitlab-forge'];
export const AI_COMMANDS: string[] = ['gitlab-status'];
export const PROMPTS: string[] = ['gitlab-issue-to-mr'];

export function register(api: PluginApi): void {
  const forge = gitlabProvider(api);
  // The issues as work items (the tracker family): their entry goes into the GITLAB menu, so GitLab keeps one button.
  const tracker = registerTracker(api, gitlabTracker(api, forge), { menu: 'none', settingsBlock: 'tracker', typeAction: null });
  registerForge(api, { ...forge, menuItems: (ctx: RowContext) => tracker.menuItems(ctx, { header: false, whenBlocked: 'none' }) });
}
