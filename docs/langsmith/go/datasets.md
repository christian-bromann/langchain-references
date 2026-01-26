# Datasets

Datasets are collections of examples used for evaluation and testing. The Datasets API allows you to create, manage, and export datasets in various formats.

## Dataset Service

::: langsmith.DatasetService
  options:
    show_if_no_docstring: true
    members:
      - New
      - Get
      - Update
      - List
      - Delete
      - Clone
      - GetCsv
      - GetJSONL
      - GetOpenAI
      - GetOpenAIFt
      - GetVersion
      - UpdateTags
      - Upload

## Types

::: langsmith.Dataset
  options:
    show_if_no_docstring: true

::: langsmith.DatasetNewParams
  options:
    show_if_no_docstring: true

::: langsmith.DatasetListParams
  options:
    show_if_no_docstring: true

::: langsmith.DatasetUpdateParams
  options:
    show_if_no_docstring: true

::: langsmith.DatasetVersion
  options:
    show_if_no_docstring: true

::: langsmith.DataType
  options:
    show_if_no_docstring: true

## Dataset Versions

::: langsmith.DatasetVersionService
  options:
    show_if_no_docstring: true
    members:
      - List
      - GetDiff

## Dataset Experiments

::: langsmith.DatasetExperimentService
  options:
    show_if_no_docstring: true
    members:
      - List
      - GetCount
      - GetProgress
      - GetSummaries

## Dataset Comparatives

::: langsmith.DatasetComparativeService
  options:
    show_if_no_docstring: true
    members:
      - New
      - Get
      - Update
      - List
      - Delete

## Dataset Groups

::: langsmith.DatasetGroupService
  options:
    show_if_no_docstring: true
    members:
      - Get
      - List

## Dataset Splits

::: langsmith.DatasetSplitService
  options:
    show_if_no_docstring: true
    members:
      - New
      - Update
      - Delete

## Dataset Sharing

::: langsmith.DatasetShareService
  options:
    show_if_no_docstring: true
    members:
      - New
      - Get
      - Delete
