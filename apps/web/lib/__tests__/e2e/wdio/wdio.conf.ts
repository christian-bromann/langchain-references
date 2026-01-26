// oxlint-disable no-console
/**
 * WebdriverIO Configuration
 *
 * E2E testing configuration for symbol resolution verification.
 * Uses headless Chrome to navigate pages and verify content rendering.
 */

import fs from "node:fs/promises";
import path from "node:path";

import DevServerService from "./services/DevServerService.js";

const isCI = !!process.env.CI;

export const config: WebdriverIO.Config = {
  // Runner Configuration
  runner: "local",

  // Test Files
  specs: ["./**/*.wdio.test.ts"],

  // Exclude patterns
  exclude: [],

  // Capabilities - Headless Chrome
  maxInstances: isCI ? 1 : 3,
  capabilities: [
    {
      browserName: "chrome",
      "goog:chromeOptions": {
        args: [
          "--headless=new",
          "--disable-gpu",
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--window-size=1920,1080",
        ],
      },
    },
  ],

  // Test Configuration
  logLevel: "warn",
  bail: 0,
  baseUrl: process.env.BASE_URL || "http://localhost:3000",
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  // Custom Service to bootstrap dev server
  services: [[DevServerService, {}]],

  // Framework
  framework: "mocha",
  mochaOpts: {
    ui: "bdd",
    timeout: 60000,
  },

  // Reporters
  reporters: ["spec"],

  // Hooks
  beforeSession: async function () {
    // Any setup needed before each test session
  },

  afterTest: async function (test, _context, { passed }) {
    // Take screenshot on test failure for debugging
    if (!passed) {
      // Ensure screenshots directory exists
      const screenshotsDir = "./screenshots";
      try {
        await fs.mkdir(screenshotsDir, { recursive: true });
      } catch {
        // Directory may already exist
      }

      // Sanitize test title for filename (remove invalid characters)
      const sanitizedTitle = test.title.replace(/[^a-zA-Z0-9-_]/g, "_").substring(0, 100);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const screenshotPath = path.join(screenshotsDir, `${sanitizedTitle}-${timestamp}.png`);

      try {
        await browser.saveScreenshot(screenshotPath);
        console.log(`Screenshot saved: ${screenshotPath}`);
      } catch (e) {
        console.log("Failed to save screenshot:", e);
      }
    }
  },
};
