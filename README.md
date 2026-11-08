# @webship.co/workspace-gitlab

GitLab for the [Webship Workspace](https://github.com/webship/workspace) dashboard: the **GITLAB**
menu on every project whose git remote is on GitLab (open the repository, the open issues and
merge requests, open one from the current branch, copy the clone URL), the repository chip on the
card, "Clone a repository" when a new folder is made, and the credential the dashboard uses for the
host. A provider of [`@webship.co/workspace-forge`](https://github.com/webship/workspace-forge).

The lists come from the GitLab REST API (`/api/v4/projects/<path>/issues`, `/merge_requests`) with the token as `PRIVATE-TOKEN`, so they work with or without `glab`; a merge request from the current branch is `glab mr create --fill` in a terminal in the project (glab reads `GITLAB_HOST` and `GITLAB_TOKEN`). The host is a setting: git.drupalcode.org by default, which is where the Webship projects live, and the old `git.drupal` block of settings.yml is carried into the plugin's file on install.

## Use it

```bash
cd ~/workspace
bash core/scripts/plugins.sh --require github:webship/workspace-gitlab
bash core/scripts/plugins.sh --activate gitlab
bash core/scripts/plugins.sh --install gitlab      # carries the git.drupal block of settings.yml into plugin.gitlab.settings.yml
bash core/scripts/plugins.sh --configure gitlab
```

The same four steps are buttons on the dashboard's **Settings → Plugins** page.

## What the package holds

| Path | What it is |
| --- | --- |
| `src/index.ts` | `register(api)`: `registerForge(api, gitlabProvider(api))` |
| `src/lib/provider.ts` | The GitLab provider: the host, the credential, how a remote reads, the pages, the issue and request lists, the clone URL |
| `config/plugin.gitlab.settings.yml` | The settings template |
| `scripts/host-install.sh` | The host side: the CLI and the credential check |

The `workspacePlugin` block in `package.json` is the manifest the installer reads.
