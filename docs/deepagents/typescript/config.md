# Configuration

Deep Agents can be configured through various options to customize their behavior, model selection, and capabilities.

## Model Configuration

By default, Deep Agents use `claude-sonnet-4-5-20250929`. You can customize this by passing any LangChain model object:

```typescript
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { createDeepAgent } from "deepagents";

// Using Anthropic
const agent = createDeepAgent({
  model: new ChatAnthropic({
    model: "claude-sonnet-4-20250514",
    temperature: 0,
  }),
});

// Using OpenAI
const agent2 = createDeepAgent({
  model: new ChatOpenAI({
    model: "gpt-5",
    temperature: 0,
  }),
});
```

## System Prompt Configuration

Deep Agents come with a built-in system prompt that provides detailed instructions for planning, file system usage, and subagent spawning. You can customize this with use-case specific prompts:

```typescript
import { createDeepAgent } from "deepagents";

const researchInstructions = `You are an expert researcher. 
Your job is to conduct thorough research, and then write a polished report.`;

const agent = createDeepAgent({
  systemPrompt: researchInstructions,
});
```

## Interrupt Configuration

Configure human-in-the-loop workflows for sensitive tool operations:

```typescript
const agent = createDeepAgent({
  tools: [getWeather],
  interruptOn: {
    get_weather: {
      allowedDecisions: ["approve", "edit", "reject"],
    },
  },
});
```

::: config.Settings
::: config.SettingsOptions
::: config.createSettings
::: config.findProjectRoot
::: types.CreateDeepAgentParams
