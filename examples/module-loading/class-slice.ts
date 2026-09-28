import Loaf from "../../src/loaf";
import Slice from "../../src/slice";

// A class default export. Loaf instantiates it with `new ClassSlice()` and no
// arguments, so use the `loaf` handler argument instead of the constructor.
export default class ClassSlice extends Slice {
  constructor() {
    super(undefined as unknown as Loaf);
    this.name = "class-slice";
  }

  [Loaf.Initialize] = async <T extends Loaf>(loaf: T) => {
    console.log("  [class-slice] initialized (class instantiated by Loaf)");
    return loaf;
  };
}
