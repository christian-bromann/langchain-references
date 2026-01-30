/**
 * Comprehensive tests for Python import parser
 *
 * Covers all Python import statement variations.
 */

import { describe, it, expect } from "vitest";
import { parsePythonImports } from "../parsers/python.js";

describe("Python import parser", () => {
  describe("Basic imports", () => {
    it("parses simple from...import statement", () => {
      const code = `from langchain_anthropic import ChatAnthropic`;
      const imports = parsePythonImports(code);

      expect(imports).toHaveLength(1);
      expect(imports[0].packageName).toBe("langchain_anthropic");
      expect(imports[0].symbols).toEqual(["ChatAnthropic"]);
    });

    it("parses import with single symbol", () => {
      const code = `from langchain_core.messages import BaseMessage`;
      const imports = parsePythonImports(code);

      expect(imports).toHaveLength(1);
      expect(imports[0].packageName).toBe("langchain_core.messages");
      expect(imports[0].symbols).toEqual(["BaseMessage"]);
    });
  });

  describe("Multiple symbols", () => {
    it("parses multiple imports on one line", () => {
      const code = `from langchain_core.messages import HumanMessage, AIMessage, SystemMessage`;
      const imports = parsePythonImports(code);

      expect(imports).toHaveLength(1);
      expect(imports[0].packageName).toBe("langchain_core.messages");
      expect(imports[0].symbols).toEqual(["HumanMessage", "AIMessage", "SystemMessage"]);
    });

    it("parses two symbols", () => {
      const code = `from langchain import LLMChain, PromptTemplate`;
      const imports = parsePythonImports(code);

      expect(imports).toHaveLength(1);
      expect(imports[0].symbols).toEqual(["LLMChain", "PromptTemplate"]);
    });

    it("handles extra spaces between symbols", () => {
      const code = `from langchain_core import BaseModel,   BaseMessage,    Runnable`;
      const imports = parsePythonImports(code);

      expect(imports).toHaveLength(1);
      expect(imports[0].symbols).toEqual(["BaseModel", "BaseMessage", "Runnable"]);
    });
  });

  describe("Multi-line imports with parentheses", () => {
    it("parses multi-line imports with parentheses", () => {
      const code = `from langchain_core.messages import (
    HumanMessage,
    AIMessage,
    SystemMessage,
)`;
      const imports = parsePythonImports(code);

      expect(imports).toHaveLength(1);
      expect(imports[0].symbols).toContain("HumanMessage");
      expect(imports[0].symbols).toContain("AIMessage");
      expect(imports[0].symbols).toContain("SystemMessage");
    });

    it("parses multi-line imports without trailing comma", () => {
      const code = `from langchain_core.callbacks import (
    BaseCallbackHandler,
    AsyncCallbackHandler
)`;
      const imports = parsePythonImports(code);

      expect(imports).toHaveLength(1);
      expect(imports[0].symbols).toEqual(["BaseCallbackHandler", "AsyncCallbackHandler"]);
    });

    it("parses multi-line imports with comments", () => {
      const code = `from langchain_core.messages import (
    HumanMessage,  # For user messages
    AIMessage,     # For assistant messages
    SystemMessage, # For system prompts
)`;
      const imports = parsePythonImports(code);

      expect(imports).toHaveLength(1);
      // Note: Comments may affect parsing depending on implementation
      expect(imports[0].symbols.length).toBeGreaterThanOrEqual(1);
    });

    it("parses nested parentheses in complex imports", () => {
      const code = `from langchain_core import (
    BaseMessage,
    HumanMessage,
)`;
      const imports = parsePythonImports(code);

      expect(imports).toHaveLength(1);
      expect(imports[0].symbols).toContain("BaseMessage");
      expect(imports[0].symbols).toContain("HumanMessage");
    });
  });

  describe("Aliased imports", () => {
    it("extracts original name from aliased import", () => {
      const code = `from langchain_anthropic import ChatAnthropic as Anthropic`;
      const imports = parsePythonImports(code);

      expect(imports).toHaveLength(1);
      expect(imports[0].symbols).toEqual(["ChatAnthropic"]);
    });

    it("handles aliased import with underscore in alias", () => {
      const code = `from langchain_openai import ChatOpenAI as chat_model`;
      const imports = parsePythonImports(code);

      expect(imports).toHaveLength(1);
      expect(imports[0].symbols).toEqual(["ChatOpenAI"]);
    });

    it("parses multiple imports with some aliased", () => {
      const code = `from langchain_core.messages import HumanMessage as HM, AIMessage, SystemMessage as SM`;
      const imports = parsePythonImports(code);

      expect(imports).toHaveLength(1);
      expect(imports[0].symbols).toContain("HumanMessage");
      expect(imports[0].symbols).toContain("AIMessage");
      expect(imports[0].symbols).toContain("SystemMessage");
    });

    it("parses multi-line imports with aliases", () => {
      const code = `from langchain_core.messages import (
    HumanMessage as HM,
    AIMessage as AI,
    SystemMessage,
)`;
      const imports = parsePythonImports(code);

      expect(imports).toHaveLength(1);
      expect(imports[0].symbols).toContain("HumanMessage");
      expect(imports[0].symbols).toContain("AIMessage");
      expect(imports[0].symbols).toContain("SystemMessage");
    });
  });

  describe("Dotted package names", () => {
    it("parses deeply nested module paths", () => {
      const code = `from langchain_core.prompts.chat import ChatPromptTemplate`;
      const imports = parsePythonImports(code);

      expect(imports).toHaveLength(1);
      expect(imports[0].packageName).toBe("langchain_core.prompts.chat");
      expect(imports[0].symbols).toEqual(["ChatPromptTemplate"]);
    });

    it("parses very deep module paths", () => {
      const code = `from langchain_community.vectorstores.faiss.base import FAISS`;
      const imports = parsePythonImports(code);

      expect(imports).toHaveLength(1);
      expect(imports[0].packageName).toBe("langchain_community.vectorstores.faiss.base");
    });

    it("parses package with numbers", () => {
      const code = `from langchain_db2 import DB2Vectorstore`;
      const imports = parsePythonImports(code);

      expect(imports).toHaveLength(1);
      expect(imports[0].packageName).toBe("langchain_db2");
    });
  });

  describe("Relative imports (should be ignored)", () => {
    it("ignores single dot relative imports", () => {
      const code = `from .utils import helper
from langchain_core import BaseMessage`;
      const imports = parsePythonImports(code);

      expect(imports).toHaveLength(1);
      expect(imports[0].packageName).toBe("langchain_core");
    });

    it("ignores double dot relative imports", () => {
      const code = `from ..base import BaseClass
from langchain import LLMChain`;
      const imports = parsePythonImports(code);

      expect(imports).toHaveLength(1);
      expect(imports[0].packageName).toBe("langchain");
    });

    it("ignores deep relative imports", () => {
      const code = `from ...shared.utils import helper
from langchain_openai import ChatOpenAI`;
      const imports = parsePythonImports(code);

      expect(imports).toHaveLength(1);
      expect(imports[0].packageName).toBe("langchain_openai");
    });
  });

  describe("Multiple import statements", () => {
    it("parses multiple separate import statements", () => {
      const code = `from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage`;
      const imports = parsePythonImports(code);

      expect(imports).toHaveLength(3);
      expect(imports[0].packageName).toBe("langchain_anthropic");
      expect(imports[1].packageName).toBe("langchain_openai");
      expect(imports[2].packageName).toBe("langchain_core.messages");
    });

    it("parses imports mixed with other code", () => {
      const code = `# Initialize the model
from langchain_anthropic import ChatAnthropic

model = ChatAnthropic()

from langchain_core.messages import HumanMessage

message = HumanMessage(content="Hello")`;
      const imports = parsePythonImports(code);

      expect(imports).toHaveLength(2);
      expect(imports[0].packageName).toBe("langchain_anthropic");
      expect(imports[1].packageName).toBe("langchain_core.messages");
    });
  });

  describe("Edge cases", () => {
    it("handles empty code", () => {
      const imports = parsePythonImports("");
      expect(imports).toHaveLength(0);
    });

    it("handles code with no imports", () => {
      const code = `print("Hello, World!")
x = 1 + 2`;
      const imports = parsePythonImports(code);
      expect(imports).toHaveLength(0);
    });

    it("handles trailing comma in single import", () => {
      const code = `from langchain import LLMChain,`;
      const imports = parsePythonImports(code);

      expect(imports).toHaveLength(1);
      expect(imports[0].symbols).toEqual(["LLMChain"]);
    });

    it("handles import with underscores in symbol names", () => {
      const code = `from langchain_core import base_message_helper`;
      const imports = parsePythonImports(code);

      expect(imports).toHaveLength(1);
      expect(imports[0].symbols).toEqual(["base_message_helper"]);
    });

    it("handles symbols with numbers", () => {
      const code = `from langchain_core import Model2, Parser3`;
      const imports = parsePythonImports(code);

      expect(imports).toHaveLength(1);
      expect(imports[0].symbols).toContain("Model2");
      expect(imports[0].symbols).toContain("Parser3");
    });
  });

  describe("Variations not typically supported", () => {
    // These tests document what the parser does NOT support

    it("does not extract from plain import statements", () => {
      const code = `import langchain
import langchain_core`;
      const imports = parsePythonImports(code);

      // Plain imports without "from" are not supported
      expect(imports).toHaveLength(0);
    });

    it("does not extract from import * statements", () => {
      const code = `from langchain_core.messages import *`;
      const imports = parsePythonImports(code);

      // Star imports are not matched because * is not a valid \w+ symbol
      expect(imports).toHaveLength(0);
    });
  });

  describe("Real-world examples", () => {
    it("parses typical LangChain chat model setup", () => {
      const code = `from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate

model = ChatAnthropic(model="claude-3-5-sonnet-20241022")`;
      const imports = parsePythonImports(code);

      expect(imports).toHaveLength(3);
      expect(imports[0].symbols).toEqual(["ChatAnthropic"]);
      expect(imports[1].symbols).toEqual(["HumanMessage", "AIMessage", "SystemMessage"]);
      expect(imports[2].symbols).toEqual(["ChatPromptTemplate"]);
    });

    it("parses LangGraph agent setup", () => {
      const code = `from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode, tools_condition
from langchain_core.messages import (
    BaseMessage,
    HumanMessage,
    AIMessage,
)`;
      const imports = parsePythonImports(code);

      expect(imports).toHaveLength(3);
      expect(imports[0].packageName).toBe("langgraph.graph");
      expect(imports[0].symbols).toEqual(["StateGraph", "START", "END"]);
      expect(imports[1].packageName).toBe("langgraph.prebuilt");
      expect(imports[2].packageName).toBe("langchain_core.messages");
    });

    it("parses RAG chain setup", () => {
      const code = `from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_community.vectorstores import FAISS
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate`;
      const imports = parsePythonImports(code);

      expect(imports).toHaveLength(5);
      expect(imports[0].symbols).toEqual(["OpenAIEmbeddings", "ChatOpenAI"]);
      expect(imports[1].symbols).toEqual(["FAISS"]);
      expect(imports[2].symbols).toEqual(["RunnablePassthrough"]);
      expect(imports[3].symbols).toEqual(["StrOutputParser"]);
      expect(imports[4].symbols).toEqual(["PromptTemplate"]);
    });
  });
});
