import { describe, expect, test, jest } from '@jest/globals';
import Chains from '../../src/utils/chains';


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
