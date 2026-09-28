/**
 * Error Handling Example
 *
 * This example demonstrates:
 * - UncaughtError handlers running when a lifecycle handler throws
 * - start() rejecting with the original error (Initialize and Ready both rethrow)
 * - Cleaning up with shutdown() after a failed start
 * - Wiring UnhandledRejection manually (Loaf does not register it for you)
 * - Using useSlice() to get the current slice from inside a handler
 */

import Loaf from "../../src/loaf";
import { useSlice } from "../../src/context";
import { ISlice } from "../../src/types/loaf";

const errorReporter: ISlice = {
  name: "error-reporter",

  // UncaughtError handlers receive just the error; lifecycle return values
  // are ignored. useSlice() returns the current slice from inside a handler.
  [Loaf.UncaughtError]: async (error: Error) => {
    console.log(`[ErrorReporter] reporting: ${error.message}`);
    console.log(`[ErrorReporter] current slice via useSlice(): ${useSlice().name}`);
  },

  // UnhandledRejection handlers receive just the reason.
  [Loaf.UnhandledRejection]: async (reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    console.log(`[ErrorReporter] unhandled rejection: ${message}`);
  },
};

const database: ISlice = {
  name: "database",
  [Loaf.Initialize]: async () => {
    console.log("[Database] connected");
  },
  [Loaf.Shutdown]: async () => {
    console.log("[Database] disconnected");
  },
};

const httpServer: ISlice = {
  name: "http-server",
  dependencies: ["database"],
  [Loaf.Ready]: async () => {
    throw new Error("port 3000 is already in use");
  },
};

async function main() {
  console.log("=== Error Handling Example ===\n");

  const loaf = new Loaf({
    name: "error-handling-app",
    slices: [errorReporter, database, httpServer],
  });

  // Loaf never listens for unhandled rejections itself - forward them explicitly.
  const onRejection = (reason: unknown) => {
    loaf.execute(Loaf.UnhandledRejection, reason);
  };
  process.on("unhandledRejection", onRejection);

  try {
    await loaf.start();
  } catch (error: any) {
    // The UncaughtError chain has already run; the original error is rethrown.
    console.log(`\n[main] start() failed: ${error.message}`);
    console.log("[main] shutting down what was started...");
  } finally {
    await loaf.shutdown();
    process.off("unhandledRejection", onRejection);
  }

  console.log("\n=== Example Complete ===");
}

main().catch(console.error);

/**
 * Expected Output:
 *
 * === Error Handling Example ===
 *
 * [Database] connected
 * [ErrorReporter] reporting: port 3000 is already in use [at loaf:rdy(http-server)]
 * [ErrorReporter] current slice via useSlice(): error-reporter
 *
 * [main] start() failed: port 3000 is already in use [at loaf:rdy(http-server)]
 * [main] shutting down what was started...
 * [Database] disconnected
 *
 * === Example Complete ===
 */
