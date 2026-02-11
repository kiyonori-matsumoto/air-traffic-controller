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

    constructor(callsign: string, x: number, y: number, speed: number, heading: number, altitude: number) {
        this.callsign = callsign;
        this.x = x;
        this.y = y;
        this.speed = speed;
        this.heading = heading;
        this.altitude = altitude;
        this.targetHeading = heading;
        this.targetAltitude = altitude;
        this.targetSpeed = speed;
        this.turnRate = 3;
        this.climbRate = 50; // 約3000ft/min
        this.acceleration = 1; // 約1kt/s
    }

    // 毎フレームの計算 (dtは秒単位)
    update(dt: number) {

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

        // 1. 速度を秒速に変換 (kt / 3600)
        // 1kt = 1NM/h
        const speedNMPerSec = this.speed / 3600;

        // 2. 移動距離を計算 (NM)
        const distance = speedNMPerSec * dt;

        // 3. 角度をラジアンに変換
        // 元のロジック: 0度=下(y+), 90度=右(x+), 180度=上(y-), 270度=左(x-) ...?
        // JAL123 init: heading 180.
        // Screen usually: y increases downwards.
        // If x+=sin(theta), y+=cos(theta).
        // 0 -> x=0, y=1 (Down)
        // 90 -> x=1, y=0 (Right)
        // 180 -> x=0, y=-1 (Up)
        // 270 -> x=-1, y=0 (Left)
        // This matches standard mathematical angle if 0 is along Y axis pointing down? No.
        // Standard math: 0 is Right (X+).
        // Here: 0 is Down (Y+).
        // It seems consistent within the game provided Heading 180 means Flying Up.
        const angleRad = this.heading * (Math.PI / 180);

        // 4. X, Yを更新
        this.x += distance * Math.sin(angleRad);
        this.y += distance * Math.cos(angleRad);
    }
}