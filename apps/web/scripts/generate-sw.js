/**
 * Generate Service Worker with build-time version
 *
 * This script reads the SW template and injects a build timestamp
 * to ensure cache invalidation on each deploy.
 */

const fs = require("fs");
const path = require("path");

const swTemplatePath = path.join(__dirname, "../public/sw.template.js");
const swOutputPath = path.join(__dirname, "../public/sw.js");

// Generate a version based on build time
const buildVersion = `v${Date.now()}`;

// Read template
let swContent = fs.readFileSync(swTemplatePath, "utf8");

// Replace the version placeholder
swContent = swContent.replace(
  /const CACHE_VERSION = "[^"]+";/,
  `const CACHE_VERSION = "${buildVersion}";`,
);

// Add build timestamp comment
const header = `/**
 * Auto-generated Service Worker
 * Build: ${new Date().toISOString()}
 * Version: ${buildVersion}
 */

`;

swContent = swContent.replace(/^\/\*\*\s*\n \* Service Worker/, `${header}/**\n * Service Worker`);

// Write output
fs.writeFileSync(swOutputPath, swContent);

console.log(`✓ Generated sw.js with version ${buildVersion}`);
