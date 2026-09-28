/**
 * Crumb Control Example
 *
 * This example demonstrates:
 * - Enabling custom crumbs with jam.crumbNames, slice.allow and allowCrumb()
 * - Blocking crumbs with restrictCrumb(), per-slice ignore and disallowCrumb()
 * - Execution modes: execute (waterfall), ignoreReturn, all, condition and sync
 *
 * Crumb chains are built during load(), so allow/restrict calls must happen
 * before load() (or start()) to have any effect.
 */

import Loaf from "../../src/loaf";
import { ISlice } from "../../src/types/loaf";

// ISlice only declares lifecycle events; allow custom crumb handlers too
type CrumbSlice = ISlice & { [crumb: string]: unknown };

enum Crumbs {
  Price = "shop:price",       // enabled via jam.crumbNames
  Audit = "shop:audit",       // enabled via slice.allow
  Notify = "shop:notify",     // enabled via allowCrumb()
  Debug = "shop:debug",       // enabled, then restricted
  Tax = "shop:tax",           // ignored by one slice
  Label = "shop:label",       // synchronous crumb
}

const base: CrumbSlice = {
  name: "base",
  allow: [Crumbs.Audit],
  [Crumbs.Price]: async (price: number) => price + 100,
  [Crumbs.Audit]: async (entry: string) => {
    console.log(`  [base] audit received "${entry}"`);
    return `${entry} [base]`;
  },
  [Crumbs.Notify]: async (msg: string) => `email: ${msg}`,
  [Crumbs.Debug]: async () => console.log("  [base] debug output (should never print)"),
  [Crumbs.Tax]: async (price: number) => price + 15,
  [Crumbs.Label]: (text: string) => text.toUpperCase(),
  [Loaf.Ready]: async (loaf: Loaf) => {
    console.log("  [base] ready (should never print)");
    return loaf;
  },
};

const discount: CrumbSlice = {
  name: "discount",
  dependencies: ["base"],
  ignore: [Crumbs.Tax],     // discount never takes part in the Tax chain
  [Crumbs.Price]: async (price: number) => price - 20,
  // Audit is enabled by base's `allow`, which applies to every slice
  [Crumbs.Audit]: async (entry: string) => {
    console.log(`  [discount] audit received "${entry}"`);
    return `${entry} [discount]`;
  },
  [Crumbs.Notify]: async (msg: string) => `sms: ${msg}`,
  [Crumbs.Tax]: async () => { throw new Error("never called"); },
  [Crumbs.Label]: async (text: string) => `${text}!`,  // async - breaks sync()
};

async function main() {
  console.log("=== Crumb Control Example ===\n");

  const loaf = new Loaf({
    name: "crumb-control-app",
    crumbNames: [Crumbs.Price, Crumbs.Debug, Crumbs.Tax, Crumbs.Label],
    slices: [discount, base],
  });

  // Must be called before load()
  loaf.allowCrumb(Crumbs.Notify);
  loaf.restrictCrumb(Crumbs.Debug);
  loaf.disallowCrumb(Loaf.Ready);  // no slice will run a Ready handler
  await loaf.start();

  console.log("Registered crumbs:");
  for (const crumb of Object.values(Crumbs)) {
    const path = loaf.crumbs[crumb];
    console.log(`  ${crumb.padEnd(11)} -> ${path ? `[${path.join(", ")}]` : "(not registered)"}`);
  }

  // execute(): waterfall - each handler receives the previous result
  console.log("\nexecute(Price, 0):", await loaf.execute(Crumbs.Price, 0));

  // ignoreReturn: every handler receives the original start value
  loaf.setOptions(Crumbs.Audit, { ignoreReturn: true });
  console.log("execute(Audit) with ignoreReturn:");
  console.log("  result:", await loaf.execute(Crumbs.Audit, "order#1"));

  // all(): run every handler with the same input in parallel
  console.log("all(Notify):", await loaf.all(Crumbs.Notify, "order shipped"));

  // condition(): stop as soon as the predicate is true
  const firstOver50 = await loaf.condition(Crumbs.Price, async (p: number) => p > 50, 0);
  console.log("condition(Price, > 50):", firstOver50);

  // ignore: discount's Tax handler is skipped
  console.log("execute(Tax, 100):", await loaf.execute(Crumbs.Tax, 100));

  // restricted: nothing is registered, so the start value comes straight back
  console.log("execute(Debug, 'x'):", await loaf.execute(Crumbs.Debug, "x"));

  // sync() refuses async handlers
  try {
    loaf.sync(Crumbs.Label, "sale");
  } catch (error: any) {
    console.log(`sync(Label): ${error.message}`);
  }

  await loaf.shutdown();
  console.log("\n=== Example Complete ===");
}

main().catch(console.error);

/**
 * Expected Output:
 *
 * === Crumb Control Example ===
 *
 * Registered crumbs:
 *   shop:price  -> [base, discount]
 *   shop:audit  -> [base, discount]
 *   shop:notify -> [base, discount]
 *   shop:debug  -> (not registered)
 *   shop:tax    -> [base]
 *   shop:label  -> [base, discount]
 *
 * execute(Price, 0): 80
 * execute(Audit) with ignoreReturn:
 *   [base] audit received "order#1"
 *   [discount] audit received "order#1"
 *   result: order#1
 * all(Notify): [ 'email: order shipped', 'sms: order shipped' ]
 * condition(Price, > 50): 100
 * execute(Tax, 100): 115
 * execute(Debug, 'x'): x
 * sync(Label): Cannot use sync with async functions
 *
 * === Example Complete ===
 */
