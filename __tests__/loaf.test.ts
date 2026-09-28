import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import Loaf from "../src/loaf";
import Slice from "../src/slice";
import { useLoaf, useSlice } from "../src/context";
import { createLogger } from "../src/utils/logger";
import { ISlice, LoafEvent, Logger } from "../src/types/loaf";
import { AdjacencyError } from "../src/utils/topo-graph";
const logger = createLogger("loaf");
describe('Loaf', () => {
  it('should be defined', () => {
    expect(Loaf).toBeDefined();
  });
  it('should be a class', () => {
    const loaf = new Loaf({ name: 'test', slices: [] });
    expect(loaf).toBeInstanceOf(Loaf);
  });
  it('basic slice - testing load event', async () => {
    let l = 0;
    const loaf = new Loaf({
      name: 'test',
      slices: [{
        name: "slice1",
        [Loaf.Load]: async () => {
          l++;
        }
      }]
    });
    await loaf.start();
    expect(l).toBe(1);
  });
  it('basic slice - testing order of eventa', async () => {
    const l: string[] = [];
    const loaf = new Loaf({
      name: 'test', slices: [{
        name: "slice1",
        [Loaf.Load]: async () => {
          l.push('load');
        },
        [Loaf.Initialize]: async () => {
          l.push('initialize');
        },
        [Loaf.Ready]: async () => {
          l.push('ready');
        },
        [Loaf.Shutdown]: async () => {
          l.push('shutdown');
        }
      }]
    });
    await loaf.start();
    await loaf.shutdown();
    logger.debug("execution path", l);
    expect(l).toEqual(['load', 'initialize', 'ready', 'shutdown']);
  });

  it('basic slice - testing order of events', async () => {
    let l: string[] = [];
    const loaf = new Loaf({
      name: 'test',
      slices: [{
        name: "test1",
        [Loaf.Load]: async () => {
          l.push('load1');
        },
        [Loaf.Initialize]: async () => {
          l.push('initialize1');
        },
        [Loaf.Ready]: async () => {
          l.push('ready1');
        },
        [Loaf.Shutdown]: async () => {
          l.push('shutdown1');
        }
      }, {
        name: "test2",
        dependencies: ["test1"],
        [Loaf.Load]: async () => {
          l.push('load2');
        },
        [Loaf.Initialize]: async () => {
          l.push('initialize2');
        },
        [Loaf.Ready]: async () => {
          l.push('ready2');
        },
        [Loaf.Shutdown]: async () => {
          l.push('shutdown2');
        }
      }]
    });
    await loaf.start();
    await loaf.shutdown();
    expect(l).toEqual(['load1', 'load2', 'initialize1', 'initialize2', 'ready1', 'ready2', 'shutdown1', 'shutdown2']);
  });
  it('basic slice - testing order of events - with dependencies', async () => {
    let l: string[] = [];
    const loaf = new Loaf({
      name: 'test',
      slices: [{
        name: "test1",
        dependencies: ["test2"],
        // [Loaf.Load]: async () => {
        //   l.push('load1');
        // },
        [Loaf.Initialize]: async () => {
          l.push('initialize1');
        },
        [Loaf.Ready]: async () => {
          l.push('ready1');
        },
        [Loaf.Shutdown]: async () => {
          l.push('shutdown1');
        }
      }, {
        name: "test2",
        // [Loaf.Load]: async () => {
        //   l.push('load2');
        // },
        [Loaf.Initialize]: async () => {
          l.push('initialize2');
        },
        [Loaf.Ready]: async () => {
          l.push('ready2');
        },
        [Loaf.Shutdown]: async () => {
          l.push('shutdown2');
        }
      }]
    });
    await loaf.start();
    await loaf.shutdown();
    expect(l).toEqual(['initialize2', 'initialize1', 'ready2', 'ready1', 'shutdown2', 'shutdown1']);
  });
  it('complex slice reqs - independent function reordering', async () => {
    let l: string[] = [];
    const loaf = new Loaf({
      name: 'test',
      slices: [{
        name: "test2",
        dependencies: ["test1"],
        [Loaf.Initialize]: async () => {
          l.push('initialize2');
        },
        [Loaf.Ready]: async () => {
          l.push('ready2');
        }
      }, {
        name: "test3",
        dependencies: [{
          event: Loaf.Initialize,
          required: {
            before: ["test1"],
            after: ["test4"]
          }
        }],
        [Loaf.Initialize]: async () => {
          l.push('initialize3');
        },
        [Loaf.Ready]: async () => {
          l.push('ready3');
        }
      }, {
        name: "test4",
        dependencies: [{
          event: Loaf.Ready,
          required: {
            before: ["test2", "test1"],
            after: ["test3"],
          },
        }],
        [Loaf.Initialize]: async () => {
          l.push('initialize4');
        },
        [Loaf.Ready]: async () => {
          l.push('ready4');
        }
      }, {
        name: "test1",
        dependencies: [],
        [Loaf.Initialize]: async () => {
          l.push('initialize1');
        },
        [Loaf.Ready]: async () => {
          l.push('ready1');
        }
      }]
    });

    logger.debug("execution path", l);
    await loaf.load();
    await loaf.initialize();
    await loaf.ready();
    expect(l.indexOf('initialize1')).toBeLessThan(l.indexOf('initialize2'));
    expect(l.indexOf('initialize2')).toBeLessThan(l.indexOf('initialize3'));
    expect(l.indexOf('initialize3')).toBeLessThan(l.indexOf('initialize4'));

    expect(l.indexOf('ready1')).toBeLessThan(l.indexOf('ready2'));
    expect(l.indexOf('ready2')).toBeLessThan(l.indexOf('ready4'));
    expect(l.indexOf('ready4')).toBeLessThan(l.indexOf('ready3'));


    // 0:
    // 'initialize4'
    // 1:
    // 'initialize3'
    // 2:
    // 'initialize2'
    // 3:
    // 'initialize1'
    // 4:
    // 'ready3'
    // 5:
    // 'ready4'
    // 6:
    // 'ready2'
    // 7:
    // 'ready1'
  });



  it('ensuring crumbs only hold the modules that have the functions', async () => {
    let l: string[] = [];
    const loaf = new Loaf({
      name: 'test',
      slices: [{
        name: "test1",
        dependencies: [],
        [Loaf.Initialize]: async () => {
          l.push('initialize1');
        }
      }, {
        name: "test2",
        dependencies: [],
        [Loaf.Initialize]: async () => {
          l.push('initialize2');
        },
        [Loaf.Ready]: async () => {
          l.push('ready2');
        }
      }, {
        name: "test3",
        dependencies: [],
        [Loaf.Initialize]: async () => {
          l.push('initialize3');
        },
      }]
    });

    logger.debug("execution path", l);
    await loaf.load();

    expect(loaf.crumbs[LoafEvent.Initialize].length).toBe(3);
    expect(loaf.crumbs[LoafEvent.Ready].length).toBe(1);
    expect(loaf.crumbs[LoafEvent.Ready][0]).toBe("test2");
  });

  it('restrict extra crumbs from being generated', async () => {
    let l: string[] = [];
    const loaf = new Loaf({
      name: 'test',
      crumbNames: [],
      slices: [{
        name: "test1",
        dependencies: [],
        [Loaf.Initialize]: async () => {
          l.push('initialize1');
        },
        ["warrgh"]: async () => {
          l.push('warrgh');
        }

      }]
    });

    logger.debug("execution path", l);
    await loaf.load();
    expect(loaf.crumbs["warrgh"]).toBeUndefined();
  });

  it('restrict then allow crumbs getting generated', async () => {
    let l: string[] = [];
    const loaf = new Loaf({
      name: 'test',
      crumbNames: [],
      slices: [{
        name: "test1",
        dependencies: [],
        [Loaf.Initialize]: async () => {
          l.push('initialize1');
        },
        ["warrgh"]: async () => {
          l.push('warrgh');
        },
        ["warrgh2"]: async () => {
          l.push('warrgh2');
        }

      }]
    });
    loaf.allowCrumb("warrgh");

    logger.debug("execution path", l);
    await loaf.load();
    expect(loaf.crumbs["warrgh"]).not.toBeUndefined();
    expect(loaf.crumbs["warrgh2"]).toBeUndefined();
  });
  it('restrict then allow then restrict crumbs from being generated', async () => {
    let l: string[] = [];
    const loaf = new Loaf({
      name: 'test',
      crumbNames: [],
      slices: [{
        name: "test1",
        dependencies: [],
        [Loaf.Initialize]: async () => {
          l.push('initialize1');
        },
        ["warrgh"]: async () => {
          l.push('warrgh');
        },
        ["warrgh2"]: async () => {
          l.push('warrgh2');
        }

      }]
    });
    loaf.allowCrumb("warrgh");
    loaf.disallowCrumb("warrgh");

    logger.debug("execution path", l);
    await loaf.load();
    expect(loaf.crumbs["warrgh"]).toBeUndefined();
    expect(loaf.crumbs["warrgh2"]).toBeUndefined();
  });
  it('using ISlice.allow to allow crumb while restriction is enabled', async () => {
    let l: string[] = [];
    const loaf = new Loaf({
      name: 'test',
      crumbNames: [],
      slices: [{
        name: "test1",
        dependencies: [],
        allow: ["warrgh"],
        [Loaf.Initialize]: async () => {
          l.push('initialize1');
        },
        ["warrgh"]: async () => {
          l.push('warrgh');
        },
        ["warrgh2"]: async () => {
          l.push('warrgh2');
        }

      }]
    });

    logger.debug("execution path", l);
    await loaf.load();
    expect(loaf.crumbs["warrgh"]).not.toBeUndefined();
    expect(loaf.crumbs["warrgh2"]).toBeUndefined();
  });

  it('using ISlice.ignore should only affect this slice', async () => {
    let l: string[] = [];
    const loaf = new Loaf({
      name: 'test',
      crumbNames: [],
      slices: [{
        name: "test1",
        dependencies: [],
        allow: ["warrgh", "warrgh2"],
        ignore: ["warrgh2"],
        [Loaf.Initialize]: async () => {
          l.push('initialize1');
          await useLoaf().execute("warrgh");
        },
        ["warrgh"]: async () => {
          l.push('warrgh');
          await useLoaf().execute("warrgh2");
        },
        ["warrgh2"]: async () => {
          l.push('warrgh2');
        }

      }]
    },);

    await loaf.load();
    await loaf.initialize();
    expect(l.includes("initialize1")).toBeTruthy();
    expect(l.includes("warrgh")).toBeTruthy();
    expect(l.includes("warrgh2")).not.toBeTruthy();
  });

  it('using ISlice.allow should affect all slices', async () => {
    let l: string[] = [];
    const loaf = new Loaf({
      name: 'test',
      crumbNames: [],
      slices: [{
        name: "test1",
        dependencies: [],
        allow: ["warrgh", "warrgh2"],
        [Loaf.Initialize]: async () => {
          l.push('initialize1');
          await useLoaf().execute("warrgh");
        },

      }, {
        name: "test2",
        dependencies: [],
        ["warrgh"]: async () => {
          l.push('warrgh');
          await useLoaf().execute("warrgh2");
        },
        ["warrgh2"]: async () => {
          l.push('warrgh2');
        }
      }]
    },);

    await loaf.load();
    await loaf.initialize();
    expect(l.includes("initialize1")).toBeTruthy();
    expect(l.includes("warrgh")).toBeTruthy();
    expect(l.includes("warrgh2")).toBeTruthy();
  });
});

// initialize() registers a process "uncaughtException" listener on every call,
// so snapshot and restore the listeners to keep tests isolated.
let uncaughtListeners: NodeJS.UncaughtExceptionListener[] = [];
beforeEach(() => {
  uncaughtListeners = process.listeners("uncaughtException");
});
afterEach(() => {
  process.removeAllListeners("uncaughtException");
  uncaughtListeners.forEach((l) => process.on("uncaughtException", l));
  jest.restoreAllMocks();
});

function silentLogger(): Logger & { error: jest.Mock } {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    err: jest.fn(),
    log: jest.fn(),
  } as any;
}

describe("Loaf - positive", () => {
  it("static event names match LoafEvent", () => {
    expect(Loaf.Load).toBe(LoafEvent.Load);
    expect(Loaf.Initialize).toBe(LoafEvent.Initialize);
    expect(Loaf.Ready).toBe(LoafEvent.Ready);
    expect(Loaf.Shutdown).toBe(LoafEvent.Shutdown);
    expect(Loaf.UncaughtError).toBe(LoafEvent.UncaughtError);
    expect(Loaf.UnhandledRejection).toBe(LoafEvent.UnhandledRejection);
  });

  it("defaults cwd to process.cwd() and honours jam.cwd", () => {
    expect(new Loaf({ name: "t", slices: [] }).cwd).toBe(process.cwd());
    expect(new Loaf({ name: "t", slices: [], cwd: "/custom" }).cwd).toBe("/custom");
  });

  it("uses a custom logger when provided", async () => {
    const logger = silentLogger();
    const loaf = new Loaf({ name: "t", slices: [{ name: "a" }], logger });
    expect(loaf.logger).toBe(logger);
    await loaf.load();
    expect(logger.debug).toHaveBeenCalled();
  });

  it("starts and shuts down with no slices", async () => {
    const loaf = new Loaf({ name: "t", slices: [] });
    await expect(loaf.start()).resolves.toBeUndefined();
    await expect(loaf.shutdown()).resolves.toBeUndefined();
  });

  it("get returns a loaded slice by name", async () => {
    const slice = { name: "a", value: 42 };
    const loaf = new Loaf({ name: "t", slices: [slice] });
    await loaf.load();
    expect(loaf.get<typeof slice>("a").value).toBe(42);
    expect(loaf.get("missing")).toBeUndefined();
  });

  it("Load runs with the loaf and slice in context and no arguments", async () => {
    let args: any[] = [];
    let seen: any = {};
    const slice = {
      name: "a",
      [Loaf.Load]: async (...rest: any[]) => {
        args = rest;
        seen = { loaf: useLoaf(), slice: useSlice() };
      },
    };
    const loaf = new Loaf({ name: "t", slices: [slice] });
    await loaf.load();
    expect(args).toEqual([]);
    expect(seen.loaf).toBe(loaf);
    expect(seen.slice).toBe(slice);
  });

  it("lifecycle handlers get the slice as `this` and from useSlice(), with no arguments", async () => {
    let self: any;
    let args: any[] = [];
    let fromContext: any;
    const slice = {
      name: "a",
      [Loaf.Initialize]: async function (this: any, ...rest: any[]) {
        self = this;
        args = rest;
        fromContext = useSlice();
      },
    };
    const loaf = new Loaf({ name: "t", slices: [slice] });
    await loaf.start();
    expect(self).toBe(slice);
    expect(args).toEqual([undefined]);
    expect(fromContext).toBe(slice);
  });

  it("lifecycle return values are ignored", async () => {
    const received: any[] = [];
    const loaf = new Loaf({
      name: "t",
      slices: [{
        name: "a",
        [Loaf.Initialize]: async () => "from-a",
      }, {
        name: "b",
        dependencies: ["a"],
        [Loaf.Initialize]: async (value: any) => {
          received.push(value);
        },
      }],
    });
    await loaf.start();
    expect(received).toEqual([undefined]);
  });

  it("each lifecycle handler sees its own slice", async () => {
    const seen: string[] = [];
    const loaf = new Loaf({
      name: "t",
      slices: ["a", "b", "c"].map((name) => ({
        name,
        [Loaf.Ready]: async () => { seen.push(useSlice<ISlice>().name); },
      })),
    });
    await loaf.start();
    expect(seen).toEqual(["a", "b", "c"]);
  });

  it("custom crumbs keep the data waterfall without appending the slice", async () => {
    const calls: any[][] = [];
    const loaf = new Loaf({
      name: "t",
      crumbNames: ["build"],
      slices: [{
        name: "a",
        build: async (...args: any[]) => { calls.push(args); return `${args[0]}-a`; },
      }, {
        name: "b",
        dependencies: ["a"],
        build: async (...args: any[]) => { calls.push(args); return `${args[0]}-b`; },
      }],
    });
    await loaf.load();
    expect(await loaf.execute("build", "start", "extra")).toBe("start-a-b");
    expect(calls).toEqual([["start", "extra"], ["start-a", "extra"]]);
  });

  it("the context survives awaits and timers inside a handler", async () => {
    let seen: any = {};
    const slice = {
      name: "a",
      [Loaf.Initialize]: async () => {
        await new Promise((r) => setTimeout(r, 5));
        const fromTimer = await new Promise((r) => setTimeout(() => r(useSlice()), 5));
        seen = { loaf: useLoaf(), slice: fromTimer };
      },
    };
    const loaf = new Loaf({ name: "t", slices: [slice] });
    await loaf.start();
    expect(seen.loaf).toBe(loaf);
    expect(seen.slice).toBe(slice);
  });

  it("nested executes see the inner slice and restore the outer slice", async () => {
    const seen: string[] = [];
    const loaf = new Loaf({
      name: "t",
      crumbNames: ["inner"],
      slices: [{
        name: "outer",
        [Loaf.Initialize]: async () => {
          seen.push(`before:${useSlice<ISlice>().name}`);
          await useLoaf().execute("inner");
          seen.push(`after:${useSlice<ISlice>().name}`);
        },
      }, {
        name: "inner-slice",
        inner: async () => { seen.push(`inner:${useSlice<ISlice>().name}`); },
      }],
    });
    await loaf.start();
    expect(seen).toEqual(["before:outer", "inner:inner-slice", "after:outer"]);
  });

  it("all() runs each handler with its own slice", async () => {
    const loaf = new Loaf({
      name: "t",
      crumbNames: ["who"],
      slices: ["a", "b"].map((name) => ({
        name,
        who: async () => {
          await new Promise((r) => setTimeout(r, name === "a" ? 10 : 0));
          return useSlice<ISlice>().name;
        },
      })),
    });
    await loaf.load();
    expect(await loaf.all("who", undefined)).toEqual(["a", "b"]);
  });

  it("concurrently started loaves each see their own loaf", async () => {
    const seen = new Map<string, Loaf>();
    const make = (name: string) => new Loaf({
      name,
      slices: [{
        name: "s",
        [Loaf.Initialize]: async () => {
          await new Promise((r) => setTimeout(r, name === "one" ? 10 : 0));
          seen.set(name, useLoaf());
        },
      }],
    });
    const one = make("one");
    const two = make("two");
    await Promise.all([one.start(), two.start()]);
    expect(seen.get("one")).toBe(one);
    expect(seen.get("two")).toBe(two);
  });

  it("buildSlice can use useLoaf() but has no slice context", async () => {
    let fromContext: any;
    let sliceError: any;
    const loaf = new Loaf({
      name: "t",
      slices: [{
        buildSlice: () => {
          fromContext = useLoaf();
          try { useSlice(); } catch (e) { sliceError = e; }
          return { name: "built" };
        },
      }],
    });
    await loaf.load();
    expect(fromContext).toBe(loaf);
    expect(sliceError?.message).toBe("useSlice() must be called inside a slice handler");
  });

  it("builds slices from Slice subclasses", async () => {
    const calls: string[] = [];
    class MySlice extends Slice {
      constructor() {
        super();
        this.name = "my-slice";
      }
      [LoafEvent.Initialize] = async () => {
        calls.push(`init:${useSlice<ISlice>().name}`);
      };
    }
    const loaf = new Loaf({ name: "t", slices: [MySlice] });
    await loaf.start();
    expect(loaf.get<MySlice>("my-slice")).toBeInstanceOf(MySlice);
    expect(calls).toEqual(["init:my-slice"]);
  });

  it("builds slices from a buildSlice factory", async () => {
    const loaf = new Loaf({
      name: "t",
      slices: [{ buildSlice: (l: Loaf) => ({ name: "built", owner: l }) }],
    });
    await loaf.load();
    expect(loaf.get<any>("built").owner).toBe(loaf);
  });

  it("clone keeps slice objects isolated between loaves", async () => {
    const shared = { name: "shared" };
    const loaf1 = new Loaf({ name: "t1", slices: [shared], clone: true });
    const loaf2 = new Loaf({ name: "t2", slices: [shared], clone: true });
    await loaf1.load();
    await loaf2.load();
    expect(loaf1.get("shared")).not.toBe(shared);
    expect(loaf1.get("shared")).not.toBe(loaf2.get("shared"));
  });

  it("custom crumbs from jam.crumbNames can be executed and chained", async () => {
    const loaf = new Loaf({
      name: "t",
      crumbNames: ["build"],
      slices: [{
        name: "a",
        build: async (o: string) => `${o}-a`,
      }, {
        name: "b",
        dependencies: ["a"],
        build: async (o: string) => `${o}-b`,
      }],
    });
    await loaf.load();
    expect(await loaf.execute("build", "start")).toBe("start-a-b");
  });

  it("allowCrumb ignores duplicates", async () => {
    const loaf = new Loaf({
      name: "t",
      crumbNames: [],
      slices: [{ name: "a", custom: async (o: number) => o + 1 }],
    });
    loaf.allowCrumb("custom", "custom");
    await loaf.load();
    expect(loaf.crumbs["custom"]).toEqual(["a"]);
    expect(await loaf.execute("custom", 0)).toBe(1);
  });

  it("unrestrictCrumb re-enables a restricted crumb", async () => {
    const loaf = new Loaf({
      name: "t",
      crumbNames: ["custom"],
      slices: [{ name: "a", custom: async (o: number) => o + 1 }],
    });
    loaf.restrictCrumb("custom");
    loaf.unrestrictCrumb("custom");
    await loaf.load();
    expect(loaf.crumbs["custom"]).toEqual(["a"]);
  });

  it("optional dependencies order slices when present", async () => {
    const l: string[] = [];
    const loaf = new Loaf({
      name: "t",
      slices: [{
        name: "a",
        dependencies: [{ optional: { before: ["b"] } }],
        [Loaf.Initialize]: async () => { l.push("a"); },
      }, {
        name: "b",
        [Loaf.Initialize]: async () => { l.push("b"); },
      }],
    });
    await loaf.start();
    expect(l).toEqual(["b", "a"]);
  });

  it("optional dependencies are ignored when absent", async () => {
    const loaf = new Loaf({
      name: "t",
      slices: [{ name: "a", dependencies: [{ optional: { before: ["missing"] } }] }],
    });
    await expect(loaf.start()).resolves.toBeUndefined();
  });

  it("devMode adds a tracing function per slice without changing the result", async () => {
    const loaf = new Loaf({
      name: "t",
      devMode: true,
      crumbNames: ["custom"],
      slices: [{ name: "a", custom: async (o: number) => o + 1 }],
    });
    await loaf.load();
    expect(loaf.funcs["custom"]).toHaveLength(2);
    expect(await loaf.execute("custom", 1)).toBe(2);
  });

  it("shutdown runs Shutdown handlers in dependency order", async () => {
    const l: string[] = [];
    const loaf = new Loaf({
      name: "t",
      slices: [{
        name: "a",
        dependencies: ["b"],
        [Loaf.Shutdown]: async () => { l.push("a"); },
      }, {
        name: "b",
        [Loaf.Shutdown]: async () => { l.push("b"); },
      }],
    });
    await loaf.start();
    await loaf.shutdown();
    expect(l).toEqual(["b", "a"]);
  });

  it("sortedSliceNames reflects dependency order", async () => {
    const loaf = new Loaf({
      name: "t",
      slices: [{ name: "a", dependencies: ["c"] }, { name: "b", dependencies: ["a"] }, { name: "c" }],
    });
    await loaf.load();
    expect(loaf.sortedSliceNames).toEqual(["c", "a", "b"]);
  });

  it("oneOf dependencies are satisfied by any present module", async () => {
    const l: string[] = [];
    const loaf = new Loaf({
      name: "t",
      slices: [{
        name: "a",
        dependencies: [{ oneOf: ["b", "c"] }],
        [Loaf.Initialize]: async () => { l.push("a"); },
      }, {
        name: "c",
        [Loaf.Initialize]: async () => { l.push("c"); },
      }],
    });
    await loaf.start();
    expect(l).toEqual(["c", "a"]);
  });

  it("oneOf dependencies order after every present option", async () => {
    const l: string[] = [];
    const loaf = new Loaf({
      name: "t",
      slices: [{
        name: "a",
        dependencies: [{ oneOf: ["b", "c"] }],
        [Loaf.Initialize]: async () => { l.push("a"); },
      }, {
        name: "b",
        [Loaf.Initialize]: async () => { l.push("b"); },
      }, {
        name: "c",
        [Loaf.Initialize]: async () => { l.push("c"); },
      }],
    });
    await loaf.start();
    expect(l).toEqual(["b", "c", "a"]);
  });

  it("initialize registers the uncaughtException listener only once", async () => {
    const loaf = new Loaf({ name: "t", slices: [] });
    const before = process.listenerCount("uncaughtException");
    await loaf.start();
    await loaf.initialize();
    expect(process.listenerCount("uncaughtException")).toBe(before + 1);
  });

  it("shutdown removes the uncaughtException listener", async () => {
    const loaf = new Loaf({ name: "t", slices: [] });
    const before = process.listenerCount("uncaughtException");
    await loaf.start();
    await loaf.shutdown();
    expect(process.listenerCount("uncaughtException")).toBe(before);
  });
});

describe("Loaf - negative", () => {
  it("load rejects when a required dependency is missing", async () => {
    const loaf = new Loaf({ name: "t", slices: [{ name: "a", dependencies: ["missing"] }] });
    await expect(loaf.load()).rejects.toThrow("Missing required dependency - missing");
  });

  it("load rejects when no oneOf dependency is present", async () => {
    const loaf = new Loaf({ name: "t", slices: [{ name: "a", dependencies: [{ oneOf: ["b", "c"] }] }] });
    await expect(loaf.load()).rejects.toThrow("Missing at least one of the required dependencies - b, c");
  });

  it("load rejects with AdjacencyError on circular dependencies", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const loaf = new Loaf({
      name: "t",
      slices: [{ name: "a", dependencies: ["b"] }, { name: "b", dependencies: ["a"] }],
    });
    await expect(loaf.load()).rejects.toThrow(AdjacencyError);
  });

  it("load rejects when a slice depends on itself", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const loaf = new Loaf({ name: "t", slices: [{ name: "a", dependencies: ["a"] }] });
    await expect(loaf.load()).rejects.toThrow(AdjacencyError);
  });

  it("load rejects when an event scoped dependency creates a cycle for that event", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const loaf = new Loaf({
      name: "t",
      slices: [{
        name: "a",
        dependencies: [{ event: Loaf.Initialize, required: ["b"] }],
        [Loaf.Initialize]: async () => {},
      }, {
        name: "b",
        dependencies: [{ event: Loaf.Initialize, required: ["a"] }],
        [Loaf.Initialize]: async () => {},
      }],
    });
    await expect(loaf.load()).rejects.toThrow(AdjacencyError);
  });

  it("load rejects with the index of an invalid slice", async () => {
    const loaf = new Loaf({ name: "t", slices: [{ name: "a" }, undefined] });
    await expect(loaf.load()).rejects.toThrow("Could not load module undefined at index 1 in slices array");
  });

  it("load rejects when a Load handler throws and later slices do not load", async () => {
    const laterLoad = jest.fn(async () => {});
    const loaf = new Loaf({
      name: "t",
      slices: [{
        name: "a",
        [Loaf.Load]: async () => { throw new Error("load failed"); },
      }, {
        name: "b",
        [Loaf.Load]: laterLoad,
      }],
    });
    await expect(loaf.load()).rejects.toThrow("load failed");
    expect(laterLoad).not.toHaveBeenCalled();
  });

  it("initialize calls UncaughtError handlers and rethrows", async () => {
    const logger = silentLogger();
    const onError = jest.fn(async () => {});
    const error = new Error("init failed");
    const loaf = new Loaf({
      name: "t",
      logger,
      slices: [{
        name: "a",
        [Loaf.Initialize]: async () => { throw error; },
        [Loaf.UncaughtError]: onError,
      }],
    });
    await loaf.load();
    await expect(loaf.initialize()).rejects.toBe(error);
    expect(onError).toHaveBeenCalledWith(error);
    expect(logger.error).toHaveBeenCalled();
  });

  it("initialize stops later slices after a failure", async () => {
    const later = jest.fn(async () => {});
    const loaf = new Loaf({
      name: "t",
      logger: silentLogger(),
      slices: [{
        name: "a",
        [Loaf.Initialize]: async () => { throw new Error("init failed"); },
      }, {
        name: "b",
        dependencies: ["a"],
        [Loaf.Initialize]: later,
      }],
    });
    await expect(loaf.start()).rejects.toThrow("init failed");
    expect(later).not.toHaveBeenCalled();
  });

  it("initialize surfaces the UncaughtError handler's own error", async () => {
    const loaf = new Loaf({
      name: "t",
      logger: silentLogger(),
      slices: [{
        name: "a",
        [Loaf.Initialize]: async () => { throw new Error("init failed"); },
        [Loaf.UncaughtError]: async () => { throw new Error("handler failed"); },
      }],
    });
    await loaf.load();
    await expect(loaf.initialize()).rejects.toThrow("handler failed");
  });

  it("initialize does not register the process listener when it fails", async () => {
    const loaf = new Loaf({
      name: "t",
      logger: silentLogger(),
      slices: [{ name: "a", [Loaf.Initialize]: async () => { throw new Error("init failed"); } }],
    });
    await loaf.load();
    const before = process.listenerCount("uncaughtException");
    await expect(loaf.initialize()).rejects.toThrow();
    expect(process.listenerCount("uncaughtException")).toBe(before);
  });

  it("ready calls UncaughtError handlers and rethrows", async () => {
    const onError = jest.fn(async () => {});
    const error = new Error("ready failed");
    const loaf = new Loaf({
      name: "t",
      logger: silentLogger(),
      slices: [{
        name: "a",
        [Loaf.Ready]: async () => { throw error; },
        [Loaf.UncaughtError]: onError,
      }],
    });
    await expect(loaf.start()).rejects.toBe(error);
    expect(onError).toHaveBeenCalledWith(error);
  });

  it("ready rejects when the UncaughtError handler throws", async () => {
    const loaf = new Loaf({
      name: "t",
      logger: silentLogger(),
      slices: [{
        name: "a",
        [Loaf.Ready]: async () => { throw new Error("ready failed"); },
        [Loaf.UncaughtError]: async () => { throw new Error("handler failed"); },
      }],
    });
    await expect(loaf.start()).rejects.toThrow("handler failed");
  });

  it("shutdown rejects when a Shutdown handler throws", async () => {
    const loaf = new Loaf({
      name: "t",
      slices: [{ name: "a", [Loaf.Shutdown]: async () => { throw new Error("shutdown failed"); } }],
    });
    await loaf.start();
    await expect(loaf.shutdown()).rejects.toThrow("shutdown failed");
  });

  it("crumbs not in the allow list are not registered", async () => {
    const custom = jest.fn(async (o: any) => o);
    const loaf = new Loaf({ name: "t", slices: [{ name: "a", custom }] });
    await loaf.load();
    expect(loaf.crumbs["custom"]).toBeUndefined();
    expect(await loaf.execute("custom", "start")).toBe("start");
    expect(custom).not.toHaveBeenCalled();
  });

  it("ignored crumbs are never executed for that slice", async () => {
    const ignored = jest.fn(async () => {});
    const loaf = new Loaf({
      name: "t",
      slices: [{ name: "a", ignore: [Loaf.Initialize], [Loaf.Initialize]: ignored }],
    });
    await loaf.start();
    expect(ignored).not.toHaveBeenCalled();
    expect(loaf.crumbs[Loaf.Initialize]).toEqual([]);
  });

  it("disallowCrumb can remove a built in lifecycle event", async () => {
    const ready = jest.fn(async () => {});
    const loaf = new Loaf({ name: "t", slices: [{ name: "a", [Loaf.Ready]: ready }] });
    loaf.disallowCrumb(Loaf.Ready);
    await loaf.start();
    expect(ready).not.toHaveBeenCalled();
  });

  it("restrictCrumb prevents a crumb from being registered", async () => {
    const custom = jest.fn(async (o: any) => o);
    const loaf = new Loaf({ name: "t", crumbNames: ["custom"], slices: [{ name: "a", custom }] });
    loaf.restrictCrumb("custom");
    await loaf.load();
    expect(loaf.crumbs["custom"]).toBeUndefined();
    await loaf.execute("custom", "start");
    expect(custom).not.toHaveBeenCalled();
  });
});

describe("Loaf - error slice paths", () => {
  it("annotates a nested error with the full slice path and keeps its identity", async () => {
    const error = new TypeError("db down");
    const loaf = new Loaf({
      name: "t",
      logger: silentLogger(),
      crumbNames: ["db:connect"],
      slices: [{
        name: "api",
        dependencies: ["database"],
        [Loaf.Initialize]: async () => { await useLoaf().execute("db:connect"); },
      }, {
        name: "database",
        "db:connect": async () => { throw error; },
      }],
    });
    await loaf.load();
    const caught: any = await loaf.initialize().catch((e) => e);
    expect(caught).toBe(error);
    expect(caught).toBeInstanceOf(TypeError);
    expect(caught.message).toBe("db down [at loaf:init(api) > db:connect(database)]");
    expect(caught.slicePath).toEqual([
      { event: Loaf.Initialize, slice: "api" },
      { event: "db:connect", slice: "database" },
    ]);
    expect(caught.stack.split("\n")[0]).toBe("TypeError: db down [at loaf:init(api) > db:connect(database)]");
  });

  it("annotates an error only once as it propagates", async () => {
    const loaf = new Loaf({
      name: "t",
      crumbNames: ["one", "two"],
      slices: [{
        name: "a",
        one: async () => useLoaf().execute("two"),
      }, {
        name: "b",
        two: async () => { throw new Error("deep"); },
      }],
    });
    await loaf.load();
    const caught: any = await loaf.execute("one").catch((e) => e);
    expect(caught.message).toBe("deep [at one(a) > two(b)]");
  });

  it("annotates synchronous throws from sync chains", async () => {
    const loaf = new Loaf({
      name: "t",
      crumbNames: ["label"],
      slices: [{ name: "a", label: () => { throw new Error("sync fail"); } }],
    });
    await loaf.load();
    expect(() => loaf.sync("label", "x")).toThrow("sync fail [at label(a)]");
  });

  it("annotates errors thrown in Load", async () => {
    const loaf = new Loaf({
      name: "t",
      slices: [{ name: "a", [Loaf.Load]: async () => { throw new Error("load failed"); } }],
    });
    await expect(loaf.load()).rejects.toThrow("load failed [at loaf:load(a)]");
  });

  it("UncaughtError handlers receive the annotated error", async () => {
    const onError = jest.fn();
    const loaf = new Loaf({
      name: "t",
      logger: silentLogger(),
      slices: [{
        name: "a",
        [Loaf.Ready]: async () => { throw new Error("ready failed"); },
        [Loaf.UncaughtError]: onError,
      }],
    });
    await expect(loaf.start()).rejects.toThrow("ready failed [at loaf:rdy(a)]");
    expect((onError.mock.calls[0][0] as any).slicePath).toEqual([{ event: Loaf.Ready, slice: "a" }]);
  });

  it("wraps primitive throws in an annotated Error", async () => {
    const loaf = new Loaf({
      name: "t",
      crumbNames: ["x"],
      slices: [{ name: "a", x: async () => { throw "plain string"; } }],
    });
    await loaf.load();
    const caught: any = await loaf.execute("x").catch((e) => e);
    expect(caught).toBeInstanceOf(Error);
    expect(caught.message).toBe("plain string [at x(a)]");
    expect(caught.cause).toBe("plain string");
  });

  it("leaves frozen errors untouched", async () => {
    const error = Object.freeze(new Error("frozen"));
    const loaf = new Loaf({
      name: "t",
      crumbNames: ["x"],
      slices: [{ name: "a", x: async () => { throw error; } }],
    });
    await loaf.load();
    const caught: any = await loaf.execute("x").catch((e) => e);
    expect(caught).toBe(error);
    expect(caught.message).toBe("frozen");
  });
});
