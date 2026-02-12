
import { Aircraft } from '../models/Aircraft';
import { Airport } from '../models/Airport';


export interface CommandResult {
    handled: boolean;
    atcLog?: string;
    pilotLog?: string;
    voiceLog?: string;
    voiceDelay?: number;
    pendingUpdates: (() => void)[]; // State changes to apply AFTER readback
}

export class CommandSystem {
    constructor(
        private airport: Airport
    ) {}

    public handle(cmd: string, ac: Aircraft): CommandResult {
        const command = cmd.trim().toUpperCase();
        const result: CommandResult = {
            handled: false,
            pendingUpdates: []
        };

        let atcVoiceMsg = "";
        let readbackMsg = "";

        // 1. Heading (Hxxx)
        const headingMatch = command.match(/H(\d{3})/);
        if (headingMatch) {
            let val = parseInt(headingMatch[1]);
            val = val % 360; 
            
            result.pendingUpdates.push(() => {
                ac.targetHeading = val;
            });

            const msg = `${ac.callsign} turn left heading ${val}.`;
            result.atcLog = msg; // Last log overwrites for now if multi-command
            atcVoiceMsg += `${ac.callsign} turn left heading ${val}, `;
            readbackMsg += `turn left heading ${val}, `;
            result.handled = true;
        }

        // 2. Speed (Sxxx)
        const speedMatch = command.match(/S(\d{2,3})/);
        if (speedMatch) {
            const val = parseInt(speedMatch[1]);
            
            result.pendingUpdates.push(() => {
                ac.targetSpeed = val;
            });

            const msg = `${ac.callsign} reduce speed to ${val}.`;
            if (!result.handled) result.atcLog = msg;
            atcVoiceMsg += `reduce speed to ${val}, `;
            readbackMsg += `reduce speed to ${val}, `;
            result.handled = true;
        }

        // 3. Altitude (Axxx, FLxxx)
        const altMatch = command.match(/A(\d+)/);
        if (altMatch) {
            const val = parseInt(altMatch[1]);
            
            result.pendingUpdates.push(() => {
                ac.targetAltitude = val;
            });

            const msg = `${ac.callsign} climb/descend maintain ${val}.`;
            if (!result.handled) result.atcLog = msg;
            atcVoiceMsg += `climb maintain ${val}, `;
            readbackMsg += `maintain ${val}, `;
            result.handled = true;
        }
        
        const flMatch = command.match(/FL(\d{2,3})/);
        if (flMatch) {
            const val = parseInt(flMatch[1]) * 100;
            
            result.pendingUpdates.push(() => {
                ac.targetAltitude = val;
            });

            const msg = `${ac.callsign} climb/descend maintain flight level ${flMatch[1]}.`;
            if (!result.handled) result.atcLog = msg;
            atcVoiceMsg += `climb maintain flight level ${flMatch[1]}, `;
            readbackMsg += `maintain flight level ${flMatch[1]}, `;
            result.handled = true;
        }

        if (result.handled) {
            result.voiceLog = atcVoiceMsg;
             // Clean up readback
            if (readbackMsg) {
                readbackMsg = readbackMsg.slice(0, -2); // remove trailing comma
                result.pilotLog = `${readbackMsg}. ${ac.callsign}`;
            }
            return result;
        }

        // 4. Legacy / Special Commands
        let fixName = '';
        if (command.startsWith('DCT ')) {
            fixName = command.replace('DCT ', '');
        }

        if (fixName) {
            const startWp = this.airport.getWaypoint(fixName);
            if (!startWp) {
                // Not Handled
                return result;
            }

            // Route Calculation
            let routeName = '';
            const newPlan = [startWp];

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
                    result.atcLog = `${ac.callsign} cleared via ${starName} arrival.`;
                    atcVoiceMsg = `${ac.callsign} cleared via ${starName} arrival.`;
                    result.pilotLog = `cleared via ${routeName}, ${ac.callsign}`;
                    result.handled = true;
                    break; 
                }
            }
            
            if (!result.handled) {
                // Direct To
                result.atcLog = `${ac.callsign} proceed direct ${fixName}.`;
                atcVoiceMsg = `${ac.callsign} proceed direct ${fixName}.`;
                result.pilotLog = `direct ${fixName}, ${ac.callsign}`;
                result.handled = true;
            }

            if (result.handled) {
                 result.voiceLog = atcVoiceMsg;
                 result.pendingUpdates.push(() => {
                    ac.flightPlan = newPlan;
                    ac.activeWaypoint = null;
                 });
                 return result;
            }
        } 
        
        // 5. Contact Tower
        if (command === 'CONTACT TOWER' || command === 'CT') {
             const msg = `${ac.callsign} contact tower 118.1. Good day.`;
             result.atcLog = msg;
             result.voiceLog = msg;
             result.pilotLog = `contact tower 118.1, good day, ${ac.callsign}`;
             result.pendingUpdates.push(() => {
                 ac.ownership = 'HANDOFF_COMPLETE';
             });
             result.handled = true;
             return result;
        }

        // 6. Radar Contact (Handoff Accept)
        if (command === 'RADAR CONTACT' || command === 'RC') {
            if (ac.ownership === 'HANDOFF_OFFERED') {
                const msg = `${ac.callsign} radar contact.`;
                result.atcLog = msg;
                result.voiceLog = msg;
                // Pilot doesn't usually readback "radar contact" in the same way, but acknowledgement is good.
                // Or maybe just silence or "Roger".
                // Let's have pilot say "Roger, [Callsign]" or just nothing?
                // Realistically pilot checks in, ATC says radar contact. Pilot listens.
                // User requirement said "add audio".
                // Let's make pilot acknowledge.
                result.pilotLog = `roger, ${ac.callsign}`; 

                result.pendingUpdates.push(() => {
                    ac.ownership = 'OWNED';
                });
                result.handled = true;
                return result;
            } else {
                 // Already owned or not offered?
                 // If already owned, maybe just say it again?
                 // If not offered (UNOWNED), we can't accept it.
                 if (ac.ownership === 'OWNED') {
                     result.atcLog = `${ac.callsign} already under control.`;
                 } else {
                     result.atcLog = `${ac.callsign} not offering handoff.`;
                 }
                 // result.handled = true; // Mark as handled to avoid "Unknown command" but no action
                 return result;
            }
        }

        return result;
    }
}
