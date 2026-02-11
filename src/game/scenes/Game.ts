import { Scene } from 'phaser';
import { Aircraft } from '../../models/Aircraft';

interface AircraftEntity {
    logic: Aircraft;
    visual: Phaser.GameObjects.Container;
    components: {
        highlight: Phaser.GameObjects.Shape;
        dataText: Phaser.GameObjects.Text;
    };
}

// ... (omitting compass ring comments)

export class Game extends Scene
{
    // ... (properties)
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    msg_text : Phaser.GameObjects.Text;
    private aircrafts: AircraftEntity[] = [];
    private readonly SCALE = 20; // 1px = 20NM
    private selectedAircraft: Aircraft | null = null;

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
        const text = this.add.text(10, -12, ac.callsign,{ fontSize: '12px', fontFamily: 'Monospace', color: '#00ff41' });
        const dataText = this.add.text(10, 0, '', { fontSize: '12px', fontFamily: 'Monospace', color: '#00ff41' });
        const highlightRing = this.add.circle(0, 0, 10);
        highlightRing.setStrokeStyle(0.8, 0x00ff41);
        highlightRing.setVisible(false);
        container.add([dot, text, dataText, highlightRing]);

        return { container, dataText, highlightRing };
    }

    create () {
        // ... (UI setup omitted, matches existing)
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


        // 初期状態で10台程度スポーン
        for (let i = 0; i < 10; i++) {
            this.spawnAircraft();
        }

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

    update(time: number, delta: number) {
        const dt = delta / 1000;

        // 1. 各機体の更新
        this.aircrafts.forEach(ac => {
            ac.logic.update(dt);
            ac.visual.setPosition(ac.logic.x * this.SCALE, - ac.logic.y * this.SCALE);
            this.updateAircraftDisplay(ac);

            if (this.selectedAircraft === ac.logic) {
                ac.components.highlight.setVisible(true);
            } else {
                ac.components.highlight.setVisible(false);
            }
        });

        // 2. セパレーションチェックと警告表示
        this.checkSeparations();

        // 3. スポーン処理
        this.handleSpawning(time);
    }

    private checkSeparations() {
        for (let i = 0; i < this.aircrafts.length; i++) {
            for (let j = i + 1; j < this.aircrafts.length; j++) {
                const ac1 = this.aircrafts[i];
                const ac2 = this.aircrafts[j];
                
                const status = ac1.logic.checkSeparation(ac2.logic);

                if (status === 'VIOLATION') {
                    ac1.components.dataText.setColor('#ff0000');
                    ac2.components.dataText.setColor('#ff0000');
                } else if (status === 'WARNING') {
                    if (ac1.components.dataText.style.color !== '#ff0000') ac1.components.dataText.setColor('#ffff00');
                    if (ac2.components.dataText.style.color !== '#ff0000') ac2.components.dataText.setColor('#ffff00');
                }
            }
        }
    }

    private handleSpawning(time: number) {
        if (time > this.lastSpawnTime + 20000) {
            this.spawnAircraft();
            this.lastSpawnTime = time;
        }
    }

    private updateAircraftDisplay(ac: AircraftEntity) {
        // データブロック更新 (高度100ft単位, 速度10kt単位)
        const alt = Math.floor(ac.logic.altitude / 100).toString().padStart(3, '0');
        const spd = Math.floor(ac.logic.speed / 10).toString().padStart(2, '0');
        const wake = ac.logic.wakeTurbulence;
        
        ac.components.dataText.setText(`${alt} ${spd}${wake}`);

        // デフォルトの色をセット (セパレーションチェックで上書きされる可能性あり)
        ac.components.dataText.setColor('#00ff41');
    }

    private lastSpawnTime: number = 0;

    private spawnAircraft() {
        // ランダムな位置と方角
        const isLeft = Math.random() > 0.5;
        const x = isLeft ? -40 : 40;
        const y = (Math.random() - 0.5) * 40; // -20 ~ 20
        const heading = isLeft ? 90 : 270;
        const altitude = 10000 + Math.floor(Math.random() * 20) * 1000; // 10000 ~ 30000
        const speed = 300 + Math.floor(Math.random() * 20) * 10; // 300 ~ 500
        const callsign = "JAL" + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        const wake = Math.random() > 0.8 ? 'H' : 'M';

        const ac = new Aircraft(callsign, x, y, speed, heading, altitude, wake);
        const { container, dataText, highlightRing } = this.createAircraftContainer(ac);
        this.aircrafts.push({logic: ac, visual: container, components: {
            highlight: highlightRing,
            dataText: dataText
        }});
        
        // インタラクション設定
        container.setInteractive(new Phaser.Geom.Circle(0, 0, 20), Phaser.Geom.Circle.Contains);
        container.on('pointerdown', () => {
            console.log(`${ac.callsign} clicked`);
            this.selectAircraft(ac);
        });
    }
}
