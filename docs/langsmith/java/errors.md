# Errors

The LangSmith Java SDK provides a comprehensive error handling system with specific exception types for different error conditions.

## HTTP Status Code Exceptions

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

::: com.langchain.smith.errors.LangChainException
::: com.langchain.smith.errors.LangChainServiceException
::: com.langchain.smith.errors.BadRequestException
::: com.langchain.smith.errors.UnauthorizedException
::: com.langchain.smith.errors.PermissionDeniedException
::: com.langchain.smith.errors.NotFoundException
::: com.langchain.smith.errors.UnprocessableEntityException
::: com.langchain.smith.errors.RateLimitException
::: com.langchain.smith.errors.InternalServerException
::: com.langchain.smith.errors.UnexpectedStatusCodeException
::: com.langchain.smith.errors.LangChainIoException
::: com.langchain.smith.errors.LangChainRetryableException
::: com.langchain.smith.errors.LangChainInvalidDataException
