import Chains from "./utils/chains";
import waterfall from "./utils/waterfall";
import { Jam, LoafEvent, Slices, ISlice, oneOf, Logger, Toast, DependencyInfo } from "./types/loaf";
import { createDebugLogger } from "./utils/logger";
import { importAndCreateToast, sortArrayByDependencyInfo } from "./kitchen";

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
  constructor(jam: Jam) {
    super();
    this.name = "loaf";
    this.jam = jam;
    this.cwd = jam.cwd || process.cwd();
    this.logger = jam.logger || createDebugLogger(jam);
    this.slices = {};
    this.setOptions(LoafEvent.Load, {
      ignoreReturn: true,
    });
    this.allowCrumbNames = [...Object.values(LoafEvent), ...jam.crumbNames || []];
    
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
    this.restrictedCrumbNames = [].concat(this.restrictedCrumbNames, [crumbNames.filter((name) => {
      return this.restrictedCrumbNames.indexOf(name) === -1;
    })]);
  }
  readonly unrestrictCrumb = (...crumbNames: string[]) => {
    this.restrictedCrumbNames = this.restrictedCrumbNames.filter((name) => {
      return crumbNames.indexOf(name) === -1;
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
        await slice[LoafEvent.Load](this, slice);
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
            this.push(crumbName, (...args) => {
              this.logger.debug(`${sliceName}.${crumbName}`, args);
              if(args.length > 0) {
                return args[0];
              }
              return undefined;
            });
          }
          this.logger.debug(`Adding crumb ${crumbName} from slice ${sliceName}`);
          funcs.push((...args) => {
            return mod[crumbName].apply(mod, [...args, mod]);
          });
        }
      }
      this.push(crumbName, funcs);
    }
  };
  readonly initialize = async () => {
    try {
      await this.execute(LoafEvent.Initialize, this);
    } catch (error: any) {
      try {
        this.logger.error(this.name, error);
        await this.execute(LoafEvent.UncaughtError, this, error);
        throw error;
      } catch (error: any) {
        this.logger.error(`[UncaughtError] ${error?.message}`, error);
        throw error;
      }
    }
    process.on("uncaughtException", async (error) => {
      await this.execute(LoafEvent.UncaughtError, this, error);
    });
  };
  readonly ready = async () => {
    try {
      await this.execute(LoafEvent.Ready, this);
    } catch (error: any) {
      try {
        this.logger.error(this.name, error);
        await this.execute(LoafEvent.UncaughtError, this, error);
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
    await this.execute(LoafEvent.Shutdown, this);
  };
  readonly get = <T>(sliceName: string) => {
    return this.slices[sliceName] as T;
  }
}
