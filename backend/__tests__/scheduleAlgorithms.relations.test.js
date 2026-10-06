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

  fixture.networks.forEach(network => {
    it(`Chống giá trị giả cho mạng ${network.id}`, () => {
      const { calculatedBy, calculatedDate, verifiedBy, verifiedDate } = network;
      const nameRegex = /^(tên người|\[|\.\.\.|null|todo|xxx)/i;
      
      if (calculatedBy !== null) {
        expect(typeof calculatedBy).toBe("string");
        expect(calculatedBy.length).toBeGreaterThanOrEqual(2);
        expect(calculatedBy).not.toMatch(nameRegex);
      }
      
      if (verifiedBy !== null) {
        expect(typeof verifiedBy).toBe("string");
        expect(verifiedBy.length).toBeGreaterThanOrEqual(2);
        expect(verifiedBy).not.toMatch(nameRegex);
        expect(verifiedBy).not.toBe(calculatedBy);
        expect(verifiedDate).not.toBeNull();
      }
      
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const todayStr = `${yyyy}-${mm}-${dd}`;

      if (calculatedDate !== null) {
        expect(calculatedDate).toMatch(dateRegex);
        expect(isNaN(new Date(calculatedDate).getTime())).toBe(false);
        expect(calculatedDate <= todayStr).toBe(true);
      }
      
      if (verifiedDate !== null) {
        expect(verifiedDate).toMatch(dateRegex);
        expect(isNaN(new Date(verifiedDate).getTime())).toBe(false);
        expect(verifiedDate <= todayStr).toBe(true);
      }
      
      if (calculatedDate !== null && verifiedDate !== null) {
        expect(verifiedDate >= calculatedDate).toBe(true);
      }
    });
  });

  test.todo("T-23: điền calculatedBy/calculatedDate và verifiedBy/verifiedDate vào fixture.networks sau khi người thứ hai tính lại độc lập");
});
