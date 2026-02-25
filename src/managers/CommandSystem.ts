import { Aircraft } from "../models/Aircraft";
import { Airport } from "../models/Airport";

export interface CommandResult {
  handled: boolean;
  atcLog?: string;
  pilotLog?: string;
  voiceLog?: string;
  voiceDelay?: number;
  pendingUpdates: (() => void)[]; // State changes to apply AFTER readback
}

interface LogBuffers {
  log: string[];
  voice: string[];
  readback: string[];
}

export class CommandSystem {
  constructor(private airport: Airport) {}

  public handle(cmd: string, ac: Aircraft): CommandResult {
    const command = cmd.trim().toUpperCase();
    const result: CommandResult = {
      handled: false,
      pendingUpdates: [],
    };

    // 0. Ownership Check
    // Allow 'RADAR CONTACT' even if not owned (to accept handoff)
    if (command !== "RADAR CONTACT" && command !== "RC") {
      if (ac.ownership !== "OWNED") {
        result.atcLog = `${ac.callsign} not under your control.`;
        return result;
      }
    }

    const buffers: LogBuffers = {
      log: [],
      voice: [],
      readback: [],
    };

    // Pre-parse altitude and speed to check for 10000ft/250kt restrictions
    const altMatch = command.match(/(?:ALTITUDE|MAINTAIN|A)\s*(\d+)/);
    const flMatch = command.match(/FL(\d{2,3})/);
    let commandedAlt: number | undefined;
    if (altMatch) {
      commandedAlt = parseInt(altMatch[1]);
    } else if (flMatch) {
      commandedAlt = parseInt(flMatch[1]) * 100;
    }

    const speedMatch = command.match(/(?:SPEED|S)\s*(\d{2,3})/);
    let commandedSpeed: number | undefined;
    if (speedMatch) {
      commandedSpeed = parseInt(speedMatch[1]);
    }

    // Determine the resulting state after commands
    const resultingAlt =
      commandedAlt !== undefined ? commandedAlt : ac.altitude;
    const resultingSpeed =
      commandedSpeed !== undefined ? commandedSpeed : ac.speed;

    // Check restriction: Cannot be below 10,000ft with speed > 250kt if we are commanding a change
    // We only reject if the new commanded state violates the rule.
    // If they are already violating it but command something that fixes it (e.g. S250), it's fine.
    // If they command an invalid state, reject it entirely.
    if (
      (commandedAlt !== undefined || commandedSpeed !== undefined) &&
      resultingAlt < 10000 &&
      resultingSpeed > 250
    ) {
      result.atcLog = `${ac.callsign} UNABLE, SPEED MUST BE 250 OR LESS BELOW 10000.`;
      result.handled = false;
      return result;
    }

    // Run independent command handlers (chainable)
    this.handleHeading(command, ac, result, buffers);
    this.handleSpeed(command, ac, result, buffers, commandedSpeed);
    this.handleAltitude(command, ac, result, buffers, commandedAlt);

    // Run exclusive command group (Route / Approach / Direct)
    // Only one of these should apply at a time
    if (!this.handleStarClearance(command, ac, result, buffers)) {
      if (!this.handleIlsClearance(command, ac, result, buffers)) {
        this.handleDirectTo(command, ac, result, buffers);
      }
    }

    this.handleContactTower(command, ac, result, buffers);
    this.handleContactCenter(command, ac, result, buffers);
    this.handleRadarContact(command, ac, result, buffers);

    return this.finalize(result, ac, buffers);
  }

  private finalize(
    result: CommandResult,
    ac: Aircraft,
    buffers: LogBuffers,
  ): CommandResult {
    if (result.handled) {
      if (!result.atcLog && buffers.log.length > 0) {
        const logBody = buffers.log.join(", ");
        result.atcLog = `${ac.callsign} ${logBody}.`;
      }
      if (!result.voiceLog && buffers.voice.length > 0) {
        const logBody = buffers.voice.join(", ");
        result.voiceLog = `${ac.callsign}, ${logBody}.`;
      }
      if (!result.pilotLog && buffers.readback.length > 0) {
        const rbBody = buffers.readback.join(", ");
        result.pilotLog = `${rbBody}, ${ac.callsign}`;
      }
    }
    return result;
  }

  // --- Handlers ---

  private handleHeading(
    command: string,
    ac: Aircraft,
    result: CommandResult,
    buffers: LogBuffers,
  ): boolean {
    // Start with strict check or allow standard phrases
    // "H090", "HEADING 090", "TURN LEFT HEADING 090" -> Simplify to looking for Hxxx or HEADING xxx
    const headingMatch = command.match(/(?:HEADING|H)\s*(\d{3})/);
    if (headingMatch) {
      const val = parseInt(headingMatch[1]);
      result.pendingUpdates.push(() => {
        ac.autopilot.setHeading(val);
      });
      const phrase = `turn left heading ${val}`;
      this.addLogs(buffers, phrase, phrase, phrase);
      result.handled = true;
      return true;
    }
    return false;
  }

  private handleSpeed(
    command: string,
    ac: Aircraft,
    result: CommandResult,
    buffers: LogBuffers,
    parsedSpeed?: number,
  ): boolean {
    if (parsedSpeed !== undefined) {
      const val = parsedSpeed;
      result.pendingUpdates.push(() => {
        ac.autopilot.setSpeed(val);
      });
      const phrase = `reduce speed to ${val}`; // Or maintain speed, etc.
      this.addLogs(buffers, phrase, phrase, phrase);
      result.handled = true;
      return true;
    }
    return false;
  }

  private handleAltitude(
    command: string,
    ac: Aircraft,
    result: CommandResult,
    buffers: LogBuffers,
    parsedAlt?: number,
  ): boolean {
    if (parsedAlt !== undefined) {
      const val = parsedAlt;
      result.pendingUpdates.push(() => {
        ac.autopilot.setAltitude(val);
      });

      let phrase, voicePhrase;
      if (command.match(/FL(\d{2,3})/)) {
        const flMatch = command.match(/FL(\d{2,3})/);
        const fl = flMatch ? flMatch[1] : (val / 100).toString();
        phrase = `maintain flight level ${fl}`;
        voicePhrase = `climb maintain flight level ${fl}`;
      } else {
        phrase = `maintain ${val}`;
        voicePhrase = `climb maintain ${val}`;
      }

      this.addLogs(buffers, phrase, voicePhrase, phrase);
      result.handled = true;
      return true;
    }
    return false;
  }

  private handleStarClearance(
    command: string,
    ac: Aircraft,
    result: CommandResult,
    buffers: LogBuffers,
  ): boolean {
    const starMatch = command.match(
      /^CLEARED\s+([A-Z0-9]+)\s+VIA\s+([A-Z0-9]+)\s+ARRIVAL$/,
    );
    if (starMatch) {
      const fixName = starMatch[1];
      const starName = starMatch[2];
      const route = this.airport.stars[starName];

      if (route) {
        const idx = route.indexOf(fixName);
        if (idx !== -1) {
          const newPlan: any[] = [];

          // First leg is Direct To the clearance limit if we are not at it?
          // Or usually "Cleared to X via Y arrival" means proceed to X then follow Y.
          // But here idx is the start.
          // If the user says "Cleared CREAM via GODIN2C arrival", it implies starting from GODIN?
          // No, usually "Cleared to GODIN via GODIN2C arrival".
          // If aircraft is somewhere else, it goes DF to GODIN, then TF...

          // Let's assume the first point is DF, others TF.
          newPlan.push({
            type: "DF",
            waypoint: route[idx],
            altConstraint: this.airport.getWaypoint(route[idx])?.z,
            zConstraint: this.airport.getWaypoint(route[idx])?.zConstraint,
            speedLimit: this.airport.getWaypoint(route[idx])?.speedLimit,
          });

          for (let i = idx + 1; i < route.length; i++) {
            const wpName = route[i];
            const wp = this.airport.getWaypoint(wpName);
            newPlan.push({
              type: "TF",
              waypoint: wpName,
              altConstraint: wp?.z,
              zConstraint: wp?.zConstraint,
              speedLimit: wp?.speedLimit,
            });
          }

          result.pendingUpdates.push(() => {
            ac.autopilot.activateFlightPlan(newPlan, "DESCENT", starName);
          });
          const phrase = `cleared to ${fixName} via ${starName} arrival`;
          this.addLogs(
            buffers,
            phrase,
            phrase,
            `cleared via ${starName} arrival`,
          );
          result.handled = true;
          return true;
        } else {
          result.atcLog = `${fixName} is not on ${starName} arrival.`;
          return true; // Handled as error
        }
      } else {
        result.atcLog = `Unknown arrival: ${starName}`;
        return true; // Handled as error
      }
    }
    return false;
  }

  private handleIlsClearance(
    command: string,
    ac: Aircraft,
    result: CommandResult,
    buffers: LogBuffers,
  ): boolean {
    if (
      command === "CLEARED ILS Z RWY34R" ||
      command === "ILS Z 34R" ||
      command === "C I Z 34R"
    ) {
      const approachName = "ILSZ34R";
      const route = this.airport.approaches[approachName];
      if (route) {
        const newPlan: any[] = [];
        // First WP is usually IAF/IF. Use DF?
        // Or if already on STAR, it connects?
        // Let's safe-guard: First one DF, rest TF.
        if (route.length > 0) {
          const firstWp = this.airport.getWaypoint(route[0]);
          newPlan.push({
            type: "DF",
            waypoint: route[0],
            altConstraint: firstWp?.z,
            zConstraint: firstWp?.zConstraint,
            speedLimit: firstWp?.speedLimit,
          });
          for (let i = 1; i < route.length; i++) {
            const wpName = route[i];
            const wp = this.airport.getWaypoint(wpName);
            newPlan.push({
              type: "TF",
              waypoint: wpName,
              speedLimit: wp?.speedLimit,
              zConstraint: wp?.zConstraint,
              altConstraint: wp?.z,
            });
          }
        }

        result.pendingUpdates.push(() => {
          ac.autopilot.activateFlightPlan(newPlan, "APPROACH", "ILS Z 34R");
          // Set MCP Altitude to first waypoint constraint (or reasonable value) to allow VNAV descent
          if (newPlan.length > 0 && newPlan[0].altConstraint) {
            ac.autopilot.mcpAltitude = newPlan[0].altConstraint;
          } else {
            ac.autopilot.mcpAltitude = 4000; // Default for IO Approach
          }
        });
        const phrase = "cleared ILS Zulu Runway 34 Right approach";
        const voicePhrase =
          "cleared ILS Zulu Runway 34 Right approach. Proceed direct Cream.";
        this.addLogs(buffers, phrase, voicePhrase, phrase);
        result.handled = true;
        return true;
      } else {
        result.atcLog = "Approach route ILSZ34R not defined.";
        return true;
      }
    }
    return false;
  }

  private handleDirectTo(
    command: string,
    ac: Aircraft,
    result: CommandResult,
    buffers: LogBuffers,
  ): boolean {
    if (command.startsWith("DCT ")) {
      const fixName = command.replace("DCT ", "");
      if (fixName) {
        const startWp = this.airport.getWaypoint(fixName);
        if (startWp) {
          // Check STARs for auto-fill (keeping existing logic)
          let routeName = "";
          const newPlan: any[] = [];

          // First leg is ALWAYS DF to the requested fix
          newPlan.push({
            type: "DF",
            waypoint: fixName,
            altConstraint: startWp.z,
            zConstraint: startWp.zConstraint,
            speedLimit: startWp.speedLimit,
          });

          // Try to append rest of STAR if applicable
          let applied = false;
          for (const starName in this.airport.stars) {
            const route = this.airport.stars[starName];
            const idx = route.indexOf(fixName);
            // If found and not the last point
            if (idx !== -1 && idx < route.length - 1) {
              for (let i = idx + 1; i < route.length; i++) {
                const nextWpName = route[i];
                const nextWp = this.airport.getWaypoint(nextWpName);
                newPlan.push({
                  type: "TF",
                  waypoint: nextWpName,
                  altConstraint: nextWp?.z,
                  zConstraint: nextWp?.zConstraint,
                  speedLimit: nextWp?.speedLimit,
                });
              }
              routeName = `${starName} arrival`;
              const phrase = `cleared via ${starName} arrival`;
              this.addLogs(buffers, phrase, phrase, `cleared via ${routeName}`);
              applied = true;
              break;
            }
          }

          if (!applied) {
            const phrase = `proceed direct ${fixName}`;
            this.addLogs(buffers, phrase, phrase, `direct ${fixName}`);
          }

          result.pendingUpdates.push(() => {
            ac.autopilot.activateFlightPlan(newPlan, "DESCENT");
          });
          result.handled = true;
          console.log(`newPlan: ${JSON.stringify(newPlan)}`);
          return true;
        }
      }
    }
    return false;
  }

  private handleContactTower(
    command: string,
    ac: Aircraft,
    result: CommandResult,
    buffers: LogBuffers,
  ): boolean {
    if (command === "CONTACT TOWER" || command === "CT") {
      const phrase = `contact tower 118.1 good day`;
      this.addLogs(buffers, phrase, phrase, phrase);
      result.pendingUpdates.push(() => {
        ac.ownership = "HANDOFF_COMPLETE";
      });
      result.handled = true;
      return true;
    }
    return false;
  }

  private handleContactCenter(
    command: string,
    ac: Aircraft,
    result: CommandResult,
    buffers: LogBuffers,
  ): boolean {
    if (command === "CONTACT CENTER" || command === "CC") {
      if (ac.origin !== "RJTT") {
        result.atcLog = `${ac.callsign} is not a departure. Unable contact center.`;
        result.handled = true;
        return true; // Handled as error
      }

      const dist = Math.sqrt(ac.x * ac.x + ac.y * ac.y);
      if (ac.altitude >= 18000 || dist >= 30) {
        const phrase = `contact tokyo control 125.4 good day`; // Assuming 125.4 for center
        this.addLogs(buffers, phrase, phrase, `125.4 good day`);
        result.pendingUpdates.push(() => {
          ac.ownership = "HANDOFF_COMPLETE";
        });
      } else {
        result.atcLog = `${ac.callsign} unable contact center, not ready for handoff.`;
        console.log(
          `${ac.callsign} Unable contact center (Dist: ${dist.toFixed(1)}NM, Alt: ${Math.round(ac.altitude)}ft)`,
        );
      }
      result.handled = true;
      return true; // Command was "CC", so it's handled (either success or error)
    }
    return false;
  }

  private handleRadarContact(
    command: string,
    ac: Aircraft,
    result: CommandResult,
    buffers: LogBuffers,
  ): boolean {
    if (command === "RADAR CONTACT" || command === "RC") {
      if (ac.ownership === "HANDOFF_OFFERED") {
        const phrase = `radar contact`;
        this.addLogs(buffers, phrase, phrase, "roger");
        result.pendingUpdates.push(() => {
          ac.ownership = "OWNED";
        });
        result.handled = true;
        return true;
      } else {
        if (ac.ownership === "OWNED") {
          result.atcLog = `${ac.callsign} already under control.`;
        } else {
          result.atcLog = `${ac.callsign} not offering handoff.`;
        }
        return true; // Handled as error/info
      }
    }
    return false;
  }

  private addLogs(
    buffers: LogBuffers,
    logText: string,
    voiceText: string,
    readbackText: string,
  ) {
    buffers.log.push(logText);
    buffers.voice.push(voiceText);
    buffers.readback.push(readbackText);
  }
}
