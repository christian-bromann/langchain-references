// oxlint-disable no-console
/**
 * Signature Block Linking E2E Tests
 *
 * Tests that verify type references in signature blocks are properly linked.
 * Checks that:
 * - Built-in types (str, list, int, Any) link to Python docs
 * - Local symbols (ContextSize, TokenCounter) link to the current package
 * - Cross-project symbols (BaseChatModel) link to other packages
 * - Function references in default values (count_tokens_approximately) are linked
 * - Parameter names (before :) are NOT linked
 */

import { browser, $, $$, expect } from "@wdio/globals";

/**
 * Test fixture for SummarizationMiddleware signature
 */
const TEST_PAGE = {
  path: "/python/langchain/agents/middleware/summarization/SummarizationMiddleware",
  description: "SummarizationMiddleware signature",
};

/**
 * Expected links in the signature block
 */
const EXPECTED_LINKS = {
  // Built-in types should link to Python docs
  builtins: [
    { name: "str", hrefPattern: /docs\.python\.org/ },
    { name: "list", hrefPattern: /docs\.python\.org/ },
    { name: "int", hrefPattern: /docs\.python\.org/ },
    { name: "Any", hrefPattern: /docs\.python\.org/ },
  ],
  // Local and cross-project symbols should link to reference pages
  symbols: [
    { name: "BaseChatModel", hrefPattern: /\/python\/langchain-core\// },
    { name: "ContextSize", hrefPattern: /\/python\/langchain\// },
    { name: "TokenCounter", hrefPattern: /\/python\/langchain\// },
    { name: "count_tokens_approximately", hrefPattern: /\/python\// },
    { name: "DEFAULT_SUMMARY_PROMPT", hrefPattern: /\/python\// },
  ],
};

/**
 * Parameter names that should NOT be linked
 */
const PARAMETER_NAMES = [
  "model",
  "trigger",
  "keep",
  "token_counter",
  "summary_prompt",
  "trim_tokens_to_summarize",
];

/**
 * Selectors for signature block elements
 */
const SELECTORS = {
  // Main content area
  mainContent: "main",
  // Signature code block (pre element with shiki classes)
  signatureBlock: "pre.shiki code",
  // Links within the signature block
  signatureLinks: "pre.shiki code a",
};

describe("Signature Block Linking", () => {
  beforeEach(async () => {
    // Navigate to the test page
    await browser.url(TEST_PAGE.path);

    // Wait for the main content to be visible
    const mainContent = await $(SELECTORS.mainContent);
    await mainContent.waitForDisplayed({ timeout: 15000 });
  });

  it("should display the signature block", async () => {
    const signatureBlock = await $(SELECTORS.signatureBlock);
    await expect(signatureBlock).toBeDisplayed();

    const signatureText = await signatureBlock.getText();
    expect(signatureText).toContain("SummarizationMiddleware");
    console.log("  ✓ Signature block is displayed");
  });

  describe("Built-in type links", () => {
    for (const builtin of EXPECTED_LINKS.builtins) {
      it(`should link "${builtin.name}" to Python docs`, async () => {
        const links = await $$(SELECTORS.signatureLinks);

        let found = false;
        for (const link of links) {
          const text = await link.getText();
          if (text === builtin.name) {
            const href = await link.getAttribute("href");
            expect(href).toMatch(builtin.hrefPattern);
            // Should be an external link (target="_blank")
            const target = await link.getAttribute("target");
            expect(target).toBe("_blank");
            console.log(`  ✓ "${builtin.name}" links to ${href}`);
            found = true;
            break;
          }
        }

        expect(found).toBe(true);
      });
    }
  });

  describe("Symbol links", () => {
    for (const symbol of EXPECTED_LINKS.symbols) {
      it(`should link "${symbol.name}" to reference page`, async () => {
        const links = await $$(SELECTORS.signatureLinks);

        let found = false;
        for (const link of links) {
          const text = await link.getText();
          if (text === symbol.name) {
            const href = await link.getAttribute("href");
            expect(href).toMatch(symbol.hrefPattern);
            // Should be an internal link (no target="_blank")
            const target = await link.getAttribute("target");
            expect(target).not.toBe("_blank");
            console.log(`  ✓ "${symbol.name}" links to ${href}`);
            found = true;
            break;
          }
        }

        expect(found).toBe(true);
      });
    }
  });

  describe("Parameter names should NOT be linked", () => {
    for (const paramName of PARAMETER_NAMES) {
      it(`should NOT link parameter name "${paramName}"`, async () => {
        const links = await $$(SELECTORS.signatureLinks);

        let isLinked = false;
        for (const link of links) {
          const text = await link.getText();
          if (text === paramName) {
            isLinked = true;
            const href = await link.getAttribute("href");
            console.log(`  ✗ "${paramName}" is incorrectly linked to ${href}`);
            break;
          }
        }

        expect(isLinked).toBe(false);
        if (!isLinked) {
          console.log(`  ✓ "${paramName}" is correctly NOT linked`);
        }
      });
    }
  });

  it("should have the correct number of links in signature", async () => {
    const links = await $$(SELECTORS.signatureLinks);
    const linkCount = links.length;

    // Log all links for debugging
    console.log(`  Total links in signature: ${linkCount}`);
    for (const link of links) {
      const text = await link.getText();
      const href = await link.getAttribute("href");
      console.log(`    - "${text}" -> ${href}`);
    }

    // We expect at least the builtins + symbols
    const expectedMinLinks = EXPECTED_LINKS.builtins.length + EXPECTED_LINKS.symbols.length;
    expect(linkCount).toBeGreaterThanOrEqual(expectedMinLinks);
  });
});
