import { describe, it, expect, beforeEach } from "vitest";
import { Aircraft } from "../models/Aircraft";
import { Runway } from "../models/Airport";

describe("Glide Slope (GS) Logic", () => {
  let aircraft: Aircraft;
  let runway: Runway;

  beforeEach(() => {
    // Aircraft setup: 10NM south of runway, heading North
    // Runway at 0,0 heading 360 (North) -> Mag Heading 360
    // However, Runway.isAligned calculates angular difference.
    // If Runway heading is 360, "entry heading" is 180 (South).
    // Aircraft should be at (0, -10), heading 360 (North).
    // dx=0, dy=10. atan2(10, 0) = 90 deg (North in Math).
    // ATC Angle = (450 - 90) % 360 = 360 (North).
    // Entry Heading (Runway+180) = 180.
    // Wait, "Entry Heading" means the direction *towards* the runway?
    // Runways are unidirectional? If Heading 360, you land facing 360.
    // So you approach from South (180).
    // The code says:
    // angleToThreshold = atan2(dy, dx) ... vector FROM Runway TO Aircraft?
    // No, code says: dx = acX - this.x. (Vector FROM Runway TO Aircraft).
    // If AC is at (0, -10), Rwy at (0,0). dx=0, dy=-10.
    // atan2(-10, 0) = -90 (South).
    // ATC Angle = (450 - (-90)) % 360 = 540 % 360 = 180.
    // Entry Heading (Runway Back Course) = (360 + 180) % 360 = 180.
    // Diff = 0. Matches!

    // But check altitude.
    // dist = 10. Max Alt = 4000.
    // GS Alt = 10 * 318.44 = 3184.
    // acAlt = 4000. 4000 > 3184 + 100? Yes. 4000 > 3284.
    // Fails altitude check!

    // Fix: Lower aircraft altitude to be within capture range.
    aircraft = new Aircraft("JAL123", 0, -10, 140, 0, 3000, "RJTT", "RJCC");
    runway = new Runway("34R", 0, 0, 360, 10000);
  });

  it("should capture ILS and enter GS mode", () => {
    // 1. Setup: Aircraft aligned with runway
    // Check alignment condition in Runway.isAligned (needs accurate context)
    // isAligned checks lateral and vertical (+/- 60 degrees, +/- 3000ft?)
    // Let's ensure we meet criteria.
    // Runway heading 360. Aircraft heading 0 (matches).
    // Pos: 0, -10 (South). Angle from runway: 180 (From runway perspective?)
    // Actually Runway.isAligned logic is:
    // angleDiff < 30 deg
    // relativeAngle < 60 deg (LOC capture cone)

    // Attempt capture
    const captured = aircraft.autopilot.manageApproach([runway]);

    expect(captured).toBe(true);
    expect(aircraft.state).toBe("LANDING");
    expect(aircraft.autopilot.lateralMode).toBe("LOC");
    expect(aircraft.autopilot.verticalMode).toBe("GS");
  });

  it("should perform GS calculation in update loop", () => {
    // 1. Capture ILS
    aircraft.autopilot.manageApproach([runway]);
    expect(aircraft.autopilot.verticalMode).toBe("GS");

    // 2. Set Altitude ABOVE GS to test descent behavior.
    // At 10NM, Ideal GS ~ 3184 ft.
    // Set Aircraft to 4000ft. (Note: isAligned max is 4000, so this is edge but OK).
    // Wait, isAligned checks BEFORE mode switch. We are already in GS mode manually (simulated).
    // Use 3500ft to be safe.
    aircraft.altitude = 3500;

    // Manually trigger update logic
    aircraft.autopilot.update(1);

    // 3. Verify Target Altitude
    // Dist = 10 NM. Ideal = floor(10 * 318.44) = 3184.
    expect(aircraft.targetAltitude).toBe(3184);
  });

  it("should maintain altitude if below glide slope", () => {
    // 1. Setup: Aircraft at 2000ft (Below GS of 3184ft)
    aircraft.altitude = 2000;
    aircraft.autopilot.manageApproach([runway]);

    // 2. Update
    aircraft.autopilot.update(1);

    // 3. Verify: Target should be Current (maintain 2000), NOT Ideal (3184)
    expect(aircraft.targetAltitude).toBe(2000);
  });

  it("should descend when intercepting glide slope", () => {
    // 1. Setup: Aircraft at 3000ft.
    // Move to 9NM. Ideal = 9 * 318.44 = 2865.
    // Aircraft (3000) > Ideal (2865). Should descend.

    aircraft.y = -9; // 9NM south
    aircraft.altitude = 3000;
    aircraft.autopilot.manageApproach([runway]);
    // Ensure mode is GS (manageApproach sets it if aligned)
    // isAligned check: 9NM, 3000ft.
    // GS Alt at 9NM = 2865. Max allowed = 2865 + 100 = 2965.
    // Wait, isAligned has a tolerance of +100ft.
    // If we are at 3000ft, we are 135ft above GS.
    // isAligned might return FALSE!
    // So GS mode might NOT be set if we call manageApproach.

    // Force GS mode for this test unit testing calculateVertical.
    aircraft.autopilot.verticalMode = "GS";

    // IMPORTANT: We must set capturedRunway for calculateVertical to work!
    // Since capturedRunway is private, we can't set it directly in TS easily without @ts-ignore or casting.
    // Alternatively, we run manageApproach with conditions that TRIGGER capture.

    // To trigger capture: isAligned must be true.
    // isAligned checks:
    // - Distance < 15NM (9NM is OK).
    // - Altitude < 4000ft (2900 is OK).
    // - Altitude < 3deg slope + 100ft.
    //   At 9NM, GS = 2865. Max = 2965.
    //   We are at 3000ft. 3000 > 2965. Capture FAILS.

    // Fix: Set altitude to be within capture range, then move it up?
    // No, manageApproach updates capturedRunway only on transition.

    // Let's set altitude within range (2900), capture, then move up?
    // Or just test with 2900.
    // If at 2900, Ideal is 2865. 2900 > 2865. Should target 2865.

    aircraft.altitude = 2900;
    aircraft.autopilot.manageApproach([runway]);
    // Should capture now.

    aircraft.autopilot.update(1);

    expect(aircraft.targetAltitude).toBe(2865);
  });
});
