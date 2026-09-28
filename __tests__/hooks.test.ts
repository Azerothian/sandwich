import { describe, it, expect, jest, afterEach } from "@jest/globals";
import Loaf from "../src/loaf";
import { useChain, useLoaf, useSlice } from "../src/context";
import { ISlice, ISliceHook } from "../src/types/loaf";

afterEach(() => {
  jest.restoreAllMocks();
});

function pipeline(extra: any[] = [], hooks: ISliceHook[] = []) {
  return new Loaf({
    name: "t",
    crumbNames: ["build"],
    hooks,
    slices: [
      { name: "a", build: async (o: string) => `${o}-a` },
      { name: "b", dependencies: ["a"], build: async (o: string) => `${o}-b` },
      { name: "c", dependencies: ["b"], build: async (o: string) => `${o}-c` },
      ...extra,
    ],
  });
}

describe("hooks - positive", () => {
  it("before replaces the first argument for the targeted slice", async () => {
    const loaf = pipeline([], [{ build: { sliceNames: ["b"], before: (o: string) => `${o}-before` } }]);
    await loaf.load();
    expect(await loaf.execute("build", "s")).toBe("s-a-before-b-c");
  });

  it("after replaces the return value passed to the next slice", async () => {
    const loaf = pipeline([], [{ build: { sliceNames: ["a"], after: (r: string) => r.toUpperCase() } }]);
    await loaf.load();
    expect(await loaf.execute("build", "s")).toBe("S-A-b-c");
  });

  it("after on the last slice replaces the final result", async () => {
    const loaf = pipeline([], [{ build: { sliceNames: ["c"], after: (r: string) => `[${r}]` } }]);
    await loaf.load();
    expect(await loaf.execute("build", "s")).toBe("[s-a-b-c]");
  });

  it("without sliceNames a hook targets every slice", async () => {
    const seen: string[] = [];
    const loaf = pipeline([], [{
      build: {
        before: () => { seen.push(`before:${useSlice<ISlice>().name}`); },
        after: () => { seen.push(`after:${useSlice<ISlice>().name}`); },
      },
    }]);
    await loaf.load();
    await loaf.execute("build", "s");
    expect(seen).toEqual(["before:a", "after:a", "before:b", "after:b", "before:c", "after:c"]);
  });

  it("returning undefined leaves values unchanged", async () => {
    const loaf = pipeline([], [{ build: { before: () => undefined, after: async () => undefined } }]);
    await loaf.load();
    expect(await loaf.execute("build", "s")).toBe("s-a-b-c");
  });

  it("multiple hooks run in registration order and compose", async () => {
    const loaf = pipeline([], [
      { build: { sliceNames: ["a"], before: (o: string) => `${o}1`, after: (r: string) => `${r}3` } },
      { build: { sliceNames: ["a"], before: (o: string) => `${o}2`, after: (r: string) => `${r}4` } },
    ]);
    await loaf.load();
    expect(await loaf.execute("build", "s")).toBe("s12-a34-b-c");
  });

  it("hooks receive the extra execute arguments", async () => {
    const before = jest.fn((o: any) => o);
    const after = jest.fn((r: any) => r);
    const loaf = pipeline([], [{ build: { sliceNames: ["a"], before, after } }]);
    await loaf.load();
    await loaf.execute("build", "s", "x", 1);
    expect(before).toHaveBeenCalledWith("s", "x", 1);
    expect(after).toHaveBeenCalledWith("s-a", "x", 1);
  });

  it("async hooks are awaited", async () => {
    const loaf = pipeline([], [{
      build: {
        sliceNames: ["b"],
        before: async (o: string) => { await new Promise((r) => setTimeout(r, 5)); return `${o}~`; },
      },
    }]);
    await loaf.load();
    expect(await loaf.execute("build", "s")).toBe("s-a~-b-c");
  });

  it("hooks run with the target slice and loaf in context and as `this`", async () => {
    const seen: any[] = [];
    const slice = { name: "a", build: async (o: string) => o };
    const loaf = new Loaf({
      name: "t",
      crumbNames: ["build"],
      slices: [slice],
      hooks: [{ build: { before: function (this: any) { seen.push(this, useSlice(), useLoaf()); } } }],
    });
    await loaf.load();
    await loaf.execute("build", "s");
    expect(seen).toEqual([slice, slice, loaf]);
  });

  it("addHook after load() takes effect and its remover works", async () => {
    const loaf = pipeline();
    await loaf.load();
    const remove = loaf.addHook({ build: { sliceNames: ["c"], after: (r: string) => `${r}!` } });
    expect(await loaf.execute("build", "s")).toBe("s-a-b-c!");
    remove();
    expect(await loaf.execute("build", "s")).toBe("s-a-b-c");
  });

  it("removeHook removes a jam hook", async () => {
    const hook: ISliceHook = { build: { after: (r: string) => `${r}!` } };
    const loaf = pipeline([], [hook]);
    await loaf.load();
    loaf.removeHook(hook);
    expect(await loaf.execute("build", "s")).toBe("s-a-b-c");
  });

  it("hooks only apply to their own event", async () => {
    const before = jest.fn();
    const loaf = new Loaf({
      name: "t",
      crumbNames: ["build", "other"],
      hooks: [{ other: { before } }],
      slices: [{ name: "a", build: async (o: string) => o }],
    });
    await loaf.load();
    await loaf.execute("build", "s");
    expect(before).not.toHaveBeenCalled();
  });

  it("hooks wrap lifecycle events including Load", async () => {
    const seen: string[] = [];
    const record = (label: string) => () => { seen.push(`${label}:${useSlice<ISlice>().name}`); };
    const loaf = new Loaf({
      name: "t",
      hooks: [{
        [Loaf.Load]: { before: record("before-load") },
        [Loaf.Initialize]: { before: record("before-init"), after: record("after-init") },
      }],
      slices: [{
        name: "a",
        [Loaf.Load]: async () => { seen.push("load:a"); },
        [Loaf.Initialize]: async () => { seen.push("init:a"); },
      }],
    });
    await loaf.start();
    expect(seen).toEqual(["before-load:a", "load:a", "before-init:a", "init:a", "after-init:a"]);
  });

  it("sync chains run synchronous hooks", async () => {
    const loaf = new Loaf({
      name: "t",
      crumbNames: ["label"],
      hooks: [{ label: { before: (o: string) => o.trim(), after: (r: string) => `<${r}>` } }],
      slices: [{ name: "a", label: (o: string) => o.toUpperCase() }],
    });
    await loaf.load();
    expect(loaf.sync("label", "  hi  ")).toBe("<HI>");
  });
});

describe("hooks - chain control", () => {
  it("cancel in a before hook skips the handler and stops the chain", async () => {
    const handler = jest.fn(async (o: string) => o);
    const loaf = pipeline([{ name: "d", dependencies: ["c"], build: handler }], [{
      build: { sliceNames: ["b"], before: (o: string) => { useChain().cancel(`cancelled:${o}`); } },
    }]);
    await loaf.load();
    expect(await loaf.execute("build", "s")).toBe("cancelled:s-a");
    expect(handler).not.toHaveBeenCalled();
  });

  it("cancel without a value in a before hook resolves with the rewritten input", async () => {
    const loaf = pipeline([], [{
      build: { sliceNames: ["b"], before: (o: string) => { useChain().cancel(); return `${o}?`; } },
    }]);
    await loaf.load();
    expect(await loaf.execute("build", "s")).toBe("s-a?");
  });

  it("skip in a before hook skips only that slice", async () => {
    const after = jest.fn();
    const loaf = pipeline([], [{
      build: { sliceNames: ["b"], before: () => { useChain().skip(); }, after },
    }]);
    await loaf.load();
    expect(await loaf.execute("build", "s")).toBe("s-a-c");
    expect(after).not.toHaveBeenCalled();
  });

  it("skip in a before hook stops later before hooks for that slice", async () => {
    const second = jest.fn();
    const loaf = pipeline([], [
      { build: { sliceNames: ["b"], before: () => { useChain().skip(); } } },
      { build: { sliceNames: ["b"], before: second } },
    ]);
    await loaf.load();
    await loaf.execute("build", "s");
    expect(second).not.toHaveBeenCalled();
  });

  it("redirect to a slice from a before hook jumps ahead", async () => {
    const loaf = pipeline([], [{
      build: { sliceNames: ["a"], before: () => { useChain().redirect({ slice: "c" }); } },
    }]);
    await loaf.load();
    expect(await loaf.execute("build", "s")).toBe("s-c");
  });

  it("redirect to a slice from a handler jumps ahead", async () => {
    const loaf = new Loaf({
      name: "t",
      crumbNames: ["build"],
      slices: [
        { name: "a", build: async (o: string) => { useChain().redirect({ slice: "c" }); return `${o}-a`; } },
        { name: "b", dependencies: ["a"], build: async (o: string) => `${o}-b` },
        { name: "c", dependencies: ["b"], build: async (o: string) => `${o}-c` },
      ],
    });
    await loaf.load();
    expect(await loaf.execute("build", "s")).toBe("s-a-c");
  });

  it("redirect to an event from a handler hands off the result", async () => {
    const loaf = new Loaf({
      name: "t",
      crumbNames: ["build", "fallback"],
      slices: [
        { name: "a", build: async (o: string) => { useChain().redirect({ event: "fallback" }); return `${o}-a`; } },
        { name: "b", dependencies: ["a"], build: async (o: string) => `${o}-b`, fallback: async (o: string) => `${o}-fallback` },
      ],
    });
    await loaf.load();
    expect(await loaf.execute("build", "s")).toBe("s-a-fallback");
  });

  it("redirect to an event and slice from a before hook starts that chain at the slice", async () => {
    const handler = jest.fn(async (o: string) => o);
    const loaf = new Loaf({
      name: "t",
      crumbNames: ["build", "review"],
      hooks: [{ build: { sliceNames: ["a"], before: () => { useChain().redirect({ event: "review", slice: "b" }); } } }],
      slices: [
        { name: "a", build: handler, review: async (o: string) => `${o}-review-a` },
        { name: "b", dependencies: ["a"], build: handler, review: async (o: string) => `${o}-review-b` },
      ],
    });
    await loaf.load();
    expect(await loaf.execute("build", "s")).toBe("s-review-b");
    expect(handler).not.toHaveBeenCalled();
  });

  it("chain control works with devMode tracing enabled", async () => {
    const loaf = new Loaf({
      name: "t",
      devMode: true,
      crumbNames: ["build"],
      slices: [
        { name: "a", build: async (o: string) => { useChain().redirect({ slice: "c" }); return `${o}-a`; } },
        { name: "b", dependencies: ["a"], build: async (o: string) => `${o}-b` },
        { name: "c", dependencies: ["b"], build: async (o: string) => `${o}-c` },
      ],
    });
    await loaf.load();
    expect(await loaf.execute("build", "s")).toBe("s-a-c");
  });
});

describe("hooks - negative", () => {
  it("a throwing before hook stops the chain and is annotated with its phase", async () => {
    const handler = jest.fn();
    const loaf = new Loaf({
      name: "t",
      crumbNames: ["build"],
      hooks: [{ build: { before: () => { throw new Error("hook failed"); } } }],
      slices: [{ name: "a", build: handler }],
    });
    await loaf.load();
    const error: any = await loaf.execute("build", "s").catch((e) => e);
    expect(error.message).toBe("hook failed [at build(a:before)]");
    expect(error.slicePath).toEqual([{ event: "build", slice: "a", phase: "before" }]);
    expect(handler).not.toHaveBeenCalled();
  });

  it("a rejecting after hook is annotated with its phase", async () => {
    const loaf = new Loaf({
      name: "t",
      crumbNames: ["build"],
      hooks: [{ build: { after: async () => { throw new Error("after failed"); } } }],
      slices: [{ name: "a", build: async (o: string) => o }],
    });
    await loaf.load();
    await expect(loaf.execute("build", "s")).rejects.toThrow("after failed [at build(a:after)]");
  });

  it("async hooks make sync() throw", async () => {
    const loaf = new Loaf({
      name: "t",
      crumbNames: ["label"],
      hooks: [{ label: { before: async (o: string) => o } }],
      slices: [{ name: "a", label: (o: string) => o }],
    });
    await loaf.load();
    expect(() => loaf.sync("label", "x")).toThrow("Cannot use sync with async functions");
  });

  it("useChain in a Load hook throws because Load is not a chain", async () => {
    const loaf = new Loaf({
      name: "t",
      hooks: [{ [Loaf.Load]: { before: () => { useChain(); } } }],
      slices: [{ name: "a", [Loaf.Load]: async () => {} }],
    });
    await expect(loaf.load()).rejects.toThrow("useChain() is only available in sequential chains");
  });

  it("a hook targeting a slice that does not exist never runs", async () => {
    const before = jest.fn();
    const loaf = pipeline([], [{ build: { sliceNames: ["missing"], before } }]);
    await loaf.load();
    expect(await loaf.execute("build", "s")).toBe("s-a-b-c");
    expect(before).not.toHaveBeenCalled();
  });
});
