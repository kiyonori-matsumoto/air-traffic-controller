import { GeoUtils } from "../utils/GeoUtils";

export class Runway {
  public id: string;
  public x: number; // 閾値（着陸地点）のX座標 (NM)
  public y: number; // 閾値のY座標 (NM)
  public heading: number; // 滑走路の方位 (度)
  public length: number; // 長さ (NM)

  constructor(
    id: string,
    x: number,
    y: number,
    heading: number,
    length: number = 2.0,
  ) {
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
  public isAligned(
    acX: number,
    acY: number,
    acAlt: number,
    acHeading: number,
  ): boolean {
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
    const distToThreshold = Math.sqrt(dx * dx + dy * dy);

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
    const angleToThreshold = (Math.atan2(dy, dx) * 180) / Math.PI;
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
  x: number; // NM (Calculated)
  y: number; // NM (Calculated)
  lat?: number; // Optional Lat
  lon?: number; // Optional Lon
  z?: number; // 指定高度 (ft)
  speedLimit?: number; // 制限速度 (kt)
}

export class Airport {
  public name: string;
  public runways: Runway[];
  public waypoints: Waypoint[] = [];
  public stars: { [name: string]: string[] } = {}; // STAR名 -> Waypoint名のリスト

  // RJTT Reference Point
  // Use Runway 34R Threshold as (0,0) match the visual Game.ts setup.
  // 34R Threshold: 353233.02N, 1394811.34E
  // -> 35.542506, 139.803150
  public centerLat: number;
  public centerLon: number;

  constructor(
    name: string,
    runways: Runway[],
    centerLat: number = 35.542506,
    centerLon: number = 139.80315,
  ) {
    this.name = name;
    this.runways = runways;
    this.centerLat = centerLat;
    this.centerLon = centerLon;

    // Mock Data for RJTT using Real Coordinates (Approx)
    // KAIHO: 35.496583, 139.876778
    // CAMYU: Simulated ILS Fix on 160 deg radial from 34R threshold.
    // 34R Threshold: Approx 35.534, 139.795
    // Let's use some approx real points or just derive them.

    // For strict realism we should calculate CAMYU from ILS geometry if it's not a real fix.
    // But CAMYU is a real fix (or similar).
    // Let's definition KAIHO, CAMYU, ADDUM, DAIGO with LatLng.

    const rawWaypoints = [
      // TT456: 345329.3N / 1401440.2E
      // 34 + 53/60 + 29.3/3600 = 34.891472
      // 140 + 14/60 + 40.2/3600 = 140.244500
      { name: "TT456", lat: 34.891472, lon: 140.2445 },

      // TT460: 344852.6N / 1401936.8E
      // 34 + 48/60 + 52.6/3600 = 34.814611
      // 140 + 19/60 + 36.8/3600 = 140.326889
      { name: "TT460", lat: 34.814611, lon: 140.326889 },

      // TT461: 350030.2N / 1402957.9E
      // 35 + 00/60 + 30.2/3600 = 35.008389
      // 140 + 29/60 + 57.9/3600 = 140.499417
      { name: "TT461", lat: 35.008389, lon: 140.499417 },

      // TT462: 351433.3N / 1402254.8E
      // 35 + 14/60 + 33.3/3600 = 35.242583
      // 140 + 22/60 + 54.8/3600 = 140.381889
      { name: "TT462", lat: 35.242583, lon: 140.381889 },

      // TT463: 352125.4N / 1402237.1E
      // 35 + 21/60 + 25.4/3600 = 35.357056
      // 140 + 22/60 + 37.1/3600 = 140.376972
      { name: "TT463", lat: 35.357056, lon: 140.376972 },

      // TT464: 352617.6N / 1401938.6E
      // 35 + 26/60 + 17.6/3600 = 35.438222
      // 140 + 19/60 + 38.6/3600 = 140.327389
      { name: "TT464", lat: 35.438222, lon: 140.327389 },

      // UMUKI: 351219.1N / 1394849.2E
      // 35 + 12/60 + 19.1/3600 = 35.205306
      // 139 + 48/60 + 49.2/3600 = 139.813667
      { name: "UMUKI", lat: 35.205306, lon: 139.813667 },

      // WEDGE: 350900.4N / 1395846.5E
      // 35 + 09/60 + 00.4/3600 = 35.150111
      // 139 + 58/60 + 46.5/3600 = 139.979583
      { name: "WEDGE", lat: 35.150111, lon: 139.979583 },

      // WALLY: 350120.1N / 1402138.6E
      // 35 + 01/60 + 20.1/3600 = 35.022250
      // 140 + 21/60 + 38.6/3600 = 140.360722
      { name: "WALLY", lat: 35.02225, lon: 140.360722 },

      // AKSEL: 344039.5N / 1395126.9E
      // 34 + 40/60 + 39.5/3600 = 34.677639
      // 139 + 51/60 + 26.9/3600 = 139.857472
      { name: "AKSEL", lat: 34.677639, lon: 139.857472 },

      // ARLON: 351525.3N / 1395859.8E
      // 35 + 15/60 + 25.3/3600 = 35.257028
      // 139 + 58/60 + 59.8/3600 = 139.983278
      { name: "ARLON", lat: 35.257028, lon: 139.983278, z: 4000 }, // 4000ft or above

      // CIVIC: 350840.6N / 1402552.1E
      // 35 + 08/60 + 40.6/3600 = 35.144611
      // 140 + 25/60 + 52.1/3600 = 140.431139
      {
        name: "CIVIC",
        lat: 35.144611,
        lon: 140.431139,
        z: 7000,
        speedLimit: 210,
      },

      // CLONE: 344357.8N / 1400856.0E
      // 34 + 43/60 + 57.8/3600 = 34.732722
      // 140 + 08/60 + 56.0/3600 = 140.148889
      { name: "CLONE", lat: 34.732722, lon: 140.148889 },

      // CREAM: 351743.4N / 1400612.4E
      // 35 + 17/60 + 43.4/3600 = 35.295389
      // 140 + 06/60 + 12.4/3600 = 140.103444 (Previously 140.003444 - Fixed)
      { name: "CREAM", lat: 35.295389, lon: 140.103444, z: 4000 },

      // EPSON: 353036.2N / 1401305.9E
      // 35 + 30/60 + 36.2/3600 = 35.510056
      // 140 + 13/60 + 05.9/3600 = 140.218306
      {
        name: "EPSON",
        lat: 35.510056,
        lon: 140.218306,
        z: 7000,
        speedLimit: 210,
      },

      // KAIHO: 351857.8N / 1394642.4E
      // 35 + 18/60 + 57.8/3600 = 35.316056
      // 139 + 46/60 + 42.4/3600 = 139.778444
      {
        name: "KAIHO",
        lat: 35.316056,
        lon: 139.778444,
        z: 6000,
        speedLimit: 230,
      },

      // TT454: 344844.8N / 1395725.3E
      // 34 + 48/60 + 44.8/3600 = 34.812444
      // 139 + 57/60 + 25.3/3600 = 139.957028
      { name: "TT454", lat: 34.812444, lon: 139.957028 },

      // TT455: 344946.2N / 1400635.3E
      // 34 + 49/60 + 46.2/3600 = 34.829500
      // 140 + 06/60 + 35.3/3600 = 140.109806 (Previously 140.009806? Checking...)
      // 140 + 6/60 + 35.3/3600 = 140 + 0.1 + 0.009805... = 140.109805...
      // Previous was 140.009806 -> 0.1 off again. Fixed.
      { name: "TT455", lat: 34.8295, lon: 140.109806 },
    ];

    this.waypoints = rawWaypoints.map((wp) => {
      const pos = GeoUtils.latLngToNM(
        wp.lat,
        wp.lon,
        this.centerLat,
        this.centerLon,
      );
      return {
        ...wp,
        x: pos.x,
        y: pos.y, // logic Y is North-positive (same as GeoUtils output). TrafficManager handles screen inversion.
      };
    });

    // Mock STAR
    this.stars = {
      AKSEL2C: [
        "AKSEL",
        "CLONE",
        "TT460",
        "TT461",
        "CIVIC",
        "TT462",
        "TT463",
        "TT464",
        "EPSON",
        "CREAM",
      ],
    };
  }

  getWaypoint(name: string): Waypoint | undefined {
    return this.waypoints.find((wp) => wp.name === name);
  }

  // Helper to add waypoint dynamically
  addWaypointLatLon(
    name: string,
    lat: number,
    lon: number,
    z?: number,
    spd?: number,
  ) {
    const pos = GeoUtils.latLngToNM(lat, lon, this.centerLat, this.centerLon);
    this.waypoints.push({
      name,
      lat,
      lon,
      x: pos.x,
      y: -pos.y,
      z,
      speedLimit: spd,
    });
  }
}
