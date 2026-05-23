// galgia/js/bullets.js

import * as THREE from 'https://esm.sh/three@0.163.0';
import { Animations } from './animations.js';
import { randFloat } from './utils.js';

const BULLET_SPEED = 10;
const PLAYER_BULLET_COLOR = 0x00ffff; // Cyan
const ENEMY_BULLET_COLOR = 0xff0000; // Red

export const Bullets = {
    playerBullets: [],
    enemyBullets: [],
    scene: null,

    init(scene) {
        this.scene = scene;
        this.playerBullets = [];
        this.enemyBullets = [];
    },

    createBulletMesh(color) {
        const geometry = new THREE.SphereGeometry(0.1, 8, 8);
        const material = new THREE.MeshBasicMaterial({ color: color });
        const mesh = new THREE.Mesh(geometry, material);
        // Add a point light to make bullets glow
        const light = new THREE.PointLight(color, 2, 5);
        mesh.add(light);
        return mesh;
    },

    createPlayerBullet(scene, position) {
        const mesh = this.createBulletMesh(PLAYER_BULLET_COLOR);
        mesh.position.copy(position);
        mesh.name = 'playerBullet';
        const bullet = { mesh: mesh, velocity: new THREE.Vector3(0, BULLET_SPEED, 0) };
        this.playerBullets.push(bullet);
        scene.add(mesh);
        Animations.pulse(mesh, 0.1, 1.5, 0.05); // Make bullet pulse
    },

    createEnemyBullet(scene, position) {
        const mesh = this.createBulletMesh(ENEMY_BULLET_COLOR);
        mesh.position.copy(position);
        mesh.name = 'enemyBullet';
        const bullet = { mesh: mesh, velocity: new THREE.Vector3(0, -BULLET_SPEED * 0.7, 0) }; // Slower enemy bullets
        this.enemyBullets.push(bullet);
        scene.add(mesh);
        Animations.pulse(mesh, 0.1, 1.5, 0.05); // Make bullet pulse
    },

    update(deltaTime) {
        // Update player bullets
        for (let i = this.playerBullets.length - 1; i >= 0; i--) {
            const bullet = this.playerBullets[i];
            bullet.mesh.position.addScaledVector(bullet.velocity, deltaTime);
            if (bullet.mesh.position.y > 6) {
                this.removePlayerBullet(bullet);
            }
        }

        // Update enemy bullets
        for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
            const bullet = this.enemyBullets[i];
            bullet.mesh.position.addScaledVector(bullet.velocity, deltaTime);
            if (bullet.mesh.position.y < -6) {
                this.removeEnemyBullet(bullet);
            }
        }
    },

    removePlayerBullet(bullet) {
        this.scene.remove(bullet.mesh);
        this.playerBullets.splice(this.playerBullets.indexOf(bullet), 1);
    },

    removeEnemyBullet(bullet) {
        this.scene.remove(bullet.mesh);
        this.enemyBullets.splice(this.enemyBullets.indexOf(bullet), 1);
    },

    reset() {
        this.playerBullets.forEach(bullet => this.scene.remove(bullet.mesh));
        this.enemyBullets.forEach(bullet => this.scene.remove(bullet.mesh));
        this.playerBullets = [];
        this.enemyBullets = [];
    }
};
