// oxlint-disable no-console
/**
 * WebdriverIO Configuration
 *
 * E2E testing configuration for symbol resolution verification.
 * Uses headless Chrome to navigate pages and verify content rendering.
 */

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
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const screenshotPath = `./screenshots/${test.title}-${timestamp}.png`;
      try {
        await browser.saveScreenshot(screenshotPath);
        console.log(`Screenshot saved: ${screenshotPath}`);
      } catch (e) {
        console.log("Failed to save screenshot:", e);
      }
    }
  },
};
