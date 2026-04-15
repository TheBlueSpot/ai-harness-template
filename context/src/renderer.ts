// src/renderer.ts
import * as State from './state';
import * as Constants from './constants';

export function render(ctx: CanvasRenderingContext2D, state: State.GameState) {
    // Clear canvas
    ctx.clearRect(0, 0, Constants.CANVAS_WIDTH, Constants.CANVAS_HEIGHT);

    // Draw food
    drawNeonShape(ctx, state.food.x, state.food.y, Constants.FOOD_COLOR, 'circle');

    // Draw powerups
    for (const powerup of state.powerups) {
        let color = Constants.POWERUP_COLOR;
        let shape: 'square' | 'circle' | 'triangle' = 'square';
        switch (powerup.type) {
            case 'speedBoost': color = "#00FF00"; shape = 'triangle'; break; // Green triangle
            case 'slowMotion': color = "#FFA500"; shape = 'triangle'; break; // Orange triangle
            case 'doublePoints': color = "#8A2BE2"; shape = 'square'; break; // BlueViolet square
            case 'invincibility': color = "#FFC0CB"; shape = 'circle'; break; // Pink circle
            case 'magnet': color = "#808080"; shape = 'square'; break; // Grey square
        }
        drawNeonShape(ctx, powerup.x, powerup.y, color, shape);
    }

    // Draw snake
    const snakeColor = state.activePowerups.some(p => p.type === 'invincibility') ? Constants.INVINCIBLE_SNAKE_COLOR : Constants.DEFAULT_SNAKE_COLOR;
    for (let i = 0; i < state.snake.length; i++) {
        const segment = state.snake[i];
        // Head can be a different shape or size
        if (i === 0) {
            drawNeonShape(ctx, segment.x, segment.y, snakeColor, 'head');
        } else {
            drawNeonShape(ctx, segment.x, segment.y, snakeColor, 'square');
        }
    }

    // Draw score
    ctx.fillStyle = "#FFF";
    ctx.font = "24px 'Press Start 2P', cursive"; // Using a retro-style font
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.shadowColor = Constants.NEON_GLOW_COLOR;
    ctx.shadowBlur = Constants.NEON_GLOW_BLUR / 2;
    ctx.fillText(`Score: ${state.score}`, 10, 10);
    ctx.shadowBlur = 0; // Reset shadow blur

    // Draw active powerups text
    if (state.activePowerups.length > 0) {
        ctx.font = "16px 'Press Start 2P', cursive";
        ctx.textAlign = "right";
        let yOffset = 10;
        for (const p of state.activePowerups) {
            ctx.fillText(`${p.type} active`, Constants.CANVAS_WIDTH - 10, yOffset);
            yOffset += 20;
        }
    }


    // Draw Game Over screen
    if (state.gameOver) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(0, 0, Constants.CANVAS_WIDTH, Constants.CANVAS_HEIGHT);

        ctx.fillStyle = "#FF0000"; // Red for Game Over
        ctx.font = "48px 'Press Start 2P', cursive";
        ctx.textAlign = "center";
        ctx.shadowColor = "#FF0000";
        ctx.shadowBlur = Constants.NEON_GLOW_BLUR;
        ctx.fillText("GAME OVER", Constants.CANVAS_WIDTH / 2, Constants.CANVAS_HEIGHT / 2 - 30);

        ctx.fillStyle = "#FFF";
        ctx.font = "24px 'Press Start 2P', cursive";
        ctx.fillText(`Final Score: ${state.score}`, Constants.CANVAS_WIDTH / 2, Constants.CANVAS_HEIGHT / 2 + 20);
        ctx.shadowBlur = 0; // Reset shadow blur
    }
}

function drawNeonShape(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, shape: 'square' | 'circle' | 'triangle' | 'head') {
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = Constants.NEON_GLOW_BLUR;

    const size = Constants.GRID_SIZE;

    switch (shape) {
        case 'square':
            ctx.fillRect(x, y, size, size);
            break;
        case 'circle':
            ctx.beginPath();
            ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
            ctx.fill();
            break;
        case 'triangle':
            ctx.beginPath();
            ctx.moveTo(x + size / 2, y);
            ctx.lineTo(x + size, y + size);
            ctx.lineTo(x, y + size);
            ctx.closePath();
            ctx.fill();
            break;
        case 'head':
            // Example: A slightly larger square or a custom shape for the head
            ctx.fillRect(x, y, size, size);
            break;
    }

    ctx.shadowBlur = 0; // Reset shadow blur after drawing each shape
}
