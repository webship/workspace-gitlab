---
description: Show where a Webship Workspace project stands on its GitLab instance — its project page, the branch it is on, the open issues and merge requests, and the pipeline of the current branch. Read-only; nothing is created or changed.
argument-hint: '<project> [issues | mrs | pipeline]'
---

# /gitlab-status

Show where this project stands on GitLab: `$ARGUMENTS`

The first word is the project (its folder name in a workspace folder). What follows, if anything,
narrows the answer: `issues`, `mrs` or `pipeline`. With nothing after the project, show all three.
With no project at all, stop and ask for one.

The workspace is container-based (DDEV by default); `glab` and `git` run on the machine, in the
project's folder. This command only reads: never run `glab issue create`, `glab mr create`,
`glab issue note`, `glab mr merge` or `git push` here, and never print a token.

## 1. Find the project and its repository

```bash
ls -d ~/workspace/*/<project>/.git
cd ~/workspace/<folder>/<project>
git remote get-url origin
git branch --show-current
glab repo view
```

If there is no `.git`, or the remote is not on a GitLab instance, stop and say so: the GITLAB menu
of the GitLab plugin (`@webship.co/workspace-gitlab`) is not on this project either. If `glab` is
missing, stop and say so. If it is not signed in on the host, go on: a public project still answers.

## 2. Issues

```bash
glab issue list --per-page 20
```

## 3. Merge requests

```bash
glab mr list --per-page 20
glab mr list --source-branch <branch>
```

## 4. The pipeline of the current branch

```bash
glab ci status --branch <branch>
```

When the branch has no pipeline, say so.

## 5. Report

In this order: the project (`<group>/<name>` and its host), the branch the project is on, then one
line per open issue and per open merge request (its number, its title), then the pipeline: its
state, and the name of each job that failed.

A list that is empty is a result: say "no open issues". For filing an issue or opening a merge
request, hand over to the agent `gitlab-issue-mr-worker`.
