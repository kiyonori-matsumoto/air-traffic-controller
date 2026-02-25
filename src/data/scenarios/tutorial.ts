import { Scenario } from "../../managers/SpawnManager";

export const tutorialScenario: Scenario = {
  clearCondition: {
    safeLandings: 1,
    successfulHandoffs: 1,
  },
  events: [
    // Arrival (JAL501) - 10000ft, 250kt, from NORTH_ARRIVAL
    {
      time: 0,
      flightId: "JAL501",
      model: "B777",
      type: "ARRIVAL",
      entryPoint: "NORTH_ARRIVAL",
      origin: "RJCC",
      destination: "RJTT",
      altitude: 10000,
      speed: 250,
      startDistance: 50,
      initialState: "RADAR_CONTACT",
    },
    // Departure (ANA30) - 0ft, 170kt, from RWY34R
    {
      time: 120, // Spawn 2 minutes later to give time to handle JAL501 initially
      flightId: "ANA30",
      model: "B787",
      type: "DEPARTURE",
      entryPoint: "RWY34R",
      origin: "RJTT",
      destination: "RJCC",
      altitude: 0,
      speed: 170,
      startDistance: 0,
      initialState: "RADAR_CONTACT",
      sid: "LAXAS4_34R",
    },
  ],
};
