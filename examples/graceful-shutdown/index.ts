/**
 * Graceful Shutdown Example
 *
 * This example demonstrates:
 * - All lifecycle events (Load, Initialize, Ready, Shutdown)
 * - Signal handling (SIGTERM, SIGINT)
 * - Proper resource cleanup
 * - Error handling in lifecycle events
 * - Simulating long-running processes
 */

import Loaf from "../../src/loaf";
import { ISlice } from "../../src/types/loaf";

/**
 * Database Connection Slice
 *
 * Simulates a database connection that needs proper cleanup
 */
const databaseSlice: ISlice = {
  name: "database",

  // Load event runs first - used for loading dependencies
  [Loaf.Load]: async (loaf: Loaf, slice: ISlice) => {
    console.log("[Database] Loading database drivers...");
  },

  // Initialize event - setup connections
  [Loaf.Initialize]: async (loaf: Loaf, slice: ISlice) => {
    console.log("[Database] Connecting to database...");
    // Simulate async connection
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log("[Database] Connected successfully");
    return loaf;
  },

  // Ready event - application is ready to use this slice
  [Loaf.Ready]: async (loaf: Loaf, slice: ISlice) => {
    console.log("[Database] Database ready for queries");
    return loaf;
  },

  // Shutdown event - cleanup resources
  [Loaf.Shutdown]: async (loaf: Loaf, slice: ISlice) => {
    console.log("[Database] Closing database connections...");
    // Simulate async cleanup
    await new Promise(resolve => setTimeout(resolve, 300));
    console.log("[Database] All connections closed");
    return loaf;
  }
};

/**
 * Cache Slice
 *
 * Simulates a cache service with cleanup requirements
 */
const cacheSlice: ISlice = {
  name: "cache",
  dependencies: ["database"], // Cache needs database to be ready

  [Loaf.Load]: async (loaf: Loaf, slice: ISlice) => {
    console.log("[Cache] Loading cache modules...");
  },

  [Loaf.Initialize]: async (loaf: Loaf, slice: ISlice) => {
    console.log("[Cache] Connecting to Redis...");
    await new Promise(resolve => setTimeout(resolve, 300));
    console.log("[Cache] Redis connected");
    return loaf;
  },

  [Loaf.Ready]: async (loaf: Loaf, slice: ISlice) => {
    console.log("[Cache] Cache is ready");
    return loaf;
  },

  [Loaf.Shutdown]: async (loaf: Loaf, slice: ISlice) => {
    console.log("[Cache] Flushing cache...");
    await new Promise(resolve => setTimeout(resolve, 200));
    console.log("[Cache] Disconnecting from Redis...");
    await new Promise(resolve => setTimeout(resolve, 200));
    console.log("[Cache] Cache shutdown complete");
    return loaf;
  }
};

/**
 * HTTP Server Slice
 *
 * Simulates an HTTP server that needs graceful shutdown
 */
const serverSlice: ISlice = {
  name: "server",
  dependencies: ["database", "cache"],

  [Loaf.Load]: async (loaf: Loaf, slice: ISlice) => {
    console.log("[Server] Loading HTTP server...");
  },

  [Loaf.Initialize]: async (loaf: Loaf, slice: ISlice) => {
    console.log("[Server] Starting HTTP server on port 3000...");
    await new Promise(resolve => setTimeout(resolve, 400));
    console.log("[Server] Server started");
    return loaf;
  },

  [Loaf.Ready]: async (loaf: Loaf, slice: ISlice) => {
    console.log("[Server] Server is accepting connections");
    console.log("[Server] Application fully ready! 🎉");
    return loaf;
  },

  [Loaf.Shutdown]: async (loaf: Loaf, slice: ISlice) => {
    console.log("[Server] Stopping new connections...");
    await new Promise(resolve => setTimeout(resolve, 200));
    console.log("[Server] Draining existing connections...");
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log("[Server] Server shutdown complete");
    return loaf;
  }
};

/**
 * Error Handler Slice
 *
 * Demonstrates error handling in lifecycle events
 */
const errorHandlerSlice: ISlice = {
  name: "errorHandler",

  [Loaf.Initialize]: async (loaf: Loaf, slice: ISlice) => {
    console.log("[ErrorHandler] Setting up error handlers...");
    return loaf;
  },

  // Handle uncaught errors
  [Loaf.UncaughtError]: async (loaf: Loaf, error: Error, slice: ISlice) => {
    console.error("[ErrorHandler] ⚠️  Uncaught error:", error.message);
    // Log to error tracking service, send alerts, etc.
    return loaf;
  },

  // Handle unhandled promise rejections
  [Loaf.UnhandledRejection]: async (loaf: Loaf, error: Error, slice: ISlice) => {
    console.error("[ErrorHandler] ⚠️  Unhandled rejection:", error.message);
    // Log to error tracking service, send alerts, etc.
    return loaf;
  }
};

// Main execution
async function main() {
  console.log("=== Starting Graceful Shutdown Example ===\n");

  const loaf = new Loaf({
    name: "graceful-shutdown-app",
    slices: [
      errorHandlerSlice,
      serverSlice,
      cacheSlice,
      databaseSlice
    ],
    devMode: false
  });

  // Setup signal handlers for graceful shutdown
  let isShuttingDown = false;

  const handleShutdown = async (signal: string) => {
    if (isShuttingDown) {
      console.log("\n⚠️  Forced shutdown requested, exiting immediately...");
      process.exit(1);
    }

    isShuttingDown = true;
    console.log(`\n\n🛑 Received ${signal}, starting graceful shutdown...\n`);

    try {
      await loaf.shutdown();
      console.log("\n✅ Graceful shutdown complete");
      process.exit(0);
    } catch (error) {
      console.error("\n❌ Error during shutdown:", error);
      process.exit(1);
    }
  };

  // Listen for termination signals
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
  process.on("SIGINT", () => handleShutdown("SIGINT"));

  // Start the application
  await loaf.start();

  console.log("\n" + "=".repeat(50));
  console.log("📡 Application is running...");
  console.log("   Press Ctrl+C to trigger graceful shutdown");
  console.log("=".repeat(50) + "\n");

  // Simulate the app running
  // In a real app, this would be your main event loop, server, etc.
  await new Promise(resolve => {
    const interval = setInterval(() => {
      if (isShuttingDown) {
        clearInterval(interval);
        resolve(undefined);
      }
    }, 1000);
  });
}

main().catch(console.error);

/**
 * Expected Output (on startup):
 *
 * === Starting Graceful Shutdown Example ===
 *
 * [Database] Loading database drivers...
 * [Cache] Loading cache modules...
 * [Server] Loading HTTP server...
 * [ErrorHandler] Setting up error handlers...
 * [Database] Connecting to database...
 * [Database] Connected successfully
 * [Cache] Connecting to Redis...
 * [Cache] Redis connected
 * [Server] Starting HTTP server on port 3000...
 * [Server] Server started
 * [Database] Database ready for queries
 * [Cache] Cache is ready
 * [Server] Server is accepting connections
 * [Server] Application fully ready! 🎉
 *
 * ==================================================
 * 📡 Application is running...
 *    Press Ctrl+C to trigger graceful shutdown
 * ==================================================
 *
 * Expected Output (after Ctrl+C):
 *
 * 🛑 Received SIGINT, starting graceful shutdown...
 *
 * [Server] Stopping new connections...
 * [Server] Draining existing connections...
 * [Server] Server shutdown complete
 * [Cache] Flushing cache...
 * [Cache] Disconnecting from Redis...
 * [Cache] Cache shutdown complete
 * [Database] Closing database connections...
 * [Database] All connections closed
 *
 * ✅ Graceful shutdown complete
 *
 * Key Takeaways:
 * 1. Lifecycle flows: Load → Initialize → Ready → Shutdown
 * 2. Dependencies control the order of execution
 * 3. Shutdown runs in REVERSE dependency order (server → cache → database)
 * 4. Always cleanup resources in Shutdown event
 * 5. Signal handlers enable graceful shutdown on SIGTERM/SIGINT
 * 6. Error handlers can catch and log uncaught exceptions
 * 7. Second Ctrl+C forces immediate exit (safety mechanism)
 */
