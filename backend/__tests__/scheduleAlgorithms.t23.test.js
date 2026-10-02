const { forwardPass } = require("../utils/scheduleAlgorithms");

describe("T-23: Network 1 - FS, SS, FF, SF and negative lag", () => {
  test("should calculate the network correctly", () => {
    const tasks = [
      { id: "A", duration: 4 },
      { id: "B", duration: 3 },
      { id: "C", duration: 5 },
      { id: "D", duration: 2 },
      { id: "E", duration: 4 },
      { id: "F", duration: 3 },
      { id: "G", duration: 2 },
    ];

    const dependencies = [
      { from: "A", to: "B", type: "FS", lag: 0 },
      { from: "A", to: "C", type: "SS", lag: 1 },
      { from: "B", to: "D", type: "FF", lag: 0 },
      { from: "C", to: "D", type: "SF", lag: 6 },
      { from: "D", to: "E", type: "FS", lag: 0 },
      { from: "C", to: "F", type: "FS", lag: -1 },
      { from: "E", to: "G", type: "FS", lag: 0 },
      { from: "F", to: "G", type: "FS", lag: 0 },
    ];

    const topologicalOrder = ["A", "B", "C", "D", "E", "F", "G"];

    const results = forwardPass(tasks, dependencies, topologicalOrder, 0);

    expect(results["A"]).toEqual({ ES: 0, EF: 4 });
    expect(results["B"]).toEqual({ ES: 4, EF: 7 });
    expect(results["C"]).toEqual({ ES: 1, EF: 6 });
    expect(results["D"]).toEqual({ ES: 5, EF: 7 });
    expect(results["E"]).toEqual({ ES: 7, EF: 11 });
    expect(results["F"]).toEqual({ ES: 5, EF: 8 });
    expect(results["G"]).toEqual({ ES: 11, EF: 13 });
  });
});
describe("T-23: Network 2 - Parallel branches offset by 3 days", () => {
  test("should calculate parallel branches and merge correctly", () => {
    const tasks = [
      { id: "A", duration: 2 },
      { id: "B", duration: 6 },
      { id: "C", duration: 2 },
      { id: "D", duration: 4 },
      { id: "E", duration: 2 },
      { id: "F", duration: 1 },
    ];

    const dependencies = [
      { from: "A", to: "B", type: "FS", lag: 0 },
      { from: "A", to: "C", type: "FS", lag: 3 },
      { from: "B", to: "D", type: "FS", lag: 0 },
      { from: "C", to: "E", type: "FS", lag: 0 },
      { from: "D", to: "F", type: "FS", lag: 0 },
      { from: "E", to: "F", type: "FS", lag: 0 },
    ];

    const topologicalOrder = ["A", "B", "C", "D", "E", "F"];

    const results = forwardPass(tasks, dependencies, topologicalOrder, 0);

    expect(results["A"]).toEqual({ ES: 0, EF: 2 });
    expect(results["B"]).toEqual({ ES: 2, EF: 8 });
    expect(results["C"]).toEqual({ ES: 5, EF: 7 });
    expect(results["D"]).toEqual({ ES: 8, EF: 12 });
    expect(results["E"]).toEqual({ ES: 7, EF: 9 });
    expect(results["F"]).toEqual({ ES: 12, EF: 13 });
  });
});
