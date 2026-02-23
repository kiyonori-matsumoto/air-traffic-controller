import { Runway, Waypoint, FlightLeg } from "./Airport";
import { Autopilot } from "./Autopilot";
import { AircraftPerformance } from "./AircraftPerformance";

export class Aircraft {
  // 単位: NM(海里), ft(フィート), kt(ノット), deg(度)

  callsign: string;
  x: number; /// x座標(NM)
  y: number; /// y座標(NM)
  speed: number; /// 時速(kt)
  heading: number; /// 方角(deg)
  altitude: number; /// 高度(ft)
  cruiseSpeed: number; /// 巡航速度(kt)

  // レーダー計測位置 (表示用)
  measuredX: number;
  measuredY: number;
  measuredHeading: number;
  measuredSpeed: number;

  targetHeading: number; /// 目標方角(deg)
  targetAltitude: number; /// 目標高度(ft)
  targetSpeed: number; /// 目標速度(kt)

  turnRate: number; /// 旋回率(deg/s)
  climbRate: number; /// 上昇・降下率(ft/s)
  acceleration: number; /// 加減速率(kt/s)
  wakeTurbulence: string; /// 後方乱気流区分 (H/M/L)
  separationStatus: "NORMAL" | "WARNING" | "VIOLATION" = "NORMAL";
  state: "FLYING" | "LANDING" | "LANDED" = "FLYING";
  ownership: "OWNED" | "UNOWNED" | "HANDOFF_OFFERED" | "HANDOFF_COMPLETE" =
    "UNOWNED";

  // 航跡（トレール）用履歴
  history: { x: number; y: number }[] = [];

  // 時刻管理 (Dateオブジェクト)
  scheduledArrivalTime: Date;
  estimatedArrivalTime: Date;

  // EFS用追加プロパティ
  squawk: string; // 4桁の数値文字列 (例: "1234")
  approachType: string; // 進入方式 (例: "ILS Z 34R", "VISUAL")
  origin: string;
  destination: string;

  // Autopilot Commands
  commandBank?: number;
  commandVs?: number;

  public autopilot: Autopilot;
  performance: AircraftPerformance;
  mass: number; // kg
  bankAngle: number = 0; // degrees, positive = right bank
  maxBankAngle: number = 25; // degrees

  constructor(
    callsign: string,
    model: string, // Added model
    x: number,
    y: number,
    speed: number,
    heading: number,
    altitude: number,
    origin: string,
    destination: string,
    wakeTurbulence: string = "M",
    cruiseSpeed: number = 300, // Default 300kt
  ) {
    this.callsign = callsign;
    this.x = x;
    this.y = y;
    this.speed = speed;
    this.heading = heading;
    this.altitude = altitude;
    this.wakeTurbulence = wakeTurbulence;
    this.cruiseSpeed = cruiseSpeed;
    this.targetHeading = heading;
    this.targetAltitude = altitude;
    this.targetSpeed = speed;
    this.turnRate = 3; // 旋回率(deg/s) - Now calculated dynamically
    this.climbRate = 0; // Now calculated dynamically
    this.acceleration = 1.0;

    // Initialize Performance Model
    this.performance = new AircraftPerformance(model);

    // Initialize Mass (Simplified: Takeoff Weight - some fuel)
    // Randomize slightly between OEW and MTOW
    const weights = this.performance.getData().weights;
    this.mass = weights.oew + 0.7 * (weights.mtow - weights.oew);

    this.autopilot = new Autopilot(this);

    // 初期状態では計測位置＝真の位置とする
    this.measuredX = x;
    this.measuredY = y;
    this.measuredHeading = heading;
    this.measuredSpeed = speed;

    // 仮のSTA設定 (現在時刻 + ランダムな時間)
    // 本来はシナリオから渡すべきだが、一旦ここで初期化
    const now = new Date();
    const flightTimeMin = 10 + Math.random() * 20; // 10-30分
    this.scheduledArrivalTime = new Date(now.getTime() + flightTimeMin * 60000);
    this.estimatedArrivalTime = new Date(this.scheduledArrivalTime); // 初期値はSTAと同じ

    // EFS初期化
    // ランダムなSquawk (1200, 7500, 7600, 7700を除く簡易生成)
    this.squawk = Math.floor(1000 + Math.random() * 6000).toString();
    this.approachType = "ILS Z 34R"; // デフォルト
    this.origin = origin;
    this.destination = destination;
  }

  // 距離計算 (NM)
  distanceTo(other: Aircraft): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // 垂直距離計算 (ft)
  verticalDistanceTo(other: Aircraft): number {
    return Math.abs(this.altitude - other.altitude);
  }

  // セパレーション状態の更新
  // 相手との距離から最も悪い状態を返す
  checkSeparation(other: Aircraft): "NORMAL" | "WARNING" | "VIOLATION" {
    const dist = this.distanceTo(other); // NM
    const vDist = this.verticalDistanceTo(other); // ft

    // 垂直間隔が確保されていればOK (1000ft以上)
    if (vDist >= 1000) {
      return "NORMAL";
    }

    // 垂直間隔がない場合、水平間隔をチェック
    if (dist < 5) {
      // 5NM未満 = 違反
      return "VIOLATION";
    } else if (dist < 8) {
      // 8NM未満 = 警告
      return "WARNING";
    }

    return "NORMAL";
  }

  // 毎フレームの計算 (dtは秒単位)
  update(dt: number) {
    // Autopilot Update
    this.autopilot.update(dt);

    // --- PHYSICS BASED MOVEMENT ---

    // 1. Lateral Physics (Turn Dynamics)
    // Calculate Heading Difference
    let diff = this.targetHeading - this.heading;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    // Determine Target Bank Angle
    const v_ms = this.speed * 0.514444;
    const g = 9.80665;

    let targetBankAngle = 0;

    if (this.commandBank !== undefined) {
      // Use Autopilot Control
      targetBankAngle = this.commandBank;
    } else {
      // Fallback or Manual Logic (Heading Diff)
      let desiredTurnRate = 0;
      if (Math.abs(diff) < 0.1) {
        desiredTurnRate = 0;
      } else {
        desiredTurnRate = diff * 0.5;
        const maxRate = 3.0; // Standard rate cap
        desiredTurnRate = Math.max(
          -maxRate,
          Math.min(maxRate, desiredTurnRate),
        );
      }

      // Convert to Target Bank Angle
      const omega = desiredTurnRate * (Math.PI / 180);
      const requiredBankRad = Math.atan((v_ms * omega) / g);
      targetBankAngle = requiredBankRad * (180 / Math.PI);
    }

    // Clamp Bank Angle
    targetBankAngle = Math.max(
      -this.maxBankAngle,
      Math.min(this.maxBankAngle, targetBankAngle),
    );

    // Roll Dynamics
    const rollRate = 5.0; // deg/s
    const rollStep = rollRate * dt;
    const bankDiff = targetBankAngle - this.bankAngle;

    if (Math.abs(bankDiff) < rollStep) {
      this.bankAngle = targetBankAngle;
    } else {
      this.bankAngle += Math.sign(bankDiff) * rollStep;
    }

    // Apply Turn (Heading Change) based on ACTUAL Bank Angle
    if (v_ms > 10) {
      const actualTurnRateRad =
        (g * Math.tan((this.bankAngle * Math.PI) / 180)) / v_ms;
      const actualTurnRateDeg = actualTurnRateRad * (180 / Math.PI);

      this.heading += actualTurnRateDeg * dt;
      this.heading = (this.heading + 360) % 360;
    }

    // 2. Vertical Physics (TEM - Total Energy Model)
    let targetClimbRate = 0;
    const maxClimbRate = this.performance.getMaxClimbRate(
      this.speed,
      this.altitude,
      this.mass,
    );
    const altDiff = this.targetAltitude - this.altitude;

    if (this.commandVs !== undefined) {
      // Use Autopilot Command
      targetClimbRate = this.commandVs;

      // "Snap to altitude" logic for Autopilot
      // If error is very small (< 1ft) and requested VS is slow, snap to target
      if (Math.abs(altDiff) < 1.0 && Math.abs(targetClimbRate) < 500) {
        targetClimbRate = 0;
        this.altitude = this.targetAltitude;
      }

      // Clamp to performance limits
      targetClimbRate = Math.min(targetClimbRate, maxClimbRate);
      targetClimbRate = Math.max(targetClimbRate, -3000); // Typical descent limit
    } else {
      // Manual/Fallback Logic
      if (Math.abs(altDiff) < 10) {
        targetClimbRate = 0;
        this.altitude = this.targetAltitude;
      } else if (altDiff > 0) {
        // Climb
        targetClimbRate = maxClimbRate;
        if (this.speed < this.targetSpeed - 5) {
          targetClimbRate *= 0.6; // Save energy for acceleration
        }
        if (altDiff < 1000) {
          targetClimbRate = Math.min(targetClimbRate, altDiff * 2);
          targetClimbRate = Math.max(targetClimbRate, 500);
        }
      } else {
        // Descent
        targetClimbRate = -2000; // Simplified descent
        if (Math.abs(altDiff) < 1000) {
          targetClimbRate = Math.max(targetClimbRate, -Math.abs(altDiff * 2));
        }
      }
    }

    this.climbRate = targetClimbRate;
    this.altitude += (this.climbRate / 60) * dt;

    // 3. Speed Physics (Simple Acceleration)
    if (this.speed !== this.targetSpeed) {
      // Acceleration limits
      let maxAcc = this.acceleration;
      if (this.climbRate > 1500) maxAcc *= 0.5;

      // High altitude damping (less power for acceleration)
      if (this.altitude > 25000) maxAcc *= 0.7;

      // Respect Aircraft Limits (Vmo/Mmo)
      const limits = this.performance.getData().limits;
      const speedOfSoundKt =
        this.performance.getSpeedOfSound(this.altitude) / 0.514444;
      const maxTAS = Math.min(
        limits.max_speed_vmo * 1.5,
        limits.max_mach_mmo * speedOfSoundKt,
      ); // Vmo is CAS, so we approx it to TAS

      const limitedTarget = Math.min(this.targetSpeed, maxTAS);

      const spdDiff = limitedTarget - this.speed;
      if (Math.abs(spdDiff) < maxAcc * dt) {
        this.speed = limitedTarget;
      } else {
        this.speed += Math.sign(spdDiff) * maxAcc * dt;
      }
    }

    // 4. Fuel Burn (Simplified)
    // Approx 2500kg/h for medium, 6000kg/h for heavy at cruise
    const baseFuelFlow =
      this.performance.getData().category === "HEAVY" ? 6000 : 2600;
    // Higher fuel flow during climb
    const fuelFlowFactor = this.climbRate > 500 ? 2.5 : 1.0;
    const fuelBurned = (baseFuelFlow / 3600) * fuelFlowFactor * dt;
    this.mass = Math.max(
      this.performance.getData().weights.oew,
      this.mass - fuelBurned,
    );

    // Position Update
    const speedNMPerSec = this.speed / 3600;
    const distanceId = speedNMPerSec * dt;
    const angleRad = this.heading * (Math.PI / 180);

    this.x += distanceId * Math.sin(angleRad);
    this.y += distanceId * Math.cos(angleRad);
  }

  /**
   * レーダースキャン時に呼び出される更新処理
   */
  onRadarScan() {
    // 計測位置を更新 (Visual Update)
    this.measuredX = this.x;
    this.measuredY = this.y;
    this.measuredHeading = this.heading;
    this.measuredSpeed = this.speed;

    // 履歴に追加
    this.history.unshift({ x: this.measuredX, y: this.measuredY });
    if (this.history.length > 5) {
      this.history.pop();
    }

    // ETA更新 (簡易計算: 残り距離 / 速度)
    // 羽田(RJTT)への距離と仮定 -> (0,0)への距離
    // 実際は滑走路への距離だが、簡易的に中心からの距離で計算
    const dist = Math.sqrt(this.x * this.x + this.y * this.y);
    if (this.speed > 0) {
      const timeHours = dist / this.speed;
      const timeMs = timeHours * 3600 * 1000;
      const now = new Date();
      this.estimatedArrivalTime = new Date(now.getTime() + timeMs);
    }
  }

  // フライトプラン (Waypointのキュー)
  flightPlan: FlightLeg[] = [];
  // activeLeg: FlightLeg | null = null;

  public get activeLeg(): FlightLeg | null {
    return this.autopilot.activeLeg;
  }

  activeWaypoint: Waypoint | null = null; // For TF/DF legs rendering checking

  /**
   * ナビゲーションロジックの更新 (Route Following)
   */
  updateNavigation(airportWaypoints: Waypoint[]) {
    this.autopilot.manageLNAV(airportWaypoints);
  }

  /**
   * 着陸ロジックの更新
   * @param runways
   * @returns 引き続き radar に表示し続ける場合は true, 消去（着陸・離脱）する場合は false
   */
  updateLanding(runways: Runway[]): boolean {
    return this.autopilot.manageApproach(runways);
  }
}
