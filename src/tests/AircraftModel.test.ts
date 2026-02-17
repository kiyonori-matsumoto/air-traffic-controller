import { describe, it, expect, beforeEach } from "vitest";
import { Aircraft } from "../models/Aircraft";

describe("Aircraft Model", () => {
  let aircraft: Aircraft;

  beforeEach(() => {
    // Initialize with standard values
    aircraft = new Aircraft("JAL123", 0, 0, 250, 0, 10000, "RJTT", "RJCC");
    // x=0, y=0, spd=250, hdg=0 (North), alt=10000
  });

  describe("Physics & Movement", () => {
    it("should move according to speed and heading", () => {
      const dt = 1; // 1 second
      // Speed 250kt = 250 NM/h = 250/3600 NM/s ~= 0.0694 NM/s

      const expectedDist = 250 / 3600;
      aircraft.update(dt);

      expect(aircraft.x).toBeCloseTo(0);
      expect(aircraft.y).toBeCloseTo(expectedDist);
    });

    it("should turn towards target heading", () => {
      // aircraft.targetHeading = 90; // Old way
      aircraft.autopilot.setHeading(90);
      aircraft.turnRate = 3; // 3 deg/s
      const dt = 1;

      aircraft.update(dt);

      // Should increase by 3 degrees
      expect(aircraft.heading).toBe(3);
    });

    it("should wrap heading around 360", () => {
      aircraft.heading = 359;
      // aircraft.targetHeading = 5;
      aircraft.autopilot.setHeading(5);
      aircraft.turnRate = 3;

      aircraft.update(1); // 359 -> 2 (cross 0)

      // 359 + 3 = 362 -> 2
      expect(aircraft.heading).toBe(2);
    });

    it("should climb towards target altitude", () => {
      aircraft.altitude = 10000;
      // aircraft.targetAltitude = 11000;
      aircraft.autopilot.setAltitude(11000);
      aircraft.autopilot.speedMode = "FMS"; // Enable profile management
      aircraft.climbRate = 35; // ft/s
      const dt = 1;

      aircraft.update(dt);

      expect(aircraft.altitude).toBe(10035);
    });

    it("should accelerate towards target speed", () => {
      aircraft.speed = 200;
      aircraft.targetSpeed = 250;
      aircraft.acceleration = 1; // kt/s
      const dt = 10;

      aircraft.update(dt);

      expect(aircraft.speed).toBe(210);
    });
  });

  describe("Separation Logic", () => {
    let other: Aircraft;

    beforeEach(() => {
      other = new Aircraft("ANA456", 0, 0, 250, 0, 10000, "RJTT", "RJCC");
    });

    it("should return NORMAL when well separated", () => {
      other.x = 20; // 20NM away
      expect(aircraft.checkSeparation(other)).toBe("NORMAL");
    });

    it("should return WARNING when < 8NM horizontally", () => {
      other.x = 7.9;
      // Vertically same (10000)
      expect(aircraft.checkSeparation(other)).toBe("WARNING");
    });

    it("should return VIOLATION when < 5NM horizontally", () => {
      other.x = 4.9;
      expect(aircraft.checkSeparation(other)).toBe("VIOLATION");
    });

    it("should return NORMAL if vertical separation exists", () => {
      other.x = 0; // Same position
      other.altitude = 11000; // 1000ft diff
      expect(aircraft.checkSeparation(other)).toBe("NORMAL");

      other.altitude = 10900; // 900ft diff -> Violation (since horizontal is 0)
      expect(aircraft.checkSeparation(other)).toBe("VIOLATION");
    });
  });

  describe("Navigation", () => {
    it("should advance flight plan points", () => {
      // Mock waypoints
      const wp1 = { name: "WP1", x: 0, y: 10, lat: 0, lon: 0 }; // North 10NM
      const wp2 = { name: "WP2", x: 10, y: 10, lat: 0, lon: 0 };

      const mockWaypoints = [wp1, wp2];

      // Set flight plan
      aircraft.autopilot.flightPlan = [
        { type: "TF", waypoint: "WP1", altitude: 10000, speed: 250 },
        { type: "TF", waypoint: "WP2", altitude: 10000, speed: 250 },
      ];

      // IMPORTANT: Set Autopilot Mode to LNAV
      aircraft.autopilot.lateralMode = "LNAV";

      // Initial update to grab first leg
      aircraft.updateNavigation(mockWaypoints);

      // Type guard for TS
      if (
        aircraft.autopilot.activeLeg &&
        "waypoint" in aircraft.autopilot.activeLeg
      ) {
        expect(aircraft.autopilot.activeLeg.waypoint).toBe("WP1");
      } else {
        throw new Error(
          "Expected TF leg, got " +
            JSON.stringify(aircraft.autopilot.activeLeg),
        );
      }
      expect(aircraft.activeWaypoint).toBe(wp1);

      // Move aircraft close to WP1
      aircraft.x = 0;
      aircraft.y = 9.99; // 0.01nm away (Very close)
      aircraft.speed = 250;

      // Update logic (Not updateNavigation directly, but update() calls it?
      // No, updateNavigation is called by TrafficManager in game loop.
      // Unit test calls it manually.)
      aircraft.updateNavigation(mockWaypoints);

      expect(aircraft.autopilot.activeLeg).toBeNull();

      // Next frame
      aircraft.updateNavigation(mockWaypoints);

      if (
        aircraft.autopilot.activeLeg &&
        "waypoint" in aircraft.autopilot.activeLeg
      ) {
        expect(aircraft.autopilot.activeLeg.waypoint).toBe("WP2");
      } else {
        throw new Error("Expected TF leg");
      }
    });
  });
});
