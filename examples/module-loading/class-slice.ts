import Loaf from "../../src/loaf";
import Slice from "../../src/slice";

// A class default export. Loaf instantiates it with `new ClassSlice()` and no
// arguments; use useLoaf() inside handlers instead of the constructor.
export default class ClassSlice extends Slice {
  constructor() {
    super();
    this.name = "class-slice";
  }

  [Loaf.Initialize] = async () => {
    console.log("  [class-slice] initialized (class instantiated by Loaf)");
  };
}
