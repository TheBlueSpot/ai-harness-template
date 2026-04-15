// src/game/entities/TractorBeam.ts

// Assuming interfaces like GameEntity, PlayerShip, BossGalagaShip are defined in a common types file
// For example: import { GameEntity, PlayerShip, BossGalagaShip } from '../types';

// Placeholder interfaces if not globally available:
interface GameEntity {
  id: string;
  x: number;
  y: number;
  update(deltaTime: number): void;
  render(context: CanvasRenderingContext2D): void;
}

interface PlayerShip extends GameEntity {
  isCaptured: boolean;
  capture(beam: TractorBeam): void;
  release(): void;
}

interface BossGalagaShip extends GameEntity {
  // Method to activate the tractor beam, potentially targeting a ship
  activateTractorBeam(targetShip?: PlayerShip): TractorBeam | null;
  // Method to deactivate the beam if needed
  deactivateTractorBeam(): void;
  // Potentially a property to hold the active beam
  activeBeam: TractorBeam | null;
}

export class TractorBeam implements GameEntity {
  id: string;
  isActive: boolean = false; // Beam starts inactive
  origin: { x: number; y: number };
  target: PlayerShip | null = null;
  strength: number; // Pixels per second for pulling
  duration: number; // Seconds the beam lasts
  elapsedTime: number = 0;

  constructor(origin: { x: number; y: number }, id: string = `tractor-beam-${Math.random().toString(36).substr(2, 9)}`) {
    this.id = id;
    this.origin = origin;
    this.strength = 70; // Adjust as needed
    this.duration = 4; // Adjust as needed
  }

  /**
   * Initiates the tractor beam targeting a specific player ship.
   * @param target The PlayerShip to capture.
   */
  start(target: PlayerShip): void {
    if (this.isActive || this.target) {
      console.warn(`Tractor beam ${this.id} is already active or targeting.`);
      return; // Already active or targeting something
    }
    this.isActive = true;
    this.target = target;
    this.elapsedTime = 0;
    target.capture(this); // Signal the ship it's captured
    console.log(`Tractor beam ${this.id} started, targeting ${target.id}`);
  }

  /**
   * Stops the tractor beam and releases the target.
   */
  stop(): void {
    if (!this.isActive) {
      return;
    }
    this.isActive = false;
    if (this.target) {
      this.target.release(); // Signal the ship to release
      this.target = null;
      console.log(`Tractor beam ${this.id} stopped.`);
    }
  }

  update(deltaTime: number): void {
    if (!this.isActive || !this.target) {
      return;
    }

    this.elapsedTime += deltaTime;

    // Check for beam expiration
    if (this.elapsedTime >= this.duration) {
      this.stop();
      return;
    }

    // Move target towards origin
    const dx = this.origin.x - this.target.x;
    const dy = this.origin.y - this.target.y;
    const distanceToOrigin = Math.sqrt(dx * dx + dy * dy);

    // If the target is very close to the origin, consider it captured fully.
    // The BossGalagaShip logic will handle the final capture state.
    const captureThreshold = 20; // Pixels
    if (distanceToOrigin <= captureThreshold) {
      // Ensure target is exactly at origin to prevent visual jitter
      this.target.x = this.origin.x;
      this.target.y = this.origin.y;
      console.log(`Tractor beam ${this.id}: Target reached origin. Awaiting BossGalagaShip action.`);
      // The beam continues to be active until its duration ends or BossGalagaShip stops it.
      // The PlayerShip remains captured until released.
    } else {
      // Pull the target towards the origin at a fixed speed
      const pullSpeed = this.strength;
      const moveDistance = pullSpeed * deltaTime;
      // Calculate movement vector, ensuring we don't overshoot the origin
      const actualMoveX = (dx / distanceToOrigin) * Math.min(moveDistance, distanceToOrigin);
      const actualMoveY = (dy / distanceToOrigin) * Math.min(moveDistance, distanceToOrigin);

      this.target.x += actualMoveX;
      this.target.y += actualMoveY;
    }
  }

  render(context: CanvasRenderingContext2D): void {
    if (!this.isActive || !this.target) {
      return;
    }

    // Visual representation of the beam
    context.save();
    context.strokeStyle = 'rgba(255, 255, 0, 0.6)'; // Yellowish, semi-transparent
    context.lineWidth = 8; // Thicker beam
    context.lineCap = 'round';

    context.beginPath();
    context.moveTo(this.origin.x, this.origin.y);
    context.lineTo(this.target.x, this.target.y);
    context.stroke();

    context.restore();
  }
}

/*
 * Usage Notes:
 * 
 * 1. BossGalagaShip Implementation:
 *    - Needs a property like `activeBeam: TractorBeam | null = null;`
 *    - `activateTractorBeam(targetShip?: PlayerShip): TractorBeam | null` method:
 *      - If `activeBeam` is null or inactive, create a new `TractorBeam` instance.
 *      - Set `activeBeam.origin` to the BossGalagaShip's position.
 *      - If `targetShip` is provided and valid, call `activeBeam.start(targetShip)`.
 *      - Return the `activeBeam`.
 *    - `deactivateTractorBeam()` method:
 *      - If `activeBeam` exists, call `activeBeam.stop()` and set `activeBeam = null`.
 *    - In its `update(deltaTime)` method:
 *      - Update `activeBeam.origin = { x: this.x, y: this.y };` if `activeBeam` is active.
 *      - Call `activeBeam.update(deltaTime)`.
 *      - If `activeBeam` becomes inactive after update (e.g., duration ended), set `activeBeam = null`.
 *      - Implement logic for when a target reaches the origin (e.g., perform capture, score, etc.).
 *
 * 2. PlayerShip Implementation:
 *    - Needs properties `isCaptured: boolean = false;` and `currentBeam: TractorBeam | null = null;`
 *    - `capture(beam: TractorBeam)` method:
 *      - Set `this.isCaptured = true;`
 *      - Set `this.currentBeam = beam;`
 *      - Potentially disable player controls.
 *    - `release()` method:
 *      - Set `this.isCaptured = false;`
 *      - Set `this.currentBeam = null;`
 *      - Potentially re-enable player controls.
 *    - In its `update(deltaTime)` method:
 *      - If `isCaptured` is true, player input should be ignored, and the ship's position should be managed by the `TractorBeam.update()` method.
 *
 * 3. Rendering:
 *    - The game loop should call `render()` on the `TractorBeam` instance if it is active.
 *
 * 4. Verification:
 *    - Run `bunx tsc --noEmit` to check TypeScript compilation.
 */
