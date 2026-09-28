import { AsyncLocalStorage } from "node:async_hooks";

// { slice } jumps ahead in this chain, { event } hands off to another event,
// { event, slice } hands off to another event starting at that slice
export type RedirectTarget = { slice: string; event?: string } | { event: string; slice?: string };

export interface ChainControl {
  // name of the event whose chain is running
  readonly eventName: string;
  // position of the running function in the chain
  readonly index: number;
  // stop the chain; it resolves with `value`, or the current value when omitted
  cancel(value?: unknown): void;
  // skip the current slice; the chain continues with the value it had before this step
  skip(): void;
  // jump ahead to a later slice in this chain, or hand the current value off to
  // another event (optionally starting at one of its slices)
  redirect(target: RedirectTarget): void;
}

export type ChainAction =
  | { type: "cancel"; hasValue: boolean; value: unknown }
  | { type: "skip" }
  | { type: "redirect"; slice?: string; event?: string };

export class ChainController implements ChainControl {
  index = 0;
  action?: ChainAction;
  constructor(readonly eventName: string) {}
  // arrow functions so `const { cancel } = useChain()` keeps working
  readonly cancel = (...value: unknown[]) => {
    this.action = { type: "cancel", hasValue: value.length > 0, value: value[0] };
  };
  readonly skip = () => {
    this.action = { type: "skip" };
  };
  readonly redirect = (target: RedirectTarget) => {
    const slice = (target as { slice?: string })?.slice;
    const event = (target as { event?: string })?.event;
    if (slice === undefined && event === undefined) {
      throw new Error("redirect() needs a { slice }, an { event } or both");
    }
    this.action = { type: "redirect", slice, event };
  };
}

export const chainStorage = new AsyncLocalStorage<ChainController | undefined>();

export function useChain(): ChainControl {
  const control = chainStorage.getStore();
  if (!control) {
    throw new Error("useChain() is only available in sequential chains (execute, condition, sync)");
  }
  return control;
}

export function isThenable(value: any): value is PromiseLike<any> {
  return value !== null && (typeof value === "object" || typeof value === "function") && typeof value.then === "function";
}
