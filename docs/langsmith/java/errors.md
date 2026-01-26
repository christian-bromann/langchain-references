# Errors

The LangSmith Java SDK provides a comprehensive error handling system with specific exception types for different error conditions.

## Base Exception

::: com.langchain.smith.errors.LangChainException
  options:
    show_if_no_docstring: true

## Service Exceptions

HTTP errors from the API are wrapped in service exceptions:

::: com.langchain.smith.errors.LangChainServiceException
  options:
    show_if_no_docstring: true

### HTTP Status Code Exceptions

| Status Code | Exception                       |
| ----------- | ------------------------------- |
| 400         | `BadRequestException`           |
| 401         | `UnauthorizedException`         |
| 403         | `PermissionDeniedException`     |
| 404         | `NotFoundException`             |
| 422         | `UnprocessableEntityException`  |
| 429         | `RateLimitException`            |
| 5xx         | `InternalServerException`       |
| Other       | `UnexpectedStatusCodeException` |

::: com.langchain.smith.errors.BadRequestException
  options:
    show_if_no_docstring: true

::: com.langchain.smith.errors.UnauthorizedException
  options:
    show_if_no_docstring: true

::: com.langchain.smith.errors.PermissionDeniedException
  options:
    show_if_no_docstring: true

::: com.langchain.smith.errors.NotFoundException
  options:
    show_if_no_docstring: true

::: com.langchain.smith.errors.UnprocessableEntityException
  options:
    show_if_no_docstring: true

::: com.langchain.smith.errors.RateLimitException
  options:
    show_if_no_docstring: true

::: com.langchain.smith.errors.InternalServerException
  options:
    show_if_no_docstring: true

::: com.langchain.smith.errors.UnexpectedStatusCodeException
  options:
    show_if_no_docstring: true

## Other Exceptions

::: com.langchain.smith.errors.LangChainIoException
  options:
    show_if_no_docstring: true

::: com.langchain.smith.errors.LangChainRetryableException
  options:
    show_if_no_docstring: true

::: com.langchain.smith.errors.LangChainInvalidDataException
  options:
    show_if_no_docstring: true
