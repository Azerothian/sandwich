import { describe, it, expect } from   "@jest/globals";
import { AdjacencyError, TopologicalGraph } from "../../src/utils/topo-graph";

describe("TopoGraph", () => {
  it("should be defined", () => {
    expect(TopologicalGraph).toBeDefined();
  });
  it("should be a class", () => {
    const graph = new TopologicalGraph();
    expect(graph).toBeInstanceOf(TopologicalGraph);
  });
  it("test basic sort", () => {
    const graph = new TopologicalGraph();

    graph.addVertex(1);
    graph.addVertex(2);
    graph.addVertex(3);
    graph.addVertex(4);

    graph.addEdge(1, 2);
    graph.addEdge(1, 3);
    graph.addEdge(2, 4);
    graph.addEdge(3, 4);
    const result = graph.topologicalSort();
    expect(result).toEqual([1, 2, 3, 4]);
  });
  it("test sort - complex", () => {
    const graph = new TopologicalGraph();

    graph.addVertex(1);
    graph.addVertex(2);
    graph.addVertex(3);
    graph.addVertex(4);
    graph.addVertex(5);

    graph.addEdge(4, 3);
    graph.addEdge(3, 2);
    graph.addEdge(4, 2);
    graph.addEdge(3, 5);
    const result = graph.topologicalSort();
    expect(result).toEqual([1, 4, 3, 2, 5]);
  });
  it("test sort - complex v2", () => {

    const graph = new TopologicalGraph();

    graph.addVertex(1);
    graph.addVertex(2);
    graph.addVertex(3);
    graph.addVertex(4);
    graph.addVertex(5);

    graph.addEdge(3, 2); // before
    graph.addEdge(3, 5); // before
    graph.addEdge(1, 3); // after

    // graph.addEdge(4, 1); // before
    graph.addEdge(5, 4); // after

    const result = graph.topologicalSort();
    expect(result).toEqual([1, 3, 2, 5, 4]);
    // [ 13542]

    // [5 2 3 1 4]

  });
});
describe("TopoGraph - positive", () => {
  it("empty graph sorts to an empty array", () => {
    const graph = new TopologicalGraph();
    expect(graph.topologicalSort()).toEqual([]);
  });
  it("vertices without edges keep insertion order", () => {
    const graph = new TopologicalGraph();
    graph.addVertex(3);
    graph.addVertex(1);
    graph.addVertex(2);
    expect(graph.topologicalSort()).toEqual([3, 1, 2]);
  });
  it("addVertex is idempotent and keeps existing edges", () => {
    const graph = new TopologicalGraph();
    graph.addVertex(1);
    graph.addVertex(2);
    graph.addEdge(2, 1);
    graph.addVertex(2);
    expect(graph.topologicalSort()).toEqual([2, 1]);
  });
  it("duplicate edges do not break the sort", () => {
    const graph = new TopologicalGraph();
    graph.addVertex(1);
    graph.addVertex(2);
    graph.addEdge(2, 1);
    graph.addEdge(2, 1);
    expect(graph.topologicalSort()).toEqual([2, 1]);
  });
  it("sorts disconnected components", () => {
    const graph = new TopologicalGraph();
    [1, 2, 3, 4].forEach((v) => graph.addVertex(v));
    graph.addEdge(2, 1);
    graph.addEdge(4, 3);
    const result = graph.topologicalSort();
    expect(result).toHaveLength(4);
    expect(result.indexOf(2)).toBeLessThan(result.indexOf(1));
    expect(result.indexOf(4)).toBeLessThan(result.indexOf(3));
  });
});

describe("TopoGraph - negative", () => {
  it("addEdge from an unknown vertex throws", () => {
    const graph = new TopologicalGraph();
    graph.addVertex(1);
    expect(() => graph.addEdge(2, 1)).toThrow("Vertex 2 does not exist in the graph.");
  });
  it("a two node cycle throws AdjacencyError with details", () => {
    const graph = new TopologicalGraph();
    [1, 2, 3].forEach((v) => graph.addVertex(v));
    graph.addEdge(3, 1);
    graph.addEdge(1, 2);
    graph.addEdge(2, 1);
    let error: AdjacencyError | undefined;
    try {
      graph.topologicalSort();
    } catch (e: any) {
      error = e;
    }
    expect(error).toBeInstanceOf(AdjacencyError);
    expect(error!.name).toBe("AdjacencyError");
    expect(error!.message).toBe("Graph has a cycle. Topological sorting is not possible.");
    expect(error!.result).toEqual([3]);
    expect(error!.missingVertices).toEqual([1, 2]);
    expect(error!.adjacencyList.get(1)).toEqual([2]);
  });
  it("a self loop throws AdjacencyError", () => {
    const graph = new TopologicalGraph();
    graph.addVertex(1);
    graph.addEdge(1, 1);
    expect(() => graph.topologicalSort()).toThrow(AdjacencyError);
  });
  it("a longer cycle throws AdjacencyError", () => {
    const graph = new TopologicalGraph();
    [1, 2, 3].forEach((v) => graph.addVertex(v));
    graph.addEdge(1, 2);
    graph.addEdge(2, 3);
    graph.addEdge(3, 1);
    expect(() => graph.topologicalSort()).toThrow(AdjacencyError);
  });
});
