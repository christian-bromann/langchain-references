# Examples

Examples are individual data points within a dataset. They consist of inputs, expected outputs, and optional metadata used for evaluation.

## Example Service

::: langsmith.ExampleService
  options:
    show_if_no_docstring: true
    members:
      - New
      - Get
      - Update
      - List
      - Delete
      - DeleteAll
      - GetCount
      - UploadFromCsv

## Types

::: langsmith.Example
  options:
    show_if_no_docstring: true

::: langsmith.ExampleNewParams
  options:
    show_if_no_docstring: true

::: langsmith.ExampleListParams
  options:
    show_if_no_docstring: true

::: langsmith.ExampleUpdateParams
  options:
    show_if_no_docstring: true

::: langsmith.ExampleSelect
  options:
    show_if_no_docstring: true

::: langsmith.AttachmentsOperationsParam
  options:
    show_if_no_docstring: true

## Bulk Operations

Create and update multiple examples at once for efficient batch processing.

::: langsmith.ExampleBulkService
  options:
    show_if_no_docstring: true
    members:
      - New
      - PatchAll

::: langsmith.ExampleBulkNewParams
  options:
    show_if_no_docstring: true

::: langsmith.ExampleBulkPatchAllParams
  options:
    show_if_no_docstring: true

## Validation

Validate examples before creating or updating them.

::: langsmith.ExampleValidateService
  options:
    show_if_no_docstring: true
    members:
      - New
      - Bulk

::: langsmith.ExampleValidationResult
  options:
    show_if_no_docstring: true
