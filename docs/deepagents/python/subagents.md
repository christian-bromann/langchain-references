# Subagents

A main feature of Deep Agents is their ability to spawn subagents. Subagents are useful for context quarantine and specialized task handling.

## Using SubAgents

### Basic SubAgent Definition

```python
import os
from typing import Literal
from tavily import TavilyClient
from deepagents import create_deep_agent

tavily_client = TavilyClient(api_key=os.environ["TAVILY_API_KEY"])

def internet_search(
    query: str,
    max_results: int = 5,
    topic: Literal["general", "news", "finance"] = "general",
    include_raw_content: bool = False,
):
    """Run a web search"""
    return tavily_client.search(
        query,
        max_results=max_results,
        include_raw_content=include_raw_content,
        topic=topic,
    )

research_subagent = {
    "name": "research-agent",
    "description": "Used to research more in depth questions",
    "system_prompt": "You are a great researcher",
    "tools": [internet_search],
    "model": "openai:gpt-4o",  # Optional override
}

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-20250514",
    subagents=[research_subagent]
)
```

### Using CompiledSubAgent

For complex workflows, you can use a pre-built LangGraph graph as a subagent:

```python
from langchain.agents import create_agent
from deepagents import create_deep_agent, CompiledSubAgent

# Create a custom agent graph
custom_graph = create_agent(
    model=your_model,
    tools=specialized_tools,
    prompt="You are a specialized agent for data analysis..."
)

# Use it as a compiled subagent
custom_subagent = CompiledSubAgent(
    name="data-analyzer",
    description="Specialized agent for complex data analysis tasks",
    runnable=custom_graph
)

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-20250514",
    subagents=[custom_subagent]
)
```

## SubAgent Fields

| Field           | Type                               | Description                                    |
| --------------- | ---------------------------------- | ---------------------------------------------- |
| `name`          | `str`                              | Name of the subagent (how main agent calls it) |
| `description`   | `str`                              | Description shown to the main agent            |
| `system_prompt` | `str`                              | System prompt for the subagent                 |
| `tools`         | `Sequence[BaseTool \| Callable]`   | Tools the subagent has access to               |
| `model`         | `str \| BaseChatModel` (optional)  | Model override for the subagent                |
| `middleware`    | `list[AgentMiddleware]` (optional) | Additional middleware for the subagent         |
| `interrupt_on`  | `dict` (optional)                  | Human-in-the-loop configuration for tools      |

::: deepagents.SubAgent
::: deepagents.CompiledSubAgent
