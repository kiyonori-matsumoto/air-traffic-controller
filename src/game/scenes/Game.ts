import { Scene } from 'phaser';
import { Aircraft } from '../../models/Aircraft';

interface AircraftEntity {
    logic: Aircraft;
    visual: Phaser.GameObjects.Container;
    components: {
        highlight: Phaser.GameObjects.Shape;
    };
}

// function createCompassRing(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
//     const g = scene.add.graphics();
//     const radius = 50; // リングの半径

//     // 1. 円形の背景（うっすら見えるガイド）
//     g.lineStyle(1, 0x00ff41, 0.2);
//     g.strokeCircle(0, 0, radius);

//     // 2. 目盛り（Ticks）の描画
//     g.lineStyle(1, 0x00ff41, 0.5);
//     for (let angle = 0; angle < 360; angle += 10) {
//         const rad = Phaser.Math.DegToRad(angle - 90); // 0度が真上に来るように-90度調整
//         const isMajor = angle % 30 === 0; // 30度ごとの長い目盛り
//         const length = isMajor ? 8 : 4;
        
//         const x1 = Math.cos(rad) * radius;
//         const y1 = Math.sin(rad) * radius;
//         const x2 = Math.cos(rad) * (radius + length);
//         const y2 = Math.sin(rad) * (radius + length);
        
//         g.lineBetween(x1, y1, x2, y2);
//     }

//     g.setVisible(false); // 初期状態は非表示
//     return g;
// }

export class Game extends Scene
{
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    msg_text : Phaser.GameObjects.Text;
    private aircrafts: AircraftEntity[] = [];
    private readonly SCALE = 20; // 1px = 20NM
    private selectedAircraft: Aircraft | null = null;
    private compassRing: Phaser.GameObjects.Graphics;

    private sidebar: HTMLElement;
    private uiCallsign: HTMLElement;
    private inputHeading: HTMLInputElement;
    private valHeading: HTMLElement;
    private inputAltitude: HTMLInputElement;
    private valAltitude: HTMLElement;
    private inputSpeed: HTMLInputElement;
    private valSpeed: HTMLElement;

    constructor ()
    {
        super('Game');
    }

    private createAircraftContainer(ac: Aircraft) {
        const container = this.add.container(0, 0);
        const dot = this.add.circle(0, 0, 3, 0x00ff41);
        const text = this.add.text(10, -10, ac.callsign,{ fontSize: '12px', fontFamily: 'Monospace' });
        const highlightRing = this.add.circle(0, 0, 10);
        highlightRing.setStrokeStyle(0.8, 0x00ff41);
        highlightRing.setVisible(false);
        container.add([dot, text, highlightRing]);

        return container;
    }

    create () {
        // UI参照
        this.sidebar = document.getElementById('sidebar')!;
        this.uiCallsign = document.getElementById('ui-callsign')!;
        this.inputHeading = document.getElementById('input-heading') as HTMLInputElement;
        this.valHeading = document.getElementById('val-heading')!;
        this.inputAltitude = document.getElementById('input-altitude') as HTMLInputElement;
        this.valAltitude = document.getElementById('val-altitude')!;
        this.inputSpeed = document.getElementById('input-speed') as HTMLInputElement;
        this.valSpeed = document.getElementById('val-speed')!;

        // UIイベント設定
        this.inputHeading.addEventListener('input', (e) => {
            if (this.selectedAircraft) {
                const val = parseInt((e.target as HTMLInputElement).value);
                this.selectedAircraft.targetHeading = val;
                this.valHeading.innerText = val.toString().padStart(3, '0');
            }
        });

        this.inputAltitude.addEventListener('input', (e) => {
            if (this.selectedAircraft) {
                const val = parseInt((e.target as HTMLInputElement).value);
                this.selectedAircraft.targetAltitude = val;
                this.valAltitude.innerText = val.toString().padStart(5, '0');
            }
        });

        this.inputSpeed.addEventListener('input', (e) => {
            if (this.selectedAircraft) {
                const val = parseInt((e.target as HTMLInputElement).value);
                this.selectedAircraft.targetSpeed = val;
                this.valSpeed.innerText = val.toString().padStart(3, '0');
            }
        });

        document.getElementById('btn-heading-left')?.addEventListener('click', () => {
            if (this.selectedAircraft) {
                this.selectedAircraft.targetHeading = (this.selectedAircraft.targetHeading - 45 + 360) % 360;
                this.updateSidebarValues();
            }
        });

        document.getElementById('btn-heading-right')?.addEventListener('click', () => {
             if (this.selectedAircraft) {
                this.selectedAircraft.targetHeading = (this.selectedAircraft.targetHeading + 45) % 360;
                this.updateSidebarValues();
            }
        });


        // テスト機
        const a1 = new Aircraft("JAL123", 10, -10, 480, 180, 5000);
        const a2 = new Aircraft("ANA456", -30, -20, 350, 90, 20000);

        [a1, a2].forEach(ac => {
            const container = this.createAircraftContainer(ac);
            this.aircrafts.push({logic: ac, visual: container, components: {
                highlight: container.getAt(2) as Phaser.GameObjects.Arc
            }});
        });

        // this.compassRing = createCompassRing(this);

        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0x0a0a0a);

        // this.input.once('pointerdown', () => {

        //     this.scene.start('GameOver');

        // });

        this.aircrafts.forEach(item => {
            // 機体のクリックイベントを有効化
            item.visual.setInteractive(new Phaser.Geom.Circle(0, 0, 20), Phaser.Geom.Circle.Contains);
            item.visual.on('pointerdown', () => {
                console.log(`${item.logic.callsign} clicked`);
                this.selectAircraft(item.logic);
            });
        })

        this.input.on('pointerdown', (_pointer: Phaser.Input.Pointer, currentlyOver: any[]) => {
            if(currentlyOver.length === 0) {
                this.selectAircraft(null);
            }
        });

        // キーボード入力で方位指示のテスト
        this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
            switch (event.key) {
                case 'Escape':
                    this.selectAircraft(null);
                    return;
            }

            if (this.selectedAircraft) {
                switch (event.key) {
                    case 'ArrowLeft':
                        this.selectedAircraft.targetHeading -= 30;
                         if(this.selectedAircraft.targetHeading < 0) this.selectedAircraft.targetHeading += 360;
                         this.updateSidebarValues();
                        break;
                    case 'ArrowRight':
                        this.selectedAircraft.targetHeading += 30;
                        if(this.selectedAircraft.targetHeading >= 360) this.selectedAircraft.targetHeading -= 360;
                        this.updateSidebarValues();
                        break;
                }
            }
        });
    }

    private selectAircraft(ac: Aircraft | null) {
        this.selectedAircraft = ac;
        if (ac) {
            this.sidebar.classList.add('visible');
            this.updateSidebarValues();
        } else {
            this.sidebar.classList.remove('visible');
        }
    }

    private updateSidebarValues() {
        if (!this.selectedAircraft) return;
        const ac = this.selectedAircraft;

        this.uiCallsign.innerText = ac.callsign;
        
        this.inputHeading.value = ac.targetHeading.toString();
        this.valHeading.innerText = ac.targetHeading.toString().padStart(3, '0');

        this.inputAltitude.value = ac.targetAltitude.toString();
        this.valAltitude.innerText = ac.targetAltitude.toString().padStart(5, '0');

        this.inputSpeed.value = ac.targetSpeed.toString();
        this.valSpeed.innerText = ac.targetSpeed.toString().padStart(3, '0');
    }

    update(_time: number, delta: number) {
        const dt = delta / 1000;
        this.aircrafts.forEach(ac => {
            ac.logic.update(dt);
            ac.visual.setPosition(ac.logic.x * this.SCALE, - ac.logic.y * this.SCALE);
            if (this.selectedAircraft === ac.logic) {
                ac.components.highlight.setVisible(true);
            } else {
                ac.components.highlight.setVisible(false);
            }
        });
    }
}
