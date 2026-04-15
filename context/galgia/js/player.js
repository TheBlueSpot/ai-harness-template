// galgia/js/player.js

import * as THREE from 'three';
import { Bullets } from './bullets.js';
import { Animations } from './animations.js';
import { lerp } from './utils.js';

const PLAYER_SPEED = 5;
const PLAYER_FIRE_RATE = 0.2; // Seconds between shots
const PLAYER_LERP_FACTOR = 0.1; // For smooth movement

export class Player {
    constructor(scene) {
        this.scene = scene;
        this.mesh = this.createPlayerMesh();
        this.scene.add(this.mesh);

        this.positionTarget = new THREE.Vector3(0, -3, 0);
        this.mesh.position.copy(this.positionTarget);

        this.lastFireTime = 0;
        this.isFiring = false;
        this.isAlive = true;

        this.setupKeyboardControls();
    }

    createPlayerMesh() {
        const geometry = new THREE.ConeGeometry(0.5, 1, 8);
        const material = new THREE.MeshStandardMaterial({ color: 0x00ff00, flatShading: true });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = Math.PI;
        mesh.name = 'player';
        return mesh;
    }

    setupKeyboardControls() {
        document.addEventListener('keydown', (event) => {
            switch (event.code) {
                case 'ArrowLeft':
                case 'KeyA':
                    this.moveLeft = true;
                    break;
                case 'ArrowRight':
                case 'KeyD':
                    this.moveRight = true;
                    break;
                case 'Space':
                    this.isFiring = true;
                    break;
            }
        });

        document.addEventListener('keyup', (event) => {
            switch (event.code) {
                case 'ArrowLeft':
                case 'KeyA':
                    this.moveLeft = false;
                    break;
                case 'ArrowRight':
                case 'KeyD':
                    this.moveRight = false;
                    break;
                case 'Space':
                    this.isFiring = false;
                    break;
            }
        });
    }

    update(deltaTime, currentTime) {
        if (!this.isAlive) return;

        // Update target position based on input
        if (this.moveLeft) {
            this.positionTarget.x -= PLAYER_SPEED * deltaTime;
        }
        if (this.moveRight) {
            this.positionTarget.x += PLAYER_SPEED * deltaTime;
        }

        // Clamp player position to screen bounds (e.g., -5 to 5 on X axis)
        this.positionTarget.x = Math.max(-4, Math.min(4, this.positionTarget.x));

        // Smoothly interpolate player mesh position towards target
        this.mesh.position.x = lerp(this.mesh.position.x, this.positionTarget.x, PLAYER_LERP_FACTOR);

        // Fire bullets
        if (this.isFiring && currentTime - this.lastFireTime > PLAYER_FIRE_RATE) {
            Bullets.createPlayerBullet(this.scene, this.mesh.position.clone().add(new THREE.Vector3(0, 0.5, 0)));
            Animations.pulse(this.mesh, 0.2, 1.1, 0.1); // Small pulse on firing
            this.lastFireTime = currentTime;
        }
    }

    takeHit() {
        if (!this.isAlive) return;
        this.isAlive = false;
        console.log('Player hit!');
        Animations.flash(this.mesh, 0xff0000, 0.5); // Red flash on hit
        // Trigger game over logic in main.js
    }

    getMesh() {
        return this.mesh;
    }

    reset() {
        this.isAlive = true;
        this.mesh.position.set(0, -3, 0);
        this.positionTarget.set(0, -3, 0);
        this.moveLeft = false;
        this.moveRight = false;
        this.isFiring = false;
        this.lastFireTime = 0;
    }
}
