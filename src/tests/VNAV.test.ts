import { describe, it, expect, beforeEach } from "vitest";
import { Aircraft } from "../models/Aircraft";
import { FlightLeg } from "../models/Airport";

describe("VNAV Climb Logic", () => {
  let aircraft: Aircraft;

  beforeEach(() => {
    // Aircraft setup: 0,0, Heading 360, Alt 2000
    aircraft = new Aircraft("JAL123", 0, 0, 250, 360, 2000, "RJTT", "RJCC");
    aircraft.autopilot.verticalMode = "VNAV";
    aircraft.autopilot.lateralMode = "LNAV";
  });

  it("should climb to MCP if no constraints", () => {
    aircraft.autopilot.mcpAltitude = 10000;
    aircraft.autopilot.update(1);
    expect(aircraft.targetAltitude).toBe(10000);
  });

  it("should cap climb at restriction for AT or BELOW", () => {
    // Setup: MCP 10000. Constraint: At or Below 6000.
    aircraft.autopilot.mcpAltitude = 10000;

    // Create a leg with constraint
    const leg: FlightLeg = {
      type: "TF",
      waypoint: "WPT1",
      altConstraint: 6000,
      zConstraint: "BELOW",
    };

    // Inject active leg
    // Need a dummy waypoint to avoid crash in processLeg?
    // Autopilot.calculateVertical checks aircraft.activeLeg.
    // It doesn't need activeWaypoint for vertical calc logic essentially,
    // but processLeg might run first.
    // Let's set activeLeg directly.
    aircraft.activeLeg = leg;

    aircraft.autopilot.update(1);

    // Expect target to be 6000 (min(10000, 6000))
    expect(aircraft.targetAltitude).toBe(6000);
  });

  it("should climb to MCP if restriction is ABOVE", () => {
    // Setup: MCP 10000. Constraint: At or Above 6000.
    aircraft.autopilot.mcpAltitude = 10000;

    const leg: FlightLeg = {
      type: "TF",
      waypoint: "WPT1",
      altConstraint: 6000,
      zConstraint: "ABOVE",
    };
    aircraft.activeLeg = leg;

    aircraft.autopilot.update(1);

    // Expect target to be 10000 (MCP)
    expect(aircraft.targetAltitude).toBe(10000);
  });

  it("should respect lower MCP even with higher constraint (Safety)", () => {
    // Setup: MCP 5000. Constraint: At or Below 6000.
    aircraft.autopilot.mcpAltitude = 5000;

    const leg: FlightLeg = {
      type: "TF",
      waypoint: "WPT1",
      altConstraint: 6000,
      zConstraint: "BELOW",
    };
    aircraft.activeLeg = leg;

    aircraft.autopilot.update(1);

    // Expect target to be 5000 (min(5000, 6000))
    expect(aircraft.targetAltitude).toBe(5000);
  });

  it("should handle AT constraint as BELOW logic in climb", () => {
    // Setup: MCP 10000. Constraint: AT 6000.
    aircraft.autopilot.mcpAltitude = 10000;

    const leg: FlightLeg = {
      type: "TF",
      waypoint: "WPT1",
      altConstraint: 6000,
      zConstraint: "AT",
    };
    aircraft.activeLeg = leg;

    aircraft.autopilot.update(1);

    // Expect target to be 6000
    expect(aircraft.targetAltitude).toBe(6000);
  });
  it("should respect altitude constraint even if previous leg was unconstrained", () => {
    // Regression Test: User reported constraints being ignored.
    // Scenario: Cruise at 13000 -> WPT1 (No Limit) -> WPT2 (AT 8000).
    // MCP is set to 2000.
    // At WPT1, it should target 8000 (Step Down) because WPT2 has 8000.

    aircraft.altitude = 13000;
    aircraft.autopilot.mcpAltitude = 2000;

    // Active Leg: WPT1 (Unconstrained)
    const leg1: FlightLeg = { type: "TF", waypoint: "WPT1" };
    aircraft.activeLeg = leg1;

    // Next Leg: WPT2 (AT 8000)
    const leg2: FlightLeg = {
      type: "TF",
      waypoint: "WPT2",
      altConstraint: 8000,
      zConstraint: "AT",
    };
    aircraft.flightPlan = [leg2];

    aircraft.autopilot.update(1);

    // Should target 8000, NOT 2000 (MCP)
    expect(aircraft.targetAltitude).toBe(8000);
    expect(aircraft.autopilot.mcpAltitude).toBe(8000);
  });
});
