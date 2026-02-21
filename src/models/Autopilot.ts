import { IAircraft } from "./IAircraft";
import { FlightLeg, Waypoint, Runway } from "./Airport";
import { PIDController } from "../utils/PIDController";

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

  // PID Controllers
  // Kp=1.1, Ki=0.005, Kd=2.5 (Balanced tuning)
  private bankPID = new PIDController(2.5, 0.005, 2.5, -25, 25);
  // vsPID translates altitude error (ft) to target VS (fpm).
  // Kp=10 means for every 100ft error, we command 1000fpm.
  // We clamp output to reasonable values based on aircraft performance or mode.
  private vsPID = new PIDController(10.0, 0.05, 5.0, -3000, 4000);

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
    // 1. Update Modes (Transition Logic)
    this.updateModes();

    // 2. Calculate Targets based on Modes
    this.calculateLateral(dt);
    this.calculateVertical(dt);
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

  private calculateLateral(dt: number) {
    let targetHeading = this.mcpHeading;

    if (this.lateralMode === "HDG") {
      // Manual Heading
      targetHeading = this.mcpHeading;
      this.aircraft.targetHeading = targetHeading; // Keep for legacy/debug
    } else if (this.lateralMode === "LNAV") {
      // LNAV Logic: targetHeading comes from Navigation (Aircraft.updateNavigation sets Aircraft.targetHeading)
      // OR we can calculate it here if we want Autopilot to own it completely.
      // Currently Aircraft.updateNavigation calls manageLNAV which updates `activeLeg`.
      // BUT processLeg in Autopilot sets `aircraft.targetHeading`.
      // So aircraft.targetHeading IS the LNAV target.
      targetHeading = this.aircraft.targetHeading;
    } else if (this.lateralMode === "LOC" || this.lateralMode === "ROLLOUT") {
      // LOC Logic sets aircraft.targetHeading in manageApproach
      targetHeading = this.aircraft.targetHeading;
    }

    // PID Control Loop
    // Calculate Error (Shortest turn)
    let error = targetHeading - this.aircraft.heading;
    if (error > 180) error -= 360;
    if (error < -180) error += 360;

    // Determine Bank Command
    // If error is large, we saturate to max bank.
    // If error is small, we roll level.
    const bankCmd = this.bankPID.update(error, dt);

    // Set Command
    this.aircraft.commandBank = bankCmd;

    // Safety Fallback: If bankPID output is weird, clamping happens in PID.
  }

  public manageLNAV(airportWaypoints: Waypoint[]) {
    if (this.lateralMode !== "LNAV") return;
    if (this.flightPlan.length === 0 && !this.activeLeg) return;
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
      this.aircraft.targetHeading = leg.heading;
      if (this.aircraft.altitude >= leg.altConstraint) {
        this.activeLeg = null;
        this.aircraft.activeWaypoint = null;
      }
    } else if (leg.type === "TF" || leg.type === "DF") {
      if (!this.aircraft.activeWaypoint) {
        const wp = getWp(leg.waypoint);
        if (wp) {
          this.aircraft.activeWaypoint = wp;
        } else {
          this.activeLeg = null;
          return;
        }
      }

      const dx = this.aircraft.activeWaypoint.x - this.aircraft.x;
      const dy = this.aircraft.activeWaypoint.y - this.aircraft.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const mathRad = Math.atan2(dy, dx);
      const mathDeg = (mathRad * 180) / Math.PI;
      let targetH = 90 - mathDeg;
      if (targetH < 0) targetH += 360;
      this.aircraft.targetHeading = targetH;

      if (dist < 1.0) {
        this.activeLeg = null;
        this.aircraft.activeWaypoint = null;
      }
    }
  }

  private calculateVertical(dt: number) {
    let targetAlt = this.mcpAltitude;

    if (this.verticalMode === "GS" || this.verticalMode === "FLARE") {
      if (this.capturedRunway && this.aircraft.state === "LANDING") {
        const rwy = this.capturedRunway;
        const dx = this.aircraft.x - rwy.x;
        const dy = this.aircraft.y - rwy.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        targetAlt = Math.floor(dist * 318.44);

        // Glide slope capture logic: don't climb to catch it from below
        if (targetAlt > this.aircraft.altitude) {
          targetAlt = this.aircraft.altitude;
        }
      }
    } else if (
      this.verticalMode === "VNAV" ||
      this.verticalMode === "VNAV_ALT"
    ) {
      targetAlt = this.activeLeg?.altitude ?? this.mcpAltitude;
    }

    this.aircraft.targetAltitude = targetAlt;

    // PID Control for Vertical Speed
    const altError = targetAlt - this.aircraft.altitude;

    // Command VS based on altitude error
    let vsCmd = this.vsPID.update(altError, dt);

    // FLCH (Flight Level Change) logic override:
    // If climb, use full performance climb. If descent, use target VS.
    if (this.verticalMode === "FLCH" || this.verticalMode === "VNAV") {
      if (altError > 500) {
        // Command a very high VS, let Aircraft performance clamping handle it
        vsCmd = 6000;
      }
    }

    // Set Command
    this.aircraft.commandVs = vsCmd;
  }

  private manageProfiles(_dt: number) {
    // If Speed Mode is MANUAL, do not override
    if (this.speedMode !== "FMS") return;

    let targetCas = 250;
    const alt = this.aircraft.altitude;
    const perf = (this.aircraft as any).performance; // Cast to access performance if not in IAircraft

    // 1. Altitude Based Schedule (Mach vs CAS)
    // Transition usually around FL260-FL290
    if (alt > 26000) {
      // High altitude: Follow Mach profile (e.g. M0.78)
      const targetMach = 0.78;
      // Convert target Mach to TAS then CAS (Autopilot usually commands CAS/Mach)
      // For simplicity in this engine, targetSpeed is TAS for now.
      // But we should command a speed that results in the desired Mach.

      const speedOfSound = perf.getSpeedOfSound(alt);
      const targetTAS = (targetMach * speedOfSound) / 0.514444; // Knots
      targetCas = targetTAS; // Set as target TAS for now (as Aircraft uses TAS)

      // Polish: Aircraft.ts should probably be updated to use CAS/TAS properly.
      // For now, treat targetSpeed as commanded TAS.
    } else if (alt > 10000) {
      targetCas = this.aircraft.cruiseSpeed;
    } else {
      targetCas = 250; // Below 10k
    }

    // 2. Climb Specific (Low Altitude Protection)
    const isClimbing = this.mcpAltitude > alt + 100;
    if (isClimbing && alt < 3000) {
      targetCas = 160;
    }

    // 3. Waypoint Restrictions
    if (this.aircraft.activeWaypoint?.speedLimit) {
      targetCas = Math.min(targetCas, this.aircraft.activeWaypoint.speedLimit);
    }

    for (const leg of this.flightPlan) {
      if (leg.speedLimit) {
        targetCas = Math.min(targetCas, leg.speedLimit);
        break;
      }
    }

    this.aircraft.targetSpeed = targetCas;
  }

  private calculateSpeed() {
    if (this.speedMode === "MANUAL") {
      this.aircraft.targetSpeed = this.mcpSpeed;
    }
  }

  private capturedRunway: Runway | null = null;

  public manageApproach(runways: Runway[]): boolean {
    if (this.aircraft.state === "FLYING") {
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
          this.speedMode = "MANUAL";
          this.capturedRunway = rwy;
          return true;
        }
      }
    } else if (this.aircraft.state === "LANDING") {
      const rwy = this.capturedRunway;
      if (!rwy) {
        this.aircraft.state = "FLYING";
        return true;
      }

      const dx = this.aircraft.x - rwy.x;
      const dy = this.aircraft.y - rwy.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const rwyRad = (90 - rwy.heading) * (Math.PI / 180);
      const lateralOffset = -dx * Math.sin(rwyRad) + dy * Math.cos(rwyRad);
      const correction = lateralOffset * 40;
      this.aircraft.targetHeading = (rwy.heading + correction + 360) % 360;

      if (dist < 0.3 && this.aircraft.altitude < 150) {
        console.log(`${this.aircraft.callsign} landed!`);
        this.aircraft.state = "LANDED";
        this.verticalMode = "FLARE";
        return false;
      }
    }

    const distFromCenter = Math.sqrt(
      this.aircraft.x * this.aircraft.x + this.aircraft.y * this.aircraft.y,
    );
    if (distFromCenter > 100) {
      return false;
    }

    return true;
  }

  public setHeading(hdg: number) {
    this.mcpHeading = hdg;
    this.lateralMode = "HDG";
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
    this.speedMode = "FMS";
  }

  public setAltitude(alt: number) {
    this.mcpAltitude = alt;
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
      // console.log(`DEBUG: Propagating leg ${i}, plan length: ${plan.length}`);
      const leg = plan[i];
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
