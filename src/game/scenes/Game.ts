import { Scene } from 'phaser';
import { Aircraft } from '../../models/Aircraft';
import { Airport, Runway } from '../../models/Airport';

interface AircraftEntity {
    logic: Aircraft;
    visual: Phaser.GameObjects.Container;
    components: {
        highlight: Phaser.GameObjects.Shape;
        dataText: Phaser.GameObjects.Text;
        vectorLine: Phaser.GameObjects.Line;
        trailDots: Phaser.GameObjects.Arc[];
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
    private readonly SCALE = 10; // 1px = 10NM
    private readonly CX = 512;
    private readonly CY = 384;
    private selectedAircraft: Aircraft | null = null;
    
    private airport: Airport;
    private runwayVisuals: Phaser.GameObjects.Rectangle[] = [];
    private timeScale: number = 1;

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

        // 1. 航跡（トレール）ドット (ワールド座標で配置するためコンテナには入れない)
        const trailDots: Phaser.GameObjects.Arc[] = [];
        for (let i = 0; i < 5; i++) {
            const dot = this.add.circle(0, 0, 1.5, 0x00ff41, 0.5 - i * 0.1);
            dot.setVisible(false);
            trailDots.push(dot);
        }

        // 2. 予測ベクトル線 (1分間) (これもコンテナ外)
        const vectorLine = this.add.line(0, 0, 0, 0, 0, 0, 0x00ff41, 0.5);
        vectorLine.setOrigin(0, 0);

        // 3. 機体シンボルとテキスト
        const dot = this.add.circle(0, 0, 3, 0x00ff41);
        const text = this.add.text(10, -12, ac.callsign,{ fontSize: '12px', fontFamily: 'Monospace', color: '#00ff41' });
        const dataText = this.add.text(10, 0, '', { fontSize: '12px', fontFamily: 'Monospace', color: '#00ff41' });
        const highlightRing = this.add.circle(0, 0, 10);
        highlightRing.setStrokeStyle(0.8, 0x00ff41);
        highlightRing.setVisible(false);
        
        container.add([dot, text, dataText, highlightRing]);

        return { container, dataText, highlightRing, vectorLine, trailDots };
    }

    create () {
        // 空港・滑走路のセットアップ
        // 羽田 34R (中心0,0付近として設定)
        const rwy34R = new Runway('34R', 0, 0, 340, 1.5);
        this.airport = new Airport('RJTT', [rwy34R]);

        // 滑走路の描画
        this.airport.runways.forEach(rwy => {
            const sx = this.CX + (rwy.x * this.SCALE);
            const sy = this.CY - (rwy.y * this.SCALE);
            
            // 1.5NM = 15px @ SCALE=10.
            // 滑走路の向きに合わせて回転
            const rect = this.add.rectangle(sx, sy, 4, rwy.length * this.SCALE, 0x444444);
            rect.setAngle(rwy.heading);
            this.runwayVisuals.push(rect);
            
            // 滑走路番号テキスト
            this.add.text(sx, sy, rwy.id, { fontSize: '10px', color: '#ffffff' }).setOrigin(0.5);

            // ILS ビーム（可視化）
            // 15NM の範囲、角度 6度 (±3度)
            const beamLength = 15 * this.SCALE;
            const beamAngle = rwy.heading + 180; // 進入方向
            const beam = this.add.triangle(
                sx, sy,
                0, 0,
                Math.sin((beamAngle - 3) * Math.PI / 180) * beamLength, -Math.cos((beamAngle - 3) * Math.PI / 180) * beamLength,
                Math.sin((beamAngle + 3) * Math.PI / 180) * beamLength, -Math.cos((beamAngle + 3) * Math.PI / 180) * beamLength,
                0x00ffff, 0.1
            );
            beam.setOrigin(0, 0);
        });

        // UI速度設定
        const speedButtons = ['1', '2', '4'];
        speedButtons.forEach(s => {
            document.getElementById(`btn-speed-${s}`)?.addEventListener('click', () => {
                this.timeScale = parseInt(s);
                speedButtons.forEach(sb => {
                    document.getElementById(`btn-speed-${sb}`)?.classList.toggle('active', sb === s);
                });
            });
        });

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
            if (this.selectedAircraft && this.selectedAircraft.state === 'FLYING') {
                const val = parseInt((e.target as HTMLInputElement).value);
                this.selectedAircraft.targetHeading = val;
                this.valHeading.innerText = val.toString().padStart(3, '0');
            }
        });

        this.inputAltitude.addEventListener('input', (e) => {
            if (this.selectedAircraft && this.selectedAircraft.state === 'FLYING') {
                const val = parseInt((e.target as HTMLInputElement).value);
                this.selectedAircraft.targetAltitude = val;
                this.valAltitude.innerText = val.toString().padStart(5, '0');
            }
        });

        this.inputSpeed.addEventListener('input', (e) => {
            if (this.selectedAircraft && this.selectedAircraft.state === 'FLYING') {
                const val = parseInt((e.target as HTMLInputElement).value);
                this.selectedAircraft.targetSpeed = val;
                this.valSpeed.innerText = val.toString().padStart(3, '0');
            }
        });

        document.getElementById('btn-heading-left')?.addEventListener('click', () => {
            if (this.selectedAircraft && this.selectedAircraft.state === 'FLYING') {
                this.selectedAircraft.targetHeading = (this.selectedAircraft.targetHeading - 45 + 360) % 360;
                this.updateSidebarValues();
            }
        });

        document.getElementById('btn-heading-right')?.addEventListener('click', () => {
             if (this.selectedAircraft && this.selectedAircraft.state === 'FLYING') {
                this.selectedAircraft.targetHeading = (this.selectedAircraft.targetHeading + 45) % 360;
                this.updateSidebarValues();
            }
        });


        // 初期状態で3台程度スポーン (画面内にランダム配置)
        for (let i = 0; i < 3; i++) {
            const rx = (Math.random() - 0.5) * 80; // -40 ~ 40 NM
            const ry = (Math.random() - 0.5) * 60; // -30 ~ 30 NM
            this.spawnAircraft(rx, ry);
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

            if (this.selectedAircraft && this.selectedAircraft.state === 'FLYING') {
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
        
        // 制御可能かどうかでUIの状態を変更
        const isControllable = ac.state === 'FLYING';
        this.inputHeading.disabled = !isControllable;
        this.inputAltitude.disabled = !isControllable;
        this.inputSpeed.disabled = !isControllable;

        this.inputHeading.value = ac.targetHeading.toString();
        this.valHeading.innerText = ac.targetHeading.toString().padStart(3, '0');

        this.inputAltitude.value = ac.targetAltitude.toString();
        this.valAltitude.innerText = ac.targetAltitude.toString().padStart(5, '0');

        this.inputSpeed.value = ac.targetSpeed.toString();
        this.valSpeed.innerText = ac.targetSpeed.toString().padStart(3, '0');
    }

    update(time: number, delta: number) {
        const dt = (delta / 1000) * this.timeScale;

        // 1. 各機体の更新
        this.aircrafts = this.aircrafts.filter(ac => {
            ac.logic.update(dt);
            
            // 座標変換: 中心 (CX, CY) からのオフセット
            const sx = this.CX + (ac.logic.x * this.SCALE);
            const sy = this.CY - (ac.logic.y * this.SCALE); // 北が Logic Y+

            ac.visual.setPosition(sx, sy);
            this.updateAircraftDisplay(ac);

            if (this.selectedAircraft === ac.logic) {
                ac.components.highlight.setVisible(true);
            } else {
                ac.components.highlight.setVisible(false);
            }

            // 着陸判定ロジック
            const active = ac.logic.updateLanding(this.airport.runways);
            if (!active) {
                ac.visual.destroy();
                ac.components.vectorLine.destroy();
                ac.components.trailDots.forEach(d => d.destroy());
                if (this.selectedAircraft === ac.logic) this.selectAircraft(null);
            }
            return active;
        });

        // 2. セパレーションチェックと警告表示
        this.checkSeparations();

        // 3. スポーン処理
        // this.handleSpawning(time);
    }

    private checkSeparations() {
        for (let i = 0; i < this.aircrafts.length; i++) {
            for (let j = i + 1; j < this.aircrafts.length; j++) {
                const ac1 = this.aircrafts[i];
                const ac2 = this.aircrafts[j];
                
                const status = ac1.logic.checkSeparation(ac2.logic);

                if (status === 'VIOLATION') {
                    this.setAircraftColor(ac1, 0xff0000, '#ff0000');
                    this.setAircraftColor(ac2, 0xff0000, '#ff0000');
                } else if (status === 'WARNING') {
                    if (ac1.components.dataText.style.color !== '#ff0000') this.setAircraftColor(ac1, 0xffff00, '#ffff00');
                    if (ac2.components.dataText.style.color !== '#ff0000') this.setAircraftColor(ac2, 0xffff00, '#ffff00');
                }
            }
        }
    }

    private setAircraftColor(ac: AircraftEntity, colorHex: number, colorStr: string) {
        ac.components.dataText.setColor(colorStr);
        ac.components.vectorLine.setStrokeStyle(1, colorHex, 0.5);
        ac.components.trailDots.forEach((dot, i) => {
            dot.setFillStyle(colorHex, 0.5 - i * 0.1);
        });
    }

    private handleSpawning(time: number) {
        if (time > this.lastSpawnTime + 20000) {
            this.spawnAircraft();
            this.lastSpawnTime = time;
        }
    }

    private updateAircraftDisplay(ac: AircraftEntity) {
        const logic = ac.logic;

        // データブロック更新 (高度100ft単位, 速度10kt単位)
        const alt = Math.floor(logic.altitude / 100).toString().padStart(3, '0');
        const spd = Math.floor(logic.speed / 10).toString().padStart(2, '0');
        const wake = logic.wakeTurbulence;
        
        ac.components.dataText.setText(`${alt} ${spd}${wake}`);

        // デフォルトの色
        let color = 0x00ff41;
        let colorStr = '#00ff41';
        
        ac.components.dataText.setColor(colorStr);

        // 予測ベクトルの更新 (1分 = 60秒)
        const speedNMPerMin = logic.speed / 60; // NM/min
        const vectorLength = speedNMPerMin * this.SCALE;
        const rad = logic.heading * (Math.PI / 180);
        
        const vx = Math.sin(rad) * vectorLength;
        const vy = - Math.cos(rad) * vectorLength; // Y軸反転
        
        ac.components.vectorLine.setPosition(ac.visual.x, ac.visual.y);
        ac.components.vectorLine.setTo(0, 0, vx, vy);
        ac.components.vectorLine.setStrokeStyle(1, color, 0.5);

        // 航跡（トレール）の更新
        logic.history.forEach((pos, i) => {
            if (i < ac.components.trailDots.length) {
                const dot = ac.components.trailDots[i];
                // 座標変換
                const sx = this.CX + (pos.x * this.SCALE);
                const sy = this.CY - (pos.y * this.SCALE);
                dot.setPosition(sx, sy);
                dot.setVisible(true);
                dot.setFillStyle(color, 0.5 - i * 0.1);
            }
        });
    }

    private lastSpawnTime: number = 0;

    private spawnAircraft(spawnX?: number, spawnY?: number) {
        // ランダムな位置と方角 (中心(0,0)からの相対座標)
        const isLeft = Math.random() > 0.5;
        const x = spawnX !== undefined ? spawnX : (isLeft ? -60 : 60);
        const y = spawnY !== undefined ? spawnY : (Math.random() - 0.5) * 60; // -30 ~ 30 NM
        const heading = spawnX !== undefined ? Math.floor(Math.random() * 360) : (isLeft ? 90 + Math.floor((Math.random() - 0.5) * 60) : 270 + Math.floor((Math.random() - 0.5) * 60));
        const altitude = 10000 + Math.floor(Math.random() * 20) * 1000; // 10000 ~ 30000
        const speed = 300 + Math.floor(Math.random() * 20) * 10; // 300 ~ 500
        const callsign = "JAL" + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        const wake = Math.random() > 0.8 ? 'H' : 'M';

        const ac = new Aircraft(callsign, x, y, speed, heading, altitude, wake);
        const { container, dataText, highlightRing, vectorLine, trailDots } = this.createAircraftContainer(ac);
        this.aircrafts.push({logic: ac, visual: container, components: {
            highlight: highlightRing,
            dataText: dataText,
            vectorLine: vectorLine,
            trailDots: trailDots
        }});
        
        // インタラクション設定
        container.setInteractive(new Phaser.Geom.Circle(0, 0, 20), Phaser.Geom.Circle.Contains);
        container.on('pointerdown', () => {
            console.log(`${ac.callsign} clicked`);
            this.selectAircraft(ac);
        });
    }
}
