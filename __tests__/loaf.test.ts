import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import Loaf from "../src/loaf";
import Slice from "../src/slice";
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
        [Loaf.Load]: async (loaf: Loaf, slice: ISlice) => {
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
        [Loaf.Load]: async (loaf: Loaf) => {
          l.push('load');
        },
        [Loaf.Initialize]: async (loaf: Loaf) => {
          l.push('initialize');
          return loaf;
        },
        [Loaf.Ready]: async (loaf: Loaf) => {
          l.push('ready');
          return loaf;
        },
        [Loaf.Shutdown]: async (loaf: Loaf) => {
          l.push('shutdown');
          return loaf;
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
        [Loaf.Load]: async (loaf: Loaf) => {
          l.push('load1');
        },
        [Loaf.Initialize]: async (loaf: Loaf) => {
          l.push('initialize1');
          return loaf;
        },
        [Loaf.Ready]: async (loaf: Loaf) => {
          l.push('ready1');
          return loaf;
        },
        [Loaf.Shutdown]: async (loaf: Loaf) => {
          l.push('shutdown1');
          return loaf;
        }
      }, {
        name: "test2",
        dependencies: ["test1"],
        [Loaf.Load]: async (loaf: Loaf) => {
          l.push('load2');
        },
        [Loaf.Initialize]: async (loaf: Loaf) => {
          l.push('initialize2');
          return loaf;
        },
        [Loaf.Ready]: async (loaf: Loaf) => {
          l.push('ready2');
          return loaf;
        },
        [Loaf.Shutdown]: async (loaf: Loaf) => {
          l.push('shutdown2');
          return loaf;
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
        // [Loaf.Load]: async (loaf: Loaf, slice: ISlice) => {
        //   l.push('load1');
        // },
        [Loaf.Initialize]: async (loaf: Loaf) => {
          l.push('initialize1');
          return loaf;
        },
        [Loaf.Ready]: async (loaf: Loaf) => {
          l.push('ready1');
          return loaf;
        },
        [Loaf.Shutdown]: async (loaf: Loaf) => {
          l.push('shutdown1');
          return loaf;
        }
      }, {
        name: "test2",
        // [Loaf.Load]: async (loaf: Loaf) => {
        //   l.push('load2');
        // },
        [Loaf.Initialize]: async (loaf: Loaf) => {
          l.push('initialize2');
          return loaf;
        },
        [Loaf.Ready]: async (loaf: Loaf) => {
          l.push('ready2');
          return loaf;
        },
        [Loaf.Shutdown]: async (loaf: Loaf) => {
          l.push('shutdown2');
          return loaf;
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
        [Loaf.Initialize]: async (loaf: Loaf) => {
          l.push('initialize2');
          return loaf;
        },
        [Loaf.Ready]: async (loaf: Loaf) => {
          l.push('ready2');
          return loaf;
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
        [Loaf.Initialize]: async (loaf: Loaf) => {
          l.push('initialize3');
          return loaf;
        },
        [Loaf.Ready]: async (loaf: Loaf) => {
          l.push('ready3');
          return loaf;
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
        [Loaf.Initialize]: async (loaf: Loaf) => {
          l.push('initialize4');
          return loaf;
        },
        [Loaf.Ready]: async (loaf: Loaf) => {
          l.push('ready4');
          return loaf;
        }
      }, {
        name: "test1",
        dependencies: [],
        [Loaf.Initialize]: async (loaf: Loaf) => {
          l.push('initialize1');
          return loaf;
        },
        [Loaf.Ready]: async (loaf: Loaf) => {
          l.push('ready1');
          return loaf;
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
        [Loaf.Initialize]: async (loaf: Loaf) => {
          l.push('initialize1');
        }
      }, {
        name: "test2",
        dependencies: [],
        [Loaf.Initialize]: async (loaf: Loaf) => {
          l.push('initialize2');
        },
        [Loaf.Ready]: async (loaf: Loaf) => {
          l.push('ready2');
        }
      }, {
        name: "test3",
        dependencies: [],
        [Loaf.Initialize]: async (loaf: Loaf) => {
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
        [Loaf.Initialize]: async (loaf: Loaf) => {
          l.push('initialize1');
        },
        ["warrgh"]: async (loaf: Loaf) => {
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
        [Loaf.Initialize]: async (loaf: Loaf) => {
          l.push('initialize1');
        },
        ["warrgh"]: async (loaf: Loaf) => {
          l.push('warrgh');
        },
        ["warrgh2"]: async (loaf: Loaf) => {
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
        [Loaf.Initialize]: async (loaf: Loaf) => {
          l.push('initialize1');
        },
        ["warrgh"]: async (loaf: Loaf) => {
          l.push('warrgh');
        },
        ["warrgh2"]: async (loaf: Loaf) => {
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
        [Loaf.Initialize]: async (loaf: Loaf) => {
          l.push('initialize1');
        },
        ["warrgh"]: async (loaf: Loaf) => {
          l.push('warrgh');
        },
        ["warrgh2"]: async (loaf: Loaf) => {
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
        [Loaf.Initialize]: async (loaf: Loaf) => {
          l.push('initialize1');
          await loaf.execute("warrgh", loaf);
        },
        ["warrgh"]: async (loaf: Loaf) => {
          l.push('warrgh');
          await loaf.execute("warrgh2", loaf);
        },
        ["warrgh2"]: async (loaf: Loaf) => {
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
        [Loaf.Initialize]: async (loaf: Loaf) => {
          l.push('initialize1');
          await loaf.execute("warrgh", loaf);
        },

      }, {
        name: "test2",
        dependencies: [],
        ["warrgh"]: async (loaf: Loaf) => {
          l.push('warrgh');
          await loaf.execute("warrgh2", loaf);
        },
        ["warrgh2"]: async (loaf: Loaf) => {
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

  it("Load receives the loaf and the slice", async () => {
    const load = jest.fn(async () => {});
    const slice = { name: "a", [Loaf.Load]: load };
    const loaf = new Loaf({ name: "t", slices: [slice] });
    await loaf.load();
    expect(load).toHaveBeenCalledWith(loaf, slice);
  });

  it("event handlers are called with the slice as `this` and last argument", async () => {
    let self: any;
    let lastArg: any;
    const slice = {
      name: "a",
      [Loaf.Initialize]: async function (this: any, loaf: Loaf, ...rest: any[]) {
        self = this;
        lastArg = rest[rest.length - 1];
        return loaf;
      },
    };
    const loaf = new Loaf({ name: "t", slices: [slice] });
    await loaf.start();
    expect(self).toBe(slice);
    expect(lastArg).toBe(slice);
  });

  it("the value returned by Initialize is passed to the next slice", async () => {
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
          return value;
        },
      }],
    });
    await loaf.start();
    expect(received).toEqual(["from-a"]);
  });

  it("builds slices from Slice subclasses", async () => {
    const calls: string[] = [];
    class MySlice extends Slice {
      constructor() {
        super(undefined as any);
        this.name = "my-slice";
      }
      [LoafEvent.Initialize] = async <T extends Loaf>(loaf: T) => {
        calls.push("init");
        return loaf;
      };
    }
    const loaf = new Loaf({ name: "t", slices: [MySlice] });
    await loaf.start();
    expect(loaf.get<MySlice>("my-slice")).toBeInstanceOf(MySlice);
    expect(calls).toEqual(["init"]);
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
        [Loaf.Initialize]: async (loaf: Loaf) => { l.push("a"); return loaf; },
      }, {
        name: "b",
        [Loaf.Initialize]: async (loaf: Loaf) => { l.push("b"); return loaf; },
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
        [Loaf.Shutdown]: async (loaf: Loaf) => { l.push("a"); return loaf; },
      }, {
        name: "b",
        [Loaf.Shutdown]: async (loaf: Loaf) => { l.push("b"); return loaf; },
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
        [Loaf.Initialize]: async (loaf: Loaf) => { l.push("a"); return loaf; },
      }, {
        name: "c",
        [Loaf.Initialize]: async (loaf: Loaf) => { l.push("c"); return loaf; },
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
        [Loaf.Initialize]: async (loaf: Loaf) => { l.push("a"); return loaf; },
      }, {
        name: "b",
        [Loaf.Initialize]: async (loaf: Loaf) => { l.push("b"); return loaf; },
      }, {
        name: "c",
        [Loaf.Initialize]: async (loaf: Loaf) => { l.push("c"); return loaf; },
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
        [Loaf.Initialize]: async (loaf: Loaf) => loaf,
      }, {
        name: "b",
        dependencies: [{ event: Loaf.Initialize, required: ["a"] }],
        [Loaf.Initialize]: async (loaf: Loaf) => loaf,
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
    const onError = jest.fn(async (loaf: Loaf) => loaf);
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
    expect(onError).toHaveBeenCalledWith(loaf, error, expect.anything());
    expect(logger.error).toHaveBeenCalled();
  });

  it("initialize stops later slices after a failure", async () => {
    const later = jest.fn(async (loaf: Loaf) => loaf);
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
    const onError = jest.fn(async (loaf: Loaf) => loaf);
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
    expect(onError).toHaveBeenCalledWith(loaf, error, expect.anything());
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
    const ignored = jest.fn(async (loaf: Loaf) => loaf);
    const loaf = new Loaf({
      name: "t",
      slices: [{ name: "a", ignore: [Loaf.Initialize], [Loaf.Initialize]: ignored }],
    });
    await loaf.start();
    expect(ignored).not.toHaveBeenCalled();
    expect(loaf.crumbs[Loaf.Initialize]).toEqual([]);
  });

  it("disallowCrumb can remove a built in lifecycle event", async () => {
    const ready = jest.fn(async (loaf: Loaf) => loaf);
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
