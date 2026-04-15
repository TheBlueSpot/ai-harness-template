// src/entities/Enemy.ts
import { Level, LevelData } from './Level'; // Assuming Level is in the same directory

// Define base Entity properties
interface BaseEntity {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: string;
}

export enum EnemyState {
  IDLE,
  PATROLLING,
  CHASING,
  ATTACKING,
}

export class Enemy implements BaseEntity {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: string = 'enemy';
  state: EnemyState = EnemyState.PATROLLING;
  // Add movement properties
  speed: number = 50; // pixels per second
  direction: number = 1; // 1 for right, -1 for left
  patrolRange: number = 100; // pixels
  patrolStartX: number;

  constructor(
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
    // Optionally pass initial patrol start position if different from x
    patrolStartX?: number
  ) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.patrolStartX = patrolStartX === undefined ? x : patrolStartX;
  }

  update(dt: number, level: Level): void {
    // Basic patrolling AI: move back and forth within patrolRange
    if (this.state === EnemyState.PATROLLING) {
      this.x += this.direction * this.speed * dt;

      // Check patrol boundaries
      if (
        this.direction === 1 &&
        this.x >= this.patrolStartX + this.patrolRange
      ) {
        this.x = this.patrolStartX + this.patrolRange;
        this.direction = -1;
      } else if (
        this.direction === -1 &&
        this.x <= this.patrolStartX - this.patrolRange
      ) {
        this.x = this.patrolStartX - this.patrolRange;
        this.direction = 1;
      }

      // TODO: Add collision detection with level tiles and dynamic adjustments
      // For now, assume simple movement without obstacles
    }
    // More AI states would be implemented here (chasing player, attacking, etc.)
  }

  // Basic render representation (will be handled by a renderer component)
  // This method is illustrative and might be part of a separate Renderer system
  render(context: CanvasRenderingContext2D): void {
    context.fillStyle = 'red'; // Primitive shape color
    context.fillRect(this.x, this.y, this.width, this.height);
  }
}

// Function to create enemies from level data
export function createEnemiesFromLevel(levelData: LevelData): Enemy[] {
  const enemies: Enemy[] = [];
  let enemyCount = 0;
  levelData.entities.forEach((entityData) => {
    if (entityData.type === 'enemy') {
      enemyCount++;
      enemies.push(
        new Enemy(
          `enemy-${enemyCount}`,
          entityData.x,
          entityData.y,
          32, // Default enemy width
          32, // Default enemy height
          entityData.x // Assume entityData.x is the start of patrol
        )
      );
    }
  });
  return enemies;
}
