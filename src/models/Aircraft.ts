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
        this.turnRate = 3;
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
}