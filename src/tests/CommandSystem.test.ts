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
    aircraft = new Aircraft(
      "JAL123",
      "B737",
      0,
      0,
      250,
      0,
      10000,
      "RJTT",
      "RJCC",
    );
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
    expect(aircraft.autopilot.flightPlan.length).toBe(0);
  });

  it("should NOT clear flight plan for Speed/Altitude commands", () => {
    aircraft.autopilot.flightPlan = [
      { type: "TF", waypoint: "WP1", altitude: 10000, speed: 250 },
    ];
    const cmd = "SPEED 200";

    // 2. Execute
    const result = commandSystem.handle(cmd, aircraft);
    result.pendingUpdates.forEach((fn) => fn());

    // 3. Update Autopilot
    aircraft.update(1);

    // 4. Assertions
    expect(aircraft.targetSpeed).toBe(200);
    expect(aircraft.autopilot.flightPlan.length).toBe(1);
  });

  describe("10000ft / 250kt Restrictions", () => {
    it("should reject descent below 10000ft if speed > 250kt", () => {
      aircraft.altitude = 12000;
      aircraft.speed = 280;

      const result = commandSystem.handle("A9000", aircraft);

      expect(result.handled).toBe(false);
      expect(result.atcLog).toContain("UNABLE");
      expect(result.pendingUpdates.length).toBe(0);
    });

    it("should reject accelerating > 250kt if altitude < 10000ft", () => {
      aircraft.altitude = 8000;
      aircraft.speed = 240;

      const result = commandSystem.handle("S280", aircraft);

      expect(result.handled).toBe(false);
      expect(result.atcLog).toContain("UNABLE");
      expect(result.pendingUpdates.length).toBe(0);
    });

    it("should accept descent below 10000ft if simultaneously commanding speed <= 250kt", () => {
      aircraft.altitude = 12000;
      aircraft.speed = 280;

      const result = commandSystem.handle("A9000 S240", aircraft);

      expect(result.handled).toBe(true);
      expect(result.atcLog).toBeTypeOf("string");
      expect(result.pendingUpdates.length).toBe(2); // One for Alt, one for Speed

      result.pendingUpdates.forEach((fn) => fn());
      expect(aircraft.autopilot.mcpAltitude).toBe(9000);
      expect(aircraft.autopilot.mcpSpeed).toBe(240);
    });

    it("should accept descent below 10000ft if current speed already <= 250kt", () => {
      aircraft.altitude = 12000;
      aircraft.speed = 240;

      const result = commandSystem.handle("A9000", aircraft);

      expect(result.handled).toBe(true);
      expect(result.atcLog).toBeTypeOf("string");
      expect(result.pendingUpdates.length).toBe(1);

      result.pendingUpdates.forEach((fn) => fn());
      expect(aircraft.autopilot.mcpAltitude).toBe(9000);
    });
  });
});
