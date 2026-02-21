import { AircraftPerformance } from "./src/models/AircraftPerformance";

const perf737 = new AircraftPerformance("B737");
const data737 = perf737.getData();
const mass737 =
  data737.weights.oew + 0.7 * (data737.weights.mtow - data737.weights.oew);

const alts = [0, 10000, 20000, 30000, 35000];
const speed = 250;

console.log("Improved Performance Model Diagnostic (B737):");
console.log("Alt (ft) | Thrust (N) | Drag (N) | Max Climb Rate (fpm)");
console.log("---------|------------|----------|---------------------");
for (const alt of alts) {
  const thrust = perf737.getMaxThrust(alt, speed);
  const drag = perf737.getDrag(speed, alt, mass737);
  const rc = perf737.getMaxClimbRate(speed, alt, mass737);
  console.log(
    `${alt.toString().padEnd(8)} | ${Math.round(thrust).toString().padEnd(10)} | ${Math.round(drag).toString().padEnd(8)} | ${Math.round(rc)}`,
  );
}
