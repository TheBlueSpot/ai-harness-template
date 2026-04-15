// src/state.ts
import * as Constants from './constants';

export interface Position {
    x: number;
    y: number;
}

export interface SnakeSegment extends Position {}

export interface Food extends Position {}

export interface Powerup extends Position {
    type: 'speedBoost' | 'slowMotion' | 'doublePoints' | 'invincibility' | 'magnet';
    activeUntil?: number; // Timestamp when powerup expires
}

export interface GameState {
    snake: SnakeSegment[];
    food: Food;
    powerups: Powerup[];
    currentDirection: 'up' | 'down' | 'left' | 'right';
    nextDirection: 'up' | 'down' | 'left' | 'right'; // For preventing immediate reverse
    score: number;
    gameOver: boolean;
    lastMoveTime: number;
    snakeSpeed: number; // Milliseconds per move
    activePowerups: Powerup[];
    lastPowerupSpawnTime: number;
}

export let gameState: GameState;

export function initializeState() {
    const head: SnakeSegment = { x: Math.floor(Constants.CANVAS_WIDTH / 2 / Constants.GRID_SIZE) * Constants.GRID_SIZE, y: Math.floor(Constants.CANVAS_HEIGHT / 2 / Constants.GRID_SIZE) * Constants.GRID_SIZE };
    const snake: SnakeSegment[] = [];
    for (let i = 0; i < Constants.INITIAL_SNAKE_LENGTH; i++) {
        snake.push({ x: head.x, y: head.y + i * Constants.GRID_SIZE });
    }

    gameState = {
        snake: snake,
        food: generateFoodPosition(snake, []), // Generate initial food
        powerups: [],
        currentDirection: 'up',
        nextDirection: 'up',
        score: 0,
        gameOver: false,
        lastMoveTime: 0,
        snakeSpeed: Constants.INITIAL_SNAKE_SPEED,
        activePowerups: [],
        lastPowerupSpawnTime: 0,
    };
}

export function generateFoodPosition(snake: SnakeSegment[], powerups: Powerup[]): Food {
    let newFoodPosition: Food;
    let collision: boolean;

    do {
        collision = false;
        newFoodPosition = {
            x: Math.floor(Math.random() * (Constants.CANVAS_WIDTH / Constants.GRID_SIZE)) * Constants.GRID_SIZE,
            y: Math.floor(Math.random() * (Constants.CANVAS_HEIGHT / Constants.GRID_SIZE)) * Constants.GRID_SIZE,
        };

        // Check collision with snake
        for (const segment of snake) {
            if (segment.x === newFoodPosition.x && segment.y === newFoodPosition.y) {
                collision = true;
                break;
            }
        }

        // Check collision with powerups
        if (!collision) {
            for (const powerup of powerups) {
                if (powerup.x === newFoodPosition.x && powerup.y === newFoodPosition.y) {
                    collision = true;
                    break;
                }
            }
        }
    } while (collision);

    return newFoodPosition;
}

export function generatePowerupPosition(snake: SnakeSegment[], food: Food, existingPowerups: Powerup[]): Position {
    let newPowerupPosition: Position;
    let collision: boolean;

    do {
        collision = false;
        newPowerupPosition = {
            x: Math.floor(Math.random() * (Constants.CANVAS_WIDTH / Constants.GRID_SIZE)) * Constants.GRID_SIZE,
            y: Math.floor(Math.random() * (Constants.CANVAS_HEIGHT / Constants.GRID_SIZE)) * Constants.GRID_SIZE,
        };

        // Check collision with snake
        for (const segment of snake) {
            if (segment.x === newPowerupPosition.x && segment.y === newPowerupPosition.y) {
                collision = true;
                break;
            }
        }

        // Check collision with food
        if (!collision && newPowerupPosition.x === food.x && newPowerupPosition.y === food.y) {
            collision = true;
        }

        // Check collision with other powerups
        if (!collision) {
            for (const powerup of existingPowerups) {
                if (powerup.x === newPowerupPosition.x && newPowerupPosition.y === powerup.y) {
                    collision = true;
                    break;
                }
            }
        }

    } while (collision);

    return newPowerupPosition;
}
