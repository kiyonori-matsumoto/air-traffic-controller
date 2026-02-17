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

export type FlightLegTarget =
  | {
      type: "VA"; // Vector to Altitude
      heading: number;
      altConstraint: number;
      zConstraint?: "AT" | "ABOVE" | "BELOW";
      speedLimit?: number;
      altitude: number;
      speed: number;
    }
  | {
      type: "DF"; // Direct to Fix
      waypoint: string;
      altConstraint?: number;
      zConstraint?: "AT" | "ABOVE" | "BELOW";
      speedLimit?: number;
      altitude: number;
      speed: number;
    }
  | {
      type: "TF"; // Track to Fix
      waypoint: string;
      altConstraint?: number;
      zConstraint?: "AT" | "ABOVE" | "BELOW";
      speedLimit?: number;
      altitude: number;
      speed: number;
    };

export class Autopilot {
  // Modes
  public lateralMode: LateralMode = "HDG";
  public verticalMode: VerticalMode = "ALT";
  public speedMode: SpeedMode = "MANUAL";
  public flightMode: "CLIMB" | "CRUISE" | "DESCENT" | "APPROACH" | "LANDING" =
    "CLIMB";

  // Debug Flag
  public debug: boolean = true;

  // MCP Targets (Selected by Pilot/ATC)
  public mcpHeading: number;
  public mcpAltitude: number;
  public mcpSpeed: number;

  // Flight Plan
  public flightPlan: FlightLegTarget[] = [];
  public activeLeg: FlightLegTarget | null = null;

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
      this.flightPlan.length === 0 &&
      !this.activeLeg
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
    if (this.flightPlan.length === 0 && !this.activeLeg) return;

    // Pop next leg if needed
    if (!this.activeLeg && this.flightPlan.length > 0) {
      this.activeLeg = this.flightPlan.shift()!;
    }

    if (this.activeLeg) {
      this.processLeg(this.activeLeg, airportWaypoints);
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
        this.activeLeg = null;
        this.aircraft.activeWaypoint = null;
      }
    } else if (leg.type === "TF" || leg.type === "DF") {
      if (!this.aircraft.activeWaypoint) {
        const wp = getWp(leg.waypoint);
        if (wp) {
          this.aircraft.activeWaypoint = wp;
        } else {
          this.activeLeg = null; // Skip invalid
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
        this.activeLeg = null;
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

    // VNAV Logic
    // VNAV Logic
    if (this.verticalMode === "VNAV" || this.verticalMode === "VNAV_ALT") {
      target = this.activeLeg?.altitude || target;

      // Safety Bounding (Climb Cap / Descent Floor)
      // // CLIMB Check (Target > Current)
      // if (target > this.aircraft.altitude + 100) {
      //   if (this.mcpAltitude < target) {
      //     target = this.mcpAltitude;
      //     console.log(
      //       `${this.aircraft.callsign} VNAV: Clamped climb target to MCP ${target}`,
      //     );
      //   }
      // }
      // // DESCENT Check (Target < Current)
      // if (target < this.aircraft.altitude - 100) {
      //   if (this.mcpAltitude > target) {
      //     // Usually for Descent, MCP is a floor.
      //     target = this.mcpAltitude;
      //     console.log(
      //       `${this.aircraft.callsign} VNAV: Clamped descent target to MCP ${target}`,
      //     );
      //   }
      // }

      // // 3. Auto-update MCP if VNAV commands a constrained altitude
      // if (target !== this.mcpAltitude) {
      //   console.log(
      //     `${this.aircraft.callsign} VNAV: Auto-updating MCP from ${this.mcpAltitude} to ${target}`,
      //   );
      //   this.mcpAltitude = target;
      // }

      this.aircraft.targetAltitude = target;
    } else {
      // ALT / FLCH / Manual Modes
      this.aircraft.targetAltitude = target;
    }
  }

  /**
   * VNAV Constraint Solver (Look Ahead)
   * Scans flight plan for the next relevant altitude constraint.
   */
  // private solveVerticalConstraint(): number {
  //   let target = this.mcpAltitude;
  //   const currentAlt = this.aircraft.altitude;
  //   const mcpAlt = this.mcpAltitude;

  //   // Check Active Leg First
  //   if (this.aircraft.activeLeg && this.aircraft.activeLeg.altConstraint) {
  //     if (
  //       this.checkConstraintRelevance(
  //         this.aircraft.activeLeg,
  //         currentAlt,
  //         mcpAlt,
  //       )
  //     ) {
  //       return this.aircraft.activeLeg.altConstraint;
  //     }
  //   }

  //   // Look Ahead
  //   for (const leg of this.flightPlan) {
  //     if (leg.altConstraint) {
  //       if (this.checkConstraintRelevance(leg, currentAlt, mcpAlt)) {
  //         return leg.altConstraint;
  //       }
  //       // If constraint found but not relevant (e.g. satisfied ABOVE),
  //       // we might need to look further?
  //       // E.g. [ABOVE 6000] -> [AT 8000].
  //       // At 2000, MCP 10000.
  //       // ABOVE 6000: Relevant? (2000 < 6000). Yes, Floor.
  //       // But we want to climb THROUGH it.
  //       // If we allow "passing through" satisfy-able constraints, we continue.

  //       // If we are CLIMBING (MCP > current), and Constraint is ABOVE specific.
  //       // We can ignore it as a "stopping target" if MCP > Constraint?

  //       const type = leg.zConstraint || "AT";
  //       // Scan past satisfied constraints
  //       if (type === "ABOVE" && mcpAlt > leg.altConstraint) continue;
  //       if (
  //         type === "BELOW" &&
  //         mcpAlt < leg.altConstraint &&
  //         currentAlt < leg.altConstraint
  //       )
  //         continue;

  //       // If AT, it blocks.
  //       if (type === "AT") return leg.altConstraint;
  //     }
  //   }

  //   return target;
  // }

  private checkConstraintRelevance(
    leg: FlightLeg,
    currentAlt: number,
    mcpAlt: number,
  ): boolean {
    const type = leg.zConstraint || "AT";
    const constraint = leg.altConstraint;

    if (constraint === undefined) return false;

    // 1. AT constraints are always binding targets
    if (type === "AT") return true;

    // 2. BELOW constraints
    if (type === "BELOW") {
      // Relevant if we are ABOVE them (Must Descend)
      if (currentAlt > constraint + 100) return true;
      // Relevant if we are CLIMBING towards them (Must Cap)
      if (mcpAlt > constraint && currentAlt < constraint) return true;
    }

    // 3. ABOVE constraints
    if (type === "ABOVE") {
      // Relevant if we are BELOW them (Must Climb)
      if (currentAlt < constraint - 100) {
        // Only stop at it if MCP is NOT higher?
        if (mcpAlt > constraint) return false;
        return true;
      }
    }

    return false;
  }
  // } - Removed extra brace

  private manageProfiles(_dt: number) {
    // If Speed Mode is MANUAL, do not override
    if (this.speedMode !== "FMS") return;

    let limitSpeed = 999;
    const alt = this.aircraft.altitude;

    // 1. Altitude Based Schedule (Cruise vs Terminal)
    if (alt > 10000) {
      limitSpeed = this.aircraft.cruiseSpeed; // Use Aircraft specific cruise speed
    } else {
      limitSpeed = 250; // Below 10k
    }

    // 2. Climb Specific (Low Altitude Protection)
    // Only apply strict slow speed if we are actually in takeoff/initial climb phase
    const isClimbing = this.mcpAltitude > alt + 100;
    if (isClimbing && alt < 3000) {
      limitSpeed = 160;
    }

    // 3. Step Down Logic (Look Ahead)
    // Find limits in Active Leg OR Future Legs
    // let constraintFound = false; // Unused

    // Check Active Waypoint first
    if (this.aircraft.activeWaypoint?.speedLimit) {
      limitSpeed = Math.min(
        limitSpeed,
        this.aircraft.activeWaypoint.speedLimit,
      );
      // constraintFound = true;
    }

    // Iterate forward to find the *next* restriction if not found yet (or even if found, to be safe against lower future constraints?)
    // Actually, if active has 220, and next has 180, we should probably target 180 immediately?
    // "Step Down" usually implies meeting the next constraint.
    // Let's check future legs too.
    for (const leg of this.flightPlan) {
      if (leg.speedLimit) {
        limitSpeed = Math.min(limitSpeed, leg.speedLimit);
        // constraintFound = true;
        // As soon as we find *a* constraint, that is the "next" one we must adhere to.
        // We break because subsequent constraints (e.g. 200 after 210) don't matter until we pass the 210 one.
        break;
      }
    }

    // Apply
    this.aircraft.targetSpeed = limitSpeed;
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
          this.speedMode = "MANUAL"; // Disable FMS override
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
    this.flightPlan = [];
    this.activeLeg = null;
    this.aircraft.activeWaypoint = null;
  }

  public activateFlightPlan(
    plan: FlightLeg[],
    phase: "CLIMB" | "DESCENT" | "APPROACH",
    approachType?: string,
  ) {
    this.aircraft.activeWaypoint = null;
    this.aircraft.targetSpeed =
      phase === "CLIMB" ? 300 : phase === "DESCENT" ? 210 : 150;
    this.aircraft.targetAltitude =
      phase === "CLIMB" ? 35000 : phase === "DESCENT" ? 4000 : 4000;
    this.flightPlan = this.backAndForwardPropagateConstraints(
      plan,
      this.aircraft.targetSpeed,
      this.aircraft.targetAltitude,
    );
    this.activeLeg = this.flightPlan[0];

    if (approachType) {
      this.aircraft.approachType = approachType;
    }
    this.lateralMode = "LNAV";
    this.verticalMode = "VNAV";
    this.speedMode = "FMS"; // Added
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

  private backAndForwardPropagateConstraints(
    plan: FlightLeg[],
    targetSpeed: number,
    targetAlt: number,
  ): FlightLegTarget[] {
    const targets: FlightLegTarget[] = [];

    const calcConstraint = (
      current: number,
      target: number | undefined,
      constraint: "AT" | "ABOVE" | "BELOW" = "AT",
    ) => {
      if (target === undefined) return current;
      switch (constraint) {
        case "AT":
          return target;
        case "ABOVE":
          return Math.max(current, target);
        case "BELOW":
          return Math.min(current, target);
      }
    };

    if (plan.length === 0) return targets;

    let cs = targetSpeed;
    let ca = targetAlt;

    for (let i = plan.length - 1; i >= 0; i--) {
      console.log(`DEBUG: Propagating leg ${i}, plan length: ${plan.length}`);
      const leg = plan[i];

      // Update for previous leg (and THIS leg)
      cs = calcConstraint(cs, leg.speedLimit, "BELOW");
      ca = calcConstraint(ca, leg.altConstraint, leg.zConstraint);

      const target: FlightLegTarget = {
        ...leg,
        speed: cs,
        altitude: ca,
      };
      targets.unshift(target);
    }

    return targets;
  }
}
