// import { ILoaf } from '../loaf';
// /* eslint-disable @typescript-eslint/no-explicit-any */
export enum LoafEvent {
  Load = 'loaf:load',
  Initialize = 'loaf:init',
  Ready = 'loaf:rdy',
  Shutdown = 'loaf:signal:-1',
  UncaughtError = 'loaf:error',
  UnhandledRejection = 'loaf:error:rejected-fly',
}

// handlers get the loaf and slice from useLoaf()/useSlice(); return values are ignored
export type SliceEvents = {
  readonly [LoafEvent.Load]?: () => Promise<void> | void;
  readonly [LoafEvent.Initialize]?: () => Promise<void> | void;
  readonly [LoafEvent.Ready]?: () => Promise<void> | void;
  readonly [LoafEvent.Shutdown]?: () => Promise<void> | void;
  readonly [LoafEvent.UncaughtError]?: (error: Error) => Promise<void> | void;
  readonly [LoafEvent.UnhandledRejection]?: (reason: unknown) => Promise<void> | void;
};
export interface SliceFunctionIterable {
  [key: string]: any;
}

export type DependencyInfo = {
  moduleName?: string;
  event?: string;
  required?: {
    before?: (string | oneOf)[];
    after?: (string | oneOf)[];
    // if required & incompatible it will throw an error
    incompatible?: (string)[]
  } | (string | oneOf)[];
  optional?: {
    before?: (string)[];
    after?: (string)[];
    // if optional & incompatible it will filter out the function
    incompatible?: (string)[]
  };

}


export type oneOf = { oneOf: string[] };

// before/after may be async; returning undefined leaves the value unchanged
export type HookFunction = (value: any, ...args: any[]) => any;

export interface SliceHookHandlers {
  // runs before the slice's handler; the result replaces the handler's first argument
  before?: HookFunction;
  // runs after the slice's handler; the result replaces the handler's return value
  after?: HookFunction;
  // slices to target; all slices when omitted
  sliceNames?: string[];
}

export type ISliceHook = {
  [eventName: string]: SliceHookHandlers;
};




export interface ISlice extends SliceEvents  {
  readonly name: string;
  readonly dependencies?: (string | oneOf | DependencyInfo)[];
  readonly ignore?: string[];
  readonly allow?: string[];
  // readonly models?: { [key: string]: any };
}

export interface Toast extends ISlice, SliceFunctionIterable {
  id: string;
  crumbNames?: string[];
  dependencyInfos: DependencyInfo[];
}
export type Slices = {
  [key: string]: Toast;
};
export type Jam = {
  name: string;
  slices: any[];
  logger?: Logger;
  allowInCompat?: boolean;
  cwd?: string;
  devMode?: boolean;
  clone?: boolean
  crumbNames?: string[];
  hooks?: ISliceHook[];
};

export type Logger = {
  debug: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
  err: (message: string, ...args: any[]) => void;
  log: (message: string, ...args: any[]) => void;
};
