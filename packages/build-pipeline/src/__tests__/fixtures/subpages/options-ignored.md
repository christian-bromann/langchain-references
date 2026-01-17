# Options Ignored Test

Testing that options blocks are properly ignored.

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

::: langchain.agents.middleware.SimpleDecorator
