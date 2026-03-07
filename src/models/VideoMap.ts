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

    airport.airspace.sectors.forEach((sector) => {
      // Create a closed polygon by appending the first point at the end
      const points = [...sector.points, sector.points[0]];
      this.lines.push({
        type: "SECTOR",
        points: points,
      });
    });

    (hanedaData as any[]).forEach((segment: any) => {
      const points = segment.map((pt: any) => {
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
