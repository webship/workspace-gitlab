/**
 * GitLab for Webship Workspace.
 *
 * The GITLAB menu on every project whose git remote is on GitLab (the repository, open issues,
 * open merge requests, open one from the current branch, the clone URL), the repository chip,
 * "Clone a repository" when a new folder is made, and the credential the dashboard uses for the
 * host. All of it is the forge family's surface (@webship.co/workspace-forge); this package is the
 * GitLab provider plus its settings template and host install.
 */

import type { PluginApi } from '@webship.co/workspace-plugin-api';
import { registerForge } from '@webship.co/workspace-forge';

import { gitlabProvider } from './lib/provider';

export { gitlabProvider };

/** The AI items the installer places: agents in ai-agents/, skills in ai-skills/, commands in ai-commands/, prompts in ai-prompts/. */
export const AGENTS: string[] = ['gitlab-issue-mr-worker'];
export const SKILLS: string[] = ['gitlab-forge'];
export const AI_COMMANDS: string[] = ['gitlab-status'];
export const PROMPTS: string[] = ['gitlab-issue-to-mr'];

export function register(api: PluginApi): void {
  registerForge(api, gitlabProvider(api));
}
