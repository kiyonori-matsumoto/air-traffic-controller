import { TOKYO_CTRL_SECTORS } from "../data/TokyoCtrlAirspace";
import { GeoUtils } from "../utils/GeoUtils";

export interface SectorPolygon {
  name: string;
  points: { x: number; y: number }[];
  upperLimitFeet: number;
  lowerLimitFeet: number;
  lowerExclusive: boolean;
}

export class Airspace {
  public sectors: SectorPolygon[] = [];

  constructor(centerLat: number, centerLon: number, magVar: number) {
    this.sectors = TOKYO_CTRL_SECTORS.map((sector) => {
      const pts = sector.points.map((pt) =>
        GeoUtils.latLngToNM(pt.lat, pt.lon, centerLat, centerLon, magVar),
      );
      return {
        name: sector.name,
        points: pts,
        upperLimitFeet: sector.upperLimitFeet,
        lowerLimitFeet: sector.lowerLimitFeet,
        lowerExclusive: sector.lowerExclusive,
      };
    });
  }

  public isInside(x: number, y: number, altitude: number): boolean {
    for (const sector of this.sectors) {
      if (sector.lowerExclusive) {
        if (altitude <= sector.lowerLimitFeet) continue;
      } else {
        if (altitude < sector.lowerLimitFeet) continue;
      }
      if (altitude > sector.upperLimitFeet) continue;

      if (GeoUtils.isPointInPolygon({ x, y }, sector.points)) {
        return true;
      }
    }
    return false;
  }
}
