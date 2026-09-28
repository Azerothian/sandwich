/**
 * Hooks and Chain Control Example
 *
 * This example demonstrates:
 * - Slice hooks: before/after functions that wrap an event's handlers
 *   (all slices, or only those listed in sliceNames)
 * - Rewriting a handler's input (before) and output (after)
 * - Chain control with useChain(): cancel, skip and redirect (to a later slice,
 *   to another event, or to a specific slice within another event)
 * - Errors annotated with the full path of slices that led to them
 */

import Loaf from "../../src/loaf";
import { useChain, useLoaf, useSlice } from "../../src/context";
import { ISlice, ISliceHook } from "../../src/types/loaf";

// ISlice only declares lifecycle events; allow custom crumb handlers too
type CrumbSlice = ISlice & { [crumb: string]: unknown };

enum Orders {
  Place = "order:place",
  Manual = "order:manual-review",
  Charge = "payment:charge",
}

interface Order {
  id: number;
  total: number;
  steps: string[];
  guest?: boolean;
  express?: boolean;
  vip?: boolean;
  card?: "ok" | "declined";
}

const step = (order: Order, name: string): Order => ({ ...order, steps: [...order.steps, name] });

const validate: CrumbSlice = {
  name: "validate",
  [Orders.Place]: async (order: Order) => {
    if (order.total <= 0) {
      // Stop the whole chain; execute() resolves with this value
      useChain().cancel({ ...order, steps: [...order.steps, "rejected"] });
      return order;
    }
    if (order.express) {
      // Jump ahead to the payment slice, skipping fraud and loyalty
      useChain().redirect({ slice: "payment" });
    }
    return step(order, "validated");
  },
};

const fraud: CrumbSlice = {
  name: "fraud",
  dependencies: ["validate"],
  [Orders.Place]: async (order: Order) => {
    if (order.total > 1000) {
      // Hand the order to a different event instead of finishing this chain.
      // VIP orders start that event's chain at the receipt slice, skipping the review queue.
      useChain().redirect(order.vip ? { event: Orders.Manual, slice: "receipt" } : { event: Orders.Manual });
    }
    return step(order, "fraud-checked");
  },
  [Orders.Manual]: async (order: Order) => step(order, "queued for manual review"),
};

const loyalty: CrumbSlice = {
  name: "loyalty",
  dependencies: ["fraud"],
  [Orders.Place]: async (order: Order) => step(order, "loyalty points"),
};

const payment: CrumbSlice = {
  name: "payment",
  dependencies: ["loyalty"],
  [Orders.Place]: async (order: Order) => {
    // Nested execute: an error thrown in payment:charge carries the full path
    await useLoaf().execute(Orders.Charge, order);
    return step(order, "paid");
  },
  [Orders.Charge]: async (order: Order) => {
    if (order.card === "declined") {
      throw new Error("card declined");
    }
    return order;
  },
};

const receipt: CrumbSlice = {
  name: "receipt",
  dependencies: ["payment"],
  [Orders.Place]: async (order: Order) => step(order, "receipt sent"),
  [Orders.Manual]: async (order: Order) => step(order, "review receipt sent"),
};

// Logs every order:place handler - no sliceNames means "all slices"
const tracing: ISliceHook = {
  [Orders.Place]: {
    before: () => { console.log(`    -> ${useSlice<ISlice>().name}`); },
  },
};

// Targets one slice: rewrite its input and output
const discounts: ISliceHook = {
  [Orders.Place]: {
    sliceNames: ["payment"],
    before: (order: Order) => ({ ...order, total: Math.round(order.total * 0.9) }),
    after: (order: Order) => step(order, `charged ${order.total}`),
  },
};

// Guests skip the loyalty slice entirely
const guests: ISliceHook = {
  [Orders.Place]: {
    sliceNames: ["loyalty"],
    before: (order: Order) => {
      if (order.guest) {
        useChain().skip();
      }
    },
  },
};

async function place(loaf: Loaf, order: Order) {
  const flags = ["guest", "express", "vip", "card"].filter((k) => (order as any)[k]).map((k) => `${k}: ${(order as any)[k]}`);
  console.log(`\nOrder #${order.id} (total ${order.total}${flags.length ? `, ${flags.join(", ")}` : ""})`);
  try {
    const result = await loaf.execute<Order>(Orders.Place, order);
    console.log(`  steps: ${result.steps.join(", ")}`);
  } catch (error: any) {
    console.log(`  failed: ${error.message}`);
    console.log(`  slicePath: ${error.slicePath.map((f: any) => `${f.event}/${f.slice}`).join(" -> ")}`);
  }
}

async function main() {
  console.log("=== Hooks and Chain Control Example ===");

  const loaf = new Loaf({
    name: "orders-app",
    crumbNames: Object.values(Orders),
    hooks: [discounts, guests],
    slices: [receipt, payment, loyalty, fraud, validate],
  });
  await loaf.start();

  // Hooks can also be added (and removed) at runtime
  const removeTracing = loaf.addHook(tracing);
  await place(loaf, { id: 1, total: 100, steps: [] });
  removeTracing();

  await place(loaf, { id: 2, total: 0, steps: [] });
  await place(loaf, { id: 3, total: 50, steps: [], guest: true });
  await place(loaf, { id: 4, total: 20, steps: [], card: "declined" });
  await place(loaf, { id: 5, total: 5000, steps: [] });
  await place(loaf, { id: 6, total: 30, steps: [], express: true });
  await place(loaf, { id: 7, total: 2000, steps: [], vip: true });

  await loaf.shutdown();
  console.log("\n=== Example Complete ===");
}

main().catch(console.error);


/**
 * Expected Output:
 *
 * === Hooks and Chain Control Example ===
 *
 * Order #1 (total 100)
 *     -> validate
 *     -> fraud
 *     -> loyalty
 *     -> payment
 *     -> receipt
 *   steps: validated, fraud-checked, loyalty points, paid, charged 90, receipt sent
 *
 * Order #2 (total 0)
 *   steps: rejected
 *
 * Order #3 (total 50, guest: true)
 *   steps: validated, fraud-checked, paid, charged 45, receipt sent
 *
 * Order #4 (total 20, card: declined)
 *   failed: card declined [at order:place(payment) > payment:charge(payment)]
 *   slicePath: order:place/payment -> payment:charge/payment
 *
 * Order #5 (total 5000)
 *   steps: validated, fraud-checked, queued for manual review, review receipt sent
 *
 * Order #6 (total 30, express: true)
 *   steps: validated, paid, charged 27, receipt sent
 *
 * Order #7 (total 2000, vip: true)
 *   steps: validated, fraud-checked, review receipt sent
 *
 * === Example Complete ===
 */
