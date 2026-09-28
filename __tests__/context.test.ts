import { describe, it, expect } from "@jest/globals";
import Loaf from "../src/loaf";
import { runInContext, useLoaf, useSlice } from "../src/context";
import { Toast } from "../src/types/loaf";

describe("context - positive", () => {
  const loaf = new Loaf({ name: "t", slices: [] });
  const slice = { id: "s", name: "s", dependencyInfos: [] } as Toast;

  it("useLoaf and useSlice return the current context", () => {
    runInContext({ loaf, slice }, () => {
      expect(useLoaf()).toBe(loaf);
      expect(useSlice()).toBe(slice);
    });
  });
  it("runInContext returns the callback result", async () => {
    expect(runInContext({ loaf }, () => 42)).toBe(42);
    await expect(runInContext({ loaf }, async () => 43)).resolves.toBe(43);
  });
  it("nested contexts shadow and then restore the outer context", () => {
    const inner = { id: "i", name: "i", dependencyInfos: [] } as Toast;
    runInContext({ loaf, slice }, () => {
      runInContext({ loaf, slice: inner }, () => {
        expect(useSlice()).toBe(inner);
      });
      expect(useSlice()).toBe(slice);
    });
  });
  it("the context propagates across awaits", async () => {
    await runInContext({ loaf, slice }, async () => {
      await new Promise((r) => setTimeout(r, 1));
      expect(useSlice()).toBe(slice);
    });
  });
});

describe("context - negative", () => {
  it("useLoaf throws outside a context", () => {
    expect(() => useLoaf()).toThrow("useLoaf() must be called inside a Loaf handler");
  });
  it("useSlice throws outside a context", () => {
    expect(() => useSlice()).toThrow("useSlice() must be called inside a slice handler");
  });
  it("useSlice throws in a loaf-only context", () => {
    const loaf = new Loaf({ name: "t", slices: [] });
    runInContext({ loaf }, () => {
      expect(() => useSlice()).toThrow("useSlice() must be called inside a slice handler");
    });
  });
  it("the context does not leak after runInContext returns", () => {
    const loaf = new Loaf({ name: "t", slices: [] });
    runInContext({ loaf }, () => {});
    expect(() => useLoaf()).toThrow();
  });
});
