#!/usr/bin/env node
/**
 * Performance Results Checker
 *
 * This script checks the vitest performance test results and fails CI
 * if any thresholds are exceeded.
 *
 * Usage: node scripts/check-perf-results.js
 */

const fs = require("fs");
const path = require("path");

// Performance thresholds (in milliseconds)
const THRESHOLDS = {
  // CPU-bound operations
  "knownSymbols building": 10,
  "findBaseSymbol performance": 1,
  "member grouping performance": 5,
  "slugifySymbolPath performance": 10,

  // Cached data access
  getTypeUrlMap: 5,
  getCrossProjectPackages: 10,

  // Combined operations
  "combined routing map operations": 50,
};

// Path to performance results JSON
const RESULTS_PATH = path.join(__dirname, "../lib/__tests__/performance/perf-results.json");

function main() {
  console.log("🔍 Checking performance test results...\n");

  // Check if results file exists
  if (!fs.existsSync(RESULTS_PATH)) {
    console.log("⚠️  No performance results file found at:", RESULTS_PATH);
    console.log("   This is expected if perf tests haven't been run yet.");
    process.exit(0);
  }

  let results;
  try {
    results = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf-8"));
  } catch (error) {
    console.error("❌ Failed to parse performance results:", error.message);
    process.exit(1);
  }

  let failed = false;
  const violations = [];

  // Check each test suite
  if (results.testResults) {
    for (const testFile of results.testResults) {
      for (const test of testFile.assertionResults || []) {
        // Skip passed tests
        if (test.status === "passed") continue;

        // Check if this is a threshold violation
        const testName = test.fullName || test.title;
        for (const [pattern, threshold] of Object.entries(THRESHOLDS)) {
          if (testName.toLowerCase().includes(pattern.toLowerCase())) {
            violations.push({
              test: testName,
              threshold: `${threshold}ms`,
              status: test.status,
            });
            failed = true;
          }
        }
      }
    }
  }

  // Report results
  if (violations.length > 0) {
    console.log("❌ Performance threshold violations detected:\n");
    for (const v of violations) {
      console.log(`   ⚠️  ${v.test}`);
      console.log(`      Threshold: ${v.threshold}`);
      console.log(`      Status: ${v.status}\n`);
    }
  } else {
    console.log("✅ All performance tests passed within thresholds.\n");
  }

  // Print summary
  console.log("📊 Performance Test Summary:");
  console.log(`   Total test files: ${results.numTotalTestSuites || 0}`);
  console.log(`   Total tests: ${results.numTotalTests || 0}`);
  console.log(`   Passed: ${results.numPassedTests || 0}`);
  console.log(`   Failed: ${results.numFailedTests || 0}`);

  if (failed) {
    console.log("\n❌ Performance checks failed. Please optimize the flagged functions.");
    process.exit(1);
  }

  console.log("\n✅ Performance checks passed!");
  process.exit(0);
}

main();
