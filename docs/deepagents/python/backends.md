# Backends

Deep Agents use backends to manage file system operations and memory storage. You can configure different backends depending on your persistence and isolation needs.

## StateBackend

In-memory, ephemeral storage. Files are stored in the agent's state and lost when the agent ends. This is the default backend.

## StoreBackend

Persistent storage using LangGraph Store. Files persist across agent runs.

## FilesystemBackend

Store files on the actual filesystem. Useful for agents that need to interact with real files.

## CompositeBackend

Combine multiple backends for layered storage strategies.

## Sandbox Backends

For agents that need to run shell commands in isolated environments.

::: deepagents.backends.StateBackend
::: deepagents.backends.state.StateBackend
::: deepagents.backends.StoreBackend
::: deepagents.backends.store.StoreBackend
::: deepagents.backends.FilesystemBackend
::: deepagents.backends.filesystem.FilesystemBackend
::: deepagents.backends.CompositeBackend
::: deepagents.backends.composite.CompositeBackend
::: deepagents.backends.BaseSandbox
::: deepagents.backends.sandbox.BaseSandbox
::: deepagents.backends.SandboxBackendProtocol
::: deepagents.backends.BackendProtocol
::: deepagents.backends.protocol.BackendProtocol
::: deepagents.backends.utils
