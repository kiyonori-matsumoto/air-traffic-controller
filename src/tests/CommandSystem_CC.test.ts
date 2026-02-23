import { describe, it, expect, beforeEach } from "vitest";
import { CommandSystem } from "../managers/CommandSystem";
import { Aircraft } from "../models/Aircraft";
import { Airport } from "../models/Airport";

describe("CommandSystem - CONTACT CENTER", () => {
  let airport: Airport;
  let commandSystem: CommandSystem;
  let aircraft: Aircraft;

  beforeEach(() => {
    airport = new Airport("TEST");
    commandSystem = new CommandSystem(airport);

    // Create a dummy departure aircraft
    aircraft = new Aircraft(
      "JAL123",
      "B737",
      0, // x
      0, // y
      250, // speed
      0, // heading
      0, // altitude
      "RJTT", // origin (departure)
      "RJCC", // destination
    );
    aircraft.ownership = "OWNED";
  });

  it("should fail handoff if altitude < 18000 AND distance < 30NM", () => {
    aircraft.altitude = 5000;
    aircraft.x = 10;
    aircraft.y = 10; // dist = ~14.1

    const result = commandSystem.handle("CONTACT CENTER", aircraft);
    result.pendingUpdates.forEach((u) => u());

    expect(result.handled).toBe(true);
    expect(result.atcLog).toContain("not ready for handoff");
    expect(aircraft.ownership).toBe("OWNED"); // unchanged
  });

  it("should succeed handoff if altitude >= 18000", () => {
    aircraft.altitude = 19000;
    aircraft.x = 10;
    aircraft.y = 10; // dist < 30NM

    const result = commandSystem.handle("CC", aircraft);
    result.pendingUpdates.forEach((u) => u());

    expect(result.handled).toBe(true);
    expect(result.voiceLog).toContain("contact tokyo control");
    expect(aircraft.ownership).toBe("HANDOFF_COMPLETE");
  });

  it("should succeed handoff if distance >= 30NM", () => {
    aircraft.altitude = 5000;
    aircraft.x = 30;
    aircraft.y = 0; // dist = 30NM

    const result = commandSystem.handle("CC", aircraft);
    result.pendingUpdates.forEach((u) => u());

    expect(result.handled).toBe(true);
    expect(result.voiceLog).toContain("contact tokyo control");
    expect(aircraft.ownership).toBe("HANDOFF_COMPLETE");
  });

  it("should fail if aircraft is not a departure", () => {
    const arrivalAc = new Aircraft(
      "ANA456",
      "B787",
      0,
      0,
      250,
      0,
      15000,
      "RJCC", // origin (not RJTT)
      "RJTT", // destination
    );
    arrivalAc.ownership = "OWNED";

    const result = commandSystem.handle("CC", arrivalAc);
    expect(result.handled).toBe(true);
    expect(result.atcLog).toContain("not a departure");
    expect(arrivalAc.ownership).toBe("OWNED"); // unchanged
  });
});
