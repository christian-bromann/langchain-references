# Repos (Prompts)

Repos provide version-controlled storage for prompts. Use them to manage, version, and deploy prompts across your LLM applications.

## Repo Service

::: langsmith.RepoService
  options:
    show_if_no_docstring: true
    members:
      - New
      - Get
      - Update
      - List
      - Delete

## Types

::: langsmith.Repo
  options:
    show_if_no_docstring: true

::: langsmith.RepoNewParams
  options:
    show_if_no_docstring: true

::: langsmith.RepoListParams
  options:
    show_if_no_docstring: true

::: langsmith.RepoUpdateParams
  options:
    show_if_no_docstring: true

## Commits

Each repo contains commits representing different versions of your prompt.

::: langsmith.CommitService
  options:
    show_if_no_docstring: true
    members:
      - New
      - Get
      - List

::: langsmith.Commit
  options:
    show_if_no_docstring: true

::: langsmith.CommitNewParams
  options:
    show_if_no_docstring: true

::: langsmith.CommitListParams
  options:
    show_if_no_docstring: true
