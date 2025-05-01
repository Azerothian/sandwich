import type Loaf from '../loaf';
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

export type SliceEvents = {
  readonly [LoafEvent.Load]?: (loaf: Loaf, slice: ISlice)  => Promise<void>;
  readonly [LoafEvent.Initialize]?: (loaf: Loaf, slice: ISlice) => Promise<Loaf>;
  readonly [LoafEvent.Ready]?: (loaf: Loaf, slice: ISlice) => Promise<Loaf>;
  readonly [LoafEvent.Shutdown]?: (loaf: Loaf, slice: ISlice) => Promise<Loaf>;
  readonly [LoafEvent.UncaughtError]?: (
    loaf: Loaf,
    error: Error
  ) => Promise<Loaf>;
  readonly [LoafEvent.UnhandledRejection]?: (
    loaf: Loaf,
    error: Error
  ) => Promise<Loaf>;
};
export interface SliceFunctionIterable {
  [key: string]: any;
}

export type DependencyInfo = {
  moduleName?: string;
  event?: string;
  required?: {
    before?: (string)[];
    after?: (string)[];
    // if required & incompatible it will throw an error
    incompatible?: (string)[]
  } | (string)[];
  optional?: {
    before?: (string)[];
    after?: (string)[];
    // if optional & incompatible it will filter out the function
    incompatible?: (string)[]
  };

}


export type oneOf = { oneOf: string[] };




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
};

export type Logger = {
  debug: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
  err: (message: string, ...args: any[]) => void;
  log: (message: string, ...args: any[]) => void;
};
