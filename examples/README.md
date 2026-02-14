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
Control the execution order of slices for specific events:
- `dependencies: ["slice1"]` - Run after slice1 (for all events)
- Event-specific: `{ event: "custom:event", required: { after: ["slice1"] } }`

## Key Patterns

1. **Always return loaf** from lifecycle events
2. **Use descriptive names** for custom events (e.g., "database:connect")
3. **Define event types** for better IDE autocomplete
4. **Handle errors** in Initialize and Ready events
5. **Clean up resources** in Shutdown event
