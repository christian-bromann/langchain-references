# MCP Integration

The `deepagents` library can be run with MCP (Model Context Protocol) tools using the LangChain MCP Adapter library.

## Installation

```bash
pip install langchain-mcp-adapters
```

## Usage

**Note:** MCP tools are async, so you'll need to use `agent.ainvoke()` or `agent.astream()` for invocation.

```python
import asyncio
from langchain_mcp_adapters.client import MultiServerMCPClient
from deepagents import create_deep_agent

async def main():
    # Collect MCP tools
    mcp_client = MultiServerMCPClient(...)
    mcp_tools = await mcp_client.get_tools()

    # Create agent
    agent = create_deep_agent(tools=mcp_tools, ...)

    # Stream the agent
    async for chunk in agent.astream(
        {"messages": [{"role": "user", "content": "what is langgraph?"}]},
        stream_mode="values"
    ):
        if "messages" in chunk:
            chunk["messages"][-1].pretty_print()

asyncio.run(main())
```

## MCP Client Configuration

::: langchain_mcp_adapters.client.MultiServerMCPClient
options:
show_if_no_docstring: true

::: langchain_mcp_adapters.client.MCPClient
options:
show_if_no_docstring: true
