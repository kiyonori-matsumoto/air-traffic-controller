import { describe, it, expect, beforeEach, vi } from "vitest";
import { Autopilot } from "../models/Autopilot";
import { Aircraft } from "../models/Aircraft";
import { FlightLeg, Runway } from "../models/Airport";

describe("Autopilot Logic", () => {
  let aircraft: Aircraft;
  let autopilot: Autopilot;

  const mockRunway: Runway = {
    id: "34R",
    x: 0,
    y: 0,
    heading: 337,
    length: 2,
    isAligned: vi.fn(),
  } as any;

  beforeEach(() => {
    // Mock Aircraft with minimal properties needed
    aircraft = new Aircraft(
      "TEST01",
      "B737",
      0,
      0,
      250,
      360,
      10000,
      "RJTT",
      "RJCC",
      "M",
    );
    autopilot = aircraft.autopilot;
  });

  describe("Mode Transitions", () => {
    it("should switch to HDG mode and clear LNAV", () => {
      autopilot.activateFlightPlan([{ type: "TF", waypoint: "WPT1" }], "CLIMB");
      expect(autopilot.lateralMode).toBe("LNAV");
      expect(autopilot.flightPlan.length).toBe(1);

      autopilot.setHeading(180);
      expect(autopilot.lateralMode).toBe("HDG");
      expect(autopilot.mcpHeading).toBe(180);
      expect(autopilot.flightPlan.length).toBe(0);
    });

    it("should switch to LNAV/VNAV via activateFlightPlan", () => {
      autopilot.setHeading(90);
      const leg: FlightLeg = {
        type: "TF",
        waypoint: "WPT1",
        altConstraint: 5000,
        zConstraint: "AT",
      };
      autopilot.activateFlightPlan([leg], "DESCENT");

      // MCP is default (e.g. 10000 or higher). Constraint is 5000 (AT).
      // "Descend Via" logic should set target to 5000.
      (autopilot as any).calculateVertical();

      expect(autopilot.lateralMode).toBe("LNAV");
      expect(autopilot.verticalMode).toBe("VNAV");
      expect((autopilot.flightPlan[0] as any).waypoint).toBe("WPT1");
      expect((autopilot.flightPlan[0] as any).altitude).toBe(5000);
      expect(aircraft.targetAltitude).toBe(5000);
    });

    it("should activate FMS mode when flight plan is activated", () => {
      autopilot.setHeading(90);
      const leg1: FlightLeg = { type: "TF", waypoint: "WPT1" };
      const leg2: FlightLeg = { type: "TF", waypoint: "WPT2" };
      autopilot.activateFlightPlan([leg1, leg2], "CLIMB");

      expect(autopilot.lateralMode).toBe("LNAV");
      expect(autopilot.verticalMode).toBe("VNAV");
      expect(autopilot.speedMode).toBe("FMS"); // Verify speed mode
      expect(autopilot.flightPlan.length).toBe(2);
    });
  });

  describe("VNAV Climb Logic", () => {
    beforeEach(() => {
      autopilot.activateFlightPlan(
        [
          {
            type: "TF",
            waypoint: "WPT1",
            altConstraint: 700,
            zConstraint: "ABOVE",
          },
        ],
        "CLIMB",
      );
      // Default setup: Climbing
      aircraft.altitude = 600;
      autopilot.mcpAltitude = 30000;
    });

    it("should adhere to AT constraint", () => {
      // Activate with params
      autopilot.activateFlightPlan(
        [
          {
            type: "TF",
            waypoint: "WPT1",
            altConstraint: 700,
            zConstraint: "AT",
          },
        ],
        "CLIMB",
      );

      (autopilot as any).calculateVertical();
      expect(aircraft.targetAltitude).toBe(700);
    });

    it("should adhere to BELOW constraint", () => {
      autopilot.activateFlightPlan(
        [
          {
            type: "TF",
            waypoint: "WPT1",
            altConstraint: 700,
            zConstraint: "BELOW",
          },
        ],
        "CLIMB",
      );

      (autopilot as any).calculateVertical();
      expect(aircraft.targetAltitude).toBe(700);
    });

    it("should ignore ABOVE constraint for Target and aim for Climb Target", () => {
      autopilot.activateFlightPlan(
        [
          {
            type: "TF",
            waypoint: "WPT1",
            altConstraint: 700,
            zConstraint: "ABOVE",
          },
        ],
        "CLIMB",
      );

      (autopilot as any).calculateVertical();
      expect(aircraft.targetAltitude).toBe(35000); // Climb Target
    });

    it("should NOT update MCP altitude (Safety Logic Removed by User)", () => {
      aircraft.flightPlan = [];
      aircraft.altitude = 13000;
      autopilot.mcpAltitude = 4000;

      const leg: FlightLeg = {
        type: "TF",
        waypoint: "WPT1",
        altConstraint: 8000,
        zConstraint: "AT",
      };
      // Activate
      autopilot.activateFlightPlan([leg], "DESCENT"); // Target 8000

      (autopilot as any).calculateVertical();

      expect(aircraft.targetAltitude).toBe(8000);
      // Check side effect - User removed auto-update
      expect(autopilot.mcpAltitude).toBe(4000);
    });

    it("should limit speed to 250kt below 10,000ft", () => {
      autopilot.speedMode = "FMS";
      aircraft.targetSpeed = 300;
      aircraft.altitude = 8000;

      // Assume not climbing (or climbing but not low altitude)
      autopilot.mcpAltitude = 9000;

      (autopilot as any).manageProfiles(1);

      expect(aircraft.targetSpeed).toBe(250);
    });

    it("should use Cruise Speed above 10,000ft", () => {
      autopilot.speedMode = "FMS";
      aircraft.targetSpeed = 250;
      aircraft.altitude = 15000;
      aircraft.cruiseSpeed = 315; // Custom cruise speed

      (autopilot as any).manageProfiles(1);

      expect(aircraft.targetSpeed).toBe(315);
    });

    it("should respect Waypoint Speed Limit in FMS mode", () => {
      autopilot.speedMode = "FMS";
      aircraft.targetSpeed = 300;
      aircraft.altitude = 12000;

      const leg: any = {
        type: "TF",
        waypoint: "SLOW_WPT",
        speedLimit: 220,
      };
      aircraft.activeWaypoint = leg;

      (autopilot as any).manageProfiles(1);

      expect(aircraft.targetSpeed).toBe(220); // Should limit to 220
    });
  });

  describe("Speed Scheduling", () => {
    beforeEach(() => {
      autopilot.speedMode = "FMS";
      autopilot.lateralMode = "LNAV";
      autopilot.verticalMode = "VNAV";
      // Ensure we are in climb phase: MCP > Current
      autopilot.mcpAltitude = 30000;
    });

    it("should target 250kt when below 10000ft", () => {
      aircraft.altitude = 5000;
      // manageProfiles uses mcpAltitude > altitude + 100 check.

      (autopilot as any).manageProfiles(1);

      expect(aircraft.targetSpeed).toBe(250);
    });

    it("should target 300kt when above 10000ft", () => {
      aircraft.altitude = 12000;

      (autopilot as any).manageProfiles(1);
      expect(aircraft.targetSpeed).toBe(300);
    });

    it("should respect Step Down Speed Logic (Look Ahead)", () => {
      aircraft.altitude = 5000;
      aircraft.targetSpeed = 250;
      // Mock Flight Plan with future constraint
      const nextLeg: FlightLeg = {
        type: "TF",
        waypoint: "NEXT",
        speedLimit: 200,
      };
      // Use activateFlightPlan to populate autopilot.flightPlan
      autopilot.activateFlightPlan(
        [{ type: "TF", waypoint: "NOLIMIT" }, nextLeg],
        "DESCENT",
      );

      (autopilot as any).manageProfiles(1);

      expect(aircraft.targetSpeed).toBe(200);
    });

    it("should handle multi-leg gap without accelerating", () => {
      aircraft.altitude = 5000;
      aircraft.targetSpeed = 210;

      const leg3: FlightLeg = { type: "TF", waypoint: "WP3" }; // No limit
      const leg4: FlightLeg = { type: "TF", waypoint: "WP4", speedLimit: 210 };

      autopilot.activateFlightPlan(
        [{ type: "TF", waypoint: "WP2" }, leg3, leg4],
        "DESCENT",
      );

      (autopilot as any).manageProfiles(1);

      expect(aircraft.targetSpeed).toBe(210);
    });

    it("should not exceed waypoint speed limit", () => {
      aircraft.altitude = 5000; // Schedule says 250
      const wp: any = { name: "SLOW", speedLimit: 200 };
      aircraft.activeWaypoint = wp;

      (autopilot as any).manageProfiles(1);
      expect(aircraft.targetSpeed).toBe(200);
    });
  });

  describe("ILS Approach Logic", () => {
    it("should capture ILS when aligned and correct altitude", () => {
      (mockRunway.isAligned as any).mockReturnValue(true);

      aircraft.state = "FLYING";
      autopilot.manageApproach([mockRunway]);

      expect(aircraft.state).toBe("LANDING");
      expect(autopilot.lateralMode).toBe("LOC");
      expect(autopilot.verticalMode).toBe("GS");
      expect(aircraft.targetSpeed).toBe(140);
    });

    it("should NOT capture ILS if not flying", () => {
      aircraft.state = "LANDED";
      (mockRunway.isAligned as any).mockReturnValue(true);
      autopilot.manageApproach([mockRunway]);

      expect(aircraft.state).toBe("LANDED");
    });

    it("should switch Speed Mode to MANUAL on ILS capture to prevent FMS override", () => {
      // Setup: FMS Mode Active, High Speed
      autopilot.speedMode = "FMS";
      aircraft.targetSpeed = 250;
      aircraft.altitude = 3000;
      aircraft.heading = 337;
      aircraft.x = 0; // Aligned with 34R (approx)
      aircraft.y = -10; // 10NM out

      // Align perfectly
      // Align perfectly
      // const rwy = runways[0]; // 34R (Removed unused)
      // ... assume alignment is good for mock ...
      // Hardcode position to be aligned
      // 34R at 0,0, hdg 337.
      // 10NM out on recip hdg 157.
      // x = 10 * sin(157) = 10 * 0.39 = 3.9
      // y = 10 * cos(157) = 10 * -0.92 = -9.2
      // Let's just use the logic from previous test which worked.

      // Force alignment by mocking isAligned? or just reuse previous working coords?
      // Previous test: aircraft.x = 2; aircraft.y = -6; heading = 337;
      aircraft.x = 2;
      aircraft.y = -6;
      aircraft.heading = 337;
      aircraft.altitude = 2000; // Perfect intercept

      // Mock isAligned to true for this test
      (mockRunway.isAligned as any).mockReturnValue(true);

      const captured = (autopilot as any).manageApproach([mockRunway]);

      expect(captured).toBe(true);
      expect(autopilot.speedMode).toBe("MANUAL");
      expect(aircraft.targetSpeed).toBe(140);

      // Verify manageProfiles doesn't override
      (autopilot as any).manageProfiles(1);
      expect(aircraft.targetSpeed).toBe(140);
    });
  });
});
