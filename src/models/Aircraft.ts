import { Runway, Waypoint } from "./Airport";

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
    this.climbRate = 50; // 約3000ft/min
    this.acceleration = 1; // 約1kt/s

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
    // 1. 移動・旋回ロジック (既存)

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
    if (this.altitude !== this.targetAltitude) {
      const climbStep = this.climbRate * dt;
      const diff = this.targetAltitude - this.altitude;

      if (Math.abs(diff) < climbStep) {
        this.altitude = this.targetAltitude;
      } else if (diff > 0) {
        this.altitude += climbStep;
      } else {
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
  flightPlan: Waypoint[] = [];
  activeWaypoint: Waypoint | null = null;

  /**
   * ナビゲーションロジックの更新 (Route Following)
   */
  updateNavigation() {
    if (this.flightPlan.length === 0 && !this.activeWaypoint) return;

    // 次のウェイポイント設定
    if (!this.activeWaypoint && this.flightPlan.length > 0) {
      this.activeWaypoint = this.flightPlan.shift()!;
      console.log(
        `${this.callsign} proceeding direct to ${this.activeWaypoint.name}`,
      );
    }

    if (this.activeWaypoint) {
      const dx = this.activeWaypoint.x - this.x;
      const dy = this.activeWaypoint.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // 方位計算 (ATC Heading: 北0, 時計回り)
      // atan2(dy, dx) returns angle from X axis (East).
      // Math Heading needs transformation.
      // 0 deg (North) -> (0, 1) in math (if Y up)? No, Y is up in Math.
      // In our system: Y is North? No.
      // Let's check coord system:
      // Game.ts: const sy = this.CY - (ac.logic.y * this.SCALE); // 北が Logic Y+
      // So Y+ is North. X+ is East.
      // Heading 0 = North (Y+). Heading 90 = East (X+).
      // Math angle starts 0 at X+ and goes counter-clockwise.
      // so Math 0 = East (H90). Math 90 = North (H0).
      // Heading = 90 - MathDeg.

      const mathRad = Math.atan2(dy, dx);
      const mathDeg = (mathRad * 180) / Math.PI;
      let targetH = 90 - mathDeg;
      if (targetH < 0) targetH += 360;

      this.targetHeading = targetH;

      // 高度指定があれば適用
      if (this.activeWaypoint.z !== undefined) {
        this.targetAltitude = this.activeWaypoint.z;
      }

      // 速度制限があれば適用
      if (this.activeWaypoint.speedLimit !== undefined) {
        // 現在のターゲット速度が制限を超えていたら下げる
        // または、強制的にその速度にする？ "上限"なので超えてなければそのままでいいが
        // Route Flightとしては指定速度に合わせるのが一般的
        this.targetSpeed = this.activeWaypoint.speedLimit;
      }

      // 到達判定 (1NM以内)
      if (dist < 1.0) {
        console.log(`${this.callsign} reached ${this.activeWaypoint.name}`);
        this.activeWaypoint = null; // 次のフレームで次を取得
      }
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
