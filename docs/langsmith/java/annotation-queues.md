# Annotation Queues

Annotation queues help organize human review workflows. Queue runs for review, assign them to reviewers, and track annotation progress.

## Annotation Queue Service

::: com.langchain.smith.services.blocking.AnnotationQueueService
  options:
    show_if_no_docstring: true

::: com.langchain.smith.services.async.AnnotationQueueServiceAsync
  options:
    show_if_no_docstring: true

## Types

::: com.langchain.smith.models.annotationqueues.AnnotationQueue
  options:
    show_if_no_docstring: true

::: com.langchain.smith.models.annotationqueues.AnnotationQueueCreateParams
  options:
    show_if_no_docstring: true

::: com.langchain.smith.models.annotationqueues.AnnotationQueueListParams
  options:
    show_if_no_docstring: true

::: com.langchain.smith.models.annotationqueues.AnnotationQueueUpdateParams
  options:
    show_if_no_docstring: true

## Queue Info

Get information about annotation queue statistics and status.

::: com.langchain.smith.services.blocking.annotationqueues.InfoService
  options:
    show_if_no_docstring: true

::: com.langchain.smith.services.async.annotationqueues.InfoServiceAsync
  options:
    show_if_no_docstring: true

## Queue Runs

Manage runs within annotation queues.

::: com.langchain.smith.services.blocking.annotationqueues.RunService
  options:
    show_if_no_docstring: true

::: com.langchain.smith.services.async.annotationqueues.RunServiceAsync
  options:
    show_if_no_docstring: true
