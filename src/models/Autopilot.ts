import { IAircraft } from "./IAircraft";
import { FlightLeg, Waypoint, Runway } from "./Airport";

export type LateralMode = "HDG" | "LNAV" | "LOC" | "ROLLOUT";
export type VerticalMode =
  | "ALT"
  | "FLCH"
  | "VNAV"
  | "VNAV_ALT"
  | "GS"
  | "FLARE";
export type SpeedMode = "MANUAL" | "FMS";

export class Autopilot {
  // Modes
  public lateralMode: LateralMode = "HDG";
  public verticalMode: VerticalMode = "ALT";
  public speedMode: SpeedMode = "MANUAL";

  // Debug Flag
  public debug: boolean = true;

  // MCP Targets (Selected by Pilot/ATC)
  public mcpHeading: number;
  public mcpAltitude: number;
  public mcpSpeed: number;

  constructor(private aircraft: IAircraft) {
    this.mcpHeading = aircraft.heading;
    this.mcpAltitude = aircraft.altitude;
    this.mcpSpeed = aircraft.speed;

    // Initialize prev values to current to avoid initial log spam
    this.prevMcpHeading = this.mcpHeading;
    this.prevMcpAltitude = this.mcpAltitude;
    this.prevMcpSpeed = this.mcpSpeed;
  }

  // Previous State for Change Detection
  private prevLateralMode: LateralMode = "HDG";
  private prevVerticalMode: VerticalMode = "ALT";
  private prevSpeedMode: SpeedMode = "MANUAL";
  private prevMcpHeading: number = 0;
  private prevMcpAltitude: number = 0;
  private prevMcpSpeed: number = 0;
  private prevWaypointName: string | null = null;

  public update(dt: number) {
    // Initialize prev values on first run or if they differ significantly (hack for constructor sync)
    // Actually, distinct initialization is better. Check constructor.

    // 1. Update Modes (Transition Logic)
    this.updateModes();

    // 2. Calculate Targets based on Modes
    this.calculateLateral();
    this.calculateVertical();
    this.calculateSpeed();

    // 3. Manage Profiles (VNAV/FMS Limits)
    this.manageProfiles(dt);

    // 4. Check & Log Mode Changes
    this.checkStateChange();
  }

  private checkStateChange() {
    // Modes
    if (this.lateralMode !== this.prevLateralMode) {
      console.log(
        `${this.aircraft.callsign} Lateral Mode: ${this.prevLateralMode} -> ${this.lateralMode}`,
      );
      this.prevLateralMode = this.lateralMode;
    }
    if (this.verticalMode !== this.prevVerticalMode) {
      console.log(
        `${this.aircraft.callsign} Vertical Mode: ${this.prevVerticalMode} -> ${this.verticalMode}`,
      );
      this.prevVerticalMode = this.verticalMode;
    }
    if (this.speedMode !== this.prevSpeedMode) {
      console.log(
        `${this.aircraft.callsign} Speed Mode: ${this.prevSpeedMode} -> ${this.speedMode}`,
      );
      this.prevSpeedMode = this.speedMode;
    }

    // MCP Targets
    if (Math.abs(this.mcpHeading - this.prevMcpHeading) > 0.1) {
      console.log(
        `${this.aircraft.callsign} MCP Heading: ${Math.round(this.prevMcpHeading)} -> ${Math.round(this.mcpHeading)}`,
      );
      this.prevMcpHeading = this.mcpHeading;
    }
    if (Math.abs(this.mcpAltitude - this.prevMcpAltitude) > 1) {
      console.log(
        `${this.aircraft.callsign} MCP Altitude: ${Math.round(this.prevMcpAltitude)} -> ${Math.round(this.mcpAltitude)}`,
      );
      this.prevMcpAltitude = this.mcpAltitude;
    }
    if (Math.abs(this.mcpSpeed - this.prevMcpSpeed) > 0.1) {
      console.log(
        `${this.aircraft.callsign} MCP Speed: ${Math.round(this.prevMcpSpeed)} -> ${Math.round(this.mcpSpeed)}`,
      );
      this.prevMcpSpeed = this.mcpSpeed;
    }

    // LNAV Waypoint
    if (this.lateralMode === "LNAV") {
      const currentWpName = this.aircraft.activeWaypoint
        ? this.aircraft.activeWaypoint.name
        : null;
      if (currentWpName !== this.prevWaypointName) {
        console.log(
          `${this.aircraft.callsign} LNAV Waypoint: ${this.prevWaypointName} -> ${currentWpName}`,
        );
        this.prevWaypointName = currentWpName;
      }
    } else {
      // Keep sync to avoid stale logs when switching back
      const currentWpName = this.aircraft.activeWaypoint
        ? this.aircraft.activeWaypoint.name
        : null;
      this.prevWaypointName = currentWpName;
    }
  }

  private updateModes() {
    // Mode Transitions
    // If Flight Plan exists and LNAV requested/active -> LNAV
    if (
      this.lateralMode === "LNAV" &&
      this.aircraft.flightPlan.length === 0 &&
      !this.aircraft.activeLeg
    ) {
      // Revert to HDG if plan ends
      this.lateralMode = "HDG";
      this.mcpHeading = this.aircraft.heading;
    }
  }

  private calculateLateral() {
    if (this.lateralMode === "HDG") {
      this.aircraft.targetHeading = this.mcpHeading;
    } else if (this.lateralMode === "LNAV") {
      // Logic handled by Aircraft.updateNavigation() for now?
      // Or move it here?
      // Plan: Let Aircraft.updateNavigation set targetHeading, but Autopilot
      // orchestrates it.
      // If LNAV, we EXPECT targetHeading to be updated by navigation logic.
      // To strictly separate: Navigation logic should calculate a "desired track"
      // and Autopilot follows it.
      // For Phase 1: Keep existing updateNavigation call in Aircraft,
      // but ensure Autopilot doesn't overwrite it if LNAV.
    }
  }

  public manageLNAV(airportWaypoints: Waypoint[]) {
    // If not LNAV, do nothing (Guard)
    if (this.lateralMode !== "LNAV") return;

    // Check Flight Plan
    if (this.aircraft.flightPlan.length === 0 && !this.aircraft.activeLeg)
      return;

    // Pop next leg if needed
    if (!this.aircraft.activeLeg && this.aircraft.flightPlan.length > 0) {
      this.aircraft.activeLeg = this.aircraft.flightPlan.shift()!;
    }

    if (this.aircraft.activeLeg) {
      this.processLeg(this.aircraft.activeLeg, airportWaypoints);
    }
  }

  private processLeg(leg: FlightLeg, airportWaypoints: Waypoint[]) {
    const getWp = (name: string) =>
      airportWaypoints.find((w) => w.name === name);

    if (leg.type === "VA") {
      // Vector to Altitude
      this.aircraft.targetHeading = leg.heading;

      // Altitude Constraint Logic (VNAV mostly, but VA combines them)
      // Since VA is Lateral+Vertical, we handle heading here.
      // Vertical logic should strictly be in calculateVertical/VNAV?
      // But VA *terminates* based on vertical condition.
      // We must check termination here.

      // Pass constraints to VNAV logic if we split them?
      // For Phase 2, let's keep it integrated here for VA Leg logic.

      if (this.aircraft.altitude >= leg.altConstraint) {
        // Terminate Leg
        this.aircraft.activeLeg = null;
        this.aircraft.activeWaypoint = null;
      }
    } else if (leg.type === "TF" || leg.type === "DF") {
      if (!this.aircraft.activeWaypoint) {
        const wp = getWp(leg.waypoint);
        if (wp) {
          this.aircraft.activeWaypoint = wp;
        } else {
          this.aircraft.activeLeg = null; // Skip invalid
          return;
        }
      }

      const dx = this.aircraft.activeWaypoint.x - this.aircraft.x;
      const dy = this.aircraft.activeWaypoint.y - this.aircraft.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Heading Calc
      const mathRad = Math.atan2(dy, dx);
      const mathDeg = (mathRad * 180) / Math.PI;
      let targetH = 90 - mathDeg;
      if (targetH < 0) targetH += 360;
      this.aircraft.targetHeading = targetH;

      // Reached?
      if (dist < 1.0) {
        this.aircraft.activeLeg = null;
        this.aircraft.activeWaypoint = null;
      }
    }
  }

  private calculateVertical() {
    // If GS or FLARE, do not use MCP or VNAV logic.
    if (this.verticalMode === "GS" || this.verticalMode === "FLARE") {
      if (this.capturedRunway && this.aircraft.state === "LANDING") {
        const rwy = this.capturedRunway;
        const dx = this.aircraft.x - rwy.x;
        const dy = this.aircraft.y - rwy.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // 3-degree glide slope: ~318 ft per NM
        // (tan(3deg) * 6076ft/NM = 0.0524 * 6076 = 318.4)
        const idealAlt = Math.floor(dist * 318.44);

        if (idealAlt < this.aircraft.altitude) {
          this.aircraft.targetAltitude = idealAlt;
        } else {
          // If we are below GS, maintain current altitude until intercept?
          // Standard behavior: Maintain Level until GS intercept from below.
          // Current logic: target = ideal. If ideal > current, we climb?
          // No, we should not climb to catch GS from below usually?
          // But if we are *on* GS (captured), we follow it.
          // Let's stick to simple logic: Target = ideal.
          // But wait, if ideal > current, that means we are BELOW glide slope.
          // We should MAINTAIN current altitude (or MCP) to intercept.

          // However, if we already captured, we might have dipped below?
          // Let's just track the ideal path for now.

          // Original logic was:
          // if (idealAlt > this.aircraft.altitude) target = current (don't climb)
          // else target = ideal (descend)

          if (idealAlt > this.aircraft.altitude) {
            this.aircraft.targetAltitude = this.aircraft.altitude;
          } else {
            this.aircraft.targetAltitude = idealAlt;
          }
        }
      }
      return;
    }

    // Default: Pass MCP to Target
    let target = this.mcpAltitude;

    // VNAV Logic (Apply Constraints)
    // Only if Vertical Mode is VNAV (or implicitly active?)
    // Let's assume VNAV mode is required for constraints.
    // Also apply to VA legs implicitly because they are "Vector to Altitude".

    // Check Active Leg
    // If Logic hasn't popped it yet (e.g. pre-update), verify flight plan
    const leg =
      this.aircraft.activeLeg ||
      (this.aircraft.flightPlan.length > 0
        ? this.aircraft.flightPlan[0]
        : null);

    if (leg) {
      if (leg.type === "VA") {
        // VA leg ALWAYS implies climbing/descending to this altitude?
        // Usually it's a climb leg.
        // If MCP acts as clearance, we should respect it?
        // But if MCP is 0 (bug case), we definitely target the constraint.
        // Let's say target is the constraint, bounded by MCP if MCP is "valid" (e.g. higher than 0).
        // But simpler: VA IS the command. Target = Constraint.
        // Unless pilot sets lower MCP?
        // Let's implement: Target = Constraint.
        target = leg.altConstraint;

        // Safety: If MCP is set and LOWER/HIGHER?
        // Let's trust the Leg for VA.
      } else if (
        (leg.type === "TF" || leg.type === "DF") &&
        (this.verticalMode === "VNAV" || this.verticalMode === "VNAV_ALT")
      ) {
        // Look ahead to next leg for Descent Floor
        let nextConstraint = -1;
        // if (this.aircraft.flightPlan.length > 0) {
        //   const nextLeg = this.aircraft.flightPlan[0];
        //   if (
        //     (nextLeg.type === "TF" || nextLeg.type === "DF") &&
        //     nextLeg.altConstraint
        //   ) {
        //     // Only respect AT or ABOVE for floor
        //     if (!nextLeg.zConstraint || nextLeg.zConstraint !== "BELOW") {
        //       nextConstraint = nextLeg.altConstraint;
        //     }
        //   }
        // }

        let effectiveConstraint: number | undefined;
        let effectiveType: string = "AT";

        if (leg.altConstraint) {
          effectiveConstraint = leg.altConstraint;
          effectiveType = leg.zConstraint || "AT";
        } else if (nextConstraint !== -1) {
          effectiveConstraint = nextConstraint;
          // We need the type of the next constraint, but we didn't save it.
          // Let's re-access nextLeg or store it above.
          // For simplicity/safety, let's look it up again or just assume conservative?
          // No, we need the type.
          if (this.aircraft.flightPlan.length > 0) {
            effectiveType = this.aircraft.flightPlan[0].zConstraint || "AT";
          }
        }

        if (effectiveConstraint !== undefined) {
          const constraint = effectiveConstraint;
          const type = effectiveType;

          // Refined VNAV Logic (User Request)
          // Determine Phase: CLIMB or DESCENT/CRUISE based on MCP vs Current?
          // Actually, we should check MCP vs Current Altitude.

          if (this.mcpAltitude > this.aircraft.altitude + 100) {
            // --- CLIMB PHASE ---
            // Rule:
            // 1. Target = MCP (Default)
            // 2. Check Constraint

            // CHECK: Are we actually in a descent profile? (Look ahead for lower constraints)
            // If we have a future constraint lower than current altitude, we should NOT climb to MCP.
            // This handles the "Unconstrained Leg between Constraints" issue in STARs.
            let descentAhead = false;
            for (const leg of this.aircraft.flightPlan) {
              if (
                leg.altConstraint &&
                leg.altConstraint < this.aircraft.altitude - 100
              ) {
                // Found a future constraint lower than current. We are in descent mode.
                if (leg.zConstraint !== "ABOVE") {
                  // ABOVE doesn't force ceiling
                  descentAhead = true;
                  break;
                }
              }
            }

            if (descentAhead) {
              // Inhibit Climb. Maintain current or target constraint?
              // Safest is to maintain current altitude (Step Down) until next constraint is active leg.
              target = this.aircraft.altitude;
            } else {
              // Genuine Climb
              let targetAlt = this.mcpAltitude;

              if (type === "AT") {
                targetAlt = constraint;
              } else if (type === "BELOW") {
                targetAlt = Math.min(this.mcpAltitude, constraint);
              } else if (type === "ABOVE") {
                targetAlt = this.mcpAltitude;
              }
              target = targetAlt;
            }
          } else {
            // --- DESCENT / CRUISE PHASE ---
            // "Descend Via" Behavior:
            // If VNAV constraint requires lower altitude, we descend even if MCP is higher.

            const mcpWantsDescent =
              this.mcpAltitude < this.aircraft.altitude - 100;
            const constraintWantsDescent =
              constraint < this.aircraft.altitude - 100 && type !== "ABOVE"; // 'ABOVE' doesn't force descent

            // Only descend if MCP wants it OR Constraint wants it (and we are in VNAV)
            if (
              mcpWantsDescent ||
              (this.verticalMode === "VNAV" && constraintWantsDescent)
            ) {
              let targetAlt = this.mcpAltitude;

              // If Constraint works like an instruction ("Descend Via"), use it.
              if (type === "AT") {
                targetAlt = constraint;
              } else if (type === "ABOVE") {
                // Descend to the constraint floor
                targetAlt = constraint;
              } else if (type === "BELOW") {
                // At or Below. If MCP is higher, target constraint.
                // If MCP is lower, target MCP. (Safe to go lower)
                // But if MCP is 13000 and Below 5000, we must go to 5000.
                targetAlt = Math.min(this.mcpAltitude, constraint);
              }

              target = targetAlt;
              this.mcpAltitude = targetAlt;
            } else {
              // Level / Cruise (MCP Hold)
              target = this.mcpAltitude;
            }
          }
        }
      }
    }

    this.aircraft.targetAltitude = target;
  }

  private manageProfiles(_dt: number) {
    // If Speed Mode is MANUAL, do not override
    if (this.speedMode !== "FMS") return;

    // DEPARTURE / CLIMB Logic
    // Check if we are in a climbing phase (MCP Alt > Current Alt + margin)
    // We use MCP because targetAltitude might be constrained (e.g. 700ft) while we intend to climb to 30000ft.
    if (this.mcpAltitude > this.aircraft.altitude + 100) {
      // Speed Schedule
      let limitSpeed = 999;

      if (this.aircraft.altitude < 3000) {
        // Initial Climb: V2 + 10-20kt
        limitSpeed = 160;
      } else if (this.aircraft.altitude < 10000) {
        // Below 10k: 250kt limit
        limitSpeed = 250;
      } else {
        // Above 10k: Cruise Climb
        limitSpeed = 300;
      }

      // Apply limit to Target Speed (if not manually set lower?)
      // Since we don't distinguish manual vs auto, we just set it.
      // Yet, let's respect Waypoint limit if active.
      if (
        this.aircraft.activeWaypoint &&
        this.aircraft.activeWaypoint.speedLimit
      ) {
        limitSpeed = Math.min(
          limitSpeed,
          this.aircraft.activeWaypoint.speedLimit,
        );
      }

      // Gently increase target speed if current target is lower than limit
      // AND we are not constrained by user.
      // Simplified: Always set target speed to limit for departures.
      // How to know if departure? Squawk? Origin?
      // Using a simple heuristic: if climbing significantly.
      this.aircraft.targetSpeed = limitSpeed;
    }
  }

  private calculateSpeed() {
    if (this.speedMode === "MANUAL") {
      this.aircraft.targetSpeed = this.mcpSpeed;
    }
  }

  // Captured Runway for Approach Tracking
  private capturedRunway: Runway | null = null;

  public manageApproach(runways: Runway[]): boolean {
    if (this.aircraft.state === "FLYING") {
      // ILS Capture Logic
      for (const rwy of runways) {
        if (
          rwy.isAligned(
            this.aircraft.x,
            this.aircraft.y,
            this.aircraft.altitude,
            this.aircraft.heading,
          )
        ) {
          console.log(`${this.aircraft.callsign} captured ILS ${rwy.id}`);
          this.aircraft.state = "LANDING";
          this.aircraft.targetSpeed = 140;
          this.lateralMode = "LOC";
          this.verticalMode = "GS";
          this.capturedRunway = rwy;
          return true;
        }
      }
    } else if (this.aircraft.state === "LANDING") {
      // LOC/GS Tracking
      const rwy = this.capturedRunway;
      if (!rwy) {
        // Should not happen if state is LANDING, but safe-guard
        this.aircraft.state = "FLYING";
        return true;
      }

      const dx = this.aircraft.x - rwy.x;
      const dy = this.aircraft.y - rwy.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // 1. Glide Slope (GS)
      // Height calculation moved to calculateVertical()
      // We just need to ensure verticalMode is GS.

      // 2. Localizer (LOC)
      const rwyRad = (90 - rwy.heading) * (Math.PI / 180);
      const lateralOffset = -dx * Math.sin(rwyRad) + dy * Math.cos(rwyRad);

      const correction = lateralOffset * 40;
      this.aircraft.targetHeading = (rwy.heading + correction + 360) % 360;

      // Flare / Touchdown
      if (dist < 0.3 && this.aircraft.altitude < 150) {
        console.log(`${this.aircraft.callsign} landed!`);
        this.aircraft.state = "LANDED";
        this.verticalMode = "FLARE";
        return false;
      }
    }

    // Out of bounds check (legacy)
    const distFromCenter = Math.sqrt(
      this.aircraft.x * this.aircraft.x + this.aircraft.y * this.aircraft.y,
    );
    if (distFromCenter > 100) {
      return false;
    }

    return true;
  }

  // --- External Inputs ---

  public setHeading(hdg: number) {
    this.mcpHeading = hdg;
    this.lateralMode = "HDG";

    // Clear LNAV state
    this.aircraft.flightPlan = [];
    this.aircraft.activeLeg = null;
    this.aircraft.activeWaypoint = null;
  }

  public activateFlightPlan(plan: FlightLeg[], approachType?: string) {
    this.aircraft.flightPlan = plan;
    this.aircraft.activeLeg = null;
    this.aircraft.activeWaypoint = null;
    if (approachType) {
      this.aircraft.approachType = approachType;
    }
    this.lateralMode = "LNAV";
    this.verticalMode = "VNAV";
  }

  public setAltitude(alt: number) {
    this.mcpAltitude = alt;
    // If diff is large, maybe switch to FLCH?
    // For now, keep simple.
  }

  public setSpeed(spd: number) {
    this.mcpSpeed = spd;
    this.speedMode = "MANUAL";
  }
}
