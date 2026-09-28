import { describe, expect, test, jest } from '@jest/globals';
import Chains from '../../src/utils/chains';
import { useChain } from '../../src/utils/chain-control';


function createBindFunc(i: number) {
  return (arg: string) => {
    return `${arg}${i}`;
  }
}
describe("utils:chains", () => {
  test('basic test - execute', async () => {
    const chain = new Chains();
    chain.push("test", (arg: string) => {
      return `${arg}1`;
    });
    const result = await chain.execute<string>("test", "answer");
    expect(result).toBe("answer1");
  });

  test('condition', async () => {
    const chain = new Chains();
    for(let i = 0; i < 10; i++) {
      chain.push("test", createBindFunc(i));
    }
    const result = await chain.condition("test", async(args: string) => {
      return args === "answer012345";
    }, "answer");
    expect(result).toBe("answer012345");
  });
  test('condition - no return passing', async () => {
    const chain = new Chains();
    chain.setOptions("test", {ignoreReturn: true});
    for(let i = 0; i < 10; i++) {
      chain.push("test", createBindFunc(i));
    }
    const result = await chain.condition("test", async(args: string) => {
      return args === "answer5";
    }, "answer");
    expect(result).toBe("answer5");
  });
});

describe("utils:chains - positive", () => {
  test('execute with no registered functions returns the start value', async () => {
    const chain = new Chains();
    expect(await chain.execute("missing", "start")).toBe("start");
  });
  test('execute pipes return values in push order', async () => {
    const chain = new Chains();
    for (let i = 0; i < 3; i++) {
      chain.push("test", createBindFunc(i));
    }
    expect(await chain.execute("test", "answer")).toBe("answer012");
  });
  test('execute forwards extra arguments to every function', async () => {
    const chain = new Chains();
    const seen: unknown[][] = [];
    chain.push("test", (o: string, ...args: unknown[]) => { seen.push(args); return o; });
    chain.push("test", (o: string, ...args: unknown[]) => { seen.push(args); return o; });
    await chain.execute("test", "start", 1, "two");
    expect(seen).toEqual([[1, "two"], [1, "two"]]);
  });
  test('execute with ignoreReturn passes the start value to each function', async () => {
    const chain = new Chains();
    chain.setOptions("test", { ignoreReturn: true });
    const seen: string[] = [];
    chain.push("test", (o: string) => { seen.push(o); return "changed"; });
    chain.push("test", (o: string) => { seen.push(o); return "changed again"; });
    const result = await chain.execute("test", "start");
    expect(seen).toEqual(["start", "start"]);
    expect(result).toBe("start");
  });
  test('push accepts an array of functions', async () => {
    const chain = new Chains();
    chain.push("test", [createBindFunc(1), createBindFunc(2)]);
    expect(await chain.execute("test", "a")).toBe("a12");
  });
  test('unshift runs before previously pushed functions', async () => {
    const chain = new Chains();
    chain.push("test", createBindFunc(1));
    chain.unshift("test", createBindFunc(0));
    expect(await chain.execute("test", "a")).toBe("a01");
  });
  test('unshift creates the event when it does not exist', async () => {
    const chain = new Chains();
    chain.unshift("test", createBindFunc(0));
    expect(await chain.execute("test", "a")).toBe("a0");
  });
  test('sync pipes return values', () => {
    const chain = new Chains();
    chain.push("test", createBindFunc(1));
    chain.push("test", createBindFunc(2));
    expect(chain.sync<string>("test", "a")).toBe("a12");
  });
  test('sync with ignoreReturn returns the start value', () => {
    const chain = new Chains();
    chain.setOptions("test", { ignoreReturn: true });
    const seen: string[] = [];
    chain.push("test", (o: string) => { seen.push(o); return "x"; });
    chain.push("test", (o: string) => { seen.push(o); return "y"; });
    expect(chain.sync<string>("test", "a")).toBe("a");
    expect(seen).toEqual(["a", "a"]);
  });
  test('sync with no registered functions returns the start value', () => {
    const chain = new Chains();
    expect(chain.sync("missing", "start")).toBe("start");
  });
  test('all runs every function with the start value and collects results', async () => {
    const chain = new Chains();
    chain.push("test", async (o: string) => `${o}-a`);
    chain.push("test", (o: string) => `${o}-b`);
    expect(await chain.all<string>("test", "s")).toEqual(["s-a", "s-b"]);
  });
  test('all with no registered functions returns an empty array', async () => {
    const chain = new Chains();
    expect(await chain.all("missing", "s")).toEqual([]);
  });
  test('condition returns the final value when the condition never matches', async () => {
    const chain = new Chains();
    for (let i = 0; i < 3; i++) {
      chain.push("test", createBindFunc(i));
    }
    const result = await chain.condition("test", async () => false, "answer");
    expect(result).toBe("answer012");
  });
  test('condition with no registered functions returns the start value', async () => {
    const chain = new Chains();
    const result = await chain.condition("missing", async () => true, "start");
    expect(result).toBe("start");
  });
  test('clear removes all functions for an event', async () => {
    const chain = new Chains();
    chain.push("test", createBindFunc(1));
    chain.clear("test");
    expect(await chain.execute("test", "a")).toBe("a");
  });
  test('unlock re-enables push', async () => {
    const chain = new Chains();
    chain.lock("test");
    chain.unlock("test");
    chain.push("test", createBindFunc(1));
    expect(await chain.execute("test", "a")).toBe("a1");
  });
  test('events are isolated from each other', async () => {
    const chain = new Chains();
    chain.push("one", createBindFunc(1));
    chain.push("two", createBindFunc(2));
    expect(await chain.execute("one", "a")).toBe("a1");
    expect(await chain.execute("two", "a")).toBe("a2");
  });
});

describe("utils:chains - negative", () => {
  test('execute rejects and stops the chain when a function throws', async () => {
    const chain = new Chains();
    const after = jest.fn();
    chain.push("test", () => { throw new Error("boom"); });
    chain.push("test", after);
    await expect(chain.execute("test", "a")).rejects.toThrow("boom");
    expect(after).not.toHaveBeenCalled();
  });
  test('execute rejects when an async function rejects', async () => {
    const chain = new Chains();
    chain.push("test", async () => { throw new Error("async boom"); });
    await expect(chain.execute("test", "a")).rejects.toThrow("async boom");
  });
  test('all rejects when any function rejects', async () => {
    const chain = new Chains();
    chain.push("test", async () => "ok");
    chain.push("test", async () => { throw new Error("boom"); });
    await expect(chain.all("test", "a")).rejects.toThrow("boom");
  });
  test('condition rejects when the condition function throws', async () => {
    const chain = new Chains();
    chain.push("test", createBindFunc(1));
    await expect(chain.condition("test", async () => { throw new Error("cond"); }, "a"))
      .rejects.toThrow("cond");
  });
  test('sync throws when a function throws', () => {
    const chain = new Chains();
    chain.push("test", () => { throw new Error("boom"); });
    expect(() => chain.sync("test", "a")).toThrow("boom");
  });
  test('lock prevents push and unshift', async () => {
    const chain = new Chains();
    chain.push("test", createBindFunc(1));
    chain.lock("test");
    chain.push("test", createBindFunc(2));
    chain.unshift("test", createBindFunc(0));
    expect(await chain.execute("test", "a")).toBe("a1");
  });
  test('lock prevents clear', async () => {
    const chain = new Chains();
    chain.push("test", createBindFunc(1));
    chain.lock("test");
    chain.clear("test");
    expect(await chain.execute("test", "a")).toBe("a1");
  });
  test('lock on a new event prevents it from being created', async () => {
    const chain = new Chains();
    chain.lock("test");
    chain.push("test", createBindFunc(1));
    expect(chain.funcs["test"]).toBeUndefined();
    expect(await chain.execute("test", "a")).toBe("a");
  });
  test('sync throws when an async function is registered', () => {
    const chain = new Chains();
    chain.push("test", async (o: string) => o);
    expect(() => chain.sync("test", "a")).toThrow("Cannot use sync with async functions");
  });
  test('sync with ignoreReturn throws when an async function is registered', () => {
    const chain = new Chains();
    chain.setOptions("test", { ignoreReturn: true });
    chain.push("test", async (o: string) => o);
    expect(() => chain.sync("test", "a")).toThrow("Cannot use sync with async functions");
  });
});

function tagged(sliceName: string, fn: (...args: any[]) => any) {
  return Object.assign(fn, { sliceName });
}

describe("utils:chains - chain control - positive", () => {
  test('cancel with a value stops the chain and resolves with it', async () => {
    const chain = new Chains();
    const after = jest.fn();
    chain.push("test", (o: string) => { useChain().cancel("stopped"); return `${o}1`; });
    chain.push("test", after);
    expect(await chain.execute("test", "a")).toBe("stopped");
    expect(after).not.toHaveBeenCalled();
  });
  test('cancel without a value resolves with the current result', async () => {
    const chain = new Chains();
    chain.push("test", (o: string) => { useChain().cancel(); return `${o}1`; });
    chain.push("test", createBindFunc(2));
    expect(await chain.execute("test", "a")).toBe("a1");
  });
  test('cancel(undefined) resolves with undefined', async () => {
    const chain = new Chains();
    chain.push("test", (o: string) => { useChain().cancel(undefined); return `${o}1`; });
    expect(await chain.execute("test", "a")).toBeUndefined();
  });
  test('destructured controls still work', async () => {
    const chain = new Chains();
    chain.push("test", () => { const { cancel } = useChain(); cancel("x"); });
    expect(await chain.execute("test", "a")).toBe("x");
  });
  test('skip discards the current result and continues', async () => {
    const chain = new Chains();
    chain.push("test", createBindFunc(1));
    chain.push("test", (o: string) => { useChain().skip(); return `${o}-ignored`; });
    chain.push("test", createBindFunc(3));
    expect(await chain.execute("test", "a")).toBe("a13");
  });
  test('redirect to a slice jumps ahead and passes the current result', async () => {
    const chain = new Chains();
    const seen: string[] = [];
    chain.push("test", tagged("one", (o: string) => { seen.push("one"); useChain().redirect({ slice: "three" }); return `${o}1`; }));
    chain.push("test", tagged("two", (o: string) => { seen.push("two"); return `${o}2`; }));
    chain.push("test", tagged("three", (o: string) => { seen.push("three"); return `${o}3`; }));
    expect(await chain.execute("test", "a")).toBe("a13");
    expect(seen).toEqual(["one", "three"]);
  });
  test('redirect to an event hands off the current value and extra args', async () => {
    const chain = new Chains();
    chain.push("test", (o: string) => { useChain().redirect({ event: "other" }); return `${o}1`; });
    chain.push("test", createBindFunc(2));
    chain.push("other", (o: string, extra: string) => `${o}-other-${extra}`);
    expect(await chain.execute("test", "a", "x")).toBe("a1-other-x");
  });
  test('redirect to an event and slice starts that chain at the slice', async () => {
    const chain = new Chains();
    const seen: string[] = [];
    chain.push("test", (o: string) => { useChain().redirect({ event: "other", slice: "y" }); return `${o}1`; });
    chain.push("test", createBindFunc(2));
    chain.push("other", tagged("x", (o: string) => { seen.push("x"); return `${o}-x`; }));
    chain.push("other", tagged("y", (o: string, extra: string) => { seen.push("y"); return `${o}-y-${extra}`; }));
    chain.push("other", tagged("z", (o: string) => { seen.push("z"); return `${o}-z`; }));
    expect(await chain.execute("test", "a", "e")).toBe("a1-y-e-z");
    expect(seen).toEqual(["y", "z"]);
  });
  test('redirect to the same event and an earlier slice restarts from there', async () => {
    const chain = new Chains();
    let loops = 0;
    chain.push("test", tagged("a", (o: string) => `${o}a`));
    chain.push("test", tagged("b", (o: string) => {
      if (loops++ < 2) {
        useChain().redirect({ event: "test", slice: "a" });
      }
      return `${o}b`;
    }));
    expect(await chain.execute("test", "")).toBe("ababab");
  });
  test('the redirected chain gets its own controller', async () => {
    const chain = new Chains();
    const seen: [string, number][] = [];
    chain.push("test", () => { useChain().redirect({ event: "other", slice: "y" }); });
    chain.push("other", tagged("x", (o: any) => o));
    chain.push("other", tagged("y", (o: any) => { const c = useChain(); seen.push([c.eventName, c.index]); return o; }));
    await chain.execute("test", "a");
    expect(seen).toEqual([["other", 1]]);
  });
  test('sync redirects to an event and slice', () => {
    const chain = new Chains();
    chain.push("test", (o: string) => { useChain().redirect({ event: "other", slice: "y" }); return `${o}1`; });
    chain.push("other", tagged("x", (o: string) => `${o}-x`));
    chain.push("other", tagged("y", (o: string) => `${o}-y`));
    expect(chain.sync("test", "a")).toBe("a1-y");
  });
  test('redirect to an event with no functions returns the current value', async () => {
    const chain = new Chains();
    chain.push("test", (o: string) => { useChain().redirect({ event: "missing" }); return `${o}1`; });
    expect(await chain.execute("test", "a")).toBe("a1");
  });
  test('the last action in a step wins', async () => {
    const chain = new Chains();
    chain.push("test", (o: string) => { useChain().cancel("x"); useChain().skip(); return `${o}1`; });
    chain.push("test", createBindFunc(2));
    expect(await chain.execute("test", "a")).toBe("a2");
  });
  test('the controller exposes the event name and index', async () => {
    const chain = new Chains();
    const seen: [string, number][] = [];
    chain.push("test", (o: any) => { const c = useChain(); seen.push([c.eventName, c.index]); return o; });
    chain.push("test", (o: any) => { const c = useChain(); seen.push([c.eventName, c.index]); return o; });
    await chain.execute("test", "a");
    expect(seen).toEqual([["test", 0], ["test", 1]]);
  });
  test('a nested execute gets its own controller', async () => {
    const chain = new Chains();
    chain.push("inner", () => { useChain().cancel("inner-cancelled"); });
    chain.push("inner", () => "never");
    chain.push("outer", async (o: string) => {
      const inner = await chain.execute("inner", o);
      expect(useChain().eventName).toBe("outer");
      return `${o}-${inner}`;
    });
    chain.push("outer", (o: string) => `${o}-2`);
    expect(await chain.execute("outer", "a")).toBe("a-inner-cancelled-2");
  });
  test('ignoreReturn chains return the start value when cancelled without a value', async () => {
    const chain = new Chains();
    chain.setOptions("test", { ignoreReturn: true });
    chain.push("test", () => { useChain().cancel(); return "x"; });
    expect(await chain.execute("test", "start")).toBe("start");
  });
  test('condition supports cancel and skip', async () => {
    const chain = new Chains();
    chain.push("test", (o: string) => { useChain().skip(); return `${o}-skipped`; });
    chain.push("test", (o: string) => { useChain().cancel(`${o}-cancelled`); return o; });
    chain.push("test", createBindFunc(3));
    expect(await chain.condition("test", async () => false, "a")).toBe("a-cancelled");
  });
  test('sync supports cancel, skip and redirect', () => {
    const chain = new Chains();
    chain.push("test", tagged("a", (o: string) => { useChain().redirect({ slice: "c" }); return `${o}1`; }));
    chain.push("test", tagged("b", (o: string) => `${o}2`));
    chain.push("test", tagged("c", (o: string) => { useChain().skip(); return `${o}3`; }));
    chain.push("test", tagged("d", (o: string) => { useChain().cancel(`${o}!`); return o; }));
    chain.push("test", tagged("e", (o: string) => `${o}5`));
    expect(chain.sync("test", "a")).toBe("a1!");
  });
  test('sync redirects to another event synchronously', () => {
    const chain = new Chains();
    chain.push("test", (o: string) => { useChain().redirect({ event: "other" }); return `${o}1`; });
    chain.push("other", (o: string) => `${o}-other`);
    expect(chain.sync("test", "a")).toBe("a1-other");
  });
});

describe("utils:chains - chain control - negative", () => {
  test('useChain throws outside a chain', () => {
    expect(() => useChain()).toThrow("useChain() is only available in sequential chains (execute, condition, sync)");
  });
  test('useChain throws inside all()', async () => {
    const chain = new Chains();
    chain.push("test", () => useChain());
    await expect(chain.all("test", "a")).rejects.toThrow("useChain() is only available in sequential chains");
  });
  test('useChain inside all() does not see an outer chain', async () => {
    const chain = new Chains();
    chain.push("par", () => useChain());
    chain.push("outer", async () => chain.all("par", undefined));
    await expect(chain.execute("outer", undefined)).rejects.toThrow("useChain() is only available");
  });
  test('redirect to a slice that is not in the chain throws', async () => {
    const chain = new Chains();
    chain.push("test", tagged("one", () => { useChain().redirect({ slice: "missing" }); }));
    await expect(chain.execute("test", "a"))
      .rejects.toThrow('redirect target slice "missing" not found later in chain "test"');
  });
  test('redirect to an earlier slice throws', async () => {
    const chain = new Chains();
    chain.push("test", tagged("one", (o: any) => o));
    chain.push("test", tagged("two", () => { useChain().redirect({ slice: "one" }); }));
    await expect(chain.execute("test", "a"))
      .rejects.toThrow('redirect target slice "one" not found later in chain "test"');
  });
  test('redirect needs a slice or an event', async () => {
    const chain = new Chains();
    chain.push("test", () => { useChain().redirect({} as any); });
    await expect(chain.execute("test", "a")).rejects.toThrow("redirect() needs a { slice }, an { event } or both");
  });
  test('redirect to an event and slice throws when the slice is not in that chain', async () => {
    const chain = new Chains();
    chain.push("test", () => { useChain().redirect({ event: "other", slice: "missing" }); });
    chain.push("other", tagged("x", (o: any) => o));
    await expect(chain.execute("test", "a"))
      .rejects.toThrow('redirect target slice "missing" not found in chain "other"');
  });
  test('redirect to an event and slice throws when the event has no functions', async () => {
    const chain = new Chains();
    chain.push("test", () => { useChain().redirect({ event: "missing", slice: "x" }); });
    await expect(chain.execute("test", "a"))
      .rejects.toThrow('redirect target slice "x" not found in chain "missing"');
  });
  test('sync redirect to an event and slice throws when the slice is missing', () => {
    const chain = new Chains();
    chain.push("test", () => { useChain().redirect({ event: "other", slice: "missing" }); });
    chain.push("other", tagged("x", (o: any) => o));
    expect(() => chain.sync("test", "a")).toThrow('redirect target slice "missing" not found in chain "other"');
  });
});
