import { describe, it, expect } from "vitest";
import {
  mapLegacyJavaScriptTypeDocPath,
  mapLegacyPythonPath,
  mapLegacyPythonV03Path,
} from "./legacy-redirects";

describe("mapLegacyPythonPath", () => {
  it("python: /python/ -> /python", () => {
    expect(mapLegacyPythonPath("/python/")).toEqual({ pathname: "/python" });
  });

  it("python: underscore package + .html module page", () => {
    expect(mapLegacyPythonPath("/python/langchain_core/messages.html")).toEqual({
      pathname: "/python/langchain-core/messages",
    });
  });

  it("python: underscore package + nested .html page", () => {
    expect(mapLegacyPythonPath("/python/langchain_core/messages/message.html")).toEqual({
      pathname: "/python/langchain-core/messages/message",
    });
  });

  it("python: integrations mapping", () => {
    expect(mapLegacyPythonPath("/python/integrations/langchain_openai/ChatOpenAI/")).toEqual({
      pathname: "/python/langchain-openai/ChatOpenAI",
    });
  });
});

describe("mapLegacyJavaScriptTypeDocPath", () => {
  it("javascript: TypeDoc class page", () => {
    expect(
      mapLegacyJavaScriptTypeDocPath("/javascript/classes/_langchain_openai.ChatOpenAI.html"),
    ).toEqual({ pathname: "/javascript/langchain-openai/ChatOpenAI" });
  });

  it("javascript: TypeDoc interface page with module path", () => {
    expect(
      mapLegacyJavaScriptTypeDocPath(
        "/javascript/interfaces/_langchain_core.runnables.RunnableConfig.html",
      ),
    ).toEqual({ pathname: "/javascript/langchain-core/runnables/RunnableConfig" });
  });

  it("javascript: TypeDoc module page with underscored module token", () => {
    expect(
      mapLegacyJavaScriptTypeDocPath("/javascript/modules/_langchain_core.utils_math.html"),
    ).toEqual({ pathname: "/javascript/langchain-core/utils/math" });
  });

  it("javascript: TypeDoc modules index", () => {
    expect(mapLegacyJavaScriptTypeDocPath("/javascript/modules.html")).toEqual({
      pathname: "/javascript",
    });
  });
});

describe("mapLegacyPythonV03Path", () => {
  it("v0.3: maps dot-qualified filename into new path and returns meta", () => {
    const res = mapLegacyPythonV03Path(
      "/v0.3/python/core/indexing/langchain_core.indexing.api.index.html",
    );
    expect(res).toBeTruthy();
    expect(res?.pathname).toBe("/python/langchain-core/indexing/api/index");
    expect(res).toHaveProperty("meta");
    if (res && "meta" in res) {
      expect(res.meta.v03.packageName).toBe("langchain_core");
      expect(res.meta.v03.packageId).toBe("pkg_py_langchain_core");
    }
  });
});
