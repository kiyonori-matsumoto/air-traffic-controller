import { Scene } from 'phaser';
import { Aircraft } from '../../models/Aircraft';
import { Airport, Runway } from '../../models/Airport';
import { Radar } from '../../models/Radar';
import { VideoMap } from '../../models/VideoMap';



interface AircraftEntity {
    logic: Aircraft;
    visual: Phaser.GameObjects.Container;
    components: {
        highlight: Phaser.GameObjects.Shape;
        dataText: Phaser.GameObjects.Text;
        vectorLine: Phaser.GameObjects.Line;
        leaderLine: Phaser.GameObjects.Line;
        jRing: Phaser.GameObjects.Arc;
        trailDots: Phaser.GameObjects.Arc[];
    };
    tagOffset: Phaser.Math.Vector2; // データタグの機体中心からのオフセット
}

// ... (omitting compass ring comments)

export class Game extends Scene
{
    // ... (properties)
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    msg_text : Phaser.GameObjects.Text;
    private aircrafts: AircraftEntity[] = [];
    
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

    private sidebar: HTMLElement;
    private uiCallsign: HTMLElement;
    private inputHeading: HTMLInputElement;
    private valHeading: HTMLElement;
    private inputAltitude: HTMLInputElement;
    private valAltitude: HTMLElement;
    private inputSpeed: HTMLInputElement;
    private valSpeed: HTMLElement;
    private inputCommand: HTMLInputElement;

    private commMessages: HTMLElement;

    constructor ()
    {
        super('Game');
    }
    
    private createAircraftContainer(ac: Aircraft) {
        const container = this.add.container(0, 0);

        // 1. Trail Dots (World Coordinates)
        const trailDots: Phaser.GameObjects.Arc[] = [];
        for (let i = 0; i < 5; i++) {
            const dot = this.add.circle(0, 0, 1.5, 0x00ff41, 0.5 - i * 0.1);
            dot.setVisible(false);
            trailDots.push(dot);
        }

        // 2. Vector Line (1 minute projection)
        const vectorLine = this.add.line(0, 0, 0, 0, 0, 0, 0x00ff41, 0.5);
        vectorLine.setOrigin(0, 0);

        // 3. J-Ring (Separation Halo) 3NM
        const jRing = this.add.circle(0, 0, 3 * this.pixelsPerNm);
        jRing.setStrokeStyle(1, 0x00ff41, 0.3);
        jRing.setVisible(false);

        // 4. Aircraft Symbol
        const symbol = this.add.rectangle(0, 0, 6, 6, 0x00ff41); 
        
        // 5. Leader Line & Data Block
        const leaderLine = this.add.line(0, 0, 0, 0, 20, -20, 0x00ff41);
        leaderLine.setOrigin(0, 0);

        // Font settings
        const fontStyle = { fontSize: '11px', fontFamily: 'Roboto Mono, monospace', color: '#00ff41' };
        
        const text = this.add.text(20, -35, ac.callsign, fontStyle);
        const dataText = this.add.text(20, -22, '', fontStyle);
        
        // Highlight Circle
        const highlightRing = this.add.circle(0, 0, 12);
        highlightRing.setStrokeStyle(1.5, 0xcccc00);
        highlightRing.setVisible(false);
        
        container.add([symbol, leaderLine, text, dataText, highlightRing]);

        const tagOffset = new Phaser.Math.Vector2(20, -20);

        return { container, dataText, highlightRing, vectorLine, trailDots, leaderLine, jRing, tagOffset };
    }

    create () {
        // スケール計算
        const displayRadiusPx = this.CY * 0.9;
        this.pixelsPerNm = displayRadiusPx / this.RADAR_RANGE_NM;

        // 空港・滑走路のセットアップ
        // 羽田 34R (中心0,0付近として設定)
        const rwy34R = new Runway('34R', 0, 0, 340, 1.5);
        this.airport = new Airport('RJTT', [rwy34R]);

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

        // UI参照
        this.sidebar = document.getElementById('control-panel')!;
        this.uiCallsign = document.getElementById('ui-callsign')!;
        this.inputHeading = document.getElementById('input-heading') as HTMLInputElement;
        this.valHeading = document.getElementById('val-heading')!;
        this.inputAltitude = document.getElementById('input-altitude') as HTMLInputElement;
        this.valAltitude = document.getElementById('val-altitude')!;
        this.inputSpeed = document.getElementById('input-speed') as HTMLInputElement;
        this.valSpeed = document.getElementById('val-speed')!;
        this.inputCommand = document.getElementById('input-command') as HTMLInputElement;
        
        this.commMessages = document.getElementById('comm-messages')!;

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

        this.input.on('pointerdown', (_pointer: Phaser.Input.Pointer, currentlyOver: any[]) => {
            if(currentlyOver.length === 0) {
                // コマンド入力中は選択解除しない (フォーカス維持)
                if (document.activeElement !== this.inputCommand) {
                    this.selectAircraft(null);
                }
            }
        });

        this.inputCommand.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.handleCommand(this.inputCommand.value);
                this.inputCommand.value = '';
            }
        });

        document.getElementById('btn-contact-tower')?.addEventListener('click', () => {
             if (this.selectedAircraft && this.selectedAircraft.state === 'LANDING') {
                this.handleCommand('CONTACT TOWER');
             }
        });


        // 初期状態で3台程度スポーン (画面内にランダム配置)
        for (let i = 0; i < 3; i++) {
            const rx = (Math.random() - 0.5) * 80; // -40 ~ 40 NM
            const ry = (Math.random() - 0.5) * 60; // -30 ~ 30 NM
            this.spawnAircraft(rx, ry);
        }
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
        const div = document.createElement('div');
        div.className = `msg ${type}`;
        
        // Simple timestamp
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
        
        div.innerHTML = `<span class="timestamp">[${timeStr}]</span> ${msg}`;
        
        this.commMessages.appendChild(div);
        this.commMessages.scrollTop = this.commMessages.scrollHeight;
    }

    private selectAircraft(ac: Aircraft | null) {
        // Handoff Acceptance Logic
        if (ac && ac.ownership === 'HANDOFF_OFFERED') {
            ac.ownership = 'OWNED';
            this.addLog(`${ac.callsign} radar contact.`, 'atc');
            // TODO: Play sound?
        }

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
        // FLYINGかつ、OWNEDであること
        const isControllable = ac.state === 'FLYING' && ac.ownership === 'OWNED';
        this.inputHeading.disabled = !isControllable;
        this.inputAltitude.disabled = !isControllable;
        this.inputSpeed.disabled = !isControllable;

        this.inputHeading.value = ac.targetHeading.toString();
        this.valHeading.innerText = ac.targetHeading.toString().padStart(3, '0');

        this.inputAltitude.value = ac.targetAltitude.toString();
        this.valAltitude.innerText = ac.targetAltitude.toString().padStart(5, '0');

        this.inputSpeed.value = ac.targetSpeed.toString();
        this.valSpeed.innerText = ac.targetSpeed.toString().padStart(3, '0');

        this.inputCommand.value = ''; // Reset command input on select
    }

    private handleCommand(cmd: string) {
        if (!this.selectedAircraft) return;
        const ac = this.selectedAircraft;
        const command = cmd.trim().toUpperCase();

        // 1. Standard ATC Shorthand (Multi-command support)
        // Format example: "H090 S210 A3000" or "H360"
        let handled = false;

        // Heading: H + 3 digits (e.g., H090, H360)
        const headingMatch = command.match(/H(\d{3})/);
        if (headingMatch) {
            let val = parseInt(headingMatch[1]);
            val = val % 360; // Just in case
            ac.targetHeading = val;
            this.addLog(`${ac.callsign} turn left heading ${val}.`, 'atc');
            handled = true;
        }

        // Speed: S + 2-3 digits (e.g., S210, S180)
        const speedMatch = command.match(/S(\d{2,3})/);
        if (speedMatch) {
            const val = parseInt(speedMatch[1]);
            ac.targetSpeed = val;
            this.addLog(`${ac.callsign} reduce speed to ${val}.`, 'atc');
            handled = true;
        }

        // Altitude: A + digits (ft) or FL + digits
        const altMatch = command.match(/A(\d+)/);
        if (altMatch) {
            const val = parseInt(altMatch[1]);
            ac.targetAltitude = val;
            this.addLog(`${ac.callsign} climb/descend maintain ${val}.`, 'atc');
            handled = true;
        }
        const flMatch = command.match(/FL(\d{2,3})/);
        if (flMatch) {
            const val = parseInt(flMatch[1]) * 100;
            ac.targetAltitude = val;
            this.addLog(`${ac.callsign} climb/descend maintain flight level ${flMatch[1]}.`, 'atc');
            handled = true;
        }

        if (handled) {
             this.updateSidebarValues();
             return; // Don't process other commands if shorthand was found
        }


        // 2. Legacy / Special Commands
        let fixName = '';
        if (command.startsWith('DCT ')) {
            fixName = command.replace('DCT ', '');
        }

        if (fixName) {
            const startWp = this.airport.getWaypoint(fixName);
            if (!startWp) {
                this.addLog(`Station not found: ${fixName}`, 'system');
                return;
            }

            // フライトプラン構築
            const newPlan = [startWp];
            
            // STAR検索
            for (const starName in this.airport.stars) {
                const route = this.airport.stars[starName];
                const idx = route.indexOf(fixName);
                if (idx !== -1) {
                    for (let i = idx + 1; i < route.length; i++) {
                        const nextWpName = route[i];
                        const nextWp = this.airport.getWaypoint(nextWpName);
                        if (nextWp) newPlan.push(nextWp);
                    }
                    this.addLog(`${ac.callsign} cleared via ${starName} arrival.`, 'atc');
                    break; 
                }
            }

            ac.flightPlan = newPlan;
            ac.activeWaypoint = null;
            this.addLog(`${ac.callsign} proceed direct ${fixName}.`, 'atc');
        } else if (command === 'CONTACT TOWER' || command === 'CT') {
            // Check conditions: Distance < 10NM and State == LANDING (ILS Captured)
            const dist = Math.sqrt(ac.x*ac.x + ac.y*ac.y); 
            if (dist < 10 && ac.state === 'LANDING') {
                ac.ownership = 'HANDOFF_COMPLETE';
                this.addLog(`${ac.callsign} contact tower 118.1. Good day.`, 'atc');
                this.selectAircraft(null); 
            } else {
                this.addLog(`${ac.callsign} unable contact tower.`, 'system');
                console.log(`${ac.callsign} Unable to contact tower (Dist: ${dist.toFixed(1)}NM, State: ${ac.state})`);
            }
        }

    }

    update(time: number, delta: number) {
        const dt = (delta / 1000) * this.timeScale;

        // 0. データタグの重なり回避計算
        this.resolveLabelOverlaps(delta);

        // 0.5 レーダー更新
        const radarUpdate = this.radar.update(dt);
        this.radar.scan(this.aircrafts.map(e => e.logic), radarUpdate.prevAngle, radarUpdate.currentAngle);

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

        // 1. 各機体の更新
        this.aircrafts = this.aircrafts.filter(ac => {
            // ナビゲーション更新 (FLYING時のみ)
            if (ac.logic.state === 'FLYING') {
                ac.logic.updateNavigation();
            }
            
            ac.logic.update(dt);
            
            // 座標変換: 中心 (CX, CY) からのオフセット
            // 表示にはレーダー計測位置 (measuredX, measuredY) を使用
            const sx = this.CX + (ac.logic.measuredX * this.pixelsPerNm);
            const sy = this.CY - (ac.logic.measuredY * this.pixelsPerNm); // 北が Logic Y+

            ac.visual.setPosition(sx, sy);
            this.updateAircraftDisplay(ac);

            if (this.selectedAircraft === ac.logic) {
                ac.components.highlight.setVisible(true);
                ac.components.jRing.setVisible(true); // 選択時Jリング表示
            } else {
                ac.components.highlight.setVisible(false);
                ac.components.jRing.setVisible(false);
            }

            // 着陸判定ロジック
            const active = ac.logic.updateLanding(this.airport.runways);
            if (!active) {
                ac.visual.destroy();
                ac.components.vectorLine.destroy();
                ac.components.jRing.destroy(); // Jリング削除
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
                
                // Determine Minimum Separation based on Wake Turbulence
                // Logic: Find leader (front) and follower (behind) logic is complex in 2D 360deg.
                // Simplified: Use the larger requirement if unsure, or calculate projection?
                // Standard Radar Separation (Terminal) is 3NM default.
                // Wake Turbulence applies when "Operating directly behind or crossing behind".
                // For this game, we apply stricter separation if *any* aircraft is Heavy/Super?
                // No, let's try to be smart.
                // If dist < required, it's a violation.
                
                // Matrix (Leader -> Follower):
                // Super -> Heavy: 6NM, Medium: 7NM, Light: 8NM
                // Heavy -> Heavy: 4NM, Medium: 5NM, Light: 6NM
                // Medium -> Light: 5NM
                // Default: 3NM
                
                // Since we don't know who is following who easily without vector math (dot product),
                // We'll be conservative: limit is based on the "Heavier" plane's wake category if distance is close?
                // Actually, if A is Heavy and B is Light, and they are 4NM apart.
                // If A is in front, B is in danger (needs 6NM).
                // If B is in front, A is fine (needs 3NM).
                // We can check relative bearing to velocity?
                
                // Let's implement a simple "Worst Case" first? No, that makes game too hard.
                // Let's assume the one In Front is the Leader.
                // "In Front" means the other aircraft is within +/- 90 degrees of Heading? Or Front Sector?
                
                const dist = ac1.logic.distanceTo(ac2.logic);
                const vDist = ac1.logic.verticalDistanceTo(ac2.logic);

                if (vDist >= 1000) continue; // Vertical separation OK

                // Determine Leader
                // Project A1 position onto A2 velocity vector?
                // Simple dot product of A1 velocity and Vector(A1->A2).
                // If A1 is moving towards A2, and A2 is moving away...
                
                // Simpler: Calculate bearing from A to B. Compare with A's Heading.
                // If B is "behind" A (approx 180 deg relative), then A is Leader.
                
                let requiredSep = 3.0; // Default
                
                // Check A as Leader
                if (this.isBehind(ac1.logic, ac2.logic)) {
                    requiredSep = Math.max(requiredSep, this.getWakeSep(ac1.logic.wakeTurbulence, ac2.logic.wakeTurbulence));
                }
                // Check B as Leader
                else if (this.isBehind(ac2.logic, ac1.logic)) {
                    requiredSep = Math.max(requiredSep, this.getWakeSep(ac2.logic.wakeTurbulence, ac1.logic.wakeTurbulence));
                } else {
                    // Head-on or converging? Standard 3NM
                    requiredSep = 3.0;
                }

                if (dist < requiredSep) {
                    this.setAircraftColor(ac1, 0xff0000, '#ff0000');
                    this.setAircraftColor(ac2, 0xff0000, '#ff0000');
                    // Draw a line between them?
                } else if (dist < requiredSep + 1.5) { // Warning buffer
                    if (ac1.components.dataText.style.color !== '#ff0000') this.setAircraftColor(ac1, 0xffff00, '#ffff00');
                    if (ac2.components.dataText.style.color !== '#ff0000') this.setAircraftColor(ac2, 0xffff00, '#ffff00');
                }
            }
        }
    }

    // Is 'follower' roughly behind 'leader'?
    // "Behind" defined as within 120 degrees sector to the rear?
    private isBehind(leader: Aircraft, follower: Aircraft): boolean {
        // Vector L->F
        const dx = follower.x - leader.x;
        const dy = follower.y - leader.y;
        
        // Leader Heading Vector
        // In Game engine: Logic Y is North.
        // H0 (North) -> (0, 1)
        // H90 (East) -> (1, 0)
        
        const hRad = leader.heading * (Math.PI / 180);
        const vx = Math.sin(hRad);
        const vy = Math.cos(hRad); // Y is North logic
        
        // Dot Product
        const dot = (dx * vx) + (dy * vy); // |L->F| * |V| * cos(theta)
        // If dot < 0, Follower is Behind Leader (Angle > 90)
        
        return dot < 0; 
    }

    private getWakeSep(leaderCat: string, followerCat: string): number {
        // H/M/L/(S=Super)
        // Simplified Matrix
        if (leaderCat === 'S') {
            if (followerCat === 'H') return 6.0;
            if (followerCat === 'M') return 7.0;
            if (followerCat === 'L') return 8.0;
            return 3.0;
        }
        if (leaderCat === 'H') {
            if (followerCat === 'H') return 4.0;
            if (followerCat === 'M') return 5.0;
            if (followerCat === 'L') return 6.0;
            return 3.0;
        }
        if (leaderCat === 'M' && followerCat === 'L') {
            return 5.0;
        }
        
        return 3.0;
    }


    private setAircraftColor(ac: AircraftEntity, colorHex: number, colorStr: string) {
        ac.components.dataText.setColor(colorStr);
        ac.components.vectorLine.setStrokeStyle(1, colorHex, 0.5);
        ac.components.leaderLine.setStrokeStyle(1, colorHex); // Leader Lineの色変更
        ac.components.jRing.setStrokeStyle(0.5, colorHex, 0.3); // J Ringの色変更
        ac.components.trailDots.forEach((dot, i) => {
            dot.setFillStyle(colorHex, 0.5 - i * 0.1);
        });
    }

    private resolveLabelOverlaps(delta: number) {
        // 力学モデルによるタグ配置の調整
        // 1. 本来の位置(右下)への引力
        // 2. 他のタグからの斥力

        const defaultOffset = new Phaser.Math.Vector2(20, -20);
        const forceStrength = 0.5; // 反発力の強さ
        const returnStrength = 0.05; // 元の位置に戻る力
        const minDistance = 50; // タグ同士の最小距離 (w:50, h:30 程度と仮定)

        // 力を計算して適用
        for (let i = 0; i < this.aircrafts.length; i++) {
            const ac1 = this.aircrafts[i];
            const force = new Phaser.Math.Vector2(0, 0);

            // 1. 引力（デフォルト位置に戻ろうとする力）
            const distToDefault = defaultOffset.clone().subtract(ac1.tagOffset);
            force.add(distToDefault.scale(returnStrength));

            // 2. 斥力（他のタグとの重なり回避）
            // 画面上の絶対座標で比較する
            const p1 = new Phaser.Math.Vector2(ac1.visual.x + ac1.tagOffset.x, ac1.visual.y + ac1.tagOffset.y);

            for (let j = 0; j < this.aircrafts.length; j++) {
                if (i === j) continue;
                const ac2 = this.aircrafts[j];
                const p2 = new Phaser.Math.Vector2(ac2.visual.x + ac2.tagOffset.x, ac2.visual.y + ac2.tagOffset.y);

                const diff = p1.clone().subtract(p2);
                const dist = diff.length();

                if (dist < minDistance) {
                    // 近すぎる場合、反発させる
                    // 距離が近いほど強く反発
                    // 0除算回避
                    if (dist < 0.1) diff.setTo(Math.random() - 0.5, Math.random() - 0.5).normalize();
                    
                    const repel = diff.normalize().scale((minDistance - dist) * forceStrength);
                    force.add(repel);
                }
            }

            // 力を適用 (移動)
            ac1.tagOffset.add(force);

            // オフセットの制限 (機体から離れすぎないように)
            // 機体中心からの距離を制限
            const len = ac1.tagOffset.length();
            if (len < 20) ac1.tagOffset.setLength(20);
            if (len > 80) ac1.tagOffset.setLength(80);
        }
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
        let color = 0x00ff41; // Default Bright Green
        let colorStr = '#00ff41';
        
        // Ownershipによる色分け
        switch (logic.ownership) {
            case 'OWNED':
                color = 0x00ff41; 
                colorStr = '#00ff41'; 
                break;
            case 'HANDOFF_OFFERED':
                color = 0xffff00; // Yellow
                colorStr = '#ffff00';
                break;
            case 'UNOWNED':
            case 'HANDOFF_COMPLETE':
                color = 0x004400; // Dark Green
                colorStr = '#004400';
                break;
        }

        // Warning/Violation status overrides colors (if OWNED or HANDOFF_OFFERED)
        // (Existing checkSeparation logic might override this later in the loop, or we handle it here)
        // Currently checkSeparation calls setAircraftColor which overrides everything.
        // So this base color is for normal state.

        ac.components.dataText.setColor(colorStr);

        // 予測ベクトルの更新 (1分 = 60秒)
        // 表示用データもレーダー更新時のものを使用する
        const speedNMPerMin = logic.measuredSpeed / 60; // NM/min
        const vectorLength = speedNMPerMin * this.pixelsPerNm;
        const rad = logic.measuredHeading * (Math.PI / 180);
        
        const vx = Math.sin(rad) * vectorLength;
        const vy = - Math.cos(rad) * vectorLength; // Y軸反転
        
        ac.components.vectorLine.setPosition(ac.visual.x, ac.visual.y);
        ac.components.vectorLine.setTo(0, 0, vx, vy);
        // リーダーライン、テキストの位置更新 (tagOffsetに従う)
        const ox = ac.tagOffset.x;
        const oy = ac.tagOffset.y;

        // DataText (Alt/Speed) is at (ox, oy)
        ac.components.dataText.setPosition(ox, oy - 2); 
        
        // Callsign is above DataText
        const callsignText = ac.visual.getAt(2) as Phaser.GameObjects.Text; 
        if (callsignText) {
            callsignText.setPosition(ox, oy - 15);
            callsignText.setColor(colorStr); // Update callsign color
        }

        ac.components.leaderLine.setTo(0, 0, ox, oy); // 機体中心(0,0)からタグ(ox, oy)へ
        ac.components.leaderLine.setStrokeStyle(1, color); // Update leader line color

        // Update vector line color
        ac.components.vectorLine.setStrokeStyle(1, color, 0.5);

        // Jリング位置更新
        ac.components.jRing.setPosition(ac.visual.x, ac.visual.y);
        ac.components.jRing.setStrokeStyle(0.5, color, 0.3); // 色リセット(警告で変わってるかもしれないので)


        // 航跡（トレール）の更新
        logic.history.forEach((pos, i) => {
            if (i < ac.components.trailDots.length) {
                const dot = ac.components.trailDots[i];
                // 座標変換
                const sx = this.CX + (pos.x * this.pixelsPerNm);
                const sy = this.CY - (pos.y * this.pixelsPerNm);
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
        
        // Diversity in Wake Categories
        const rand = Math.random();
        let wake = 'M';
        if (rand > 0.95) wake = 'S'; // 5% Super
        else if (rand > 0.75) wake = 'H'; // 20% Heavy
        else if (rand < 0.2) wake = 'L'; // 20% Light
        // else Medium

        const ac = new Aircraft(callsign, x, y, speed, heading, altitude, wake);
        
        // Initial ownership state: Arrivals spawn as HANDOFF_OFFERED
        ac.ownership = 'HANDOFF_OFFERED';

        const { container, dataText, highlightRing, vectorLine, trailDots, leaderLine, jRing, tagOffset } = this.createAircraftContainer(ac);
        this.aircrafts.push({logic: ac, visual: container, components: {
            highlight: highlightRing,
            dataText: dataText,
            vectorLine: vectorLine,
            trailDots: trailDots,
            leaderLine: leaderLine,
            jRing: jRing
        }, tagOffset: tagOffset});
        
        // インタラクション設定
        container.setInteractive(new Phaser.Geom.Circle(0, 0, 20), Phaser.Geom.Circle.Contains);
        container.on('pointerdown', () => {
            // console.log(`${ac.callsign} clicked`);
            this.selectAircraft(ac);
        });
    }
}
