// galgia/js/main.js

import * as THREE from 'three';
import { Player } from './player.js';
import { Enemies } from './enemies.js';
import { Bullets } from './bullets.js';
import { PostProcessing } from './postprocessing.js';
import { Animations } from './animations.js';
import { setupUI, showMenu, showGameOver, updateScoreDisplay, updateHighScoreDisplay } from './ui.js';
import { lerp, randFloat } from './utils.js';

let scene, camera, renderer, player;
let gameRunning = false;
let score = 0;
let lastSpawnTime = 0;
const ENEMY_SPAWN_INTERVAL = 2; // Seconds

// Screen Shake variables
let screenShakeDuration = 0;
let screenShakeIntensity = 0;
let originalCameraPosition = new THREE.Vector3();

function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050510);

    // Camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 8); // Adjusted camera position to see more of the game area
    camera.lookAt(0, 0, 0);
    originalCameraPosition.copy(camera.position);

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 2); // Soft white light
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1); // White directional light
    directionalLight.position.set(0, 5, 5);
    scene.add(directionalLight);

    // Initialize modules
    player = new Player(scene);
    Enemies.init(scene);
    Bullets.init(scene);
    Animations.init(scene);

    // Post-processing setup
    PostProcessing.init(renderer, scene, camera, window.innerWidth, window.innerHeight);

    // UI setup
    setupUI(startGame, restartGame);
    showMenu();

    window.addEventListener('resize', onWindowResize, false);

    animate();
}

function startGame() {
    gameRunning = true;
    score = 0;
    updateScoreDisplay(score);
    updateHighScoreDisplay();
    player.reset();
    Enemies.reset();
    Bullets.reset();
    lastSpawnTime = performance.now() / 1000;
    // console.log('Game Started!');
}

function restartGame() {
    startGame();
}

let lastTime = 0;
function animate(time) {
    requestAnimationFrame(animate);

    const currentTime = time / 1000; // Convert to seconds
    const deltaTime = Math.min(0.1, currentTime - lastTime); // Cap delta to prevent large jumps
    lastTime = currentTime;

    if (gameRunning) {
        // Update game logic
        player.update(deltaTime, currentTime);
        Enemies.update(deltaTime, currentTime);
        Bullets.update(deltaTime);
        Animations.update(deltaTime, currentTime);

        // Enemy spawning
        if (currentTime - lastSpawnTime > ENEMY_SPAWN_INTERVAL) {
            const spawnX = randFloat(-4, 4);
            Enemies.spawnEnemy(new THREE.Vector3(spawnX, 5, 0));
            lastSpawnTime = currentTime;
        }

        // Collision detection
        checkCollisions();

        // Screen shake update
        updateScreenShake(deltaTime);

    } else {
        // Render only if not running (e.g., menu screen)
        // Animations might still need to update for menu elements
        Animations.update(deltaTime, currentTime);
    }

    if (gameRunning) {
        // Render the scene with post-processing
        PostProcessing.update(deltaTime, currentTime);
    }
}

function checkCollisions() {
    // Player bullets vs. Enemies
    for (let i = Bullets.playerBullets.length - 1; i >= 0; i--) {
        const bullet = Bullets.playerBullets[i];
        for (let j = Enemies.enemies.length - 1; j >= 0; j--) {
            const enemy = Enemies.enemies[j];

            // Simple bounding box collision for now
            const bulletBox = new THREE.Box3().setFromObject(bullet.mesh);
            const enemyBox = new THREE.Box3().setFromObject(enemy.mesh);

            if (bulletBox.intersectsBox(enemyBox)) {
                Bullets.removePlayerBullet(bullet);
                if (Enemies.hitEnemy(enemy)) {
                    score += Enemies.scorePerKill;
                    updateScoreDisplay(score);
                    triggerScreenShake(0.1, 0.1); // Small shake on enemy kill
                }
                break; // Bullet can only hit one enemy
            }
        }
    }

    // Enemy bullets vs. Player
    if (player.isAlive) {
        const playerBox = new THREE.Box3().setFromObject(player.getMesh());
        for (let i = Bullets.enemyBullets.length - 1; i >= 0; i--) {
            const bullet = Bullets.enemyBullets[i];
            const bulletBox = new THREE.Box3().setFromObject(bullet.mesh);

            if (bulletBox.intersectsBox(playerBox)) {
                Bullets.removeEnemyBullet(bullet);
                player.takeHit();
                endGame();
                triggerScreenShake(0.3, 0.3); // Bigger shake on player hit
                PostProcessing.triggerGlitch(1.5); // Trigger a glitch effect
                break;
            }
        }
    }
}

function endGame() {
    gameRunning = false;
    showGameOver(score);
    // console.log('Game Over!');
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    PostProcessing.setSize(window.innerWidth, window.innerHeight);
}

// Screen Shake functions
export function triggerScreenShake(duration, intensity) {
    screenShakeDuration = duration;
    screenShakeIntensity = intensity;
    // Store original camera position when shake starts
    originalCameraPosition.copy(camera.position);
}

function updateScreenShake(deltaTime) {
    if (screenShakeDuration > 0) {
        screenShakeDuration -= deltaTime;

        const shakeX = (Math.random() * 2 - 1) * screenShakeIntensity;
        const shakeY = (Math.random() * 2 - 1) * screenShakeIntensity;

        camera.position.x = originalCameraPosition.x + shakeX;
        camera.position.y = originalCameraPosition.y + shakeY;

        if (screenShakeDuration <= 0) {
            screenShakeDuration = 0;
            camera.position.copy(originalCameraPosition); // Reset camera position
        }
    }
}

init();
