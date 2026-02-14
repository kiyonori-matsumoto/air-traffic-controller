import { Airport } from "./Airport";
import { GeoUtils } from "../utils/GeoUtils";
import hanedaData from "../data/haneda.json";

export interface MapLine {
  type: "COASTLINE" | "SECTOR" | "RESTRICTED";
  points: { x: number; y: number }[]; // NM from center
}

export class VideoMap {
  public lines: MapLine[] = [];

  constructor(airport: Airport) {
    this.loadData(airport);
  }

  private loadData(airport: Airport) {
    // Load properties from Airport
    const centerLat = airport.centerLat;
    const centerLon = airport.centerLon;
    // magVar unused, passing direct.

    // GeoUtils logic: "theta = (magVar * Math.PI) / 180" where magVar is passed.
    // In Airport.ts: "new Runway(..., 329.88 - this.magneticVariation)" -> Heading.
    // In GeoUtils previously: "theta = magVar (negative) -> Rotation is Clockwise."
    // "MagVar is -7.9 (West)." so passing -7.9 makes theta negative -> Clockwise.
    // Correct.
    // So pass airport.magneticVariation directly.

    hanedaData.forEach((segment) => {
      const points = segment.map((pt) => {
        const pos = GeoUtils.latLngToNM(
          pt.lat,
          pt.lon,
          centerLat,
          centerLon,
          airport.magneticVariation,
        );
        return { x: pos.x, y: pos.y };
      });

      this.lines.push({
        type: "COASTLINE",
        points: points,
      });
    });

    // Add a sample restricted area for visuals (optional)
    /*
        this.lines.push({
            type: 'RESTRICTED',
            points: [
                {x: -5, y: -5}, {x: 5, y: -5}, {x: 5, y: 5}, {x: -5, y: 5}, {x: -5, y: -5}
            ]
        });
        */
  }
}
