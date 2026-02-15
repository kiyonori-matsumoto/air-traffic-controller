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

    if (angleDiff > 5) return false; // 5度以上のコースズレはキャプチャ不可

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
  zConstraint?: "AT" | "ABOVE" | "BELOW"; // 高度制限タイプ (Default: AT?)
  speedLimit?: number; // 制限速度 (kt)
}

export type FlightLeg =
  | {
      type: "VA"; // Vector to Altitude
      heading: number;
      altConstraint: number;
      zConstraint?: "AT" | "ABOVE" | "BELOW";
      speedLimit?: number;
    }
  | {
      type: "DF"; // Direct to Fix
      waypoint: string;
      altConstraint?: number;
      speedLimit?: number;
      zConstraint?: "AT" | "ABOVE" | "BELOW";
    }
  | {
      type: "TF"; // Track to Fix
      waypoint: string;
      altConstraint?: number;
      speedLimit?: number;
      zConstraint?: "AT" | "ABOVE" | "BELOW";
    };

export class Airport {
  public name: string;
  public runways: Runway[];
  public waypoints: Waypoint[] = [];
  public stars: { [name: string]: string[] } = {}; // STAR名 -> Waypoint名のリスト
  public sids: { [name: string]: FlightLeg[] } = {}; // SID名 -> FlightLegリスト
  public approaches: { [name: string]: string[] } = {}; // アプローチ名 -> Waypoint名のリスト

  // RJTT Reference Point
  // Use Runway 34R Threshold as (0,0) match the visual Game.ts setup.
  // 34R Threshold: 353233.02N, 1394811.34E
  // -> 35.542506, 139.803150
  public centerLat: number;
  public centerLon: number;
  public readonly magneticVariation: number = -7.9; // West 7 degrees (approx RJTT)

  constructor(
    name: string,
    centerLat: number = 35.542506,
    centerLon: number = 139.80315,
  ) {
    this.name = name;
    this.centerLat = centerLat;
    this.centerLon = centerLon;

    // Initialize Runways
    // MagVar = -7.9 (West). True Heading 329.88 -> Mag Heading 337.78
    const rwy34R = new Runway(
      "34R",
      0,
      0,
      329.88 - this.magneticVariation,
      1.5,
    );
    this.runways = [rwy34R];

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

      // CIVIC: 350840.6N / 1402552.1E
      // 35 + 08/60 + 40.6/3600 = 35.144611
      // 140 + 25/60 + 52.1/3600 = 140.431139
      {
        name: "CIVIC",
        lat: 35.144611,
        lon: 140.431139,
        z: 7000,
        speedLimit: 210,
        zConstraint: "AT",
      },

      // CLONE: 344357.8N / 1400856.0E
      // 34 + 43/60 + 57.8/3600 = 34.732722
      // 140 + 08/60 + 56.0/3600 = 140.148889
      { name: "CLONE", lat: 34.732722, lon: 140.148889 },

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
      {
        name: "GODIN",
        lat: 36.407028, // 36°24'25.3"N
        lon: 140.282194, // 140°16'55.9"E
      },
      {
        name: "CHIPS",
        lat: 36.21325, // 36°12'47.7"N
        lon: 140.243583, // 140°14'36.9"E
        z: 13000, // At or below 13000ft
        zConstraint: "BELOW",
      },
      {
        name: "COLOR",
        lat: 36.021194, // 36°01'16.3"N
        lon: 140.2055, // 140°12'19.8"E
        z: 11000, // At or below 11000ft
        zConstraint: "BELOW",
      },
      {
        name: "COPSE",
        lat: 35.783, // 35°46'58.8"N
        lon: 140.2015, // 140°12'05.4"E [cite: 359]
      },
      {
        name: "COACH",
        lat: 35.626667, // 35°37'36.0"N
        lon: 140.20875, // 140°12'31.5"E
        z: 8000, // At or Above 8000? Usually starts slowing down. Chart says At or Above 8000 usually.
        zConstraint: "ABOVE",
        speedLimit: 210, //
      },
      {
        name: "TT465",
        lat: 35.494222, // 35°29'39.2"N
        lon: 140.209833, // 140°12'35.4"E [cite: 359]
      },
      {
        name: "TT466",
        lat: 35.4275, // 35°25'39.0"N
        lon: 140.311139, // 140°18'40.1"E [cite: 359]
      },
      {
        name: "TT467",
        lat: 35.352833, // 35°21'10.2"N
        lon: 140.356778, // 140°21'24.4"E [cite: 359]
      },
      {
        name: "EDDIE",
        lat: 35.2465, // 35°14'47.4"N
        lon: 140.361361, // 140°21'40.9"E
        z: 8000, // At or Above 8000
        zConstraint: "ABOVE",
        speedLimit: 210, //
      },
      {
        name: "TT468",
        lat: 35.204556, // 35°12'16.4"N
        lon: 140.234056, // 140°14'02.6"E [cite: 359]
      },
      {
        name: "ANDEN",
        lat: 35.204972, // 35°12'17.9"N
        lon: 140.092972, // 140°05'34.7"E [cite: 359]
      },
      {
        name: "ARLON",
        lat: 35.257028, // 35°15'25.3"N
        lon: 139.983278, // 139°58'59.8"E
        z: 4000, // MHA 4000 (At or Above)
        zConstraint: "ABOVE",
      },
      {
        name: "UMUKI",
        lat: 35.205306, // 35°12'19.1"N
        lon: 139.813667, // 139°48'49.2"E
        z: 6000, // At or above 6000ft
        zConstraint: "ABOVE",
      },
      {
        name: "KAIHO",
        lat: 35.316056, // 35°18'57.8"N
        lon: 139.778444, // 139°46'42.4"E
        z: 4000, // MHA 4000
        zConstraint: "AT",
      },
      {
        name: "CREAM",
        lat: 35.295389, // 35°17'43.4"N
        lon: 140.103444, // 140°06'12.4"E
        z: 4000, // MHA 4000
        zConstraint: "AT",
      },
      {
        name: "CLOAK", // Intermediate Waypoint
        lat: 35.263333, // 35°15'48.0"N [cite: 392]
        lon: 140.035611, // 140°02'08.2"E [cite: 392]
        z: 4000,
        zConstraint: "AT",
      },
      {
        name: "CAMEL", // IF (Intermediate Fix)
        lat: 35.288389, // 35°17'18.2"N [cite: 394]
        lon: 139.982722, // 139°58'57.8"E [cite: 394]
        z: 4000, // 4000ft [cite: 450, 458]
        zConstraint: "AT",
      },
      {
        name: "CACAO", // FAF (Final Approach Fix)
        lat: 35.370225, // 35°22'12.81"N [cite: 431]
        lon: 139.925039, // 139°55'30.14"E [cite: 431]
        z: 4000, // 4000ft [cite: 450, 453]
        zConstraint: "AT",
      },
      // Departure Waypoints
      { name: "BASSA", lat: 35.352444, lon: 139.761722 },
      { name: "HOBBS", lat: 35.448306, lon: 139.761472 },
      { name: "IMOLA", lat: 35.073889, lon: 139.4975 },
      { name: "LAXAS", lat: 35.031417, lon: 139.242444 },
      { name: "LOCUP", lat: 35.455222, lon: 139.935694 },
      { name: "PIPER", lat: 35.166194, lon: 139.761667 },
      { name: "SATOL", lat: 35.103694, lon: 139.678722 },
      { name: "T6L21", lat: 35.444194, lon: 139.872778 },
      { name: "T6R11", lat: 35.43125, lon: 139.860333 },
      { name: "TAURA", lat: 35.312806, lon: 139.746472 },
      { name: "TT501", lat: 35.557972, lon: 139.841639 },
      { name: "TT502", lat: 35.540111, lon: 139.95575 },
    ];

    this.waypoints = rawWaypoints.map((wp) => {
      const pos = GeoUtils.latLngToNM(
        wp.lat,
        wp.lon,
        this.centerLat,
        this.centerLon,
        this.magneticVariation,
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
      GODIN2C: [
        "GODIN",
        "CHIPS",
        "COLOR",
        "COPSE",
        "COACH",
        "TT465",
        "TT466",
        "TT467",
        "EDDIE",
        "CREAM",
      ],
      EAST_STAR: [
        "TT456",
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

    this.sids = {
      // RWY 16R
      LAXAS4_16R: [
        { type: "VA", heading: 158, altConstraint: 500 },
        { type: "DF", waypoint: "T6R11" },
        { type: "TF", waypoint: "TAURA", altConstraint: 9000 },
        { type: "TF", waypoint: "IMOLA", altConstraint: 15000 },
        { type: "TF", waypoint: "LAXAS", altConstraint: 17000 },
      ],
      // RWY 16L
      LAXAS4_16L: [
        { type: "VA", heading: 158, altConstraint: 500 },
        { type: "DF", waypoint: "T6L21" },
        { type: "TF", waypoint: "TAURA", altConstraint: 9000 },
        { type: "TF", waypoint: "IMOLA", altConstraint: 15000 },
        { type: "TF", waypoint: "LAXAS", altConstraint: 17000 },
      ],
      // RWY 34L / 34R (Using 34R primarily)
      LAXAS4_34R: [
        { type: "VA", heading: 338, altConstraint: 700 },
        { type: "DF", waypoint: "TT502" },
        { type: "TF", waypoint: "LOCUP", altConstraint: 5000 },
        { type: "TF", waypoint: "TAURA", altConstraint: 9000 },
        { type: "TF", waypoint: "IMOLA", altConstraint: 15000 },
        { type: "TF", waypoint: "LAXAS", altConstraint: 17000 },
      ],
      // RWY 04
      LAXAS4_04: [
        { type: "VA", heading: 43, altConstraint: 700 },
        { type: "DF", waypoint: "TT502" },
        { type: "TF", waypoint: "LOCUP", altConstraint: 5000 },
        { type: "TF", waypoint: "TAURA", altConstraint: 9000 },
        { type: "TF", waypoint: "IMOLA", altConstraint: 15000 },
        { type: "TF", waypoint: "LAXAS", altConstraint: 17000 },
      ],
      // RWY 05
      LAXAS4_05: [
        { type: "VA", heading: 50, altConstraint: 500 },
        { type: "DF", waypoint: "TT501" },
        { type: "DF", waypoint: "TT502" },
        { type: "TF", waypoint: "LOCUP", altConstraint: 5000 },
        { type: "TF", waypoint: "TAURA", altConstraint: 9000 },
        { type: "TF", waypoint: "IMOLA", altConstraint: 15000 },
        { type: "TF", waypoint: "LAXAS", altConstraint: 17000 },
      ],
      // RWY 22
      LAXAS4_22: [
        { type: "VA", heading: 223, altConstraint: 600 },
        { type: "DF", waypoint: "HOBBS" },
        { type: "TF", waypoint: "BASSA" },
        { type: "TF", waypoint: "UMUKI" },
        { type: "TF", waypoint: "PIPER", altConstraint: 9000 },
        { type: "TF", waypoint: "SATOL" },
        { type: "TF", waypoint: "IMOLA", altConstraint: 15000 },
        { type: "TF", waypoint: "LAXAS", altConstraint: 17000 },
      ],
    };

    this.approaches = {
      ILSZ34R: ["CREAM", "CLOAK", "CAMEL", "CACAO"],
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
    zType?: "AT" | "ABOVE" | "BELOW",
  ) {
    const pos = GeoUtils.latLngToNM(
      lat,
      lon,
      this.centerLat,
      this.centerLon,
      this.magneticVariation,
    );
    this.waypoints.push({
      name,
      lat,
      lon,
      x: pos.x,
      y: pos.y,
      z,
      speedLimit: spd,
      zConstraint: zType,
    });
  }
}
