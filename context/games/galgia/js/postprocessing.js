// galgia/js/postprocessing.js

import * as THREE from 'https://esm.sh/three@0.163.0';
import { EffectComposer } from 'https://esm.sh/three@0.163.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://esm.sh/three@0.163.0/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'https://esm.sh/three@0.163.0/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'https://esm.sh/three@0.163.0/examples/jsm/postprocessing/OutputPass.js';

// Specific post-processing effects
import { UnrealBloomPass } from 'https://esm.sh/three@0.163.0/examples/jsm/postprocessing/UnrealBloomPass.js';

import { randFloat } from './utils.js';

// Custom CRT Shader (simplified for example)
// Custom Glitch Shader for more control
const CustomGlitchShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'amount': { value: 0.05 },
        'angle': { value: 0.0 },
        'seed': { value: 0.0 },
        'seed_x': { value: 0.0 },
        'seed_y': { value: 0.0 },
        'distortion_x': { value: 0.0 },
        'distortion_y': { value: 0.0 },
        'col_s': { value: 0.0 }
    },
    vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse;
        uniform float amount;
        uniform float angle;
        uniform float seed;
        uniform float seed_x;
        uniform float seed_y;
        uniform float distortion_x;
        uniform float distortion_y;
        uniform float col_s;
        varying vec2 vUv;

        float random(vec2 st) {
            return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
        }

        void main() {
            vec2 p = vUv;
            float xs = floor(gl_FragCoord.x / 0.5);
            float ys = floor(gl_FragCoord.y / 0.5);
            // vec2 offset = vec2(random(vec2(xs * seed, ys * seed)) * amount * col_s, random(vec2(xs * seed + 1.0, ys * seed)) * amount * col_s);
            vec2 offset = vec2(random(vec2(p.y * seed, 0.0)) * amount * col_s, random(vec2(p.x * seed, 0.0)) * amount * col_s);
            
            float dx = (random(vec2(seed_x, p.y * distortion_x)) + distortion_x) * amount;
            float dy = (random(vec2(seed_y, p.x * distortion_y)) + distortion_y) * amount;

            vec4 color = texture2D(tDiffuse, vUv + offset);
            color.r = texture2D(tDiffuse, vUv + offset + vec2(dx, 0)).r;
            color.g = texture2D(tDiffuse, vUv + offset + vec2(0, dy)).g;
            color.b = texture2D(tDiffuse, vUv + offset + vec2(-dx, -dy)).b;

            gl_FragColor = color;
        }
    `
};


export const PostProcessing = {
    composer: null,
    bloomPass: null,
    glitchPass: null,
    chromaticAberrationPass: null,
    crtPass: null,
    filmPass: null,
    pixelatePass: null,
    vignettePass: null,
    rgbShiftPass: null, // For Chromatic Distortion
    shockwavePass: null, // Placeholder
    motionBlurPass: null, // Placeholder
    colorGradingPass: null, // Placeholder (LUTs are complex)
    lensFlarePass: null, // Placeholder
    radialBlurPass: null, // Using Bokeh for approximation
    heatHazePass: null, // Placeholder
    starStreakPass: null, // Placeholder
    flashbangPass: null, // Placeholder
    barrelDistortionPass: null, // Placeholder
    digitalNoisePass: null, // Placeholder
    scanlineFlickerPass: null, // Part of CRT or separate
    colorFringePass: null, // Part of Chromatic Aberration
    posterizePass: null, // Placeholder
    neonGlowPass: null, // Part of Bloom
    retroDitheringPass: null, // Placeholder

    init(renderer, scene, camera, width, height) {
        this.composer = new EffectComposer(renderer);
        this.composer.addPass(new RenderPass(scene, camera));

        // Keep the browser path reliable first.
        // The original stack pulled several CDN shaders that either failed to load
        // or turned the whole scene into unreadable static.
        this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 1.5, 0.4, 0.85);
        this.composer.addPass(this.bloomPass);
        this.chromaticAberrationPass = null;
        this.crtPass = null;
        this.glitchPass = null;
        this.pixelatePass = null;
        this.filmPass = null;
        this.radialBlurPass = null;
        this.vignettePass = null;

        // Final Output Pass
        this.composer.addPass(new OutputPass());

        // Initial states
        this.glitchActive = false;
        this.glitchMagnitude = 0;
    },

    update(deltaTime, currentTime) {
        if (this.glitchActive) {
            this.glitchMagnitude = Math.min(1.0, this.glitchMagnitude + deltaTime * 0.5);
        }
        this.composer.render(deltaTime);
    },

    setSize(width, height) {
        this.composer.setSize(width, height);
        if (this.bloomPass) this.bloomPass.resolution.set(width, height);
    },

    // Example of toggling a post-processing effect
    toggleBloom(enabled) {
        if (this.bloomPass) {
            this.bloomPass.enabled = enabled;
        }
    },

    // Trigger a glitch effect
    triggerGlitch(duration = 1.0) {
        this.glitchActive = true;
        this.glitchMagnitude = 0;
        // If using the default GlitchPass, you might need to briefly enable/disable goWild
        // if (this.glitchPass) this.glitchPass.goWild = true;

        setTimeout(() => {
            this.glitchActive = false;
            // if (this.glitchPass) this.glitchPass.goWild = false;
            // Smoothly reduce glitch magnitude if using custom shader
            // For now, just reset it to 0
            this.glitchMagnitude = 0;
            if (this.glitchPass instanceof ShaderPass && this.glitchPass.material.shaderID === 'CustomGlitchShader') {
                this.glitchPass.uniforms['amount'].value = 0;
                this.glitchPass.uniforms['distortion_x'].value = 0;
                this.glitchPass.uniforms['distortion_y'].value = 0;
                this.glitchPass.uniforms['col_s'].value = 0;
            }
        }, duration * 1000);
    }
};
