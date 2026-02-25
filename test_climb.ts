import { AircraftPerformance } from "./src/models/AircraftPerformance";

const perf = new AircraftPerformance("B777-300ER");
const data = perf.getData();

// Let's simulate a climb from 0 to 10000 ft
let h = 0;
let t = 0; // seconds
const dt = 1; // 1 second step
const mass = data.weights.mtow * 0.9; // Assume 90% MTOW for takeoff
let speedKnots = 160; // Start at V2 roughly
let distance = 0; // nm

console.log("Time(s) | Alt(ft) | VS(fpm) | TAS(kt)");

while (h < 10000 && t < 1000) {
  if (t % 30 === 0) {
    console.log(
      `${t.toString().padStart(7)} | ${Math.round(h).toString().padStart(7)} | ${Math.round(
        perf.getMaxClimbRate(speedKnots, h, mass),
      )
        .toString()
        .padStart(7)} | ${Math.round(speedKnots).toString().padStart(7)}`,
    );
  }

  // Assume accelerating to 250kts below 10k
  if (speedKnots < 250) {
    speedKnots += 1.0 * dt; // Roughly 1 knot per second accel
  }

  const vs_fpm = perf.getMaxClimbRate(speedKnots, h, mass);
  const vs_fps = vs_fpm / 60;

  h += vs_fps * dt;
  t += dt;
}

console.log(
  `${t.toString().padStart(7)} | ${Math.round(h).toString().padStart(7)} | ${Math.round(
    perf.getMaxClimbRate(speedKnots, h, mass),
  )
    .toString()
    .padStart(7)} | ${Math.round(speedKnots).toString().padStart(7)}`,
);

console.log(
  `\nReaches 10,000 ft in ${t} seconds (${(t / 60).toFixed(2)} minutes).`,
);
