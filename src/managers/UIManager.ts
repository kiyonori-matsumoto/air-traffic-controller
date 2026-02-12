
import { Aircraft } from '../models/Aircraft';

export class UIManager {
    private sidebar: HTMLElement | null;
    private uiCallsign: HTMLElement | null;
    private inputHeading: HTMLInputElement | null;
    private valHeading: HTMLElement | null;
    private inputAltitude: HTMLInputElement | null;
    private valAltitude: HTMLElement | null;
    private inputSpeed: HTMLInputElement | null;
    private valSpeed: HTMLElement | null;
    private inputCommand: HTMLInputElement | null;
    private commMessages: HTMLElement | null;

    constructor(
        private callbacks: {
            onCommand: (cmd: string) => void;
            onTimeScaleChange: (scale: number) => void;
            onHeadingChange: (val: number) => void;
            onAltitudeChange: (val: number) => void;
            onSpeedChange: (val: number) => void;
            onContactTower: () => void;
        }
    ) {
        // UI参照
        this.sidebar = document.getElementById('control-panel');
        this.uiCallsign = document.getElementById('ui-callsign');
        this.inputHeading = document.getElementById('input-heading') as HTMLInputElement;
        this.valHeading = document.getElementById('val-heading');
        this.inputAltitude = document.getElementById('input-altitude') as HTMLInputElement;
        this.valAltitude = document.getElementById('val-altitude');
        this.inputSpeed = document.getElementById('input-speed') as HTMLInputElement;
        this.valSpeed = document.getElementById('val-speed');
        this.inputCommand = document.getElementById('input-command') as HTMLInputElement;
        this.commMessages = document.getElementById('comm-messages');

        this.setupEventListeners();
    }

    private setupEventListeners() {
        if (!this.inputHeading || !this.inputAltitude || !this.inputSpeed || !this.inputCommand) return;

        // Speed Buttons
        const speedButtons = ['1', '2', '4'];
        speedButtons.forEach(s => {
            const btn = document.getElementById(`btn-speed-${s}`);
            btn?.addEventListener('click', () => {
                this.callbacks.onTimeScaleChange(parseInt(s));
                speedButtons.forEach(sb => {
                    document.getElementById(`btn-speed-${sb}`)?.classList.toggle('active', sb === s);
                });
            });
        });

        // Input Events
        this.inputHeading.addEventListener('input', (e) => {
            const val = parseInt((e.target as HTMLInputElement).value);
            if (this.valHeading) this.valHeading.innerText = val.toString().padStart(3, '0');
            this.callbacks.onHeadingChange(val);
        });

        this.inputAltitude.addEventListener('input', (e) => {
            const val = parseInt((e.target as HTMLInputElement).value);
            if (this.valAltitude) this.valAltitude.innerText = val.toString().padStart(5, '0');
            this.callbacks.onAltitudeChange(val);
        });

        this.inputSpeed.addEventListener('input', (e) => {
            const val = parseInt((e.target as HTMLInputElement).value);
            if (this.valSpeed) this.valSpeed.innerText = val.toString().padStart(3, '0');
            this.callbacks.onSpeedChange(val);
        });

        // Command Input
        this.inputCommand.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (this.inputCommand) {
                    this.callbacks.onCommand(this.inputCommand.value);
                    this.inputCommand.value = '';
                }
            }
        });

        // Contact Tower
        document.getElementById('btn-contact-tower')?.addEventListener('click', () => {
            this.callbacks.onContactTower();
        });
    }

    public addLog(msg: string, type: 'system' | 'atc' | 'pilot' = 'system') {
        if (!this.commMessages) return;
        
        const div = document.createElement('div');
        div.classList.add('msg', type);
        
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
        
        div.innerHTML = `<span class="timestamp">[${timeStr}]</span> ${msg}`;
        
        this.commMessages.appendChild(div);
        this.commMessages.scrollTop = this.commMessages.scrollHeight;
    }

    public updateSidebar(ac: Aircraft | null) {
        if (!this.sidebar || !this.uiCallsign || !this.inputHeading || !this.inputAltitude || !this.inputSpeed || !this.valHeading || !this.valAltitude || !this.valSpeed || !this.inputCommand) return;

        if (!ac) {
            this.sidebar.classList.remove('visible');
            return;
        }

        this.sidebar.classList.add('visible');
        this.uiCallsign.innerText = ac.callsign;
        
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
        
        this.inputCommand.value = ''; 
    }
    
    public isCommandInputFocused(): boolean {
        return document.activeElement === this.inputCommand;
    }
}
