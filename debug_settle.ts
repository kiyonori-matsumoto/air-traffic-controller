console.log("Starting simulation script...");
import { Autopilot } from "./src/models/Autopilot";
import { Aircraft } from "./src/models/Aircraft";

// Mock Aircraft and Autopilot loop
const ac = new Aircraft("DEBUG", "B737", 0, 0, 250, 0, 5000, "RJTT", "RJCC");
ac.autopilot.setAltitude(12000);
ac.autopilot.verticalMode = "ALT";

const dt = 0.05; // 20Hz
console.log("Time | Alt | Error | VS Cmd | Integral");
for (let t = 0; t <= 100; t += dt) {
  ac.update(dt);
  if (Math.round(t * 100) % 500 === 0) {
    const error = 12000 - ac.altitude;
    const vsPID = (ac.autopilot as any).vsPID;
    console.log(
      `${t.toFixed(1)} | ${ac.altitude.toFixed(2)} | ${error.toFixed(2)} | ${ac.commandVs?.toFixed(2)} | ${vsPID.integral.toFixed(4)}`,
    );
  }
}
