# Feedback

Feedback allows you to capture human or automated evaluations of runs. Use feedback to track quality, identify issues, and improve your LLM applications.

## Feedback Service

::: langsmith.FeedbackService
  options:
    show_if_no_docstring: true
    members:
      - New
      - Get
      - Update
      - List
      - Delete
      - NewBatch

## Types

::: langsmith.Feedback
  options:
    show_if_no_docstring: true

::: langsmith.FeedbackNewParams
  options:
    show_if_no_docstring: true

::: langsmith.FeedbackListParams
  options:
    show_if_no_docstring: true

::: langsmith.FeedbackUpdateParams
  options:
    show_if_no_docstring: true

::: langsmith.FeedbackCategory
  options:
    show_if_no_docstring: true

::: langsmith.FeedbackLevel
  options:
    show_if_no_docstring: true

## Feedback Configuration

Define feedback schemas and configurations for consistent evaluation.

::: langsmith.FeedbackConfigService
  options:
    show_if_no_docstring: true
    members:
      - New
      - Get
      - List

::: langsmith.FeedbackConfigSchema
  options:
    show_if_no_docstring: true

## Feedback Tokens

Generate tokens for collecting feedback from external sources.

::: langsmith.FeedbackTokenService
  options:
    show_if_no_docstring: true
    members:
      - New
      - Get
