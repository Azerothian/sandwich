import { describe, it, expect, jest, afterEach } from "@jest/globals";
import path from "path";
import Loaf from "../src/loaf";
import { buildToast, getDependencyInfos, importAndCreateToast, sortArrayByDependencyInfo, testForRequired } from "../src/kitchen";
import { DependencyInfo, Toast } from "../src/types/loaf";
import { AdjacencyError } from "../src/utils/topo-graph";

describe("Kitchen - testForRequired", () => {
  it("test for required fields - failure - string", () => {
    expect(() => testForRequired(["test1", "test2", "test3"], ["test4"]))
      .toThrow('Missing required dependency - test4');
  })
  it("test for required fields - failure - oneOf", () => {
    expect(() => testForRequired(["test1", "test2", "test3"], [{oneOf: ["test4", "test5"]}]))
      .toThrow('Missing at least one of the required dependencies - test4, test5');
  })
  it("test for required fields - success - string", () => {
    const result = testForRequired(["test1", "test2", "test3"], ["test2"]);
    expect(result).toBe(true);
  })

  it("test for required fields - success - oneOf", () => {
    const result = testForRequired(["test1", "test2", "test3"], [{oneOf: ["test2", "test5"]}]);
    expect(result).toBe(true);
  })
});


describe("Kitchen - sortArrayByDependencyInfo", () => {

  it("test sort - before - no change", () => {
    const moduleNames = ["test1", "test2", "test3"];
    const deps: DependencyInfo[] = [{
      moduleName: "test2",
      required: {
        before: ["test1"]
      }
    }, {
      moduleName: "test3",
      required: {
        before: ["test2"]
      }
    },
  ];
    const sorted = sortArrayByDependencyInfo(moduleNames, deps);
    expect(sorted.indexOf("test2")).toBeGreaterThan(sorted.indexOf("test1"));
    expect(sorted.indexOf("test3")).toBeGreaterThan(sorted.indexOf("test2"));
    expect(sorted).toEqual(["test1", "test2", "test3"]);
  })
  it("test sort - reverse array", () => {
    const moduleNames = ["test1", "test2", "test3"];
    const deps: DependencyInfo[] = [{
      moduleName: "test2",
      required: {
        before: ["test3"]
      }
    }, {
      moduleName: "test1",
      required: {
        before: ["test2"]
      }
    }, 
    // {
    //   moduleName: "test3",
    //   required: {
    //     before: ["test1"]
    //   }
    // }
  ];
    const sorted = sortArrayByDependencyInfo(moduleNames, deps);
    expect(sorted.indexOf("test3")).toBeLessThan(sorted.indexOf("test2"));
    expect(sorted.indexOf("test2")).toBeLessThan(sorted.indexOf("test1"));
    expect(sorted).toEqual(["test3", "test2", "test1"]);
  });

  it("test sort - complex", () => {
    // randomise the order of the array
    const moduleNames = ["test2", "test5", "test1", "test4", "test3"];


    // ["test5", "test2", "test3", "test1", "test4"]
    // moduleNames.sort(() => Math.random() - 0.5);
    const deps: DependencyInfo[] = [{
      moduleName: "test3",
      required: {
        before: ["test2", "test5"],
        after: ["test1"]
        // after: [{oneOf: ["test1", "test2"]}]
      }
    }, {
      moduleName: "test4",
      required: {
        before: ["test1", "test5"],
        // after: ["test3"]
      }
    }, 
    // {
    //   moduleName: "test1",
    //   required: {
    //     before: ["test3", "test4"]
    //   }
    // }
  ];
    const sorted = sortArrayByDependencyInfo(moduleNames, deps);
    // expect(sorted).toEqual([ "test3", "test2", "test5", "test1", "test4"]);
    expect(sorted.indexOf("test3")).toBeGreaterThan(sorted.indexOf("test2"));
    expect(sorted.indexOf("test3")).toBeGreaterThan(sorted.indexOf("test5"));
    expect(sorted.indexOf("test3")).toBeLessThan(sorted.indexOf("test1"));
    expect(sorted.indexOf("test4")).toBeGreaterThan(sorted.indexOf("test1"));
    expect(sorted.indexOf("test4")).toBeGreaterThan(sorted.indexOf("test5"));

  });

  it("test sort - string array - reverse array", () => {
    const moduleNames = ["test1", "test2", "test3"];
    const deps: DependencyInfo[] = [{
      moduleName: "test2",
      required: ["test3"],
    }, {
      moduleName: "test1",
      required: ["test2"]
    }];
    const sorted = sortArrayByDependencyInfo(moduleNames, deps);
    expect(sorted.indexOf("test3")).toBeLessThan(sorted.indexOf("test2"));
    expect(sorted.indexOf("test2")).toBeLessThan(sorted.indexOf("test1"));
    expect(sorted).toEqual(["test3", "test2", "test1"]);
  })
});

describe("Kitchen - testForRequired - positive", () => {
  it("returns true when nothing is required", () => {
    expect(testForRequired([], [])).toBe(true);
  });
  it("returns true when every required module is present", () => {
    expect(testForRequired(["a", "b", "c"], ["a", "c"])).toBe(true);
  });
  it("oneOf passes when all options are present", () => {
    expect(testForRequired(["a", "b"], [{ oneOf: ["a", "b"] }])).toBe(true);
  });
  it("mixed strings and oneOf pass when satisfied", () => {
    expect(testForRequired(["a", "b", "c"], ["a", { oneOf: ["x", "c"] }])).toBe(true);
  });
});

describe("Kitchen - testForRequired - negative", () => {
  it("throws when there are no modules at all", () => {
    expect(() => testForRequired([], ["a"])).toThrow("Missing required dependency - a");
  });
  it("reports the first missing dependency", () => {
    expect(() => testForRequired(["a"], ["a", "b", "c"])).toThrow("Missing required dependency - b");
  });
  it("throws for a missing string even when a oneOf is satisfied", () => {
    expect(() => testForRequired(["a"], [{ oneOf: ["a"] }, "z"])).toThrow("Missing required dependency - z");
  });
  it("throws for an empty oneOf", () => {
    expect(() => testForRequired(["a"], [{ oneOf: [] }])).toThrow("Missing at least one of the required dependencies - ");
  });
  it("is case sensitive", () => {
    expect(() => testForRequired(["Test1"], ["test1"])).toThrow("Missing required dependency - test1");
  });
});

describe("Kitchen - sortArrayByDependencyInfo - positive", () => {
  it("returns an empty array for no modules", () => {
    expect(sortArrayByDependencyInfo([], [])).toEqual([]);
  });
  it("keeps the original order when there are no dependencies", () => {
    expect(sortArrayByDependencyInfo(["c", "a", "b"], [])).toEqual(["c", "a", "b"]);
  });
  it("does not mutate the input array", () => {
    const moduleNames = ["a", "b"];
    sortArrayByDependencyInfo(moduleNames, [{ moduleName: "a", required: ["b"] }]);
    expect(moduleNames).toEqual(["a", "b"]);
  });
  it("required.after places the module before the target", () => {
    const sorted = sortArrayByDependencyInfo(["a", "b"], [{ moduleName: "b", required: { after: ["a"] } }]);
    expect(sorted).toEqual(["b", "a"]);
  });
  it("optional.before orders when the module is present", () => {
    const sorted = sortArrayByDependencyInfo(["a", "b"], [{ moduleName: "a", optional: { before: ["b"] } }]);
    expect(sorted).toEqual(["b", "a"]);
  });
  it("optional.after orders when the module is present", () => {
    const sorted = sortArrayByDependencyInfo(["a", "b"], [{ moduleName: "b", optional: { after: ["a"] } }]);
    expect(sorted).toEqual(["b", "a"]);
  });
  it("optional dependencies that are missing are ignored", () => {
    const sorted = sortArrayByDependencyInfo(["a", "b"], [{
      moduleName: "a",
      optional: { before: ["missing"], after: ["also-missing"] },
    }]);
    expect(sorted).toEqual(["a", "b"]);
  });
  it("event scoped dependencies are ignored when no event is given", () => {
    const deps: DependencyInfo[] = [{ moduleName: "a", event: "custom", required: ["b"] }];
    expect(sortArrayByDependencyInfo(["a", "b"], deps)).toEqual(["a", "b"]);
  });
  it("event scoped dependencies apply to the matching event", () => {
    const deps: DependencyInfo[] = [{ moduleName: "a", event: "custom", required: ["b"] }];
    expect(sortArrayByDependencyInfo(["a", "b"], deps, "custom")).toEqual(["b", "a"]);
  });
  it("event scoped dependencies are ignored for a different event", () => {
    const deps: DependencyInfo[] = [{ moduleName: "a", event: "custom", required: ["b"] }];
    expect(sortArrayByDependencyInfo(["a", "b"], deps, "other")).toEqual(["a", "b"]);
  });
  it("oneOf orders after the present option", () => {
    const deps: DependencyInfo[] = [{ moduleName: "a", required: [{ oneOf: ["b", "missing"] }] }];
    expect(sortArrayByDependencyInfo(["a", "b"], deps)).toEqual(["b", "a"]);
  });
  it("oneOf orders after every present option", () => {
    const deps: DependencyInfo[] = [{ moduleName: "a", required: { before: [{ oneOf: ["b", "c"] }] } }];
    expect(sortArrayByDependencyInfo(["a", "b", "c"], deps)).toEqual(["b", "c", "a"]);
  });
  it("oneOf in required.after orders before the present option", () => {
    const deps: DependencyInfo[] = [{ moduleName: "b", required: { after: [{ oneOf: ["a", "missing"] }] } }];
    expect(sortArrayByDependencyInfo(["a", "b"], deps)).toEqual(["b", "a"]);
  });
  it("unscoped dependencies still apply when an event is given", () => {
    const deps: DependencyInfo[] = [{ moduleName: "a", required: ["b"] }];
    expect(sortArrayByDependencyInfo(["a", "b"], deps, "custom")).toEqual(["b", "a"]);
  });
});

describe("Kitchen - sortArrayByDependencyInfo - negative", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });
  it("throws when a required.before module is missing", () => {
    expect(() => sortArrayByDependencyInfo(["a"], [{ moduleName: "a", required: ["b"] }]))
      .toThrow("Missing required dependency - b");
  });
  it("throws when a required.after module is missing", () => {
    expect(() => sortArrayByDependencyInfo(["a"], [{ moduleName: "a", required: { after: ["b"] } }]))
      .toThrow("Missing required dependency - b");
  });
  it("throws for missing requirements even when scoped to another event", () => {
    const deps: DependencyInfo[] = [{ moduleName: "a", event: "custom", required: ["b"] }];
    expect(() => sortArrayByDependencyInfo(["a"], deps)).toThrow("Missing required dependency - b");
  });
  it("throws AdjacencyError on a circular dependency and logs details", () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const deps: DependencyInfo[] = [
      { moduleName: "a", required: ["b"] },
      { moduleName: "b", required: ["a"] },
    ];
    expect(() => sortArrayByDependencyInfo(["a", "b"], deps)).toThrow(AdjacencyError);
    expect(errorSpy).toHaveBeenCalledWith("Graph has a cycle. Topological sorting is not possible.");
  });
  it("throws AdjacencyError when a module depends on itself", () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() => sortArrayByDependencyInfo(["a"], [{ moduleName: "a", required: ["a"] }]))
      .toThrow(AdjacencyError);
  });
  it("throws when no oneOf option is present", () => {
    const deps: DependencyInfo[] = [{ moduleName: "a", required: [{ oneOf: ["b", "c"] }] }];
    expect(() => sortArrayByDependencyInfo(["a"], deps))
      .toThrow("Missing at least one of the required dependencies - b, c");
  });
  it("throws AdjacencyError on a before/after conflict", () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const deps: DependencyInfo[] = [{ moduleName: "a", required: { before: ["b"], after: ["b"] } }];
    expect(() => sortArrayByDependencyInfo(["a", "b"], deps)).toThrow(AdjacencyError);
  });
});

describe("Kitchen - getDependencyInfos", () => {
  it("returns undefined when there are no dependencies", () => {
    expect(getDependencyInfos({ id: "a", name: "a" } as Toast)).toBeUndefined();
  });
  it("an empty dependency array yields a single empty required entry", () => {
    expect(getDependencyInfos({ id: "a", name: "a", dependencies: [] } as unknown as Toast))
      .toEqual([{ moduleName: "a", required: { before: [] } }]);
  });
  it("converts string and oneOf dependencies into required.before", () => {
    const result = getDependencyInfos({
      id: "a", name: "a", dependencies: ["b", { oneOf: ["c", "d"] }],
    } as unknown as Toast);
    expect(result).toEqual([{ moduleName: "a", required: { before: ["b", { oneOf: ["c", "d"] }] } }]);
  });
  it("defaults DependencyInfo.moduleName to the slice id", () => {
    const result = getDependencyInfos({
      id: "a", name: "a", dependencies: [{ event: "custom", required: ["b"] }],
    } as unknown as Toast);
    expect(result[0]).toEqual({ moduleName: "a", event: "custom", required: ["b"] });
  });
  it("keeps an explicit DependencyInfo.moduleName", () => {
    const result = getDependencyInfos({
      id: "a", name: "a", dependencies: [{ moduleName: "other", required: ["b"] }],
    } as unknown as Toast);
    expect(result[0].moduleName).toBe("other");
  });
});

describe("Kitchen - buildToast - positive", () => {
  const loaf = new Loaf({ name: "kitchen-test", slices: [] });
  it("uses a plain object as is", async () => {
    const slice = { name: "plain" };
    const toast = await buildToast(slice, loaf, process.cwd(), 0);
    expect(toast).toBe(slice);
    expect(toast.id).toBe("plain");
  });
  it("clones a plain object when clone is set", async () => {
    const slice = { name: "plain" };
    const toast = await buildToast(slice, loaf, process.cwd(), 0, true);
    expect(toast).not.toBe(slice);
    expect(toast.name).toBe("plain");
    expect((slice as any).id).toBeUndefined();
  });
  it("instantiates classes", async () => {
    class MySlice { name = "my-class"; }
    const toast = await buildToast(MySlice, loaf, process.cwd(), 0);
    expect(toast).toBeInstanceOf(MySlice);
    expect(toast.id).toBe("my-class");
  });
  it("calls buildSlice with the loaf", async () => {
    const buildSlice = jest.fn((l: Loaf) => ({ name: "built", loaf: l }));
    const toast = await buildToast({ buildSlice }, loaf, process.cwd(), 0);
    expect(buildSlice).toHaveBeenCalledWith(loaf);
    expect(toast.id).toBe("built");
    expect(toast.loaf).toBe(loaf);
  });
  it("generates an id when the slice has no name", async () => {
    const toast = await buildToast({}, loaf, process.cwd(), 0);
    expect(toast.id).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("normalises string dependencies into dependencyInfos", async () => {
    const toast = await buildToast({ name: "a", dependencies: ["b"] }, loaf, process.cwd(), 0);
    expect(toast.dependencyInfos).toEqual([{ moduleName: "a", required: { before: ["b"] } }]);
  });
  it("imports the default export of a relative module path", async () => {
    const toast = await buildToast("./fixtures/default-export-slice", loaf, __dirname, 0);
    expect(toast.id).toBe("default-export-slice");
  });
  it("imports the module namespace when there is no default export", async () => {
    const toast = await buildToast("./fixtures/named-export-slice", loaf, __dirname, 0);
    expect(toast.id).toBe("named-export-slice");
  });
  it("imports and instantiates a default exported class", async () => {
    const toast = await buildToast("./fixtures/class-slice", loaf, __dirname, 0);
    expect(toast.id).toBe("class-slice");
  });
  it("imports an absolute module path", async () => {
    const toast = await buildToast(path.join(__dirname, "fixtures/default-export-slice"), loaf, "/nowhere", 0);
    expect(toast.id).toBe("default-export-slice");
  });
});

describe("Kitchen - buildToast - negative", () => {
  const loaf = new Loaf({ name: "kitchen-test", slices: [] });
  it("throws for null slice data", async () => {
    await expect(buildToast(null, loaf, process.cwd(), 3))
      .rejects.toThrow("Could not load module null at index 3 in slices array");
  });
  it("throws for undefined slice data", async () => {
    await expect(buildToast(undefined, loaf, process.cwd(), 0))
      .rejects.toThrow("Could not load module undefined at index 0 in slices array");
  });
  it("rejects when a module path cannot be resolved", async () => {
    await expect(buildToast("./fixtures/does-not-exist", loaf, __dirname, 0)).rejects.toThrow();
  });
  it("rejects when a class constructor throws", async () => {
    class Broken { constructor() { throw new Error("ctor failed"); } }
    await expect(buildToast(Broken, loaf, process.cwd(), 0)).rejects.toThrow("ctor failed");
  });
  it("rejects when buildSlice throws", async () => {
    const buildSlice = () => { throw new Error("factory failed"); };
    await expect(buildToast({ buildSlice }, loaf, process.cwd(), 0)).rejects.toThrow("factory failed");
  });
});

describe("Kitchen - importAndCreateToast", () => {
  const loaf = new Loaf({ name: "kitchen-test", slices: [] });
  it("keys slices by id", async () => {
    const slices = await importAndCreateToast({ name: "t", slices: [{ name: "a" }, { name: "b" }] }, loaf);
    expect(Object.keys(slices)).toEqual(["a", "b"]);
  });
  it("returns an empty object for no slices", async () => {
    expect(await importAndCreateToast({ name: "t", slices: [] }, loaf)).toEqual({});
  });
  it("a duplicate slice name overwrites the earlier slice", async () => {
    const first = { name: "a", v: 1 };
    const second = { name: "a", v: 2 };
    const slices = await importAndCreateToast({ name: "t", slices: [first, second] }, loaf);
    expect(Object.keys(slices)).toEqual(["a"]);
    expect(slices.a).toBe(second);
  });
  it("rejects with the index of an invalid slice", async () => {
    await expect(importAndCreateToast({ name: "t", slices: [{ name: "a" }, null] }, loaf))
      .rejects.toThrow("at index 1 in slices array");
  });
});
