# Sandwich Framework Examples

This directory contains practical examples demonstrating how to use the Sandwich framework.

## Examples Overview

### 1. Basic App (`basic-app/`)
**What it demonstrates:**
- Setting up a Loaf instance with Jam configuration
- Defining inline slices (logger and greeter)
- Dependencies between slices
- Core lifecycle events (Initialize, Ready)
- Simple execution flow

**Best for:** Getting started, understanding the basics

---

### 2. Custom Events (`custom-events/`)
**What it demonstrates:**
- Creating custom crumb events beyond the core lifecycle
- Multiple slices handling the same custom event
- Event-specific dependencies and execution order
- Using `execute()` to trigger custom events
- Returning and passing values through event chains

**Best for:** Building complex interactions between slices

---

### 3. Class-Based Slices (`class-based/`)
**What it demonstrates:**
- Extending the Slice base class
- Class-based slice definitions with instance methods
- Type-safe slice retrieval using generics
- Object-oriented approach to slice organization

**Best for:** Organizing complex slices with shared state and methods

---

### 4. Graceful Shutdown (`graceful-shutdown/`)
**What it demonstrates:**
- All lifecycle events (Load, Initialize, Ready, Shutdown)
- Signal handling (SIGTERM, SIGINT)
- Proper resource cleanup and shutdown procedures
- Error handling in lifecycle events

**Best for:** Production applications that need proper cleanup

---

### 5. Error Handling (`error-handling/`)
**What it demonstrates:**
- `UncaughtError` handlers running when a lifecycle handler throws
- `start()` rejecting with the original error
- Cleaning up with `shutdown()` after a failed start
- Wiring `UnhandledRejection` manually

**Best for:** Making startup failures observable and recoverable

---

### 6. Dependency Constraints (`dependency-constraints/`)
**What it demonstrates:**
- `oneOf` alternatives (ordered after every option that is loaded)
- `optional.before` / `optional.after` with present and absent modules
- `required.after` to run before another slice
- Event-scoped constraints
- Catching `AdjacencyError` from a circular dependency

**Best for:** Understanding exactly how execution order is resolved

---

### 7. Crumb Control (`crumb-control/`)
**What it demonstrates:**
- Enabling crumbs with `jam.crumbNames`, `slice.allow` and `allowCrumb()`
- Blocking crumbs with `restrictCrumb()`, `ignore` and `disallowCrumb()`
- Execution modes: `execute`, `ignoreReturn`, `all`, `condition` and `sync`

**Best for:** Building custom event pipelines

---

### 8. Module Loading (`module-loading/`)
**What it demonstrates:**
- Loading slices from relative and absolute file paths
- Class slices (instantiated with no constructor arguments)
- `buildSlice(loaf)` factories
- `clone: true` to isolate shared slice objects

**Best for:** Splitting an application into files and packages

---

### 9. Hooks and Chain Control (`hooks-and-chain-control/`)
**What it demonstrates:**
- Slice hooks (`jam.hooks`, `loaf.addHook()`/`removeHook()`) with `before`/`after` functions, targeted via `sliceNames` or applied to every slice
- Rewriting a handler's input (`before`) and its result (`after`)
- Chain control with `useChain()`: `cancel()`, `skip()` and `redirect()` to a slice, an event, or a slice within another event
- Errors annotated with the full path of slices that led to them (`error.slicePath`), including across a nested `execute()` call

**Best for:** Cross-cutting concerns (logging, discounts, guards) and altering an event chain's flow from inside a handler

---

## Running the Examples

Each example is self-contained in its own directory with an `index.ts` file.

Using `tsx` (recommended for TypeScript):
```bash
npx tsx examples/basic-app/index.ts
```

Or compile and run:
```bash
npx tsc examples/basic-app/index.ts
node examples/basic-app/index.js
```

## Core Concepts

### Loaf
The execution engine that orchestrates all slices and manages the event chain.

### Slice
A module that handles specific events (crumbs). Can be a plain object or a class extending `Slice`.

### Jam
The configuration object passed to Loaf, containing the list of slices and options.

### Crumbs (Events)
Functions that execute in response to events. Core events include:
- `Loaf.Load` - First phase, load dependencies
- `Loaf.Initialize` - Setup and initialization
- `Loaf.Ready` - Application is ready
- `Loaf.Shutdown` - Cleanup and shutdown

Custom events can be defined for your specific application needs.

### Dependencies
Control the execution order of slices:
- `dependencies: ["slice1"]` - Run after slice1 (for all events)
- `{ required: { before: ["slice1"] } }` - slice1 runs **before** this slice
- `{ required: { after: ["slice1"] } }` - slice1 runs **after** this slice
- `{ oneOf: ["a", "b"] }` - At least one must be loaded; runs after every one that is
- `{ optional: { before: [...], after: [...] } }` - Same, but ignored if the slice is absent
- Event-specific: `{ event: "custom:event", required: { before: ["slice1"] } }` - only changes that event's order

### Execution Context
Lifecycle handlers (`Loaf.Load`, `Loaf.Initialize`, `Loaf.Ready`, `Loaf.Shutdown`) take **no
arguments** and their return values are **ignored**. Call `useLoaf()` to get the current Loaf
and `useSlice()` to get the current slice from inside a handler (both throw if called outside
one); `this` is still bound to the slice. `Loaf.UncaughtError` handlers receive just `(error)`,
and `Loaf.UnhandledRejection` handlers receive just `(reason)`.

Custom crumbs keep the data waterfall: handlers are called as `(previousValue, ...extraArgs)`
with `this` bound to the slice - the slice is no longer appended as a trailing argument, so use
`useLoaf()`/`useSlice()` if you need them.

Inside a sequential chain (`execute()`, `condition()`, `sync()`) - including hooks that wrap
their handlers - call `useChain()` to `cancel()`, `skip()` or `redirect()` the running chain. It
throws outside those chains, e.g. inside `all()` or a `Load` handler. See example 9.

## Key Patterns

1. **Use useLoaf()/useSlice() instead of arguments** - get the loaf/slice from context rather than a handler parameter
2. **Use descriptive names** for custom events (e.g., "database:connect")
3. **Define event types** for better IDE autocomplete
4. **Handle errors** - `start()` rejects if Initialize or Ready throws; call `shutdown()` to clean up
5. **Clean up resources** in Shutdown event (runs in dependency order, not reversed)
6. **Pass classes, not instances** - Loaf constructs them with no arguments
