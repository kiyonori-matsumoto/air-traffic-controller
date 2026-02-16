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
  startDistance?: number; // Distance from center
  initialState?: "RADAR_CONTACT";
  x?: number; // Override X (NM)
  y?: number; // Override Y (NM)
  heading?: number; // Override Heading
  initialWaypoint?: string; // Skip to this waypoint
  sid?: string; // SID Name (Departure)
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
      // Calculate spawn position
      const dist = event.startDistance || 85;
      const bearingRad = stream.bearing * (Math.PI / 180);
      x = dist * Math.sin(bearingRad);
      y = dist * Math.cos(bearingRad);

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

  private loadDefaultScenario() {
    const events: SpawnEvent[] = [
      // --- INITIAL TRAFFIC (Time 0) ---
      // Distant Arrival (North)
      {
        time: 0,
        flightId: "JAL501",
        model: "B777",
        type: "ARRIVAL",
        entryPoint: "NORTH_ARRIVAL",
        origin: "RJCC",
        destination: "RJTT",
        altitude: 13000,
        speed: 280,
        startDistance: 60,
        // initialState: undefined // > 50NM -> HANDOFF_OFFERED (Yellow)
      },
      // Mid-range Arrival (South)
      {
        time: 0,
        flightId: "ANA240",
        model: "B787",
        type: "ARRIVAL",
        entryPoint: "SOUTH_ARRIVAL",
        origin: "RJFF",
        destination: "RJTT",
        altitude: 9000,
        speed: 250,
        startDistance: 40,
        initialState: "RADAR_CONTACT", // < 50NM -> Owned (White)
      },
      // Close-range Arrival (East)
      {
        time: 0,
        flightId: "SKY101",
        model: "B737",
        type: "ARRIVAL",
        entryPoint: "EAST_ARRIVAL",
        origin: "RJAA",
        destination: "RJTT",
        altitude: 6000,
        speed: 220,
        startDistance: 35,
        initialState: "RADAR_CONTACT", // < 50NM -> Owned (White)
      },
      // Departure (SFJ70) - Between LOCUP and TAURA
      {
        time: 0,
        flightId: "SFJ70",
        model: "A320",
        type: "DEPARTURE",
        entryPoint: "RWY34R",
        origin: "RJTT",
        destination: "RJFF",
        altitude: 6000,
        speed: 240,
        x: 2.0, // calculated
        y: -10.0, // calculated
        heading: 225,
        initialState: "RADAR_CONTACT",
        initialWaypoint: "TAURA",
      },
      // Departure rolling
      {
        time: 1,
        flightId: "ADO30",
        model: "B737",
        type: "DEPARTURE",
        entryPoint: "RWY34R",
        origin: "RJTT",
        destination: "RJCC",
        altitude: 0,
        speed: 170,
        startDistance: 0,
        initialState: "RADAR_CONTACT", // Departure -> Owned
        sid: "LAXAS4_34R",
      },

      // --- SCHEDULED TRAFFIC ---
      {
        time: 15,
        flightId: "APJ301",
        model: "A320",
        type: "ARRIVAL",
        entryPoint: "SOUTH_ARRIVAL",
        origin: "ROAH",
        destination: "RJTT",
        altitude: 12000,
        speed: 300,
      },
      {
        time: 30,
        flightId: "JJP550",
        model: "A320",
        type: "ARRIVAL",
        entryPoint: "NORTH_ARRIVAL",
        origin: "RJGG",
        destination: "RJTT",
        altitude: 11000,
        speed: 290,
      },
      {
        time: 45,
        flightId: "ANA109",
        model: "B777",
        type: "ARRIVAL",
        entryPoint: "EAST_ARRIVAL",
        origin: "KLAX",
        destination: "RJTT",
        altitude: 13000,
        speed: 300,
      },
      {
        time: 75,
        flightId: "SKY305",
        model: "B737",
        type: "ARRIVAL",
        entryPoint: "NORTH_ARRIVAL",
        origin: "RJCC",
        destination: "RJTT",
        altitude: 10000,
        speed: 270,
      },
      {
        time: 90,
        flightId: "JAL901",
        model: "A350",
        type: "ARRIVAL",
        entryPoint: "SOUTH_ARRIVAL",
        origin: "RJFK",
        destination: "RJTT",
        altitude: 13000,
        speed: 280,
      },
      {
        time: 120,
        flightId: "JAL111",
        model: "B767",
        type: "ARRIVAL",
        entryPoint: "EAST_ARRIVAL",
        origin: "PHNL",
        destination: "RJTT",
        altitude: 11000,
        speed: 290,
      },
      {
        time: 135,
        flightId: "SJO202",
        model: "B737",
        type: "DEPARTURE",
        entryPoint: "RWY34R",
        origin: "RJTT",
        destination: "ZSPD",
        altitude: 0,
        speed: 150,
      },
      {
        time: 165,
        flightId: "ANA221",
        model: "B787",
        type: "ARRIVAL",
        entryPoint: "SOUTH_ARRIVAL",
        origin: "ROAH",
        destination: "RJTT",
        altitude: 12000,
        speed: 300,
      },
    ];
    this.spawnQueue = events;
    this.spawnQueue.sort((a, b) => a.time - b.time);
  }
}
