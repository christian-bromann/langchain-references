# Client

The LangSmith Java SDK provides both synchronous and asynchronous clients for interacting with the LangSmith API. The clients handle authentication, retries, and provide access to all service endpoints.

## Creating a Client

### Synchronous Client

::: com.langchain.smith.client.okhttp.LangsmithOkHttpClient
options:
show_if_no_docstring: true

::: com.langchain.smith.client.LangsmithClient
options:
show_if_no_docstring: true

### Asynchronous Client

::: com.langchain.smith.client.okhttp.LangsmithOkHttpClientAsync
options:
show_if_no_docstring: true

::: com.langchain.smith.client.LangsmithClientAsync
options:
show_if_no_docstring: true

## Configuration

Configure the client using environment variables or programmatic options:

| Setter           | System Property                     | Environment Variable        | Default                            |
| ---------------- | ----------------------------------- | --------------------------- | ---------------------------------- |
| `apiKey`         | `langchain.langsmithApiKey`         | `LANGSMITH_API_KEY`         | -                                  |
| `tenantId`       | `langchain.langsmithTenantId`       | `LANGSMITH_TENANT_ID`       | -                                  |
| `bearerToken`    | `langchain.langsmithBearerToken`    | `LANGSMITH_BEARER_TOKEN`    | -                                  |
| `organizationId` | `langchain.langsmithOrganizationId` | `LANGSMITH_ORGANIZATION_ID` | -                                  |
| `baseUrl`        | `langchain.baseUrl`                 | `LANGSMITH_ENDPOINT`        | `https://api.smith.langchain.com/` |

## Client Options

::: com.langchain.smith.core.ClientOptions
options:
show_if_no_docstring: true

::: com.langchain.smith.core.RequestOptions
options:
show_if_no_docstring: true

::: com.langchain.smith.core.Timeout
options:
show_if_no_docstring: true
