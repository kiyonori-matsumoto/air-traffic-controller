"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var AircraftPerformance_1 = require("./src/models/AircraftPerformance");
var perf = new AircraftPerformance_1.AircraftPerformance("B777-300ER");
var data = perf.getData();
// Let's simulate a climb from 0 to 10000 ft
var h = 0;
var t = 0; // seconds
var dt = 1; // 1 second step
var mass = data.weights.mtow * 0.9; // Assume 90% MTOW for takeoff
var speedKnots = 160; // Start at V2 roughly
var distance = 0; // nm
console.log("Time(s) | Alt(ft) | VS(fpm) | TAS(kt)");
while (h < 10000 && t < 1000) {
    if (t % 30 === 0) {
        console.log("".concat(t.toString().padStart(7), " | ").concat(Math.round(h).toString().padStart(7), " | ").concat(Math.round(perf.getMaxClimbRate(speedKnots, h, mass))
            .toString()
            .padStart(7), " | ").concat(Math.round(speedKnots).toString().padStart(7)));
    }
    // Assume accelerating to 250kts below 10k
    if (speedKnots < 250) {
        speedKnots += 1.0 * dt; // Roughly 1 knot per second accel
    }
    var vs_fpm = perf.getMaxClimbRate(speedKnots, h, mass);
    var vs_fps = vs_fpm / 60;
    h += vs_fps * dt;
    t += dt;
}
console.log("".concat(t.toString().padStart(7), " | ").concat(Math.round(h).toString().padStart(7), " | ").concat(Math.round(perf.getMaxClimbRate(speedKnots, h, mass))
    .toString()
    .padStart(7), " | ").concat(Math.round(speedKnots).toString().padStart(7)));
console.log("\nReaches 10,000 ft in ".concat(t, " seconds (").concat((t / 60).toFixed(2), " minutes)."));
