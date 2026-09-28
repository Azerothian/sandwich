import { ChainController, chainStorage, isThenable } from './chain-control';

export default class Chains {
  readonly options: { [key: string]: {
    ignoreReturn: boolean;
  } };
  readonly funcs: { [key: string]: any[] };
  readonly locks: { [key: string]: boolean };
  constructor() {
    this.funcs = {};
    this.locks = {};
    this.options = {};
  }
  readonly setOptions = (eventName: string, options: {
    ignoreReturn: boolean;
  }) => {
    this.options[eventName] = options;
  };
  readonly push = (eventName: string, func: any | any[]) => {
    // const trackingObj = new Error();
    // console.log('stack', trackingObj.stack);
    if (!this.locks[eventName]) {
      if (!this.funcs[eventName]) {
        this.funcs[eventName] = [];
      }
      if (!this.locks[eventName]) {
        if (Array.isArray(func)) {
          this.funcs[eventName].push(...func);
        } else {
          this.funcs[eventName].push(func);
        }
      }
    }
  };
  readonly unshift = (eventName: string, func: any) => {
    if (!this.locks[eventName]) {
      if (!this.funcs[eventName]) {
        this.funcs[eventName] = [];
      }
      if (!this.locks[eventName]) {
        this.funcs[eventName].unshift(func);
      }
    }
  };
  readonly sync = <T>(eventName: string, start: any, ...args: readonly unknown[]) : T => {
    return Chains.sync<T>(this, eventName, start, ...args);
  }
  static sync<T>(chains: Chains, eventName: string, start: any, ...args: readonly unknown[]) : T {
    return Chains.syncFrom<T>(chains, eventName, start, args);
  }
  private static syncFrom<T>(chains: Chains, eventName: string, start: any, args: readonly unknown[], fromSlice?: string) : T {
    if (!chains.funcs[eventName]) {
      return Chains.emptyChain(eventName, start, fromSlice);
    }
    const funcs = [...chains.funcs[eventName]];
    const ignoreReturn = chains.options[eventName]?.ignoreReturn;
    const control = new ChainController(eventName);
    let value = start;
    let i = Chains.startIndex(funcs, eventName, fromSlice);
    while (i < funcs.length) {
      const input = ignoreReturn ? start : value;
      control.index = i;
      control.action = undefined;
      const result = chainStorage.run(control, () => funcs[i](input, ...args));
      if (isThenable(result)) {
        throw new Error('Cannot use sync with async functions');
      }
      const step = Chains.resolveStep(funcs, control, i, value, ignoreReturn ? start : result);
      if (step.event !== undefined) {
        return Chains.syncFrom<T>(chains, step.event, step.value, args, step.slice);
      }
      if (step.done) {
        return step.value;
      }
      value = step.value;
      i = step.next;
    }
    return value;
  };
  readonly all = async<T>(eventName: string, start: any, ...args: readonly unknown[]): Promise<T[]> => {
    return Chains.all<T>(this, eventName, start, ...args);
  };

  // parallel, so there is no chain control
  static async all<T>(chains: Chains, eventName: string, start: any, ...args: readonly unknown[]): Promise<T[]> {
    if (!chains.funcs[eventName]) {
      return [];
    }
    return Promise.all(chains.funcs[eventName].map((f) => {
      return chainStorage.exit(() => f(start, ...args));
    }));
  };

  readonly execute = async<T>(
    eventName: string,
    start?: any,
    ...args: readonly unknown[]
  ) => {
    return Chains.execute<T>(this, eventName, start, ...args);
  };
  static async execute<T>(
    chains: Chains,
    eventName: string,
    start: any,
    ...args: readonly unknown[]
  ) : Promise<T> {
    return Chains.executeFrom<T>(chains, eventName, start, args);
  };
  private static async executeFrom<T>(chains: Chains, eventName: string, start: any, args: readonly unknown[], fromSlice?: string) : Promise<T> {
    if (!chains.funcs[eventName]) {
      return Chains.emptyChain(eventName, start, fromSlice);
    }
    const ignoreReturn = chains.options[eventName]?.ignoreReturn;
    return Chains.sequence<T>(chains, eventName, start, args, (result) => ignoreReturn ? start : result, undefined, fromSlice);
  }
  readonly condition = async<T1, T2>(
    eventName: string,
    conditionFunc: (o: T2) => Promise<boolean>,
    start: T1 ,
    ...args: readonly unknown[]
  ) => {
    return Chains.condition(this, eventName, conditionFunc, start, ...args);
  }
  static async condition<T1, T2>(
    chains: Chains,
    eventName: string,
    conditionFunc: (o: T2) => Promise<boolean>,
    start: T1 ,
    ...args: readonly unknown[]
  ) {
    if (!chains.funcs[eventName]) {
      return start;
    }
    // condition always carries each function's result, even with ignoreReturn
    return Chains.sequence<T1>(chains, eventName, start, args, (result) => result, conditionFunc);
  }

  // runs a sequential chain with chain control (cancel/skip/redirect)
  private static async sequence<T>(
    chains: Chains,
    eventName: string,
    start: any,
    args: readonly unknown[],
    carry: (result: any) => any,
    conditionFunc?: (o: any) => Promise<boolean>,
    fromSlice?: string,
  ) : Promise<T> {
    const funcs = [...chains.funcs[eventName]];
    // this is a flag to ensure that the first argument is provided
    // instead of the returnval of the previous function
    const ignoreReturn = chains.options[eventName]?.ignoreReturn;
    const control = new ChainController(eventName);
    let value = start;
    let i = Chains.startIndex(funcs, eventName, fromSlice);
    while (i < funcs.length) {
      const input = ignoreReturn ? start : value;
      control.index = i;
      control.action = undefined;
      const result = await chainStorage.run(control, () => funcs[i](input, ...args));
      const step = Chains.resolveStep(funcs, control, i, value, carry(result));
      if (step.event !== undefined) {
        return Chains.executeFrom<T>(chains, step.event, step.value, args, step.slice);
      }
      if (step.done) {
        return step.value;
      }
      value = step.value;
      if (conditionFunc && await conditionFunc(value)) {
        return value;
      }
      i = step.next;
    }
    return value;
  }

  // index to start a chain at; the first function unless redirected to a slice
  private static startIndex(funcs: any[], eventName: string, fromSlice?: string) {
    if (fromSlice === undefined) {
      return 0;
    }
    const index = funcs.findIndex((f) => f?.sliceName === fromSlice);
    if (index === -1) {
      throw new Error(`redirect target slice "${fromSlice}" not found in chain "${eventName}"`);
    }
    return index;
  }

  private static emptyChain(eventName: string, start: any, fromSlice?: string) {
    if (fromSlice !== undefined) {
      throw new Error(`redirect target slice "${fromSlice}" not found in chain "${eventName}"`);
    }
    return start;
  }

  private static resolveStep(funcs: any[], control: ChainController, i: number, previous: any, current: any) {
    const action = control.action;
    control.action = undefined;
    if (!action) {
      return { done: false, value: current, next: i + 1 };
    }
    switch (action.type) {
      case "skip":
        return { done: false, value: previous, next: i + 1 };
      case "cancel":
        return { done: true, value: action.hasValue ? action.value : current, next: i + 1 };
      case "redirect":
        if (action.event !== undefined) {
          // hand off to another event, optionally starting at one of its slices
          return { done: true, value: current, next: i + 1, event: action.event, slice: action.slice };
        }
        const next = funcs.findIndex((f, idx) => idx > i && f?.sliceName === action.slice);
        if (next === -1) {
          throw new Error(`redirect target slice "${action.slice}" not found later in chain "${control.eventName}"`);
        }
        return { done: false, value: current, next };
    }
  }

  readonly clear = (eventName: string) => {
    if (!this.locks[eventName]) {
      delete this.funcs[eventName];
    }
  };
  readonly lock = (eventName: string) => {
    this.locks[eventName] = true;
  };
  readonly unlock = (eventName: string) => {
    this.locks[eventName] = false;
  };
}
