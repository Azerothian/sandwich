/**
 * Basic App Example
 *
 * This example demonstrates:
 * - Creating a Loaf instance with Jam config
 * - Defining inline slices with dependencies
 * - Using core lifecycle events (Initialize, Ready)
 * - Basic execution flow
 */

import Loaf from "../../src/loaf";
import { ISlice } from "../../src/types/loaf";

// Define a simple logger slice
// This will execute first because greeter depends on it
const loggerSlice: ISlice = {
  name: "logger",

  // Lifecycle handlers take no arguments and their return values are
  // ignored. Use useLoaf()/useSlice() if you need the loaf or slice.
  [Loaf.Initialize]: async () => {
    console.log("[Logger] Initializing logging system...");
  },

  // Ready runs after all slices are initialized
  [Loaf.Ready]: async () => {
    console.log("[Logger] Logger is ready!");
  },

  // Shutdown runs during cleanup
  [Loaf.Shutdown]: async () => {
    console.log("[Logger] Shutting down logger...");
  }
};

// Define a greeter slice that depends on the logger
// This will execute after logger because of the dependency
const greeterSlice: ISlice = {
  name: "greeter",

  // Declare that this slice depends on logger
  // This means greeter's events will run AFTER logger's events
  dependencies: ["logger"],

  [Loaf.Initialize]: async () => {
    console.log("[Greeter] Initializing greeter...");
  },

  [Loaf.Ready]: async () => {
    console.log("[Greeter] Hello from the Sandwich framework!");
    console.log("[Greeter] Greeter is ready!");
  },

  [Loaf.Shutdown]: async () => {
    console.log("[Greeter] Goodbye!");
  }
};

// Main execution
async function main() {
  console.log("=== Starting Basic App Example ===\n");

  // Create a Loaf instance with Jam configuration
  const loaf = new Loaf({
    name: "basic-app",
    slices: [
      // Order doesn't matter here - dependencies control execution order
      greeterSlice,
      loggerSlice
    ],
    // Enable dev mode for detailed logging
    devMode: true
  });

  // start() is a convenience method that calls:
  // 1. load() - loads and prepares all slices
  // 2. initialize() - runs Initialize event
  // 3. ready() - runs Ready event
  await loaf.start();

  console.log("\n=== App is running ===\n");

  // Simulate some work
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log("\n=== Shutting down ===\n");

  // Cleanup and run shutdown handlers
  await loaf.shutdown();

  console.log("\n=== Example complete ===");
}

// Run the example
main().catch(console.error);

/**
 * Expected Output:
 *
 * === Starting Basic App Example ===
 *
 * [Logger] Initializing logging system...
 * [Greeter] Initializing greeter...
 * [Logger] Logger is ready!
 * [Greeter] Hello from the Sandwich framework!
 * [Greeter] Greeter is ready!
 *
 * === App is running ===
 *
 *
 * === Shutting down ===
 *
 * [Logger] Shutting down logger...
 * [Greeter] Goodbye!
 *
 * === Example complete ===
 */
