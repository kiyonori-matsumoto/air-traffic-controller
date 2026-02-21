import { describe, it, expect } from "vitest";
import { Aircraft } from "../models/Aircraft";

describe("Vertical Profile and Speed Scheduling", () => {
  const createAC = (model: string = "B737") => {
    return new Aircraft("VTEST", model, 0, 0, 250, 0, 10000, "RJTT", "RJCC");
  };

  it("should shift target speed at high altitude (Mach Scheduling)", () => {
    const ac = createAC();
    ac.autopilot.speedMode = "FMS";

    // At 10,000 ft
    ac.altitude = 10000;
    ac.autopilot.update(1.0);
    const lowAltTarget = ac.targetSpeed;

    // At 35,000 ft
    ac.altitude = 35000;
    ac.autopilot.update(1.0);
    const highAltTarget = ac.targetSpeed;

    // At high alt, Mach 0.78 is approx 450-500 TAS, which is > 300 cruise speed
    expect(highAltTarget).toBeGreaterThan(lowAltTarget);
  });

  it("should follow VS commands from Autopilot", () => {
    const ac = createAC();
    ac.altitude = 10000;
    ac.autopilot.setAltitude(15000);

    ac.update(1.0);

    // vsPID should command a positive VS
    expect(ac.commandVs).toBeGreaterThan(0);
    expect(ac.climbRate).toBeGreaterThan(0);
    expect(ac.climbRate).toBeLessThanOrEqual(
      ac.performance.getMaxClimbRate(ac.speed, ac.altitude, ac.mass),
    );
  });

  it("should respect max climb rate performance limit", () => {
    const ac = createAC();
    ac.altitude = 35000;
    ac.autopilot.setAltitude(40000);
    ac.autopilot.verticalMode = "VNAV"; // Ensure we trigger high VS command

    // Force vsPID to high value
    ac.update(1.0);
    // FLCH mode/Large error commands 6000 FPM
    expect(ac.commandVs).toBe(6000);

    // But actual climbRate should be limited by performance at 35k ft
    const maxRC = ac.performance.getMaxClimbRate(
      ac.speed,
      ac.altitude,
      ac.mass,
    );
    expect(ac.climbRate).toBeCloseTo(maxRC, -1); // Relaxed tolerance (10 fpm)
    expect(ac.climbRate).toBeLessThan(3000); // 737 doesn't climb 6000 fpm at 35k
  });
});
