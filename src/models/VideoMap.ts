export interface MapLine {
    type: 'COASTLINE' | 'SECTOR' | 'RESTRICTED';
    points: {x: number, y: number}[]; // NM from center
}

export class VideoMap {
    public lines: MapLine[] = [];

    constructor() {
        this.loadSampleData();
    }

    private loadSampleData() {
        // Tokyo Bay (Simplified Coastline)
        this.lines.push({
            type: 'COASTLINE',
            points: [
                {x: -10, y: 15}, {x: -5, y: 10}, {x: 0, y: 8}, {x: 5, y: 10}, 
                {x: 10, y: 15}, {x: 15, y: 12}, {x: 20, y: 5}, {x: 18, y: 0},
                {x: 20, y: -10}, {x: 15, y: -15}, {x: 10, y: -20}, {x: 5, y: -18},
                {x: 0, y: -20}, {x: -8, y: -18}, {x: -15, y: -10}, {x: -12, y: 0},
                {x: -15, y: 5}, {x: -10, y: 15}
            ]
        });

        // Boso Peninsula (Right side)
        this.lines.push({
            type: 'COASTLINE',
            points: [
                {x: 25, y: 20}, {x: 30, y: 10}, {x: 35, y: 0}, {x: 30, y: -10}, {x: 25, y: -20}
            ]
        });

        // Miura Peninsula (Left side)
        this.lines.push({
            type: 'COASTLINE',
            points: [
                {x: -20, y: 20}, {x: -25, y: 10}, {x: -22, y: 0}, {x: -25, y: -10}, {x: -20, y: -20}
            ]
        });

        // // Sector Boundary (Hypothetical)
        // this.lines.push({
        //     type: 'SECTOR',
        //     points: [
        //         {x: -40, y: 40}, {x: 40, y: 40}, {x: 40, y: -40}, {x: -40, y: -40}, {x: -40, y: 40}
        //     ]
        // });
        
        // MVA / Restricted Area
        this.lines.push({
            type: 'RESTRICTED',
            points: [
                {x: -5, y: -5}, {x: 5, y: -5}, {x: 5, y: 5}, {x: -5, y: 5}, {x: -5, y: -5}
            ]
        });
    }
}
