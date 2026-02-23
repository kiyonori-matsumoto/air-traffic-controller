import { describe, it, expect } from "vitest";
import { PIDController } from "../utils/PIDController";

describe("PIDController", () => {
  it("should implement anti-windup via clamping", () => {
    // Kp=1, Ki=1, Kd=0, Min=-10, Max=10
    const pid = new PIDController(1, 1, 0, -10, 10);

    // 1. Update with small error (no saturation)
    // Error=2, dt=1.0
    // P = 1 * 2 = 2
    // I = 1 * (2 * 1.0) = 2
    // Output = 4 (Less than 10)
    pid.update(2, 1.0);
    expect((pid as any).integral).toBe(2);

    // 2. Update with large error (causes saturation)
    // Error=20, dt=1.0
    // P = 20
    // I = 1 * (2 + 20) = 22
    // Raw Output = 42 -> Clamped to 10
    // signs: error(20) is +, rawOutput(42) is +. Revert integral change.
    pid.update(20, 1.0);
    expect((pid as any).integral).toBe(2); // Should remain at previous value (2)

    // 3. Update with negative error (reduces saturation)
    // Error=-5, dt=1.0
    // P = -5
    // I = 1 * (2 - 5) = -3
    // Raw Output = -8 -> No saturation
    pid.update(-5, 1.0);
    expect((pid as any).integral).toBe(-3);
  });
});
