# Backends

Deep Agents use backends to manage file system operations and memory storage. You can configure different backends depending on your persistence and isolation needs.

## StateBackend

In-memory, ephemeral storage. Files are stored in the agent's state and lost when the agent ends. This is the default backend.

::: deepagents.backends.StateBackend
options:
show_if_no_docstring: true

::: deepagents.backends.state.StateBackend
options:
show_if_no_docstring: true

## StoreBackend

Persistent storage using LangGraph Store. Files persist across agent runs.

::: deepagents.backends.StoreBackend
options:
show_if_no_docstring: true

::: deepagents.backends.store.StoreBackend
options:
show_if_no_docstring: true

## FilesystemBackend

Store files on the actual filesystem. Useful for agents that need to interact with real files.

::: deepagents.backends.FilesystemBackend
options:
show_if_no_docstring: true

::: deepagents.backends.filesystem.FilesystemBackend
options:
show_if_no_docstring: true

## CompositeBackend

Combine multiple backends for layered storage strategies.

::: deepagents.backends.CompositeBackend
options:
show_if_no_docstring: true

::: deepagents.backends.composite.CompositeBackend
options:
show_if_no_docstring: true

## Sandbox Backends

For agents that need to run shell commands in isolated environments.

::: deepagents.backends.BaseSandbox
options:
show_if_no_docstring: true

::: deepagents.backends.sandbox.BaseSandbox
options:
show_if_no_docstring: true

::: deepagents.backends.SandboxBackendProtocol
options:
show_if_no_docstring: true

## Backend Protocol

::: deepagents.backends.BackendProtocol
options:
show_if_no_docstring: true

::: deepagents.backends.protocol.BackendProtocol
options:
show_if_no_docstring: true

## Utilities

::: deepagents.backends.utils
options:
show_if_no_docstring: true
members: - validate_path - normalize_path - is_safe_path
