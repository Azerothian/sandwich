import { NewEvents } from "./module1";

export default {
  name: "module2",
  dependencies: [{
    event: NewEvents.RandomFunction,
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
