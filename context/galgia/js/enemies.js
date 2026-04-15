// galgia/js/enemies.js

import * as THREE from 'three';
import { Bullets } from './bullets.js';
import { Animations } from './animations.js';
import { ClusterGeometry } from './geometry.js';
import { randFloat, randInt } from './utils.js';

const ENEMY_FIRE_RATE_MIN = 3; // Seconds
const ENEMY_FIRE_RATE_MAX = 7; // Seconds
const ENEMY_SPEED = 1.5; // Base movement speed

export const Enemies = {
    enemies: [],
    scene: null,
    scorePerKill: 100,

    init(scene) {
        this.scene = scene;
        this.enemies = [];
    },

    spawnEnemy(position, type = 'basic') {
        let mesh;
        if (type === 'basic') {
            const clusterGeo = new ClusterGeometry();
            mesh = clusterGeo.createAsteroidCluster(position, 0.7, 5, 0.05, 0.15);
            mesh.traverse((child) => {
                if (child.isMesh) {
                    child.material.color.set(new THREE.Color(randFloat(0.1, 0.4), randFloat(0.1, 0.4), randFloat(0.6, 1.0)));
                }
            });
            mesh.name = 'enemy';
        } else {
            // Fallback for other enemy types or simple geometry
            const geometry = new THREE.BoxGeometry(0.8, 0.6, 0.6);
            const material = new THREE.MeshStandardMaterial({ color: 0xff0000, flatShading: true });
            mesh = new THREE.Mesh(geometry, material);
            mesh.position.copy(position);
            mesh.name = 'enemy';
        }

        const enemy = {
            mesh: mesh,
            lastFireTime: 0,
            fireRate: randFloat(ENEMY_FIRE_RATE_MIN, ENEMY_FIRE_RATE_MAX),
            health: 1,
            type: type,
            rotationSpeed: randFloat(0.5, 1.5) // For cluster enemies
        };
        this.enemies.push(enemy);
        this.scene.add(mesh);
    },

    update(deltaTime, currentTime) {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];

            // Basic downward movement
            enemy.mesh.position.y -= ENEMY_SPEED * deltaTime;

            // Rotate cluster geometry
            if (enemy.type === 'basic') {
                enemy.mesh.rotation.x += enemy.rotationSpeed * deltaTime;
                enemy.mesh.rotation.y += enemy.rotationSpeed * 0.5 * deltaTime;
            }

            // Enemy firing
            if (currentTime - enemy.lastFireTime > enemy.fireRate) {
                Bullets.createEnemyBullet(this.scene, enemy.mesh.position.clone().add(new THREE.Vector3(0, -0.5, 0)));
                Animations.pulse(enemy.mesh, 0.1, 1.05, 0.05); // Small pulse on firing
                enemy.lastFireTime = currentTime;
                enemy.fireRate = randFloat(ENEMY_FIRE_RATE_MIN, ENEMY_FIRE_RATE_MAX); // Reset fire rate
            }

            // Remove if off screen
            if (enemy.mesh.position.y < -6) {
                this.removeEnemy(enemy);
            }
        }
    },

    removeEnemy(enemy) {
        this.scene.remove(enemy.mesh);
        this.enemies.splice(this.enemies.indexOf(enemy), 1);
        // console.log('Enemy removed. Remaining:', this.enemies.length);
    },

    hitEnemy(enemy) {
        enemy.health--;
        Animations.flash(enemy.mesh, 0xffff00, 0.2); // Yellow flash on hit
        if (enemy.health <= 0) {
            Animations.explode(this.scene, enemy.mesh.position.clone(), 0xffaa00); // Orange explosion
            this.removeEnemy(enemy);
            return true; // Enemy destroyed
        }
        return false; // Enemy not destroyed
    },

    reset() {
        this.enemies.forEach(enemy => this.scene.remove(enemy.mesh));
        this.enemies = [];
    }
};
