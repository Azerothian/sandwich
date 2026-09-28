/**
 * Module Loading Example
 *
 * This example demonstrates the ways a slice can be supplied to a Loaf:
 * - Relative file paths, resolved against jam.cwd
 * - Absolute file paths
 * - Classes (instantiated with no arguments)
 * - buildSlice(loaf) factories
 * - Inline objects, and `clone: true` to keep shared objects isolated
 */

import path from "path";
import { fileURLToPath } from "url";
import Loaf from "../../src/loaf";
import { ISlice } from "../../src/types/loaf";

const here = path.dirname(fileURLToPath(import.meta.url));

// An inline object shared between two loaves
const counter: ISlice & { count: number } = {
  name: "counter",
  count: 0,
  [Loaf.Initialize]: async function (this: { count: number }) {
    this.count++;
  },
};

async function main() {
  console.log("=== Module Loading Example ===\n");

  const loaf = new Loaf({
    name: "module-loading-app",
    cwd: here,
    slices: [
      "./object-slice.ts",                       // relative to cwd
      path.join(here, "class-slice.ts"),         // absolute path
      "./factory-slice.ts",                      // buildSlice factory
    ],
  });
  await loaf.start();
  console.log("\nLoaded slices:", Object.keys(loaf.slices).join(", "));
  console.log("factory-slice appName:", loaf.get<{ appName: string }>("factory-slice").appName);
  await loaf.shutdown();

  console.log("\n--- clone ---");
  // Without clone, both loaves mutate the same `counter` object.
  const shared1 = new Loaf({ name: "shared-1", slices: [counter] });
  const shared2 = new Loaf({ name: "shared-2", slices: [counter] });
  await shared1.start();
  await shared2.start();
  console.log("without clone, counter.count =", counter.count);
  await shared1.shutdown();
  await shared2.shutdown();

  // With clone, each loaf gets its own shallow copy.
  counter.count = 0;
  const cloned1 = new Loaf({ name: "cloned-1", slices: [counter], clone: true });
  const cloned2 = new Loaf({ name: "cloned-2", slices: [counter], clone: true });
  await cloned1.start();
  await cloned2.start();
  console.log("with clone,    counter.count =", counter.count,
    `(copies: ${cloned1.get<typeof counter>("counter").count}, ${cloned2.get<typeof counter>("counter").count})`);
  await cloned1.shutdown();
  await cloned2.shutdown();

  console.log("\n=== Example Complete ===");
}

main().catch(console.error);

/**
 * Expected Output:
 *
 * === Module Loading Example ===
 *
 *   [object-slice] initialized (loaded from a file path)
 *   [class-slice] initialized (class instantiated by Loaf)
 *   [factory-slice] initialized (built for "module-loading-app")
 *
 * Loaded slices: object-slice, class-slice, factory-slice
 * factory-slice appName: module-loading-app
 *
 * --- clone ---
 * without clone, counter.count = 2
 * with clone,    counter.count = 0 (copies: 1, 1)
 *
 * === Example Complete ===
 */
