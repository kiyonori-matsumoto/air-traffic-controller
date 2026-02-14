import { Scene } from "phaser";

export class ScoreScene extends Scene {
  private score: number;
  private stats: any;

  constructor() {
    super("ScoreScene");
  }

  init(data: { score: number; stats: any }) {
    this.score = data.score;
    this.stats = data.stats;
  }

  create() {
    this.cameras.main.setBackgroundColor("#000000");

    const centerX = this.cameras.main.width / 2;
    const centerY = this.cameras.main.height / 2;

    this.add
      .text(centerX, centerY - 100, "SCENARIO CLEARED", {
        fontSize: "48px",
        color: "#00ff41",
        fontFamily: "Roboto Mono",
      })
      .setOrigin(0.5);

    this.add
      .text(centerX, centerY, `FINAL SCORE: ${this.score}`, {
        fontSize: "32px",
        color: "#ffffff",
        fontFamily: "Roboto Mono",
      })
      .setOrigin(0.5);

    const statsText = `
Safe Landings: ${this.stats.safeLandings}
Handoffs: ${this.stats.successfulHandoffs}
Separation Violations: ${this.stats.separationViolations}
Near Misses: ${this.stats.nearMisses}
    `;

    this.add
      .text(centerX, centerY + 100, statsText, {
        fontSize: "18px",
        color: "#aaaaaa",
        fontFamily: "Roboto Mono",
        align: "center",
      })
      .setOrigin(0.5);

    const btn = this.add
      .text(centerX, centerY + 200, "[ BACK TO MENU ]", {
        fontSize: "24px",
        color: "#00ff41",
        fontFamily: "Roboto Mono",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    btn.on("pointerdown", () => {
      // For now just reload page or go to Game?
      // Since we don't have a MenuScene yet, just restart Game.
      this.scene.start("Game");
    });

    btn.on("pointerover", () => btn.setColor("#ffffff"));
    btn.on("pointerout", () => btn.setColor("#00ff41"));
  }
}
