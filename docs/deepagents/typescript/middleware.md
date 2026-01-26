# Middleware

Deep Agents use a modular middleware architecture. Each core capability (planning, filesystem, subagents) is implemented as separate middleware that can be composed and customized.

## TodoList Middleware

Planning is integral to solving complex problems. The `todoListMiddleware` provides a `write_todos` tool for task planning and tracking.

::: deepagents/middleware.todoListMiddleware
options:
show_if_no_docstring: true

::: deepagents/middleware.TodoListMiddlewareConfig
options:
show_if_no_docstring: true

## Filesystem Middleware

Context engineering is one of the main challenges in building effective agents. The `FilesystemMiddleware` provides tools for reading, writing, and managing files.

::: deepagents/middleware.createFilesystemMiddleware
options:
show_if_no_docstring: true

::: deepagents/middleware.FilesystemMiddleware
options:
show_if_no_docstring: true

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

Handing off tasks to subagents is a great way to isolate context. The `SubAgentMiddleware` provides a `task` tool for spawning specialized subagents.

::: deepagents/middleware.createSubAgentMiddleware
options:
show_if_no_docstring: true

::: deepagents/middleware.SubAgentMiddleware
options:
show_if_no_docstring: true

::: deepagents/middleware.SubAgentMiddlewareConfig
options:
show_if_no_docstring: true

## Memory Middleware

::: deepagents/middleware.createMemoryMiddleware
options:
show_if_no_docstring: true

::: deepagents/middleware.MemoryMiddleware
options:
show_if_no_docstring: true

## Summarization Middleware

::: deepagents/middleware.createSummarizationMiddleware
options:
show_if_no_docstring: true

## Skills Middleware

::: deepagents/middleware.createSkillsMiddleware
options:
show_if_no_docstring: true

::: deepagents/middleware.SkillsMiddleware
options:
show_if_no_docstring: true
