# Annotation Queues

Annotation queues help organize human review workflows. Queue runs for review, assign them to reviewers, and track annotation progress.

## Annotation Queue Service

::: langsmith.AnnotationQueueService
  options:
    show_if_no_docstring: true
    members:
      - New
      - Get
      - Update
      - List
      - Delete

## Types

::: langsmith.AnnotationQueue
  options:
    show_if_no_docstring: true

::: langsmith.AnnotationQueueNewParams
  options:
    show_if_no_docstring: true

::: langsmith.AnnotationQueueListParams
  options:
    show_if_no_docstring: true

::: langsmith.AnnotationQueueUpdateParams
  options:
    show_if_no_docstring: true

## Queue Info

Get information about annotation queue statistics and status.

::: langsmith.AnnotationQueueInfoService
  options:
    show_if_no_docstring: true
    members:
      - Get
      - List
      - GetSizeByID

## Queue Runs

Manage runs within annotation queues.

::: langsmith.AnnotationQueueRunService
  options:
    show_if_no_docstring: true
    members:
      - New
      - Get
      - Update
      - List
      - Delete
