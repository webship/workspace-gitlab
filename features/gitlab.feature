Feature: The GitLab plugin on a project row
  Once the plugin is activated and installed, every project whose git remote is on GitLab carries
  the GITLAB menu, and the Plugins page lists the plugin with its four steps.

  Scenario: The plugin is listed on the Plugins page
    Given I am on "/settings/plugins"
     Then I should see "GitLab"
      And I should see "@webship.co/workspace-gitlab"

  Scenario: The AI Agents folder lists the agent the plugin ships
    Given I am on "/ai-agents"
     Then I should see "gitlab-issue-mr-worker"

  Scenario: The AI Skills folder lists the skill the plugin ships
    Given I am on "/ai-skills"
     Then I should see "gitlab-forge"

  Scenario: The AI Commands folder lists the command the plugin ships
    Given I am on "/ai-commands"
     Then I should see "gitlab-status"

  Scenario: The AI Prompts folder lists the prompt the plugin ships
    Given I am on "/ai-prompts"
     Then I should see "gitlab-issue-to-mr"
