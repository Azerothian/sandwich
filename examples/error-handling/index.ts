/**
 * Error Handling Example
 *
 * This example demonstrates:
 * - UncaughtError handlers running when a lifecycle handler throws
 * - start() rejecting with the original error (Initialize and Ready both rethrow)
 * - Cleaning up with shutdown() after a failed start
 * - Wiring UnhandledRejection manually (Loaf does not register it for you)
 */

import Loaf from "../../src/loaf";
import { ISlice } from "../../src/types/loaf";

const errorReporter: ISlice = {
  name: "error-reporter",

  // Receives the loaf, the error and (last) this slice.
  // Like every chained handler it must return the loaf for the next handler.
  [Loaf.UncaughtError]: async (loaf: Loaf, error: Error) => {
    console.log(`[ErrorReporter] reporting: ${error.message}`);
    return loaf;
  },

  [Loaf.UnhandledRejection]: async (loaf: Loaf, error: Error) => {
    console.log(`[ErrorReporter] unhandled rejection: ${error.message}`);
    return loaf;
  },
};

const database: ISlice = {
  name: "database",
  [Loaf.Initialize]: async (loaf: Loaf) => {
    console.log("[Database] connected");
    return loaf;
  },
  [Loaf.Shutdown]: async (loaf: Loaf) => {
    console.log("[Database] disconnected");
    return loaf;
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
    loaf.execute(Loaf.UnhandledRejection, loaf, reason);
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
 * [ErrorReporter] reporting: port 3000 is already in use
 *
 * [main] start() failed: port 3000 is already in use
 * [main] shutting down what was started...
 * [Database] disconnected
 *
 * === Example Complete ===
 */
