# Tracing & OpenTelemetry

LangSmith Go supports OpenTelemetry for distributed tracing. This allows you to automatically capture and send traces from your LLM applications.

## Tracer

The tracer provides OpenTelemetry integration for sending spans to LangSmith.

::: langsmith.Tracer
  options:
    show_if_no_docstring: true

## Configuration

Configure tracing using environment variables:

| Variable             | Description                                                         |
| -------------------- | ------------------------------------------------------------------- |
| `LANGSMITH_API_KEY`  | Your LangSmith API key                                              |
| `LANGSMITH_ENDPOINT` | Custom API endpoint (defaults to `https://api.smith.langchain.com`) |
| `LANGSMITH_PROJECT`  | Project name for traces                                             |

## Usage Examples

### Basic OpenTelemetry Setup

```go
import (
    "github.com/langchain-ai/langsmith-go"
    "go.opentelemetry.io/otel"
)

// Create a new tracer
tracer := langsmith.NewTracer()

// Use with OpenTelemetry
ctx, span := otel.Tracer("my-app").Start(ctx, "operation")
defer span.End()
```

### With OpenAI

See the [otel_openai example](https://github.com/langchain-ai/langsmith-go/tree/main/examples/otel_openai) for automatic tracing of OpenAI API calls.

### With Anthropic

See the [otel_anthropic example](https://github.com/langchain-ai/langsmith-go/tree/main/examples/otel_anthropic) for automatic tracing of Anthropic API calls.
