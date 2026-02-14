export class GeoUtils {
  // 1 Nautical Mile = 1852 meters
  // Latitude: 1 deg ~= 60 NM
  // Longitude: 1 deg ~= 60 * cos(lat) NM

  /**
   * Converts a LatLng coordinate to X/Y (Nautical Miles) relative to a center point.
   * @param lat Target Latitude
   * @param lon Target Longitude
   * @param centerLat Center Latitude
   * @param centerLon Center Longitude
   * @returns {x, y} in NM (x: East positive, y: North positive).
   *          Note: In Phaser (screen), Y is down positive, so you might need to invert Y.
   *          Standard math: Y is North (up).
   */
  public static latLngToNM(
    lat: number,
    lon: number,
    centerLat: number,
    centerLon: number,
    magVar: number = 0,
  ): { x: number; y: number } {
    const ky = 60; // 1 deg lat = 60 nm
    const kx = Math.cos((centerLat * Math.PI) / 180) * 60;

    const dy = (lat - centerLat) * ky;
    const dx = (lon - centerLon) * kx;

    // Apply Rotation (Magnetic Variation)
    // MagVar is -7.9 (West). We want to rotate Clockwise (negative angle) to bring West to North.
    // theta = magVar (negative) -> Rotation is Clockwise.
    const theta = (magVar * Math.PI) / 180;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    const rx = dx * cosT - dy * sinT;
    const ry = dx * sinT + dy * cosT;

    return { x: rx, y: ry };
  }
}
