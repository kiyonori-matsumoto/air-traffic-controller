export interface AirspaceSector {
  name: string;
  points: {lat: number, lon: number}[];
  upperLimitFeet: number;
  lowerLimitFeet: number;
  lowerExclusive: boolean;
}

export const TOKYO_CTRL_SECTORS: AirspaceSector[] = [
  {
    name: "Sector_North_13000",
    points: [{lat: 36.57472222222223, lon: 140.2213888888889}, {lat: 36.63111111111111, lon: 140.32694444444445}, {lat: 36.60305555555556, lon: 140.4361111111111}, {lat: 36.59638888888889, lon: 140.435}, {lat: 36.57472222222223, lon: 140.2213888888889}],
    upperLimitFeet: 24000,
    lowerLimitFeet: 13000,
    lowerExclusive: true
  },
  {
    name: "Sector_North_Corner_10000",
    points: [{lat: 36.60305555555556, lon: 140.4361111111111}, {lat: 36.59444444444445, lon: 140.47}, {lat: 36.59638888888889, lon: 140.435}, {lat: 36.60305555555556, lon: 140.4361111111111}],
    upperLimitFeet: 24000,
    lowerLimitFeet: 10000,
    lowerExclusive: true
  },
  {
    name: "Sector_North_West_4000",
    points: [{lat: 36.420833333333334, lon: 139.9425}, {lat: 36.57472222222223, lon: 140.2213888888889}, {lat: 36.222500000000004, lon: 140.15833333333333}, {lat: 36.10638888888889, lon: 140.14}, {lat: 36.420833333333334, lon: 139.9425}],
    upperLimitFeet: 24000,
    lowerLimitFeet: 4000,
    lowerExclusive: true
  },
  {
    name: "Sector_North_Center_4000",
    points: [{lat: 36.222500000000004, lon: 140.15833333333333}, {lat: 36.20111111111111, lon: 140.31472222222223}, {lat: 36.11805555555556, lon: 140.2538888888889}, {lat: 36.11805555555556, lon: 140.1927777777778}, {lat: 36.10638888888889, lon: 140.14}, {lat: 36.222500000000004, lon: 140.15833333333333}],
    upperLimitFeet: 24000,
    lowerLimitFeet: 4000,
    lowerExclusive: false
  },
  {
    name: "Sector_RJAK_ARP_Area_3000",
    points: [{lat: 36.10638888888889, lon: 140.14}, {lat: 36.11805555555556, lon: 140.1927777777778}, {lat: 36.11805555555556, lon: 140.2538888888889}, {lat: 36.10055555555556, lon: 140.3488888888889}, {lat: 36.081388888888895, lon: 140.45083333333332}, {lat: 36.006388888888885, lon: 140.28972222222222}, {lat: 36.10638888888889, lon: 140.14}],
    upperLimitFeet: 24000,
    lowerLimitFeet: 3000,
    lowerExclusive: false
  },
  {
    name: "Sector_Inner_Box_2500",
    points: [{lat: 36.11805555555556, lon: 140.2538888888889}, {lat: 36.20111111111111, lon: 140.31472222222223}, {lat: 36.18138888888889, lon: 140.36305555555555}, {lat: 36.14944444444444, lon: 140.44055555555556}, {lat: 36.10055555555556, lon: 140.3488888888889}, {lat: 36.11805555555556, lon: 140.2538888888889}],
    upperLimitFeet: 24000,
    lowerLimitFeet: 2500,
    lowerExclusive: true
  },
  {
    name: "Sector_Inner_Box_1800",
    points: [{lat: 36.10055555555556, lon: 140.3488888888889}, {lat: 36.14944444444444, lon: 140.44055555555556}, {lat: 36.19777777777777, lon: 140.43972222222223}, {lat: 36.081388888888895, lon: 140.45083333333332}, {lat: 36.10055555555556, lon: 140.3488888888889}],
    upperLimitFeet: 24000,
    lowerLimitFeet: 1800,
    lowerExclusive: true
  },
  {
    name: "Sector_Inner_Box_4000",
    points: [{lat: 36.18138888888889, lon: 140.36305555555555}, {lat: 36.27444444444444, lon: 140.37916666666666}, {lat: 36.27194444444444, lon: 140.43861111111113}, {lat: 36.19777777777777, lon: 140.43972222222223}, {lat: 36.14944444444444, lon: 140.44055555555556}, {lat: 36.18138888888889, lon: 140.36305555555555}],
    upperLimitFeet: 24000,
    lowerLimitFeet: 4000,
    lowerExclusive: false
  },
  {
    name: "Sector_North_East_7000",
    points: [{lat: 36.63111111111111, lon: 140.32694444444445}, {lat: 36.49388888888889, lon: 140.85722222222222}, {lat: 36.32027777777778, lon: 140.6902777777778}, {lat: 36.275, lon: 140.64694444444444}, {lat: 36.27194444444444, lon: 140.43861111111113}, {lat: 36.27444444444444, lon: 140.37916666666666}, {lat: 36.59638888888889, lon: 140.435}, {lat: 36.60305555555556, lon: 140.4361111111111}, {lat: 36.63111111111111, lon: 140.32694444444445}],
    upperLimitFeet: 24000,
    lowerLimitFeet: 7000,
    lowerExclusive: true
  },
  {
    name: "Sector_Far_North_East_8000",
    points: [{lat: 36.49388888888889, lon: 140.85722222222222}, {lat: 36.083333333333336, lon: 141.76777777777778}, {lat: 36.08416666666667, lon: 141.00472222222223}, {lat: 36.32027777777778, lon: 140.6902777777778}, {lat: 36.49388888888889, lon: 140.85722222222222}],
    upperLimitFeet: 24000,
    lowerLimitFeet: 8000,
    lowerExclusive: true
  },
  {
    name: "Sector_East_6000",
    points: [{lat: 36.08416666666667, lon: 141.00472222222223}, {lat: 35.93333333333333, lon: 141.1447222222222}, {lat: 35.93333333333333, lon: 140.79611111111112}, {lat: 36.04722222222222, lon: 140.63416666666666}, {lat: 36.08416666666667, lon: 141.00472222222223}],
    upperLimitFeet: 24000,
    lowerLimitFeet: 6000,
    lowerExclusive: false
  },
  {
    name: "Sector_Far_East_5000",
    points: [{lat: 36.08416666666667, lon: 141.00472222222223}, {lat: 36.083333333333336, lon: 141.76777777777778}, {lat: 36.07194444444445, lon: 141.73583333333332}, {lat: 34.80444444444444, lon: 141.73805555555555}, {lat: 35.93333333333333, lon: 141.25944444444445}, {lat: 35.93333333333333, lon: 141.1447222222222}, {lat: 36.08416666666667, lon: 141.00472222222223}],
    upperLimitFeet: 24000,
    lowerLimitFeet: 5000,
    lowerExclusive: false
  },
  {
    name: "Sector_West_FL180",
    points: [{lat: 35.940555555555555, lon: 139.16083333333333}, {lat: 36.03972222222222, lon: 139.31166666666667}, {lat: 35.87166666666667, lon: 139.43555555555557}, {lat: 35.7875, lon: 139.40305555555557}, {lat: 35.721111111111114, lon: 139.07583333333332}, {lat: 35.940555555555555, lon: 139.16083333333333}],
    upperLimitFeet: 24000,
    lowerLimitFeet: 18000,
    lowerExclusive: true
  },
  {
    name: "Sector_West_12000",
    points: [{lat: 35.721111111111114, lon: 139.07583333333332}, {lat: 35.7875, lon: 139.40305555555557}, {lat: 35.39527777777778, lon: 139.4636111111111}, {lat: 35.35944444444445, lon: 139.13666666666666}, {lat: 35.721111111111114, lon: 139.07583333333332}],
    upperLimitFeet: 24000,
    lowerLimitFeet: 12000,
    lowerExclusive: true
  },
  {
    name: "Sector_South_West_FL140",
    points: [{lat: 35.35944444444445, lon: 139.13666666666666}, {lat: 35.39527777777778, lon: 139.4636111111111}, {lat: 35.216944444444444, lon: 139.49055555555555}, {lat: 34.93722222222222, lon: 139.20694444444445}, {lat: 34.90333333333333, lon: 138.99694444444444}, {lat: 35.35944444444445, lon: 139.13666666666666}],
    upperLimitFeet: 24000,
    lowerLimitFeet: 14000,
    lowerExclusive: true
  },
  {
    name: "Sector_Inner_West_8000",
    points: [{lat: 35.87166666666667, lon: 139.43555555555557}, {lat: 35.98833333333334, lon: 139.73999999999998}, {lat: 36.10638888888889, lon: 140.14}, {lat: 36.11805555555556, lon: 140.1927777777778}, {lat: 35.55694444444444, lon: 139.64444444444445}, {lat: 35.39527777777778, lon: 139.4636111111111}, {lat: 35.7875, lon: 139.40305555555557}, {lat: 35.87166666666667, lon: 139.43555555555557}],
    upperLimitFeet: 24000,
    lowerLimitFeet: 8000,
    lowerExclusive: true
  },
  {
    name: "Sector_Southern_FL230",
    points: [{lat: 34.54, lon: 140.12333333333333}, {lat: 34.39361111111111, lon: 139.00916666666666}, {lat: 34.198055555555555, lon: 139.21527777777777}, {lat: 34.19472222222222, lon: 139.9983333333333}, {lat: 34.27055555555555, lon: 140.2097222222222}, {lat: 34.54, lon: 140.12333333333333}],
    upperLimitFeet: 23000,
    lowerLimitFeet: 0,
    lowerExclusive: false
  }
];
