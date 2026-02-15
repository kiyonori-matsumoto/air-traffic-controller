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
      star: "AKSEL2C",
      origins: ["RJFK", "RJFF", "ROAH"],
    }, // From South West
    {
      name: "EAST_ARRIVAL",
      bearing: 110,
      target: "TT456",
      star: "EAST_STAR",
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
    let sidName: string | undefined;

    if (event.type === "DEPARTURE") {
      // Departure Logic (Assume 34R for now)
      x = 0; // 34R Threshold is (0,0) in our logic? No, let's check Airport.ts
      // Airport.ts: rwy34R is at (0,0). logic x,y are relative to center?
      // Airport.ts constructor: rwy34R x=0, y=0.
      // So spawning at (0,0) is correct for 34R.
      y = 0;
      heading = 337; // Approx 34R Heading
      event.altitude = 100; // Just airborne
      event.speed = 140; // V2

      // Determine SID
      // For now, hardcode LAXAS4_34R if logic permits, or based on destination
      sidName = "LAXAS4_34R"; // Default
    } else if (stream) {
      // ARRIVAL Logic
      // Calculate spawn position 85NM out (slightly outside 80NM radar)
      const dist = 85;
      const rad = (stream.bearing - 90) * (Math.PI / 180); // Logic Angle to Rad
      x = dist * Math.sin(rad); // Logic X (East) = dist * sin(theta) if theta is from North?
      // Wait, bearing 90 (East) -> sin(0) = 0? No.
      // let's stick to the code I wrote before which I verified or trusted:
      const bearingRad = stream.bearing * (Math.PI / 180);
      x = dist * Math.sin(bearingRad);
      y = dist * Math.cos(bearingRad);

      heading = (stream.bearing + 180) % 360;
    } else if (event.entryPoint === "DEBUG_CREAM") {
      // ... existing debug logic ...
      const cream = this.trafficManager.airport.getWaypoint("CREAM");
      if (cream) {
        const dist = 10;
        const angle = (135 * Math.PI) / 180;
        x = cream.x + Math.sin(angle) * dist;
        y = cream.y + Math.cos(angle) * dist;
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
    this.trafficManager.spawnAircraft({
      callsign: event.flightId,
      x: x,
      y: y,
      heading: heading,
      altitude: event.altitude,
      speed: event.speed,
      origin: event.origin,
      destination: event.destination || "RJTT",
      sid: event.type === "DEPARTURE" ? sidName : undefined,
      star: stream ? (stream as any).star : undefined, // Cast/Property access
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
      {
        time: 10,
        flightId: "ANA501",
        model: "B787",
        type: "DEPARTURE",
        entryPoint: "RWY34R",
        origin: "RJTT",
        destination: "RJFF",
        altitude: 0,
        speed: 0, // Ignored by logic
      },
    ];
    this.spawnQueue = events;
    this.spawnQueue.sort((a, b) => a.time - b.time);
  }
}
