// galgia/js/animations.js

import * as THREE from 'https://esm.sh/three@0.163.0';
import { lerp } from './utils.js';

export const Animations = {
    activeAnimations: [],
    scene: null,

    init(scene) {
        this.scene = scene;
        this.activeAnimations = [];
    },

    // Generic pulsing animation for scale
    pulse(mesh, duration = 0.2, scaleFactor = 1.2, returnDuration = 0.1) {
        if (!mesh._originalScale) {
            mesh._originalScale = mesh.scale.clone();
        }
        const originalScale = mesh._originalScale;
        const targetScale = originalScale.clone().multiplyScalar(scaleFactor);

        this.activeAnimations.push({
            type: 'pulse',
            mesh: mesh,
            startTime: performance.now() / 1000,
            duration: duration,
            targetScale: targetScale,
            originalScale: originalScale.clone(),
            returnDuration: returnDuration,
            phase: 0 // 0: scaling up, 1: scaling down
        });
    },

    // Flashing material color
    flash(mesh, flashColor, duration = 0.2) {
        if (!mesh || !mesh.material) return;

        const originalColor = mesh.material.color.clone();

        this.activeAnimations.push({
            type: 'flash',
            mesh: mesh,
            startTime: performance.now() / 1000,
            duration: duration,
            flashColor: new THREE.Color(flashColor),
            originalColor: originalColor,
            phase: 0 // 0: flash color, 1: return to original
        });
    },

    // Explosion effect using particles
    explode(scene, position, color = 0xffa500, numParticles = 20, particleSize = 0.2, particleSpeed = 3, duration = 1.0) {
        const particles = [];
        const material = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 1 });

        for (let i = 0; i < numParticles; i++) {
            const geometry = new THREE.SphereGeometry(particleSize * Math.random(), 4, 4);
            const particleMesh = new THREE.Mesh(geometry, material.clone()); // Clone material for individual opacity
            particleMesh.position.copy(position);
            particleMesh.velocity = new THREE.Vector3(
                Math.random() * 2 - 1,
                Math.random() * 2 - 1,
                Math.random() * 2 - 1
            ).normalize().multiplyScalar(Math.random() * particleSpeed);
            scene.add(particleMesh);
            particles.push(particleMesh);
        }

        this.activeAnimations.push({
            type: 'explosion',
            particles: particles,
            startTime: performance.now() / 1000,
            duration: duration,
            initialOpacity: material.opacity,
            scene: scene
        });
    },

    update(deltaTime, currentTime) {
        for (let i = this.activeAnimations.length - 1; i >= 0; i--) {
            const anim = this.activeAnimations[i];
            const elapsed = currentTime - anim.startTime;

            if (anim.type === 'pulse') {
                if (anim.phase === 0) { // Scale up
                    const t = Math.min(1, elapsed / anim.duration);
                    anim.mesh.scale.x = lerp(anim.originalScale.x, anim.targetScale.x, t);
                    anim.mesh.scale.y = lerp(anim.originalScale.y, anim.targetScale.y, t);
                    anim.mesh.scale.z = lerp(anim.originalScale.z, anim.targetScale.z, t);
                    if (t >= 1) {
                        anim.phase = 1;
                        anim.startTime = currentTime; // Reset start time for the next phase
                    }
                } else if (anim.phase === 1) { // Scale down
                    const t = Math.min(1, elapsed / anim.returnDuration);
                    anim.mesh.scale.x = lerp(anim.targetScale.x, anim.originalScale.x, t);
                    anim.mesh.scale.y = lerp(anim.targetScale.y, anim.originalScale.y, t);
                    anim.mesh.scale.z = lerp(anim.targetScale.z, anim.originalScale.z, t);
                    if (t >= 1) {
                        anim.mesh.scale.copy(anim.originalScale); // Ensure it snaps back
                        this.activeAnimations.splice(i, 1);
                    }
                }
            } else if (anim.type === 'flash') {
                const t = Math.min(1, elapsed / anim.duration);
                if (t < 0.5) { // Flash color on
                    anim.mesh.material.color.copy(anim.flashColor);
                } else { // Fade back to original
                    anim.mesh.material.color.lerpColors(anim.flashColor, anim.originalColor, (t - 0.5) * 2);
                }
                if (t >= 1) {
                    anim.mesh.material.color.copy(anim.originalColor);
                    this.activeAnimations.splice(i, 1);
                }
            } else if (anim.type === 'explosion') {
                const t = Math.min(1, elapsed / anim.duration);
                anim.particles.forEach(particle => {
                    particle.position.addScaledVector(particle.velocity, deltaTime);
                    particle.material.opacity = lerp(anim.initialOpacity, 0, t);
                    particle.scale.multiplyScalar(1 - 0.5 * deltaTime); // Shrink particles
                });

                if (t >= 1) {
                    anim.particles.forEach(particle => anim.scene.remove(particle));
                    this.activeAnimations.splice(i, 1);
                }
            }
        }
    }
};
