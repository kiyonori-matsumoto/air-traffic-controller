import { describe, it, expect, beforeEach } from "vitest";
import { Aircraft } from "../models/Aircraft";

describe("Departure Logic", () => {
  let aircraft: Aircraft;

  beforeEach(() => {
    // Initialize on ground
    aircraft = new Aircraft("JAL123", 0, 0, 0, 0, 0, "RJTT", "RJCC");
    // Speed 0, Alt 0
    // Autopilot initialized with mcpAltitude = 0
  });

  it("should climb to VA altitude constraint", () => {
    // 1. Setup Departure Plan (VA leg to 5000ft)
    aircraft.flightPlan = [
      { type: "VA", heading: 90, altConstraint: 5000 },
      { type: "TF", waypoint: "NEXT_WP" }, // Should proceed here after 5000ft
    ];

    // 2. Engage Modes
    aircraft.autopilot.lateralMode = "LNAV";
    // aircraft.autopilot.verticalMode = "VNAV"; // User might expect this to be auto, or default?
    // Let's assume user just cleared departure.

    // Simulate Takeoff (Pilot rotates, positive rate)
    aircraft.speed = 160;
    aircraft.altitude = 100; // Positive rate
    aircraft.climbRate = 20; // Initial climb

    // Pilot sets MCP to cruise (e.g. 30000)
    aircraft.autopilot.setAltitude(30000);

    // 3. Update
    // Call updateNavigation to process Flight Plan -> activeLeg
    aircraft.updateNavigation([]); // Empty waypoint list for mock
    aircraft.update(1);

    // 4. Assertions
    // Target Heading should be 90 (VA leg)
    expect(aircraft.targetHeading).toBe(90);

    // Target Altitude should be at least 5000?
    // Or it should be 30000 (MCP)?
    // The key is that it SHOULD CLIMB.
    expect(aircraft.targetAltitude).toBeGreaterThanOrEqual(5000);

    // Run for enough time to reach 5000ft
    // 5000ft / 20fps = 250s.
    // Let's force altitude to 5000 to check transition
    aircraft.altitude = 5000;

    // Call updateNavigation to trigger processLeg -> termination
    const mockWps = [{ name: "NEXT_WP", x: 10, y: 10 }];
    aircraft.updateNavigation(mockWps);

    // If terminated, activeLeg becomes null.
    // Call updateNavigation AGAIN to shift next leg?
    // In updateNavigation:
    // if (!this.activeLeg && this.flightPlan.length > 0) shift();
    // So if processLeg clears it, we need another pass to shift.
    aircraft.updateNavigation(mockWps);

    // Should have switched to next leg
    if (aircraft.activeLeg && "waypoint" in aircraft.activeLeg) {
      expect(aircraft.activeLeg.waypoint).toBe("NEXT_WP");
    } else {
      throw new Error("Did not advance to TF leg");
    }
  });

  it("should climb even if MCP altitude is not set (Auto-VNAV?)", () => {
    // User report suggests they might rely on VNAV to climb without setting MCP?
    // Or they set MCP but it ignores logic?
    // Let's test the case where MCP is left at 0 (pilot forgot).
    // Ideally VNAV should protect or warn, but technically if MCP=0, it shouldn't climb?
    // Actually for VA leg, it's a vector TO Altitude. It implies a climb command.

    aircraft.flightPlan = [{ type: "VA", heading: 90, altConstraint: 2000 }];
    aircraft.autopilot.lateralMode = "LNAV";
    aircraft.autopilot.verticalMode = "VNAV"; // Explicitly set VNAV

    aircraft.speed = 160;
    aircraft.altitude = 100;

    // MCP is 0 by default!

    aircraft.updateNavigation([]);
    aircraft.update(1);

    // If VNAV is active, it should target 2000 (constraint)
    expect(aircraft.targetAltitude).toBeGreaterThanOrEqual(2000);
  });

  it("should respect TF leg altitude constraints in VNAV", () => {
    // Descent Scenario
    aircraft.altitude = 20000;
    aircraft.flightPlan = [
      { type: "TF", waypoint: "DESCENT_WP" }, // Mocked Active Leg will hold constraint if we set correctly?
      // ActiveLeg is typically popped from plan.
      // The plan holds constraints.
    ];
    // But we need to define the constraint on the leg!
    aircraft.flightPlan = [
      {
        type: "TF",
        waypoint: "DESCENT_WP",
        altConstraint: 10000,
        zConstraint: "AT",
      },
    ];

    aircraft.autopilot.lateralMode = "LNAV";
    aircraft.autopilot.verticalMode = "VNAV";

    // Pilot sets MCP lower to allow descent
    aircraft.autopilot.setAltitude(5000);

    // Mock waypoint needed for LNAV processLeg but VNAV might not need it
    // Actually processLeg sets targetHeading
    // VNAV sets targetAltitude based on activeLeg.

    // We need to call updateNavigation to set activeLeg
    aircraft.updateNavigation([
      { name: "DESCENT_WP", x: 100, y: 100, z: 10000 },
    ]);
    aircraft.update(1);

    // VNAV should verify that 10000 is the constraint.
    expect(aircraft.targetAltitude).toBe(10000);
  });

  it("should respect 'AT' constraint during CLIMB", () => {
    // Scenario: Climbing to Cruise FL300, but Waypoint has 'AT 4000'
    aircraft.altitude = 3000;
    aircraft.autopilot.setAltitude(30000);
    aircraft.autopilot.lateralMode = "LNAV";
    aircraft.autopilot.verticalMode = "VNAV";

    // TF Leg with AT 4000
    const mockWps = [
      { name: "KAIHO", x: 100, y: 100, z: 4000, zConstraint: "AT" as "AT" },
    ];
    aircraft.flightPlan = [
      { type: "TF", waypoint: "KAIHO", altConstraint: 4000, zConstraint: "AT" },
    ];

    aircraft.updateNavigation(mockWps);
    aircraft.update(1);

    // Should be limited to 4000
    expect(aircraft.targetAltitude).toBe(4000);

    // If we are AT 4000, should stay 4000
    aircraft.altitude = 4000;
    aircraft.update(1);
    expect(aircraft.targetAltitude).toBe(4000);
  });

  it("should respect 'ABOVE' constraint during CLIMB", () => {
    // Scenario: Climbing to FL300, Waypoint 'ABOVE 4000'
    aircraft.altitude = 3000;
    aircraft.autopilot.setAltitude(30000);
    aircraft.autopilot.verticalMode = "VNAV";

    const mockWps = [
      {
        name: "KAIHO",
        x: 100,
        y: 100,
        z: 4000,
        zConstraint: "ABOVE" as "ABOVE",
      },
    ];
    aircraft.flightPlan = [
      {
        type: "TF",
        waypoint: "KAIHO",
        altConstraint: 4000,
        zConstraint: "ABOVE",
      },
    ];

    aircraft.updateNavigation(mockWps);
    aircraft.update(1);

    // Should NOT be limited to 4000. Should go to MCP (30000).
    expect(aircraft.targetAltitude).toBe(30000);
  });
});
