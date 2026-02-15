import { Runway, Waypoint, FlightLeg } from "./Airport";
import { Autopilot } from "./Autopilot";

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

  public autopilot: Autopilot;

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
    // Autopilot Update (Calculates Targets, Profiles, LNAV)
    // Note: LNAV logic involves updateNavigation() called externally or via manageLNAV here?
    // Current design: manageLNAV is called by updateNavigation().
    // autopliot.update() handles Modes/Profiles.
    this.autopilot.update(dt);

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
