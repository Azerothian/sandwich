import Loaf from "../../src/loaf";
import { ISlice } from "../../src/types/loaf";

// A plain object default export
const objectSlice: ISlice & { visits: number } = {
  name: "object-slice",
  visits: 0,
  [Loaf.Initialize]: async (loaf: Loaf) => {
    console.log("  [object-slice] initialized (loaded from a file path)");
    return loaf;
  },
};

export default objectSlice;
