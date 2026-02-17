import { describe, it, expect, beforeEach } from "vitest";
import { CommandSystem } from "../managers/CommandSystem";
import { Aircraft } from "../models/Aircraft";
import { Airport } from "../models/Airport";

describe("CommandSystem", () => {
  let airport: Airport;
  let commandSystem: CommandSystem;
  let aircraft: Aircraft;

  beforeEach(() => {
    airport = new Airport("TEST");
    // Add a test waypoint
    airport.addWaypointLatLon("TEST_WP", 35, 140);
    commandSystem = new CommandSystem(airport);

    // Create a dummy aircraft
    aircraft = new Aircraft("JAL123", 0, 0, 250, 0, 10000, "RJTT", "RJCC");
    aircraft.ownership = "OWNED";
  });

  it("should clear flight plan when heading is assigned", () => {
    // 1. Assign a Flight Plan via DCT
    const dctResult = commandSystem.handle("DCT TEST_WP", aircraft);
    dctResult.pendingUpdates.forEach((u) => u());

    expect(aircraft.autopilot.flightPlan.length).toBeGreaterThan(0);
    expect(aircraft.activeWaypoint).toBeNull(); // Will be set on update, but flightPlan exists

    // simulate updateNavigation (simplified)
    if (aircraft.autopilot.flightPlan.length > 0) {
      (aircraft.autopilot as any).activeLeg =
        aircraft.autopilot.flightPlan.shift()!;
      if (aircraft.activeLeg && "waypoint" in aircraft.activeLeg) {
        aircraft.activeWaypoint = airport.getWaypoint(
          aircraft.activeLeg.waypoint,
        )!;
      }
    }

    expect(aircraft.activeLeg).not.toBeNull();

    // 2. Assign Heading
    const headingResult = commandSystem.handle("H090", aircraft);
    headingResult.pendingUpdates.forEach((u) => u());

    // 3. Update Autopilot to apply targets
    aircraft.update(1);

    // 4. Assertions
    expect(aircraft.targetHeading).toBe(90);
    expect(aircraft.activeLeg).toBeNull();
    expect(aircraft.activeWaypoint).toBeNull();
    expect(aircraft.flightPlan.length).toBe(0);
  });

  it("should NOT clear flight plan for Speed/Altitude commands", () => {
    // 1. Setup
    aircraft.flightPlan = [{ type: "TF", waypoint: "WP1" }];
    const cmd = "JAL123 SPEED 200";

    // 2. Execute
    const result = commandSystem.handle(cmd, aircraft);
    result.pendingUpdates.forEach((fn) => fn());

    // 3. Update Autopilot
    aircraft.update(1);

    // 4. Assertions
    expect(aircraft.targetSpeed).toBe(200);
    expect(aircraft.flightPlan.length).toBe(1);
  });
});
