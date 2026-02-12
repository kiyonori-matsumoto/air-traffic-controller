import { Aircraft } from "./Aircraft";

export class Radar {
    public sweepAngle: number = 0; // 0-360 clockwise from North
    public rotationSpeed: number = 72; // degrees per second (360 / 5s)
    public range: number = 80; // detection range in NM

    constructor() {
    }

    update(dt: number) {
        const dAngle = this.rotationSpeed * dt;
        const prevAngle = this.sweepAngle;
        this.sweepAngle = (this.sweepAngle + dAngle) % 360;

        return { prevAngle, currentAngle: this.sweepAngle, wrapped: this.sweepAngle < prevAngle };
    }

    /**
     * Scan aircrafts and trigger history snapshot if the beam crossed them
     * @param aircrafts List of aircraft to scan
     * @param prevAngle Angle at start of frame
     * @param currentAngle Angle at end of frame
     */
    scan(aircrafts: Aircraft[], prevAngle: number, currentAngle: number) {
        // Handle wrap-around (e.g. 350 -> 10) by splitting into two checks if needed,
        // or just normalizing logic.
        // Easiest is to check if azimuth is in [prev, current].
        // If wrapped, check [prev, 360) AND [0, current].

        const isWrapped = currentAngle < prevAngle;

        aircrafts.forEach(ac => {
            // Calculate aircraft azimuth relative to center (0,0)
            // Coord system: North is Y+ (in logic? Wait, let's check Game.ts)
            // Game.ts: const sy = this.CY - (ac.logic.y * this.SCALE); // 北が Logic Y+
            // So Y+ is North. X+ is East.
            // Math.atan2(y, x) -> 0 is East (X+), 90 is North (Y+).
            // But standard atan2 returns radians from -PI to PI.
            // North (Y+) -> PI/2. East (X+) -> 0.
            
            // We want Azimuth 0 at North, Clockwise.
            // North (Y+) -> 0 deg
            // East (X+) -> 90 deg
            // South (Y-) -> 180 deg
            // West (X-) -> 270 deg

            // Math angle (rad):
            // Y+ (x=0, y=1) -> PI/2
            // X+ (x=1, y=0) -> 0
            
            // Conversion:
            // Deg = 90 - (MathRad * 180 / PI)
            // If result < 0, add 360.
            
            const mathRad = Math.atan2(ac.y, ac.x);
            let azimuth = 90 - (mathRad * 180 / Math.PI);
            if (azimuth < 0) azimuth += 360;

            let scanned = false;
            if (isWrapped) {
                // Crosses North
                if (azimuth >= prevAngle || azimuth <= currentAngle) {
                    scanned = true;
                }
            } else {
                if (azimuth >= prevAngle && azimuth <= currentAngle) {
                    scanned = true;
                }
            }

            if (scanned) {
                // Check Range
                const dist = Math.sqrt(ac.x * ac.x + ac.y * ac.y);
                if (dist <= this.range) {
                    ac.onRadarScan();
                }
            }
        });
    }
}
