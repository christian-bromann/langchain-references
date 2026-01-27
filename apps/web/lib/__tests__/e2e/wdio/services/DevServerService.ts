// oxlint-disable no-console
/**
 * DevServerService - Custom WebdriverIO Service
 *
 * Bootstraps the Next.js development server before running e2e tests.
 * This service starts the dev server on port 3000 and waits for it to be ready
 * before allowing tests to proceed.
 */

import { spawn, execSync, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";

const DEV_SERVER_PORT = process.env.PORT || 3000;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;
const STARTUP_TIMEOUT = 60000; // 60 seconds for Next.js to compile and start
const HEALTH_CHECK_INTERVAL = 1000; // Check every second
const MAX_OUTPUT_BUFFER_LINES = 100; // Keep last N lines of output for error reporting

export default class DevServerService {
  private serverProcess: ChildProcess | null = null;
  private outputBuffer: string[] = [];
  private errorBuffer: string[] = [];
  private serverAlreadyRunning = false;

  /**
   * Add output to a circular buffer, keeping only the last N lines.
   */
  private addToBuffer(buffer: string[], data: string): void {
    const lines = data.split("\n").filter((line) => line.trim());
    buffer.push(...lines);
    // Keep only the last N lines
    while (buffer.length > MAX_OUTPUT_BUFFER_LINES) {
      buffer.shift();
    }
  }

  /**
   * Check if the dev server is already running and healthy.
   * This prevents killing a server started by a parallel test run.
   */
  private async isServerHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${DEV_SERVER_URL}/api/prewarm`, {
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Kill any process currently using the specified port.
   * This handles cleanup from previous test runs that didn't shut down properly.
   */
  private killProcessOnPort(port: number | string): void {
    try {
      // Use lsof to find process using the port (works on macOS and Linux)
      const result = execSync(`lsof -ti:${port} 2>/dev/null || true`, {
        encoding: "utf-8",
      }).trim();

      if (result) {
        const pids = result.split("\n").filter((pid) => pid.trim());
        if (pids.length > 0) {
          console.log(
            `[DevServerService] Found existing process(es) on port ${port}: ${pids.join(", ")}`,
          );
          for (const pid of pids) {
            try {
              execSync(`kill -9 ${pid} 2>/dev/null || true`);
              console.log(`[DevServerService] Killed process ${pid}`);
            } catch {
              // Ignore errors - process may have already exited
            }
          }
          // Wait a moment for the port to be released
          execSync("sleep 1");
        }
      }
    } catch {
      // lsof may not be available on all systems, continue anyway
      console.log("[DevServerService] Could not check for existing processes on port");
    }
  }

  /**
   * Start the dev server before all workers start.
   * This runs once before any test sessions begin.
   */
  async onPrepare(): Promise<void> {
    console.log("[DevServerService] Checking if dev server is already running...");

    // First, check if a healthy dev server is already running (from parallel test run)
    if (await this.isServerHealthy()) {
      console.log(
        `[DevServerService] Dev server already running at ${DEV_SERVER_URL}, reusing existing instance`,
      );
      this.serverAlreadyRunning = true;
      return;
    }

    console.log("[DevServerService] Starting development servers (web + IR)...");

    // Kill any existing process on the port from previous runs (unhealthy/stale processes)
    this.killProcessOnPort(DEV_SERVER_PORT);
    this.killProcessOnPort(3001); // IR server port

    // Get the repo root directory (6 levels up from services folder)
    // services -> wdio -> e2e -> __tests__ -> lib -> web -> apps -> root
    const repoRoot = resolve(__dirname, "../../../../../../..");
    console.log("[DevServerService] Working directory:", repoRoot);

    // Start both web and IR servers using the root pnpm dev script
    // Use detached: true to create a new process group so we can kill the entire tree
    // Note: Don't set PORT env var - Next.js defaults to 3000, IR server defaults to 3001
    this.serverProcess = spawn("pnpm", ["dev"], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
      detached: true,
      env: {
        ...process.env,
      },
    });

    // Capture stdout - always buffer for error reporting
    this.serverProcess.stdout?.on("data", (data: Buffer) => {
      const output = data.toString();
      this.addToBuffer(this.outputBuffer, output);

      if (process.env.DEBUG) {
        console.log("[DevServer stdout]", output);
      }
    });

    // Capture stderr - always buffer for error reporting
    this.serverProcess.stderr?.on("data", (data: Buffer) => {
      const output = data.toString();
      this.addToBuffer(this.errorBuffer, output);

      if (process.env.DEBUG) {
        console.error("[DevServer stderr]", output);
      }
    });

    // Handle server process errors
    this.serverProcess.on("error", (error) => {
      console.error("[DevServerService] Failed to start dev server:", error);
    });

    this.serverProcess.on("exit", (code, signal) => {
      if (code !== 0 && code !== null) {
        console.error("[DevServerService] Dev server exited with code:", code);
        if (signal) {
          console.error("[DevServerService] Exit signal:", signal);
        }
        // Print buffered output to help diagnose the issue
        if (this.outputBuffer.length > 0) {
          console.error("[DevServerService] Last stdout output:");
          console.error(this.outputBuffer.join("\n"));
        }
        if (this.errorBuffer.length > 0) {
          console.error("[DevServerService] Last stderr output:");
          console.error(this.errorBuffer.join("\n"));
        }
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
    let lastError: Error | null = null;

    while (Date.now() - startTime < STARTUP_TIMEOUT) {
      // Check if the process has exited
      if (this.serverProcess?.exitCode !== null && this.serverProcess?.exitCode !== undefined) {
        console.error("[DevServerService] Dev server process exited during startup");
        if (this.outputBuffer.length > 0) {
          console.error("[DevServerService] stdout:", this.outputBuffer.join("\n"));
        }
        if (this.errorBuffer.length > 0) {
          console.error("[DevServerService] stderr:", this.errorBuffer.join("\n"));
        }
        throw new Error(
          `[DevServerService] Dev server exited with code ${this.serverProcess.exitCode}`,
        );
      }

      try {
        const response = await fetch(`${DEV_SERVER_URL}/api/prewarm`);
        if (response.ok) {
          return;
        }
      } catch (err) {
        lastError = err as Error;
        // Server not ready yet, continue polling
      }

      await new Promise((resolve) => setTimeout(resolve, HEALTH_CHECK_INTERVAL));
    }

    // Timeout reached - print diagnostic info
    console.error("[DevServerService] Timeout waiting for dev server");
    console.error(`[DevServerService] Last error: ${lastError?.message || "none"}`);
    if (this.outputBuffer.length > 0) {
      console.error("[DevServerService] Last stdout output:");
      console.error(this.outputBuffer.join("\n"));
    }
    if (this.errorBuffer.length > 0) {
      console.error("[DevServerService] Last stderr output:");
      console.error(this.errorBuffer.join("\n"));
    }

    throw new Error(
      `[DevServerService] Dev server failed to start within ${STARTUP_TIMEOUT / 1000}s`,
    );
  }

  /**
   * Stop the dev server after all tests complete.
   */
  async onComplete(): Promise<void> {
    // Don't kill the server if we didn't start it (reused from parallel run)
    if (this.serverAlreadyRunning) {
      console.log(
        "[DevServerService] Server was already running before tests, leaving it running for other test runs",
      );
      return;
    }

    if (this.serverProcess && this.serverProcess.pid) {
      console.log("[DevServerService] Stopping dev server...");

      const pid = this.serverProcess.pid;

      // Try to kill the entire process group (negative PID kills the group)
      try {
        // First, try graceful shutdown
        process.kill(-pid, "SIGTERM");
      } catch {
        // If process group kill fails, try killing just the process
        this.serverProcess.kill("SIGTERM");
      }

      // Give it a moment to shut down gracefully
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Force kill if still running
      if (!this.serverProcess.killed) {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          this.serverProcess.kill("SIGKILL");
        }
      }

      // Also kill any remaining processes on the port as a fallback
      this.killProcessOnPort(DEV_SERVER_PORT);

      this.serverProcess = null;
      console.log("[DevServerService] Dev server stopped");
    }
  }
}
