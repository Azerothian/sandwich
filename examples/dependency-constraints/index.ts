/**
 * Dependency Constraints Example
 *
 * This example demonstrates:
 * - oneOf: depend on any one of several alternatives (ordered after every one present)
 * - optional.before / optional.after: ordering that only applies when the module is loaded
 * - required.after: run before another slice
 * - Event-scoped constraints that only change the order of one crumb
 * - Catching an AdjacencyError caused by a circular dependency
 */

import Loaf from "../../src/loaf";
import { ISlice } from "../../src/types/loaf";
import { AdjacencyError } from "../../src/utils/topo-graph";

const order: string[] = [];

// Helper that records when a slice initializes.
// Lifecycle handlers take no arguments and their return values are ignored.
function track(name: string) {
  return async () => {
    order.push(name);
  };
}

// Only the in-memory backend is loaded; "redis" is absent.
const memory: ISlice = {
  name: "memory",
  [Loaf.Initialize]: track("memory"),
};

const cache: ISlice = {
  name: "cache",
  // Needs at least one backend. Runs after every listed backend that is loaded.
  dependencies: [{ oneOf: ["redis", "memory"] }],
  [Loaf.Initialize]: track("cache"),
};

const metrics: ISlice = {
  name: "metrics",
  dependencies: [{
    optional: {
      before: ["cache"],        // cache is loaded, so metrics runs after it
      after: ["tracing"],       // tracing is not loaded, so this is ignored
    },
  }],
  [Loaf.Initialize]: track("metrics"),
};

const config: ISlice = {
  name: "config",
  // required.after: config must run BEFORE memory, even though it is listed last
  dependencies: [{ required: { after: ["memory"] } }],
  [Loaf.Initialize]: track("config"),
};

// ISlice only declares lifecycle events; allow custom crumb handlers too
type CrumbSlice = ISlice & { [crumb: string]: unknown };

enum Events {
  Report = "app:report",
}

// Event-scoped constraint: summary is listed first, but for Events.Report
// it must run after cache-report. Other events keep the default order.
const summary: CrumbSlice = {
  name: "summary",
  dependencies: [{ event: Events.Report, required: { before: ["cache-report"] } }],
  [Events.Report]: async (lines: string[]) => [...lines, "summary"],
};
const cacheReport: CrumbSlice = {
  name: "cache-report",
  [Events.Report]: async (lines: string[]) => [...lines, "cache-report"],
};

async function main() {
  console.log("=== Dependency Constraints Example ===\n");

  const loaf = new Loaf({
    name: "dependency-constraints-app",
    crumbNames: [Events.Report],
    slices: [cache, metrics, memory, config, summary, cacheReport],
  });
  await loaf.start();
  console.log("Initialize order:", order.join(" -> "));

  const report = await loaf.execute<string[]>(Events.Report, []);
  console.log("Report order:    ", report.join(" -> "));
  await loaf.shutdown();

  console.log("\n--- Circular dependency ---");
  const broken = new Loaf({
    name: "broken-app",
    slices: [
      { name: "a", dependencies: ["b"] },
      { name: "b", dependencies: ["a"] },
    ],
  });
  // sortArrayByDependencyInfo also prints the adjacency details to console.error
  const originalError = console.error;
  console.error = () => {};
  try {
    await broken.load();
  } catch (error) {
    if (error instanceof AdjacencyError) {
      console.log(`Caught AdjacencyError: ${error.message}`);
    } else {
      throw error;
    }
  } finally {
    console.error = originalError;
  }

  console.log("\n=== Example Complete ===");
}

main().catch(console.error);

/**
 * Expected Output:
 *
 * === Dependency Constraints Example ===
 *
 * Initialize order: config -> memory -> cache -> metrics
 * Report order:     cache-report -> summary
 *
 * --- Circular dependency ---
 * Caught AdjacencyError: Graph has a cycle. Topological sorting is not possible.
 *
 * === Example Complete ===
 */
