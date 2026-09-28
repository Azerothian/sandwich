import Loaf from "../../src/loaf";

// An object with a buildSlice(loaf) factory. Use this when the slice needs
// the loaf while it is being constructed.
export default {
  buildSlice: (loaf: Loaf) => ({
    name: "factory-slice",
    appName: loaf.jam.name,
    [Loaf.Initialize]: async (l: Loaf) => {
      console.log(`  [factory-slice] initialized (built for "${loaf.jam.name}")`);
      return l;
    },
  }),
};
