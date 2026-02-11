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
        
        // 距離が遠すぎる、または近すぎる判定
        if (distToThreshold > 15 || distToThreshold < 0.2) return false;

        // 3. 高度チェック (3000ft以下)
        if (acAlt > 4000) return false;

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

export class Airport {
    public name: string;
    public runways: Runway[];

    constructor(name: string, runways: Runway[]) {
        this.name = name;
        this.runways = runways;
    }
}
