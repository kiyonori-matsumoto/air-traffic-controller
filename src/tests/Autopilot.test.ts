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
      autopilot.activateFlightPlan([{ type: "TF", waypoint: "WPT1" }]);
      expect(autopilot.lateralMode).toBe("LNAV");
      expect(aircraft.flightPlan.length).toBe(1);

      autopilot.setHeading(180);
      expect(autopilot.lateralMode).toBe("HDG");
      expect(autopilot.mcpHeading).toBe(180);
      expect(aircraft.flightPlan.length).toBe(0);
    });

    it("should switch to LNAV/VNAV via activateFlightPlan", () => {
      autopilot.setHeading(90);
      const leg: FlightLeg = {
        type: "TF",
        waypoint: "WPT1",
        altConstraint: 5000,
        zConstraint: "ABOVE",
      };
      autopilot.activateFlightPlan([leg]);

      expect(autopilot.lateralMode).toBe("LNAV");
      expect(autopilot.verticalMode).toBe("VNAV");
      expect(aircraft.flightPlan[0]).toEqual(leg);
    });
  });

  describe("VNAV Climb Logic", () => {
    beforeEach(() => {
      autopilot.activateFlightPlan([
        {
          type: "TF",
          waypoint: "WPT1",
          altConstraint: 700,
          zConstraint: "ABOVE",
        },
      ]);
      // Default setup: Climbing
      aircraft.altitude = 600;
      autopilot.mcpAltitude = 30000;
    });

    it("should adhere to AT constraint even if MCP is higher", () => {
      // AT 700
      aircraft.flightPlan[0].zConstraint = "AT";
      aircraft.flightPlan[0].altConstraint = 700;
      aircraft.activeLeg = aircraft.flightPlan[0];

      // Call calculateVertical directly to avoid update() integration issues
      (autopilot as any).calculateVertical();

      expect(aircraft.targetAltitude).toBe(700);
    });

    it("should adhere to BELOW constraint", () => {
      aircraft.flightPlan[0].zConstraint = "BELOW";
      aircraft.flightPlan[0].altConstraint = 700;
      aircraft.activeLeg = aircraft.flightPlan[0];

      (autopilot as any).calculateVertical();
      expect(aircraft.targetAltitude).toBe(700);
    });

    it("should ignore ABOVE constraint for Target (monitor only) and aim for MCP", () => {
      aircraft.flightPlan[0].zConstraint = "ABOVE";
      aircraft.flightPlan[0].altConstraint = 700;
      aircraft.activeLeg = aircraft.flightPlan[0];

      (autopilot as any).calculateVertical();
      expect(aircraft.targetAltitude).toBe(30000);
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
  });
});
