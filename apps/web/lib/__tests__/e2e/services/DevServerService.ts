/**
 * DevServerService - Custom WebdriverIO Service
 *
 * Bootstraps the Next.js development server before running e2e tests.
 * This service starts the dev server on port 3000 and waits for it to be ready
 * before allowing tests to proceed.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";

const DEV_SERVER_PORT = process.env.PORT || 3000;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;
const STARTUP_TIMEOUT = 60000; // 60 seconds for Next.js to compile and start
const HEALTH_CHECK_INTERVAL = 1000; // Check every second

export default class DevServerService {
  private serverProcess: ChildProcess | null = null;
  private isServerReady = false;

  /**
   * Start the dev server before all workers start.
   * This runs once before any test sessions begin.
   */
  async onPrepare(): Promise<void> {
    console.log("[DevServerService] Starting Next.js development server...");

    // Get the web app directory (apps/web)
    const webAppDir = resolve(__dirname, "../../../..");

    // Start the Next.js dev server
    this.serverProcess = spawn("npm", ["run", "dev"], {
      cwd: webAppDir,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
      env: {
        ...process.env,
        PORT: String(DEV_SERVER_PORT),
      },
    });

    // Capture stdout for debugging
    this.serverProcess.stdout?.on("data", (data: Buffer) => {
      const output = data.toString();
      if (output.includes("Ready") || output.includes("started server")) {
        this.isServerReady = true;
      }
      if (process.env.DEBUG) {
        console.log("[DevServer stdout]", output);
      }
    });

    // Capture stderr for debugging
    this.serverProcess.stderr?.on("data", (data: Buffer) => {
      if (process.env.DEBUG) {
        console.error("[DevServer stderr]", data.toString());
      }
    });

    // Handle server process errors
    this.serverProcess.on("error", (error) => {
      console.error("[DevServerService] Failed to start dev server:", error);
    });

    this.serverProcess.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        console.error("[DevServerService] Dev server exited with code:", code);
      }
    });

    // Wait for server to be ready
    await this.waitForServer();

    console.log(`[DevServerService] Dev server ready at ${DEV_SERVER_URL}`);
  }

  /**
   * Wait for the dev server to be ready by polling the health endpoint.
   */
  private async waitForServer(): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < STARTUP_TIMEOUT) {
      try {
        const response = await fetch(`${DEV_SERVER_URL}/api/prewarm`);
        if (response.ok) {
          return;
        }
      } catch {
        // Server not ready yet, continue polling
      }

      await new Promise((resolve) => setTimeout(resolve, HEALTH_CHECK_INTERVAL));
    }

    throw new Error(
      `[DevServerService] Dev server failed to start within ${STARTUP_TIMEOUT / 1000}s`,
    );
  }

  /**
   * Stop the dev server after all tests complete.
   */
  async onComplete(): Promise<void> {
    if (this.serverProcess) {
      console.log("[DevServerService] Stopping dev server...");

      // Kill the process and all its children
      this.serverProcess.kill("SIGTERM");

      // Give it a moment to shut down gracefully
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Force kill if still running
      if (!this.serverProcess.killed) {
        this.serverProcess.kill("SIGKILL");
      }

      this.serverProcess = null;
      console.log("[DevServerService] Dev server stopped");
    }
  }
}
