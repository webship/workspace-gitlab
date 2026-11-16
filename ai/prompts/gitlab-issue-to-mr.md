Work one GitLab issue of a project to a merge request the Webship way, with the Checkpoints list.

```
claude --permission-mode bypassPermissions """
Work issue <number> of the GitLab project of the project <project> to a merge request
# ~/workspace/<folder>/<project> · container-based (DDEV by default) · glab and git run on the machine
# stop if glab is not signed in on the host of the remote (glab auth status --hostname <host>)
# never print a token; never tick "Reviewed by a human" or "Code review by maintainers"; never merge
# a feature to write or a run to read: the book Automated Functional Testing Recipes first (its README.md, then the matching chapter), from .claude/automated-functional-testing-recipes/ in the project, ~/.claude/automated-functional-testing-recipes/ or https://github.com/webship/webship-js-ai-agent/tree/2.0.x/automated-functional-testing-recipes

1. cd ~/workspace/<folder>/<project> ; git status --short ; git remote get-url origin
   stop if there are changes that are not yours
2. glab issue view <number> --comments
   tell me in three lines what the issue asks for and what you will change, then go on
3. git fetch origin ; git switch -c <number>-<name> origin/<base>
4. make the change, and run the tests the project has
   if ../cmd-tools-testing.sh and cucumber.js are both there, also run from the folder above:
   bash cmd-tools-testing.sh <project> --run
   and keep the totals it prints; if they are not there, say so and do not invent a test run
5. commit as the person git config names here: <type>: #<number> <what changed>
6. git push -u origin <the branch>
   if the push is refused (on git.drupalcode.org the branch belongs in the issue fork), stop and tell me
   glab mr create --source-branch <the branch> --title "<the commit subject>" --description-file <file>
   the description: Closes #<number>, what changed, how it was tested with the real numbers,
   AI-Generated: Yes, and the Checkpoints list as the last section, ticked only for what is done
7. glab ci status --branch <the branch>
   a red pipeline: glab ci get --branch <the branch> --status failed, then glab ci trace <job id>, fix, push, look again

When the pipeline is green: the address of the merge request, what was tested, and which
Checkpoints are still open. Leave the merge to me.
"""
```

The text between the triple quotes is plain: it can be given to another AI command-line assistant as it is.
