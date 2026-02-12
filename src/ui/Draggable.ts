export class DraggableWindow {
    private element: HTMLElement;
    private handle: HTMLElement;
    private isDragging: boolean = false;
    private dragOffsetX: number = 0;
    private dragOffsetY: number = 0;

    constructor(elementOrId: string | HTMLElement, handleSelector: string) {
        if (typeof elementOrId === 'string') {
            this.element = document.getElementById(elementOrId)!;
        } else {
            this.element = elementOrId;
        }

        if (!this.element) {
            console.error('DraggableWindow: Element not found');
            return;
        }

        this.handle = this.element.querySelector(handleSelector) as HTMLElement;
        if (!this.handle) {
            console.warn('DraggableWindow: Handle not found, using element itself');
            this.handle = this.element;
        }

        this.init();
    }

    private init() {
        this.handle.style.cursor = 'grab';
        
        this.handle.addEventListener('pointerdown', (e) => this.onPointerDown(e));
        document.addEventListener('pointermove', (e) => this.onPointerMove(e));
        document.addEventListener('pointerup', () => this.onPointerUp());
    }

    private onPointerDown(e: PointerEvent) {
        this.isDragging = true;
        this.handle.style.cursor = 'grabbing';

        // Calculate offset
        const rect = this.element.getBoundingClientRect();
        this.dragOffsetX = e.clientX - rect.left;
        this.dragOffsetY = e.clientY - rect.top;

        // Convert current position to absolute top/left if it isn't already
        // This handles cases where bottom/right were used for positioning
        this.element.style.left = rect.left + 'px';
        this.element.style.top = rect.top + 'px';
        this.element.style.bottom = 'auto';
        this.element.style.right = 'auto';
        this.element.style.margin = '0';
        
        // Disable text selection during drag
        document.body.style.userSelect = 'none';
        
        e.preventDefault(); // Prevent default touch actions
    }

    private onPointerMove(e: PointerEvent) {
        if (!this.isDragging) return;

        const x = e.clientX - this.dragOffsetX;
        const y = e.clientY - this.dragOffsetY;

        this.element.style.left = `${x}px`;
        this.element.style.top = `${y}px`;
    }

    private onPointerUp() {
        if (!this.isDragging) return;
        
        this.isDragging = false;
        this.handle.style.cursor = 'grab';
        document.body.style.userSelect = '';
        
        // Optional: Ensure it stays within viewport?
    }
}
