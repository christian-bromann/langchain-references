# Sessions

Sessions (also known as Projects) group related runs together. They provide a way to organize and analyze your LLM application executions.

## Session Service

::: langsmith.SessionService
options:
show_if_no_docstring: true
members: - New - Get - Update - List - Delete - Dashboard

## Types

::: langsmith.TracerSession
options:
show_if_no_docstring: true

::: langsmith.TracerSessionWithoutVirtualFields
options:
show_if_no_docstring: true

::: langsmith.SessionNewParams
options:
show_if_no_docstring: true

::: langsmith.SessionListParams
options:
show_if_no_docstring: true

::: langsmith.SessionUpdateParams
options:
show_if_no_docstring: true

::: langsmith.SessionSortableColumns
options:
show_if_no_docstring: true

::: langsmith.CustomChartsSection
options:
show_if_no_docstring: true

::: langsmith.CustomChartsSectionRequestParam
options:
show_if_no_docstring: true

## Session Insights

Analyze and cluster runs within a session for deeper insights.

::: langsmith.SessionInsightService
options:
show_if_no_docstring: true
members: - New - Update - Delete - GetJob - GetRuns

::: langsmith.CreateRunClusteringJobRequestParam
options:
show_if_no_docstring: true
