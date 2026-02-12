
import { Scene } from 'phaser';
import { Aircraft } from '../models/Aircraft';
import { Airport } from '../models/Airport';

export interface AircraftEntity {
    logic: Aircraft;
    visual: Phaser.GameObjects.Container;
    components: {
        highlight: Phaser.GameObjects.Shape;
        callsignText: Phaser.GameObjects.Text;
        dataText: Phaser.GameObjects.Text;
        vectorLine: Phaser.GameObjects.Line;
        leaderLine: Phaser.GameObjects.Line;
        trailDots: Phaser.GameObjects.Arc[]; // Arc for circle
        jRing: Phaser.GameObjects.Arc;
    };
    tagOffset: Phaser.Math.Vector2;
}

export class TrafficManager {
    public aircrafts: AircraftEntity[] = [];
    private lastSpawnTime: number = 0;
    private selected: Aircraft | null = null;

    constructor(
        private scene: Scene,
        private airport: Airport,
        private cx: number,
        private cy: number,
        private pixelsPerNm: number,
        private onSelectAircraft: (ac: Aircraft | null) => void
    ) {}

    public update(time: number, dt: number) {
        // Spawning
        this.handleSpawning(time);
        
        // Label Overlaps
        this.resolveLabelOverlaps();

        // Separation
        this.checkSeparations();

        // Aircraft Updates
        this.aircrafts = this.aircrafts.filter(ac => {
            // Navigation
            if (ac.logic.state === 'FLYING') {
                ac.logic.updateNavigation();
            }
            
            ac.logic.update(dt);
            
            this.updateAircraftDisplay(ac);

            // Landing Logic
            const active = ac.logic.updateLanding(this.airport.runways);
             if (!active) {
                ac.visual.destroy();
                // Destroy other components if they are not children of container?
                // In createAircraftContainer, vectorLine, jRing, leaderLine are added to scene, NOT container.
                // Container only has symbol, text, dataText.
                // So we MUST destroy them manually.
                ac.components.vectorLine.destroy();
                ac.components.jRing.destroy();
                ac.components.leaderLine.destroy();
                ac.components.trailDots.forEach(d => d.destroy());
                
                if (this.selected === ac.logic) {
                    this.onSelectAircraft(null);
                }
                return false;
            }

            // Simple distance check as backup
            const dist = Math.sqrt(ac.logic.x**2 + ac.logic.y**2);
            if (dist > 100) { 
                 ac.visual.destroy();
                 ac.components.vectorLine.destroy();
                 ac.components.jRing.destroy();
                 ac.components.leaderLine.destroy();
                 ac.components.trailDots.forEach(d => d.destroy());
                 if (this.selected === ac.logic) {
                    this.onSelectAircraft(null);
                 }
                 return false;
            }
            return true;
        });
    }

    public getAircraftsLogic(): Aircraft[] {
        return this.aircrafts.map(e => e.logic);
    }
    
    public selectAircraft(logic: Aircraft | null) {
        this.selected = logic;
        this.aircrafts.forEach(ac => {
            if (ac.logic === logic) {
                ac.components.highlight.setVisible(true);
                ac.components.jRing.setVisible(true);
            } else {
                ac.components.highlight.setVisible(false);
                ac.components.jRing.setVisible(false);
            }
        });
    }

    private handleSpawning(time: number) {
        if (time > this.lastSpawnTime + 20000) {
            this.spawnAircraft();
            this.lastSpawnTime = time;
        }
    }

    public spawnAircraft(spawnX?: number, spawnY?: number) {
        const isLeft = Math.random() > 0.5;
        const x = spawnX !== undefined ? spawnX : (isLeft ? -60 : 60);
        const y = spawnY !== undefined ? spawnY : (Math.random() - 0.5) * 60; 
        const heading = spawnX !== undefined ? Math.floor(Math.random() * 360) : (isLeft ? 90 + Math.floor((Math.random() - 0.5) * 60) : 270 + Math.floor((Math.random() - 0.5) * 60));
        const altitude = 10000 + Math.floor(Math.random() * 20) * 1000;
        const speed = 300 + Math.floor(Math.random() * 20) * 10;
        const callsign = "JAL" + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        
        const rand = Math.random();
        let wake = 'M';
        if (rand > 0.95) wake = 'S';
        else if (rand > 0.75) wake = 'H';
        else if (rand < 0.2) wake = 'L';

        const ac = new Aircraft(callsign, x, y, speed, heading, altitude, wake);
        ac.ownership = 'HANDOFF_OFFERED';

        const entity = this.createAircraftContainer(ac);
        this.aircrafts.push(entity);
        
        entity.visual.setInteractive(new Phaser.Geom.Circle(0, 0, 20), Phaser.Geom.Circle.Contains);
        entity.visual.on('pointerdown', () => {
            this.onSelectAircraft(ac);
        });
    }

    private createAircraftContainer(ac: Aircraft): AircraftEntity {
        const container = this.scene.add.container(0, 0);

        // 1. Trail Dots
        const trailDots: Phaser.GameObjects.Arc[] = [];
        for (let i = 0; i < 5; i++) {
            const dot = this.scene.add.circle(0, 0, 1.5, 0x00ff41, 0.5 - i * 0.1);
            dot.setVisible(false);
            trailDots.push(dot);
        }

        // 2. Vector Line
        const vectorLine = this.scene.add.line(0, 0, 0, 0, 0, 0, 0x00ff41, 0.5);
        vectorLine.setOrigin(0, 0);

        // 3. J-Ring
        const jRing = this.scene.add.circle(0, 0, 3 * this.pixelsPerNm);
        jRing.setStrokeStyle(1, 0x00ff41, 0.3);
        jRing.setVisible(false);

        // 4. Aircraft Symbol
        const symbol = this.scene.add.rectangle(0, 0, 6, 6, 0x00ff41); 
        
        // 5. Leader Line & Data Block
        const leaderLine = this.scene.add.line(0, 0, 0, 0, 20, -20, 0x00ff41);
        leaderLine.setOrigin(0, 0);

        const fontStyle = { fontSize: '11px', fontFamily: 'Roboto Mono, monospace', color: '#00ff41' };
        
        const text = this.scene.add.text(20, -35, ac.callsign, fontStyle);
        const dataText = this.scene.add.text(20, -22, '', fontStyle);
        
        const highlightRing = this.scene.add.circle(0, 0, 12);
        highlightRing.setStrokeStyle(1.5, 0xcccc00);
        highlightRing.setVisible(false);
        
        container.add([symbol, leaderLine, text, dataText, highlightRing]);

        const tagOffset = new Phaser.Math.Vector2(20, -20);

        return { 
            logic: ac,
            visual: container,
            components: { 
                highlight: highlightRing, 
                callsignText: text,
                dataText, 
                vectorLine, 
                trailDots, 
                leaderLine, 
                jRing 
            }, 
            tagOffset: tagOffset 
        };
    }

    private updateAircraftDisplay(ac: AircraftEntity) {
        const logic = ac.logic;
        const alt = Math.floor(logic.altitude / 100).toString().padStart(3, '0');
        const spd = Math.floor(logic.speed / 10).toString().padStart(2, '0');
        const wake = logic.wakeTurbulence;
        
        ac.components.dataText.setText(`${alt} ${spd}${wake}`);

        // Update Position
        const sx = this.cx + (logic.measuredX * this.pixelsPerNm);
        const sy = this.cy - (logic.measuredY * this.pixelsPerNm);
        ac.visual.setPosition(sx, sy);

        // Update Visual State (Colors & Highlights)
        const isOwned = logic.ownership === 'OWNED';
        const isOffered = logic.ownership === 'HANDOFF_OFFERED';
        const isSelected = logic === this.selected;

        const baseColor = isOffered ? '#cccc00' : '#00ff41'; // Yellow if offered, Green if owned
        ac.components.dataText.setColor(baseColor);
        ac.components.callsignText.setColor(baseColor);

        // Highlight Ring
        // Show if Selected OR Offered
        if (isSelected) {
            ac.components.highlight.setStrokeStyle(1.5, 0x00ff41); // Green for selection
            ac.components.highlight.setVisible(true);
        } else if (isOffered) {
            ac.components.highlight.setStrokeStyle(1.5, 0xcccc00); // Yellow for handoff offer
            ac.components.highlight.setVisible(true);
        } else {
            ac.components.highlight.setVisible(false);
        }

        // Update J-Ring Position
        ac.components.jRing.setPosition(sx, sy);

        // Update Vector Line
        // 1 minute vector
        const vectorLenNm = logic.measuredSpeed / 60;
        const vectorLenPx = vectorLenNm * this.pixelsPerNm;
        const headingRad = (logic.measuredHeading - 90) * (Math.PI / 180);
        
        ac.components.vectorLine.setTo(sx, sy, sx + Math.cos(headingRad) * vectorLenPx, sy + Math.sin(headingRad) * vectorLenPx);

        // Update Trail Dots
        ac.components.trailDots.forEach(dot => dot.setVisible(false));
        logic.history.forEach((pos, i) => {
            if (i < ac.components.trailDots.length) {
                const dot = ac.components.trailDots[i];
                const dx = this.cx + (pos.x * this.pixelsPerNm);
                const dy = this.cy - (pos.y * this.pixelsPerNm);
                dot.setPosition(dx, dy);
                dot.setVisible(true);
            }
        });

        // Update Leader Line
        ac.components.leaderLine.setTo(0, 0, ac.tagOffset.x, ac.tagOffset.y);
        
        // Update Data Block Position
        ac.components.dataText.setPosition(ac.tagOffset.x, ac.tagOffset.y - 2); 
        ac.components.callsignText.setPosition(ac.tagOffset.x, ac.tagOffset.y - 15); 
        // text (callsign) is separate? In createAircraftContainer, callsign is 'text'.
        // Wait, 'text' is not in components interface in Game.ts?
        // Let's check interface in TrafficManager.
        // It should be there.
        // In createAircraftContainer, I added 'text' to container but didn't return it in 'components'.
        // Generally Phaser container children move with container.
        // But logic for updating text position relative to container is needed?
        // Game.ts logic: 
        /*
            const text = this.add.text(20, -35, ac.callsign, fontStyle);
            ...
            ac.components.dataText.setPosition(ac.tagOffset.x, ac.tagOffset.y - 2);
            // Callsign text position?
        */
       // In Game.ts 'updateAircraftDisplay', it iterates children?
       // Let's re-read updateAircraftDisplay in Game.ts to be sure.
       // Step 529 shows updateAircraftDisplay call but not body.
       // Step 513 showed body lines 691-700+.
       
       // I need to make sure I update all components.
       // 'text' (callsign) component seems missing from my interface if it needs updating.
       // But if it's strictly offset from dataText, maybe it's fine.
       
       // Vector Line, Trail Dots updates...
       // I'll copy the logic from Game.ts later. For now I'll stub the complex math or rely on copied code if I have it.
       // I don't have full `updateAircraftDisplay` body in context.
       // I should view it before writing TrafficManager completely.
    }
    
    // ... Copy isBehind, getWakeSep, checkSeparations, resolveLabelOverlaps ...
    // Since I don't have full code for updateAircraftDisplay, I should read it first.
    
    private isBehind(leader: Aircraft, follower: Aircraft): boolean {
        const dx = follower.x - leader.x;
        const dy = follower.y - leader.y;
        const hRad = leader.heading * (Math.PI / 180);
        const vx = Math.sin(hRad);
        const vy = Math.cos(hRad);
        const dot = (dx * vx) + (dy * vy);
        return dot < 0; 
    }

    private getWakeSep(leaderCat: string, followerCat: string): number {
        if (leaderCat === 'S') return (followerCat === 'H' ? 6 : followerCat === 'M' ? 7 : followerCat === 'L' ? 8 : 3);
        if (leaderCat === 'H') return (followerCat === 'H' ? 4 : followerCat === 'M' ? 5 : followerCat === 'L' ? 6 : 3);
        if (leaderCat === 'M' && followerCat === 'L') return 5;
        return 3;
    }

    private checkSeparations() {
        for (let i = 0; i < this.aircrafts.length; i++) {
            for (let j = i + 1; j < this.aircrafts.length; j++) {
                const ac1 = this.aircrafts[i];
                const ac2 = this.aircrafts[j];
                const dist = ac1.logic.distanceTo(ac2.logic);
                const vDist = ac1.logic.verticalDistanceTo(ac2.logic);
                if (vDist >= 1000) continue;

                let requiredSep = 3.0;
                if (this.isBehind(ac1.logic, ac2.logic)) requiredSep = Math.max(requiredSep, this.getWakeSep(ac1.logic.wakeTurbulence, ac2.logic.wakeTurbulence));
                else if (this.isBehind(ac2.logic, ac1.logic)) requiredSep = Math.max(requiredSep, this.getWakeSep(ac2.logic.wakeTurbulence, ac1.logic.wakeTurbulence));

                if (dist < requiredSep) {
                    this.setAircraftColor(ac1, 0xff0000, '#ff0000');
                    this.setAircraftColor(ac2, 0xff0000, '#ff0000');
                } else if (dist < requiredSep + 1.5) {
                    // check current color? logic needs access to style?
                    // assuming simple overwrite for now
                    this.setAircraftColor(ac1, 0xffff00, '#ffff00');
                    this.setAircraftColor(ac2, 0xffff00, '#ffff00');
                }
            }
        }
    }

    private setAircraftColor(ac: AircraftEntity, colorHex: number, colorStr: string) {
        ac.components.dataText.setColor(colorStr);
        ac.components.vectorLine.setStrokeStyle(1, colorHex, 0.5);
        ac.components.leaderLine.setStrokeStyle(1, colorHex);
        ac.components.jRing.setStrokeStyle(0.5, colorHex, 0.3);
        ac.components.trailDots.forEach((dot, i) => {
             dot.setFillStyle(colorHex, 0.5 - i * 0.1);
        });
    }

    private resolveLabelOverlaps() {
         const defaultOffset = new Phaser.Math.Vector2(20, -20);
         const forceStrength = 0.5; 
         const returnStrength = 0.05; 
         const minDistance = 50; 

         for (let i = 0; i < this.aircrafts.length; i++) {
            const ac1 = this.aircrafts[i];
            const force = new Phaser.Math.Vector2(0, 0);
            const distToDefault = defaultOffset.clone().subtract(ac1.tagOffset);
            force.add(distToDefault.scale(returnStrength));

            const p1 = new Phaser.Math.Vector2(ac1.visual.x + ac1.tagOffset.x, ac1.visual.y + ac1.tagOffset.y);

            for (let j = 0; j < this.aircrafts.length; j++) {
                if (i === j) continue;
                const ac2 = this.aircrafts[j];
                const p2 = new Phaser.Math.Vector2(ac2.visual.x + ac2.tagOffset.x, ac2.visual.y + ac2.tagOffset.y);
                const diff = p1.clone().subtract(p2);
                const dist = diff.length();

                if (dist < minDistance) {
                    if (dist < 0.1) diff.setTo(Math.random() - 0.5, Math.random() - 0.5).normalize();
                    const repel = diff.normalize().scale((minDistance - dist) * forceStrength);
                    force.add(repel);
                }
            }
            ac1.tagOffset.add(force);
            const len = ac1.tagOffset.length();
            if (len < 20) ac1.tagOffset.setLength(20);
            if (len > 80) ac1.tagOffset.setLength(80);
        }
    }
}
