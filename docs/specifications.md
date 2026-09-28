# Sandwich Framework Specifications

## Table of Contents

1. [Introduction](#introduction)
2. [Core Concepts](#core-concepts)
3. [Lifecycle Events](#lifecycle-events)
4. [Dependency System](#dependency-system)
5. [Public API Reference](#public-api-reference)
6. [Crumb System](#crumb-system)
7. [Chain Execution System](#chain-execution-system)
8. [Slice Hooks](#slice-hooks)
9. [Chain Control](#chain-control)
10. [Error Slice Paths](#error-slice-paths)
11. [Module Loading](#module-loading)
12. [Build Outputs](#build-outputs)

---

## Introduction

Sandwich is a modular execution framework for TypeScript/JavaScript that provides sophisticated dependency management, event-driven architecture, and topological execution ordering. The framework is designed around a culinary metaphor that makes complex concepts intuitive:

- **Loaf** - The execution engine that orchestrates everything
- **Slice** - An individual module that provides functionality
- **Jam** - The configuration object that defines how the Loaf is constructed
- **Toast** - A fully-loaded Slice with metadata and dependency information
- **Crumbs** - Events/functions that can be executed across multiple Slices
- **Kitchen** - Utilities for loading and preparing modules

### Philosophy

Sandwich embraces:
- **Modular architecture** - Build applications from independent, reusable slices
- **Topological ordering** - Automatic execution ordering based on dependencies
- **Event-driven execution** - Coordinate complex workflows through events
- **Type safety** - Full TypeScript support with comprehensive type definitions
- **Flexibility** - Load modules from files, objects, or classes
- **Implicit context** - Handlers reach the current loaf/slice via `useLoaf()`/`useSlice()` (Node `AsyncLocalStorage`) instead of receiving them as arguments; requires Node >= 16.4 and is not browser-compatible

---

## Core Concepts

### Loaf

The `Loaf` class is the central orchestration engine. It manages the lifecycle of all Slices, coordinates event execution, and maintains the execution graph.

**Key Responsibilities:**
- Load and initialize Slices
- Build topologically-sorted execution paths
- Manage crumb registration and execution
- Coordinate lifecycle events
- Handle errors and shutdowns

**Inheritance:**
```typescript
export default class Loaf extends Chains implements ILoaf
```

The Loaf extends `Chains`, giving it powerful execution capabilities for managing multiple function chains.

### Slice

A `Slice` is an individual module that participates in the Loaf's lifecycle. Each Slice can:
- Define dependencies on other Slices
- Hook into lifecycle events
- Register custom crumbs (event handlers)
- Specify execution constraints
- Call `useLoaf()`/`useSlice()` from any handler to access the current loaf/slice (see [Execution Context](#execution-context))

**Basic Structure:**
```typescript
export interface ISlice extends SliceEvents {
  readonly name: string;
  readonly dependencies?: (string | oneOf | DependencyInfo)[];
  readonly ignore?: string[];
  readonly allow?: string[];
}
```

### Jam

`Jam` is the configuration object passed to create a new Loaf instance.

**Type Definition:**
```typescript
export type Jam = {
  name: string;
  slices: any[];
  logger?: Logger;
  allowInCompat?: boolean;
  cwd?: string;
  devMode?: boolean;
  clone?: boolean;
  crumbNames?: string[];
  hooks?: ISliceHook[];
};
```

**Properties:**
- `name` - Identifier for the Loaf instance
- `slices` - Array of modules to load (file paths, objects, or classes)
- `logger` - Optional custom logger (defaults to debug-based logger)
- `allowInCompat` - Reserved; currently ignored (incompatible constraints are not implemented)
- `cwd` - Working directory for resolving relative paths
- `devMode` - Enables additional debugging output
- `clone` - Whether to clone module objects (prevents shared state)
- `crumbNames` - Additional custom crumb names to allow
- `hooks` - Slice hooks registered up front, run in this array's order (before any added later with `addHook()`); see [Slice Hooks](#slice-hooks)

### Toast

A `Toast` is the runtime representation of a Slice after it's been loaded and enriched with metadata.

**Type Definition:**
```typescript
export interface Toast extends ISlice, SliceFunctionIterable {
  id: string;
  crumbNames?: string[];
  dependencyInfos: DependencyInfo[];
}
```

### Kitchen

The Kitchen module provides utilities for loading and preparing Slices:

**Key Functions:**
- `buildToast()` - Convert raw slice data into a Toast object
- `importAndCreateToast()` - Load all slices from the Jam configuration
- `sortArrayByDependencyInfo()` - Topologically sort modules based on dependencies
- `getDependencyInfos()` - Extract dependency information from a Slice

---

## Lifecycle Events

Sandwich defines six core lifecycle events that Slices can hook into:

### LoafEvent Enumeration

```typescript
export enum LoafEvent {
  Load = 'loaf:load',
  Initialize = 'loaf:init',
  Ready = 'loaf:rdy',
  Shutdown = 'loaf:signal:-1',
  UncaughtError = 'loaf:error',
  UnhandledRejection = 'loaf:error:rejected-fly',
}
```

### Execution Context

Instead of receiving the loaf and slice as handler arguments, Sandwich carries them on a Node [`AsyncLocalStorage`](https://nodejs.org/api/async_context.html#class-asynclocalstorage) context. Handlers call `useLoaf()`/`useSlice()` to reach them. This requires **Node >= 16.4** and is **not browser-compatible**.

```typescript
export interface LoafContext {
  loaf: Loaf;
  slice?: Toast;
}

function useLoaf<T extends Loaf = Loaf>(): T;
function useSlice<T = Toast>(): T;
```

- `useLoaf()` returns the current loaf. Called outside of any Loaf-managed handler, it throws `useLoaf() must be called inside a Loaf handler`.
- `useSlice()` returns the current slice (`Toast`). Called outside of a slice handler - including inside a loaf-only context such as a `buildSlice(loaf)` factory - it throws `useSlice() must be called inside a slice handler`.
- Both are generic: `useLoaf<MyLoaf>()`/`useSlice<MySlice>()` let you cast to a more specific type.

**Per-handler context:**
- Every invocation of a slice handler - `Load`, the other lifecycle events, and custom crumbs - runs inside its own context `{ loaf, slice }` for that slice, established via `runInContext()`.
- `this` is still bound to the slice inside handlers (unchanged from previous versions).
- Nesting: if a handler calls `loaf.execute()` (or `all()`/`sync()`/`condition()`) and that in turn invokes another slice's handler, the inner handler runs in its own `{ loaf, slice: innerSlice }` context. Once the inner call returns, the outer handler's original context (including its own `slice`) is restored - `useSlice()` inside the outer handler still reports the outer slice.
- Parallel execution via `all()` isolates each handler's context from the others - they don't see each other's slice.
- Concurrently running Loaf instances are isolated from one another; a handler always sees the loaf/slice for its own invocation, never another Loaf's.
- The context survives `await` and timers - `useLoaf()`/`useSlice()` still resolve correctly after an `await new Promise(...)`, `setTimeout`, etc. inside a handler.
- `buildSlice(loaf)` factories run inside a loaf-only context (`{ loaf }`, no `slice`), so `useLoaf()` works there but `useSlice()` throws.

**Lifecycle handlers:**
- `Load`, `Initialize`, `Ready` and `Shutdown` handlers take **no arguments**, and their return values are **ignored** - Loaf sets `ignoreReturn: true` for every `LoafEvent` chain in the constructor. There is no more "must return loaf" rule; use `useLoaf()`/`useSlice()` if you need them.
- `Load` is still called for each slice in **slices-array order**, before any sorting.
- `Initialize`, `Ready` and `Shutdown` all run in the same dependency order (dependencies first). Shutdown is **not** reversed.

**Error handlers:**
- `UncaughtError` handlers receive just `(error: Error)`.
- `UnhandledRejection` handlers receive just `(reason: unknown)`.

**Custom crumbs:**
- Custom crumb handlers still run as a data waterfall: `loaf.execute(name, start, ...args)` calls each handler as `(previousValue, ...args)` - the slice is **no longer** appended as a trailing argument. Use `useLoaf()`/`useSlice()` if a handler needs them.
- `ignoreReturn` via `setOptions()` still works the same way for custom crumbs.

### Event Descriptions

#### 1. Load (`loaf:load`)

**Purpose:** Executed during the Loaf loading phase, before topological sorting.

**Signature:**
```typescript
[LoafEvent.Load]?: () => Promise<void> | void;
```

**Use Cases:**
- Perform early setup that other slices may depend on
- Configure crumb allowances

> **Note:** crumbs are collected slice-by-slice immediately after each slice's `Load` handler runs. A crumb allowed with `loaf.allowCrumb()` inside `Load` is therefore only picked up for that slice and the slices after it in the array. Prefer `jam.crumbNames` or `slice.allow` for crumbs that every slice should see.

**Example:**
```typescript
const mySlice: ISlice = {
  name: "config-loader",
  [Loaf.Load]: async () => {
    // Allow custom crumbs
    useLoaf().allowCrumb("custom:event");
  }
};
```

#### 2. Initialize (`loaf:init`)

**Purpose:** Main initialization phase, executed in topological order.

**Signature:**
```typescript
[LoafEvent.Initialize]?: () => Promise<void> | void;
```

**Use Cases:**
- Connect to databases
- Initialize services
- Set up middleware
- Execute custom initialization chains

**Example:**
```typescript
const dbSlice: ISlice = {
  name: "database",
  [Loaf.Initialize]: async () => {
    await connectToDatabase();
  }
};
```

#### 3. Ready (`loaf:rdy`)

**Purpose:** Application ready phase, executed after all initialization completes.

**Signature:**
```typescript
[LoafEvent.Ready]?: () => Promise<void> | void;
```

**Use Cases:**
- Start HTTP servers
- Begin processing queues
- Trigger post-initialization hooks
- Log startup complete messages

**Example:**
```typescript
const serverSlice: ISlice = {
  name: "http-server",
  dependencies: ["database", "auth"],
  [Loaf.Ready]: async () => {
    await startServer();
    console.log("Server listening on port 3000");
  }
};
```

#### 4. Shutdown (`loaf:signal:-1`)

**Purpose:** Graceful shutdown phase.

**Signature:**
```typescript
[LoafEvent.Shutdown]?: () => Promise<void> | void;
```

**Use Cases:**
- Close database connections
- Stop servers
- Flush logs
- Release resources

**Example:**
```typescript
const dbSlice: ISlice = {
  name: "database",
  [Loaf.Shutdown]: async () => {
    await closeDatabase();
  }
};
```

#### 5. UncaughtError (`loaf:error`)

**Purpose:** Handle errors thrown by `Initialize` or `Ready` handlers, and uncaught process exceptions after `initialize()` has completed.

**Behaviour:**
- If an `Initialize` or `Ready` handler throws, the remaining handlers for that event are skipped, the `UncaughtError` chain runs with `(error)`, and the **original error is then rethrown** - so `initialize()`, `ready()` and `start()` reject.
- If an `UncaughtError` handler itself throws, that error is rethrown instead.
- After a successful `initialize()`, Loaf registers a single `process.on("uncaughtException")` listener that runs this chain. It is registered once per Loaf and removed by `shutdown()`.
- The error `UncaughtError` handlers receive (and the one `start()`/`initialize()`/`ready()` reject with) is the same object annotated with `error.slicePath` - see [Error Slice Paths](#error-slice-paths).

**Signature:**
```typescript
[LoafEvent.UncaughtError]?: (error: Error) => Promise<void> | void;
```

**Use Cases:**
- Log errors
- Send error notifications
- Attempt recovery
- Trigger rollbacks

**Example:**
```typescript
const errorHandler: ISlice = {
  name: "error-handler",
  [Loaf.UncaughtError]: async (error) => {
    console.error("Uncaught error:", error);
    await logErrorToService(error);
  }
};
```

#### 6. UnhandledRejection (`loaf:error:rejected-fly`)

**Purpose:** Handle unhandled promise rejections.

**Signature:**
```typescript
[LoafEvent.UnhandledRejection]?: (reason: unknown) => Promise<void> | void;
```

**Use Cases:**
- Similar to UncaughtError but specifically for promise rejections

> **Note:** Loaf does **not** listen for `unhandledRejection` itself - this event only runs when you execute it. Wire it up explicitly:
>
> ```typescript
> process.on("unhandledRejection", (reason) => {
>   loaf.execute(Loaf.UnhandledRejection, reason);
> });
> ```

### SliceEvents Type

All lifecycle events are encapsulated in the `SliceEvents` type:

```typescript
export type SliceEvents = {
  readonly [LoafEvent.Load]?: () => Promise<void> | void;
  readonly [LoafEvent.Initialize]?: () => Promise<void> | void;
  readonly [LoafEvent.Ready]?: () => Promise<void> | void;
  readonly [LoafEvent.Shutdown]?: () => Promise<void> | void;
  readonly [LoafEvent.UncaughtError]?: (error: Error) => Promise<void> | void;
  readonly [LoafEvent.UnhandledRejection]?: (reason: unknown) => Promise<void> | void;
};
```

---

## Dependency System

Sandwich provides a sophisticated dependency management system with topological sorting to ensure correct execution order.

### Dependency Types

#### 1. Simple String Dependencies

The simplest form: just specify the names of required Slices.

```typescript
const mySlice: ISlice = {
  name: "api-server",
  dependencies: ["database", "auth", "logger"]
};
```

This means `api-server` requires `database`, `auth`, and `logger` to be loaded before it.

#### 2. oneOf Dependencies

Require at least one of several options (conditional dependency).

```typescript
export type oneOf = { oneOf: string[] };
```

**Example:**
```typescript
const mySlice: ISlice = {
  name: "cache",
  dependencies: [
    { oneOf: ["redis", "memcached", "in-memory"] }
  ]
};
```

This means `cache` requires at least one of the three cache backends:

- If **none** are loaded, `load()` throws `Missing at least one of the required dependencies - redis, memcached, in-memory`.
- `cache` is ordered after **every** listed backend that is loaded; backends that are not loaded are ignored.

`oneOf` can also be used inside `DependencyInfo.required` (both the array form and `before`/`after`).

#### 3. DependencyInfo Objects

Advanced dependency constraints with fine-grained control.

```typescript
export type DependencyInfo = {
  moduleName?: string;
  event?: string;
  required?: {
    before?: (string | oneOf)[];
    after?: (string | oneOf)[];
    incompatible?: string[];
  } | (string | oneOf)[];
  optional?: {
    before?: string[];
    after?: string[];
    incompatible?: string[];
  };
};
```

**Properties:**
- `moduleName` - The name of the module this constraint applies to (defaults to slice name)
- `event` - Apply this constraint only for a specific event/crumb
- `required` (array form) - Shorthand for `required.before`
- `required.before` - Modules that must execute before this one (missing modules throw)
- `required.after` - Modules that must execute after this one (missing modules throw)
- `required.incompatible` - Reserved; **not implemented** (currently ignored)
- `optional.before` - Modules that should execute before if present
- `optional.after` - Modules that should execute after if present
- `optional.incompatible` - Reserved; **not implemented** (currently ignored)

### Dependency Constraint Types

#### Before Constraints

Module must execute **after** the specified dependencies.

```typescript
const mySlice: ISlice = {
  name: "api-routes",
  dependencies: [{
    required: {
      before: ["database", "auth"]
    }
  }]
};
```

Execution order: `database` → `auth` → `api-routes`

#### After Constraints

Module must execute **before** the specified modules.

```typescript
const mySlice: ISlice = {
  name: "logger",
  dependencies: [{
    required: {
      after: ["api-server", "worker"]
    }
  }]
};
```

Execution order: `logger` → `api-server` / `worker`

#### Incompatible Constraints

> **Not implemented.** The `incompatible` fields (and `Jam.allowInCompat`) are accepted by the types but are currently ignored at runtime - no error is thrown and no slice is filtered out. The examples below show the intended design only.

**Required Incompatible (planned):** Throw an error if specified modules are present.

```typescript
const mySlice: ISlice = {
  name: "sqlite-adapter",
  dependencies: [{
    required: {
      incompatible: ["postgres-adapter", "mysql-adapter"]
    }
  }]
};
```

**Optional Incompatible (planned):** Silently filter out the slice if specified modules are present.

```typescript
const mySlice: ISlice = {
  name: "dev-tools",
  dependencies: [{
    optional: {
      incompatible: ["production-mode"]
    }
  }]
};
```

### Event-Specific Dependencies

Apply constraints only for specific events/crumbs.

```typescript
const mySlice: ISlice = {
  name: "data-processor",
  dependencies: [
    // Global: requires auth to be loaded
    "auth",
    // Event-specific: for "process:data", execute after validator
    {
      event: "process:data",
      required: {
        before: ["validator"]
      }
    }
  ]
};
```

Event-scoped constraints only affect the order of that event's chain. Their `required` modules are still checked for presence during `load()`, regardless of event.

### Topological Sorting

Sandwich uses Kahn's algorithm to perform topological sorting of modules based on their dependency constraints.

**Key Features:**
- Detects circular dependencies and throws `AdjacencyError`
- Handles complex multi-constraint scenarios
- Supports event-specific ordering
- Provides detailed error messages with the problematic modules

**Error Handling:**
```typescript
export class AdjacencyError extends Error {
  result: number[];
  adjacencyList: Map<number, number[]>
  missingVertices: number[];
}
```

When a cycle is detected, you get detailed information:
- Partially sorted result
- Full adjacency list
- Missing/problematic vertices

### Dependency Resolution Example

Given these slices:

```typescript
const logger: ISlice = { name: "logger" };

const database: ISlice = {
  name: "database",
  dependencies: ["logger"]
};

const auth: ISlice = {
  name: "auth",
  dependencies: ["database", "logger"]
};

const api: ISlice = {
  name: "api",
  dependencies: ["auth", "database"]
};
```

Resolution order: `logger` → `database` → `auth` → `api`

---

## Public API Reference

### Loaf Class

#### Constructor

```typescript
constructor(jam: Jam)
```

Creates a new Loaf instance with the provided configuration.

**Parameters:**
- `jam: Jam` - Configuration object

**Example:**
```typescript
const loaf = new Loaf({
  name: "my-app",
  slices: ["./modules/auth", "./modules/db"],
  cwd: __dirname,
  devMode: true
});
```

#### Properties

```typescript
class Loaf {
  readonly name: string;
  readonly logger: Logger;
  readonly jam: Jam;
  readonly cwd: string;
  slices: Slices;
  sortedSliceNames: string[];
  crumbs: {[key: string]: string[]};
}
```

- `name` - Loaf instance name
- `logger` - Logger instance
- `jam` - Original configuration
- `cwd` - Working directory
- `slices` - Map of loaded Toast objects
- `sortedSliceNames` - Topologically sorted slice names
- `crumbs` - Map of crumb names to execution order

#### Static Event Constants

```typescript
static Load: LoafEvent.Load;
static Initialize: LoafEvent.Initialize;
static Ready: LoafEvent.Ready;
static Shutdown: LoafEvent.Shutdown;
static UncaughtError: LoafEvent.UncaughtError;
static UnhandledRejection: LoafEvent.UnhandledRejection;
```

Access lifecycle events via `Loaf.Initialize`, `Loaf.Ready`, etc.

#### Methods

##### start()

```typescript
readonly start: () => Promise<void>
```

Convenience method that executes the full startup sequence: `load()` → `initialize()` → `ready()`.

Rejects if any step fails (see [UncaughtError](#5-uncaughterror-loaferror)). Slices that already initialized are not cleaned up automatically, so call `shutdown()` yourself:

```typescript
try {
  await loaf.start();
} catch (error) {
  await loaf.shutdown();
  throw error;
}
```

**Example:**
```typescript
await loaf.start();
```

##### load()

```typescript
readonly load: () => Promise<void>
```

Loads all slices, builds dependency graph, and creates crumb execution paths.

**Internal Steps:**
1. Import and create Toast objects
2. Execute `Load` events (in slices-array order)
3. Extract dependency information and collect allowed crumbs
4. Perform topological sort
5. Build crumb execution chains

**Rejects when:** a slice cannot be loaded (`Could not load module … at index N in slices array`), a required dependency is missing, a `Load` handler throws, or the dependencies contain a cycle (`AdjacencyError`).

##### initialize()

```typescript
readonly initialize: () => Promise<void>
```

Executes the `Initialize` event chain. If a handler throws, runs the `UncaughtError` chain and rethrows the original error. On success, registers a single `uncaughtException` listener that runs the `UncaughtError` chain (only once per Loaf, however many times `initialize()` is called).

##### ready()

```typescript
readonly ready: () => Promise<void>
```

Executes the `Ready` event chain. Application is fully initialized after this. If a handler throws, runs the `UncaughtError` chain and rethrows the original error.

##### shutdown()

```typescript
readonly shutdown: () => Promise<void>
```

Executes the `Shutdown` event chain for graceful cleanup (in dependency order, same as `Initialize`), then removes the `uncaughtException` listener registered by `initialize()`. Rejects if a `Shutdown` handler throws.

**Example:**
```typescript
process.on('SIGTERM', async () => {
  await loaf.shutdown();
  process.exit(0);
});
```

##### get()

```typescript
readonly get: <T>(sliceName: string) => T
```

Retrieve a loaded slice by name with type casting. Returns `undefined` for unknown names.

**Example:**
```typescript
interface DatabaseSlice extends ISlice {
  query: (sql: string) => Promise<any>;
}

const db = loaf.get<DatabaseSlice>("database");
await db.query("SELECT * FROM users");
```

##### allowCrumb()

```typescript
readonly allowCrumb: (...crumbNames: string[]) => void
```

Allow additional crumb names. Like all allow/restrict methods, this only affects crumb chains built by a **later** `load()` call - call it before `load()`/`start()`.

**Example:**
```typescript
loaf.allowCrumb("user:login", "user:logout");
```

##### disallowCrumb()

```typescript
readonly disallowCrumb: (...crumbNames: string[]) => void
```

Remove crumb names from the allow list (before `load()`). This can also remove built-in lifecycle events, e.g. `loaf.disallowCrumb(Loaf.Ready)`.

##### restrictCrumb()

```typescript
readonly restrictCrumb: (...crumbNames: string[]) => void
```

Globally restrict crumbs from being registered, even if they are allowed. Must be called before `load()`; a restricted crumb has no chain, so executing it simply returns the start value.

**Example:**
```typescript
// Prevent any slice from executing this crumb
loaf.restrictCrumb("admin:delete-all");
```

##### unrestrictCrumb()

```typescript
readonly unrestrictCrumb: (...crumbNames: string[]) => void
```

Remove crumbs from the restrict list (before `load()`).

##### addHook()

```typescript
readonly addHook: (hook: ISliceHook) => () => void
```

Register a slice hook and return a function that removes it. Hooks are looked up per call, so a hook added after `load()` still applies to every subsequent invocation of the events it targets.

**Example:**
```typescript
const removeTracing = loaf.addHook({
  "order:place": { before: () => console.log(`-> ${useSlice().name}`) },
});
// ...later
removeTracing();
```

##### removeHook()

```typescript
readonly removeHook: (hook: ISliceHook) => void
```

Remove a previously registered hook (from `jam.hooks` or `addHook()`) by reference.

See [Slice Hooks](#slice-hooks) for the full semantics.

### Slice Class

#### Constructor

```typescript
constructor()
```

Base class for implementing Slices. It takes **no arguments** and has no `loaf` field.

> **Note:** when you pass a class in `jam.slices`, Loaf instantiates it with `new MySlice()` - no arguments are passed, so there is no `loaf` to receive during construction. Call `useLoaf()` inside a handler when you need the loaf, or a [`buildSlice(loaf)` factory](#5-buildslice-factory-pattern) when you need it during construction.

**Example:**
```typescript
export default class MySlice extends Slice {
  constructor() {
    super();
    this.name = 'my-slice';
  }

  [Loaf.Initialize] = async () => {
    // initialization logic - use useLoaf() if needed
  };
}
```

### Context Functions

```typescript
function useLoaf<T extends Loaf = Loaf>(): T;
function useSlice<T = Toast>(): T;
function useChain(): ChainControl;

export interface LoafContext {
  loaf: Loaf;
  slice?: Toast;
  path?: PathFrame[];
}
```

Access the current loaf/slice from inside a handler, instead of receiving them as arguments. See [Execution Context](#execution-context) for the full semantics (nesting, parallel isolation, `buildSlice` context, etc.).

- `useLoaf()` - returns the current `Loaf`. Throws `useLoaf() must be called inside a Loaf handler` outside a Loaf-managed context.
- `useSlice()` - returns the current `Toast`. Throws `useSlice() must be called inside a slice handler` outside a slice handler (including inside a loaf-only context, e.g. `buildSlice`).
- `useChain()` - returns the `ChainControl` for the sequential chain (`execute`, `condition` or `sync`) currently running the handler or hook. Throws `useChain() is only available in sequential chains (execute, condition, sync)` anywhere else - including inside `all()`, inside `Load` handlers/hooks, or outside any handler. See [Chain Control](#chain-control).

**Example:**
```typescript
import { Loaf, ISlice, useLoaf } from "@azerothian/sandwich";

const mySlice: ISlice = {
  name: "database",
  [Loaf.Initialize]: async () => {
    const loaf = useLoaf();
    console.log(`Initializing for ${loaf.name}`);
  }
};
```

### ISlice Interface

The core interface for defining Slices.

```typescript
export interface ISlice extends SliceEvents {
  readonly name: string;
  readonly dependencies?: (string | oneOf | DependencyInfo)[];
  readonly ignore?: string[];
  readonly allow?: string[];
}
```

**Properties:**
- `name` - Unique identifier for the slice. Slices without a name get a random UUID; a later slice with the same name silently replaces an earlier one
- `dependencies` - Dependency constraints
- `ignore` - Array of crumb names this slice should not execute
- `allow` - Array of additional crumb names this slice enables (for **all** slices, not just this one)

### Kitchen Utilities

#### buildToast()

```typescript
async function buildToast(
  sliceData: any,
  loaf: Loaf,
  cwd: string,
  currentIdx: number,
  clone: boolean = false
): Promise<Toast>
```

Convert raw slice data (string path, object, or class) into a Toast object.

**Parameters:**
- `sliceData` - Module to load (path, object, or class)
- `loaf` - Loaf instance
- `cwd` - Working directory for resolving paths
- `currentIdx` - Index in the slices array
- `clone` - Whether to clone object modules

**Returns:** Promise<Toast>

#### importAndCreateToast()

```typescript
async function importAndCreateToast(
  jam: Jam,
  loaf: Loaf
): Promise<Slices>
```

Load all slices from the Jam configuration.

**Returns:** Promise<Slices> - Map of slice names to Toast objects

#### sortArrayByDependencyInfo()

```typescript
function sortArrayByDependencyInfo(
  moduleNames: string[],
  dependencyInfos: DependencyInfo[],
  eventName?: string
): string[]
```

Topologically sort an array of module names based on dependency constraints.

**Parameters:**
- `moduleNames` - Array of module names to sort
- `dependencyInfos` - Array of dependency constraints
- `eventName` - Optional: filter constraints by event

**Returns:** string[] - Topologically sorted module names

**Throws:** AdjacencyError if circular dependencies detected

#### getDependencyInfos()

```typescript
function getDependencyInfos(slice: Toast): DependencyInfo[]
```

Extract DependencyInfo objects from a slice's dependencies.

**Returns:** DependencyInfo[] - Array of normalized dependency information

### Logger Interface

```typescript
export type Logger = {
  debug: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
  err: (message: string, ...args: any[]) => void;
  log: (message: string, ...args: any[]) => void;
};
```

Custom logger interface. If not provided, Sandwich creates a debug-based logger.

---

## Crumb System

Crumbs are custom events that can be executed across multiple slices. They provide a powerful mechanism for cross-cutting concerns and coordinated actions.

### What are Crumbs?

A "crumb" is any function property on a Slice that:
1. Is in the `allowCrumbNames` list
2. Is not in the `restrictedCrumbNames` list
3. Is not in the slice's `ignore` array

### Crumb Registration

#### During Loaf Construction

```typescript
const loaf = new Loaf({
  name: "my-app",
  slices: [...],
  crumbNames: ["user:login", "user:logout", "data:process"]
});
```

#### Dynamic Registration

```typescript
// In a slice's Load event
[Loaf.Load]: async () => {
  useLoaf().allowCrumb("custom:event");
}

// Or allow via slice definition
const mySlice: ISlice = {
  name: "events",
  allow: ["custom:event"]
};
```

### Crumb Execution Paths

During the `load()` phase, Sandwich:
1. Collects all crumbs from all slices
2. Builds topologically-sorted execution paths for each crumb
3. Filters out slices that don't implement the crumb
4. Respects slice `ignore` lists

### Crumb Restrictions

#### Per-Slice Restrictions

```typescript
const mySlice: ISlice = {
  name: "public-api",
  ignore: ["admin:delete", "internal:debug"],
  "user:login": async (data) => {
    // This slice handles user:login
  }
  // But it will never execute admin:delete or internal:debug
};
```

#### Global Restrictions

```typescript
// Restrict globally before load() - no slice registers this crumb
loaf.restrictCrumb("dangerous:operation");
await loaf.start();

await loaf.execute("dangerous:operation", input); // returns `input` untouched
```

Restrictions (and `unrestrictCrumb()`) are applied when `load()` builds the crumb chains; changing them afterwards has no effect on the current Loaf.

#### Allowance Control

```typescript
// Only allowed crumbs can be registered - call before load()
loaf.allowCrumb("new:feature");

// Remove from allow list
loaf.disallowCrumb("deprecated:feature");
```

### Default Allowed Crumbs

By default, only lifecycle events are allowed:
- `loaf:load`
- `loaf:init`
- `loaf:rdy`
- `loaf:signal:-1`
- `loaf:error`
- `loaf:error:rejected-fly`

Plus any specified in `jam.crumbNames` or via `allowCrumb()`.

### Custom Crumb Execution

Define and execute custom crumbs:

```typescript
// Define custom crumb type
export enum UserEvents {
  Login = "user:login",
  Logout = "user:logout"
}

// Slice 1: Auth handler
const authSlice: ISlice = {
  name: "auth",
  // Crumb handlers receive (previousValue, ...extraArgs)
  [UserEvents.Login]: async (credentials) => {
    console.log("Auth: validating credentials");
    return { valid: true, token: "xyz" };
  }
};

// Slice 2: Logger
const loggerSlice: ISlice = {
  name: "logger",
  dependencies: [{
    event: UserEvents.Login,
    required: { before: ["auth"] } // auth runs before logger
  }],
  [UserEvents.Login]: async (authResult) => {
    console.log("Logger: user logged in", authResult);
    return authResult;
  }
};

// Slice 3: Analytics
const analyticsSlice: ISlice = {
  name: "analytics",
  dependencies: [{
    event: UserEvents.Login,
    required: { before: ["logger"] } // logger runs before analytics
  }],
  [UserEvents.Login]: async (authResult) => {
    console.log("Analytics: tracking login");
    return authResult;
  }
};

// Jam configuration
const loaf = new Loaf({
  name: "app",
  slices: [authSlice, loggerSlice, analyticsSlice],
  crumbNames: [UserEvents.Login, UserEvents.Logout]
});

await loaf.start();

// Execute custom crumb
const result = await loaf.execute(UserEvents.Login, {
  username: "john",
  password: "secret"
});
```

**Execution Order:**
1. `auth` validates credentials
2. `logger` logs the result
3. `analytics` tracks the event

### Crumb Execution Modes

Inherited from the Chains class, crumbs can be executed in different ways:

#### execute() - Waterfall

```typescript
const result = await loaf.execute("custom:event", startValue, ...args);
```

Each function receives the return value of the previous function. Runs with [chain control](#chain-control) - a handler (or a hook around it) can call `useChain().cancel()`/`skip()`/`redirect()` to alter the chain.

#### sync() - Synchronous Waterfall

```typescript
const result = loaf.sync("custom:event", startValue, ...args);
```

Synchronous version. Throws `Cannot use sync with async functions` as soon as a function returns a Promise (that function has already started running). Also runs with chain control, as long as every `useChain()` call and handler stays synchronous.

#### all() - Parallel

```typescript
const results = await loaf.all("custom:event", startValue, ...args);
```

Execute all functions in parallel, returns array of results. There is **no** chain control here - `useChain()` throws inside `all()` since there is no sequence to control.

#### condition() - Conditional Waterfall

```typescript
const result = await loaf.condition(
  "custom:event",
  async (result) => result.shouldStop,
  startValue,
  ...args
);
```

Executes until condition function returns true. Also runs with chain control; the condition function is checked after chain control for that step has been applied.

---

## Chain Execution System

Sandwich's execution system is powered by the `Chains` class, which provides flexible function composition and execution strategies.

### Chains Class

```typescript
export default class Chains {
  readonly funcs: { [key: string]: any[] };
  readonly locks: { [key: string]: boolean };
  readonly options: { [key: string]: { ignoreReturn: boolean } };
}
```

The Loaf class extends Chains, inheriting all execution capabilities.

### Execution Options

```typescript
loaf.setOptions(eventName, {
  ignoreReturn: true
});
```

**ignoreReturn:**
- `true` - All functions receive the original start value (doesn't pass return values)
- `false` (default) - Each function receives the previous function's return value

### Execution Methods

#### execute() - Async Waterfall

```typescript
async execute<T>(
  eventName: string,
  start?: any,
  ...args: readonly unknown[]
): Promise<T>
```

Executes functions in sequence (waterfall pattern). Each function receives the return value of the previous function. Runs with [chain control](#chain-control): inside a function (or a hook wrapping it), `useChain()` gives access to `cancel()`, `skip()` and `redirect()` for the running chain.

**Example:**
```typescript
// With return value passing
const result = await loaf.execute("transform:data", { value: 1 });
// Function 1: { value: 1 } → { value: 2 }
// Function 2: { value: 2 } → { value: 4 }
// Result: { value: 4 }

// With ignoreReturn
loaf.setOptions("notify:event", { ignoreReturn: true });
await loaf.execute("notify:event", originalData);
// All functions receive originalData
```

#### sync() - Synchronous Waterfall

```typescript
sync<T>(
  eventName: string,
  start: any,
  ...args: readonly unknown[]
): T
```

Synchronous version of `execute()`. Throws `Cannot use sync with async functions` if any function returns a Promise (or thenable). The check happens after the function is called, so an async function will already have started. Chain control (`useChain()`) works here too, provided every hook and handler in the chain stays synchronous.

**Example:**
```typescript
const result = loaf.sync("compute:total", 0);
```

#### all() - Parallel Execution

```typescript
async all<T>(
  eventName: string,
  start: any,
  ...args: readonly unknown[]
): Promise<T[]>
```

Executes all functions in parallel using `Promise.all()`. Returns array of results. There is **no** chain control for `all()` - it is not a sequence, so `useChain()` throws inside it.

**Example:**
```typescript
const results = await loaf.all("fetch:data", apiConfig);
// Returns: [result1, result2, result3, ...]
```

#### condition() - Conditional Waterfall

```typescript
async condition<T1, T2>(
  eventName: string,
  conditionFunc: (o: T2) => Promise<boolean>,
  start: T1,
  ...args: readonly unknown[]
): Promise<T1>
```

Executes functions in sequence until the condition function returns true. Runs with chain control - the condition function is checked after that step's `useChain()` action has already been applied.

**Example:**
```typescript
const result = await loaf.condition(
  "process:items",
  async (result) => result.error !== undefined,
  { items: [] }
);
// Stops execution if any function returns an error
```

### Function Management

#### push()

```typescript
readonly push: (eventName: string, func: any | any[]) => void
```

Add function(s) to the end of an event chain.

**Example:**
```typescript
loaf.push("custom:event", async (loaf) => {
  console.log("Handler executed");
});

// Add multiple
loaf.push("custom:event", [handler1, handler2, handler3]);
```

#### unshift()

```typescript
readonly unshift: (eventName: string, func: any) => void
```

Add a function to the beginning of an event chain.

**Example:**
```typescript
loaf.unshift("custom:event", async (loaf) => {
  console.log("This runs first");
});
```

#### clear()

```typescript
readonly clear: (eventName: string) => void
```

Remove all functions for an event (unless locked).

#### lock() / unlock()

```typescript
readonly lock: (eventName: string) => void
readonly unlock: (eventName: string) => void
```

Prevent modifications to an event chain.

**Example:**
```typescript
loaf.lock("critical:event");
loaf.push("critical:event", handler); // Silently ignored
loaf.unlock("critical:event");
loaf.push("critical:event", handler); // Now works
```

### Waterfall Utility

The underlying waterfall implementation:

```typescript
async function waterfall<T>(
  arr: any[],
  func: (val: any, prevVal: any, currentIdx?: number, brk?: () => void) => any,
  start?: any
): Promise<T>
```

**Parameters:**
- `arr` - Array to iterate over
- `func` - Iterator function receiving (currentItem, previousResult, index, break)
- `start` - Initial value

**Break Function:**
The `brk()` callback can be called to stop iteration early.

**Example:**
```typescript
import waterfall from "@azerothian/sandwich/utils/waterfall";

const result = await waterfall(
  [1, 2, 3, 4, 5],
  async (num, sum, idx, brk) => {
    if (sum > 6) {
      brk(); // Stop iterating
      return sum;
    }
    return sum + num;
  },
  0
);
// Result: 6 (stops at 1+2+3)
```

---

## Slice Hooks

Hooks wrap the handler call for an event, per slice, without changing the slice itself. A hook can run code before a slice's handler, after it, rewrite the value flowing through the chain, or (combined with [chain control](#chain-control)) cancel/skip/redirect on the slice's behalf.

### Registering hooks

Hooks come from two places, and run in this order: `jam.hooks` (in array order), then hooks added at runtime with `addHook()` (in the order they were added).

```typescript
import { Loaf, useChain, useSlice } from '@azerothian/sandwich';
import type { ISliceHook } from '@azerothian/sandwich';

const tracing: ISliceHook = {
  "order:place": {
    // no sliceNames - runs for every slice handling order:place
    before: () => { console.log(`-> ${useSlice().name}`); },
  },
};

const loaf = new Loaf({
  name: "orders-app",
  crumbNames: ["order:place"],
  hooks: [tracing],
  slices: [/* ... */],
});
await loaf.start();

// Hooks can also be registered (and removed) after load()
const removeTracing = loaf.addHook(tracing);
// ...later
removeTracing();
loaf.removeHook(tracing); // equivalent, if you kept the reference instead
```

Because hooks are looked up at call time (not baked into the crumb chain during `load()`), a hook added later applies to every subsequent invocation of the events it targets.

### Hook shape

```typescript
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
```

For each slice that handles the hooked event: if `sliceNames` is omitted, the hook applies to every slice; otherwise only to the slices listed.

### Semantics

- **before(firstArg, ...extraArgs)** runs before the handler. If it returns a value other than `undefined`, that value replaces the handler's first argument (and is what the handler actually receives). Returning `undefined` leaves the value unchanged.
- **after(result, ...extraArgs)** runs after the handler. If it returns a value other than `undefined`, that value replaces the handler's return value - which is what the next slice in the chain (or the chain's final result) receives.
- Both receive the same `...extraArgs` the handler was called with.
- Multiple hooks targeting the same slice/event compose, running in registration order (`jam.hooks` first, then `addHook()` order); each one sees the previous one's rewritten value.
- Hooks run inside the **target slice's** context: `useSlice()` returns the target slice, `useLoaf()` works, and `this` inside the hook function is bound to the target slice - same as inside the handler itself.
- Hooks apply to **every** event, including the lifecycle events (`Load`, `Initialize`, `Ready`, `Shutdown`, `UncaughtError`, `UnhandledRejection`) and custom crumbs. Lifecycle chains use `ignoreReturn`, so an `after` hook's return value has no effect there; a `before` hook can still run and rewrite the (always-`undefined`) first argument, though nothing reads it back for lifecycle events.
- If a `before` hook calls `useChain().cancel()`/`skip()`/`redirect()` (only meaningful for `execute`/`condition`/`sync` chains), the remaining `before` hooks, the slice's handler, and the `after` hooks for that slice are all skipped - see [Chain Control](#chain-control).
- Hooks work inside `sync()` as long as they (and the handler) stay synchronous. An async hook inside a `sync()` chain throws `Cannot use sync with async functions`, exactly like an async handler would.

**Example - rewriting input and output for one slice:**
```typescript
const discounts: ISliceHook = {
  "order:place": {
    sliceNames: ["payment"],
    before: (order) => ({ ...order, total: Math.round(order.total * 0.9) }),
    after: (order) => ({ ...order, steps: [...order.steps, `charged ${order.total}`] }),
  },
};
```

See [`examples/hooks-and-chain-control/index.ts`](../examples/hooks-and-chain-control/index.ts) for a full runnable example.

---

## Chain Control

`useChain()` gives a handler or hook running inside a **sequential** chain (`execute()`, `condition()`, `sync()`) a way to alter the chain instead of just returning a value.

```typescript
import { useChain } from '@azerothian/sandwich';
import type { ChainControl, RedirectTarget } from '@azerothian/sandwich';

function useChain(): ChainControl;

export type RedirectTarget = { slice: string; event?: string } | { event: string; slice?: string };

export interface ChainControl {
  readonly eventName: string;
  readonly index: number;
  cancel(value?: unknown): void;
  skip(): void;
  redirect(target: RedirectTarget): void;
}
```

- Available inside `execute()`, `condition()` and `sync()` chains - including inside hooks that wrap those chains' handlers.
- Throws `useChain() is only available in sequential chains (execute, condition, sync)` anywhere else: outside a handler entirely, inside `all()` (parallel execution has no sequence to control), and inside `Load` handlers/hooks (the `Load` phase iterates slices with a plain waterfall, not a chain).
- `eventName`/`index` report the event and the position of the currently running step in that chain.
- The returned object's methods are bound, so destructuring works: `const { cancel, skip, redirect } = useChain();`.
- Only one action is tracked per step - if a handler or a hook calls more than one of `cancel()`/`skip()`/`redirect()` during the same step, the **last call wins**.
- A nested `execute()`/`condition()`/`sync()` call (e.g. a handler calling `useLoaf().execute(otherEvent, ...)`) gets its **own** `ChainControl`; acting on it does not affect the outer chain, and once the nested call returns, `useChain()` again refers to the outer chain.

### Methods

- **`cancel(value?)`** - Stops the chain immediately. `execute()`/`sync()`/`condition()` resolves with `value` if one was passed (even `cancel(undefined)` counts as "passed" and resolves with `undefined`); otherwise it resolves with the chain's current value (the result of the step that called `cancel()`, or, for an `ignoreReturn` chain, the start value). Called from a `before` hook, the slice's handler never runs, and the "current value" is the (possibly hook-rewritten) first argument.
- **`skip()`** - Discards the result of the current step; the chain continues with the value it had *before* this step, as if the step had never run. Called from a `before` hook, the slice's handler does not run at all, and any `after` hooks for that slice are skipped too.
- **`redirect({ slice })`** - Jumps forward to the named slice **later** in the same chain, skipping everything in between, and passes the chain's current value to it. Throws `redirect target slice "x" not found later in chain "evt"` if no later step in the chain belongs to that slice name (this includes slices earlier in the chain).
- **`redirect({ event })`** - Stops the current chain and hands the current value off to a different event: it is equivalent to returning `execute(event, currentValue, ...sameExtraArgs)` (or `sync()`'s synchronous equivalent, inside a `sync()` chain). If that event has no registered handlers, the current value is returned unchanged.
- **`redirect({ event, slice })`** - Like `redirect({ event })`, but the other event's chain starts at `slice`; the slices before it in that chain are skipped. Because it starts a new chain, the slice can be anywhere in that event's chain - including the current event, which restarts it from that slice (guard against infinite loops yourself). Throws `redirect target slice "x" not found in chain "evt"` if the slice has no handler in that event's chain (or the event has no handlers at all).
- `redirect()` needs a `{ slice }`, an `{ event }` or both - passing neither throws `redirect() needs a { slice }, an { event } or both`.
- In `condition()`, the condition function runs **after** the step's chain-control action has already been applied - it sees the post-redirect/post-skip/post-cancel value.

### Semantics table

| Call | Handler for this step | Rest of `before`/`after` hooks for this slice | Rest of the chain | Result |
|---|---|---|---|---|
| (none) | runs | run | continues to next step | normal waterfall value |
| `cancel(value)` | skipped (from `before`) / already ran (from handler/`after`) | skipped | stops | resolves with `value` |
| `cancel()` | same as above | skipped | stops | resolves with the current value |
| `skip()` | skipped (from `before`) / result discarded (from handler/`after`) | skipped | continues with the *previous* value | (chain continues) |
| `redirect({ slice })` | skipped (from `before`) / already ran | skipped | jumps to that slice, skipping in between | (chain continues from there) |
| `redirect({ event })` | skipped (from `before`) / already ran | skipped | stops this chain | `execute(event, currentValue, ...args)` |
| `redirect({ event, slice })` | skipped (from `before`) / already ran | skipped | stops this chain | `event`'s chain run from `slice` with `(currentValue, ...args)` |

**Example:**
```typescript
const validate = {
  name: "validate",
  "order:place": async (order) => {
    if (order.total <= 0) {
      useChain().cancel({ ...order, steps: [...order.steps, "rejected"] });
      return order;
    }
    if (order.express) {
      useChain().redirect({ slice: "payment" }); // skip fraud/loyalty checks
    }
    return { ...order, steps: [...order.steps, "validated"] };
  },
};
```

See [`examples/hooks-and-chain-control/index.ts`](../examples/hooks-and-chain-control/index.ts) for `cancel`, `skip` and both forms of `redirect` used together across a chain.

---

## Error Slice Paths

Any error thrown - synchronously or via a rejected promise - by a slice handler or a hook is annotated, once, with the full path of slice handlers that led to it. This makes it possible to tell *which* slice(s), across however many nested `execute()` calls, were on the stack when something failed.

### Shape

```typescript
export interface PathFrame {
  event: string;
  slice: string;
  // set when the frame is a hook running around the slice's handler
  phase?: "before" | "after";
}
```

- `error.slicePath: PathFrame[]` - one frame per slice handler on the way to the error, outermost first, including frames for any nested `execute()`/`all()`/`sync()`/`condition()` calls.
- Hook frames carry `phase: "before" | "after"`; handler frames omit `phase`.
- The error's **identity and `instanceof`** are preserved - it's still the exact object (or class) that was thrown, just with `slicePath` (and `message`/`stack`) added.
- Annotation happens once, at the innermost frame where the error is first caught; as it propagates back out through more slices, it is recognized as already annotated and left alone.

### Message and stack

The error's `message` gets ` [at event(slice) > event(slice)]` appended, formatted with `formatPath()`; a hook frame renders as `event(slice:before)` / `event(slice:after)`. The stack's first line is rewritten to match the new message.

```typescript
function formatPath(path: PathFrame[]): string;
// path.map(f => `${f.event}(${f.slice}${f.phase ? `:${f.phase}` : ""})`).join(" > ")
```

**Example** - a handler in slice `api` calls `useLoaf().execute("db:connect")`, which runs a handler in slice `database` that throws `db down`:

```
db down [at loaf:init(api) > db:connect(database)]
```

and `error.slicePath` is:
```typescript
[
  { event: "loaf:init", slice: "api" },
  { event: "db:connect", slice: "database" },
]
```

### Edge cases

- **Primitive throws** (e.g. `throw "x"`) are wrapped in a `new Error(String(x))` whose `cause` is the original thrown value, then annotated as usual.
- **Frozen errors** (`Object.freeze(error)`) can't be mutated, so they are rethrown untouched - no `slicePath`, no message/stack change.
- Errors that don't come from a handler or hook - a missing dependency thrown during `load()`, an `AdjacencyError` from a dependency cycle, or an error from `buildSlice()` - are **not** annotated with a slice path.

### UncaughtError flow

`UncaughtError` handlers (and the rejection from `start()`/`initialize()`/`ready()`) receive this same annotated error, so `error.slicePath` and the rewritten `error.message` are available wherever the error is ultimately handled or logged:

```typescript
const errorHandler: ISlice = {
  name: "error-handler",
  [Loaf.UncaughtError]: async (error: any) => {
    console.error(error.message); // includes " [at ...]"
    console.error(error.slicePath); // PathFrame[]
  },
};
```

---

## Module Loading

Sandwich supports multiple ways to load modules, providing flexibility for different project structures.

### Loading Methods

#### 1. File Paths (Relative)

```typescript
const loaf = new Loaf({
  name: "app",
  slices: [
    "./modules/auth.ts",
    "./modules/database.ts",
    "./modules/api.ts"
  ],
  cwd: __dirname
});
```

**Notes:**
- Paths starting with `.` are resolved relative to `cwd`
- Uses dynamic `import()` internally
- Works with both ESM and CommonJS (via build config)

#### 2. File Paths (Absolute)

```typescript
const loaf = new Loaf({
  name: "app",
  slices: [
    "/absolute/path/to/module.ts",
    "node_modules/my-plugin/index.js"
  ]
});
```

#### 3. Direct Objects

```typescript
const authModule: ISlice = {
  name: "auth",
  [Loaf.Initialize]: async () => {
    // ...
  }
};

const loaf = new Loaf({
  name: "app",
  slices: [authModule]
});
```

**Cloning:**
Set `clone: true` in Jam to prevent shared state between instances:

```typescript
const loaf = new Loaf({
  name: "app",
  slices: [sharedModule],
  clone: true // Creates a copy of each object module
});
```

#### 4. Classes

```typescript
class AuthModule extends Slice {
  constructor() {
    super(); // Loaf passes no constructor arguments
    this.name = "auth";
  }

  [Loaf.Initialize] = async () => {
    // ... use useLoaf() if needed
  };
}

const loaf = new Loaf({
  name: "app",
  slices: [AuthModule] // Pass the class, not an instance
});
```

**Note:** Classes are instantiated automatically with `new mod()` - no arguments are passed. Anything with a `prototype` (including plain `function`s) is treated as a class.

#### 5. buildSlice Factory Pattern

For more control over instantiation:

```typescript
// module.ts
export function buildSlice(loaf: Loaf): ISlice {
  return {
    name: "configured-module",
    customConfig: loaf.jam.customConfig,
    [Loaf.Initialize]: async () => {
      // Use customConfig
    }
  };
}

// Or with default export
export default {
  buildSlice(loaf: Loaf): ISlice {
    return {
      name: "module",
      // ...
    };
  }
};
```

**When to use:**
- Need access to Loaf/Jam during module construction
- Complex initialization logic
- Conditional module configuration

> **Note:** `buildSlice(loaf)` still receives the `loaf` argument, and also runs inside a loaf-only context, so `useLoaf()` works inside the factory itself (though `useSlice()` does not, since no slice exists yet).

### Module Resolution Process

When loading a module, `buildToast()` follows this logic:

1. **String path?**
   - Resolve relative to `cwd` if starts with `.`
   - Dynamic `import()`
   - Use `default` export if available, otherwise use entire export

2. **Has prototype?** (Class)
   - Instantiate with `new mod()`

3. **Has buildSlice?** (Factory)
   - Call `mod.buildSlice(loaf)`

4. **Plain object**
   - Use directly (or clone if `jam.clone === true`)

5. **Enrich to Toast**
   - Add `id` (from `name` or generate UUID); duplicate ids overwrite earlier slices
   - Extract `dependencyInfos`
   - Return Toast object

### ESM Import Path Resolution

For ESM modules using `import.meta.url`:

```typescript
import { URL } from 'url';
import { Loaf } from '@azerothian/sandwich';

const __dirname = new URL('.', import.meta.url).pathname;

const loaf = new Loaf({
  name: "app",
  slices: [
    "./modules/auth.ts",
    "./modules/database.ts"
  ],
  cwd: __dirname
});
```

### CommonJS Require Path Resolution

For CommonJS modules:

```typescript
const { Loaf } = require('@azerothian/sandwich');

const loaf = new Loaf({
  name: "app",
  slices: [
    "./modules/auth.js",
    "./modules/database.js"
  ],
  cwd: __dirname
});
```

---

## Build Outputs

Sandwich is published with multiple build targets to support different module systems and TypeScript configurations.

### Package Structure

```
publish/
├── lib/              # ESM output
│   ├── index.js
│   ├── loaf.js
│   ├── slice.js
│   └── *.d.ts        # TypeScript declarations
├── cjs/              # CommonJS output
│   ├── index.js
│   ├── loaf.js
│   └── slice.js
├── types/            # Full TypeScript types
│   └── ...
└── src/              # Original source (for source maps)
    └── ...
```

### Package.json Configuration

```json
{
  "name": "@azerothian/sandwich",
  "version": "2.0.0",
  "type": "module",
  "main": "cjs/index.js",
  "module": "lib/index.js",
  "types": "lib/index.d.ts",
  "engines": {
    "node": ">=16.4.0"
  }
}
```

> **Note:** v2 uses Node's `AsyncLocalStorage` (`node:async_hooks`) for `useLoaf()`/`useSlice()`, so it requires Node >= 16.4 and is not usable in browsers.

### Import Strategies

#### ESM (Modern)

```typescript
import { Loaf, ISlice, LoafEvent } from '@azerothian/sandwich';
```

**Resolution:**
- Uses `"module": "lib/index.js"` field
- Full ESM with native `import/export`

#### CommonJS (Legacy)

```javascript
const { Loaf, LoafEvent } = require('@azerothian/sandwich');
```

**Resolution:**
- Uses `"main": "cjs/index.js"` field
- Transpiled to CommonJS with `module.exports`

#### TypeScript

```typescript
import { Loaf } from '@azerothian/sandwich';
import type { ISlice, Jam, Toast } from '@azerothian/sandwich';
```

**Resolution:**
- Uses `"types": "lib/index.d.ts"` field
- Full type definitions included
- Source maps available for debugging

### Build Process

The package is built using SWC for fast transpilation:

```bash
# ESM build
swc src --out-dir publish/lib --strip-leading-paths -s

# CommonJS build
swc src --out-dir publish/cjs --config-file=.swcrc-cjs --strip-leading-paths -s

# TypeScript declarations
tsc -p tsconfig.types.json --outDir publish/types
```

### SWC Configuration

**ESM (.swcrc):**
```json
{
  "module": {
    "type": "es6"
  },
  "jsc": {
    "parser": {
      "syntax": "typescript",
      "decorators": true
    },
    "target": "es2020"
  }
}
```

**CommonJS (.swcrc-cjs):**
```json
{
  "module": {
    "type": "commonjs"
  },
  "jsc": {
    "parser": {
      "syntax": "typescript"
    },
    "target": "es2020"
  }
}
```

### Version and Publishing

**Current Version:** 2.0.0

**Publish Commands:**
```bash
# Build
pnpm run build

# Publish to npm
pnpm run package:npm

# Local testing with yalc
pnpm run package:yalc
```

---

## Complete Example

Here's a comprehensive example demonstrating all major features. The slices are deliberately listed in reverse order - dependencies fix the execution order.

```typescript
// types.ts
export enum AppEvents {
  ProcessData = "app:process-data",
  SendNotification = "app:notify"
}

// logger.slice.ts
import { Loaf, ISlice } from '@azerothian/sandwich';

export const loggerSlice: ISlice = {
  name: "logger",
  [Loaf.Initialize]: async () => {
    console.log("[Logger] Initialized");
  },
  // Crumb handlers receive (previousValue, ...extraArgs)
  [AppEvents.ProcessData]: async (data: any) => {
    console.log("[Logger] Processing:", data);
    return data;
  }
};

// database.slice.ts
export const databaseSlice: ISlice = {
  name: "database",
  dependencies: ["logger"],
  [Loaf.Initialize]: async () => {
    console.log("[Database] Connected");
  },
  [Loaf.Shutdown]: async () => {
    console.log("[Database] Disconnected");
  }
};

// processor.slice.ts
import { useLoaf } from '@azerothian/sandwich';

export const processorSlice: ISlice = {
  name: "processor",
  dependencies: [
    "database",
    // For ProcessData only: logger runs before processor
    { event: AppEvents.ProcessData, required: { before: ["logger"] } }
  ],
  [Loaf.Ready]: async () => {
    await useLoaf().execute(AppEvents.ProcessData, { id: 1, value: "test" });
  },
  [AppEvents.ProcessData]: async (data: any) => {
    console.log("[Processor] Handling:", data);
    return { ...data, processed: true };
  }
};

// notifier.slice.ts
export const notifierSlice: ISlice = {
  name: "notifier",
  dependencies: [
    // For ProcessData only: processor runs before notifier
    { event: AppEvents.ProcessData, required: { before: ["processor"] } }
  ],
  [AppEvents.ProcessData]: async (data: any) => {
    console.log("[Notifier] Sending notification for:", data);
    await useLoaf().execute(AppEvents.SendNotification, data);
    return data;
  },
  [AppEvents.SendNotification]: async (data: any) => {
    console.log("[Notifier] Email sent for:", data.id);
    return data;
  }
};

// index.ts
import { Loaf } from '@azerothian/sandwich';
import { loggerSlice, databaseSlice, processorSlice, notifierSlice } from './slices';

const loaf = new Loaf({
  name: "data-processor-app",
  slices: [notifierSlice, processorSlice, databaseSlice, loggerSlice],
  crumbNames: [AppEvents.ProcessData, AppEvents.SendNotification]
});

try {
  await loaf.start();
} catch (error) {
  await loaf.shutdown();
  throw error;
}

process.on('SIGTERM', async () => {
  await loaf.shutdown();
  process.exit(0);
});
```

**Console Output:**
```
[Logger] Initialized
[Database] Connected
[Logger] Processing: { id: 1, value: 'test' }
[Processor] Handling: { id: 1, value: 'test' }
[Notifier] Sending notification for: { id: 1, value: 'test', processed: true }
[Notifier] Email sent for: 1
```

---

## Advanced Patterns

### Conditional Module Loading

```typescript
const modules = [
  "./core/logger",
  "./core/database"
];

if (process.env.NODE_ENV === 'production') {
  modules.push("./monitoring/sentry");
} else {
  modules.push("./dev/debug-tools");
}

const loaf = new Loaf({
  name: "app",
  slices: modules
});
```

### Plugin System

```typescript
// plugin-interface.ts
export interface IPlugin extends ISlice {
  version: string;
  enable: () => void;
  disable: () => void;
}

// plugin-loader.ts
export async function loadPlugins(pluginDir: string): Promise<string[]> {
  const files = await fs.readdir(pluginDir);
  return files.map(file => path.join(pluginDir, file));
}

// app.ts
const plugins = await loadPlugins('./plugins');

const loaf = new Loaf({
  name: "app",
  slices: [
    "./core/base",
    ...plugins
  ]
});
```

### Dynamic Crumb Registration

```typescript
const apiSlice: ISlice = {
  name: "api",
  [Loaf.Load]: async () => {
    // Dynamically register endpoint handlers
    const endpoints = ["user:create", "user:update", "user:delete"];
    useLoaf().allowCrumb(...endpoints);
  },
  "user:create": async (data) => {
    // Handle user creation
    return data;
  }
};
```

This works for the `api` slice itself and any slices listed after it; see the [Load note](#1-load-loafload). Prefer `jam.crumbNames` or `allow` when every slice needs the crumb.

### Middleware Pattern

```typescript
const middlewareSlice: ISlice = {
  name: "middleware",
  dependencies: [{
    event: "http:request",
    required: { after: ["router"] } // middleware runs before router
  }],
  "http:request": async (req) => {
    // Add middleware functionality
    req.startTime = Date.now();
    return req;
  }
};

const routerSlice: ISlice = {
  name: "router",
  "http:request": async (req) => {
    // Route the request
    console.log("Request took:", Date.now() - req.startTime);
    return req;
  }
};
```

---

## Conclusion

Sandwich provides a powerful, flexible foundation for building modular TypeScript/JavaScript applications. Its sophisticated dependency management, event-driven architecture, and topological execution ordering make it ideal for complex applications that need clear separation of concerns and predictable initialization order.

Key strengths:
- Type-safe modular architecture
- Automatic dependency resolution
- Flexible loading mechanisms
- Extensible event system
- Comprehensive error handling
- Support for both ESM and CommonJS

For more examples and updates, visit the [GitHub repository](https://github.com/azerothian/sandwich).
