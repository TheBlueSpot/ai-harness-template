// src/main.ts
import * as Constants from './constants';
import * as State from './state';
import * as Engine from './engine';
import * as Powerups from './powerups';
import * as Renderer from './renderer';

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

canvas.width = Constants.CANVAS_WIDTH;
canvas.height = Constants.CANVAS_HEIGHT;

// Initialize game state
State.initializeState();

// Game loop
let lastTime = 0;
function gameLoop(currentTime: DOMHighResTimeStamp) {
    const deltaTime = currentTime - lastTime;
    lastTime = currentTime;

    Engine.update(State.gameState, deltaTime);
    Renderer.render(ctx, State.gameState);

    requestAnimationFrame(gameLoop);
}

// Event listeners for snake movement
document.addEventListener('keydown', (e) => {
    Engine.handleInput(State.gameState, e.key);
});

// Start the game loop
requestAnimationFrame(gameLoop);
