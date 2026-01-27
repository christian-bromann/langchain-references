# Middleware

Deep Agents use a modular middleware architecture. Each core capability (planning, filesystem, subagents) is implemented as separate middleware that can be composed and customized.

## TodoListMiddleware

Planning is integral to solving complex problems. The [`TodoListMiddleware`](#deepagents.middleware.TodoListMiddleware) provides a `write_todos` tool for task planning and tracking.

## FilesystemMiddleware

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

## SubAgentMiddleware

Handing off tasks to subagents is a great way to isolate context. The [`SubAgentMiddleware`](#deepagents.middleware.SubAgentMiddleware) provides a `task` tool for spawning specialized subagents.

::: deepagents.middleware.TodoListMiddleware
::: deepagents.middleware.FilesystemMiddleware
::: deepagents.middleware.filesystem.FilesystemMiddleware
::: deepagents.middleware.SubAgentMiddleware
::: deepagents.middleware.subagents.SubAgentMiddleware
::: deepagents.middleware.MemoryMiddleware
::: deepagents.middleware.memory.MemoryMiddleware
::: deepagents.middleware.SummarizationMiddleware
::: deepagents.middleware.summarization.SummarizationMiddleware
::: deepagents.middleware.SkillsMiddleware
::: deepagents.middleware.skills.SkillsMiddleware
