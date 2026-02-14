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

export class CommandSystem {
  constructor(private airport: Airport) {}

  public handle(cmd: string, ac: Aircraft): CommandResult {
    const command = cmd.trim().toUpperCase();
    const result: CommandResult = {
      handled: false,
      pendingUpdates: [],
    };

    const logParts: string[] = [];
    const voiceParts: string[] = [];
    const readbackParts: string[] = [];

    // 0. Ownership Check
    // Allow 'RADAR CONTACT' even if not owned (to accept handoff)
    if (command !== "RADAR CONTACT" && command !== "RC") {
      if (ac.ownership !== "OWNED") {
        result.atcLog = `${ac.callsign} not under your control.`;
        return result;
      }
    }

    // 1. Heading (Hxxx)
    const headingMatch = command.match(/H(\d{3})/);
    if (headingMatch) {
      let val = parseInt(headingMatch[1]);

      // System now assumes Pilot Input = System Heading (True North)
      const trueHeading = val;

      result.pendingUpdates.push(() => {
        ac.targetHeading = trueHeading;
      });

      // Log uses the Pilot's stated Magnetic heading
      const phrase = `turn left heading ${val}`;
      logParts.push(phrase);
      voiceParts.push(phrase);
      readbackParts.push(phrase);
      result.handled = true;
    }

    // 2. Speed (Sxxx)
    const speedMatch = command.match(/S(\d{2,3})/);
    if (speedMatch) {
      const val = parseInt(speedMatch[1]);

      result.pendingUpdates.push(() => {
        ac.targetSpeed = val;
      });

      const phrase = `reduce speed to ${val}`;
      logParts.push(phrase);
      voiceParts.push(phrase);
      readbackParts.push(phrase);
      result.handled = true;
    }

    // 3. Altitude (Axxx, FLxxx)
    const altMatch = command.match(/A(\d+)/);
    if (altMatch) {
      const val = parseInt(altMatch[1]);

      result.pendingUpdates.push(() => {
        ac.targetAltitude = val;
      });

      const phrase = `maintain ${val}`;
      const voicePhrase = `climb maintain ${val}`;
      logParts.push(voicePhrase);
      voiceParts.push(voicePhrase);
      readbackParts.push(phrase);
      result.handled = true;
    }

    const flMatch = command.match(/FL(\d{2,3})/);
    if (flMatch) {
      const val = parseInt(flMatch[1]) * 100;

      result.pendingUpdates.push(() => {
        ac.targetAltitude = val;
      });

      const phrase = `maintain flight level ${flMatch[1]}`;
      const voicePhrase = `climb maintain flight level ${flMatch[1]}`;
      logParts.push(voicePhrase);
      voiceParts.push(voicePhrase);
      readbackParts.push(phrase);
      result.handled = true;
    }

    // 4. Start / Route Clearance
    // Pattern: "CLEARED [FIX] VIA [STAR] ARRIVAL" or "DCT [FIX]"
    const starMatch = command.match(
      /^CLEARED\s+([A-Z0-9]+)\s+VIA\s+([A-Z0-9]+)\s+ARRIVAL$/,
    );
    if (starMatch) {
      const fixName = starMatch[1];
      const starName = starMatch[2];

      // Debugging: Iterate keys to find match (case insensitive support?)
      // Assuming strict upper case for now as command is upper case
      const route = this.airport.stars[starName];

      if (route) {
        const idx = route.indexOf(fixName);
        if (idx !== -1) {
          // Valid STAR and Fix
          const newPlan: any[] = [];

          // Add waypoints starting from the fix
          for (let i = idx; i < route.length; i++) {
            const wp = this.airport.getWaypoint(route[i]);
            if (wp) newPlan.push(wp);
          }

          result.pendingUpdates.push(() => {
            ac.flightPlan = newPlan;
            ac.activeWaypoint = null;
          });

          const phrase = `cleared to ${fixName} via ${starName} arrival`;
          logParts.push(phrase);
          voiceParts.push(phrase);
          readbackParts.push(`cleared via ${starName} arrival`);
          result.handled = true;
        } else {
          // Fix not in STAR
          result.atcLog = `${fixName} is not on ${starName} arrival.`;
          // Don't set handled=true, let it fall through or return error
          return result;
        }
      } else {
        result.atcLog = `Unknown arrival: ${starName}`;
        return result;
      }
    } else if (command.startsWith("DCT ")) {
      // ... (Existing DCT logic)
      let fixName = command.replace("DCT ", "");
      if (fixName) {
        const startWp = this.airport.getWaypoint(fixName);
        if (startWp) {
          // Check if Fix is part of ANY STAR (Auto-match behavior) - KEEPING for backward compat or shortcuts?
          // User asked to "distinguish which Waypoint is okay", implying strictness.
          // Let's modify: "DCT [FIX]" just goes to Fix. If it happens to be on a STAR, fine, but we don't auto-assign the rest unless specified?
          // Actually, previous logic auto-assigned the STAR if found.
          // Let's keep "DCT" simple: Proceed Direct to Fix.
          // If user wants STAR, they must use "CLEARED ... VIA ...".
          // OR, we keep the auto-discovery but maybe restrict it?
          // Let's keep DCT as "Direct To" + "Auto-filling subsequent points if implicit".

          let routeName = "";
          const newPlan = [startWp];
          let applied = false;

          // STAR Check (Auto-fill)
          for (const starName in this.airport.stars) {
            const route = this.airport.stars[starName];
            const idx = route.indexOf(fixName);
            if (idx !== -1) {
              for (let i = idx + 1; i < route.length; i++) {
                // ... populate rest
                const nextWp = this.airport.getWaypoint(route[i]);
                if (nextWp) newPlan.push(nextWp);
              }
              routeName = `${starName} arrival`;
              // We won't say "Cleared via STAR" if they just said "DCT".
              // We'll say "Proceed direct [FIX], then [STAR] arrival?"
              // For simplicity, let's keep the old behavior but maybe make the log clearer modification isn't requested for DCT.
              // Actually, user request "clarde CIVIC via AKSEL2C" suggests they WANT to use the explicit syntax.
              // So I will implement the Explicit Syntax (handled above)
              // And here, I will leave DCT as is, or maybe remove the auto-star logic if it's confusing?
              // Let's keep DCT as "Direct + Auto-continue" for convenience, but the new command allows validation.

              const phrase = `cleared via ${starName} arrival`; // Old behavior
              logParts.push(phrase);
              voiceParts.push(phrase);
              readbackParts.push(`cleared via ${routeName}`);
              applied = true;
              break;
            }
          }

          if (!applied) {
            const phrase = `proceed direct ${fixName}`;
            logParts.push(phrase);
            voiceParts.push(phrase);
            readbackParts.push(`direct ${fixName}`);
          }

          result.pendingUpdates.push(() => {
            ac.flightPlan = newPlan;
            ac.activeWaypoint = null;
          });
          result.handled = true;
        }
      }
    }

    // 5. Contact Tower
    if (command === "CONTACT TOWER" || command === "CT") {
      // const phrase = `contact tower 118.1. Good day`; // Period for log?
      // "Contact tower 118.1 Good day"
      const cleanPhrase = `contact tower 118.1 good day`;
      logParts.push(cleanPhrase);
      voiceParts.push(cleanPhrase);
      readbackParts.push(`contact tower 118.1 good day`);

      result.pendingUpdates.push(() => {
        ac.ownership = "HANDOFF_COMPLETE";
      });
      result.handled = true;
    }

    // 6. Radar Contact (Handoff Accept)
    if (command === "RADAR CONTACT" || command === "RC") {
      if (ac.ownership === "HANDOFF_OFFERED") {
        const phrase = `radar contact`;
        logParts.push(phrase);
        voiceParts.push(phrase);
        readbackParts.push(`roger`);

        result.pendingUpdates.push(() => {
          ac.ownership = "OWNED";
        });
        result.handled = true;
      } else {
        if (ac.ownership === "OWNED") {
          result.atcLog = `${ac.callsign} already under control.`;
        } else {
          result.atcLog = `${ac.callsign} not offering handoff.`;
        }
        // Return early for this specific error case to show specific message
        return result;
      }
    }

    // Final Assembly
    if (result.handled) {
      // Join parts
      const logBody = logParts.join(", ");
      result.atcLog = `${ac.callsign} ${logBody}.`;
      result.voiceLog = `${ac.callsign}, ${logBody}.`;

      const rbBody = readbackParts.join(", ");
      result.pilotLog = `${rbBody}, ${ac.callsign}`;
    }

    return result;
  }
}
