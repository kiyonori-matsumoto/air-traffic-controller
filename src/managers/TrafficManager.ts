import { Scene } from "phaser";
import { Aircraft } from "../models/Aircraft";
import { Airport } from "../models/Airport";
import { UIManager } from "./UIManager";
import { ScoreManager } from "./ScoreManager";

export interface AircraftEntity {
  logic: Aircraft;
  visual: Phaser.GameObjects.Container;
  components: {
    highlight: Phaser.GameObjects.Shape;
    callsignText: Phaser.GameObjects.Text;
    dataText: Phaser.GameObjects.Text;
    vectorLine: Phaser.GameObjects.Line;
    leaderLine: Phaser.GameObjects.Line;
    trailDots: Phaser.GameObjects.Arc[]; // Arc for circle
    jRing: Phaser.GameObjects.Arc;
  };
  tagOffset: Phaser.Math.Vector2;
}

export class TrafficManager {
  public aircrafts: AircraftEntity[] = [];
  private selected: Aircraft | null = null;

  constructor(
    private scene: Scene,
    public airport: Airport,
    private cx: number,
    private cy: number,
    private pixelsPerNm: number,
    private onSelectAircraft: (ac: Aircraft | null) => void,
    private uiManager: UIManager,
    private scoreManager: ScoreManager,
  ) {}

  private activeViolations: Set<string> = new Set();

  public updateScreenConfig(cx: number, cy: number, pixelsPerNm: number) {
    this.cx = cx;
    this.cy = cy;
    this.pixelsPerNm = pixelsPerNm;
  }

  public update(_time: number, dt: number) {
    // ...
    // Spawning handled externally by SpawnManager calling spawnAircraft

    // Label Overlaps
    this.resolveLabelOverlaps();

    // Separation
    this.checkSeparations();

    // Aircraft Updates
    this.aircrafts = this.aircrafts.filter((ac) => {
      // Navigation
      if (ac.logic.state === "FLYING") {
        ac.logic.updateNavigation(this.airport.waypoints);
      }

      ac.logic.update(dt);

      this.updateAircraftDisplay(ac);

      // Landing Logic
      const active = ac.logic.updateLanding(this.airport.runways);
      if (!active) {
        ac.visual.destroy();
        // Destroy other components using helper
        this.destroyAircraftVisuals(ac);
        this.uiManager.removeStrip(ac.logic);

        if (this.selected === ac.logic) {
          this.onSelectAircraft(null);
        }
        return false;
      }

      // Simple distance check as backup
      const dist = Math.sqrt(ac.logic.x ** 2 + ac.logic.y ** 2);
      if (dist > 100) {
        ac.visual.destroy();
        this.destroyAircraftVisuals(ac);
        this.uiManager.removeStrip(ac.logic);

        if (this.selected === ac.logic) {
          this.onSelectAircraft(null);
        }
        return false;
      }
      return true;
    });
  }

  private destroyAircraftVisuals(ac: AircraftEntity) {
    ac.components.vectorLine.destroy();
    ac.components.jRing.destroy();
    ac.components.leaderLine.destroy();
    ac.components.trailDots.forEach((d) => d.destroy());
  }

  public getAircraftsLogic(): Aircraft[] {
    return this.aircrafts.map((e) => e.logic);
  }

  public selectAircraft(logic: Aircraft | null) {
    this.selected = logic;
    this.uiManager.highlightStrip(logic);
    this.aircrafts.forEach((ac) => {
      if (ac.logic === logic) {
        ac.components.highlight.setVisible(true);
        ac.components.jRing.setVisible(true);
      } else {
        ac.components.highlight.setVisible(false);
        ac.components.jRing.setVisible(false);
      }
    });
  }

  public getAircraftByCallsign(callsign: string): Aircraft | null {
    const entity = this.aircrafts.find((ac) => ac.logic.callsign === callsign);
    return entity ? entity.logic : null;
  }

  public spawnAircraft(config: {
    callsign: string;
    x: number;
    y: number;
    heading: number;
    altitude: number;
    speed: number;
    origin: string;
    destination: string;
    sid?: string; // SID Name
    star?: string; // STAR Name
  }) {
    const rand = Math.random();
    let wake = "M";
    if (rand > 0.95) wake = "S";
    else if (rand > 0.75) wake = "H";
    else if (rand < 0.2) wake = "L";

    const ac = new Aircraft(
      config.callsign,
      config.x,
      config.y,
      config.speed,
      config.heading,
      config.altitude,
      config.origin,
      config.destination,
      wake,
    );
    ac.ownership = "HANDOFF_OFFERED";

    // Assign SID if provided
    if (config.sid) {
      const sidLegs = this.airport.sids[config.sid];
      if (sidLegs) {
        ac.flightPlan = [...sidLegs]; // Clone array to be safe
        ac.approachType = config.sid; // Show SID name in approach field

        // For Departures with SID, set initial target altitude high to ensure climb through constraints
        // Finding the max constraint or default to FL200
        let maxAlt = 20000;
        for (const leg of sidLegs) {
          if (
            leg.type === "TF" &&
            leg.altConstraint &&
            leg.altConstraint > 10000
          ) {
            maxAlt = Math.max(maxAlt, leg.altConstraint);
          }
        }
        ac.targetAltitude = maxAlt;
      } else {
        console.warn(`SID ${config.sid} not found in Airport data.`);
      }
    } else if (config.star) {
      // Assign STAR (Arrival)
      const starWps = this.airport.stars[config.star];
      if (starWps) {
        // Convert string[] to FlightLeg[] (TF)
        ac.flightPlan = starWps.map((wpName) => ({
          type: "TF",
          waypoint: wpName,
          // Look up waypoint for constraints?
          // Airport.ts has waypoints with Z and speedLimit.
          // We should copy those constraints to the leg.
          altConstraint: this.airport.getWaypoint(wpName)?.z,
          zConstraint: this.airport.getWaypoint(wpName)?.zConstraint,
          speedLimit: this.airport.getWaypoint(wpName)?.speedLimit,
        }));
        ac.approachType = config.star;
      } else {
        console.warn(`STAR ${config.star} not found.`);
      }
    }

    const entity = this.createAircraftContainer(ac);
    this.aircrafts.push(entity);

    entity.visual.setInteractive(
      new Phaser.Geom.Circle(0, 0, 20),
      Phaser.Geom.Circle.Contains,
    );
    entity.visual.on("pointerdown", () => {
      this.onSelectAircraft(ac);
    });

    this.uiManager.createStrip(ac);
  }

  private createAircraftContainer(ac: Aircraft): AircraftEntity {
    const container = this.scene.add.container(0, 0);

    // 1. Trail Dots
    const trailDots: Phaser.GameObjects.Arc[] = [];
    for (let i = 0; i < 5; i++) {
      const dot = this.scene.add.circle(0, 0, 1.5, 0x00ff41, 0.5 - i * 0.1);
      dot.setVisible(false);
      trailDots.push(dot);
    }

    // 2. Vector Line
    const vectorLine = this.scene.add.line(0, 0, 0, 0, 0, 0, 0x00ff41, 0.5);
    vectorLine.setOrigin(0, 0);

    // 3. J-Ring
    const jRing = this.scene.add.circle(0, 0, 3 * this.pixelsPerNm);
    jRing.setStrokeStyle(1, 0x00ff41, 0.3);
    jRing.setVisible(false);

    // 4. Aircraft Symbol
    const symbol = this.scene.add.rectangle(0, 0, 6, 6, 0x00ff41);

    // 5. Leader Line & Data Block
    const leaderLine = this.scene.add.line(0, 0, 0, 0, 20, -20, 0x00ff41);
    leaderLine.setOrigin(0, 0);

    const fontStyle = {
      fontSize: "11px",
      fontFamily: "Roboto Mono, monospace",
      color: "#00ff41",
    };

    const text = this.scene.add.text(20, -35, ac.callsign, fontStyle);
    const dataText = this.scene.add.text(20, -22, "", fontStyle);

    const highlightRing = this.scene.add.circle(0, 0, 12);
    highlightRing.setStrokeStyle(1.5, 0xcccc00);
    highlightRing.setVisible(false);

    container.add([symbol, leaderLine, text, dataText, highlightRing]);

    const tagOffset = new Phaser.Math.Vector2(20, -20);

    return {
      logic: ac,
      visual: container,
      components: {
        highlight: highlightRing,
        callsignText: text,
        dataText,
        vectorLine,
        trailDots,
        leaderLine,
        jRing,
      },
      tagOffset: tagOffset,
    };
  }

  private updateAircraftDisplay(ac: AircraftEntity) {
    const logic = ac.logic;
    const alt = Math.floor(logic.altitude / 100)
      .toString()
      .padStart(3, "0");
    const spd = Math.floor(logic.speed / 10)
      .toString()
      .padStart(2, "0");
    const wake = logic.wakeTurbulence;

    ac.components.dataText.setText(`${alt} ${spd}${wake}`);

    // Update Position
    const sx = this.cx + logic.measuredX * this.pixelsPerNm;
    const sy = this.cy - logic.measuredY * this.pixelsPerNm;
    ac.visual.setPosition(sx, sy);

    // Update Visual State (Colors & Highlights)
    // ... (Keep existing color logic) ...
    const isOffered = logic.ownership === "HANDOFF_OFFERED";
    const isHandoffComplete = logic.ownership === "HANDOFF_COMPLETE";
    const isSelected = logic === this.selected;

    let baseColor = "#00ff41";
    if (isOffered) baseColor = "#cccc00";
    else if (isHandoffComplete) baseColor = "#ffffff";

    ac.components.dataText.setColor(baseColor);
    ac.components.callsignText.setColor(baseColor);

    // Highlight Ring
    if (isSelected) {
      ac.components.highlight.setStrokeStyle(1.5, 0x00ff41);
      ac.components.highlight.setVisible(true);
    } else if (isOffered) {
      ac.components.highlight.setStrokeStyle(1.5, 0xcccc00);
      ac.components.highlight.setVisible(true);
    } else if (isHandoffComplete) {
      ac.components.highlight.setStrokeStyle(1.5, 0xffffff);
      ac.components.highlight.setVisible(true); // Optional: Keep selected if needed, or just color
    } else {
      ac.components.highlight.setVisible(false);
    }

    // Update J-Ring Position
    ac.components.jRing.setPosition(sx, sy);

    // Update Vector Line
    // 1 minute vector
    const vectorLenNm = logic.measuredSpeed / 60;
    const vectorLenPx = vectorLenNm * this.pixelsPerNm;

    // Heading (True)
    const visualHeading = logic.measuredHeading;
    const headingRad = (visualHeading - 90) * (Math.PI / 180);

    ac.components.vectorLine.setTo(
      sx,
      sy,
      sx + Math.cos(headingRad) * vectorLenPx,
      sy + Math.sin(headingRad) * vectorLenPx,
    );

    // Update Trail Dots
    ac.components.trailDots.forEach((dot) => dot.setVisible(false));
    logic.history.forEach((pos, i) => {
      if (i < ac.components.trailDots.length) {
        const dot = ac.components.trailDots[i];

        const dx = this.cx + pos.x * this.pixelsPerNm;
        const dy = this.cy - pos.y * this.pixelsPerNm;
        dot.setPosition(dx, dy);
        dot.setVisible(true);
      }
    });

    // ... (rest of method) call new helper
    // Update Leader Line
    ac.components.leaderLine.setTo(0, 0, ac.tagOffset.x, ac.tagOffset.y);

    // Update Data Block Position
    ac.components.dataText.setPosition(ac.tagOffset.x, ac.tagOffset.y - 2);
    ac.components.callsignText.setPosition(ac.tagOffset.x, ac.tagOffset.y - 15);

    this.uiManager.updateStrip(ac.logic);
  }

  // ... Copy isBehind, getWakeSep, checkSeparations, resolveLabelOverlaps ...
  // Since I don't have full code for updateAircraftDisplay, I should read it first.

  private isBehind(leader: Aircraft, follower: Aircraft): boolean {
    const dx = follower.x - leader.x;
    const dy = follower.y - leader.y;
    const hRad = leader.heading * (Math.PI / 180);
    const vx = Math.sin(hRad);
    const vy = Math.cos(hRad);
    const dot = dx * vx + dy * vy;
    return dot < 0;
  }

  private getWakeSep(leaderCat: string, followerCat: string): number {
    if (leaderCat === "S")
      return followerCat === "H"
        ? 6
        : followerCat === "M"
          ? 7
          : followerCat === "L"
            ? 8
            : 3;
    if (leaderCat === "H")
      return followerCat === "H"
        ? 4
        : followerCat === "M"
          ? 5
          : followerCat === "L"
            ? 6
            : 3;
    if (leaderCat === "M" && followerCat === "L") return 5;
    return 3;
  }

  private checkSeparations() {
    for (let i = 0; i < this.aircrafts.length; i++) {
      for (let j = i + 1; j < this.aircrafts.length; j++) {
        const ac1 = this.aircrafts[i];
        const ac2 = this.aircrafts[j];
        const dist = ac1.logic.distanceTo(ac2.logic);
        const vDist = ac1.logic.verticalDistanceTo(ac2.logic);
        if (vDist >= 1000) continue;

        let requiredSep = 3.0;
        if (this.isBehind(ac1.logic, ac2.logic))
          requiredSep = Math.max(
            requiredSep,
            this.getWakeSep(ac1.logic.wakeTurbulence, ac2.logic.wakeTurbulence),
          );
        else if (this.isBehind(ac2.logic, ac1.logic))
          requiredSep = Math.max(
            requiredSep,
            this.getWakeSep(ac2.logic.wakeTurbulence, ac1.logic.wakeTurbulence),
          );

        if (dist < requiredSep) {
          this.setAircraftColor(ac1, 0xff0000, "#ff0000");
          this.setAircraftColor(ac2, 0xff0000, "#ff0000");

          // Report Violation if new
          const pairId = [ac1.logic.callsign, ac2.logic.callsign]
            .sort()
            .join("-");
          if (!this.activeViolations.has(pairId)) {
            this.activeViolations.add(pairId);
            this.scoreManager.reportSeparationViolation();

            // Optional: Audio alert?
            console.log(`Separation Violation: ${pairId}`);
          }
        } else if (dist < requiredSep + 1.5) {
          // Warning Range
          this.setAircraftColor(ac1, 0xffff00, "#ffff00");
          this.setAircraftColor(ac2, 0xffff00, "#ffff00");

          // Clear violation if previously violated but now just warning?
          // No, only clear when fully safe or warning is still unsafe?
          // Let's clear violation only when dist > requiredSep (which is true here)
          const pairId = [ac1.logic.callsign, ac2.logic.callsign]
            .sort()
            .join("-");
          if (this.activeViolations.has(pairId)) {
            this.activeViolations.delete(pairId);
          }
        } else {
          const pairId = [ac1.logic.callsign, ac2.logic.callsign]
            .sort()
            .join("-");
          if (this.activeViolations.has(pairId)) {
            this.activeViolations.delete(pairId);
          }
        }
      }
    }
  }

  private setAircraftColor(
    ac: AircraftEntity,
    colorHex: number,
    colorStr: string,
  ) {
    ac.components.dataText.setColor(colorStr);
    ac.components.vectorLine.setStrokeStyle(1, colorHex, 0.5);
    ac.components.leaderLine.setStrokeStyle(1, colorHex);
    ac.components.jRing.setStrokeStyle(0.5, colorHex, 0.3);
    ac.components.trailDots.forEach((dot, i) => {
      dot.setFillStyle(colorHex, 0.5 - i * 0.1);
    });
  }

  private resolveLabelOverlaps() {
    const defaultOffset = new Phaser.Math.Vector2(20, -20);
    const forceStrength = 0.5;
    const returnStrength = 0.05;
    const minDistance = 50;

    for (let i = 0; i < this.aircrafts.length; i++) {
      const ac1 = this.aircrafts[i];
      const force = new Phaser.Math.Vector2(0, 0);
      const distToDefault = defaultOffset.clone().subtract(ac1.tagOffset);
      force.add(distToDefault.scale(returnStrength));

      const p1 = new Phaser.Math.Vector2(
        ac1.visual.x + ac1.tagOffset.x,
        ac1.visual.y + ac1.tagOffset.y,
      );

      for (let j = 0; j < this.aircrafts.length; j++) {
        if (i === j) continue;
        const ac2 = this.aircrafts[j];
        const p2 = new Phaser.Math.Vector2(
          ac2.visual.x + ac2.tagOffset.x,
          ac2.visual.y + ac2.tagOffset.y,
        );
        const diff = p1.clone().subtract(p2);
        const dist = diff.length();

        if (dist < minDistance) {
          if (dist < 0.1)
            diff.setTo(Math.random() - 0.5, Math.random() - 0.5).normalize();
          const repel = diff
            .normalize()
            .scale((minDistance - dist) * forceStrength);
          force.add(repel);
        }
      }
      ac1.tagOffset.add(force);
      const len = ac1.tagOffset.length();
      if (len < 20) ac1.tagOffset.setLength(20);
      if (len > 80) ac1.tagOffset.setLength(80);
    }
  }
}
