const { calculateSchedule } = require("../utils/scheduleAlgorithms");
const fixture = require("./fixtures/k01-expected.json");

describe("T-23: Tiến độ được kiểm bằng bộ ca có đáp án tính tay", () => {
  const t23Networks = fixture.networks.filter(n => n.kind === "t23");

  t23Networks.forEach(network => {
    describe(`Mạng: ${network.name}`, () => {
      let result;
      beforeAll(() => {
        result = calculateSchedule(
          network.tasks,
          network.dependencies,
          network.topologicalOrder,
          network.projectStart
        );
      });

      const testCases = network.expected.map(expectedTask => [
        network.name,
        expectedTask.id,
        expectedTask.ES,
        expectedTask.EF,
        expectedTask.LS,
        expectedTask.LF,
        expectedTask.float,
        expectedTask.critical
      ]);

      test.each(testCases)(
        "T-23 [%s] việc %s: ES=%i EF=%i LS=%i LF=%i độ trễ=%i găng=%s",
        (name, id, ES, EF, LS, LF, float, critical) => {
          expect(result[id].ES).toBe(ES);
          expect(result[id].EF).toBe(EF);
          expect(result[id].LS).toBe(LS);
          expect(result[id].LF).toBe(LF);
          expect(result[id].float).toBe(float);
          expect(result[id].critical).toBe(critical);
        }
      );

      it("đường găng khớp criticalPath trong fixture", () => {
        const computedCriticalPath = network.topologicalOrder.filter(
          id => result[id].critical
        );
        expect(computedCriticalPath).toEqual(network.criticalPath);
      });
    });
  });

  describe("Các ca riêng", () => {
    it("T-23 nhánh song song: độ trễ của nhánh ngắn (C và E) bằng 3 = 12 - 9 tính tay", () => {
      const network = t23Networks.find(n => n.id === "T23-N2");
      const result = calculateSchedule(
        network.tasks,
        network.dependencies,
        network.topologicalOrder,
        network.projectStart
      );
      expect(result.C.float).toBe(3);
      expect(result.E.float).toBe(3);
      expect(result.A.float).toBe(0);
      expect(result.B.float).toBe(0);
      expect(result.D.float).toBe(0);
      expect(result.F.float).toBe(0);
    });

    it("T-23 đủ bốn loại quan hệ: việc F là việc duy nhất có độ trễ, bằng 3", () => {
      const network = t23Networks.find(n => n.id === "T23-N1");
      const result = calculateSchedule(
        network.tasks,
        network.dependencies,
        network.topologicalOrder,
        network.projectStart
      );
      expect(result.F.float).toBe(3);
      expect(result.A.float).toBe(0);
      expect(result.B.float).toBe(0);
      expect(result.C.float).toBe(0);
      expect(result.D.float).toBe(0);
      expect(result.E.float).toBe(0);
      expect(result.G.float).toBe(0);
      
      const types = new Set(network.dependencies.map(d => d.type));
      expect(types).toEqual(new Set(["FS", "SS", "FF", "SF"]));
      const hasNegativeLag = network.dependencies.some(d => d.lag < 0);
      expect(hasNegativeLag).toBe(true);
    });
  });
});
