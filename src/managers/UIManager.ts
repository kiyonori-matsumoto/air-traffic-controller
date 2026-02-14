import { Aircraft } from "../models/Aircraft";

export class UIManager {
  private inputCommand: HTMLInputElement | null;
  private commMessages: HTMLElement | null;
  private btnHelp: HTMLElement | null;
  private helpModal: HTMLElement | null;
  private btnCloseHelp: HTMLElement | null;
  private radarRangeDisplay: HTMLElement | null;

  constructor(
    private callbacks: {
      onCommand: (cmd: string) => void;
      onTimeScaleChange: (scale: number) => void;
      onZoom: (direction: number) => void;
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

    this.setupEventListeners();
  }

  public updateRadarRange(range: number) {
    if (this.radarRangeDisplay) {
      this.radarRangeDisplay.innerText = `${range}NM`;
    }
  }

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
