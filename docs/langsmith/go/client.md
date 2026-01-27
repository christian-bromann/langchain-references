# Client

The LangSmith Go client provides the main entry point for interacting with the LangSmith API. It handles authentication, request configuration, and provides access to all service endpoints.

## Client Options

Configure the client using functional options from the `option` package.

::: langsmith.NewClient
::: langsmith.option.WithAPIKey
::: langsmith.option.WithBearerToken
::: langsmith.option.WithBaseURL
::: langsmith.option.WithTenantID
::: langsmith.option.WithOrganizationID
::: langsmith.option.WithHeader
::: langsmith.option.WithMaxRetries
::: langsmith.option.WithRequestTimeout
::: langsmith.option.WithMiddleware
::: langsmith.option.WithHTTPClient
