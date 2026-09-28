import Loaf from "../../loaf";
import { ISlice } from "../../types/loaf";

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
