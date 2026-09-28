import { DependencyInfo, ISlice, LoafEvent, oneOf } from "./types/loaf";

// Loaf instantiates slice classes with no arguments; use useLoaf()/useSlice() inside handlers.
export default class Slice implements ISlice {
  name: string;
  dependencies?: (string | oneOf | DependencyInfo)[];
  incompatible?: (string | oneOf)[];
  ignoreFunctions?: string[];
  [LoafEvent.Load]?: () => Promise<void> | void;
  [LoafEvent.Initialize]?: () => Promise<void> | void;
  [LoafEvent.Ready]?: () => Promise<void> | void;
  [LoafEvent.Shutdown]?: () => Promise<void> | void;
  [LoafEvent.UncaughtError]?: (error: Error) => Promise<void> | void;
  [LoafEvent.UnhandledRejection]?: (reason: unknown) => Promise<void> | void;
  constructor() {
    this.name = 'rye';
  }
}
