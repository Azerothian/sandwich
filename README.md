# Sandwich
```
                    _.---._
                _.-~       ~-._
            _.-~               ~-._
        _.-~                       ~---._
    _.-~                                 ~\
 .-~                                    _.;
 :-._                               _.-~ ./
 }-._~-._                   _..__.-~ _.-~)
 `-._~-._~-._              / .__..--~_.-~
     ~-._~-._\.        _.-~_/ _..--~~
         ~-. \`--...--~_.-~/~~
            \.`--...--~_.-~
              ~-..----~
```
## Description

Sandwich is an execution framework for TypeScript/JavaScript based environments.

## Installation

```bash
npm install @azerothian/sandwich
```

Or with pnpm:
```bash
pnpm add @azerothian/sandwich
```

Or with yarn:
```bash
yarn add @azerothian/sandwich
```

### A basic example
```typescript

// module1.ts
import { Loaf, ISlice } from "@azerothian/sandwich";

const module1: ISlice = {
  name: "module1",
  [Loaf.Initialize]: async () => {
    console.log("Initialize");
  },
  [Loaf.Ready]: async () => {
    console.log("Ready");
  },
  [Loaf.Shutdown]: async () => {
    console.log("Shutdown");
  }
}
export default module1;
```

```typescript
// index.ts - Loader

import { Loaf } from "@azerothian/sandwich";

const instance = new Loaf({
  name: "projectName",
  slices: ["./module1.ts"],
});

await instance.start();
await instance.shutdown();

```

Console Output
```
Initialize
Ready
Shutdown
```


### A Complex example

Using multiple slices with a dependency system you can assemble dynamic and complex application using asynchronous  

```typescript
// module1.ts
import { Loaf, ISlice, useLoaf } from "@azerothian/sandwich";

export enum NewEvents { 
  Initialize = "module1:initialize", // the text needs to be unique
  RandomFunction = "module1:random-func",
}
export type Module1Events = {
  readonly [NewEvents.Initialize]?: () => Promise<void>;
  readonly [NewEvents.RandomFunction]?: (arg1: string) => Promise<string>;
}
export interface IModule1 extends ISlice, Module1Events {

}

const module1: IModule1 = {
  name: "module1",
  allow: [NewEvents.Initialize, NewEvents.RandomFunction],
  [Loaf.Initialize]: async () => {
    const loaf = useLoaf();
    loaf.setOptions(NewEvents.Initialize, {
      ignoreReturn: true, // every handler receives the start value instead of the previous return value
    });
    await loaf.execute(NewEvents.Initialize);
  },
  [NewEvents.Initialize]: async () => {
    console.log("[module1](NewEvents.Initialize) - start");
    const result = await useLoaf().execute(NewEvents.RandomFunction, "start");
    console.log("[module1](NewEvents.Initialize) - execute(NewEvents.RandomFunction) - result", result);
  },
  [NewEvents.RandomFunction]: async (arg1: any) => {
    console.log("  [module1](NewEvents.RandomFunction) - prevResult", arg1);
    return "module1";
  }
}
export default module1;

```

```typescript
// module2.ts
import { NewEvents } from "./module1";

export default {
  name: "module2",
  dependencies: [{
    event: NewEvents.RandomFunction, // 
    required: {
      before: ["module1"]
    }
  }, "module3"],
  [NewEvents.Initialize]: async () => {
    console.log("[module2](NewEvents.Initialize)");
  },
  [NewEvents.RandomFunction]: async (arg1: any) => {
    console.log("  [module2](NewEvents.RandomFunction) - prevResult", arg1);
    return "module2";
  }

}
```

```typescript
// module3.ts
import { NewEvents } from "./module1";

export default {
  name: "module3",
  [NewEvents.Initialize]: async () => {
    console.log("[module3](NewEvents.Initialize)");
  },
  [NewEvents.RandomFunction]: async (arg1: any) => {
    console.log("  [module3](NewEvents.RandomFunction) - prevResult", arg1);
    return "module3";
  }
}

```

```typescript

// index.ts - Loader
import { Loaf } from "@azerothian/sandwich";
import { URL } from 'url'; // in Browser, the URL in native accessible on window

const __dirname = new URL('.', import.meta.url).pathname;
// console.log(__dirname);
const instance = new Loaf({
  name: "projectName",
  slices: ["./module3.ts", "./module1.ts", "./module2.ts"],
  cwd: __dirname,
});

await instance.start();
await instance.shutdown();
```
Console Output
```
[module3](NewEvents.Initialize)
[module1](NewEvents.Initialize) - start
  [module3](NewEvents.RandomFunction) - prevResult start
  [module1](NewEvents.RandomFunction) - prevResult module3
  [module2](NewEvents.RandomFunction) - prevResult module1
[module1](NewEvents.Initialize) - execute(NewEvents.RandomFunction) - result module2
[module2](NewEvents.Initialize)
```

### Error handling

If an `Initialize` or `Ready` handler throws, every slice's `UncaughtError` handler runs and then the original error is rethrown, so `start()` rejects. Slices that already started are not shut down for you:

```typescript
import { Loaf } from "@azerothian/sandwich";

const instance = new Loaf({
  name: "projectName",
  slices: [
    {
      name: "reporter",
      [Loaf.UncaughtError]: async (error: Error) => {
        console.error("startup failed:", error.message);
      },
    },
    "./module1.ts",
  ],
});

try {
  await instance.start();
} catch (error) {
  await instance.shutdown();
  process.exitCode = 1;
}
```

Things to know:
- Lifecycle handlers (`Load`, `Initialize`, `Ready`, `Shutdown`) take no arguments and their return values are ignored - use `useLoaf()`/`useSlice()` inside a handler to get the current loaf/slice.
- `allowCrumb`, `disallowCrumb`, `restrictCrumb` and `unrestrictCrumb` must be called before `load()`/`start()`.
- `UnhandledRejection` is not wired automatically; forward it with `process.on("unhandledRejection", (reason) => loaf.execute(Loaf.UnhandledRejection, reason))`.

### Hooks

Wrap an event's handlers with `before`/`after` functions, either up front via `jam.hooks` or at runtime with `loaf.addHook()` (which returns a remover). Without `sliceNames`, a hook targets every slice handling that event.

```typescript
import { Loaf, useSlice } from "@azerothian/sandwich";
import type { ISliceHook } from "@azerothian/sandwich";

const discounts: ISliceHook = {
  "order:place": {
    sliceNames: ["payment"],
    before: (order) => ({ ...order, total: Math.round(order.total * 0.9) }),
    after: (order) => ({ ...order, receipt: `charged ${order.total}` }),
  },
};

const loaf = new Loaf({ name: "app", hooks: [discounts], slices: [/* ... */] });
```

A `before` hook's return value replaces the handler's first argument; an `after` hook's return value replaces its result. Returning `undefined` leaves the value unchanged. See [Slice Hooks](docs/specifications.md#slice-hooks) for the full semantics.

### Chain control

Inside `execute()`, `condition()` or `sync()` (and hooks around them), `useChain()` lets a handler cancel, skip, or redirect the chain instead of just returning a value.

```typescript
import { useChain } from "@azerothian/sandwich";

[Orders.Place]: async (order) => {
  if (order.total <= 0) {
    useChain().cancel({ ...order, rejected: true }); // stop the chain now
    return order;
  }
  if (order.express) {
    useChain().redirect({ slice: "payment" }); // jump ahead, skipping other slices
  }
  if (order.total > 1000) {
    // hand off to another event, starting at its "fraud" slice
    useChain().redirect({ event: "order:manual-review", slice: "fraud" });
  }
  return order;
},
```

`useChain()` throws outside a sequential chain (e.g. inside `all()`, or outside any handler). See [Chain Control](docs/specifications.md#chain-control) for `cancel`/`skip`/`redirect` semantics.

### Error paths

Errors thrown by a handler or hook are annotated once with the full path of slices that led to them, via `error.slicePath` (and appended to `error.message`):

```typescript
try {
  await loaf.execute("order:place", order);
} catch (error: any) {
  console.error(error.message); // "card declined [at order:place(payment) > payment:charge(payment)]"
  console.error(error.slicePath); // [{ event: "order:place", slice: "payment" }, { event: "payment:charge", slice: "payment" }]
}
```

See [Error Slice Paths](docs/specifications.md#error-slice-paths) for details, including primitive throws and frozen errors.

## Migrating from 1.x

v2 moves the loaf and current slice into an `AsyncLocalStorage`-backed context instead of passing them as handler arguments. Requires Node >= 16.4 (uses `node:async_hooks`); not usable in browsers.

```typescript
// Before (1.x)
import { Loaf, ISlice } from "@azerothian/sandwich";

const module1: ISlice = {
  name: "module1",
  [Loaf.Initialize]: async (loaf: Loaf, slice: ISlice) => {
    console.log(`Initialize ${slice.name}`);
    await loaf.execute("app:warmup", undefined, loaf);
    return loaf;
  },
};

// After (2.x)
import { Loaf, ISlice, useLoaf, useSlice } from "@azerothian/sandwich";

const module1: ISlice = {
  name: "module1",
  [Loaf.Initialize]: async () => {
    console.log(`Initialize ${useSlice<ISlice>().name}`);
    await useLoaf().execute("app:warmup");
  },
};
```

Breaking changes:
- Handlers no longer receive `loaf`/`slice` as arguments - call `useLoaf()`/`useSlice()` inside the handler instead.
- Lifecycle handler return values are ignored - drop `return loaf` from `Load`, `Initialize`, `Ready` and `Shutdown` handlers.
- Custom crumbs no longer have the slice appended to their arguments - handlers receive `(previousValue, ...args)` only.
- `UncaughtError` handlers receive just `(error)`, and `UnhandledRejection` handlers receive just `(reason)` - no `loaf` argument.
- The `Slice` class constructor takes no arguments and no longer has a `loaf` field - use `useLoaf()` in handlers instead.
- Requires Node >= 16.4 (for `AsyncLocalStorage`) and is not browser-compatible.

## Terms

Loaf - the execution engine
Slice - a module
Jam - the config

## Testing

```bash
pnpm test
```

## Links

- [Full Documentation](docs/specifications.md)
- [Examples Directory](examples/)
  - [Basic App](examples/basic-app/index.ts)
  - [Custom Events](examples/custom-events/index.ts)
  - [Class-Based Slices](examples/class-based/index.ts)
  - [Graceful Shutdown](examples/graceful-shutdown/index.ts)
  - [Error Handling](examples/error-handling/index.ts)
  - [Dependency Constraints](examples/dependency-constraints/index.ts)
  - [Crumb Control](examples/crumb-control/index.ts)
  - [Module Loading](examples/module-loading/index.ts)
  - [Hooks and Chain Control](examples/hooks-and-chain-control/index.ts)
