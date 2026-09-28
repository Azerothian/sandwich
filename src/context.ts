import { AsyncLocalStorage } from "node:async_hooks";
import type Loaf from "./loaf";
import type { Toast } from "./types/loaf";

export { useChain } from "./utils/chain-control";
export type { ChainControl, RedirectTarget } from "./utils/chain-control";

export interface PathFrame {
  event: string;
  slice: string;
  // set when the frame is a hook running around the slice's handler
  phase?: "before" | "after";
}

export interface LoafContext {
  loaf: Loaf;
  slice?: Toast;
  // every slice handler (and hook) on the way to the current one
  path?: PathFrame[];
}

const storage = new AsyncLocalStorage<LoafContext>();

export function runInContext<T>(context: LoafContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getContext(): LoafContext | undefined {
  return storage.getStore();
}

export function useLoaf<T extends Loaf = Loaf>(): T {
  const context = storage.getStore();
  if (!context) {
    throw new Error("useLoaf() must be called inside a Loaf handler");
  }
  return context.loaf as T;
}

export function useSlice<T = Toast>(): T {
  const context = storage.getStore();
  if (!context?.slice) {
    throw new Error("useSlice() must be called inside a slice handler");
  }
  return context.slice as T;
}

export function formatPath(path: PathFrame[]): string {
  return path.map((f) => `${f.event}(${f.slice}${f.phase ? `:${f.phase}` : ""})`).join(" > ");
}

const annotated = new WeakSet<object>();

// adds the slice path to an error once; the innermost frame has the complete path
export function annotateError(error: unknown, path: PathFrame[]): any {
  let err: any = error;
  if (err === null || (typeof err !== "object" && typeof err !== "function")) {
    err = new Error(String(error));
    err.cause = error;
  }
  if (annotated.has(err)) {
    return err;
  }
  try {
    const oldHeader = `${err.name}: ${err.message}`;
    // read the stack before changing the message - V8 formats it lazily
    const stack = err.stack;
    err.slicePath = path.map((frame) => ({ ...frame }));
    err.message = `${err.message} [at ${formatPath(path)}]`;
    if (typeof stack === "string" && stack.startsWith(oldHeader)) {
      err.stack = `${err.name}: ${err.message}${stack.slice(oldHeader.length)}`;
    }
    annotated.add(err);
  } catch {
    // frozen or exotic errors are rethrown untouched
  }
  return err;
}
