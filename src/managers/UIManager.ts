import { Aircraft } from "../models/Aircraft";

export class UIManager {
  private inputCommand: HTMLInputElement | null;
  private commMessages: HTMLElement | null;
  private btnHelp: HTMLElement | null;
  private helpModal: HTMLElement | null;
  private btnCloseHelp: HTMLElement | null;
  private radarRangeDisplay: HTMLElement | null;
  private stripsPanel: HTMLElement | null;

  constructor(
    private callbacks: {
      onCommand: (cmd: string) => void;
      onTimeScaleChange: (scale: number) => void;
      onZoom: (direction: number) => void;
      onSelect: (callsign: string) => void;
    },
  ) {
    // UI References
    this.inputCommand = document.getElementById(
      "input-command",
    ) as HTMLInputElement;
    this.commMessages = document.getElementById("comm-messages");
    this.btnHelp = document.getElementById("btn-help");
    this.helpModal = document.getElementById("help-modal");
    this.btnCloseHelp = document.getElementById("btn-close-help");
    this.radarRangeDisplay = document.getElementById("radar-range-display");
    this.stripsPanel = document.getElementById("strips-panel");

    this.setupEventListeners();
  }

  public updateRadarRange(range: number) {
    if (this.radarRangeDisplay) {
      this.radarRangeDisplay.innerText = `${range}NM`;
    }
  }

  // --- Flight Progress Strips ---

  public createStrip(ac: Aircraft) {
    if (!this.stripsPanel) return;

    const div = document.createElement("div");
    div.classList.add("flight-strip");
    div.id = `strip-${ac.callsign}`;
    div.onclick = () => {
      this.callbacks.onSelect(ac.callsign);
    };

    const eta = ac.estimatedArrivalTime
      ? `${ac.estimatedArrivalTime.getHours().toString().padStart(2, "0")}:${ac.estimatedArrivalTime.getMinutes().toString().padStart(2, "0")}`
      : "--:--";

    // Altitude (FL)
    const alt = Math.floor(ac.altitude / 100);
    // Speed
    const spd = Math.floor(ac.speed);
    // Heading
    const hdg = Math.floor(ac.heading);

    div.innerHTML = `
        <div class="strip-header">
            <span class="strip-callsign">${ac.callsign}</span>
            <span class="strip-eta" id="strip-${ac.callsign}-eta">${eta}</span>
        </div>
        <div class="strip-details">
            <div class="strip-row"><span>ALT</span><span class="strip-val" id="strip-${ac.callsign}-alt">${alt}</span></div>
            <div class="strip-row"><span>SPD</span><span class="strip-val" id="strip-${ac.callsign}-spd">${spd}</span></div>
            <div class="strip-row"><span>HDG</span><span class="strip-val" id="strip-${ac.callsign}-hdg">${hdg}</span></div>
            <div class="strip-row"><span>TYP</span><span class="strip-val">${ac.wakeTurbulence}</span></div>
        </div>
    `;

    this.stripsPanel.appendChild(div);
  }

  public updateStrip(ac: Aircraft) {
    const etaEl = document.getElementById(`strip-${ac.callsign}-eta`);
    const altEl = document.getElementById(`strip-${ac.callsign}-alt`);
    const spdEl = document.getElementById(`strip-${ac.callsign}-spd`);
    const hdgEl = document.getElementById(`strip-${ac.callsign}-hdg`);

    if (etaEl && ac.estimatedArrivalTime) {
      // ETA Update
      const etaStr = `${ac.estimatedArrivalTime.getHours().toString().padStart(2, "0")}:${ac.estimatedArrivalTime.getMinutes().toString().padStart(2, "0")}`;
      if (etaEl.innerText !== etaStr) etaEl.innerText = etaStr;

      // Check Delay (if ETA > STA + 5min ?)
      // For now just display
    }

    if (altEl) {
      const alt = Math.floor(ac.altitude / 100).toString();
      if (altEl.innerText !== alt) altEl.innerText = alt;

      // Hightlight if changing?
      if (ac.altitude !== ac.targetAltitude)
        altEl.classList.add("strip-updated");
      else altEl.classList.remove("strip-updated");
    }

    if (spdEl) {
      const spd = Math.floor(ac.speed).toString();
      if (spdEl.innerText !== spd) spdEl.innerText = spd;

      if (Math.abs(ac.speed - ac.targetSpeed) > 1)
        spdEl.classList.add("strip-updated");
      else spdEl.classList.remove("strip-updated");
    }

    if (hdgEl) {
      const hdg = Math.floor(ac.heading).toString();
      if (hdgEl.innerText !== hdg) hdgEl.innerText = hdg;

      if (Math.abs(ac.heading - ac.targetHeading) > 1)
        hdgEl.classList.add("strip-updated");
      else hdgEl.classList.remove("strip-updated");
    }
  }

  public removeStrip(ac: Aircraft) {
    const el = document.getElementById(`strip-${ac.callsign}`);
    if (el) el.remove();
  }

  public highlightStrip(ac: Aircraft | null) {
    // Clear all
    document
      .querySelectorAll(".flight-strip")
      .forEach((el) => el.classList.remove("selected"));

    if (ac) {
      const el = document.getElementById(`strip-${ac.callsign}`);
      if (el) {
        el.classList.add("selected");
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }

  // --- End Flight Strips ---

  private setupEventListeners() {
    if (!this.inputCommand) return;

    // Zoom Buttons
    document.getElementById("btn-zoom-in")?.addEventListener("click", () => {
      this.callbacks.onZoom(1);
    });
    document.getElementById("btn-zoom-out")?.addEventListener("click", () => {
      this.callbacks.onZoom(-1);
    });

    // Speed Buttons
    const speedButtons = ["1", "2", "4"];
    speedButtons.forEach((s) => {
      const btn = document.getElementById(`btn-speed-${s}`);
      if (btn) {
        btn.addEventListener("click", () => {
          this.callbacks.onTimeScaleChange(parseInt(s));
          speedButtons.forEach((sb) => {
            document
              .getElementById(`btn-speed-${sb}`)
              ?.classList.toggle("active", sb === s);
          });
        });
      }
    });

    // Command Input
    this.inputCommand.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        if (this.inputCommand) {
          const cmd = this.inputCommand.value.trim();
          if (cmd) {
            this.callbacks.onCommand(cmd);
            this.inputCommand.value = "";
          }
        }
      }
    });

    // Help Button
    this.btnHelp?.addEventListener("click", () => {
      if (this.helpModal) this.helpModal.style.display = "block";
    });

    this.btnCloseHelp?.addEventListener("click", () => {
      if (this.helpModal) this.helpModal.style.display = "none";
    });
  }

  public addLog(msg: string, type: "system" | "atc" | "pilot" = "system") {
    if (!this.commMessages) return;

    const div = document.createElement("div");
    div.classList.add("msg", type);

    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

    div.innerHTML = `<span class="timestamp">[${timeStr}]</span> ${msg}`;

    this.commMessages.appendChild(div);
    this.commMessages.scrollTop = this.commMessages.scrollHeight;
  }

  public updateSidebar(_ac: Aircraft | null) {
    // Method kept empty for compatibility or future use if needed,
    // but sidebar is abolished.
    // We can update other UI elements here if necessary (e.g. status bar?)
    if (this.inputCommand && !this.isCommandInputFocused()) {
      this.inputCommand.focus();
    }
  }

  public isCommandInputFocused(): boolean {
    return document.activeElement === this.inputCommand;
  }
}
