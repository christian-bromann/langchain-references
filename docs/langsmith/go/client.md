# Client

The LangSmith Go client provides the main entry point for interacting with the LangSmith API. It handles authentication, request configuration, and provides access to all service endpoints.

## Creating a Client

::: langsmith.NewClient
  options:
    show_if_no_docstring: true

## Client Options

Configure the client using functional options from the `option` package:

::: langsmith/option.WithAPIKey
  options:
    show_if_no_docstring: true

::: langsmith/option.WithBearerToken
  options:
    show_if_no_docstring: true

::: langsmith/option.WithBaseURL
  options:
    show_if_no_docstring: true

::: langsmith/option.WithTenantID
  options:
    show_if_no_docstring: true

::: langsmith/option.WithOrganizationID
  options:
    show_if_no_docstring: true

::: langsmith/option.WithHeader
  options:
    show_if_no_docstring: true

::: langsmith/option.WithMaxRetries
  options:
    show_if_no_docstring: true

::: langsmith/option.WithRequestTimeout
  options:
    show_if_no_docstring: true

::: langsmith/option.WithMiddleware
  options:
    show_if_no_docstring: true

::: langsmith/option.WithHTTPClient
  options:
    show_if_no_docstring: true
