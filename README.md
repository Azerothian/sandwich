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
import Loaf from "@azerothian/sandwich";
import { ISlice } from "@azerothian/sandwich";

const module1: ISlice = {
  name: "module1",
  [Loaf.Initialize]: async (loaf: Loaf) => {
    console.log("Initialize");
    return loaf;
  },
  [Loaf.Ready]: async (loaf: Loaf) => {
    console.log("Ready");
    return loaf;
  },
  [Loaf.Shutdown]: async (loaf: Loaf) => {
    console.log("Shutdown");
    return loaf;
  }
}
export default module1;
```

```typescript
// index.ts - Loader

import Loaf from "@azerothian/sandwich";

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
import Loaf from "@azerothian/sandwich";
import { ISlice } from "@azerothian/sandwich";

export enum NewEvents { 
  Initialize = "module1:initialize", // the text needs to be unique
  RandomFunction = "module1:random-func",
}
export type Module1Events = {
  readonly [NewEvents.Initialize]?: (loaf: Loaf) => Promise<void>;
  readonly [NewEvents.RandomFunction]?: (arg1: string, loaf: Loaf) => Promise<string>;
}
export interface IModule1 extends ISlice, Module1Events {

}

const module1: IModule1 = {
  name: "module1",
  [Loaf.Initialize]: async (loaf: Loaf) => {
    loaf.setOptions(NewEvents.Initialize, {
      ignoreReturn: true, // setting this means the that the first argument is ignored on return
    });
    await loaf.execute(NewEvents.Initialize, loaf);
    return loaf;
  },
  [NewEvents.Initialize]: async (loaf: Loaf) => {
    console.log("[module1](NewEvents.Initialize) - start");
    const result = await loaf.execute(NewEvents.RandomFunction, "start", loaf);
    console.log("[module1](NewEvents.Initialize) - execute(NewEvents.RandomFunction) - result", result);
  },
  [NewEvents.RandomFunction]: async (arg1: any, loaf: Loaf) => {
    console.log("  [module1](NewEvents.RandomFunction) - prevResult", arg1);
    return "module1";
  }
}
export default module1;

```

```typescript
// module2.ts
import Loaf from "@azerothian/sandwich";
import { NewEvents } from "./module1";

export default {
  name: "module2",
  dependencies: [{
    event: NewEvents.RandomFunction, // 
    required: {
      before: ["module1"]
    }
  }, "module3"],
  [NewEvents.Initialize]: async (loaf: Loaf) => {
    console.log("[module2](NewEvents.Initialize)");
  },
  [NewEvents.RandomFunction]: async (arg1: any, loaf: Loaf) => {
    console.log("  [module2](NewEvents.RandomFunction) - prevResult", arg1);
    return "module2";
  }

}
```

```typescript
// module3.ts
import Loaf from "@azerothian/sandwich";
import { NewEvents } from "./module1";

export default {
  name: "module3",
  [NewEvents.Initialize]: async (loaf: Loaf) => {
    console.log("[module3](NewEvents.Initialize)");
  },
  [NewEvents.RandomFunction]: async (arg1: any, loaf: Loaf) => {
    console.log("  [module3](NewEvents.RandomFunction) - prevResult", arg1);
    return "module3";
  }
}

```

```typescript

// index.ts - Loader
import Loaf from "@azerothian/sandwich";
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
[module2](NewEvents.Initialize)
[module1](NewEvents.Initialize) - start
  [module3](NewEvents.RandomFunction) - prevResult start
  [module1](NewEvents.RandomFunction) - prevResult module3
  [module2](NewEvents.RandomFunction) - prevResult module1
[module1](NewEvents.Initialize) - execute(NewEvents.RandomFunction) - result module2
```

## Terms

Loaf - the execution engine
Slice - a module
Jam - the config

## Links

- [Full Documentation](docs/specifications.md)
- [Examples Directory](examples/)
