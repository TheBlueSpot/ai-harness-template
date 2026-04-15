// galgia/js/postprocessing.js

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Specific post-processing effects
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ChromaticAberrationShader } from 'three/addons/shaders/ChromaticAberrationShader.js';
import { GlitchPass } from 'three/addons/postprocessing/GlitchPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { FilmShader } from 'three/addons/shaders/FilmShader.js';
import { RGBShiftShader } from 'three/addons/shaders/RGBShiftShader.js';
import { PixelShader } from 'three/addons/shaders/PixelShader.js';
import { BokehShader } from 'three/addons/shaders/BokehShader.js'; // Radial Blur approximation
import { CopyShader } from 'three/addons/shaders/CopyShader.js';

// Custom CRT Shader (simplified for example)
const CRTShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'resolution': { value: new THREE.Vector2() },
        'time': { value: 0.0 }
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
        uniform vec2 resolution;
        uniform float time;
        varying vec2 vUv;

        void main() {
            vec2 uv = vUv;

            // Basic Scanlines
            float scanline = sin(uv.y * resolution.y * 1.5) * 0.04;
            scanline = mix(1.0, 0.9, scanline * scanline);
            vec4 color = texture2D(tDiffuse, uv);
            color.rgb *= scanline;

            // Vignette (simple, could be combined with other vignette shader)
            vec2 vignetteUv = (uv - 0.5) * 1.5;
            float vignette = dot(vignetteUv, vignetteUv);
            color.rgb *= (1.0 - vignette * 0.7);

            gl_FragColor = color;
        }
    `
};

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

        // 1. Bloom
        this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 1.5, 0.4, 0.85);
        this.composer.addPass(this.bloomPass);

        // 2. Chromatic Aberration
        this.chromaticAberrationPass = new ShaderPass(ChromaticAberrationShader);
        this.chromaticAberrationPass.uniforms['resolution'].value.set(width, height);
        this.chromaticAberrationPass.uniforms['radialIntensity'].value = 0.5;
        this.chromaticAberrationPass.uniforms['scatter'].value = 0.5;
        this.composer.addPass(this.chromaticAberrationPass);

        // 3. CRT Scanlines (using custom shader for now, will enhance)
        this.crtPass = new ShaderPass(CRTShader);
        this.crtPass.uniforms['resolution'].value.set(width, height);
        this.composer.addPass(this.crtPass);

        // 4. Glitch
        this.glitchPass = new GlitchPass();
        // this.glitchPass.goWild = false; // Start with subtle glitch
        this.composer.addPass(this.glitchPass);

        // 5. Screen Shake (done by camera movement, not a post-process effect directly)
        // Will be handled in main.js or a separate utility.

        // 6. Motion Blur (Placeholder - can be complex, often done with velocity buffer or previous frame)
        // For now, will use a simple blur or omit if too complex for initial build.
        // const motionBlurShader = {...};
        // this.motionBlurPass = new ShaderPass(motionBlurShader);
        // this.composer.addPass(this.motionBlurPass);

        // 7. Pixelate
        this.pixelatePass = new ShaderPass(PixelShader);
        this.pixelatePass.uniforms['resolution'].value.set(width, height);
        this.pixelatePass.uniforms['pixelSize'].value = 8.0; // Adjust for desired pixelation
        this.composer.addPass(this.pixelatePass);

        // 8. Color Grading (Complex, often requires LUTs. Placeholder for now)
        // const colorGradingShader = {...};
        // this.colorGradingPass = new ShaderPass(colorGradingShader);
        // this.composer.addPass(this.colorGradingPass);

        // 9. Film Grain
        this.filmPass = new ShaderPass(FilmShader);
        this.filmPass.uniforms.nIntensity.value = 0.5; // Noise intensity
        this.filmPass.uniforms.sIntensity.value = 0.1; // Scanline intensity (can be zero if CRT handles it)
        this.filmPass.uniforms.sCount.value = 800; // Scanline count
        this.filmPass.uniforms.grayscale.value = false;
        this.composer.addPass(this.filmPass);

        // 10. Lens Flare (Complex, often a separate render pass or sprite. Placeholder)
        // this.lensFlarePass = ...;

        // 11. Radial Blur (Approximation using BokehShader or custom shader)
        // Using BokehShader as a simple blur, not true radial blur for now.
        this.radialBlurPass = new ShaderPass(BokehShader);
        this.radialBlurPass.uniforms['aperture'].value = 0.00001; // Controls blur amount, higher for more blur
        this.radialBlurPass.uniforms['maxblur'].value = 0.005;
        this.radialBlurPass.material.defines.DEPTH_PACKING = 1; // Required for Bokeh
        this.composer.addPass(this.radialBlurPass);

        // 12. Shockwave Distortion (Complex, custom shader needed. Placeholder)
        // this.shockwavePass = ...;

        // 13. Scanline Flicker (Part of CRTShader or separate. Handled in custom CRT for now)

        // 14. Color Fringe (Part of Chromatic Aberration)

        // 15. Vignette
        this.vignettePass = new ShaderPass(VignetteShader);
        this.vignettePass.uniforms['darken'].value = 0.8; // How dark
        this.vignettePass.uniforms['offset'].value = 0.8; // Size of dark area
        this.composer.addPass(this.vignettePass);

        // 16. Posterize (Custom shader or lookup table. Placeholder)
        // const posterizeShader = {...};
        // this.posterizePass = new ShaderPass(posterizeShader);
        // this.composer.addPass(this.posterizePass);

        // 17. Neon Glow (Achieved primarily by Bloom)

        // 18. Retro Dithering (Custom shader. Placeholder)
        // const ditheringShader = {...};
        // this.retroDitheringPass = new ShaderPass(ditheringShader);
        // this.composer.addPass(this.retroDitheringPass);

        // 19. Chromatic Distortion (Can use RGBShiftShader or enhance ChromaticAberration)
        this.rgbShiftPass = new ShaderPass(RGBShiftShader);
        this.rgbShiftPass.uniforms['amount'].value = 0.002; // Small shift for subtle distortion
        this.rgbShiftPass.uniforms['angle'].value = 0.0;
        this.composer.addPass(this.rgbShiftPass);

        // 20. Heat Haze (Complex, custom shader with noise and distortion. Placeholder)
        // this.heatHazePass = ...;

        // 21. Star Streak (Can be part of Bloom or custom. Placeholder)

        // 22. Flashbang (Temporary screen white-out, can be managed by a simple overlay or shader)
        // For now, this will be handled as a temporary overlay animation or a specific shader pass that's only enabled when triggered.

        // 23. Barrel Distortion (Custom shader. Placeholder)
        // const barrelDistortionShader = {...};
        // this.barrelDistortionPass = new ShaderPass(barrelDistortionShader);
        // this.composer.addPass(this.barrelDistortionPass);

        // 24. Color LUT (Lookup Table for Color Grading. Complex. Placeholder)

        // 25. Digital Noise (Can be part of FilmShader or custom. Enhancing FilmShader for now)
        // FilmShader already provides noise.


        // Final Output Pass
        this.composer.addPass(new OutputPass());

        // Initial states
        this.glitchActive = false;
        this.glitchMagnitude = 0;
    },

    update(deltaTime, currentTime) {
        if (this.crtPass) {
            this.crtPass.uniforms['time'].value = currentTime;
        }

        // Update glitch intensity dynamically
        if (this.glitchActive) {
            this.glitchMagnitude = Math.min(1.0, this.glitchMagnitude + deltaTime * 0.5); // Increase glitch over time
            // this.glitchPass.curF = this.glitchMagnitude * 0.5; // Controls glitch frequency
            // this.glitchPass.randX = this.glitchMagnitude * 0.5; // Controls glitch intensity
            // For the default GlitchPass, `goWild` is often used or directly manipulating its internal values.
            // Since `GlitchPass` doesn't expose `curF` or `randX` directly for dynamic control in a simple way,
            // we might need to use a custom glitch shader for finer control.
            // Let's use our custom glitch shader for better control
            if (this.glitchPass instanceof ShaderPass && this.glitchPass.material.shaderID === 'CustomGlitchShader') {
                 this.glitchPass.uniforms['amount'].value = this.glitchMagnitude * 0.1;
                 this.glitchPass.uniforms['seed_x'].value = Math.random();
                 this.glitchPass.uniforms['seed_y'].value = Math.random();
                 this.glitchPass.uniforms['distortion_x'].value = randFloat(0.1, 0.5) * this.glitchMagnitude;
                 this.glitchPass.uniforms['distortion_y'].value = randFloat(0.1, 0.5) * this.glitchMagnitude;
                 this.glitchPass.uniforms['col_s'].value = randFloat(0.5, 1.0) * this.glitchMagnitude;
            } else { // Fallback to default GlitchPass if custom isn't used
                 this.glitchPass.goWild = true;
            }
        }

        this.composer.render(deltaTime);
    },

    setSize(width, height) {
        this.composer.setSize(width, height);
        if (this.bloomPass) this.bloomPass.resolution.set(width, height);
        if (this.chromaticAberrationPass) this.chromaticAberrationPass.uniforms['resolution'].value.set(width, height);
        if (this.crtPass) this.crtPass.uniforms['resolution'].value.set(width, height);
        if (this.pixelatePass) this.pixelatePass.uniforms['resolution'].value.set(width, height);
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
