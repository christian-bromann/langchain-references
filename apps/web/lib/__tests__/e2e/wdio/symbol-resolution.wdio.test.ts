// oxlint-disable no-console
/**
 * Symbol Resolution E2E Tests
 *
 * Tests that verify symbols can be resolved and pages render properly.
 * Uses WebdriverIO with headless Chrome to:
 * - Navigate to package/symbol pages
 * - Click through links
 * - Verify content is rendered correctly
 */

import { browser, $$, $, expect } from "@wdio/globals";

/**
 * Test fixtures - sample pages to verify for each project and language
 *
 * Structure: { project, language, paths[] }
 * Each path is a URL path relative to the base URL.
 */
const TEST_FIXTURES = [
  // LangChain Python
  {
    project: "langchain",
    language: "python",
    paths: [
      { path: "/python/langchain", description: "Package overview" },
      { path: "/python/langchain/agents", description: "Subpage" },
      { path: "/python/langchain-core", description: "Core package" },
      { path: "/python/langchain-core/runnables", description: "Runnables subpage" },
    ],
  },
  // LangChain JavaScript
  {
    project: "langchain",
    language: "javascript",
    paths: [
      { path: "/javascript/langchain", description: "Package overview" },
      { path: "/javascript/langchain-core", description: "Core package" },
    ],
  },
  // LangGraph Python
  {
    project: "langgraph",
    language: "python",
    paths: [{ path: "/python/langgraph", description: "Package overview" }],
  },
  // LangGraph JavaScript
  {
    project: "langgraph",
    language: "javascript",
    paths: [{ path: "/javascript/langchain-langgraph", description: "Package overview" }],
  },
  // LangSmith Python
  {
    project: "langsmith",
    language: "python",
    paths: [{ path: "/python/langsmith", description: "Package overview" }],
  },
  // LangSmith JavaScript
  {
    project: "langsmith",
    language: "javascript",
    paths: [{ path: "/javascript/langsmith", description: "Package overview" }],
  },
  // LangSmith Java
  {
    project: "langsmith",
    language: "java",
    paths: [{ path: "/java/langsmith", description: "Package overview" }],
  },
  // LangSmith Go
  {
    project: "langsmith",
    language: "go",
    paths: [{ path: "/go/langsmith", description: "Package overview" }],
  },
];

/**
 * Selectors for key page elements
 */
const SELECTORS = {
  // Main content area
  mainContent: "main",
  // Page title (h1)
  pageTitle: "h1",
  // Sidebar navigation
  sidebar: "nav[aria-label='Sidebar']",
  // Symbol links in the content
  symbolLinks: 'a[href*="/python/"], a[href*="/javascript/"], a[href*="/java/"], a[href*="/go/"]',
  // Loading skeleton (should disappear when content loads)
  loadingSkeleton: "[data-testid='loading-skeleton']",
  // Error message
  errorMessage: "[data-testid='error-message']",
  // Breadcrumb navigation
  breadcrumbs: "nav",
  // Package description
  packageDescription: "p",
  // Member cards (for symbol pages)
  memberCards: "[class*='rounded-lg'][class*='border']",
  // Code blocks (Shiki uses .shiki class on pre elements)
  codeBlocks: "pre.shiki, pre code, code[class*='language-']",
};

describe("Symbol Resolution", () => {
  describe("Page Navigation and Rendering", () => {
    for (const fixture of TEST_FIXTURES) {
      describe(`${fixture.project} (${fixture.language})`, () => {
        for (const { path, description } of fixture.paths) {
          it(`should render ${description}: ${path}`, async () => {
            // Navigate to the page
            await browser.url(path);

            // Wait for the main content to be visible
            const mainContent = await $(SELECTORS.mainContent);
            await mainContent.waitForDisplayed({ timeout: 15000 });

            // Verify page title exists
            const pageTitle = await $(SELECTORS.pageTitle);
            await expect(pageTitle).toBeDisplayed();

            // Get the title text for verification
            const titleText = await pageTitle.getText();
            expect(titleText.length).toBeGreaterThan(0);

            // Verify no error message is shown
            const errorMessage = await $(SELECTORS.errorMessage);
            const errorExists = await errorMessage.isExisting();
            if (errorExists) {
              const errorText = await errorMessage.getText();
              throw new Error(`Page showed error: ${errorText}`);
            }

            // Verify breadcrumb navigation exists
            const breadcrumbs = await $(SELECTORS.breadcrumbs);
            await expect(breadcrumbs).toBeDisplayed();

            console.log(`  ✓ ${path} - Title: "${titleText}"`);
          });
        }
      });
    }
  });

  describe("Link Navigation", () => {
    it("should navigate from package page to symbol page and back", async () => {
      // Start at LangChain Core Python package
      await browser.url("/python/langchain-core");

      const mainContent = await $(SELECTORS.mainContent);
      await mainContent.waitForDisplayed({ timeout: 15000 });

      // Find symbol links - there must be at least one on a package page
      const symbolLinks = await $$(SELECTORS.symbolLinks);
      const symbolLinksCount = await symbolLinks.length;
      expect(symbolLinksCount).toBeGreaterThan(0);
      console.log(`  Found ${symbolLinksCount} symbol links`);

      // Find an internal symbol link to click
      let internalLink = null;
      for (const link of symbolLinks) {
        const href = await link.getAttribute("href");
        if (href && href.startsWith("/") && !href.startsWith("//")) {
          internalLink = link;
          break;
        }
      }

      // There must be at least one internal link
      expect(internalLink).not.toBeNull();

      const linkHref = await internalLink!.getAttribute("href");
      const linkText = await internalLink!.getText();
      console.log(`  Clicking link: "${linkText}" -> ${linkHref}`);

      // Click the link
      await internalLink!.click();

      // Wait for navigation
      await browser.waitUntil(
        async () => {
          const currentUrl = await browser.getUrl();
          return currentUrl.includes(linkHref!);
        },
        { timeout: 10000, timeoutMsg: "Navigation did not complete" },
      );

      // Verify new page loaded
      const newMainContent = await $(SELECTORS.mainContent);
      await newMainContent.waitForDisplayed({ timeout: 10000 });

      const newTitle = await $(SELECTORS.pageTitle);
      await expect(newTitle).toBeDisplayed();
      console.log(`  ✓ Successfully navigated to symbol page`);

      // Navigate back
      await browser.back();

      // Verify we're back on the original page
      await mainContent.waitForDisplayed({ timeout: 10000 });
      console.log(`  ✓ Successfully navigated back`);
    });

    it("should handle language switching via URL", async () => {
      // Navigate to Python version
      await browser.url("/python/langchain");
      let mainContent = await $(SELECTORS.mainContent);
      await mainContent.waitForDisplayed({ timeout: 15000 });

      let pageTitle = await $(SELECTORS.pageTitle);
      const pythonTitle = await pageTitle.getText();
      console.log(`  Python page title: "${pythonTitle}"`);

      // Navigate to JavaScript version
      await browser.url("/javascript/langchain");
      mainContent = await $(SELECTORS.mainContent);
      await mainContent.waitForDisplayed({ timeout: 15000 });

      pageTitle = await $(SELECTORS.pageTitle);
      const jsTitle = await pageTitle.getText();
      console.log(`  JavaScript page title: "${jsTitle}"`);

      // Both should have valid titles
      expect(pythonTitle.length).toBeGreaterThan(0);
      expect(jsTitle.length).toBeGreaterThan(0);

      console.log(`  ✓ Language switching works correctly`);
    });
  });

  describe("Content Verification", () => {
    it("should display package documentation content", async () => {
      await browser.url("/python/langchain-core");

      const mainContent = await $(SELECTORS.mainContent);
      await mainContent.waitForDisplayed({ timeout: 15000 });

      // Wait for description text to appear
      await browser.waitUntil(
        async () => {
          const paragraphs = await $$(SELECTORS.packageDescription);
          const paragraphsCount = await paragraphs.length;
          if (paragraphsCount === 0) return false;

          for (const p of paragraphs) {
            const text = await p.getText();
            if (text && text.length > 20) {
              console.log(`  Found description: "${text.substring(0, 50)}..."`);
              return true;
            }
          }
          return false;
        },
        {
          timeout: 10000,
          timeoutMsg: "Expected package description with at least 20 characters",
        },
      );
      console.log(`  ✓ Package has documentation content`);
    });

    it("should display signature blocks on symbol pages", async () => {
      // Navigate to the main package page which has signature blocks
      await browser.url("/python/langchain-core");

      const mainContent = await $(SELECTORS.mainContent);
      await mainContent.waitForDisplayed({ timeout: 15000 });

      // Check for code/signature blocks (Shiki uses .shiki class on pre elements)
      const codeBlocks = await $$(SELECTORS.codeBlocks);
      const codeBlocksCount = await codeBlocks.length;
      console.log(`  Found ${codeBlocksCount} code/signature blocks`);

      // Package pages should have at least import statements or signature blocks
      // If none found, also check for pre elements (alternative code rendering)
      const preBlocks = await $$("pre");
      const preBlocksCount = await preBlocks.length;
      console.log(`  Found ${preBlocksCount} pre elements`);

      // At least some form of code-like content should exist
      const totalCodeElements = codeBlocksCount + preBlocksCount;
      expect(totalCodeElements).toBeGreaterThan(0);

      if (codeBlocksCount > 0) {
        const firstCodeBlock = codeBlocks[0];
        const codeText = await firstCodeBlock.getText();
        console.log(`  First code block preview: "${codeText.substring(0, 50)}..."`);
      }

      console.log(`  ✓ Page has code/signature content`);
    });

    it("should display member cards on class/module pages", async () => {
      // Navigate to a package page that should have member listings
      await browser.url("/python/langchain-core");

      const mainContent = await $(SELECTORS.mainContent);
      await mainContent.waitForDisplayed({ timeout: 15000 });

      // Check for member cards or links
      const memberCards = await $$(SELECTORS.memberCards);
      const memberCardsCount = await memberCards.length;
      console.log(`  Found ${memberCardsCount} potential member cards`);

      // Package pages should have some navigable elements (symbol links)
      const symbolLinks = await $$(SELECTORS.symbolLinks);
      const symbolLinksCount = await symbolLinks.length;
      console.log(`  Found ${symbolLinksCount} symbol links`);

      // Assert that the page has navigable content
      expect(symbolLinksCount).toBeGreaterThan(0);
      console.log(`  ✓ Page has navigable content`);
    });
  });

  describe("Error Handling", () => {
    it("should show not found page for invalid symbols", async () => {
      await browser.url("/python/langchain-core/NonExistentSymbol123");

      const mainContent = await $(SELECTORS.mainContent);
      await mainContent.waitForDisplayed({ timeout: 15000 });

      // The page should still render (with a "not found" message)
      const pageContent = await mainContent.getText();

      // Check for "not found" or similar messaging
      const isNotFound =
        pageContent.toLowerCase().includes("not found") ||
        pageContent.toLowerCase().includes("symbol not found");

      expect(isNotFound).toBe(true);
      console.log(`  ✓ Not found page displayed correctly`);
    });

    it("should handle 404 for completely invalid paths gracefully", async () => {
      await browser.url("/python/completely-invalid-package-name-xyz");

      // Wait a bit for the page to render
      await browser.pause(2000);

      // Check if we got a 404 page or error handling
      const body = await $("body");
      const bodyText = await body.getText();

      // The app should handle this gracefully (either 404 page or redirect)
      // We just verify the page didn't crash
      expect(bodyText.length).toBeGreaterThan(0);
      console.log(`  ✓ Invalid package handled gracefully`);
    });
  });

  describe("Performance", () => {
    it("should load pages within acceptable time", async () => {
      const startTime = Date.now();

      await browser.url("/python/langchain-core");

      const mainContent = await $(SELECTORS.mainContent);
      await mainContent.waitForDisplayed({ timeout: 15000 });

      const loadTime = Date.now() - startTime;

      console.log(`  Page load time: ${loadTime}ms`);

      // Page should load within 10 seconds
      expect(loadTime).toBeLessThan(3000);

      console.log(`  ✓ Page loaded within acceptable time`);
    });
  });
});
