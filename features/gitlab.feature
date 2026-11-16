Feature: The GitLab plugin on a project row
  Once the plugin is activated and installed, every project whose git remote is on GitLab carries
  the GITLAB menu, and the Plugins page lists the plugin with its four steps.

  # The Plugins page names each plugin; the package is on the plugin's own page (the row shows it on hover only).
  Scenario: The plugin is listed on the Plugins page, and its own page names its package
    Given I am on "/settings/plugins"
     Then I should see "GitLab"
     When I go to "/settings/plugin/gitlab"
     Then I should see "@webship.co/workspace-gitlab"

  # The AI folders are searched by name: with every plugin on, a folder lists more than one page of items.
  Scenario: The AI Agents folder lists the agent the plugin ships
    Given I am on "/ai-agents?q=gitlab-issue-mr-worker"
     Then I should see "gitlab-issue-mr-worker"

  Scenario: The AI Skills folder lists the skill the plugin ships
    Given I am on "/ai-skills?q=gitlab-forge"
     Then I should see "gitlab-forge"

  Scenario: The AI Commands folder lists the command the plugin ships
    Given I am on "/ai-commands?q=gitlab-status"
     Then I should see "gitlab-status"

  Scenario: The AI Prompts folder lists the prompt the plugin ships
    Given I am on "/ai-prompts?q=gitlab-issue-to-mr"
     Then I should see "gitlab-issue-to-mr"
