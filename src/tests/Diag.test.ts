import { describe, it } from "vitest";
import { AircraftPerformance } from "../models/AircraftPerformance";

describe("Performance Diagnostic", () => {
  it("logs climb rates", () => {
    const models = ["B737", "B777"];
    const alts = [0, 10000, 20000, 30000, 35000];
    const speed = 250; // knots

    console.log("Current performance model diagnostic:");
    for (const modelId of models) {
      const perf = new AircraftPerformance(modelId);
      const data = perf.getData();
      const mass =
        data.weights.oew + 0.7 * (data.weights.mtow - data.weights.oew);
      console.log(`\nModel: ${modelId}, Mass: ${Math.round(mass)}kg`);
      console.log("Alt (ft) | Thrust (N) | Drag (N) | Max Climb Rate (fpm)");
      console.log("---------|------------|----------|---------------------");
      for (const alt of alts) {
        const thrust = perf.getMaxThrust(alt, speed);
        const drag = perf.getDrag(speed, alt, mass);
        const rc = perf.getMaxClimbRate(speed, alt, mass);
        console.log(
          `${alt.toString().padEnd(8)} | ${Math.round(thrust).toString().padEnd(10)} | ${Math.round(drag).toString().padEnd(8)} | ${Math.round(rc)}`,
        );
      }
    }
  });
});
