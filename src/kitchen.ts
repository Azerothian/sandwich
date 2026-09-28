import path from "path";
import { DependencyInfo, ISlice, Jam, Logger, Slices, Toast, oneOf } from "./types/loaf";
import waterfall from "./utils/waterfall";
import Loaf from "./loaf";
import { createLogger } from "./utils/logger";
import { v4 } from "uuid";
import { AdjacencyError, TopologicalGraph } from "./utils/topo-graph";
import { runInContext } from "./context";

const logger = createLogger("kitchen");
export async function buildToast(sliceData: any, loaf: Loaf, cwd: string, currentIdx: number, clone = false) : Promise<Toast> {
  let mod: any;
  if (typeof sliceData === 'string') {
    let m = sliceData;
    if (sliceData[0] === '.') {
      m = path.resolve(cwd || process.cwd(), sliceData);
    }
    const { ...imod } = await import(m);
    if(imod.default) {
      mod = imod.default;
    } else {
      mod = imod;
    }
  } else {
    mod = sliceData;
  }
  if (!mod) {
    throw new Error(`Could not load module ${sliceData} at index ${currentIdx} in slices array`);
  }
  let newMod: Toast;
  if (mod.prototype) {
    newMod = new mod();
  } else if (mod.buildSlice) {
    newMod = runInContext({ loaf, path: [] }, () => mod.buildSlice(loaf));
  } else {
    if (clone) {
      newMod = Object.assign({}, mod);
    } else {
      newMod = mod;
    }
  }
  loaf.logger.debug("importAndCreateToast - loaded",  newMod);
  newMod.id = newMod.name || v4();
  
  newMod.dependencyInfos = getDependencyInfos(newMod);
  loaf.logger.debug("importAndCreateToast - dependencyInfo ", newMod.dependencyInfos);
  // newMod.crumbNames = Object.keys(newMod).filter((key) => 
  //   (loaf.allowCrumbNames.includes(key) || newMod.allow?.includes(key)) && !newMod.ignore?.includes(key)
  // );
  return newMod;
}


export async function importAndCreateToast(jam: Jam, loaf: Loaf) {
  return waterfall<any>(
    jam.slices,
    async (sliceData, o, currentIdx) => {
      const newMod = await buildToast(sliceData, loaf, jam.cwd, currentIdx, jam.clone);
      o[newMod.id] = newMod;
      return o;
    },
    {} as Slices
  );
}

export function testForRequired(moduleNames: string[], arr: (string | oneOf)[]) {
  for (const j of arr) {
    if (typeof j === "string") {
      if (moduleNames.indexOf(j) === -1) {
        throw new Error(`Missing required dependency - ${j}`)
      }
    } else if((j as oneOf).oneOf) {
      const { oneOf } = j as oneOf;
      let result = false;
      for (const o of oneOf) {
        if (moduleNames.indexOf(o) !== -1) {
          result = true;
        }
      }
      if(!result) {
        throw new Error(`Missing at least one of the required dependencies - ${oneOf.join(', ')}`)
      }
    }
  }
  return true;
}



export function sortArrayByDependencyInfo(moduleNames: string[], dependencyInfos: DependencyInfo[], eventName?: string) {
  logger.debug("sortArrayByDependencyInfo", moduleNames, dependencyInfos, eventName);
  const depInfos = dependencyInfos.map((d) => {
    return {
      ...d,
      requiredBefore: Array.isArray(d.required) ? d.required : d.required?.before || [],
      requiredAfter: Array.isArray(d.required) ? [] : d.required?.after || [],
      optionalBefore: Array.isArray(d.optional) ? d.optional : d.optional?.before || [],
      optionalAfter: Array.isArray(d.optional) ? [] : d.optional?.after || [],
    };
  });
  for (let i of depInfos) {
    if (i.requiredBefore.length > 0) {
      testForRequired(moduleNames, i.requiredBefore);
    }
    if (i.requiredAfter.length > 0) {
      testForRequired(moduleNames, i.requiredAfter);
    }
  }
  const newModuleNames = [...moduleNames];
  const filtered = depInfos.filter((d) => {
    if(d.event && eventName) {
      return d.event === eventName;
    } else if (d.event) {
      return false;
    }
    return true;
  });

  const g = new TopologicalGraph();

  for (const mname of moduleNames) {
    g.addVertex(newModuleNames.indexOf(mname));
  }
  for (const depInfo of filtered) {
    const before = resolveNames([...depInfo.requiredBefore, ...depInfo.optionalBefore], moduleNames);
    const after = resolveNames([...depInfo.requiredAfter, ...depInfo.optionalAfter], moduleNames);
    const currentIdx = newModuleNames.indexOf(depInfo.moduleName);
    if (before.length > 0) {
      before.forEach((e) => {
        const beforeIdx = newModuleNames.indexOf(e);
        logger.debug(` before - ${newModuleNames[beforeIdx]} -> ${newModuleNames[currentIdx]}`)
        g.addEdge(beforeIdx, currentIdx);
      });
    }
    if (after.length > 0) {
      after.forEach((e) => {
        const afterIdx = newModuleNames.indexOf(e);
        logger.debug(` after - ${newModuleNames[currentIdx]} -> ${newModuleNames[afterIdx]}`)
        g.addEdge(currentIdx, afterIdx);
      });
    }
  }
  let sortedIndexes: number[];
  try {
    sortedIndexes = g.topologicalSort();
  } catch(e: any) {
    if (e instanceof AdjacencyError) {
      console.error(e.message);
      console.error("Result Map: ")
      console.error(JSON.stringify(e.result.map((i) => newModuleNames[i]), null, 2));
      console.error("Adjacency List: ")
      const convertedList = convertAdjacencyListToNamed(e.adjacencyList, newModuleNames);
      console.error(JSON.stringify(Array.from(convertedList.entries()), null, 2));
      console.error("Missing Modules: ")
      console.error(JSON.stringify(e.missingVertices.map((i) => newModuleNames[i]), null, 2));

    }
    throw e;
  }
  const sortedModules = sortedIndexes.map((i) => newModuleNames[i]);
  // console.log("Topological Sorting Order:", sortedModules);

  return sortedModules

}
// expands oneOf entries to the options that are present and drops missing modules
function resolveNames(entries: (string | oneOf)[], moduleNames: string[]): string[] {
  const names: string[] = [];
  for (const e of entries) {
    const options = typeof e === "string" ? [e] : e.oneOf;
    for (const o of options) {
      if (moduleNames.indexOf(o) !== -1 && names.indexOf(o) === -1) {
        names.push(o);
      }
    }
  }
  return names;
}
function convertAdjacencyListToNamed(adjacencyList: Map<number, number[]>, moduleNames: string[]) : Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const [vertex, neighbors] of adjacencyList) {
    result.set(moduleNames[vertex], neighbors.map((n) => moduleNames[n]));
  }
  return result;

}

export function getDependencyInfos(slice: Toast) : DependencyInfo[] {
  const dependencyInfo = slice.dependencies;
  if (Array.isArray(dependencyInfo)) {
    const strDeps = [];
    return dependencyInfo.map((d) => {
      if (typeof d === "string" || (d as oneOf).oneOf) {
        strDeps.push(d);
        return undefined;
      }
      const r =  d as DependencyInfo;
      r.moduleName = r.moduleName || slice.id;
      return r;
    }).filter((f) => f)// f !== undefined)
      .concat([{
        moduleName: slice.id,
        required: {
          before: [...strDeps]
        },
      }]);

    // return {
    //   required: {
    //     before: [...dependencyInfo]
    //   },
    // };
  } else {
    return dependencyInfo;
  }
}

