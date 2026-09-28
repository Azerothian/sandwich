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

### Handler Arguments
Handlers are called as `(previousValue, ...extraArgs, slice)` with `this` bound to the slice.
For lifecycle events the first handler receives the loaf; each later handler receives
whatever the previous one returned. `Load` is the exception - it gets `(loaf, slice)` and its
return value is ignored.

## Key Patterns

1. **Always return loaf** from lifecycle events - the next slice receives your return value
2. **Use descriptive names** for custom events (e.g., "database:connect")
3. **Define event types** for better IDE autocomplete
4. **Handle errors** - `start()` rejects if Initialize or Ready throws; call `shutdown()` to clean up
5. **Clean up resources** in Shutdown event (runs in dependency order, not reversed)
6. **Pass classes, not instances** - Loaf constructs them with no arguments
