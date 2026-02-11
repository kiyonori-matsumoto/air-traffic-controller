import { Runway } from "./Airport";

export class Aircraft {
    // 単位: NM(海里), ft(フィート), kt(ノット), deg(度)
    
    callsign: string;
    x: number; /// x座標(NM)
    y: number; /// y座標(NM)
    speed: number; /// 時速(kt)
    heading: number; /// 方角(deg)
    altitude: number; /// 高度(ft)

    targetHeading: number; /// 目標方角(deg)
    targetAltitude: number; /// 目標高度(ft)
    targetSpeed: number; /// 目標速度(kt)

    turnRate: number; /// 旋回率(deg/s)
    climbRate: number; /// 上昇・降下率(ft/s)
    acceleration: number; /// 加減速率(kt/s)
    wakeTurbulence: string; /// 後方乱気流区分 (H/M/L)
    separationStatus: 'NORMAL' | 'WARNING' | 'VIOLATION' = 'NORMAL';
    state: 'FLYING' | 'LANDING' | 'LANDED' = 'FLYING';
    
    // 航跡（トレール）用履歴
    history: {x: number, y: number}[] = [];
    private historyTimer: number = 0;
    private readonly HISTORY_INTERVAL = 5; // 5秒ごとに記録

    constructor(callsign: string, x: number, y: number, speed: number, heading: number, altitude: number, wakeTurbulence: string = 'M') {
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
    }

    // 距離計算 (NM)
    distanceTo(other: Aircraft): number {
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        return Math.sqrt(dx*dx + dy*dy);
    }

    // 垂直距離計算 (ft)
    verticalDistanceTo(other: Aircraft): number {
        return Math.abs(this.altitude - other.altitude);
    }

    // セパレーション状態の更新
    // 相手との距離から最も悪い状態を返す
    checkSeparation(other: Aircraft): 'NORMAL' | 'WARNING' | 'VIOLATION' {
        const dist = this.distanceTo(other); // NM
        const vDist = this.verticalDistanceTo(other); // ft

        // 垂直間隔が確保されていればOK (1000ft以上)
        if (vDist >= 1000) {
            return 'NORMAL';
        }

        // 垂直間隔がない場合、水平間隔をチェック
        if (dist < 5) { // 5NM未満 = 違反
            return 'VIOLATION';
        } else if (dist < 8) { // 8NM未満 = 警告
            return 'WARNING';
        }

        return 'NORMAL';
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

        // 2. 履歴（トレール）の更新
        this.historyTimer += dt;
        if (this.historyTimer >= this.HISTORY_INTERVAL) {
            this.history.unshift({x: this.x, y: this.y});
            if (this.history.length > 5) {
                this.history.pop();
            }
            this.historyTimer = 0;
        }
    }

    /**
     * 着陸ロジックの更新
     * @param runways 
     * @returns 引き続き radar に表示し続ける場合は true, 消去（着陸・離脱）する場合は false
     */
    updateLanding(runways: Runway[]): boolean {
        if (this.state === 'FLYING') {
            // ILSキャプチャ判定
            for (const rwy of runways) {
                if (rwy.isAligned(this.x, this.y, this.altitude, this.heading)) {
                    console.log(`${this.callsign} captured ILS ${rwy.id}`);
                    this.state = 'LANDING';
                    this.targetSpeed = 140; 
                    return true;
                }
            }
        } else if (this.state === 'LANDING') {
            // 現状は最初の滑走路で判定 (将来的に選択された滑走路を保持)
            const rwy = runways[0]; 
            const dx = this.x - rwy.x;
            const dy = this.y - rwy.y;
            const dist = Math.sqrt(dx*dx + dy*dy);

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
                this.state = 'LANDED';
                return false; 
            }
        }

        // 画面外（遠く）へ去った場合の除去
        const distFromCenter = Math.sqrt(this.x*this.x + this.y * this.y);
        if (distFromCenter > 100) {
            return false;
        }

        return true;
    }
}