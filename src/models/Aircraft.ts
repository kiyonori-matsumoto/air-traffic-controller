import { Runway, Waypoint, FlightLeg } from "./Airport";

export class Aircraft {
  // 単位: NM(海里), ft(フィート), kt(ノット), deg(度)

  callsign: string;
  x: number; /// x座標(NM)
  y: number; /// y座標(NM)
  speed: number; /// 時速(kt)
  heading: number; /// 方角(deg)
  altitude: number; /// 高度(ft)

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

  constructor(
    callsign: string,
    x: number,
    y: number,
    speed: number,
    heading: number,
    altitude: number,
    origin: string,
    destination: string,
    wakeTurbulence: string = "M",
  ) {
    this.callsign = callsign;
    this.x = x;
    this.y = y;
    this.speed = speed;
    this.heading = heading;
    this.altitude = altitude;
    this.wakeTurbulence = wakeTurbulence;
    this.targetHeading = heading;
    this.targetAltitude = altitude;
    this.targetSpeed = speed;
    this.turnRate = 3; // 旋回率(deg/s)
    this.climbRate = 35; // ~2100ft/min (Reduced from 50)
    this.acceleration = 1.0; // ~1kt/s (Reduced/Maintained)

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
    // Performance Management (Simple FMS)
    this.managePerformance(dt);

    // 1. 移動・旋回ロジック
    // 旋回チェック
    if (this.heading !== this.targetHeading) {
      const turnStep = this.turnRate * dt;

      // 右周りか左回りか
      let diff = this.targetHeading - this.heading;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;

      if (Math.abs(diff) < turnStep) {
        this.heading = this.targetHeading;
      } else if (diff > 0) {
        this.heading += turnStep;
      } else {
        this.heading -= turnStep;
      }

      this.heading = (this.heading + 360) % 360;
    }

    // 高度変更チェック
    // Acceleration reduces climb performance
    let currentClimbRate = this.climbRate;
    const isAccelerating = this.speed < this.targetSpeed - 5; // 5kt margin
    if (isAccelerating) {
      // Trade-off: 70% climb rate when accelerating
      currentClimbRate *= 0.7;
    }

    if (this.altitude !== this.targetAltitude) {
      const climbStep = currentClimbRate * dt;
      const diff = this.targetAltitude - this.altitude;

      if (Math.abs(diff) < climbStep) {
        this.altitude = this.targetAltitude;
      } else if (diff > 0) {
        this.altitude += climbStep;
      } else {
        // Descent is usually faster or same, not affected by thrust limit in same way but simplified
        this.altitude -= climbStep;
      }
    }

    // 速度変更チェック
    if (this.speed !== this.targetSpeed) {
      const accStep = this.acceleration * dt;
      const diff = this.targetSpeed - this.speed;

      if (Math.abs(diff) < accStep) {
        this.speed = this.targetSpeed;
      } else if (diff > 0) {
        this.speed += accStep;
      } else {
        this.speed -= accStep;
      }
    }

    const speedNMPerSec = this.speed / 3600;
    const distance = speedNMPerSec * dt;
    const angleRad = this.heading * (Math.PI / 180);

    this.x += distance * Math.sin(angleRad);
    this.y += distance * Math.cos(angleRad);
  }

  /**
   * Manage Speed/Climb Targets based on Altitude (Departure Logic)
   */
  private managePerformance(_dt: number) {
    // If manually controlled (Heading/Speed assigned by user), maybe skip?
    // For now, assume "Managed Mode" for Departures or until user intervenes.
    // We don't track "Mode" yet, so applying general limits.

    // DEPARTURE / CLIMB Logic
    // Check if we are in a climbing phase (Target Alt > Current Alt)
    if (this.targetAltitude > this.altitude + 100) {
      // Speed Schedule
      let limitSpeed = 999;

      if (this.altitude < 3000) {
        // Initial Climb: V2 + 10-20kt
        limitSpeed = 160;
      } else if (this.altitude < 10000) {
        // Below 10k: 250kt limit
        limitSpeed = 250;
      } else {
        // Above 10k: Cruise Climb
        limitSpeed = 300;
      }

      // Apply limit to Target Speed (if not manually set lower?)
      // Since we don't distinguish manual vs auto, we just set it.
      // Yet, let's respect Waypoint limit if active.
      if (this.activeWaypoint && this.activeWaypoint.speedLimit) {
        limitSpeed = Math.min(limitSpeed, this.activeWaypoint.speedLimit);
      }

      // Gently increase target speed if current target is lower than limit
      // AND we are not constrained by user.
      // Simplified: Always set target speed to limit for departures.
      // How to know if departure? Squawk? Origin?
      // Using a simple heuristic: if climbing significantly.
      this.targetSpeed = limitSpeed;
    }
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
  activeLeg: FlightLeg | null = null;
  activeWaypoint: Waypoint | null = null; // For TF/DF legs rendering checking

  processLeg(leg: FlightLeg, airportWaypoints: Waypoint[]) {
    // Helper to find waypoint
    const getWp = (name: string) =>
      airportWaypoints.find((w) => w.name === name);

    if (leg.type === "VA") {
      // Vector to Altitude
      this.targetHeading = leg.heading;

      // Altitude Constraint
      if (leg.altConstraint) {
        // If exact constraint (AT), force target
        if (leg.zConstraint === "AT") {
          this.targetAltitude = leg.altConstraint;
        }
        // If BELOW constraint, and we are above, descend.
        else if (leg.zConstraint === "BELOW") {
          if (this.targetAltitude > leg.altConstraint) {
            this.targetAltitude = leg.altConstraint;
          }
          // Also force if current altitude is way above?
          // Usually we just set target.
        }
        // If ABOVE constraint, and we are below, climb (or maintain).
        else if (leg.zConstraint === "ABOVE") {
          if (this.targetAltitude < leg.altConstraint) {
            this.targetAltitude = leg.altConstraint;
          }
        }
        // Default (Legacy behavior or unspecified):
        // For Arrivals (usually descent): If target > constraint, descend?
        // Or "At or Above" is common default.
        // Let's assume default is "AT" for safety if not specified?
        // Previously we just ignored it or user complained it was "At or Above".
        // Let's defaulted to AT if undefined, or keep current behavior?
        // Current behavior didn't use it.
        // Let's default to AT for TF legs if not specified,
        // but only if we are in "Managed Mode" (Arrival/Departure).
        else {
          // Default: AT or ABOVE logic?
          // User complained "All became designated or above".
          // So likely we want to respect it as AT if no type constraint?
          // Let's treat as AT for now.
          this.targetAltitude = leg.altConstraint;
        }
      }
      // Continue until altitude reached
      if (this.altitude >= leg.altConstraint) {
        console.log(
          `${this.callsign} reached VA altitude ${leg.altConstraint}`,
        );
        this.activeLeg = null; // Move to next
        this.activeWaypoint = null;
      }
    } else if (leg.type === "TF" || leg.type === "DF") {
      // Track/Direct to Fix
      if (!this.activeWaypoint) {
        const wp = getWp(leg.waypoint);
        if (wp) {
          this.activeWaypoint = wp;
          console.log(`${this.callsign} proceeding to ${wp.name}`);
        } else {
          console.warn(`Waypoint ${leg.waypoint} not found!`);
          this.activeLeg = null; // Skip
          return;
        }
      }

      const dx = this.activeWaypoint.x - this.x;
      const dy = this.activeWaypoint.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Heading Calc
      const mathRad = Math.atan2(dy, dx);
      const mathDeg = (mathRad * 180) / Math.PI;
      let targetH = 90 - mathDeg;
      if (targetH < 0) targetH += 360;
      this.targetHeading = targetH;

      // Speed Limit
      if ((leg.type === "TF" || leg.type === "DF") && leg.speedLimit) {
        // Force speed to limit if we are faster?
        // Or just set it as a target?
        // User expects deceleration.
        if (this.targetSpeed > leg.speedLimit) {
          this.targetSpeed = leg.speedLimit;
        }
      }

      // Altitude Constraint
      if ((leg.type === "TF" || leg.type === "DF") && leg.altConstraint) {
        // Apply Constraint Logic
        if (leg.zConstraint === "AT") {
          this.targetAltitude = leg.altConstraint;
        } else if (leg.zConstraint === "BELOW") {
          if (this.targetAltitude > leg.altConstraint) {
            this.targetAltitude = leg.altConstraint;
          }
        } else if (leg.zConstraint === "ABOVE") {
          if (this.targetAltitude < leg.altConstraint) {
            this.targetAltitude = leg.altConstraint;
          }
        } else {
          // Default to AT (User Preference)
          this.targetAltitude = leg.altConstraint;
        }
      }

      // Reached?
      if (dist < 1.0) {
        console.log(`${this.callsign} reached ${this.activeWaypoint.name}`);
        this.activeLeg = null;
        this.activeWaypoint = null;
      }
    }
  }

  /**
   * ナビゲーションロジックの更新 (Route Following)
   */
  updateNavigation(airportWaypoints: Waypoint[]) {
    if (this.flightPlan.length === 0 && !this.activeLeg) return;

    if (!this.activeLeg && this.flightPlan.length > 0) {
      this.activeLeg = this.flightPlan.shift()!;
    }

    if (this.activeLeg) {
      this.processLeg(this.activeLeg, airportWaypoints);
    }
  }

  /**
   * 着陸ロジックの更新
   * @param runways
   * @returns 引き続き radar に表示し続ける場合は true, 消去（着陸・離脱）する場合は false
   */
  updateLanding(runways: Runway[]): boolean {
    if (this.state === "FLYING") {
      // ILSキャプチャ判定
      for (const rwy of runways) {
        if (rwy.isAligned(this.x, this.y, this.altitude, this.heading)) {
          console.log(`${this.callsign} captured ILS ${rwy.id}`);
          this.state = "LANDING";
          this.targetSpeed = 140;
          return true;
        }
      }
    } else if (this.state === "LANDING") {
      // 現状は最初の滑走路で判定 (将来的に選択された滑走路を保持)
      const rwy = runways[0];
      const dx = this.x - rwy.x;
      const dy = this.y - rwy.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // 1. Glide Slope (3度パス)
      const idealAlt = Math.floor(dist * 318.44);
      if (idealAlt > this.altitude) {
        this.targetAltitude = this.altitude;
      } else {
        this.targetAltitude = idealAlt;
      }

      // 2. Localizer (横方向の整列)
      const rwyRad = (90 - rwy.heading) * (Math.PI / 180);
      const lateralOffset = -dx * Math.sin(rwyRad) + dy * Math.cos(rwyRad);

      // 横ズレを修正するターゲット方位を計算
      // lateralOffsetがマイナス（右ズレ）なら、方位を減らす（左へ向ける）
      const correction = lateralOffset * 40;
      this.targetHeading = (rwy.heading + correction + 360) % 360;

      // 接地判定
      if (dist < 0.3 && this.altitude < 150) {
        console.log(`${this.callsign} landed!`);
        this.state = "LANDED";
        return false;
      }
    }

    // 画面外（遠く）へ去った場合の除去
    const distFromCenter = Math.sqrt(this.x * this.x + this.y * this.y);
    if (distFromCenter > 100) {
      return false;
    }

    return true;
  }
}
