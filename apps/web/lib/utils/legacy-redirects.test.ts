import test from "node:test";
import assert from "node:assert/strict";
import {
  mapLegacyJavaScriptTypeDocPath,
  mapLegacyPythonPath,
  mapLegacyPythonV03Path,
} from "./legacy-redirects";

test("python: /python/ -> /python", () => {
  assert.deepEqual(mapLegacyPythonPath("/python/"), { pathname: "/python" });
});

test("python: underscore package + .html module page", () => {
  assert.deepEqual(mapLegacyPythonPath("/python/langchain_core/messages.html"), {
    pathname: "/python/langchain-core/messages",
  });
});

test("python: underscore package + nested .html page", () => {
  assert.deepEqual(mapLegacyPythonPath("/python/langchain_core/messages/message.html"), {
    pathname: "/python/langchain-core/messages/message",
  });
});

test("python: integrations mapping", () => {
  assert.deepEqual(
    mapLegacyPythonPath("/python/integrations/langchain_openai/ChatOpenAI/"),
    { pathname: "/python/langchain-openai/ChatOpenAI" }
  );
});

test("javascript: TypeDoc class page", () => {
  assert.deepEqual(
    mapLegacyJavaScriptTypeDocPath("/javascript/classes/_langchain_openai.ChatOpenAI.html"),
    { pathname: "/javascript/langchain-openai/ChatOpenAI" }
  );
});

test("javascript: TypeDoc interface page with module path", () => {
  assert.deepEqual(
    mapLegacyJavaScriptTypeDocPath(
      "/javascript/interfaces/_langchain_core.runnables.RunnableConfig.html"
    ),
    { pathname: "/javascript/langchain-core/runnables/RunnableConfig" }
  );
});

test("javascript: TypeDoc module page with underscored module token", () => {
  assert.deepEqual(
    mapLegacyJavaScriptTypeDocPath("/javascript/modules/_langchain_core.utils_math.html"),
    { pathname: "/javascript/langchain-core/utils/math" }
  );
});

test("javascript: TypeDoc modules index", () => {
  assert.deepEqual(mapLegacyJavaScriptTypeDocPath("/javascript/modules.html"), {
    pathname: "/javascript",
  });
});

test("v0.3: maps dot-qualified filename into new path and returns meta", () => {
  const res = mapLegacyPythonV03Path(
    "/v0.3/python/core/indexing/langchain_core.indexing.api.index.html"
  );
  assert.ok(res);
  assert.equal(res.pathname, "/python/langchain-core/indexing/api/index");
  assert.ok("meta" in res);
  if ("meta" in res) {
    assert.equal(res.meta.v03.packageName, "langchain_core");
    assert.equal(res.meta.v03.packageId, "pkg_py_langchain_core");
  }
});

