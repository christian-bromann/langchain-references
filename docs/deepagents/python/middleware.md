# Middleware

Deep Agents use a modular middleware architecture. Each core capability (planning, filesystem, subagents) is implemented as separate middleware that can be composed and customized.

## TodoListMiddleware

Planning is integral to solving complex problems. The `TodoListMiddleware` provides a `write_todos` tool for task planning and tracking.

::: deepagents.middleware.TodoListMiddleware
options:
show_if_no_docstring: true

## FilesystemMiddleware

Context engineering is one of the main challenges in building effective agents. The `FilesystemMiddleware` provides tools for reading, writing, and managing files.

::: deepagents.middleware.FilesystemMiddleware
options:
show_if_no_docstring: true

::: deepagents.middleware.filesystem.FilesystemMiddleware
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

## SubAgentMiddleware

Handing off tasks to subagents is a great way to isolate context. The `SubAgentMiddleware` provides a `task` tool for spawning specialized subagents.

::: deepagents.middleware.SubAgentMiddleware
options:
show_if_no_docstring: true

::: deepagents.middleware.subagents.SubAgentMiddleware
options:
show_if_no_docstring: true

## MemoryMiddleware

::: deepagents.middleware.MemoryMiddleware
options:
show_if_no_docstring: true

::: deepagents.middleware.memory.MemoryMiddleware
options:
show_if_no_docstring: true

## SummarizationMiddleware

::: deepagents.middleware.SummarizationMiddleware
options:
show_if_no_docstring: true

::: deepagents.middleware.summarization.SummarizationMiddleware
options:
show_if_no_docstring: true

## SkillsMiddleware

::: deepagents.middleware.SkillsMiddleware
options:
show_if_no_docstring: true

::: deepagents.middleware.skills.SkillsMiddleware
options:
show_if_no_docstring: true
