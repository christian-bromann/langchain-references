# Repos (Prompts)

Repos provide version-controlled storage for prompts. Use them to manage, version, and deploy prompts across your LLM applications.

## Repo Service

::: com.langchain.smith.services.blocking.RepoService
  options:
    show_if_no_docstring: true

::: com.langchain.smith.services.async.RepoServiceAsync
  options:
    show_if_no_docstring: true

## Types

::: com.langchain.smith.models.repos.Repo
  options:
    show_if_no_docstring: true

::: com.langchain.smith.models.repos.RepoCreateParams
  options:
    show_if_no_docstring: true

::: com.langchain.smith.models.repos.RepoListParams
  options:
    show_if_no_docstring: true

::: com.langchain.smith.models.repos.RepoUpdateParams
  options:
    show_if_no_docstring: true

## Commits

Each repo contains commits representing different versions of your prompt.

::: com.langchain.smith.services.blocking.CommitService
  options:
    show_if_no_docstring: true

::: com.langchain.smith.services.async.CommitServiceAsync
  options:
    show_if_no_docstring: true

::: com.langchain.smith.models.commits.Commit
  options:
    show_if_no_docstring: true

::: com.langchain.smith.models.commits.CommitCreateParams
  options:
    show_if_no_docstring: true

::: com.langchain.smith.models.commits.CommitListParams
  options:
    show_if_no_docstring: true
