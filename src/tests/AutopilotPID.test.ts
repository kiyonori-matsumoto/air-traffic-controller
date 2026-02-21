import { describe, it, expect } from "vitest";
import { Aircraft } from "../models/Aircraft";

describe("Autopilot PID Control", () => {
  const createAC = () =>
    new Aircraft("PID01", "B737", 0, 0, 250, 0, 10000, "RJTT", "RJCC");

  it("should generate bank command when heading error exists", () => {
    const ac = createAC();
    ac.autopilot.setHeading(90); // Command Right Turn

    // Update Autopilot (via Aircraft update)
    ac.update(0.1); // Small step

    // Expect Command Bank > 0
    expect(ac.commandBank).toBeDefined();
    if (ac.commandBank) {
      expect(ac.commandBank).toBeGreaterThan(0);
      expect(ac.commandBank).toBeLessThanOrEqual(25); // Max bank
    }
  });

  it("should reduce bank command as error reduces", () => {
    const ac = createAC();
    ac.autopilot.setHeading(20);

    // Initial Step
    ac.update(0.1);
    const initialBank = ac.commandBank || 0;

    // Manually move heading closer
    ac.heading = 15; // Error reduced to 5 deg
    ac.update(0.1);
    const reducedBank = ac.commandBank || 0;

    // P-term should reduce bank
    expect(reducedBank).toBeLessThan(initialBank);
  });

  it("should converge to target heading", () => {
    const ac = createAC();
    ac.autopilot.setHeading(45);
    ac.autopilot.debug = false; // Reduce noise

    // Simulate 40 seconds
    for (let i = 0; i < 400; i++) {
      ac.update(0.1);
    }

    // Check after loop
    // Should be close to 45 (within 2 degrees)
    expect(ac.heading).toBeGreaterThan(43);
    expect(ac.heading).toBeLessThan(47);

    // Bank should be near 0
    expect(Math.abs(ac.bankAngle)).toBeLessThan(5);
  });
});
