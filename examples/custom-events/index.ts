/**
 * Custom Events Example
 *
 * This example demonstrates:
 * - Creating custom crumb events
 * - Multiple slices handling the same custom event
 * - Event-specific dependencies
 * - Using execute() to trigger custom events
 * - Passing and returning values through event chains
 */

import Loaf from "../../src/loaf";
import { ISlice } from "../../src/types/loaf";

// Define custom event names
// These are strings that identify your custom events
enum CustomEvents {
  DatabaseConnect = "db:connect",
  CacheWarmup = "cache:warmup",
  ProcessData = "data:process"
}

// Define the database slice
const databaseSlice: ISlice = {
  name: "database",

  // Allow these custom events to be executed
  // This tells Loaf that these event names are valid
  allow: [CustomEvents.DatabaseConnect, CustomEvents.ProcessData],

  [Loaf.Initialize]: async (loaf: Loaf) => {
    console.log("[Database] Connecting to database...");

    // Trigger custom event - all slices with DatabaseConnect will execute
    await loaf.execute(CustomEvents.DatabaseConnect, loaf);

    console.log("[Database] Database initialized");
    return loaf;
  },

  // Custom event handler for database connection
  [CustomEvents.DatabaseConnect]: async (loaf: Loaf) => {
    console.log("  [Database] Establishing connection pool...");
    return loaf;
  },

  // Custom event handler for data processing
  // This demonstrates passing data through the chain
  [CustomEvents.ProcessData]: async (data: string, loaf: Loaf) => {
    console.log(`  [Database] Processing data: "${data}"`);
    // Transform and return data for the next slice
    return data + " -> saved to DB";
  }
};

// Define the cache slice
const cacheSlice: ISlice = {
  name: "cache",

  // This slice depends on database for the DatabaseConnect event only
  dependencies: [
    {
      event: CustomEvents.DatabaseConnect,
      required: {
        after: ["database"] // Run after database for this specific event
      }
    }
  ],

  allow: [CustomEvents.DatabaseConnect, CustomEvents.CacheWarmup, CustomEvents.ProcessData],

  [Loaf.Initialize]: async (loaf: Loaf) => {
    console.log("[Cache] Initializing cache...");
    return loaf;
  },

  // This will run AFTER database's DatabaseConnect handler
  [CustomEvents.DatabaseConnect]: async (loaf: Loaf) => {
    console.log("  [Cache] Connecting to Redis...");
    return loaf;
  },

  [Loaf.Ready]: async (loaf: Loaf) => {
    console.log("[Cache] Starting cache warmup...");

    // Trigger another custom event
    await loaf.execute(CustomEvents.CacheWarmup, loaf);

    console.log("[Cache] Cache is ready");
    return loaf;
  },

  [CustomEvents.CacheWarmup]: async (loaf: Loaf) => {
    console.log("  [Cache] Warming up cache with hot data...");
    return loaf;
  },

  // Add caching layer to data processing
  [CustomEvents.ProcessData]: async (data: string, loaf: Loaf) => {
    console.log(`  [Cache] Caching data: "${data}"`);
    return data + " -> cached";
  }
};

// Define the API slice
const apiSlice: ISlice = {
  name: "api",

  // Depends on both database and cache
  dependencies: ["database", "cache"],

  allow: [CustomEvents.ProcessData],

  [Loaf.Initialize]: async (loaf: Loaf) => {
    console.log("[API] Setting up API routes...");
    return loaf;
  },

  [Loaf.Ready]: async (loaf: Loaf) => {
    console.log("[API] API server ready");

    // Simulate processing some data through multiple slices
    console.log("\n[API] Simulating data processing chain...");

    // Execute the ProcessData event - it will flow through database -> cache -> api
    const result = await loaf.execute(CustomEvents.ProcessData, "user-request-123", loaf);

    console.log(`[API] Final result: "${result}"\n`);

    return loaf;
  },

  // Final handler in the chain
  [CustomEvents.ProcessData]: async (data: string, loaf: Loaf) => {
    console.log(`  [API] Sending response: "${data}"`);
    return data + " -> sent to client";
  }
};

// Main execution
async function main() {
  console.log("=== Starting Custom Events Example ===\n");

  const loaf = new Loaf({
    name: "custom-events-app",
    slices: [
      apiSlice,
      cacheSlice,
      databaseSlice
    ],
    // Register custom event names
    crumbNames: Object.values(CustomEvents),
    devMode: false // Disable for cleaner output
  });

  await loaf.start();

  console.log("=== Example complete ===");
}

main().catch(console.error);

/**
 * Expected Output:
 *
 * === Starting Custom Events Example ===
 *
 * [Database] Connecting to database...
 *   [Database] Establishing connection pool...
 *   [Cache] Connecting to Redis...
 * [Database] Database initialized
 * [Cache] Initializing cache...
 * [API] Setting up API routes...
 * [Cache] Starting cache warmup...
 *   [Cache] Warming up cache with hot data...
 * [Cache] Cache is ready
 * [API] API server ready
 *
 * [API] Simulating data processing chain...
 *   [Database] Processing data: "user-request-123"
 *   [Cache] Caching data: "user-request-123 -> saved to DB"
 *   [API] Sending response: "user-request-123 -> saved to DB -> cached"
 * [API] Final result: "user-request-123 -> saved to DB -> cached -> sent to client"
 *
 * === Example complete ===
 *
 * Key Takeaways:
 * 1. Custom events flow through slices in dependency order
 * 2. Data can be transformed as it flows through the chain
 * 3. Event-specific dependencies give fine-grained control
 * 4. execute() returns the final value from the event chain
 */
