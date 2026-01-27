# Middleware

Deep Agents use a modular middleware architecture. Each core capability (planning, filesystem, subagents) is implemented as separate middleware that can be composed and customized.

## TodoList Middleware

Planning is integral to solving complex problems. The [`todoListMiddleware`](#deepagents.middleware.todoListMiddleware) provides a `write_todos` tool for task planning and tracking.

## Filesystem Middleware

Context engineering is one of the main challenges in building effective agents. The [`FilesystemMiddleware`](#deepagents.middleware.FilesystemMiddleware) provides tools for reading, writing, and managing files.

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

Handing off tasks to subagents is a great way to isolate context. The [`SubAgentMiddleware`](#deepagents.middleware.SubAgentMiddleware) provides a `task` tool for spawning specialized subagents.

::: deepagents.middleware.todoListMiddleware
::: deepagents.middleware.TodoListMiddlewareConfig
::: deepagents.middleware.createFilesystemMiddleware
::: deepagents.middleware.FilesystemMiddleware
::: deepagents.middleware.createSubAgentMiddleware
::: deepagents.middleware.SubAgentMiddleware
::: deepagents.middleware.SubAgentMiddlewareConfig
::: deepagents.middleware.createMemoryMiddleware
::: deepagents.middleware.MemoryMiddleware
::: deepagents.middleware.createSummarizationMiddleware
::: deepagents.middleware.createSkillsMiddleware
::: deepagents.middleware.SkillsMiddleware
