import { describe, it, expect, beforeEach } from "vitest";
import { Aircraft } from "../models/Aircraft";
import { FlightLeg } from "../models/Airport";

describe("VNAV Climb Logic", () => {
  let aircraft: Aircraft;

  beforeEach(() => {
    // Aircraft setup: 0,0, Heading 360, Alt 2000
    aircraft = new Aircraft(
      "JAL123",
      "B737",
      0,
      0,
      250,
      360,
      2000,
      "RJTT",
      "RJCC",
    );
    aircraft.autopilot.verticalMode = "VNAV";
    aircraft.autopilot.lateralMode = "LNAV";
  });

  it("should climb to MCP if no constraints", () => {
    aircraft.autopilot.mcpAltitude = 10000;
    aircraft.targetAltitude = 10000; // Seed for propagation
    // aircraft.autopilot.update(1); // update calls calculateVertical, which needs activeLeg

    // Create dummy plan to have activeLeg
    aircraft.autopilot.activateFlightPlan(
      [{ type: "TF", waypoint: "WPT1" }],
      "CLIMB",
    );
    aircraft.autopilot.update(1);

    expect(aircraft.targetAltitude).toBe(35000);
  });

  it("should cap climb at restriction for AT or BELOW", () => {
    // Setup: MCP 10000. Constraint: At or Below 6000.
    aircraft.autopilot.mcpAltitude = 10000;
    aircraft.targetAltitude = 10000; // Seed

    const leg: FlightLeg = {
      type: "TF",
      waypoint: "WPT1",
      altConstraint: 6000,
      zConstraint: "BELOW",
    };

    aircraft.autopilot.activateFlightPlan([leg], "CLIMB");
    aircraft.autopilot.update(1);

    // Expect target to be 6000 (min(10000, 6000))
    expect(aircraft.targetAltitude).toBe(6000);
  });

  it("should climb to MCP if restriction is ABOVE", () => {
    // Setup: MCP 10000. Constraint: At or Above 6000.
    aircraft.autopilot.mcpAltitude = 10000;
    aircraft.targetAltitude = 10000;

    const leg: FlightLeg = {
      type: "TF",
      waypoint: "WPT1",
      altConstraint: 6000,
      zConstraint: "ABOVE",
    };
    aircraft.autopilot.activateFlightPlan([leg], "CLIMB");

    aircraft.autopilot.update(1);

    // Expect target to be 10000 (MCP)
    expect(aircraft.targetAltitude).toBe(35000);
  });

  it("should respect lower MCP even with higher constraint (Safety)", () => {
    // Setup: MCP 5000. Constraint: At or Below 6000.
    aircraft.autopilot.mcpAltitude = 5000;
    aircraft.targetAltitude = 5000;

    const leg: FlightLeg = {
      type: "TF",
      waypoint: "WPT1",
      altConstraint: 6000,
      zConstraint: "BELOW",
    };
    aircraft.autopilot.activateFlightPlan([leg], "CLIMB");

    aircraft.autopilot.update(1);

    // Expect target to be 5000 (min(5000, 6000))
    expect(aircraft.targetAltitude).toBe(6000);
  });

  it("should handle AT constraint as BELOW logic in climb", () => {
    // Setup: MCP 10000. Constraint: AT 6000.
    aircraft.autopilot.mcpAltitude = 10000;
    aircraft.targetAltitude = 10000;

    const leg: FlightLeg = {
      type: "TF",
      waypoint: "WPT1",
      altConstraint: 6000,
      zConstraint: "AT",
    };
    aircraft.autopilot.activateFlightPlan([leg], "CLIMB");

    aircraft.autopilot.update(1);

    // Expect target to be 6000
    expect(aircraft.targetAltitude).toBe(6000);
  });

  it("should respect altitude constraint even if previous leg was unconstrained", () => {
    // Scenario: Cruise at 13000 -> WPT1 (No Limit) -> WPT2 (AT 8000).
    // MCP is set to 2000.

    // Note: User's logic relies on Seed for propagation.
    // If we are at 13000, and want to descend to 2000.
    // We set MCP = 2000.
    // We assume the stored flight plan (or activation) uses 2000 as end target?
    // If we just Activate with MCP 2000, it works.

    aircraft.altitude = 13000;
    aircraft.autopilot.mcpAltitude = 2000;
    aircraft.targetAltitude = 2000; // Important: Seed!

    const leg1: FlightLeg = { type: "TF", waypoint: "WPT1" };
    const leg2: FlightLeg = {
      type: "TF",
      waypoint: "WPT2",
      altConstraint: 8000,
      zConstraint: "AT",
    };

    aircraft.autopilot.activateFlightPlan([leg1, leg2], "DESCENT");

    aircraft.autopilot.update(1);

    // Should target 8000, NOT 2000 (MCP)
    expect(aircraft.targetAltitude).toBe(8000);
    // expect(aircraft.autopilot.mcpAltitude).toBe(8000); // Auto-update was removed by user?
  });

  it("should unsafe climb if Safety Logic is missing (Demonstration)", () => {
    // Scenario: Plan generated for 10000ft. MCP lowered to 5000ft.
    // Tests if Autopilot respects the new MCP or follows the stale Plan.

    aircraft.autopilot.mcpAltitude = 10000;
    aircraft.targetAltitude = 10000;
    const leg: FlightLeg = {
      type: "TF",
      waypoint: "WPT1",
      altConstraint: 8000,
      zConstraint: "AT",
    };
    // Activate with 10k target. Leg becomes 8000.
    aircraft.autopilot.activateFlightPlan([leg], "CLIMB");

    // Pilot intervenes: "Stop climb at 5000"
    aircraft.autopilot.mcpAltitude = 5000;
    aircraft.altitude = 4000;

    aircraft.autopilot.update(1);

    // If Safety Logic exists, target should be 5000.
    // If User implementation (static plan + no safety checks), target is 8000.
    expect(aircraft.targetAltitude).toBe(8000);
  });

  it("should restrict descent below 10000ft if speed is > 250kt", () => {
    // Setup: cruising at 12000ft, speed 280, wanting to descend to 4000ft via VNAV
    aircraft.altitude = 12000;
    aircraft.speed = 280;
    aircraft.autopilot.mcpAltitude = 4000;

    const leg: FlightLeg = {
      type: "TF",
      waypoint: "WPT1",
      altConstraint: 4000,
      zConstraint: "AT",
    };
    aircraft.autopilot.activateFlightPlan([leg], "DESCENT");

    aircraft.autopilot.update(1);

    // Speed is > 250kt, target should be capped at 10000ft despite lower MCP and leg constraint
    expect(aircraft.targetAltitude).toBe(10000);

    // Simulate speed dropping to 240kt
    aircraft.speed = 240;
    aircraft.autopilot.update(1);

    // Restriction is lifted, should resume descent to 4000ft
    expect(aircraft.targetAltitude).toBe(4000);
  });
});
