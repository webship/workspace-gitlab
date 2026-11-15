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
bash core/scripts/plugins.sh --activate gitlab --with-needs
bash core/scripts/plugins.sh --install gitlab      # carries the git.drupal block of settings.yml into plugin.gitlab.settings.yml
bash core/scripts/plugins.sh --configure gitlab
```

The same four steps are buttons on the dashboard's **Settings → Plugins** page.

## The items it carries

The workspace is container-based (DDEV by default). Each item lands in the folder of its kind, when
that folder is an active workspace folder, is listed there like any other item, and is installed
into Claude Code from there:

| What | Lands in | What it is for |
| --- | --- | --- |
| The agent `gitlab-issue-mr-worker` | `ai-agents/` | Works an issue to a merge request the Webship way: the issue template, a branch, the merge request with the Checkpoints list last, the pipeline |
| The skill `gitlab-forge` | `ai-skills/` | What each entry of the GITLAB menu does, the REST call or `glab` command behind it, the keys of `plugin.gitlab.settings.yml` |
| The command `/gitlab-status` | `ai-commands/` | `/gitlab-status <project>`: the project, the branch, the open issues and merge requests, the pipeline. Read-only |
| The prompt `gitlab-issue-to-mr` | `ai-prompts/` | The launch command of a session that works one issue to a merge request |

The plugin places no `cmd-*.sh`: in a project's folder `glab issue list`, `glab mr list` and `glab mr create --source-branch <branch> --fill` are the terminal commands, and a wrapper would add nothing to them. A project that carries a webship-js suite is tested by the workspace's own `cmd-tools-testing.sh <project> --run`, which the agent and the prompt use when it is there.

How the items are laid out and checked: [docs/plugin-items-pattern.md](docs/plugin-items-pattern.md).

## What it needs

On the machine this plugin needs `glab` (https://gitlab.com/gitlab-org/cli#installation), and its manifest says so (`needs.commands`). The workspace reports it and never installs it:

```bash
bash core/scripts/plugins.sh --check gitlab      # found, with its version, or missing, with how to install it
webship-workspace doctor                        # the same for the core and every plugin
```

It also needs the AI folders its items are placed in (`needs`): `ai-agents`, `ai-skills`, `ai-commands` and `ai-prompts`. `--require` says so, `--activate` and `--install` stop until the workspace has them, and `--with-needs` adds what is missing first. A kind whose folder is not an active workspace folder is skipped, and the install says so. It needs no sites folder: its menu is on the project rows of whatever folders the workspace has.

## What the package holds

| Path | What it is |
| --- | --- |
| `src/index.ts` | `register(api)`: `registerForge(api, gitlabProvider(api))` |
| `src/lib/provider.ts` | The GitLab provider: the host, the credential, how a remote reads, the pages, the issue and request lists, the clone URL |
| `config/plugin.gitlab.settings.yml` | The settings template |
| `scripts/host-install.sh` | The host side: the CLI and the credential check |
| `ai/agents/gitlab-issue-mr-worker.md` | The agent `gitlab-issue-mr-worker` |
| `ai/skills/gitlab-forge/` | The skill `gitlab-forge` |
| `ai/commands/gitlab-status.md` | The command `/gitlab-status` |
| `ai/prompts/gitlab-issue-to-mr.md` | The prompt `gitlab-issue-to-mr` |
| `tests/items.test.ts` | The shape of every item, and that it names nothing the plugin does not have |

The `workspacePlugin` block in `package.json` is the manifest the installer reads.
