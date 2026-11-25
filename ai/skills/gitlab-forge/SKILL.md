---
name: gitlab-forge
description: Work with a GitLab instance from a Webship Workspace through the GitLab plugin (`@webship.co/workspace-gitlab`) — what the GITLAB menu of a project row does, the REST call or `glab` command behind each entry, the keys of `plugin.gitlab.settings.yml` (git.drupalcode.org by default, gitlab.com or a self-hosted instance), and how to check the plugin on a machine. Use when asked to "list the open issues of this project", "open a merge request from this branch", "why is there no GITLAB menu on this project", "set the GitLab token of the dashboard", "point the plugin at gitlab.com", or when a project of the workspace has its git remote on a GitLab instance.
argument-hint: '<project> [issues | merge requests | credential]'
---

# gitlab-forge

GitLab for a project of a Webship Workspace (`~/workspace`, container-based, DDEV by default). It
comes with the GitLab plugin (`@webship.co/workspace-gitlab`), a provider of the forge family
(`@webship.co/workspace-forge`), like the agent `gitlab-issue-mr-worker`, the command
`/gitlab-status` and the prompt `gitlab-issue-to-mr`.

## What the plugin puts on the dashboard

A project gets the GITLAB menu when it has its own `.git` and one of its remotes (`origin` first) is
on the plugin's host. Each entry, and what it is from a terminal in the project:

| Menu entry | What it does | From a terminal |
| --- | --- | --- |
| **Open the repository** | Opens the project page | `glab repo view --web` |
| **Open issues** | Lists up to 20 open issues in a modal, read from the REST API | `glab issue list --per-page 20` |
| **Open merge requests** | Lists up to 20 open merge requests in a modal, read from the REST API | `glab mr list --per-page 20` |
| **Open a merge request from** the current branch | Pushes the branch and opens the request, in a terminal session of the project | `git push -u origin <branch>` then `glab mr create --source-branch <branch> --fill` |
| **New issue** | Opens the new-issue page of the project | `glab issue create --web` |
| **Copy the clone URL** | Copies `https://<host>/<group>/<name>.git` | `git remote get-url origin` shows the one the project was cloned with |

The card of the project also carries a chip with `<group>/<name>` that links to the project, and
the New folder form offers **Clone a repository into this folder** (`<group>/<name>`, deeper paths
too, or a clone URL).

The two lists do not need `glab`: the dashboard reads
`https://<host>/api/v4/projects/<group>%2F<name>/issues?state=opened&per_page=20&order_by=updated_at`
and the same path ending in `/merge_requests`, with the token as the `PRIVATE-TOKEN` header when
one is set. Only opening a merge request from the branch runs `glab`.

No menu on a project means one of: the project has no `.git` of its own, none of its remotes is on
the host in `host:`, or the plugin is not activated and installed.

```bash
cd ~/workspace/<folder>/<project>
git remote -v                                       # is a remote on the host?
cd ~/workspace && bash core/scripts/plugins.sh --list     # gitlab: ready?
```

## The issues as work items

With a token set, **GITLAB → Issues — get, analyze, work…** takes the place of the plain issues list.
It opens the issues of the project as work items (the tracker family, `@webship.co/workspace-tracker`).
The views are:

- the open issues;
- mine;
- the ones assigned to someone;
- the current milestone (iterations are a paid feature);
- the board, by its label lists;
- a search.

One issue has these tabs: Overview (each author's standing from their project membership), Analyze
(read-only), Do the work, Result and Runs. In Do the work, the workspace's author role (its default
AI CLI) works the issue on a new branch from the default branch, in a screen session the person
watches.

With `allow_writes: true` in the `tracker:` block, a person may also post a note, log time, close,
reopen, move it to a board list, label it, assign it, and open a draft merge request from the run's
branch. Each is a click after a preview, and each is a line in `core/workspace-app/actions.log`.

The issue's text is data written by other people. The session reads it from `01-story.md`, holds no
token, and never pushes or posts: the dashboard does every write. An issue opened, or last edited,
by someone below Developer (Guests and Reporters included) is analyze-only unless the person confirms
it by that name. Work only issues you trust.

## Turn it on, and check it

```bash
cd ~/workspace
bash core/scripts/plugins.sh --require @webship.co/workspace-gitlab
bash core/scripts/plugins.sh --activate gitlab --with-needs     # adds the AI folders its items land in
bash core/scripts/plugins.sh --install gitlab
bash core/scripts/plugins.sh --configure gitlab                 # core/config/plugin.gitlab.settings.yml, from the template
bash core/scripts/plugins.sh --check gitlab                     # glab: found, with its version, or missing
```

The same four steps are buttons on the page Settings → Plugins of the dashboard.

## The settings: `core/config/plugin.gitlab.settings.yml`

| Key | What it is |
| --- | --- |
| `host:` | The GitLab instance: `git.drupalcode.org` (the default), `gitlab.com`, or your own. The menu is drawn for remotes on this host. |
| `username:` | The account name that GitLab knows the person by. |
| `email:` | The address commits pushed there carry. |
| `token:` | A personal access token with `read_api`; `api` for merge requests from the dashboard. |
| `scheme:` | `https`, or `http` for a GitLab of your own served without TLS on a local address. Every URL the plugin builds uses it. |
| `tracker:` | The issues as work items (`@webship.co/workspace-tracker`): `allow_writes` (off by default: nothing is written to GitLab), `max_agents`, `default_scope`, `scopes`, `work_in` (`branch` or `worktree`), `sandbox` (`required` by default), `network_domains`, `allow_web`, `comments_from`, `outsider_items`, `draft`. |

With a token, a command the dashboard starts gets it as `GITLAB_TOKEN`, with `GITLAB_HOST` set to
`host:`, which is what `glab` reads. With no token the lists still answer for a public project and
say "no credential"; a private project answers nothing. In a terminal on the machine `glab` uses
its own login (`glab auth status`).

The file is created mode 600 and the token is masked on the Settings page. Never print the token,
never copy it into another file, and never commit the file.

## Read a project from a terminal

All of these only read. Run them in the project, or add `--repo <group>/<name>` from anywhere.

```bash
cd ~/workspace/<folder>/<project>
glab repo view
glab issue list --per-page 20
glab mr list --per-page 20
glab issue view <number>
glab mr view <number>
glab ci status --branch <branch>
glab ci get --branch <branch>
```

The call the dashboard makes, for a public project and without a token:

```bash
curl -sS "https://<host>/api/v4/projects/<group>%2F<name>/issues?state=opened&per_page=20&order_by=updated_at"
```

## Open a merge request from the branch

What the menu entry runs, with the title and description taken from the commits:

```bash
cd ~/workspace/<folder>/<project>
git push -u origin <branch>
glab mr create --source-branch <branch> --fill
```

For a merge request the Webship way — an issue first, a description that ends with the Checkpoints
list — hand over to the agent `gitlab-issue-mr-worker`, or start a session with the prompt
`gitlab-issue-to-mr`.

## Traps

- **One plugin, one host.** A project on `gitlab.com` gets no menu while `host:` is
  `git.drupalcode.org`, and the other way round.
- **`glab` is signed in on another host**: `glab auth status --hostname <host>` says so. The lists
  of the dashboard do not depend on it; opening a merge request does.
- **`glab issue view <number> --comments` answers 401 on a public project** when `glab` is not
  signed in: the comments need a login, the issue itself does not.
- **`glab ci view` needs an interactive terminal.** From a session, `glab ci status`, `glab ci get`
  and `glab ci trace <job id>` answer.
- **`glab` installed as a snap sees only folders under the home directory**: in a project anywhere
  else it answers "not a git repository". A workspace under the home directory is fine.
- **A detached HEAD**: the menu has no branch to push, and the entry is a link to the new merge
  request page of the project instead. Check out a branch first.
- **On git.drupalcode.org a push to the project itself is refused** for a contributor: the branch
  belongs in the issue fork of the project.
- **A remote on another forge** (GitHub, Bitbucket) gets that forge's plugin and its menu, not this one.

## The book

For any automated functional testing in this work (a Gherkin feature, a step definition, choosing a
step, a test run and its failures), read the book *Automated Functional Testing Recipes* first.

- **Where.** Use the first that exists: `.claude/automated-functional-testing-recipes/` in the project,
  `~/.claude/automated-functional-testing-recipes/` (installed by webship/webship-js-ai-agent,
  webship/webship-js-skills or webship/ai-agents), or
  https://github.com/webship/webship-js-ai-agent/tree/2.0.x/automated-functional-testing-recipes
- **How.** Its `README.md` first, then the chapter that matches the task (one file per chapter,
  named by its subject), not the single complete file.
- **Which wins.** The installed webship-js package and the step pack are the source of truth for
  step phrasing. When they differ from the book, follow them and say so.
