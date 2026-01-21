# Nested Options Test

Complex nested YAML options that should be ignored.

::: langchain.agents.Agent
options:
show*root_heading: true
show_source: false
members: - **init** - run - stop
filters:
include: - "^[a-z]"
exclude: - "^*"
annotations:
type: full
show_defaults: true
inherited_members: true

::: langchain.agents.AgentExecutor
options:
docstring_options:
ignore_init_summary: true
trim_doctest_flags: true
merge_init_into_class: true
show_signature_annotations: true
separate_signature: false
unwrap_annotated: true

::: langchain.agents.SimpleAgent
