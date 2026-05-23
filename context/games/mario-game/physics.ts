export interface Vector2D {
    x: number;
    y: number;
}

export interface PhysicsState {
    velocity: Vector2D;
}

export interface AABB {
    x: number;
    y: number;
    width: number;
    height: number;
}

const GRAVITY = 0.5; // Pixels per frame^2 (adjust as needed)
const TERMINAL_VELOCITY_Y = 15; // Max falling speed (pixels per frame)
const HORIZONTAL_DAMPING = 0.9; // Multiplier to reduce horizontal velocity per frame when no input

/**
 * Updates the physics state based on gravity and damping.
 * Assumes external forces (like player input) are applied to velocity before calling this.
 * @param state The current physics state.
 * @param deltaTime The time elapsed since the last update (defaults to 1 frame).
 * @returns The updated physics state.
 */
export function updatePhysics(state: PhysicsState, deltaTime: number = 1): PhysicsState {
    // Apply gravity
    state.velocity.y += GRAVITY * deltaTime;
    // Clamp vertical velocity to terminal velocity
    if (state.velocity.y > TERMINAL_VELOCITY_Y) {
        state.velocity.y = TERMINAL_VELOCITY_Y;
    }

    // Apply horizontal damping (friction) if there's no significant horizontal input
    // A more complete system would check for ground contact before applying friction.
    if (Math.abs(state.velocity.x) > 0.1) { // Only apply if moving significantly
        state.velocity.x *= HORIZONTAL_DAMPING;
    } else {
        state.velocity.x = 0; // Snap to zero if very slow
    }

    return state;
}

/**
 * Checks for collision between two Axis-Aligned Bounding Boxes (AABB).
 * @param a The first AABB.
 * @param b The second AABB.
 * @returns True if the boxes collide, false otherwise.
 */
export function isCollidingAABB(a: AABB, b: AABB): boolean {
    return a.x < b.x + b.width &&
           a.x + a.width > b.x &&
           a.y < b.y + b.height &&
           a.y + a.height > b.y;
}

// Example of how it might be used by a game entity.
// This is illustrative and shows integration of the physics and AABB concepts.
export class MarioEntity {
    position: Vector2D = { x: 0, y: 0 };
    physics: PhysicsState = {
        velocity: { x: 0, y: 0 },
    };
    size: Vector2D = { x: 32, y: 32 }; // Example dimensions for Mario

    // --- Methods for Input and External Forces ---
    applyHorizontalForce(force: number): void {
        this.physics.velocity.x += force;
    }

    jump(jumpForce: number): void {
        // Only allow jumping if on the ground (simplified: not falling rapidly)
        // A more robust check would involve raycasting or checking collision response from the previous frame.
        if (this.physics.velocity.y >= TERMINAL_VELOCITY_Y - 0.1) { // Approximating grounded state
            this.physics.velocity.y = -jumpForce;
        }
    }

    // --- Game Loop Integration ---
    update(deltaTime: number = 1): void {
        // 1. Apply input forces (handled by separate input system, but called here)
        // e.g., this.applyHorizontalForce(input.moveLeft ? -2 : (input.moveRight ? 2 : 0));
        // e.g., if (input.jump && isGrounded) this.jump(10);

        // 2. Update physics state (gravity, friction)
        this.physics = updatePhysics(this.physics, deltaTime);

        // 3. Update position based on velocity
        this.position.x += this.physics.velocity.x * deltaTime;
        this.position.y += this.physics.velocity.y * deltaTime;

        // 4. Collision detection and response (this would be a separate system handling multiple entities)
        // For example:
        // const otherEntities = getEntitiesInProximity(this);
        // for (const other of otherEntities) {
        //     if (other !== this && isCollidingAABB(this.getAABB(), other.getAABB())) {
        //         handleCollision(this, other); // This function would resolve position and velocity
        //     }
        // }
    }

    getAABB(): AABB {
        return {
            x: this.position.x,
            y: this.position.y,
            width: this.size.x,
            height: this.size.y,
        };
    }
}
