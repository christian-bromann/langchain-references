# Backends

Deep Agents use backends to manage file system operations and memory storage. You can configure different backends depending on your persistence and isolation needs.

## StateBackend

In-memory, ephemeral storage. Files are stored in the agent's state and lost when the agent ends. This is the default backend.

```typescript
import { createDeepAgent, StateBackend } from "deepagents";

const agent = createDeepAgent({
  backend: new StateBackend(),
});
```

## StoreBackend

Persistent storage using LangGraph Store. Files persist across agent runs.

```typescript
import { createDeepAgent, StoreBackend } from "deepagents";
import { InMemoryStore } from "@langchain/langgraph";

const store = new InMemoryStore();
const agent = createDeepAgent({
  backend: new StoreBackend({ store }),
});
```

## FilesystemBackend

Store files on the actual filesystem. Useful for agents that need to interact with real files.

```typescript
import { createDeepAgent, FilesystemBackend } from "deepagents";

const agent = createDeepAgent({
  backend: new FilesystemBackend({
    rootDir: "/path/to/workspace",
  }),
});
```

## CompositeBackend

Combine multiple backends for layered storage strategies. Reads check backends in order, writes go to the primary backend.

```typescript
import { createDeepAgent, CompositeBackend, StateBackend, FilesystemBackend } from "deepagents";

// State backend for scratch files, filesystem for persistent output
const agent = createDeepAgent({
  backend: new CompositeBackend({
    primary: new StateBackend(),
    fallbacks: [new FilesystemBackend({ rootDir: "/workspace" })],
  }),
});
```

## Sandbox Backends

For agents that need to run shell commands in isolated environments. Extend `BaseSandbox` to implement your own sandbox integration.

::: index.StateBackend
::: index.StoreBackend
::: index.FilesystemBackend
::: index.CompositeBackend
::: index.BaseSandbox
::: index.SandboxBackendProtocol
::: index.BackendProtocol
::: index.ExecuteResponse
::: index.FileUploadResponse
::: index.FileDownloadResponse
::: index.BackendFactory
