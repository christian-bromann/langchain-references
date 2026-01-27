# Client

The LangSmith Java SDK provides both synchronous and asynchronous clients for interacting with the LangSmith API. The clients handle authentication, retries, and provide access to all service endpoints.

## Configuration

Configure the client using environment variables or programmatic options:

| Setter           | System Property                     | Environment Variable        | Default                            |
| ---------------- | ----------------------------------- | --------------------------- | ---------------------------------- |
| `apiKey`         | `langchain.langsmithApiKey`         | `LANGSMITH_API_KEY`         | -                                  |
| `tenantId`       | `langchain.langsmithTenantId`       | `LANGSMITH_TENANT_ID`       | -                                  |
| `bearerToken`    | `langchain.langsmithBearerToken`    | `LANGSMITH_BEARER_TOKEN`    | -                                  |
| `organizationId` | `langchain.langsmithOrganizationId` | `LANGSMITH_ORGANIZATION_ID` | -                                  |
| `baseUrl`        | `langchain.baseUrl`                 | `LANGSMITH_ENDPOINT`        | `https://api.smith.langchain.com/` |

::: com.langchain.smith.client.okhttp.LangsmithOkHttpClient
::: com.langchain.smith.client.LangsmithClient
::: com.langchain.smith.client.okhttp.LangsmithOkHttpClientAsync
::: com.langchain.smith.client.LangsmithClientAsync
::: com.langchain.smith.core.ClientOptions
::: com.langchain.smith.core.RequestOptions
::: com.langchain.smith.core.Timeout
