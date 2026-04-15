// src/powerups.ts
import * as State from './state';
import * as Constants from './constants';

const originalSnakeSpeed: { speed: number | null } = { speed: null }; // To store original speed

export function activatePowerup(state: State.GameState, type: State.Powerup['type']) {
    const currentTime = Date.now();
    const existingPowerupIndex = state.activePowerups.findIndex(p => p.type === type);

    // If powerup of this type is already active, extend its duration
    if (existingPowerupIndex !== -1 && state.activePowerups[existingPowerupIndex].activeUntil !== undefined) {
        let newActiveUntil = currentTime;
        switch (type) {
            case 'speedBoost':
                newActiveUntil += Constants.POWERUP_DURATION_SPEED_BOOST;
                break;
            case 'slowMotion':
                newActiveUntil += Constants.POWERUP_DURATION_SLOW_MOTION;
                break;
            case 'doublePoints':
                newActiveUntil += Constants.POWERUP_DURATION_DOUBLE_POINTS;
                break;
            case 'invincibility':
                newActiveUntil += Constants.POWERUP_DURATION_INVINCIBILITY;
                break;
            case 'magnet':
                newActiveUntil += Constants.POWERUP_DURATION_MAGNET;
                break;
        }
        state.activePowerups[existingPowerupIndex].activeUntil = newActiveUntil;
        console.log(`Extended ${type} powerup. New active until: ${new Date(newActiveUntil).toLocaleTimeString()}`);
        return;
    }

    // Activate new powerup
    const newPowerup: State.Powerup = { x: 0, y: 0, type: type }; // x,y not relevant for active powerups
    switch (type) {
        case 'speedBoost':
            originalSnakeSpeed.speed = state.snakeSpeed;
            state.snakeSpeed = Constants.INITIAL_SNAKE_SPEED / 2;
            newPowerup.activeUntil = currentTime + Constants.POWERUP_DURATION_SPEED_BOOST;
            break;
        case 'slowMotion':
            originalSnakeSpeed.speed = state.snakeSpeed;
            state.snakeSpeed = Constants.INITIAL_SNAKE_SPEED * 2;
            newPowerup.activeUntil = currentTime + Constants.POWERUP_DURATION_SLOW_MOTION;
            break;
        case 'doublePoints':
            newPowerup.activeUntil = currentTime + Constants.POWERUP_DURATION_DOUBLE_POINTS;
            break;
        case 'invincibility':
            newPowerup.activeUntil = currentTime + Constants.POWERUP_DURATION_INVINCIBILITY;
            break;
        case 'magnet':
            newPowerup.activeUntil = currentTime + Constants.POWERUP_DURATION_MAGNET;
            break;
    }
    state.activePowerups.push(newPowerup);
    console.log(`Activated ${type} powerup. Active until: ${new Date(newPowerup.activeUntil!).toLocaleTimeString()}`);
}

export function deactivatePowerup(state: State.GameState, type: State.Powerup['type']) {
    const index = state.activePowerups.findIndex(p => p.type === type);
    if (index !== -1) {
        const powerup = state.activePowerups.splice(index, 1)[0];
        console.log(`Deactivated ${type} powerup.`);
        // Restore original state if necessary
        switch (type) {
            case 'speedBoost':
            case 'slowMotion':
                if (originalSnakeSpeed.speed !== null) {
                    state.snakeSpeed = originalSnakeSpeed.speed;
                    originalSnakeSpeed.speed = null;
                }
                break;
        }
    }
}

export function updateActivePowerups(state: State.GameState) {
    const currentTime = Date.now();
    for (let i = state.activePowerups.length - 1; i >= 0; i--) {
        const powerup = state.activePowerups[i];
        if (powerup.activeUntil && currentTime > powerup.activeUntil) {
            deactivatePowerup(state, powerup.type);
        }
    }
}

export function applyDoublePoints(state: State.GameState) {
    // The double points logic is applied directly in engine.ts when food is eaten.
    // This function can be used to signal that the powerup is active for rendering or other checks.
}

export function applyMagnetEffect(state: State.GameState) {
    if (!state.activePowerups.some(p => p.type === 'magnet')) {
        return;
    }

    const head = state.snake[0];
    const food = state.food;
    const magnetRadius = Constants.GRID_SIZE * 5; // Magnet pulls food from 5 grid units away

    const distanceX = Math.abs(head.x - food.x);
    const distanceY = Math.abs(head.y - food.y);

    if (distanceX < magnetRadius && distanceY < magnetRadius) {
        // Move food towards snake head
        if (head.x < food.x) food.x -= Constants.GRID_SIZE;
        else if (head.x > food.x) food.x += Constants.GRID_SIZE;

        if (head.y < food.y) food.y -= Constants.GRID_SIZE;
        else if (head.y > food.y) food.y += Constants.GRID_SIZE;

        // Ensure food stays within bounds and on grid
        food.x = Math.max(0, Math.min(Constants.CANVAS_WIDTH - Constants.GRID_SIZE, food.x));
        food.y = Math.max(0, Math.min(Constants.CANVAS_HEIGHT - Constants.GRID_SIZE, food.y));

        food.x = Math.floor(food.x / Constants.GRID_SIZE) * Constants.GRID_SIZE;
        food.y = Math.floor(food.y / Constants.GRID_SIZE) * Constants.GRID_SIZE;
    }
}
