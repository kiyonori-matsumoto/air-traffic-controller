import { Scene } from 'phaser';
import { Aircraft } from '../../models/Aircraft';
import { Airport, Runway } from '../../models/Airport';
import { Radar } from '../../models/Radar';
import { VideoMap } from '../../models/VideoMap';
import { AudioManager } from '../../managers/AudioManager';
import { CommandSystem } from '../../managers/CommandSystem';
import { TrafficManager } from '../../managers/TrafficManager';
import { UIManager } from '../../managers/UIManager';





// ... (omitting compass ring comments)

export class Game extends Scene
{
    // ... (properties)
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    msg_text : Phaser.GameObjects.Text;
    
    // Radar Settings
    private readonly RADAR_RANGE_NM = 40; // 表示半径 (NM)
    private pixelsPerNm: number; // 計算されるスケール (px/NM)


    private readonly CX = 512;
    private readonly CY = 384;
    private selectedAircraft: Aircraft | null = null;
    
    private airport: Airport;
    private radar: Radar; 
    private radarBeam: Phaser.GameObjects.Line;
    private videoMap: VideoMap;
    private videoMapGraphics: Phaser.GameObjects.Graphics;
    private rangeRingsGraphics: Phaser.GameObjects.Graphics;


    private runwayVisuals: Phaser.GameObjects.Rectangle[] = [];

    private timeScale: number = 1;
    private uiManager: UIManager;

    constructor ()
    {
        super('Game');
    }
    


    private audioManager: AudioManager;
    private commandSystem: CommandSystem;
    private trafficManager: TrafficManager;

    create () {
        // スケール計算
        const displayRadiusPx = this.CY * 0.9;
        this.pixelsPerNm = displayRadiusPx / this.RADAR_RANGE_NM;

        // 空港・滑走路のセットアップ
        // 羽田 34R (中心0,0付近として設定)
        const rwy34R = new Runway('34R', 0, 0, 340, 1.5);
        this.airport = new Airport('RJTT', [rwy34R]);
        this.trafficManager = new TrafficManager(this, this.airport, this.CX, this.CY, this.pixelsPerNm, (ac) => this.selectAircraft(ac));
        this.commandSystem = new CommandSystem(this.airport);

        // Radar Initialization
        this.radar = new Radar();
        this.radarBeam = this.add.line(0, 0, 0, 0, 0, 0, 0x00ff00, 0.3);
        this.radarBeam.setOrigin(0, 0);

        // Video Map & Range Rings Initialization
        this.videoMap = new VideoMap();
        this.videoMapGraphics = this.add.graphics();
        this.rangeRingsGraphics = this.add.graphics();
        
        // Render Initial Map/Rings
        this.redrawVideoMap();
        this.redrawRangeRings();
        this.updateStaticObjectPositions();

        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0x0a0a0a);

        // Initialize UIManager
        this.uiManager = new UIManager({
            onCommand: (cmd) => this.handleCommand(cmd),
            onTimeScaleChange: (scale) => this.timeScale = scale
        });
        
        this.input.on('pointerdown', (_pointer: Phaser.Input.Pointer, currentlyOver: any[]) => {
            if(currentlyOver.length === 0) {
                // Deselect if clicking empty space, regardless of focus
                this.selectAircraft(null);
            }
        });


        // 初期状態で3台程度スポーン (画面内にランダム配置)
        for (let i = 0; i < 3; i++) {
            const rx = (Math.random() - 0.5) * 80; // -40 ~ 40 NM
            const ry = (Math.random() - 0.5) * 60; // -30 ~ 30 NM
            this.trafficManager.spawnAircraft(rx, ry);
        }

        this.audioManager = new AudioManager();
    }

    private redrawVideoMap() {
        if (!this.videoMapGraphics) return;
        this.videoMapGraphics.clear();

        this.videoMap.lines.forEach(line => {
            if (line.type === 'COASTLINE') {
                this.videoMapGraphics.lineStyle(1, 0x555555, 0.5); // Faint Grey
            } else if (line.type === 'SECTOR') {
                this.videoMapGraphics.lineStyle(1, 0x004400, 1.0); // Dark Green
            } else if (line.type === 'RESTRICTED') {
                 this.videoMapGraphics.lineStyle(1, 0x440000, 0.8); // Dark Red
            }

            this.videoMapGraphics.beginPath();
            if (line.points.length > 0) {
                const sx = this.CX + (line.points[0].x * this.pixelsPerNm);
                const sy = this.CY - (line.points[0].y * this.pixelsPerNm);
                this.videoMapGraphics.moveTo(sx, sy);
                
                for (let i = 1; i < line.points.length; i++) {
                    const px = this.CX + (line.points[i].x * this.pixelsPerNm);
                    const py = this.CY - (line.points[i].y * this.pixelsPerNm);
                    this.videoMapGraphics.lineTo(px, py);
                }
            }
            this.videoMapGraphics.strokePath();
        });
    }

    private redrawRangeRings() {
        if (!this.rangeRingsGraphics) return;
        this.rangeRingsGraphics.clear();
        this.rangeRingsGraphics.lineStyle(1, 0x222222, 0.5); // Faint Grey Circles

        // Draw rings every 5NM up to current range + margin
        const maxRing = this.RADAR_RANGE_NM; 
        for (let r = 5; r <= maxRing; r += 5) {
            const radiusPx = r * this.pixelsPerNm;
            this.rangeRingsGraphics.strokeCircle(this.CX, this.CY, radiusPx);
        }
    }

    private updateStaticObjectPositions() {
        // Runway
        if (this.airport) {
             this.runwayVisuals.forEach((rect, i) => {
                 const rwy = this.airport.runways[i]; // Index対応に依存（脆い）
                 if (rwy) {
                    const sx = this.CX + (rwy.x * this.pixelsPerNm);
                    const sy = this.CY - (rwy.y * this.pixelsPerNm);
                    rect.setPosition(sx, sy);
                    rect.setSize(4, rwy.length * this.pixelsPerNm); // 長さも変わる
                 }
             });
        }
        
        // 初回のみ描画オブジェクトを作成（本来は別にするべきだが簡易的にここで）
        if (this.runwayVisuals.length === 0 && this.airport) {
             this.airport.runways.forEach(rwy => {
                const sx = this.CX + (rwy.x * this.pixelsPerNm);
                const sy = this.CY - (rwy.y * this.pixelsPerNm);
                
                const rect = this.add.rectangle(sx, sy, 4, rwy.length * this.pixelsPerNm, 0x444444);
                rect.setAngle(rwy.heading);
                this.runwayVisuals.push(rect);
                
                this.add.text(sx, sy, rwy.id, { fontSize: '10px', color: '#ffffff' }).setOrigin(0.5);

                const beamLength = 15 * this.pixelsPerNm;
                const beamAngle = rwy.heading + 180;
                const beam = this.add.triangle(
                    sx, sy,
                    0, 0,
                    Math.sin((beamAngle - 3) * Math.PI / 180) * beamLength, -Math.cos((beamAngle - 3) * Math.PI / 180) * beamLength,
                    Math.sin((beamAngle + 3) * Math.PI / 180) * beamLength, -Math.cos((beamAngle + 3) * Math.PI / 180) * beamLength,
                    0x00ffff, 0.1
                );
                beam.setOrigin(0, 0);
            });
            
            // Waypoint
            this.airport.waypoints.forEach(wp => {
                const sx = this.CX + (wp.x * this.pixelsPerNm);
                const sy = this.CY - (wp.y * this.pixelsPerNm);
                this.add.triangle(sx, sy, 0, -5, 4, 3, -4, 3, 0xaaaaaa).setOrigin(0, 0);
                this.add.text(sx, sy + 5, wp.name, { fontSize: '10px', color: '#aaaaaa' }).setOrigin(0.5, 0);
            });
        }
    }

    private addLog(msg: string, type: 'system' | 'atc' | 'pilot' = 'system') {
        this.uiManager.addLog(msg, type);
    }

    private selectAircraft(ac: Aircraft | null) {
        // Handoff Acceptance Logic REMOVED (Now requires RADAR CONTACT command)
        // if (ac && ac.ownership === 'HANDOFF_OFFERED') { ... }

        this.selectedAircraft = ac;
        this.trafficManager.selectAircraft(ac);
        this.uiManager.updateSidebar(ac);
    }



    private handleCommand(cmd: string) {
        if (!this.selectedAircraft) return;
        const ac = this.selectedAircraft;

        // Custom Check for Contact Tower distance (KEEPING LOGIC HERE FOR NOW to minimize risk)
        // Ideally this moves to CommandSystem but it needs `ac.x/y` which it has access to.
        // But let's let CommandSystem handle the object updates.
        
        if (cmd === 'CONTACT TOWER' || cmd === 'CT') {
            const dist = Math.sqrt(ac.x*ac.x + ac.y*ac.y);
            if (dist >= 10 || ac.state !== 'LANDING') {
                this.addLog(`${ac.callsign} unable contact tower.`, 'system');
                 console.log(`${ac.callsign} Unable to contact tower (Dist: ${dist.toFixed(1)}NM, State: ${ac.state})`);
                return;
            }
        }

        const result = this.commandSystem.handle(cmd, ac);

        if (result.handled) {
            // ATC Audio
            if (result.voiceLog) {
                this.addLog(result.atcLog || result.voiceLog, 'atc');
                this.audioManager.speak(result.voiceLog, 'ATC', undefined, () => {
                    // Pilot Response
                    if (result.pilotLog) {
                        this.schedulePilotResponse(ac, result.pilotLog, () => {
                            // Apply updates
                            result.pendingUpdates.forEach(update => update());
                            if (ac.ownership === 'HANDOFF_COMPLETE') {
                                this.selectAircraft(null);
                            } else {
                                this.uiManager.updateSidebar(ac);
                            }
                        });
                    }
                });
            }
        } else {
             // Check if it was an unknown waypoint
             // This is a bit "leaky" abstraction, but for now fine.
             if (cmd.startsWith('DCT ')) {
                 this.addLog(`Station not found or command not recognized.`, 'system');
             }
        }
    }

    private schedulePilotResponse(ac: Aircraft, msg: string, onValidReadback?: () => void) {
        // Simulate delay (1.5 - 2.5 seconds)
        // This delay represents the pilot's reaction time / processing time
        const delay = 1500 + Math.random() * 1000;
        this.time.delayedCall(delay, () => {
             this.addLog(msg, 'pilot');
             this.audioManager.speak(msg, 'PILOT', ac, onValidReadback);
        });
    }

    update(time: number, delta: number) {
        const dt = (delta / 1000) * this.timeScale;

        this.trafficManager.update(time, dt);

        // 0.5 レーダー更新
        const radarUpdate = this.radar.update(dt);
        this.radar.scan(this.trafficManager.getAircraftsLogic(), radarUpdate.prevAngle, radarUpdate.currentAngle);

        // レーダービーム描画更新
        const beamLen = 1000; // 画面外まで
        // sweepAngleは時計回り(0=North, 90=East)。
        // PhaserのRotationは 0=East, 90=South (Clockwise)
        // North(0) -> -90 (Phaser)
        // East(90) -> 0 (Phaser)
        // South(180) -> 90 (Phaser)
        // LogicAngle to PhaserAngle:  (Logic - 90)
        const beamRad = (this.radar.sweepAngle - 90) * (Math.PI / 180);
        
        this.radarBeam.setPosition(this.CX, this.CY);
        this.radarBeam.setTo(0, 0, Math.cos(beamRad) * beamLen, Math.sin(beamRad) * beamLen);
        this.radarBeam.setStrokeStyle(2, 0x004400, 0.5); // 暗い緑

    }

    // --- End of Moved Methods ---
}
