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
import { useLoaf } from "../../src/context";
import { ISlice } from "../../src/types/loaf";

// ISlice only declares lifecycle events; allow custom crumb handlers too
type CrumbSlice = ISlice & { [crumb: string]: unknown };

// Define custom event names
// These are strings that identify your custom events
enum CustomEvents {
  DatabaseConnect = "db:connect",
  CacheWarmup = "cache:warmup",
  ProcessData = "data:process"
}

// Define the database slice
const databaseSlice: CrumbSlice = {
  name: "database",

  // Allow these custom events to be executed
  // This tells Loaf that these event names are valid
  allow: [CustomEvents.DatabaseConnect, CustomEvents.ProcessData],

  [Loaf.Initialize]: async () => {
    console.log("[Database] Connecting to database...");

    // Trigger custom event - all slices with DatabaseConnect will execute
    await useLoaf().execute(CustomEvents.DatabaseConnect);

    console.log("[Database] Database initialized");
  },

  // Custom event handler for database connection
  [CustomEvents.DatabaseConnect]: async () => {
    console.log("  [Database] Establishing connection pool...");
  },

  // Custom event handler for data processing
  // This demonstrates passing data through the chain
  [CustomEvents.ProcessData]: async (data: string) => {
    console.log(`  [Database] Processing data: "${data}"`);
    // Transform and return data for the next slice
    return data + " -> saved to DB";
  }
};

// Define the cache slice
const cacheSlice: CrumbSlice = {
  name: "cache",

  // This slice depends on database for the DatabaseConnect event only
  dependencies: [
    {
      event: CustomEvents.DatabaseConnect,
      required: {
        before: ["database"] // database runs before cache for this event only
      }
    }
  ],

  allow: [CustomEvents.DatabaseConnect, CustomEvents.CacheWarmup, CustomEvents.ProcessData],

  [Loaf.Initialize]: async () => {
    console.log("[Cache] Initializing cache...");
  },

  // This will run AFTER database's DatabaseConnect handler
  [CustomEvents.DatabaseConnect]: async () => {
    console.log("  [Cache] Connecting to Redis...");
  },

  [Loaf.Ready]: async () => {
    console.log("[Cache] Starting cache warmup...");

    // Trigger another custom event
    await useLoaf().execute(CustomEvents.CacheWarmup);

    console.log("[Cache] Cache is ready");
  },

  [CustomEvents.CacheWarmup]: async () => {
    console.log("  [Cache] Warming up cache with hot data...");
  },

  // Add caching layer to data processing
  [CustomEvents.ProcessData]: async (data: string) => {
    console.log(`  [Cache] Caching data: "${data}"`);
    return data + " -> cached";
  }
};

// Define the API slice
const apiSlice: CrumbSlice = {
  name: "api",

  // Depends on both database and cache
  dependencies: ["database", "cache"],

  allow: [CustomEvents.ProcessData],

  [Loaf.Initialize]: async () => {
    console.log("[API] Setting up API routes...");
  },

  [Loaf.Ready]: async () => {
    console.log("[API] API server ready");

    // Simulate processing some data through multiple slices
    console.log("\n[API] Simulating data processing chain...");

    // Execute the ProcessData event. The DatabaseConnect constraint does not
    // apply here, so this chain uses the default order: cache -> database -> api
    const result = await useLoaf().execute<string>(CustomEvents.ProcessData, "user-request-123");

    console.log(`[API] Final result: "${result}"\n`);
  },

  // Final handler in the chain
  [CustomEvents.ProcessData]: async (data: string) => {
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
 * [Cache] Initializing cache...
 * [Database] Connecting to database...
 *   [Database] Establishing connection pool...
 *   [Cache] Connecting to Redis...
 * [Database] Database initialized
 * [API] Setting up API routes...
 * [Cache] Starting cache warmup...
 *   [Cache] Warming up cache with hot data...
 * [Cache] Cache is ready
 * [API] API server ready
 *
 * [API] Simulating data processing chain...
 *   [Cache] Caching data: "user-request-123"
 *   [Database] Processing data: "user-request-123 -> cached"
 *   [API] Sending response: "user-request-123 -> cached -> saved to DB"
 * [API] Final result: "user-request-123 -> cached -> saved to DB -> sent to client"
 *
 * === Example complete ===
 *
 * Key Takeaways:
 * 1. Custom events flow through slices in dependency order
 * 2. Data can be transformed as it flows through the chain
 * 3. Event-specific dependencies give fine-grained control: cache runs after
 *    database for DatabaseConnect only, while other events keep the default order
 * 4. execute() returns the final value from the event chain
 */
