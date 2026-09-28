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

  // Lifecycle handlers take no arguments and their return values are
  // ignored. Use useLoaf()/useSlice() if you need the loaf or slice.

  // Load event runs first - used for loading dependencies
  [Loaf.Load]: async () => {
    console.log("[Database] Loading database drivers...");
  },

  // Initialize event - setup connections
  [Loaf.Initialize]: async () => {
    console.log("[Database] Connecting to database...");
    // Simulate async connection
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log("[Database] Connected successfully");
  },

  // Ready event - application is ready to use this slice
  [Loaf.Ready]: async () => {
    console.log("[Database] Database ready for queries");
  },

  // Shutdown event - cleanup resources
  [Loaf.Shutdown]: async () => {
    console.log("[Database] Closing database connections...");
    // Simulate async cleanup
    await new Promise(resolve => setTimeout(resolve, 300));
    console.log("[Database] All connections closed");
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

  [Loaf.Load]: async () => {
    console.log("[Cache] Loading cache modules...");
  },

  [Loaf.Initialize]: async () => {
    console.log("[Cache] Connecting to Redis...");
    await new Promise(resolve => setTimeout(resolve, 300));
    console.log("[Cache] Redis connected");
  },

  [Loaf.Ready]: async () => {
    console.log("[Cache] Cache is ready");
  },

  [Loaf.Shutdown]: async () => {
    console.log("[Cache] Flushing cache...");
    await new Promise(resolve => setTimeout(resolve, 200));
    console.log("[Cache] Disconnecting from Redis...");
    await new Promise(resolve => setTimeout(resolve, 200));
    console.log("[Cache] Cache shutdown complete");
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

  [Loaf.Load]: async () => {
    console.log("[Server] Loading HTTP server...");
  },

  [Loaf.Initialize]: async () => {
    console.log("[Server] Starting HTTP server on port 3000...");
    await new Promise(resolve => setTimeout(resolve, 400));
    console.log("[Server] Server started");
  },

  [Loaf.Ready]: async () => {
    console.log("[Server] Server is accepting connections");
    console.log("[Server] Application fully ready! 🎉");
  },

  [Loaf.Shutdown]: async () => {
    console.log("[Server] Stopping new connections...");
    await new Promise(resolve => setTimeout(resolve, 200));
    console.log("[Server] Draining existing connections...");
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log("[Server] Server shutdown complete");
  }
};

/**
 * Error Handler Slice
 *
 * Demonstrates error handling in lifecycle events
 */
const errorHandlerSlice: ISlice = {
  name: "errorHandler",

  [Loaf.Initialize]: async () => {
    console.log("[ErrorHandler] Setting up error handlers...");
  },

  // Handle uncaught errors. UncaughtError handlers receive just the error.
  [Loaf.UncaughtError]: async (error: Error) => {
    console.error("[ErrorHandler] ⚠️  Uncaught error:", error.message);
    // Log to error tracking service, send alerts, etc.
  },

  // Handle unhandled promise rejections. Loaf does not listen for
  // "unhandledRejection" itself - forward it with
  // process.on("unhandledRejection", (reason) => loaf.execute(Loaf.UnhandledRejection, reason))
  // UnhandledRejection handlers receive just the reason.
  [Loaf.UnhandledRejection]: async (reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error("[ErrorHandler] ⚠️  Unhandled rejection:", message);
    // Log to error tracking service, send alerts, etc.
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
 * [Server] Loading HTTP server...
 * [Cache] Loading cache modules...
 * [Database] Loading database drivers...
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
