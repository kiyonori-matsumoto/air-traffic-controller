import { TrafficManager } from "./TrafficManager";
import { tutorialScenario } from "../data/scenarios/tutorial";
import { stage1Scenario } from "../data/scenarios/stage1";
import { stage2Scenario } from "../data/scenarios/stage2";

export interface SpawnEvent {
  time: number; // Seconds since game start
  flightId: string;
  model: string; // 'B777', 'A320' etc (for future use)
  type: "ARRIVAL" | "DEPARTURE";
  entryPoint: string; // Name of entry point or heading
  origin: string; // Origin Airport
  destination: string; // Name of first waypoint
  altitude: number;
  speed: number;
  startDistance?: number; // Distance from center
  lateralOffset?: number; // Offset left (negative) or right (positive) of the centerline
  initialState?: "RADAR_CONTACT";
  x?: number; // Override X (NM)
  y?: number; // Override Y (NM)
  heading?: number; // Override Heading
  initialWaypoint?: string; // Skip to this waypoint
  sid?: string; // SID Name (Departure)
  star?: string; // STAR Name (Arrival)
}

export interface Scenario {
  events: SpawnEvent[];
  clearCondition: {
    score?: number;
    safeLandings?: number;
    successfulHandoffs?: number;
  };
}

export class SpawnManager {
  private spawnQueue: SpawnEvent[] = [];
  private currentClearCondition: Scenario["clearCondition"] | null = null;
  private gameTime: number = 0;
  private trafficManager: TrafficManager;
  private mode: "SCENARIO" | "RANDOM" = "RANDOM";
  private lastRandomSpawn: number = 0;
  private randomInterval: number = 60; // Average seconds between spawns

  // Virtual Entry Points (Bearing from Airport Center, Distance 80NM)
  // We will calculate X/Y dynamically based on these.
  private static ENTRY_STREAMS = [
    {
      name: "SOUTH_ARRIVAL",
      bearing: 190,
      target: "AKSEL",
      star: "AKSEL2C",
      origins: ["RJFK", "RJFF", "ROAH"],
    }, // From South West
    {
      name: "EAST_ARRIVAL",
      bearing: 110,
      target: "AROSA",
      star: "AROSA2C",
      origins: ["RJAA", "KLAX", "PHNL"],
    }, // From South East
    {
      name: "NORTH_ARRIVAL",
      bearing: 10,
      target: "GODIN",
      star: "GODIN2C",
      origins: ["RJCC", "RJGG", "UUWW"],
    }, // From North
  ];

  private airport: import("../models/Airport").Airport;

  constructor(
    trafficManager: TrafficManager,
    airport: import("../models/Airport").Airport,
  ) {
    this.trafficManager = trafficManager;
    this.airport = airport;
  }

  public setMode(mode: "SCENARIO" | "RANDOM", scenarioId?: string) {
    this.mode = mode;
    if (mode === "SCENARIO") {
      this.spawnQueue = []; // Clear current queue or keep it?
      this.loadScenario(scenarioId || "STAGE_1");
    }
  }

  public update(dt: number) {
    this.gameTime += dt;

    // Process Queue
    while (
      this.spawnQueue.length > 0 &&
      this.spawnQueue[0].time <= this.gameTime + 0.1 // Tolerance
    ) {
      const event = this.spawnQueue.shift();
      if (event) {
        this.executeSpawn(event);
      }
    }

    // Random Generation
    if (this.mode === "RANDOM") {
      this.updateRandomGeneration(dt);
    }
  }

  private executeSpawn(event: SpawnEvent) {
    // Find stream definition if entryPoint matches a stream name
    const stream = SpawnManager.ENTRY_STREAMS.find(
      (s) => s.name === event.entryPoint,
    );

    let x = 0,
      y = 0,
      heading = 0;
    let sidName: string | undefined;

    if (event.type === "DEPARTURE") {
      sidName = event.sid || "LAXAS4_34R";
      heading = 337;

      const dist = event.startDistance || 0;
      if (dist > 0) {
        const hRad = heading * (Math.PI / 180);
        x = dist * Math.sin(hRad);
        y = dist * Math.cos(hRad);
      }
      // else 0,0
    } else if (stream) {
      // ARRIVAL
      const dist = event.startDistance || 85;

      // Look up the target waypoint (e.g., AKSEL, AROSA)
      const targetWp = this.airport.getWaypoint(stream.target);

      if (targetWp) {
        // We want the aircraft to spawn at a total distance of 'dist' (e.g., 85NM) from the AIRPORT CENTER,
        // but along the vector that passes through the target waypoint.
        // First, find distance of targetWp from center
        const wpDistFromCenter = Math.sqrt(
          targetWp.x * targetWp.x + targetWp.y * targetWp.y,
        );

        // The distance left to extend FROM the waypoint outwards
        const extensionDist = dist - wpDistFromCenter;

        const bearingRad = stream.bearing * (Math.PI / 180);

        // Position = WP position + (Direction * remaining Distance)
        if (extensionDist > 0) {
          x = targetWp.x + extensionDist * Math.sin(bearingRad);
          y = targetWp.y + extensionDist * Math.cos(bearingRad);
        } else {
          // Fallback if they wanted to spawn closer than the waypoint itself
          x = targetWp.x + 10 * Math.sin(bearingRad);
          y = targetWp.y + 10 * Math.cos(bearingRad);
        }

        // Apply Lateral Offset if provided (perpendicular to the bearing)
        // bearingRad is the angle FROM waypoint TO spawn point (outwards)
        // Adding Math.PI/2 (90 deg) gives the "Right" direction when looking INWARDS towards the airport
        // Actually, looking INWARDS (heading = bearing + 180), Right is "bearingRad - 90 deg"
        if (event.lateralOffset) {
          const rightRad = bearingRad - Math.PI / 2;
          x += event.lateralOffset * Math.sin(rightRad);
          y += event.lateralOffset * Math.cos(rightRad);
        }
      } else {
        // Fallback to airport center
        const bearingRad = stream.bearing * (Math.PI / 180);
        x = dist * Math.sin(bearingRad);
        y = dist * Math.cos(bearingRad);
      }

      heading = (stream.bearing + 180) % 360;
    } else {
      // Fallbacks...
      y = -80;
      heading = 180;
    }

    // Explicit override
    if (event.x !== undefined) x = event.x;
    if (event.y !== undefined) y = event.y;
    if (event.heading !== undefined) heading = event.heading;

    // Create Aircraft via TrafficManager
    this.trafficManager.spawnAircraft({
      callsign: event.flightId,
      model: event.model, // Pass model
      x: x,
      y: y,
      heading: heading,
      altitude: event.altitude,
      speed: event.speed,
      origin: event.origin,
      destination: event.destination || "RJTT",
      sid: event.type === "DEPARTURE" ? sidName : undefined,
      star: stream ? (stream as any).star : undefined,
      initialState: event.initialState,
      initialWaypoint: event.initialWaypoint,
    });
  }

  private updateRandomGeneration(_dt: number) {
    // Simple Poisson-like check or interval check
    if (this.gameTime > this.lastRandomSpawn + this.randomInterval) {
      // Random chance
      if (Math.random() < 0.3) {
        // Check every frame? No, checks every update?
        // Logic flaw: this function called every frame.
        // Should check simple timer.
        this.generateRandomEvent();
        this.lastRandomSpawn = this.gameTime;
        // Randomize next interval
        this.randomInterval = 45 + Math.random() * 60; // 45s - 105s
      }
    }
  }

  private generateRandomEvent() {
    const stream =
      SpawnManager.ENTRY_STREAMS[
        Math.floor(Math.random() * SpawnManager.ENTRY_STREAMS.length)
      ];
    const airlines = ["JAL", "ANA", "SKY", "SFJ", "ADO"];
    const flightNum = Math.floor(Math.random() * 900) + 100;
    const airline = airlines[Math.floor(Math.random() * airlines.length)];

    const origin =
      stream.origins[Math.floor(Math.random() * stream.origins.length)];

    const event: SpawnEvent = {
      time: this.gameTime + 1, // Spawn almost immediately
      flightId: `${airline}${flightNum}`,
      model: "B777",
      type: "ARRIVAL",
      entryPoint: stream.name,
      origin: origin,
      destination: "RJTT",
      altitude: 10000 + Math.floor(Math.random() * 5) * 1000, // 10000-14000
      speed: 280 + Math.floor(Math.random() * 4) * 10,
    };
    this.spawnQueue.push(event);
    // Sort queue?
    this.spawnQueue.sort((a, b) => a.time - b.time);
  }

  private loadScenario(scenarioId: string) {
    let scenario: Scenario | null = null;

    if (scenarioId === "TUTORIAL") {
      scenario = tutorialScenario;
    } else if (scenarioId === "STAGE_1") {
      scenario = stage1Scenario;
    } else if (scenarioId === "STAGE_2") {
      scenario = stage2Scenario;
    }

    if (scenario) {
      // Deep copy to prevent modifying the original imported arrays
      this.spawnQueue = JSON.parse(JSON.stringify(scenario.events));
      this.spawnQueue.sort((a, b) => a.time - b.time);
      this.currentClearCondition = scenario.clearCondition;
    }
  }

  public checkClearCondition(
    scoreManager: import("./ScoreManager").ScoreManager,
  ): boolean {
    if (!this.currentClearCondition) return false;

    const stats = scoreManager.getStats();

    if (
      this.currentClearCondition.score !== undefined &&
      stats.score < this.currentClearCondition.score
    ) {
      return false;
    }
    if (
      this.currentClearCondition.safeLandings !== undefined &&
      stats.safeLandings < this.currentClearCondition.safeLandings
    ) {
      return false;
    }
    if (
      this.currentClearCondition.successfulHandoffs !== undefined &&
      stats.successfulHandoffs < this.currentClearCondition.successfulHandoffs
    ) {
      return false;
    }

    return true; // All defined conditions met
  }
}
