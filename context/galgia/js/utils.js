// galgia/js/utils.js

export function lerp(a, b, t) {
    return a * (1 - t) + b * t;
}

export function randFloat(min, max) {
    return Math.random() * (max - min) + min;
}

export function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}
