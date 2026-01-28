package com.langchain.smith.errors

/**
 * Base exception class for all LangSmith SDK exceptions.
 *
 * @param message The error message describing what went wrong.
 * @param cause The underlying cause of this exception, if any.
 */
open class LangChainException(
    message: String? = null,
    cause: Throwable? = null
) : RuntimeException(message, cause)

/**
 * Exception thrown when a service request fails.
 * Contains details about the HTTP status code and response.
 *
 * @param statusCode The HTTP status code returned by the server.
 * @param message The error message from the server.
 */
open class LangChainServiceException(
    val statusCode: Int,
    message: String
) : LangChainException(message)

/**
 * Exception thrown when the server returns a 400 Bad Request error.
 *
 * This typically indicates invalid request parameters or malformed request body.
 */
class BadRequestException(message: String) : LangChainServiceException(400, message)

/**
 * Exception thrown when the server returns a 401 Unauthorized error.
 *
 * This indicates that authentication is required or has failed.
 */
class UnauthorizedException(message: String) : LangChainServiceException(401, message)

/**
 * Exception thrown when the server returns a 403 Forbidden error.
 *
 * This indicates that the client does not have permission to access the resource.
 */
class PermissionDeniedException(message: String) : LangChainServiceException(403, message)

/**
 * Exception thrown when the server returns a 404 Not Found error.
 *
 * This indicates that the requested resource does not exist.
 */
class NotFoundException(message: String) : LangChainServiceException(404, message)

/**
 * Exception thrown when an I/O error occurs.
 */
class LangChainIoException(
    message: String,
    cause: Throwable? = null
) : LangChainException(message, cause)
