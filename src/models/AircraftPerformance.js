"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AircraftPerformance = exports.PerformanceDatabase = void 0;
// Data from BADA / Public sources approximations
var B737_800 = {
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
        max_thrust_sl: 121400, // CFM56-7B27: ~27k lbf = 121kN
        bypass_ratio: 5.1,
    },
    limits: {
        max_speed_vmo: 340,
        max_mach_mmo: 0.82,
        max_altitude: 41000,
        vmin_clean: 140, // approximate at typical weight
        vmin_landing: 130,
    },
    dimensions: {
        length: 39.5,
        span: 35.8,
    },
};
var B777_300ER = {
    id: "B777-300ER",
    name: "Boeing 777-300ER",
    category: "HEAVY",
    weights: {
        oew: 167829,
        mtow: 351533,
        mlw: 251290,
        mzfw: 237682,
    },
    aerodynamics: {
        wing_area: 427.8,
        cd0_clean: 0.015,
        cd2_clean: 0.04,
        drag_flaps_full: 0.07,
        drag_gear: 0.025,
    },
    engines: {
        count: 2,
        max_thrust_sl: 512000, // GE90-115B: ~115k lbf = 512kN
        bypass_ratio: 9.0,
    },
    limits: {
        max_speed_vmo: 330,
        max_mach_mmo: 0.89,
        max_altitude: 43100,
        vmin_clean: 160,
        vmin_landing: 140,
    },
    dimensions: {
        length: 73.9,
        span: 64.8,
    },
};
var A320_200 = {
    id: "A320-200",
    name: "Airbus A320-200",
    category: "MEDIUM",
    weights: {
        oew: 42600,
        mtow: 78000,
        mlw: 66000,
        mzfw: 62500,
    },
    aerodynamics: {
        wing_area: 122.6,
        cd0_clean: 0.019,
        cd2_clean: 0.046,
        drag_flaps_full: 0.065,
        drag_gear: 0.022,
    },
    engines: {
        count: 2,
        max_thrust_sl: 118000, // CFM56-5B4: ~27k lbf
        bypass_ratio: 5.5,
    },
    limits: {
        max_speed_vmo: 350,
        max_mach_mmo: 0.82,
        max_altitude: 39800,
        vmin_clean: 135,
        vmin_landing: 125,
    },
    dimensions: {
        length: 37.6,
        span: 34.1,
    },
};
exports.PerformanceDatabase = {
    B737: B737_800,
    B738: B737_800,
    B777: B777_300ER,
    B77W: B777_300ER,
    A320: A320_200,
};
var AircraftPerformance = /** @class */ (function () {
    function AircraftPerformance(modelId) {
        this.data = exports.PerformanceDatabase[modelId] || exports.PerformanceDatabase["B737"]; // Default
    }
    // Get Air Density (kg/m^3) approx based on ISA
    // h: altitude in feet
    AircraftPerformance.prototype.getDensity = function (h) {
        var rho0 = 1.225; // Sea level density
        // Troposphere approx: rho = rho0 * (1 - 2.2558e-5 * H)^4.256
        // H in meters. 1 ft = 0.3048 m
        var H = h * 0.3048;
        if (h > 36089) {
            // Stratosphere
            // Simplified constant T model for stratosphere
            // T ~ 216.65K
            var rho_trop = 0.3639; // density at 11km
            var H_trop = 11000;
            return rho_trop * Math.exp(-(9.80665 * (H - H_trop)) / (287.05 * 216.65));
        }
        var T0 = 288.15;
        var L = 0.0065; // Lapse rate K/m
        var T = T0 - L * H;
        if (T <= 0)
            return 0; // space?
        return rho0 * Math.pow(1 - (L * H) / T0, 4.256);
    };
    // Calculate Drag Force (Newtons)
    // v: True Airspeed (TAS) in knots
    // h: Altitude in feet
    // mass: Current mass in kg
    // config: 'CLEAN' | 'FLAPS' | 'GEAR'
    AircraftPerformance.prototype.getDrag = function (vKnots, h, mass, config) {
        if (config === void 0) { config = "CLEAN"; }
        var v = vKnots * 0.514444; // m/s
        var rho = this.getDensity(h);
        var S = this.data.aerodynamics.wing_area;
        // Lift Coefficient CL = 2 * m * g / (rho * v^2 * S)
        var g = 9.80665;
        var q = 0.5 * rho * v * v; // Dynamic pressure
        if (q < 1)
            return 0; // Too slow
        var CL = (mass * g) / (q * S);
        // Drag Coefficient CD = CD0 + CD2 * CL^2
        var CD0 = this.data.aerodynamics.cd0_clean;
        if (config === "GEAR")
            CD0 += this.data.aerodynamics.drag_gear;
        if (config === "FLAPS")
            CD0 += this.data.aerodynamics.drag_flaps_full; // Simplified
        var CD = CD0 + this.data.aerodynamics.cd2_clean * CL * CL;
        // Drag = q * S * CD
        return q * S * CD;
    };
    // Calculate Max Thrust (Newtons) at altitude
    // Simple High-Bypass Turbofan model: Thrust drops with density/altitude
    AircraftPerformance.prototype.getMaxThrust = function (h, _vKnots) {
        var rho = this.getDensity(h);
        var rho0 = 1.225;
        // Thrust approx proportional to (rho/rho0)^1.0 for high bypass (More realistic than 0.7)
        // Also using ~90% of max takeoff thrust as "Max Continuous/Climb Thrust"
        var thrustFactor = Math.pow(rho / rho0, 1.0);
        var climbThrustRating = 0.92;
        // Total thrust = engines * thrust_per_engine
        return (this.data.engines.count *
            this.data.engines.max_thrust_sl *
            thrustFactor *
            climbThrustRating);
    };
    // Get max climb rate (fpm) at max climb thrust
    AircraftPerformance.prototype.getMaxClimbRate = function (vKnots, h, mass) {
        var D = this.getDrag(vKnots, h, mass);
        var T = this.getMaxThrust(h, vKnots);
        var v = vKnots * 0.514444; // m/s
        var g = 9.80665;
        // Unaccelerated climb rate (m/s)
        var rc_ms_pot = ((T - D) * v) / (mass * g);
        // Acceleration Factor (f_acc) for constant CAS climb:
        // As altitude increases, TAS increases for constant CAS.
        // This requires some potential energy to be diverted to kinetic energy.
        // f_acc = 1 / (1 + (v/g)*(dv/dh))
        // A typical approximation for subsonic transport in troposphere is f_acc ~ 0.8
        // In stratosphere it's different, but for now let's use a density-based gradient approximation.
        var f_acc = h < 36089 ? 0.82 : 0.95;
        var rc_ms = rc_ms_pot * f_acc;
        return rc_ms * 196.85; // Convert m/s -> fpm
    };
    // Speed of Sound (m/s) based on Temperature at altitude
    AircraftPerformance.prototype.getSpeedOfSound = function (h) {
        var H = h * 0.3048;
        var T0 = 288.15;
        var L = 0.0065;
        var T = T0 - L * H;
        if (H > 11000)
            T = 216.65; // ISA Stratosphere
        return Math.sqrt(1.4 * 287.05 * T);
    };
    // TAS to CAS conversion (Simplified)
    // CAS approx = TAS * sqrt(rho / rho0)
    AircraftPerformance.prototype.TAS_to_CAS = function (tas, h) {
        var rho = this.getDensity(h);
        var rho0 = 1.225;
        return tas * Math.sqrt(rho / rho0);
    };
    // CAS to TAS conversion
    AircraftPerformance.prototype.CAS_to_TAS = function (cas, h) {
        var rho = this.getDensity(h);
        var rho0 = 1.225;
        return cas / Math.sqrt(rho / rho0);
    };
    // TAS to Mach
    AircraftPerformance.prototype.TAS_to_Mach = function (tasKnots, h) {
        var v = tasKnots * 0.514444; // m/s
        var a = this.getSpeedOfSound(h);
        return v / a;
    };
    AircraftPerformance.prototype.getData = function () {
        return this.data;
    };
    return AircraftPerformance;
}());
exports.AircraftPerformance = AircraftPerformance;
