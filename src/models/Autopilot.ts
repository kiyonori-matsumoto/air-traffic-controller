import { Aircraft } from "./Aircraft";
import { FlightLeg, Waypoint, Runway } from "./Airport";

export type LateralMode = "HDG" | "LNAV" | "LOC" | "ROLLOUT";
export type VerticalMode = "ALT" | "FLCH" | "VNAV" | "GS" | "FLARE";
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

  constructor(private aircraft: Aircraft) {
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
    // Default: Pass MCP to Target
    let target = this.mcpAltitude;

    // VNAV Logic (Apply Constraints)
    // Only if Vertical Mode is VNAV (or implicitly active?)
    // Let's assume VNAV mode is required for constraints.
    // Also apply to VA legs implicitly because they are "Vector to Altitude".

    // Check Active Leg
    const leg = this.aircraft.activeLeg;

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
        this.verticalMode === "VNAV"
      ) {
        // Look ahead to next leg for Descent Floor
        let nextConstraint = -1;
        if (this.aircraft.flightPlan.length > 0) {
          const nextLeg = this.aircraft.flightPlan[0];
          if (
            (nextLeg.type === "TF" || nextLeg.type === "DF") &&
            nextLeg.altConstraint
          ) {
            // Only respect AT or ABOVE for floor
            if (!nextLeg.zConstraint || nextLeg.zConstraint !== "BELOW") {
              nextConstraint = nextLeg.altConstraint;
            }
          }
        }

        if (leg.altConstraint || nextConstraint !== -1) {
          const constraint = leg.altConstraint || 0;
          const type = leg.zConstraint || "AT";
          const currentAlt = this.aircraft.altitude;

          // Challenge: Are we climbing or descending?
          // Depends on MCP vs Current?
          // Or Flight Plan Profile?
          // Simplified: Look at MCP vs Constraint.

          // Case 1: Descent (MCP < Current)
          if (this.mcpAltitude < constraint) {
            // DESCENT
            if (type === "AT" || type === "ABOVE") {
              // Cannot go below constraint
              target = Math.max(this.mcpAltitude, constraint);
            } else {
              // BELOW or no constraint: go to MCP
              target = this.mcpAltitude;
            }
            if (this.debug) {
              console.log(
                `VNAV Descent: MCP ${this.mcpAltitude} < Cur ${Math.round(currentAlt)}. Cons ${type} ${constraint} -> Target ${target}`,
              );
            }
          }
          // Case 2: Climb (MCP > Current)
          else if (this.mcpAltitude > constraint) {
            // CLIMB
            if (type === "AT" || type === "BELOW") {
              // Cannot go above constraint
              target = Math.min(this.mcpAltitude, constraint);
            } else {
              // ABOVE or no constraint: go to MCP
              target = this.mcpAltitude;
            }
            if (this.debug) {
              console.log(
                `VNAV Climb: MCP ${this.mcpAltitude} > Cur ${Math.round(currentAlt)}. Cons ${type} ${constraint} -> Target ${target}`,
              );
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
    // Check if we are in a climbing phase (Target Alt > Current Alt)
    if (this.aircraft.targetAltitude > this.aircraft.altitude + 100) {
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
          return true;
        }
      }
    } else if (this.aircraft.state === "LANDING") {
      // LOC/GS Tracking
      // For now, assume first runway created the capture or is the target
      // Ideally we should store which runway we captured.
      const rwy = runways[0];

      const dx = this.aircraft.x - rwy.x;
      const dy = this.aircraft.y - rwy.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // 1. Glide Slope (GS)
      const idealAlt = Math.floor(dist * 318.44);
      if (idealAlt > this.aircraft.altitude) {
        this.aircraft.targetAltitude = this.aircraft.altitude;
      } else {
        this.aircraft.targetAltitude = idealAlt;
      }

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
