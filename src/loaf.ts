import Chains from "./utils/chains";
import waterfall from "./utils/waterfall";
import { Jam, LoafEvent, Slices, ISlice, oneOf, Logger, Toast, DependencyInfo, ISliceHook, HookFunction } from "./types/loaf";
import { createDebugLogger } from "./utils/logger";
import { importAndCreateToast, sortArrayByDependencyInfo } from "./kitchen";
import { annotateError, getContext, PathFrame, runInContext } from "./context";
import { chainStorage, isThenable } from "./utils/chain-control";

// calls fn with the result, staying synchronous unless value is a promise
function then<T, R>(value: T | PromiseLike<T>, fn: (value: T) => R): R | PromiseLike<R> {
  return isThenable(value) ? value.then(fn) : fn(value as T);
}

// annotates sync throws and async rejections with the slice path
function guard<T>(path: PathFrame[], fn: () => T): T {
  try {
    const result = fn();
    if (isThenable(result)) {
      return result.then(undefined, (error) => { throw annotateError(error, path); }) as T;
    }
    return result;
  } catch (error) {
    throw annotateError(error, path);
  }
}

export interface ILoaf {
  slices: Slices;
  crumbs: {[key: string]: string[]};
  load: () => Promise<void>;
  initialize: () => Promise<void>;
  ready: () => Promise<void>;
  logger: Logger;
  jam: Jam;
  cwd: string;
}

export interface Crumb {
  toast: Toast;
  func: Function;
}


export default class Loaf extends Chains implements ILoaf {
  name: string = "loaf";
  readonly logger: Logger;
  slices: Slices;
  sortedSliceNames: string[] = [];
  readonly jam: Jam;
  cwd: string;
  crumbs: {[key: string]: string[]} = {};
  private allowCrumbNames: string[] = [];
  private restrictedCrumbNames: string[] = [];
  private uncaughtExceptionHandler?: (error: Error) => Promise<void>;
  private hooks: ISliceHook[] = [];
  constructor(jam: Jam) {
    super();
    this.name = "loaf";
    this.jam = jam;
    this.cwd = jam.cwd || process.cwd();
    this.logger = jam.logger || createDebugLogger(jam);
    this.slices = {};
    // lifecycle handlers get their context from useLoaf()/useSlice(), so return values are ignored
    for (const eventName of Object.values(LoafEvent)) {
      this.setOptions(eventName, {
        ignoreReturn: true,
      });
    }
    this.allowCrumbNames = [...Object.values(LoafEvent), ...jam.crumbNames || []];
    this.hooks = [...jam.hooks || []];
    
  }
  static Load: LoafEvent.Load = LoafEvent.Load;
  static Initialize: LoafEvent.Initialize = LoafEvent.Initialize;
  static Ready: LoafEvent.Ready = LoafEvent.Ready;
  static Shutdown: LoafEvent.Shutdown = LoafEvent.Shutdown;
  static UncaughtError: LoafEvent.UncaughtError = LoafEvent.UncaughtError;
  static UnhandledRejection: LoafEvent.UnhandledRejection =
    LoafEvent.UnhandledRejection;
    
  readonly start = async () => {
    await this.load();
    await this.initialize();
    await this.ready();
  };

  readonly allowCrumb = (...crumbNames: string[]) => {
    this.allowCrumbNames.push(...crumbNames.filter((name) => {
      return this.allowCrumbNames.indexOf(name) === -1;
    }));
  }
  readonly disallowCrumb = (...crumbNames: string[]) => {
    this.allowCrumbNames = this.allowCrumbNames.filter((name) => {
      return crumbNames.indexOf(name) === -1;
    });
  }
  readonly restrictCrumb = (...crumbNames: string[]) => {
    this.restrictedCrumbNames.push(...crumbNames.filter((name) => {
      return this.restrictedCrumbNames.indexOf(name) === -1;
    }));
  }
  readonly unrestrictCrumb = (...crumbNames: string[]) => {
    this.restrictedCrumbNames = this.restrictedCrumbNames.filter((name) => {
      return crumbNames.indexOf(name) === -1;
    });
  }

  readonly addHook = (hook: ISliceHook) => {
    this.hooks.push(hook);
    return () => this.removeHook(hook);
  }
  readonly removeHook = (hook: ISliceHook) => {
    this.hooks = this.hooks.filter((h) => h !== hook);
  }

  // hooks are looked up per call so hooks added after load() still apply
  private hookFunctions(eventName: string, sliceName: string, phase: "before" | "after"): HookFunction[] {
    return this.hooks
      .map((hook) => hook[eventName])
      .filter((h) => h?.[phase] && (!h.sliceNames || h.sliceNames.includes(sliceName)))
      .map((h) => h[phase]);
  }

  // runs a slice handler with its context, hooks, chain control and error path
  private invoke(eventName: string, sliceName: string, slice: Toast, args: any[]) {
    const path: PathFrame[] = [...getContext()?.path || [], { event: eventName, slice: sliceName }];
    const control = chainStorage.getStore();
    const current = [...args];
    const runHooks = (phase: "before" | "after", funcs: HookFunction[], value: any, index = 0): any => {
      if (index >= funcs.length || (phase === "before" && control?.action)) {
        return value;
      }
      const hookPath = [...path.slice(0, -1), { event: eventName, slice: sliceName, phase }];
      const result = runInContext({ loaf: this, slice, path: hookPath }, () => {
        return guard(hookPath, () => funcs[index].apply(slice, [value, ...current.slice(1)]));
      });
      return then(result, (r) => runHooks(phase, funcs, r === undefined ? value : r, index + 1));
    };
    return runInContext({ loaf: this, slice, path }, () => {
      const before = runHooks("before", this.hookFunctions(eventName, sliceName, "before"), current[0]);
      return then(before, (first) => {
        current[0] = first;
        // a before hook cancelled, skipped or redirected - the handler does not run
        if (control?.action) {
          return first;
        }
        const result = guard(path, () => slice[eventName].apply(slice, current));
        return then(result, (r) => runHooks("after", this.hookFunctions(eventName, sliceName, "after"), r));
      });
    });
  }

  readonly load = async () => {
    // Object.freeze(this.allowCrumbNames)
    this.logger.debug(this.name, "Cooking the toast...");
    this.slices = await importAndCreateToast(this.jam, this);
    
    let dependencyInfos: DependencyInfo[] = [];
    const crumbNames = [];
    let sliceNames = Object.keys(this.slices);
    
    this.logger.debug(this.name, "Buttering up the toast...", sliceNames);

    sliceNames.forEach((sliceName) => {
      const slice = this.slices[sliceName];
      if (slice.allow) {
        this.allowCrumb(...slice.allow);
      }
    });

    await waterfall(sliceNames, async (sliceName) => {
      const slice = this.slices[sliceName];
      if (slice[LoafEvent.Load]) {
        // Execute the Load Event
        await chainStorage.exit(() => this.invoke(LoafEvent.Load, sliceName, slice, []));
      }
      if (slice.dependencyInfos) {
        dependencyInfos = dependencyInfos.concat(slice.dependencyInfos);
      }
      const sliceCrumbNames = Object.keys(slice).filter((key) => {
        return (
          this.allowCrumbNames.includes(key) &&
          !this.restrictedCrumbNames.includes(key)
        );
      });

      for (const crumbName of sliceCrumbNames) {
        if (this.allowCrumbNames.indexOf(crumbName) === -1 || this.restrictedCrumbNames.indexOf(crumbName) !== -1) {
          this.logger.debug(this.name, `Skipping crumb ${crumbName} from slice ${sliceName}`);
          continue;
        }
        if (crumbNames.indexOf(crumbName) === -1) {
          this.logger.debug(this.name, `Adding crumb ${crumbName} from slice ${sliceName}`);
          crumbNames.push(crumbName);
        }
      }
    });
    
    this.sortedSliceNames = await sortArrayByDependencyInfo(sliceNames, dependencyInfos);
    for (const crumbName of crumbNames) {
      this.logger.debug(this.name, `Generating execution path for ${crumbName}`, dependencyInfos);
      const crumbArray = await sortArrayByDependencyInfo(sliceNames.concat([]), dependencyInfos, crumbName);
      // filter out slices that don't have the crumb
      this.crumbs[crumbName] = crumbArray.filter((sliceName) => {
        const slice = this.slices[sliceName];
        return slice[crumbName] !== undefined && !slice.ignore?.includes(crumbName);
      });
      this.logger.debug(this.name, `Start path generation for ${crumbName}`, this.crumbs[crumbName]);
      const funcs = [];
      for (const sliceName of this.crumbs[crumbName]) {
        const mod = this.slices[sliceName];
        if (mod[crumbName]) {
          if (this.jam.devMode) {
            funcs.push(Object.assign((...args) => {
              this.logger.debug(`${sliceName}.${crumbName}`, args);
              if(args.length > 0) {
                return args[0];
              }
              return undefined;
            }, { sliceName }));
          }
          this.logger.debug(`Adding crumb ${crumbName} from slice ${sliceName}`);
          // sliceName lets redirect({ slice }) find this function in the chain
          funcs.push(Object.assign((...args) => this.invoke(crumbName, sliceName, mod, args), { sliceName }));
        }
      }
      this.push(crumbName, funcs);
    }
  };
  readonly initialize = async () => {
    try {
      await this.execute(LoafEvent.Initialize);
    } catch (error: any) {
      try {
        this.logger.error(this.name, error);
        await this.execute(LoafEvent.UncaughtError, error);
        throw error;
      } catch (error: any) {
        this.logger.error(`[UncaughtError] ${error?.message}`, error);
        throw error;
      }
    }
    if (!this.uncaughtExceptionHandler) {
      this.uncaughtExceptionHandler = async (error) => {
        await this.execute(LoafEvent.UncaughtError, error);
      };
      process.on("uncaughtException", this.uncaughtExceptionHandler);
    }
  };
  readonly ready = async () => {
    try {
      await this.execute(LoafEvent.Ready);
    } catch (error: any) {
      try {
        this.logger.error(this.name, error);
        await this.execute(LoafEvent.UncaughtError, error);
        throw error;
      } catch (error: any) {
        this.logger.error(
          this.name,
          `[UncaughtError] ${error?.message}`,
          error
        );
        throw error;
      }
    }
  };
  readonly shutdown = async () => {
    await this.execute(LoafEvent.Shutdown);
    if (this.uncaughtExceptionHandler) {
      process.off("uncaughtException", this.uncaughtExceptionHandler);
      this.uncaughtExceptionHandler = undefined;
    }
  };
  readonly get = <T>(sliceName: string) => {
    return this.slices[sliceName] as T;
  }
}
