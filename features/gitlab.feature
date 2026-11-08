Feature: The GitLab plugin on a project row
  Once the plugin is activated and installed, every project whose git remote is on GitLab carries
  the GITLAB menu, and the Plugins page lists the plugin with its four steps.

  Scenario: A project cloned from GitLab offers the GITLAB menu
    Given I am on "/dev"
     Then the element ".act-menu-gitlab" should be displayed
      And I should see "GITLAB"

  Scenario: The plugin is listed on the Plugins page
    Given I am on "/settings/plugins"
     Then I should see "GitLab"
      And I should see "@webship.co/workspace-gitlab"
