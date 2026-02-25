const B737_800 = {
  id: "B737-800",
  category: "MEDIUM",
  weights: { oew: 41413, mtow: 79016, mlw: 66361, mzfw: 62732 },
  aerodynamics: {
    wing_area: 124.6,
    cd0_clean: 0.018,
    cd2_clean: 0.045,
    drag_flaps_full: 0.06,
    drag_gear: 0.02,
  },
  engines: { count: 2, max_thrust_sl: 121400, bypass_ratio: 5.1 },
  limits: {
    max_speed_vmo: 340,
    max_mach_mmo: 0.82,
    max_altitude: 41000,
    vmin_clean: 140,
    vmin_landing: 130,
  },
  dimensions: { length: 39.5, span: 35.8 },
};

const B777_300ER = {
  id: "B777-300ER",
  category: "HEAVY",
  weights: { oew: 167829, mtow: 351533, mlw: 251290, mzfw: 237682 },
  aerodynamics: {
    wing_area: 427.8,
    cd0_clean: 0.015,
    cd2_clean: 0.04,
    drag_flaps_full: 0.07,
    drag_gear: 0.025,
  },
  engines: { count: 2, max_thrust_sl: 512000, bypass_ratio: 9.0 },
  limits: {
    max_speed_vmo: 330,
    max_mach_mmo: 0.89,
    max_altitude: 43100,
    vmin_clean: 160,
    vmin_landing: 140,
  },
  dimensions: { length: 73.9, span: 64.8 },
};

function getDensity(h) {
  const rho0 = 1.225;
  const H = h * 0.3048;
  if (h > 36089) {
    return 0.3639 * Math.exp(-(9.80665 * (H - 11000)) / (287.05 * 216.65));
  }
  const T = 288.15 - 0.0065 * H;
  if (T <= 0) return 0;
  return rho0 * Math.pow(1 - (0.0065 * H) / 288.15, 4.256);
}

function getDrag(data, vKnots, h, mass) {
  const v = vKnots * 0.514444;
  const rho = getDensity(h);
  const S = data.aerodynamics.wing_area;
  const q = 0.5 * rho * v * v;
  if (q < 1) return 0;
  const CL = (mass * 9.80665) / (q * S);
  const CD =
    data.aerodynamics.cd0_clean + data.aerodynamics.cd2_clean * CL * CL;
  return q * S * CD;
}

function getMaxThrust(data, h, rating) {
  const rho = getDensity(h);
  const force = data.engines.count * data.engines.max_thrust_sl;
  return force * (rho / 1.225) * rating;
}

function getMaxClimbRate(data, vKnots, h, mass, rating) {
  const D = getDrag(data, vKnots, h, mass);
  const T = getMaxThrust(data, h, rating);
  const v = vKnots * 0.514444;
  const rc_ms_pot = ((T - D) * v) / (mass * 9.80665);
  const f_acc = h < 36089 ? 0.82 : 0.95;
  return rc_ms_pot * f_acc * 196.85;
}

function simulateClimb(data, rating) {
  let h = 0;
  let t = 0;
  let mass = data.weights.mtow * 0.85;
  let speedKnots = 160;

  while (h < 10000 && t < 1000) {
    if (h < 10000 && speedKnots < 250) {
      speedKnots += 0.5;
    }
    const vs_fpm = getMaxClimbRate(data, speedKnots, h, mass, rating);
    h += vs_fpm / 60;
    t += 1;
  }
  return { timeSeconds: t, timeMinutes: (t / 60).toFixed(2) };
}

console.log(`Setting Rating = 0.80`);
console.log(`B737-800: ${simulateClimb(B737_800, 0.8).timeMinutes} minutes`);
console.log(
  `B777-300ER: ${simulateClimb(B777_300ER, 0.8).timeMinutes} minutes`,
);

console.log(`Setting Rating = 0.60`);
console.log(`B737-800: ${simulateClimb(B737_800, 0.6).timeMinutes} minutes`);
console.log(
  `B777-300ER: ${simulateClimb(B777_300ER, 0.6).timeMinutes} minutes`,
);
