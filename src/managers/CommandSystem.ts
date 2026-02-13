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

    // 1. Heading (Hxxx)
    const headingMatch = command.match(/H(\d{3})/);
    if (headingMatch) {
      let val = parseInt(headingMatch[1]);

      // Convert Magnetic (Pilot Input) to True (System Physics)
      // True = Mag + Variation
      const trueHeading = (val + this.airport.magneticVariation + 360) % 360;

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

    // 4. Legacy / Special Commands
    let fixName = "";
    if (command.startsWith("DCT ")) {
      fixName = command.replace("DCT ", "");
    }

    if (fixName) {
      const startWp = this.airport.getWaypoint(fixName);
      // If not found, we just ignore for now or return unhandled if it's the only thing?
      // Existing logic returned unhandled immediately.
      // Let's check: if we already handled H/S/A, do we return partial success?
      // Ideally yes. But 'DCT' logic usually implies a specific route change that might override H.
      // For now let's append if found.

      if (startWp) {
        // Route Calculation
        let routeName = "";
        const newPlan = [startWp];
        let applied = false;

        // STAR Check
        for (const starName in this.airport.stars) {
          const route = this.airport.stars[starName];
          const idx = route.indexOf(fixName);
          if (idx !== -1) {
            for (let i = idx + 1; i < route.length; i++) {
              const nextWpName = route[i];
              const nextWp = this.airport.getWaypoint(nextWpName);
              if (nextWp) newPlan.push(nextWp);
            }
            routeName = `${starName} arrival`;

            const phrase = `cleared via ${starName} arrival`;
            logParts.push(phrase);
            voiceParts.push(phrase);
            readbackParts.push(`cleared via ${routeName}`);

            applied = true;
            result.handled = true;
            break;
          }
        }

        if (!applied) {
          // Direct To
          const phrase = `proceed direct ${fixName}`;
          logParts.push(phrase);
          voiceParts.push(phrase);
          readbackParts.push(`direct ${fixName}`);
          result.handled = true;
        }

        result.pendingUpdates.push(() => {
          ac.flightPlan = newPlan;
          ac.activeWaypoint = null;
        });
      }
    }

    // 5. Contact Tower
    if (command === "CONTACT TOWER" || command === "CT") {
      const phrase = `contact tower 118.1. Good day`; // Period for log?
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
