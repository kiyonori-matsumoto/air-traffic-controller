import type { Autopilot } from "./Autopilot";
import { FlightLeg, Waypoint } from "./Airport";

export interface IAircraft {
  callsign: string;
  x: number;
  y: number;
  altitude: number;
  speed: number;
  heading: number;
  targetAltitude: number;
  targetSpeed: number;
  targetHeading: number;
  cruiseSpeed: number;
  flightPlan: FlightLeg[];
  activeLeg: FlightLeg | null;
  activeWaypoint: Waypoint | null;
  state: "FLYING" | "LANDING" | "LANDED" | "TAKEOFF" | "TAXI";
  approachType: string | null;
  autopilot: Autopilot;

  // Physics & Control
  mass?: number;
  bankAngle?: number;
  maxBankAngle?: number;
  climbRate?: number;

  // Commands from Autopilot
  commandBank?: number; // Target Bank Angle (deg)
  commandVs?: number; // Target Vertical Speed (fpm)
}
