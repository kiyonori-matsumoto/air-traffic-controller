import { describe, it, expect } from "vitest";
import { Aircraft } from "../models/Aircraft";

describe("Physics Integration in Aircraft", () => {
  // Helper to create aircraft
  const createAC = (model: string = "B737") => {
    return new Aircraft("TEST01", model, 0, 0, 250, 0, 10000, "RJTT", "RJCC");
  };

  describe("Lateral Physics (Turn Dynamics)", () => {
    it("should roll to bank angle when heading change is commanded", () => {
      const ac = createAC();
      // Autopilot overrides targetHeading, so we must set MCP
      ac.autopilot.mcpHeading = 90;

      // Run one step
      ac.update(1.0); // 1 second

      // Should have positive bank angle
      expect(ac.bankAngle).toBeGreaterThan(0);
      expect(ac.bankAngle).toBeLessThanOrEqual(ac.maxBankAngle);
    });

    it("should turn heading based on bank angle", () => {
      const ac = createAC();
      ac.bankAngle = 20; // Force bank
      ac.speed = 250;
      const initialHeading = ac.heading;

      // We must ensure Autopilot doesn't fight us.
      // If we are testing PURE physics response to bank angle,
      // we should perhaps bypass autopilot or ensure target matches?
      // Actually, if we force bankAngle, the physics loop uses it.
      // But next frame, the physics loop will try to CORRECT bank angle
      // if targetHeading != heading.
      // So we should set targetHeading to something that REQUIRES a turn,
      // or manually set bankAngle AND ensure targetHeading supports it?

      // Simpler: Just rely on the previous test (Command -> Bank -> Turn).
      // But let's try to test the "Bank -> Turn" physics equation specifically.
      // If we set bankAngle = 20, the loop will try to change it towards targetBankAngle.
      // If mcpHeading = 0, targetBank = 0. So bankAngle will decrease.
      // DOES NOT MATTER for "turning heading". The heading change happens THIS frame based on CURRENT bank angle.

      ac.update(1.0);

      // Expect heading to change
      expect(ac.heading).toBeGreaterThan(initialHeading);

      const change = ac.heading - initialHeading;
      // omega ~ 1.5 deg/s
      expect(change).toBeGreaterThan(1.0);
      expect(change).toBeLessThan(2.0);
    });

    it("should turn slower at higher speed for same bank angle", () => {
      const acSlow = createAC();
      acSlow.speed = 200;
      acSlow.bankAngle = 20;
      acSlow.update(1.0);
      const diffSlow = acSlow.heading - 0;

      const acFast = createAC();
      acFast.speed = 400;
      acFast.bankAngle = 20;
      acFast.update(1.0);
      const diffFast = acFast.heading - 0;

      expect(diffFast).toBeLessThan(diffSlow);
    });
  });

  describe("Vertical Physics (Climb Performance)", () => {
    it("should calculate positive climb rate when commanded", () => {
      const ac = createAC();
      ac.autopilot.setAltitude(20000);
      ac.altitude = 10000;

      ac.update(1.0);

      expect(ac.climbRate).toBeGreaterThan(500);
      expect(ac.altitude).toBeGreaterThan(10000);
    });

    it("should climb slower at high altitude (Performance Model)", () => {
      const acLow = createAC();
      acLow.altitude = 5000;
      acLow.autopilot.setAltitude(15000);
      acLow.update(1.0);

      const acHigh = createAC();
      acHigh.altitude = 35000;
      acHigh.autopilot.setAltitude(40000);
      acHigh.update(1.0);

      // B737 at 35000ft climbs much slower than at 5000ft
      expect(acHigh.climbRate).toBeLessThan(acLow.climbRate);
    });

    it("should descend when target is lower", () => {
      const ac = createAC();
      ac.altitude = 20000;
      ac.autopilot.setAltitude(10000);

      ac.update(1.0);

      expect(ac.climbRate).toBeLessThan(0);
      expect(ac.altitude).toBeLessThan(20000);
    });
  });
});
