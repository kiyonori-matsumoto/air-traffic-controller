import { Scenario } from "../../managers/SpawnManager";

export const stage2Scenario: Scenario = {
  clearCondition: {
    score: 1000,
  },
  events: [
    // --- RUSH HOUR TRAFFIC ---
    // Instead of spawning them all at SOUTH_ARRIVAL at 60NM, vary the distances and entry points slightly.

    // 1st Arrival (Leader)
    {
      time: 5,
      flightId: "JAL111",
      model: "B777",
      type: "ARRIVAL",
      entryPoint: "SOUTH_ARRIVAL",
      origin: "ROAH",
      destination: "RJTT",
      altitude: 10000,
      speed: 250,
      startDistance: 85,
      lateralOffset: -5, // Left of centerline
      star: "AKSEL2C",
    },
    // 2nd Arrival (Follower, converging from slightly further back)
    {
      time: 15,
      flightId: "ANA222",
      model: "B787",
      type: "ARRIVAL",
      entryPoint: "SOUTH_ARRIVAL",
      origin: "RJFF",
      destination: "RJTT",
      altitude: 12000,
      speed: 280,
      startDistance: 85,
      lateralOffset: 5, // Right of centerline (causes them to fly parallel initially)
      star: "AKSEL2C",
    },
    // 3rd Arrival (Converging from another angle, creating a merge conflict)
    {
      time: 25,
      flightId: "SKY333",
      model: "B737",
      type: "ARRIVAL",
      entryPoint: "EAST_ARRIVAL", // Same time frame, different angle
      origin: "RJFK",
      destination: "RJTT",
      altitude: 11000,
      speed: 260,
      startDistance: 85, // Starts at radar edge
      star: "AROSA2C", // They will merge near CREAM/EPSON
    },

    // Mix in some other traffic later to keep it busy
    {
      time: 60,
      flightId: "ADO444",
      model: "B737",
      type: "DEPARTURE",
      entryPoint: "RWY34R",
      origin: "RJTT",
      destination: "RJCC",
      altitude: 0,
      speed: 150,
      sid: "LAXAS4_34R",
    },
    {
      time: 90,
      flightId: "SFJ555",
      model: "A320",
      type: "ARRIVAL",
      entryPoint: "EAST_ARRIVAL",
      origin: "RJAA",
      destination: "RJTT",
      altitude: 8000,
      speed: 250,
      startDistance: 85,
      star: "AROSA2C",
    },
  ],
};
