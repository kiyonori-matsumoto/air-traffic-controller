import { Scene, GameObjects } from "phaser";

export class MainMenu extends Scene {
  background: GameObjects.Image;
  logo: GameObjects.Image;
  title: GameObjects.Text;

  constructor() {
    super("MainMenu");
  }

  create() {
    this.background = this.add.image(512, 384, "background");

    this.logo = this.add.image(512, 300, "logo");

    this.title = this.add
      .text(512, 400, "Main Menu", {
        fontFamily: "Arial Black",
        fontSize: 38,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 8,
        align: "center",
      })
      .setOrigin(0.5);

    // Tutorial Button
    const tutorialBtn = this.add
      .text(512, 500, "Tutorial", {
        fontFamily: "Arial Black",
        fontSize: 24,
        color: "#ffffff",
        backgroundColor: "#333333",
        padding: { x: 20, y: 10 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    tutorialBtn.on("pointerover", () =>
      tutorialBtn.setStyle({ color: "#ff0" }),
    );
    tutorialBtn.on("pointerout", () => tutorialBtn.setStyle({ color: "#fff" }));
    tutorialBtn.on("pointerdown", () => {
      this.scene.start("Game", { scenarioId: "TUTORIAL" });
    });

    // Stage 1 Button
    const stage1Btn = this.add
      .text(512, 580, "Stage 1 (Live Control)", {
        fontFamily: "Arial Black",
        fontSize: 24,
        color: "#ffffff",
        backgroundColor: "#333333",
        padding: { x: 20, y: 10 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    stage1Btn.on("pointerover", () => stage1Btn.setStyle({ color: "#ff0" }));
    stage1Btn.on("pointerout", () => stage1Btn.setStyle({ color: "#fff" }));
    stage1Btn.on("pointerdown", () => {
      this.scene.start("Game", { scenarioId: "STAGE_1" });
    });

    // Stage 2 Button
    const stage2Btn = this.add
      .text(512, 660, "Stage 2 (Rush Hour)", {
        fontFamily: "Arial Black",
        fontSize: 24,
        color: "#ffffff",
        backgroundColor: "#333333",
        padding: { x: 20, y: 10 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    stage2Btn.on("pointerover", () => stage2Btn.setStyle({ color: "#ff0" }));
    stage2Btn.on("pointerout", () => stage2Btn.setStyle({ color: "#fff" }));
    stage2Btn.on("pointerdown", () => {
      this.scene.start("Game", { scenarioId: "STAGE_2" });
    });
  }
}
