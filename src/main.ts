import StartGame from './game/main';
import { DraggableWindow } from './ui/Draggable';

document.addEventListener('DOMContentLoaded', () => {

    StartGame('game-container');

    // Initialize Draggable Windows
    new DraggableWindow('comm-log-panel', '.panel-header');
    new DraggableWindow('control-panel', '.panel-header');
});