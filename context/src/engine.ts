// src/engine.ts
import * as State from './state';
import * as Constants from './constants';
import * as Powerups from './powerups';

export function update(state: State.GameState, deltaTime: number) {
    if (state.gameOver) {
        return;
    }

    // Handle powerup spawning
    if (Date.now() - state.lastPowerupSpawnTime > Constants.POWERUP_SPAWN_INTERVAL) {
        spawnRandomPowerup(state);
        state.lastPowerupSpawnTime = Date.now();
    }

    // Apply magnet effect if active
    Powerups.applyMagnetEffect(state);

    state.lastMoveTime += deltaTime;

    if (state.lastMoveTime >= state.snakeSpeed) {
        state.lastMoveTime = 0;
        moveSnake(state);
        checkCollisions(state);
        Powerups.updateActivePowerups(state);
    }
}

export function handleInput(state: State.GameState, key: string) {
    const currentDirection = state.currentDirection;
    switch (key) {
        case 'ArrowUp':
            if (currentDirection !== 'down') state.nextDirection = 'up';
            break;
        case 'ArrowDown':
            if (currentDirection !== 'up') state.nextDirection = 'down';
            break;
        case 'ArrowLeft':
            if (currentDirection !== 'right') state.nextDirection = 'left';
            break;
        case 'ArrowRight':
            if (currentDirection !== 'left') state.nextDirection = 'right';
            break;
    }
}

function moveSnake(state: State.GameState) {
    const head = { ...state.snake[0] };

    state.currentDirection = state.nextDirection;

    switch (state.currentDirection) {
        case 'up':
            head.y -= Constants.GRID_SIZE;
            break;
        case 'down':
            head.y += Constants.GRID_SIZE;
            break;
        case 'left':
            head.x -= Constants.GRID_SIZE;
            break;
        case 'right':
            head.x += Constants.GRID_SIZE;
            break;
    }

    // Wrap around screen boundaries (no walls)
    if (head.x < 0) {
        head.x = Constants.CANVAS_WIDTH - Constants.GRID_SIZE;
    } else if (head.x >= Constants.CANVAS_WIDTH) {
        head.x = 0;
    }
    if (head.y < 0) {
        head.y = Constants.CANVAS_HEIGHT - Constants.GRID_SIZE;
    } else if (head.y >= Constants.CANVAS_HEIGHT) {
        head.y = 0;
    }

    state.snake.unshift(head); // Add new head

    // Check if food is eaten
    if (head.x === state.food.x && head.y === state.food.y) {
        Powerups.applyDoublePoints(state);
        state.score += (state.activePowerups.some(p => p.type === 'doublePoints') ? 2 : 1);
        state.food = State.generateFoodPosition(state.snake, state.powerups);
    } else {
        state.snake.pop(); // Remove tail if no food eaten
    }

    // Check if powerup is eaten
    const eatenPowerupIndex = state.powerups.findIndex(p => p.x === head.x && p.y === head.y);
    if (eatenPowerupIndex !== -1) {
        const eatenPowerup = state.powerups.splice(eatenPowerupIndex, 1)[0];
        Powerups.activatePowerup(state, eatenPowerup.type);
    }
}

function checkCollisions(state: State.GameState) {
    const head = state.snake[0];

    // Check collision with self
    for (let i = 1; i < state.snake.length; i++) {
        if (head.x === state.snake[i].x && head.y === state.snake[i].y) {
            if (!state.activePowerups.some(p => p.type === 'invincibility')) {
                state.gameOver = true;
                console.log("Game Over! Collided with self.");
                return;
            } else {
                // If invincible, remove the collided segment and shorten snake
                state.snake.splice(i, 1);
                console.log("Invincible! Collided with self but survived.");
            }
        }
    }
}

function spawnRandomPowerup(state: State.GameState) {
    const powerupTypes: State.Powerup['type'][] = [
        'speedBoost', 'slowMotion', 'doublePoints', 'invincibility', 'magnet'
    ];
    const randomType = powerupTypes[Math.floor(Math.random() * powerupTypes.length)];
    const position = State.generatePowerupPosition(state.snake, state.food, state.powerups);

    state.powerups.push({
        x: position.x,
        y: position.y,
        type: randomType,
    });
}
