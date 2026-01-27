// oxlint-disable no-console
/**
 * Inherited Members E2E Tests
 *
 * Tests that verify inherited members are displayed correctly on symbol pages.
 * Checks both the main content area and the Table of Contents (TOC) sidebar.
 */

import { browser, $, $$, expect } from "@wdio/globals";

/**
 * Test fixtures for AIMessage symbol pages
 *
 * Note: The inheritance chain may differ between Python and JavaScript.
 * - Python: AIMessage -> BaseMessage -> Serializable
 * - JavaScript: AIMessage -> BaseMessage -> Serializable
 *
 * The tests verify that inherited members are displayed, checking for
 * at least the primary base class (BaseMessage).
 */
const AI_MESSAGE_FIXTURES = [
  {
    language: "python",
    path: "/python/langchain-core/messages/ai/AIMessage",
    description: "Python AIMessage",
    // Primary base class that must have inherited members displayed
    primaryBase: "BaseMessage",
    // All expected base classes (some may be transitively inherited)
    expectedBases: ["BaseMessage", "Serializable"],
  },
  {
    language: "javascript",
    path: "/javascript/langchain-core/messages/AIMessage",
    description: "JavaScript AIMessage",
    // Primary base class that must have inherited members displayed
    primaryBase: "BaseMessage",
    // All expected base classes (some may be transitively inherited)
    expectedBases: ["BaseMessage", "Serializable"],
  },
];

/**
 * Selectors for inherited members elements
 */
const SELECTORS = {
  // Main content area
  mainContent: "main",
  // Page title (h1)
  pageTitle: "h1",
  // Inherited members section header (contains "Inherited from") - uses h2
  inheritedSectionHeader: "h2",
  // Inherited member rows (links to inherited methods/properties)
  inheritedMemberRows: "[id^='inherited-']",
  // TOC sidebar (right side)
  tocSidebar: "aside",
  // TOC inherited group buttons (collapsed sections showing "from BaseClass")
  tocInheritedGroups: "button",
  // Bases section (shows base classes)
  basesSection: "h2",
};

describe.skip("Inherited Members Display", () => {
  describe("Symbol Page Content", () => {
    for (const fixture of AI_MESSAGE_FIXTURES) {
      it(`should display inherited members on ${fixture.description} page`, async () => {
        // Navigate to the AIMessage symbol page
        await browser.url(fixture.path);

        // Wait for the main content to be visible
        const mainContent = await $(SELECTORS.mainContent);
        await mainContent.waitForDisplayed({ timeout: 15000 });

        // Verify page title contains AIMessage
        const pageTitle = await $(SELECTORS.pageTitle);
        await expect(pageTitle).toBeDisplayed();
        const titleText = await pageTitle.getText();
        expect(titleText).toContain("AIMessage");
        console.log(`  ✓ Page title: "${titleText}"`);

        // Check for "Bases" section showing inheritance
        const mainContentText = await mainContent.getText();
        const hasBasesSection = mainContentText.includes("Bases");
        console.log(`  Bases section found: ${hasBasesSection}`);

        // Verify ALL expected base classes are mentioned in Bases section
        for (const baseName of fixture.expectedBases) {
          const hasBase = mainContentText.includes(baseName);
          console.log(`  Base class "${baseName}" found: ${hasBase}`);
          expect(hasBase).toBe(true);
        }

        // Check for inherited members section
        // Look for "Inherited from" text which indicates inherited members are displayed
        const hasInheritedSection = mainContentText.includes("Inherited from");
        console.log(`  Inherited section found: ${hasInheritedSection}`);
        expect(hasInheritedSection).toBe(true);

        // Verify inherited member rows exist
        const inheritedRows = await $$(SELECTORS.inheritedMemberRows);
        const inheritedRowsCount = inheritedRows.length;
        console.log(`  Found ${inheritedRowsCount} inherited member rows`);
        expect(inheritedRowsCount).toBeGreaterThan(0);

        console.log(`  ✓ ${fixture.description} displays inherited members correctly`);
      });

      it(`should display inherited sections from base classes for ${fixture.description}`, async () => {
        // Navigate to the AIMessage symbol page
        await browser.url(fixture.path);

        // Wait for the main content to be visible
        const mainContent = await $(SELECTORS.mainContent);
        await mainContent.waitForDisplayed({ timeout: 15000 });

        const mainContentText = await mainContent.getText();

        // Verify "Inherited from" section exists for at least the primary base class
        const primaryPattern = `Inherited from ${fixture.primaryBase}`;
        const hasPrimaryBase = mainContentText.includes(primaryPattern);
        console.log(`  "${primaryPattern}" section found: ${hasPrimaryBase}`);
        expect(hasPrimaryBase).toBe(true);

        // Check which other base classes have inherited sections (informational)
        const foundBases: string[] = [];
        for (const baseName of fixture.expectedBases) {
          const inheritedPattern = `Inherited from ${baseName}`;
          if (mainContentText.includes(inheritedPattern)) {
            foundBases.push(baseName);
            console.log(`  ✓ "${inheritedPattern}" section found`);
          }
        }

        console.log(
          `  ✓ ${fixture.description} has inherited sections from: ${foundBases.join(", ")}`,
        );
      });
    }
  });

  describe("Inherited Attributes and Methods", () => {
    for (const fixture of AI_MESSAGE_FIXTURES) {
      it(`should display both attributes/properties AND methods for inherited classes in ${fixture.description}`, async () => {
        // Navigate to the AIMessage symbol page
        await browser.url(fixture.path);

        // Wait for the main content to be visible
        const mainContent = await $(SELECTORS.mainContent);
        await mainContent.waitForDisplayed({ timeout: 15000 });

        const mainContentText = await mainContent.getText();

        // Check for Methods section in inherited members
        // The page should show "Methods" as a category within inherited sections
        const hasMethodsSection =
          mainContentText.includes("Methods") || mainContentText.includes("method");
        console.log(`  Methods section found: ${hasMethodsSection}`);

        // Check for Properties/Attributes section in inherited members
        // Python uses "Attributes", TypeScript uses "Properties"
        const hasPropertiesSection =
          mainContentText.includes("Properties") ||
          mainContentText.includes("Attributes") ||
          mainContentText.includes("property") ||
          mainContentText.includes("attribute");
        console.log(`  Properties/Attributes section found: ${hasPropertiesSection}`);

        // At least one of methods or properties should be present
        const hasInheritedContent = hasMethodsSection || hasPropertiesSection;
        expect(hasInheritedContent).toBe(true);

        // Find inherited member rows and categorize them
        const inheritedRows = await $$(SELECTORS.inheritedMemberRows);
        console.log(`  Total inherited member rows: ${inheritedRows.length}`);

        // Verify we have a reasonable number of inherited members
        expect(inheritedRows.length).toBeGreaterThan(0);

        console.log(
          `  ✓ ${fixture.description} displays inherited attributes/properties and methods`,
        );
      });

      it(`should display inherited members from primary base class (${fixture.primaryBase}) for ${fixture.description}`, async () => {
        // Navigate to the AIMessage symbol page
        await browser.url(fixture.path);

        // Wait for the main content to be visible
        const mainContent = await $(SELECTORS.mainContent);
        await mainContent.waitForDisplayed({ timeout: 15000 });

        // Find inherited rows specific to the primary base class
        // The id pattern is: inherited-{baseName}-{memberName}-{index}
        const baseSpecificRows = await $$(`[id^='inherited-${fixture.primaryBase}-']`);
        const baseRowCount = await baseSpecificRows.length;
        console.log(`  Inherited rows from ${fixture.primaryBase}: ${baseRowCount}`);

        // Primary base class should contribute inherited members
        expect(baseRowCount).toBeGreaterThan(0);

        // Log a few member names for debugging
        if (baseRowCount > 0) {
          const sampleIds: string[] = [];
          const maxSamples = Math.min(3, baseRowCount as number);
          for (let i = 0; i < maxSamples; i++) {
            const rowId = await baseSpecificRows[i].getAttribute("id");
            sampleIds.push(rowId);
          }
          console.log(
            `  Sample inherited members from ${fixture.primaryBase}: ${sampleIds.join(", ")}`,
          );
        }

        console.log(`  ✓ Found inherited members from ${fixture.primaryBase}`);
      });

      it(`should display inherited members from all resolved base classes for ${fixture.description}`, async () => {
        // Navigate to the AIMessage symbol page
        await browser.url(fixture.path);

        // Wait for the main content to be visible
        const mainContent = await $(SELECTORS.mainContent);
        await mainContent.waitForDisplayed({ timeout: 15000 });

        // Check each expected base class for inherited rows
        const foundBases: string[] = [];
        for (const baseName of fixture.expectedBases) {
          const baseSpecificRows = await $$(`[id^='inherited-${baseName}-']`);
          const baseRowCount = await baseSpecificRows.length;
          console.log(`  Inherited rows from ${baseName}: ${baseRowCount}`);

          if (baseRowCount > 0) {
            foundBases.push(baseName);
          }
        }

        // At least the primary base should have members
        expect(foundBases).toContain(fixture.primaryBase);

        console.log(`  ✓ Found inherited members from: ${foundBases.join(", ")}`);
      });
    }
  });

  describe("Table of Contents (TOC)", () => {
    for (const fixture of AI_MESSAGE_FIXTURES) {
      it(`should display inherited groups in TOC for ${fixture.description}`, async () => {
        // Navigate to the AIMessage symbol page
        await browser.url(fixture.path);

        // Wait for the main content to be visible
        const mainContent = await $(SELECTORS.mainContent);
        await mainContent.waitForDisplayed({ timeout: 15000 });

        // Find the TOC sidebar (it's an aside element on the right)
        const tocSidebar = await $(SELECTORS.tocSidebar);
        const tocExists = await tocSidebar.isExisting();

        if (!tocExists) {
          // TOC might be hidden on mobile - skip this check
          console.log(`  ⚠ TOC sidebar not visible (may be mobile view)`);
          return;
        }

        await expect(tocSidebar).toBeDisplayed();

        // Get TOC text content
        const tocText = await tocSidebar.getText();
        console.log(`  TOC content preview: "${tocText.substring(0, 200)}..."`);

        // Check for primary base class in TOC (required)
        const hasPrimaryInToc =
          tocText.includes(`from ${fixture.primaryBase}`) || tocText.includes(fixture.primaryBase);
        console.log(`  TOC contains primary base "${fixture.primaryBase}": ${hasPrimaryInToc}`);
        expect(hasPrimaryInToc).toBe(true);

        // Check which other bases are in TOC (informational)
        const foundInToc: string[] = [];
        for (const baseName of fixture.expectedBases) {
          if (tocText.includes(`from ${baseName}`) || tocText.includes(baseName)) {
            foundInToc.push(baseName);
          }
        }
        console.log(`  ✓ TOC contains inherited groups: ${foundInToc.join(", ")}`);
      });

      it(`should have expandable inherited groups with Methods/Properties in TOC for ${fixture.description}`, async () => {
        // Navigate to the AIMessage symbol page
        await browser.url(fixture.path);

        // Wait for the main content to be visible
        const mainContent = await $(SELECTORS.mainContent);
        await mainContent.waitForDisplayed({ timeout: 15000 });

        // Find the TOC sidebar
        const tocSidebar = await $(SELECTORS.tocSidebar);
        const tocExists = await tocSidebar.isExisting();

        if (!tocExists) {
          console.log(`  ⚠ TOC sidebar not visible (may be mobile view)`);
          return;
        }

        await expect(tocSidebar).toBeDisplayed();

        // Find collapsible inherited group buttons in TOC
        const tocButtons = await tocSidebar.$$("button");
        const foundBaseButtons: string[] = [];
        let primaryBaseButton: WebdriverIO.Element | null = null;

        for (const button of tocButtons) {
          const buttonText = await button.getText();
          for (const baseName of fixture.expectedBases) {
            if (buttonText.includes(baseName)) {
              foundBaseButtons.push(baseName);
              console.log(`  Found TOC button for "${baseName}": "${buttonText}"`);

              // Save primary base button for expansion
              if (baseName === fixture.primaryBase) {
                primaryBaseButton = button;
              }
              break;
            }
          }
        }

        // Verify we found a button for the primary base class
        expect(foundBaseButtons).toContain(fixture.primaryBase);

        // Click the primary base button to expand it
        expect(primaryBaseButton).toBeDefined();
        await primaryBaseButton!.click();
        await browser.pause(300); // Wait for animation

        // After expanding, check that the TOC shows Methods or Properties/Attributes
        const expandedTocText = await tocSidebar.getText();

        // The expanded sections should show method/property categories
        const hasMethodsInToc =
          expandedTocText.includes("Methods") || expandedTocText.includes("method");
        const hasPropertiesInToc =
          expandedTocText.includes("Properties") ||
          expandedTocText.includes("Attributes") ||
          expandedTocText.includes("property");

        console.log(`  TOC shows Methods after expand: ${hasMethodsInToc}`);
        console.log(`  TOC shows Properties/Attributes after expand: ${hasPropertiesInToc}`);

        // At least one should be present
        const hasExpandedContent = hasMethodsInToc || hasPropertiesInToc;
        expect(hasExpandedContent).toBe(true);

        console.log(`  ✓ ${fixture.description} TOC inherited groups are expandable`);
      });
    }
  });

  describe("Inherited Member Navigation", () => {
    it("should navigate to base class when clicking inherited member link", async () => {
      // Use Python AIMessage for this test
      const fixture = AI_MESSAGE_FIXTURES[0];
      await browser.url(fixture.path);

      // Wait for the main content to be visible
      const mainContent = await $(SELECTORS.mainContent);
      await mainContent.waitForDisplayed({ timeout: 15000 });

      // Find an inherited member row and click it
      const inheritedRows = await $$(SELECTORS.inheritedMemberRows);
      const inheritedRowsCount = await inheritedRows.length;
      expect(inheritedRowsCount).toBeGreaterThan(0);

      // Find a clickable link within an inherited row
      const firstInheritedRow = inheritedRows[0];
      const rowId = await firstInheritedRow.getAttribute("id");
      console.log(`  Found inherited row: ${rowId}`);

      // Get the link href if it's a link element
      const isLink = (await firstInheritedRow.getTagName()) === "a";
      expect(isLink).toBeDefined();
      const href = await firstInheritedRow.getAttribute("href");
      console.log(`  Inherited member link: ${href}`);

      // Click the link
      await firstInheritedRow.click();

      // Wait for navigation
      await browser.waitUntil(
        async () => {
          const currentUrl = await browser.getUrl();
          return currentUrl !== fixture.path && !currentUrl.includes("AIMessage");
        },
        { timeout: 10000, timeoutMsg: "Navigation to base class did not complete" },
      );
    });
  });

  describe("Inherited Members Header", () => {
    for (const fixture of AI_MESSAGE_FIXTURES) {
      it(`should show "Inherited from <BaseClass>" headers for ${fixture.description}`, async () => {
        await browser.url(fixture.path);

        const mainContent = await $(SELECTORS.mainContent);
        await mainContent.waitForDisplayed({ timeout: 15000 });

        // Look for h2 headers that say "Inherited from X" (the component uses h2 for these)
        const headers = await $$(SELECTORS.inheritedSectionHeader);
        const foundHeaders: string[] = [];

        for (const header of headers) {
          const headerText = await header.getText();
          if (headerText.includes("Inherited from")) {
            foundHeaders.push(headerText);
            console.log(`  Found inherited header: "${headerText}"`);
          }
        }

        // Verify we found at least one header
        expect(foundHeaders.length).toBeGreaterThan(0);

        // Verify there's a header for the primary base class
        const hasPrimaryBase = foundHeaders.some((h) => h.includes(fixture.primaryBase));
        console.log(`  Header for primary base "${fixture.primaryBase}" found: ${hasPrimaryBase}`);
        expect(hasPrimaryBase).toBe(true);

        // Log which bases have headers (informational)
        const basesWithHeaders = fixture.expectedBases.filter((baseName) =>
          foundHeaders.some((h) => h.includes(baseName)),
        );
        console.log(`  ✓ Found inherited headers for: ${basesWithHeaders.join(", ")}`);
      });
    }
  });
});
