/**
 * MCP Configuration
 *
 * Configuration constants for Model Context Protocol (MCP) server
 * URLs and deep links for IDE integration.
 */

import { BASE_URL } from "@/lib/config/base-url";

/**
 * MCP Server configuration
 */
export const MCP_CONFIG = {
  /**
   * Base URL for the MCP server endpoint
   */
  serverUrl:
    process.env.NEXT_PUBLIC_MCP_URL || `${getBaseUrl()}/mcp`,

  /**
   * Generate a Cursor IDE deep link to install the MCP server
   *
   * @param serverUrl - The MCP server URL to install
   * @returns The Cursor deep link URL
   */
  cursorInstallUrl: (serverUrl: string) =>
    `cursor://mcp/install?url=${encodeURIComponent(serverUrl)}`,

  /**
   * Generate a VS Code deep link to install the MCP server
   *
   * @param serverUrl - The MCP server URL to install
   * @returns The VS Code deep link URL
   */
  vscodeInstallUrl: (serverUrl: string) =>
    `vscode://mcp/install?url=${encodeURIComponent(serverUrl)}`,
} as const;

/**
 * Get the base URL for the reference site
 */
export function getBaseUrl(): string {
  // Keep as a function to preserve the existing API surface.
  // Prefer the shared constant for consistent behavior across the app.
  return BASE_URL;
}

/**
 * Build the full MCP server URL
 */
export function getMcpServerUrl(): string {
  return MCP_CONFIG.serverUrl;
}

/**
 * Build the llms.txt URL
 */
export function getLlmsTxtUrl(): string {
  return `${getBaseUrl()}/llms.txt`;
}



