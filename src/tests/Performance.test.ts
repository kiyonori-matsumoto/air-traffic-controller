import { describe, it, expect } from "vitest";
import { AircraftPerformance } from "../models/AircraftPerformance";

describe("AircraftPerformance", () => {
  it("should load B737 data by default", () => {
    const perf = new AircraftPerformance("B737");
    const data = perf.getData();
    expect(data.id).toBe("B737-800");
    expect(data.weights.mtow).toBeGreaterThan(70000);
  });

  it("should load B777 data correctly", () => {
    const perf = new AircraftPerformance("B777");
    const data = perf.getData();
    expect(data.id).toBe("B777-300ER");
    expect(data.weights.mtow).toBeGreaterThan(300000);
  });

  describe("Physics Calculations (B737)", () => {
    const perf = new AircraftPerformance("B737");
    const mass = 60000; // 60t (mid weight)

    it("should calculate reasonable drag at sea level", () => {
      const drag = perf.getDrag(250, 0, mass);
      // Expect drag around 20-30kN?
      // L ~ W = 60000 * 9.8 = 588kN.
      // L/D for airliner ~ 15-18. Drag ~ 30-40kN.
      expect(drag).toBeGreaterThan(10000);
      expect(drag).toBeLessThan(100000);
    });

    it("should calculate max thrust decrease with altitude", () => {
      const t0 = perf.getMaxThrust(0, 250);
      const t300 = perf.getMaxThrust(30000, 250);

      expect(t300).toBeLessThan(t0);
      expect(t300).toBeGreaterThan(t0 * 0.2); // ~30-40% at cruise
    });

    it("should give positive climb rate at sea level", () => {
      const rc = perf.getMaxClimbRate(250, 0, mass);
      // B737 at 250kt SL can climb > 3000fpm
      expect(rc).toBeGreaterThan(3000);
    });

    it("should give lower climb rate at max altitude", () => {
      const rcSea = perf.getMaxClimbRate(250, 0, mass);
      const rcCeiling = perf.getMaxClimbRate(250, 41000, mass);

      expect(rcCeiling).toBeLessThan(rcSea);
      // Near ceiling, excess power is low, verify it's small but maybe positive or near zero
      // if mass is high, might be negative if above ceiling
    });
  });

  describe("Physics Calculations (B777)", () => {
    const perf = new AircraftPerformance("B777");
    const mass = 250000; // 250t

    it("should have higher drag than B737", () => {
      const b737 = new AircraftPerformance("B737");
      const d737 = b737.getDrag(250, 10000, 60000);
      const d777 = perf.getDrag(250, 10000, mass);

      expect(d777).toBeGreaterThan(d737);
    });
  });
});
