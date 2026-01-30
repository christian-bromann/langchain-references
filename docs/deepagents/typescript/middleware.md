# Middleware

Deep Agents use a modular middleware architecture. Each core capability (planning, filesystem, subagents) is implemented as separate middleware that can be composed and customized.

## Filesystem Middleware

Context engineering is one of the main challenges in building effective agents. The [`createFilesystemMiddleware`](#index.createFilesystemMiddleware) function provides tools for reading, writing, and managing files.

### Filesystem Tools

The middleware provides the following tools:

| Tool         | Description                       |
| ------------ | --------------------------------- |
| `ls`         | List files in a directory         |
| `read_file`  | Read file contents                |
| `write_file` | Write content to a file           |
| `edit_file`  | Edit an existing file             |
| `glob`       | Find files matching a pattern     |
| `grep`       | Search for text within files      |
| `execute`    | Run shell commands (sandbox only) |

## SubAgent Middleware

Handing off tasks to subagents is a great way to isolate context. The [`createSubAgentMiddleware`](#index.createSubAgentMiddleware) function provides a `task` tool for spawning specialized subagents.

::: index.createFilesystemMiddleware
::: index.FilesystemMiddlewareOptions
::: index.createSubAgentMiddleware
::: index.SubAgentMiddlewareOptions
::: index.createMemoryMiddleware
::: index.MemoryMiddlewareOptions
::: index.createAgentMemoryMiddleware
::: index.AgentMemoryMiddlewareOptions
::: middleware.createSummarizationMiddleware
::: middleware.SummarizationMiddlewareOptions
::: index.createSkillsMiddleware
::: index.SkillsMiddlewareOptions
