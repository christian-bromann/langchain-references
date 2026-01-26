# Configuration

Deep Agents can be configured through various options to customize their behavior, model selection, and capabilities.

## Model Configuration

By default, Deep Agents use `claude-sonnet-4-5-20250929`. You can customize this by passing any LangChain model object:

```python
from langchain.chat_models import init_chat_model
from deepagents import create_deep_agent

# Using the provider:model format
model = init_chat_model(model="openai:gpt-5")
agent = create_deep_agent(model=model)

# Or directly with a model instance
from langchain_anthropic import ChatAnthropic
model = ChatAnthropic(model="claude-sonnet-4-20250514")
agent = create_deep_agent(model=model)
```

## System Prompt Configuration

Deep Agents come with a built-in system prompt that provides detailed instructions for planning, file system usage, and subagent spawning. You can customize this with use-case specific prompts:

```python
from deepagents import create_deep_agent

research_instructions = """You are an expert researcher.
Your job is to conduct thorough research, and then write a polished report.
"""

agent = create_deep_agent(
    system_prompt=research_instructions,
)
```

## Interrupt Configuration

Configure human-in-the-loop workflows for sensitive tool operations:

```python
from langchain_core.tools import tool
from deepagents import create_deep_agent

@tool
def get_weather(city: str) -> str:
    """Get the weather in a city."""
    return f"The weather in {city} is sunny."

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-20250514",
    tools=[get_weather],
    interrupt_on={
        "get_weather": {
            "allowed_decisions": ["approve", "edit", "reject"]
        },
    }
)
```

## Backend Configuration

Configure how the agent stores files and state:

```python
from deepagents import create_deep_agent
from deepagents.backends import StateBackend, StoreBackend, FilesystemBackend

# Default: StateBackend (in-memory, ephemeral)
agent = create_deep_agent()

# StoreBackend: Persistent storage
from langgraph.store.memory import InMemoryStore
agent = create_deep_agent(
    backend=StoreBackend,
    store=InMemoryStore(),
)

# FilesystemBackend: Real filesystem
agent = create_deep_agent(
    backend=FilesystemBackend(root_dir="./agent-workspace"),
)
```
