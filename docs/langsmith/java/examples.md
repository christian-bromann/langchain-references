# Examples

Examples are individual data points within a dataset. They consist of inputs, expected outputs, and optional metadata used for evaluation.

## Example Service

::: com.langchain.smith.services.blocking.ExampleService
options:
show_if_no_docstring: true

::: com.langchain.smith.services.async.ExampleServiceAsync
options:
show_if_no_docstring: true

## Types

::: com.langchain.smith.models.examples.Example
options:
show_if_no_docstring: true

::: com.langchain.smith.models.examples.ExampleCreateParams
options:
show_if_no_docstring: true

::: com.langchain.smith.models.examples.ExampleListParams
options:
show_if_no_docstring: true

::: com.langchain.smith.models.examples.ExampleUpdateParams
options:
show_if_no_docstring: true

::: com.langchain.smith.models.examples.ExampleUploadFromCsvParams
options:
show_if_no_docstring: true

## Bulk Operations

Create and update multiple examples at once for efficient batch processing.

::: com.langchain.smith.services.blocking.examples.BulkService
options:
show_if_no_docstring: true

::: com.langchain.smith.services.async.examples.BulkServiceAsync
options:
show_if_no_docstring: true

## Validation

Validate examples before creating or updating them.

::: com.langchain.smith.services.blocking.examples.ValidateService
options:
show_if_no_docstring: true

::: com.langchain.smith.services.async.examples.ValidateServiceAsync
options:
show_if_no_docstring: true
