import Loaf from "../../loaf";
import { useLoaf } from "../../context";
import { ISlice } from "../../types/loaf";

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
