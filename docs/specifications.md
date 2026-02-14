# Sandwich Framework Specifications

## Table of Contents

1. [Introduction](#introduction)
2. [Core Concepts](#core-concepts)
3. [Lifecycle Events](#lifecycle-events)
4. [Dependency System](#dependency-system)
5. [Public API Reference](#public-api-reference)
6. [Crumb System](#crumb-system)
7. [Chain Execution System](#chain-execution-system)
8. [Module Loading](#module-loading)
9. [Build Outputs](#build-outputs)

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
};
```

**Properties:**
- `name` - Identifier for the Loaf instance
- `slices` - Array of modules to load (file paths, objects, or classes)
- `logger` - Optional custom logger (defaults to debug-based logger)
- `allowInCompat` - Whether to allow incompatible dependencies
- `cwd` - Working directory for resolving relative paths
- `devMode` - Enables additional debugging output
- `clone` - Whether to clone module objects (prevents shared state)
- `crumbNames` - Additional custom crumb names to allow

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

### Event Descriptions

#### 1. Load (`loaf:load`)

**Purpose:** Executed during the Loaf loading phase, before topological sorting.

**Signature:**
```typescript
[LoafEvent.Load]?: (loaf: Loaf, slice: ISlice) => Promise<void>;
```

**Use Cases:**
- Register additional crumbs dynamically
- Perform early setup that other slices may depend on
- Configure crumb allowances

**Example:**
```typescript
const mySlice: ISlice = {
  name: "config-loader",
  [Loaf.Load]: async (loaf, slice) => {
    // Allow custom crumbs
    loaf.allowCrumb("custom:event");
  }
};
```

#### 2. Initialize (`loaf:init`)

**Purpose:** Main initialization phase, executed in topological order.

**Signature:**
```typescript
[LoafEvent.Initialize]?: (loaf: Loaf, slice: ISlice) => Promise<Loaf>;
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
  [Loaf.Initialize]: async (loaf, slice) => {
    await connectToDatabase();
    return loaf;
  }
};
```

#### 3. Ready (`loaf:rdy`)

**Purpose:** Application ready phase, executed after all initialization completes.

**Signature:**
```typescript
[LoafEvent.Ready]?: (loaf: Loaf, slice: ISlice) => Promise<Loaf>;
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
  [Loaf.Ready]: async (loaf, slice) => {
    await startServer();
    console.log("Server listening on port 3000");
    return loaf;
  }
};
```

#### 4. Shutdown (`loaf:signal:-1`)

**Purpose:** Graceful shutdown phase.

**Signature:**
```typescript
[LoafEvent.Shutdown]?: (loaf: Loaf, slice: ISlice) => Promise<Loaf>;
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
  [Loaf.Shutdown]: async (loaf, slice) => {
    await closeDatabase();
    return loaf;
  }
};
```

#### 5. UncaughtError (`loaf:error`)

**Purpose:** Handle uncaught errors during execution.

**Signature:**
```typescript
[LoafEvent.UncaughtError]?: (loaf: Loaf, error: Error, slice: ISlice) => Promise<Loaf>;
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
  [Loaf.UncaughtError]: async (loaf, error, slice) => {
    console.error("Uncaught error:", error);
    await logErrorToService(error);
    return loaf;
  }
};
```

#### 6. UnhandledRejection (`loaf:error:rejected-fly`)

**Purpose:** Handle unhandled promise rejections.

**Signature:**
```typescript
[LoafEvent.UnhandledRejection]?: (loaf: Loaf, error: Error, slice: ISlice) => Promise<Loaf>;
```

**Use Cases:**
- Similar to UncaughtError but specifically for promise rejections

### SliceEvents Type

All lifecycle events are encapsulated in the `SliceEvents` type:

```typescript
export type SliceEvents = {
  readonly [LoafEvent.Load]?: (loaf: Loaf, slice: ISlice) => Promise<void>;
  readonly [LoafEvent.Initialize]?: (loaf: Loaf, slice: ISlice) => Promise<Loaf>;
  readonly [LoafEvent.Ready]?: (loaf: Loaf, slice: ISlice) => Promise<Loaf>;
  readonly [LoafEvent.Shutdown]?: (loaf: Loaf, slice: ISlice) => Promise<Loaf>;
  readonly [LoafEvent.UncaughtError]?: (loaf: Loaf, error: Error) => Promise<Loaf>;
  readonly [LoafEvent.UnhandledRejection]?: (loaf: Loaf, error: Error) => Promise<Loaf>;
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

This means `cache` requires at least one of the three cache backends.

#### 3. DependencyInfo Objects

Advanced dependency constraints with fine-grained control.

```typescript
export type DependencyInfo = {
  moduleName?: string;
  event?: string;
  required?: {
    before?: string[];
    after?: string[];
    incompatible?: string[];
  } | string[];
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
- `required.before` - Modules that must execute before this one
- `required.after` - Modules that must execute after this one
- `required.incompatible` - Modules that cannot be present (throws error)
- `optional.before` - Modules that should execute before if present
- `optional.after` - Modules that should execute after if present
- `optional.incompatible` - Modules that will be filtered out if present

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

**Required Incompatible:** Throws an error if specified modules are present.

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

**Optional Incompatible:** Silently filters out the slice if specified modules are present.

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
        after: ["validator"]
      }
    }
  ]
};
```

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
2. Execute `Load` events
3. Extract dependency information
4. Perform topological sort
5. Build crumb execution chains

##### initialize()

```typescript
readonly initialize: () => Promise<void>
```

Executes the `Initialize` event chain. Sets up uncaught exception handlers.

##### ready()

```typescript
readonly ready: () => Promise<void>
```

Executes the `Ready` event chain. Application is fully initialized after this.

##### shutdown()

```typescript
readonly shutdown: () => Promise<void>
```

Executes the `Shutdown` event chain for graceful cleanup.

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

Retrieve a loaded slice by name with type casting.

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

Dynamically allow additional crumb names.

**Example:**
```typescript
loaf.allowCrumb("user:login", "user:logout");
```

##### disallowCrumb()

```typescript
readonly disallowCrumb: (...crumbNames: string[]) => void
```

Remove crumb names from the allow list.

##### restrictCrumb()

```typescript
readonly restrictCrumb: (...crumbNames: string[]) => void
```

Globally restrict crumbs from executing.

**Example:**
```typescript
// Prevent any slice from executing this crumb
loaf.restrictCrumb("admin:delete-all");
```

##### unrestrictCrumb()

```typescript
readonly unrestrictCrumb: (...crumbNames: string[]) => void
```

Remove crumbs from the restrict list.

### Slice Class

#### Constructor

```typescript
constructor(loaf: Loaf)
```

Base class for implementing Slices.

**Example:**
```typescript
export default class MySlice extends Slice {
  constructor(loaf: Loaf) {
    super(loaf);
    this.name = 'my-slice';
  }

  [Loaf.Initialize] = async (loaf: Loaf, slice: ISlice) => {
    // initialization logic
    return loaf;
  };
}
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
- `name` - Unique identifier for the slice
- `dependencies` - Dependency constraints
- `ignore` - Array of crumb names this slice should not execute
- `allow` - Array of additional crumb names this slice enables

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
[Loaf.Load]: async (loaf, slice) => {
  loaf.allowCrumb("custom:event");
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
  "user:login": async (loaf, data) => {
    // This slice handles user:login
  }
  // But it will never execute admin:delete or internal:debug
};
```

#### Global Restrictions

```typescript
// Restrict globally - no slice can execute this
loaf.restrictCrumb("dangerous:operation");

// Later, if needed
loaf.unrestrictCrumb("dangerous:operation");
```

#### Allowance Control

```typescript
// Only allowed crumbs can be registered
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
  [UserEvents.Login]: async (loaf, credentials) => {
    console.log("Auth: validating credentials");
    return { valid: true, token: "xyz" };
  }
};

// Slice 2: Logger
const loggerSlice: ISlice = {
  name: "logger",
  dependencies: [{
    event: UserEvents.Login,
    required: { after: ["auth"] }
  }],
  [UserEvents.Login]: async (loaf, authResult) => {
    console.log("Logger: user logged in", authResult);
    return authResult;
  }
};

// Slice 3: Analytics
const analyticsSlice: ISlice = {
  name: "analytics",
  dependencies: [{
    event: UserEvents.Login,
    required: { after: ["logger"] }
  }],
  [UserEvents.Login]: async (loaf, authResult) => {
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

Each function receives the return value of the previous function.

#### sync() - Synchronous Waterfall

```typescript
const result = loaf.sync("custom:event", startValue, ...args);
```

Synchronous version. Throws error if any function is async.

#### all() - Parallel

```typescript
const results = await loaf.all("custom:event", startValue, ...args);
```

Execute all functions in parallel, returns array of results.

#### condition() - Conditional Waterfall

```typescript
const result = await loaf.condition(
  "custom:event",
  async (result) => result.shouldStop,
  startValue,
  ...args
);
```

Executes until condition function returns true.

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

Executes functions in sequence (waterfall pattern). Each function receives the return value of the previous function.

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

Synchronous version of `execute()`. Throws error if any function returns a Promise.

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

Executes all functions in parallel using `Promise.all()`. Returns array of results.

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

Executes functions in sequence until the condition function returns true.

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
  [Loaf.Initialize]: async (loaf) => {
    // ...
    return loaf;
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
  constructor(loaf: Loaf) {
    super(loaf);
    this.name = "auth";
  }

  [Loaf.Initialize] = async (loaf, slice) => {
    // ...
    return loaf;
  };
}

const loaf = new Loaf({
  name: "app",
  slices: [AuthModule] // Pass the class, not an instance
});
```

**Note:** Classes are instantiated automatically with `new mod()`.

#### 5. buildSlice Factory Pattern

For more control over instantiation:

```typescript
// module.ts
export function buildSlice(loaf: Loaf): ISlice {
  return {
    name: "configured-module",
    customConfig: loaf.jam.customConfig,
    [Loaf.Initialize]: async (loaf, slice) => {
      // Use customConfig
      return loaf;
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
   - Add `id` (from `name` or generate UUID)
   - Extract `dependencyInfos`
   - Return Toast object

### ESM Import Path Resolution

For ESM modules using `import.meta.url`:

```typescript
import { URL } from 'url';
import Loaf from '@azerothian/sandwich';

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
const Loaf = require('@azerothian/sandwich').default;

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
  "version": "1.1.1",
  "type": "module",
  "main": "cjs/index.js",
  "module": "lib/index.js",
  "types": "lib/index.d.ts"
}
```

### Import Strategies

#### ESM (Modern)

```typescript
import Loaf from '@azerothian/sandwich';
import { ISlice, LoafEvent } from '@azerothian/sandwich/types/loaf';
```

**Resolution:**
- Uses `"module": "lib/index.js"` field
- Full ESM with native `import/export`

#### CommonJS (Legacy)

```javascript
const Loaf = require('@azerothian/sandwich').default;
const { LoafEvent } = require('@azerothian/sandwich/types/loaf');
```

**Resolution:**
- Uses `"main": "cjs/index.js"` field
- Transpiled to CommonJS with `module.exports`

#### TypeScript

```typescript
import Loaf from '@azerothian/sandwich';
import type { ISlice, Jam, Toast } from '@azerothian/sandwich/types/loaf';
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

**Current Version:** 1.1.1

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

Here's a comprehensive example demonstrating all major features:

```typescript
// types.ts
import { LoafEvent } from '@azerothian/sandwich/types/loaf';

export enum AppEvents {
  ProcessData = "app:process-data",
  SendNotification = "app:notify"
}

// logger.slice.ts
import Loaf from '@azerothian/sandwich';
import { ISlice } from '@azerothian/sandwich/types/loaf';

export const loggerSlice: ISlice = {
  name: "logger",
  [Loaf.Load]: async (loaf, slice) => {
    // Allow our custom events
    loaf.allowCrumb(AppEvents.ProcessData, AppEvents.SendNotification);
  },
  [Loaf.Initialize]: async (loaf, slice) => {
    console.log("[Logger] Initialized");
    return loaf;
  },
  [AppEvents.ProcessData]: async (loaf, data, slice) => {
    console.log("[Logger] Processing:", data);
    return data;
  }
};

// database.slice.ts
export const databaseSlice: ISlice = {
  name: "database",
  dependencies: ["logger"],
  [Loaf.Initialize]: async (loaf, slice) => {
    console.log("[Database] Connected");
    return loaf;
  },
  [Loaf.Shutdown]: async (loaf, slice) => {
    console.log("[Database] Disconnected");
    return loaf;
  }
};

// processor.slice.ts
export const processorSlice: ISlice = {
  name: "processor",
  dependencies: [
    "database",
    {
      event: AppEvents.ProcessData,
      required: {
        after: ["logger"]
      }
    }
  ],
  [Loaf.Ready]: async (loaf, slice) => {
    // Trigger data processing
    await loaf.execute(AppEvents.ProcessData, { id: 1, value: "test" });
    return loaf;
  },
  [AppEvents.ProcessData]: async (loaf, data, slice) => {
    console.log("[Processor] Handling:", data);
    // Modify data
    return { ...data, processed: true };
  }
};

// notifier.slice.ts
export const notifierSlice: ISlice = {
  name: "notifier",
  dependencies: [
    {
      event: AppEvents.ProcessData,
      required: {
        after: ["processor"]
      }
    }
  ],
  [AppEvents.ProcessData]: async (loaf, data, slice) => {
    console.log("[Notifier] Sending notification for:", data);
    await loaf.execute(AppEvents.SendNotification, data);
    return data;
  },
  [AppEvents.SendNotification]: async (loaf, data, slice) => {
    console.log("[Notifier] Email sent for:", data.id);
  }
};

// index.ts
import Loaf from '@azerothian/sandwich';
import { loggerSlice, databaseSlice, processorSlice, notifierSlice } from './slices';

const loaf = new Loaf({
  name: "data-processor-app",
  slices: [
    loggerSlice,
    databaseSlice,
    processorSlice,
    notifierSlice
  ],
  devMode: true,
  crumbNames: [AppEvents.ProcessData, AppEvents.SendNotification]
});

// Start the application
await loaf.start();

// Graceful shutdown
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
export async function loadPlugins(pluginDir: string): Promise<IPlugin[]> {
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
  [Loaf.Load]: async (loaf, slice) => {
    // Dynamically register endpoint handlers
    const endpoints = ["user:create", "user:update", "user:delete"];
    loaf.allowCrumb(...endpoints);
  },
  "user:create": async (loaf, data, slice) => {
    // Handle user creation
  }
};
```

### Middleware Pattern

```typescript
const middlewareSlice: ISlice = {
  name: "middleware",
  dependencies: [{
    event: "http:request",
    required: { before: ["router"] }
  }],
  "http:request": async (loaf, req, slice) => {
    // Add middleware functionality
    req.startTime = Date.now();
    return req;
  }
};

const routerSlice: ISlice = {
  name: "router",
  "http:request": async (loaf, req, slice) => {
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
