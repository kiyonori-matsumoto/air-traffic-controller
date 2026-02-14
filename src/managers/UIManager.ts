import { Aircraft } from "../models/Aircraft";

export class UIManager {
  private inputCommand: HTMLInputElement | null;
  private commMessages: HTMLElement | null;
  private btnHelp: HTMLElement | null;
  private helpModal: HTMLElement | null;
  private btnCloseHelp: HTMLElement | null;
  private radarRangeDisplay: HTMLElement | null;
  private stripsPanel: HTMLElement | null;
  private scoreDisplay: HTMLElement | null;

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
    this.scoreDisplay = document.getElementById("score-display");

    this.setupEventListeners();
  }

  public updateRadarRange(range: number) {
    if (this.radarRangeDisplay) {
      this.radarRangeDisplay.innerText = `${range}NM`;
    }
  }

  public updateScore(score: number) {
    if (this.scoreDisplay) {
      this.scoreDisplay.innerText = `SCORE: ${score}`;
      if (score < 0) this.scoreDisplay.style.color = "#ff4444";
      else this.scoreDisplay.style.color = "#fff";
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

    const alt = Math.floor(ac.altitude / 100);
    const targetAlt = Math.floor(ac.targetAltitude / 100);
    const spd = Math.floor(ac.speed);
    const hdg = Math.floor(ac.heading);

    // Trend Arrow
    let trend = "";
    if (ac.altitude < ac.targetAltitude - 100) trend = "↑";
    else if (ac.altitude > ac.targetAltitude + 100) trend = "↓";

    div.innerHTML = `
        <!-- Block 1: ID -->
        <div class="strip-block strip-block-id">
            <div class="strip-callsign">${ac.callsign}</div>
            <div class="strip-type">${ac.wakeTurbulence}</div>
            <div class="strip-squawk">${ac.squawk}</div>
        </div>

        <!-- Block 2: Altitude -->
        <div class="strip-block strip-block-alt">
            <div class="strip-val-target" id="strip-${ac.callsign}-talt">${targetAlt}</div>
            <div class="strip-val-current" id="strip-${ac.callsign}-alt">${alt}</div>
            <div class="strip-trend ${trend ? "blink" : ""}" id="strip-${ac.callsign}-trend">${trend}</div>
        </div>

        <!-- Block 3: SPD/HDG -->
        <div class="strip-block strip-block-spd">
            <div class="strip-row-sm">
                <span class="label">S</span>
                <span id="strip-${ac.callsign}-spd">${spd}</span>
            </div>
            <div class="strip-row-sm">
                <span class="label">H</span>
                <span id="strip-${ac.callsign}-hdg">${hdg}</span>
            </div>
        </div>

        <!-- Block 4: Route -->
        <div class="strip-block strip-block-route">
            <div><span class="strip-route-val">${ac.origin}</span></div>
            <div style="font-size: 0.6rem; color: #666;">to</div>
            <div><span class="strip-route-val">${ac.destination}</span></div>
        </div>

        <!-- Block 5: ETA/APP -->
        <div class="strip-block strip-block-misc">
            <div class="strip-eta" id="strip-${ac.callsign}-eta">${eta}</div>
            <div class="strip-app">${ac.approachType}</div>
        </div>
    `;

    this.stripsPanel.appendChild(div);
  }

  public updateStrip(ac: Aircraft) {
    const etaEl = document.getElementById(`strip-${ac.callsign}-eta`);
    const altEl = document.getElementById(`strip-${ac.callsign}-alt`);
    const tAltEl = document.getElementById(`strip-${ac.callsign}-talt`);
    const trendEl = document.getElementById(`strip-${ac.callsign}-trend`);

    const spdEl = document.getElementById(`strip-${ac.callsign}-spd`);
    const hdgEl = document.getElementById(`strip-${ac.callsign}-hdg`);

    // ETA
    if (etaEl && ac.estimatedArrivalTime) {
      const etaStr = `${ac.estimatedArrivalTime.getHours().toString().padStart(2, "0")}:${ac.estimatedArrivalTime.getMinutes().toString().padStart(2, "0")}`;
      if (etaEl.innerText !== etaStr) etaEl.innerText = etaStr;
    }

    // Altitude
    if (altEl && tAltEl && trendEl) {
      const alt = Math.floor(ac.altitude / 100).toString();
      const tAlt = Math.floor(ac.targetAltitude / 100).toString();

      if (altEl.innerText !== alt) altEl.innerText = alt;
      if (tAltEl.innerText !== tAlt) {
        tAltEl.innerText = tAlt;
        tAltEl.classList.add("strip-updated");
        setTimeout(() => tAltEl.classList.remove("strip-updated"), 2000);
      }

      // Trend
      let trend = "";
      let blink = false;
      if (ac.altitude < ac.targetAltitude - 50) {
        trend = "↑";
        blink = true;
      } else if (ac.altitude > ac.targetAltitude + 50) {
        trend = "↓";
        blink = true;
      }

      if (trendEl.innerText !== trend) trendEl.innerText = trend;
      if (blink) trendEl.classList.add("blink");
      else trendEl.classList.remove("blink");
    }

    // Speed
    if (spdEl) {
      const spd = Math.floor(ac.speed).toString();
      if (spdEl.innerText !== spd) spdEl.innerText = spd;

      if (Math.abs(ac.speed - ac.targetSpeed) > 1)
        spdEl.classList.add("strip-updated");
      else spdEl.classList.remove("strip-updated");
    }

    // Heading
    if (hdgEl) {
      const hdg = Math.floor(ac.heading).toString();
      if (hdgEl.innerText !== hdg) hdgEl.innerText = hdg;

      if (Math.abs(ac.heading - ac.targetHeading) > 1)
        hdgEl.classList.add("strip-updated");
      else hdgEl.classList.remove("strip-updated");
    }

    // Highlight based on Separation (Warning)
    const strip = document.getElementById(`strip-${ac.callsign}`);
    if (strip) {
      if (
        ac.separationStatus === "VIOLATION" ||
        ac.separationStatus === "WARNING"
      ) {
        strip.classList.add("warning");
      } else {
        strip.classList.remove("warning");
      }
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
