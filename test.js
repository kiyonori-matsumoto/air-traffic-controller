const B737_800 = {
  id: "B737-800",
  name: "Boeing 737-800",
  category: "MEDIUM",
  weights: {
    oew: 41413,
    mtow: 79016,
    mlw: 66361,
    mzfw: 62732,
  },
  aerodynamics: {
    wing_area: 124.6,
    cd0_clean: 0.018,
    cd2_clean: 0.045,
    drag_flaps_full: 0.06,
    drag_gear: 0.02,
  },
  engines: {
    count: 2,
    max_thrust_sl: 121400,
    bypass_ratio: 5.1,
  },
  limits: {
    max_speed_vmo: 340,
    max_mach_mmo: 0.82,
    max_altitude: 41000,
    vmin_clean: 140,
    vmin_landing: 130,
  },
  dimensions: {
    length: 39.5,
    span: 35.8,
  },
};

const data = B737_800;

function getDensity(h) {
  const rho0 = 1.225;
  const H = h * 0.3048;
  if (h > 36089) {
    const rho_trop = 0.3639;
    const H_trop = 11000;
    return rho_trop * Math.exp(-(9.80665 * (H - H_trop)) / (287.05 * 216.65));
  }
  const T0 = 288.15;
  const L = 0.0065;
  const T = T0 - L * H;
  if (T <= 0) return 0;

  return rho0 * Math.pow(1 - (L * H) / T0, 4.256);
}

function getDrag(vKnots, h, mass, config = "CLEAN") {
  const v = vKnots * 0.514444;
  const rho = getDensity(h);
  const S = data.aerodynamics.wing_area;

  const g = 9.80665;
  const q = 0.5 * rho * v * v;
  if (q < 1) return 0;

  const CL = (mass * g) / (q * S);

  let CD0 = data.aerodynamics.cd0_clean;
  if (config === "GEAR") CD0 += data.aerodynamics.drag_gear;
  if (config === "FLAPS") CD0 += data.aerodynamics.drag_flaps_full;

  const CD = CD0 + data.aerodynamics.cd2_clean * CL * CL;

  return q * S * CD;
}

function getMaxThrust(h, vKnots) {
  const rho = getDensity(h);
  const rho0 = 1.225;

  const thrustFactor = Math.pow(rho / rho0, 1.0);
  const climbThrustRating = 0.6; // Trial for 4.5 min to 10k ft

  return (
    data.engines.count *
    data.engines.max_thrust_sl *
    thrustFactor *
    climbThrustRating
  );
}

function getMaxClimbRate(vKnots, h, mass) {
  const D = getDrag(vKnots, h, mass);
  const T = getMaxThrust(h, vKnots);
  const v = vKnots * 0.514444;
  const g = 9.80665;

  const rc_ms_pot = ((T - D) * v) / (mass * g);
  const f_acc = h < 36089 ? 0.82 : 0.95;
  const rc_ms = rc_ms_pot * f_acc;

  return rc_ms * 196.85;
}

let h = 0;
let t = 0;
const dt = 1;

let mass = data.weights.mtow * 0.85;
let speedKnots = 160;

console.log("Time(s) | Alt(ft) | VS(fpm) | TAS(kt)");

while (h < 10000 && t < 1000) {
  if (t % 30 === 0) {
    console.log(
      `${t.toString().padStart(7)} | ${Math.round(h).toString().padStart(7)} | ${Math.round(
        getMaxClimbRate(speedKnots, h, mass),
      )
        .toString()
        .padStart(7)} | ${Math.round(speedKnots).toString().padStart(7)}`,
    );
  }

  if (h < 10000 && speedKnots < 250) {
    speedKnots += 0.5 * dt;
  }

  const vs_fpm = getMaxClimbRate(speedKnots, h, mass);
  const vs_fps = vs_fpm / 60;

  h += vs_fps * dt;
  t += dt;
}

console.log(
  `${t.toString().padStart(7)} | ${Math.round(h).toString().padStart(7)} | ${Math.round(
    getMaxClimbRate(speedKnots, h, mass),
  )
    .toString()
    .padStart(7)} | ${Math.round(speedKnots).toString().padStart(7)}`,
);

console.log(
  `\nReaches 10,000 ft in ${t} seconds (${(t / 60).toFixed(2)} minutes).`,
);
