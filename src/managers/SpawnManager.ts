import { TrafficManager } from "./TrafficManager";

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
}

export class SpawnManager {
  private spawnQueue: SpawnEvent[] = [];
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
      origins: ["RJFK", "RJFF", "ROAH"],
    }, // From South West
    {
      name: "EAST_ARRIVAL",
      bearing: 110,
      target: "TT456",
      origins: ["RJAA", "KLAX", "PHNL"],
    }, // From South East
    {
      name: "NORTH_ARRIVAL",
      bearing: 10,
      target: "CREAM",
      origins: ["RJCC", "RJGG", "UUWW"],
    }, // From North
  ];

  constructor(trafficManager: TrafficManager) {
    this.trafficManager = trafficManager;
  }

  public setMode(mode: "SCENARIO" | "RANDOM") {
    this.mode = mode;
    if (mode === "SCENARIO") {
      this.spawnQueue = []; // Clear current queue or keep it?
      this.loadDefaultScenario();
    }
  }

  public update(dt: number) {
    this.gameTime += dt;

    // Process Queue
    while (
      this.spawnQueue.length > 0 &&
      this.spawnQueue[0].time <= this.gameTime
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

    let x, y, heading;

    if (stream) {
      // Calculate spawn position 85NM out (slightly outside 80NM radar)
      const dist = 85;
      const rad = (stream.bearing - 90) * (Math.PI / 180); // Logic Angle to Rad
      x = Math.cos(rad) * dist;
      y = Math.sin(rad) * dist; // North is negative Y in Phaser, but positive in logic...
      // Wait, TrafficManager expects Logic Coordinates (NM, Y is North positive?).
      // Let's check Airport/TrafficManager.
      // Airport.ts: x/y from GeoUtils.latLngToNM.
      // GeoUtils: y is North positive.
      // So y should be positive if North.
      // Bearing 0 (North) -> sin(0-90) = -1. y = -dist (South??)
      // Math Angle 0 = East.
      // Bearing 0 = North.
      // Logic: X = dist * sin(bearing), Y = dist * cos(bearing).
      // Example: Bearing 0 -> X=0, Y=dist. Correct.
      // Example: Bearing 90 -> X=dist, Y=0. Correct.

      const bearingRad = stream.bearing * (Math.PI / 180);
      x = dist * Math.sin(bearingRad);
      y = dist * Math.cos(bearingRad);

      // Heading towards airport (reciprocal of bearing) or target?
      // Usually heading towards the first waypoint.
      // But for simplicity, let's just point reciprocal for now to ensure they enter sector.
      heading = (stream.bearing + 180) % 360;
    } else if (event.entryPoint === "DEBUG_CREAM") {
      // Custom Debug Spot: Near CREAM, Heading to CREAM
      // CREAM is approx South East. We spawn further South East.
      const cream = this.trafficManager.airport.getWaypoint("CREAM");
      if (cream) {
        // Heading to CREAM (North West-ish).
        // CREAM is at x,y.
        // Let's spawn 10NM South East (135 deg).
        // So dx = 10 * sin(135), dy = 10 * cos(135)
        // spawnX = cream.x + dx, spawnY = cream.y + dy
        // Heading = 315 (North West)

        const dist = 10;
        const angle = (135 * Math.PI) / 180;
        x = cream.x + Math.sin(angle) * dist;
        y = cream.y + Math.cos(angle) * dist; // Note: TrafficManager/Airport y is North-positive (after inversion logic fix)
        // Wait, Airport.ts y is now positive = North (from GeoUtils).
        // TrafficManager display inverts it (sy = cy - y).
        // So logic coordinates are standard math (Y=North).

        heading = 315;
      } else {
        x = 20;
        y = -20;
        heading = 315;
      }
    } else {
      // Fallback
      x = 0;
      y = -80;
      heading = 180;
    }

    // Create Aircraft via TrafficManager
    // Note: TrafficManager logic Y is North-positive.
    this.trafficManager.spawnAircraft({
      callsign: event.flightId,
      x: x,
      y: y,
      heading: heading,
      heading: heading,
      altitude: event.altitude,
      speed: event.speed,
      origin: event.origin,
      destination: event.destination || "RJTT", // Default destination if missing (though interface says string)
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

  private loadDefaultScenario() {
    // Simple Scenario
    const events: SpawnEvent[] = [
      {
        time: 1,
        flightId: "TEST01",
        model: "B737",
        type: "ARRIVAL",
        entryPoint: "DEBUG_CREAM",
        origin: "RJCC",
        destination: "RJTT",
        altitude: 4000,
        speed: 250,
      },
      {
        time: 5,
        flightId: "JAL101",
        model: "B777",
        type: "ARRIVAL",
        entryPoint: "SOUTH_ARRIVAL",
        origin: "ROAH",
        destination: "RJTT",
        altitude: 12000,
        speed: 300,
      },
      {
        time: 30,
        flightId: "ANA202",
        model: "B787",
        type: "ARRIVAL",
        entryPoint: "EAST_ARRIVAL",
        origin: "PHNL",
        destination: "RJTT",
        altitude: 11000,
        speed: 290,
      },
      {
        time: 80,
        flightId: "SKY303",
        model: "B737",
        type: "ARRIVAL",
        entryPoint: "SOUTH_ARRIVAL",
        origin: "RJFF",
        destination: "RJTT",
        altitude: 13000,
        speed: 310,
      },
      {
        time: 140,
        flightId: "JAL104",
        model: "A350",
        type: "ARRIVAL",
        entryPoint: "NORTH_ARRIVAL",
        origin: "RJCC",
        destination: "RJTT",
        altitude: 10000,
        speed: 280,
      },
    ];
    this.spawnQueue = events;
    this.spawnQueue.sort((a, b) => a.time - b.time);
  }
}
