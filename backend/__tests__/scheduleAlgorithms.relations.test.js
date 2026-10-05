const { calculateSchedule } = require("../utils/scheduleAlgorithms");
const fixture = require("./fixtures/k01-expected.json");

describe("T-22: Từng loại quan hệ phụ thuộc", () => {
  const singleRelationNetworks = fixture.networks.filter(n => n.kind === "single-relation");

  singleRelationNetworks.forEach(network => {
    describe(`Ca: ${network.name}`, () => {
      let result;
      beforeAll(() => {
        result = calculateSchedule(
          network.tasks,
          network.dependencies,
          network.topologicalOrder,
          network.projectStart
        );
      });

      const rel = network.dependencies[0];
      const type = rel.type;
      const lag = rel.lag;

      const testCases = network.expected.map(expectedTask => [
        type,
        lag,
        expectedTask.id,
        expectedTask.ES,
        expectedTask.EF,
        expectedTask.LS,
        expectedTask.LF,
        expectedTask.float,
        expectedTask.critical
      ]);

      test.each(testCases)(
        "Quan hệ %s lag %i: %s ES=%i EF=%i LS=%i LF=%i",
        (type, lag, id, ES, EF, LS, LF, float, critical) => {
          expect(result[id].ES).toBe(ES);
          expect(result[id].EF).toBe(EF);
          expect(result[id].LS).toBe(LS);
          expect(result[id].LF).toBe(LF);
          expect(result[id].float).toBe(float);
          expect(result[id].critical).toBe(critical);
        }
      );
    });
  });
});

describe("Kiểm tra cấu trúc tệp dữ liệu fixture", () => {
  it("Mỗi mạng có đủ các khoá và đúng định dạng cơ bản", () => {
    expect(Array.isArray(fixture.networks)).toBe(true);
    
    fixture.networks.forEach(network => {
      const keys = Object.keys(network);
      expect(keys).toEqual(expect.arrayContaining([
        "id", "name", "kind", "calculatedBy", "calculatedDate",
        "verifiedBy", "verifiedDate", "tasks", "dependencies",
        "topologicalOrder", "expected", "projectFinish", "criticalPath"
      ]));

      expect(network.expected.length).toBe(network.tasks.length);

      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (network.calculatedDate !== null) {
        expect(network.calculatedDate).toMatch(dateRegex);
      }
      if (network.verifiedDate !== null) {
        expect(network.verifiedDate).toMatch(dateRegex);
      }

      if (network.verifiedBy !== null) {
        expect(network.verifiedBy).not.toBe(network.calculatedBy);
        expect(network.verifiedDate).not.toBeNull();
      }
    });
  });

  test.todo("T-23: điền calculatedBy/calculatedDate và verifiedBy/verifiedDate vào fixture.networks sau khi người thứ hai tính lại độc lập");
});
