/**
 * GitLab for Webship Workspace.
 *
 * The GITLAB menu on every project whose git remote is on GitLab (the repository, open issues,
 * open merge requests, open one from the current branch, the clone URL), the repository chip,
 * "Clone a repository" when a new folder is made, and the credential the dashboard uses for the
 * host. All of it is the forge family's surface (@webship/workspace-forge); this package is the
 * GitLab provider plus its settings template and host install.
 */

import type { PluginApi } from '@webship/workspace-plugin-api';
import { registerForge } from '@webship/workspace-forge';

import { gitlabProvider } from './lib/provider';

export { gitlabProvider };

export function register(api: PluginApi): void {
  registerForge(api, gitlabProvider(api));
}
