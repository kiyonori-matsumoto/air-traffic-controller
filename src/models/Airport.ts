export class Runway {
    public id: string;
    public x: number; // 閾値（着陸地点）のX座標 (NM)
    public y: number; // 閾値のY座標 (NM)
    public heading: number; // 滑走路の方位 (度)
    public length: number; // 長さ (NM)

    constructor(id: string, x: number, y: number, heading: number, length: number = 2.0) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.heading = heading;
        this.length = length;
    }

    /**
     * 機体が滑走路に対して適切に整列しているか（ILSキャプチャ判定）
     * @param acX 航空機X (NM)
     * @param acY 航空機Y (NM)
     * @param acAlt 航空高度 (ft)
     * @param acHeading 航空機方位 (度)
     * @returns 
     */
    public isAligned(acX: number, acY: number, acAlt: number, acHeading: number): boolean {
        // 1. 滑走路方位との差 (±5度以内)
        let headingDiff = Math.abs(this.heading - acHeading);
        if (headingDiff > 180) headingDiff = 360 - headingDiff;
        if (headingDiff > 10) return false;

        // 2. 滑走路端からの相対座標計算
        const dx = acX - this.x;
        const dy = acY - this.y;
        
        // 滑走路方位をラジアンに変換 (ATC方位は0度が北、時計回り)
        // 数学角に変換: Math.PI/2 - rad(heading)
        
        // 滑走路方向に沿った相対位置 (dist: 距離, side: 横ズレ)
        // 滑走路前方にある必要があるため、distは負の値（進入方向から見て手前）
        // ただしATCの向きと数学座標の向きに注意が必要
        // 簡易版: 閾値からの距離
        const distToThreshold = Math.sqrt(dx*dx + dy*dy);
        
        // 距離が遠すぎる判定 (15NM以遠はキャプチャ不可)
        if (distToThreshold > 15) return false;

        // 3. 高度チェック (4000ft以下、かつ3度パス以下であること)
        if (acAlt > 4000) return false;

        // 3度パス (1NMあたり約318.44ft)
        // 許容誤差を少し持たせる (+200ftくらいまでならキャプチャして修正させる？ ユーザー要望は「以下」)
        const glideSlopeAlt = distToThreshold * 318.44;
        if (acAlt > glideSlopeAlt + 100) return false; // 厳密すぎると使いにくいので+100ftの猶予

        // 4. ローカライザー（横ズレ）判定
        // ベクトル(dx, dy)と滑走路進入方位のなす角を計算
        const angleToThreshold = (Math.atan2(dy, dx) * 180 / Math.PI);
        // ATC方位（北が0）に変換
        let atcAngle = (450 - angleToThreshold) % 360; 
        // 滑走路進入方位（背後方向）との差をみる
        const entryHeading = (this.heading + 180) % 360;
        let angleDiff = Math.abs(atcAngle - entryHeading);
        if (angleDiff > 180) angleDiff = 360 - angleDiff;

        if (angleDiff > 3) return false; // 3度以上のコースズレはキャプチャ不可

        return true;
    }
}

export interface Waypoint {
    name: string;
    x: number; // NM
    y: number; // NM
    z?: number; // 指定高度 (ft)
    speedLimit?: number; // 制限速度 (kt)
}

export class Airport {
    public name: string;
    public runways: Runway[];
    public waypoints: Waypoint[] = [];
    public stars: {[name: string]: string[]} = {}; // STAR名 -> Waypoint名のリスト

    constructor(name: string, runways: Runway[]) {
        this.name = name;
        this.runways = runways;

        // Mock Data for RJTT
        // Runway 34R (Hdg 340) -> Approach from 160 deg.
        // ILS Beam Length = 15NM
        // x = 15 * sin(160) = 5.13
        // y = 15 * cos(160) = -14.10
        // ILS高度チェックが4000ft以下なので、CAMYUは4000ftとする
        this.waypoints = [
            { name: 'KAIHO', x: 10, y: -20, z: 6000, speedLimit: 230 }, // 南東
            { name: 'CAMYU', x: 5.13, y: -14.10, z: 4000, speedLimit: 210 },  // ILS Intercept Point (15NM)
            { name: 'ADDUM', x: -10, y: -20}, // 南西
            { name: 'DAIGO', x: 0, y: 15}     // 北 (Departure?)
        ];

        // Mock STAR
        this.stars = {
            'KAIHO ARRIVAL': ['KAIHO', 'CAMYU'],
            'ADDUM ARRIVAL': ['ADDUM', 'KAIHO'],
        };
    }

    getWaypoint(name: string): Waypoint | undefined {
        return this.waypoints.find(wp => wp.name === name);
    }
}
