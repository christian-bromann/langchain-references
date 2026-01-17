!!! note "Reference docs"
    This page contains **reference documentation** for Middleware.
    See [the docs](https://docs.langchain.com/oss/python/langchain/middleware) for conceptual guides, tutorials, and examples on using Middleware.

## Middleware classes

LangChain provides prebuilt middleware for common agent use cases:

| CLASS | DESCRIPTION |
| ----- | ----------- |
| [`SummarizationMiddleware`](#langchain.agents.middleware.SummarizationMiddleware) | Automatically summarize conversation history when approaching token limits |
| [`HumanInTheLoopMiddleware`](#langchain.agents.middleware.HumanInTheLoopMiddleware) | Pause execution for human approval of tool calls |
| [`ModelCallLimitMiddleware`](#langchain.agents.middleware.ModelCallLimitMiddleware) | Limit the number of model calls to prevent excessive costs |

## Decorators

Create custom middleware using these decorators:

| DECORATOR | DESCRIPTION |
| --------- | ----------- |
| [`@before_agent`](#langchain.agents.middleware.before_agent) | Execute logic before agent execution starts |
| [`@before_model`](#langchain.agents.middleware.before_model) | Execute logic before each model call |

## Types and utilities

Core types for building middleware:

| TYPE | DESCRIPTION |
| ---- | ----------- |
| [`AgentState`](#langchain.agents.middleware.AgentState) | State container for agent execution |
| [`ModelRequest`](#langchain.agents.middleware.ModelRequest) | Request details passed to model calls |

::: langchain.agents.middleware.SummarizationMiddleware
    options:
        docstring_options:
            ignore_init_summary: true
        merge_init_into_class: true
        filters: ["^__init__$"]

::: langchain.agents.middleware.HumanInTheLoopMiddleware
    options:
        docstring_options:
            ignore_init_summary: true
        merge_init_into_class: true
        filters: ["^__init__$"]

::: langchain.agents.middleware.ModelCallLimitMiddleware
    options:
        docstring_options:
            ignore_init_summary: true
        merge_init_into_class: true
        filters: ["^(__init__|state_schema)$"]

::: langchain.agents.middleware.before_agent
::: langchain.agents.middleware.before_model
::: langchain.agents.middleware.AgentState
    options:
        merge_init_into_class: true
::: langchain.agents.middleware.ModelRequest
    options:
        merge_init_into_class: true
